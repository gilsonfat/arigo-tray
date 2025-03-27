import * as cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { ScheduledQuery } from './types';

// URL API para enviar resultados de todas as consultas bem-sucedidas
const API_NOTIFICATION_URL = 'http://localhost:3000/api/requests';

// Classe para gerenciar consultas agendadas
export class QueryScheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private executeQueryCallback: (sql: string) => Promise<any>;
  private logPath: string;
  
  constructor(executeQueryCallback: (sql: string) => Promise<any>) {
    this.executeQueryCallback = executeQueryCallback;
    this.logPath = path.join(process.cwd(), 'logs');
    
    // Garantir que a pasta de logs exista
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
  }
  
  // Agendar uma consulta
  scheduleQuery(query: ScheduledQuery): void {
    // Remover agendamento anterior se existir
    this.unscheduleQuery(query.id);
    
    // Não agendar se não estiver habilitado
    if (!query.enabled) {
      console.log(`Consulta "${query.name}" está desabilitada. Não será agendada.`);
      return;
    }
    
    // Verificar se o formato de agendamento é válido
    if (!cron.validate(query.schedule)) {
      console.error(`Expressão cron inválida para a consulta "${query.name}": ${query.schedule}`);
      return;
    }
    
    // Agendar a tarefa
    try {
      const task = cron.schedule(query.schedule, async () => {
        await this.runQuery(query);
      });
      
      this.tasks.set(query.id, task);
      console.log(`Consulta "${query.name}" agendada: ${query.schedule}`);
    } catch (error) {
      console.error(`Erro ao agendar consulta "${query.name}":`, error);
    }
  }
  
  // Executar uma consulta imediatamente
  async runQuery(query: ScheduledQuery): Promise<any> {
    console.log(`Executando consulta agendada: "${query.name}"`);
    
    try {
      // Executar a consulta SQL
      const result = await this.executeQueryCallback(query.query);
      
      // Atualizar informações da última execução
      query.lastRun = new Date();
      query.lastResult = result;
      
      // Salvar log da consulta executada
      this.saveQueryLog(query, result);
      
      // Enviar resultados para o destino configurado
      if (query.destination) {
        await this.sendToDestination(result, query.destination);
      }
      
      // Enviar notificação para a API de resultados (independente do destino configurado)
      await this.sendToApiNotification(query, result);
      
      console.log(`Consulta "${query.name}" executada com sucesso`);
      return result;
    } catch (error) {
      console.error(`Erro ao executar consulta "${query.name}":`, error);
      throw error;
    }
  }
  
  // Enviar notificação para a API de resultados
  private async sendToApiNotification(query: ScheduledQuery, result: any): Promise<void> {
    const MAX_RETRIES = 3;
    let attempts = 0;
    
    const tryRequest = async (): Promise<void> => {
      attempts++;
      try {
        // Sanitizar os resultados para evitar injeção de timestamps nos campos de texto
        const sanitizedResult = this.sanitizeData(result);
        
        // Formatar o payload conforme esperado pelo servidor
        const payload = {
          cliente: "clienteB",
          tipo: "tipoX",
          data: {
            queryId: query.id,
            queryName: query.name,
            executionTime: new Date().toISOString(),
            sql: query.query,
            sanitizedResult
          },
          // Adicionando o campo "result" no nível superior
          
        };
        
        console.log(`Enviando dados para API (tentativa ${attempts}/${MAX_RETRIES})`);
        
        const response = await axios.post(API_NOTIFICATION_URL, payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 60000, // Timeout de 60 segundos
          // Configurações para reconexão
          validateStatus: function (status) {
            return status >= 200 && status < 600; // Aceitar um range maior de status codes
          }
        });
        
        if (response.status >= 200 && response.status < 300) {
          console.log(`Notificação enviada para API: ${API_NOTIFICATION_URL}, Status: ${response.status}`);
        } else {
          console.warn(`API retornou status não-sucesso: ${response.status}`);
          if (attempts < MAX_RETRIES) {
            console.log(`Tentando novamente em 3 segundos...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await tryRequest();
          } else {
            console.error(`Desistindo após ${MAX_RETRIES} tentativas.`);
          }
        }
      } catch (error: any) {
        console.error(`Erro ao enviar notificação para API (tentativa ${attempts}/${MAX_RETRIES}):`);
        
        if (error.code) console.error(`Código do erro: ${error.code}`);
        if (error.message) console.error(`Mensagem: ${error.message}`);
        
        if (error.response) {
          console.error(`Status: ${error.response.status}`);
          console.error(`Resposta: ${JSON.stringify(error.response.data || {})}`);
        }
        
        // Se for erro de timeout, ECONNRESET ou outros problemas de rede, tentar novamente
        const networkErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EHOSTUNREACH'];
        
        if (attempts < MAX_RETRIES && (networkErrors.includes(error.code) || !error.response)) {
          const delayMs = Math.pow(2, attempts) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`Tentando novamente em ${delayMs/1000} segundos...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return await tryRequest();
        } else {
          console.error(`Desistindo de enviar para a API após ${attempts} tentativas.`);
        }
      }
    };
    
    await tryRequest();
  }
  
  // Sanitizar dados para evitar injeção de timestamps em campos de texto
  private sanitizeData(data: any): any {
    if (!data) return data;
    
    // Para arrays, sanitizar cada item
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }
    
    // Para objetos, sanitizar cada propriedade
    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          sanitized[key] = this.sanitizeData(data[key]);
        }
      }
      return sanitized;
    }
    
    // Para strings, verificar e remover timestamps injetados
    if (typeof data === 'string') {
      // Padrão para detectar timestamps ISO8601 no meio do texto
      const timestampPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?/g;
      return data.replace(timestampPattern, '');
    }
    
    // Outros tipos de dados (números, booleanos, etc.) são retornados como estão
    return data;
  }
  
  // Salvar log da consulta executada
  private saveQueryLog(query: ScheduledQuery, result: any): void {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const safeQueryName = query.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const logFileName = `${safeQueryName}_${timestamp}.json`;
      const logFilePath = path.join(this.logPath, logFileName);
      
      // Sanitizar os resultados para evitar injeção de timestamps
      const sanitizedResult = this.sanitizeData(result);
      
      const logData = {
        queryId: query.id,
        queryName: query.name,
        executionTime: new Date().toISOString(),
        sql: query.query,
        result: sanitizedResult
      };
      
      fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2));
      console.log(`Log da consulta "${query.name}" salvo em: ${logFilePath}`);
    } catch (error) {
      console.error(`Erro ao salvar log da consulta "${query.name}":`, error);
    }
  }
  
  // Enviar resultados para o destino configurado
  private async sendToDestination(data: any, destination: ScheduledQuery['destination']): Promise<void> {
    if (!destination) return;
    
    // Sanitizar dados antes de enviar
    const sanitizedData = this.sanitizeData(data);
    const jsonData = JSON.stringify(sanitizedData, null, 2);
    
    switch (destination.type) {
      case 'file':
        if (destination.path) {
          try {
            fs.writeFileSync(destination.path, jsonData);
            console.log(`Resultados salvos em: ${destination.path}`);
          } catch (error) {
            console.error('Erro ao salvar resultados no arquivo:', error);
          }
        }
        break;
        
      case 'http':
        if (destination.url) {
          try {
            const response = await axios.post(destination.url, sanitizedData, {
              headers: {
                'Content-Type': 'application/json',
                ...destination.headers
              },
              // Configurações para lidar com possíveis problemas de conexão
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              timeout: 60000, // Timeout maior (60 segundos)
              // Configurações para lidar com reconexões
              validateStatus: function (status) {
                return status >= 200 && status < 600; // Aceitar um range maior de status codes
              }
            });
            console.log(`Resultados enviados para: ${destination.url}, Status: ${response.status}`);
          } catch (error: any) {
            // Registro detalhado do erro
            console.error('Erro ao enviar resultados via HTTP:');
            if (error.code) console.error(`Código do erro: ${error.code}`);
            if (error.message) console.error(`Mensagem: ${error.message}`);
            if (error.response) {
              console.error(`Status: ${error.response.status}`);
              console.error(`Resposta: ${JSON.stringify(error.response.data)}`);
            }
          }
        }
        break;
        
      case 'none':
      default:
        // Apenas armazenar os resultados na configuração
        console.log('Resultados armazenados apenas na configuração');
        break;
    }
  }
  
  // Cancelar agendamento de uma consulta
  unscheduleQuery(queryId: string): void {
    const task = this.tasks.get(queryId);
    if (task) {
      task.stop();
      this.tasks.delete(queryId);
      console.log(`Agendamento removido para a consulta ID: ${queryId}`);
    }
  }
  
  // Parar todos os agendamentos
  stopAll(): void {
    for (const [queryId, task] of this.tasks.entries()) {
      task.stop();
      console.log(`Agendamento parado para a consulta ID: ${queryId}`);
    }
    this.tasks.clear();
  }
  
  // Atualizar todos os agendamentos
  updateSchedules(queries: ScheduledQuery[]): void {
    // Limpar agendamentos existentes
    this.stopAll();
    
    // Criar novos agendamentos
    for (const query of queries) {
      this.scheduleQuery(query);
    }
  }
} 