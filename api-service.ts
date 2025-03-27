import axios from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

// Configuração de logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'api-service' },
  transports: [
    new winston.transports.File({ filename: path.join('logs', 'api-error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join('logs', 'api-combined.log') }),
  ],
});

// Interface para configuração do serviço
export interface ApiServiceConfig {
  apiUrl: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

// Interface para o resultado processado
export interface ProcessedResult {
  original: any;
  processed: any;
  success: boolean;
  error?: string;
}

export class ApiService {
  private config: ApiServiceConfig;
  private axiosInstance: any;

  constructor(config: ApiServiceConfig) {
    this.config = {
      ...config,
      timeout: config.timeout || 10000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000
    };

    // Criar instância do axios com configuração
    this.axiosInstance = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      }
    });
  }

  /**
   * Processa um lote de resultados SQL e envia para a API
   * @param results Resultados da consulta SQL
   * @param mapping Função opcional para mapear os dados antes de enviar à API
   * @returns Array com os resultados do processamento
   */
  async processResultsBatch(
    results: any[], 
    mapping?: (item: any) => any
  ): Promise<ProcessedResult[]> {
    const processedResults: ProcessedResult[] = [];

    // Cria diretório de logs se não existir
    await fs.ensureDir(path.join(process.cwd(), 'logs'));
    
    // Registra início do processamento
    logger.info(`Iniciando processamento em lote de ${results.length} resultados`);
    
    // Processa cada resultado
    for (const item of results) {
      try {
        // Aplica mapeamento se fornecido
        const dataToSend = mapping ? mapping(item) : item;
        
        // Tenta enviar para a API com retry
        const apiResponse = await this.sendWithRetry(dataToSend);
        
        // Registra resultado bem-sucedido
        processedResults.push({
          original: item,
          processed: apiResponse.data,
          success: true
        });
        
        logger.info(`Item processado com sucesso: ${JSON.stringify(apiResponse.data.id || 'sem ID')}`);
      } catch (error) {
        // Registra erro
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        
        processedResults.push({
          original: item,
          processed: null,
          success: false,
          error: errorMessage
        });
        
        logger.error(`Erro ao processar item: ${errorMessage}`, { 
          item: JSON.stringify(item),
          error: error
        });
      }
    }
    
    // Salva relatório completo
    const reportFilename = `api-report-${new Date().toISOString().replace(/:/g, '-')}.json`;
    await fs.writeJSON(
      path.join(process.cwd(), 'logs', reportFilename),
      {
        timestamp: new Date().toISOString(),
        total: results.length,
        success: processedResults.filter(r => r.success).length,
        failed: processedResults.filter(r => !r.success).length,
        results: processedResults
      },
      { spaces: 2 }
    );
    
    logger.info(`Processamento concluído. Relatório salvo em: ${reportFilename}`);
    
    return processedResults;
  }

  /**
   * Envia dados para a API com mecanismo de retry
   * @param data Dados a serem enviados
   * @returns Resposta da API
   */
  private async sendWithRetry(data: any): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.retries!; attempt++) {
      try {
        // Tenta enviar os dados
        return await this.axiosInstance.post('', data);
      } catch (error) {
        lastError = error as Error;
        
        // Se for o último retry, propaga o erro
        if (attempt === this.config.retries) {
          throw error;
        }
        
        // Registra falha e aguarda antes de tentar novamente
        logger.warn(`Tentativa ${attempt} falhou. Tentando novamente em ${this.config.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
      }
    }
    
    // Não deveria chegar aqui, mas por precaução
    throw lastError || new Error('Falha ao enviar dados para API após múltiplas tentativas');
  }
  
  /**
   * Mapeia empresas de um formato SQL para o formato da API
   * @param sqlEmpresa Dados da empresa no formato SQL
   * @returns Dados mapeados para o formato da API
   */
  static mapEmpresaToApi(sqlEmpresa: any): any {
    // Determina o tipo de pessoa baseado no CNPJ/CPF
    const determinarTipoPessoa = (documento: string): string => {
      if (!documento) return "";
      
      // Remove caracteres não numéricos
      const apenasNumeros = documento.replace(/\D/g, '');
      
      if (apenasNumeros.length === 14) {
        return "Juridica";
      } else if (apenasNumeros.length === 11) {
        return "Fisica";
      } else {
        return "";
      }
    };

    // Modelo para dados da empresa no formato da API
    return {
      id: sqlEmpresa.ID_EMPRESA || uuidv4(),
      nome: sqlEmpresa.RAZAO || sqlEmpresa.NOME || '',
      nomeFantasia: sqlEmpresa.FANTASIA || '',
      documento: sqlEmpresa.CGC || sqlEmpresa.CPF || '',
      tipoPessoa: determinarTipoPessoa(sqlEmpresa.CGC || sqlEmpresa.CPF || ''),
      inscricaoEstadual: sqlEmpresa.IE || '',
      telefone: sqlEmpresa.FONE || '',
      email: sqlEmpresa.EMAIL || '',
      endereco: {
        logradouro: sqlEmpresa.ENDERECO || '',
        numero: sqlEmpresa.NUMERO || '',
        complemento: sqlEmpresa.COMPLEMENTO || '',
        bairro: sqlEmpresa.BAIRRO || '',
        cidade: sqlEmpresa.CIDADE || '',
        estado: sqlEmpresa.UF || '',
        cep: sqlEmpresa.CEP || ''
      },
      ativo: sqlEmpresa.ATIVO === 'S' || sqlEmpresa.ATIVO === 1,
      dataCadastro: sqlEmpresa.DATA_CADASTRO || new Date().toISOString(),
      dataAtualizacao: new Date().toISOString()
    };
  }
} 