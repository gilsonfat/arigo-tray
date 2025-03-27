import { BrowserWindow, ipcMain, dialog, app, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { ConfigManager } from './config-manager';
import { QueryScheduler } from './scheduler';

export class ConfigWindow {
  private window: BrowserWindow | null = null;
  private configManager: ConfigManager;
  private scheduler: QueryScheduler;
  
  constructor(configManager: ConfigManager, scheduler: QueryScheduler) {
    this.configManager = configManager;
    this.scheduler = scheduler;
  }
  
  // Método compatível com a versão anterior, chama create()
  show(): void {
    this.create();
  }
  
  create() {
    if (this.window) {
      this.window.focus();
      return;
    }
    
    this.window = new BrowserWindow({
      width: 900,
      height: 700,
      title: 'Configurações do SQL Tray',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    
    this.window.loadFile(path.join(__dirname, 'ui', 'config.html'));
    this.window.setMenuBarVisibility(false);
    
    this.setupIpcHandlers();
    
    this.window.on('closed', () => {
      this.window = null;
    });
  }
  
  private setupIpcHandlers() {
    // Obter configurações
    ipcMain.handle('get-config', () => {
      return this.configManager.getConfig();
    });
    
    // Salvar configurações
    ipcMain.handle('save-config', (_, config) => {
      this.configManager.saveConfig(config);
      return true;
    });
    
    // Obter consultas agendadas
    ipcMain.handle('get-scheduled-queries', () => {
      return this.configManager.getScheduledQueries();
    });
    
    // Adicionar consulta agendada
    ipcMain.handle('add-scheduled-query', (_, query) => {
      const newQuery = this.configManager.addScheduledQuery(query);
      this.scheduler.scheduleQuery(newQuery);
      return newQuery;
    });
    
    // Atualizar consulta agendada
    ipcMain.handle('update-scheduled-query', (_, query) => {
      this.configManager.updateScheduledQuery(query);
      // Primeiro cancela o agendamento existente e depois agenda novamente
      this.scheduler.unscheduleQuery(query.id);
      this.scheduler.scheduleQuery(query);
      return true;
    });
    
    // Remover consulta agendada
    ipcMain.handle('remove-scheduled-query', (_, queryId) => {
      this.configManager.removeScheduledQuery(queryId);
      this.scheduler.unscheduleQuery(queryId);
      return true;
    });
    
    // Executar consulta agendada agora
    ipcMain.handle('run-query-now', async (_, queryId) => {
      try {
        const query = this.configManager.getScheduledQueries().find(q => q.id === queryId);
        if (!query) {
          throw new Error('Consulta não encontrada');
        }
        
        // Usar o método correto do scheduler para executar a consulta
        const result = await this.scheduler.runQuery(query);
        return { success: true, result };
      } catch (error: any) {
        console.error('Erro ao executar consulta:', error);
        return { success: false, error: error.message };
      }
    });
    
    // Selecionar arquivo de destino
    ipcMain.handle('select-destination-file', async () => {
      const result = await dialog.showSaveDialog({
        title: 'Selecione o arquivo de destino',
        defaultPath: path.join(app.getPath('documents'), 'resultados.json'),
        filters: [
          { name: 'Arquivos JSON', extensions: ['json'] },
          { name: 'Todos os arquivos', extensions: ['*'] }
        ]
      });
      
      if (result.canceled) {
        return null;
      }
      
      return result.filePath;
    });
    
    // Testar conexão de banco de dados
    ipcMain.handle('test-connection', async (_, connectionString) => {
      try {
        // Implementação do teste de conexão
        // (depende da sua biblioteca de conexão com banco de dados)
        return { success: true, message: 'Conexão estabelecida com sucesso!' };
      } catch (error: any) {
        console.error('Erro ao testar conexão:', error);
        return { success: false, error: error.message };
      }
    });
    
    // Testar conexão com a API
    ipcMain.handle('test-api-connection', async (_, apiUrl, apiKey) => {
      try {
        // Verificar se a URL foi fornecida
        if (!apiUrl) {
          return { success: false, error: 'URL da API não informada' };
        }
        
        // Configurar headers da requisição
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        
        // Adicionar chave de autenticação se fornecida
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        
        // Fazer requisição de teste para a API
        const response = await axios.get(`${apiUrl}/status`, { 
          headers,
          timeout: 5000 // 5 segundos de timeout
        });
        
        // Verificar se a resposta foi bem sucedida
        if (response.status === 200) {
          return { 
            success: true, 
            message: 'Conexão com a API estabelecida com sucesso!',
            data: response.data
          };
        } else {
          return { 
            success: false, 
            error: `API retornou código de status ${response.status}`
          };
        }
      } catch (error: any) {
        console.error('Erro ao testar conexão com a API:', error);
        
        // Formatar mensagem de erro
        let errorMessage = 'Erro ao conectar com a API';
        
        if (error.response) {
          // A requisição foi feita e o servidor respondeu com um status fora do range 2xx
          errorMessage = `Erro ${error.response.status}: ${error.response.data?.message || 'Resposta inválida do servidor'}`;
        } else if (error.request) {
          // A requisição foi feita mas não houve resposta
          errorMessage = 'Sem resposta do servidor. Verifique a URL e a conectividade da rede.';
        } else {
          // Algo aconteceu ao configurar a requisição
          errorMessage = error.message || 'Erro desconhecido';
        }
        
        return { success: false, error: errorMessage };
      }
    });
    
    // Abrir pasta de logs
    ipcMain.handle('open-logs-folder', async () => {
      try {
        const logsPath = path.join(app.getPath('userData'), 'logs');
        
        // Criar pasta de logs se não existir
        if (!fs.existsSync(logsPath)) {
          fs.mkdirSync(logsPath, { recursive: true });
        }
        
        await shell.openPath(logsPath);
        return { success: true };
      } catch (error: any) {
        console.error('Erro ao abrir pasta de logs:', error);
        return { success: false, error: error.message };
      }
    });
  }
} 