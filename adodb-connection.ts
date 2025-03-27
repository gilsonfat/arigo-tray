import { app, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import express from 'express';
import { Server } from 'http';
import * as fs from 'fs';

// Importar o módulo node-adodb (projetado para trabalhar bem com ADO/ODBC 32-bit)
const ADODB = require('node-adodb');

// Importar módulos de configuração e agendamento
import { ConfigManager } from './config-manager';
import { QueryScheduler } from './scheduler';
import { ConfigWindow } from './config-window';
import { ApiService } from './api-service';

export class SQLTrayApp {
  private tray: Tray | null = null;
  private connection: any; // Conexão ADODB
  private expressApp: express.Application;
  private server: Server | null = null;
  private serverPort: number = 8765;
  private isServerRunning: boolean = false;
  
  // Gerenciador de configurações
  private configManager: ConfigManager;
  
  // Agendador de consultas
  private scheduler: QueryScheduler;
  
  // Janela de configuração
  private configWindow: ConfigWindow;

  constructor() {
    // Inicializar gerenciador de configurações
    this.configManager = new ConfigManager();
    
    // Obter as configurações salvas
    const connectionString = this.configManager.getConnectionString();
    this.serverPort = this.configManager.getServerPort();
    
    // Inicializar o agendador de consultas
    this.scheduler = new QueryScheduler(this.executeQuery.bind(this));
    
    // Inicializar a janela de configuração
    this.configWindow = new ConfigWindow(this.configManager, this.scheduler);
    
    // Inicializar conexão com o banco de dados
    this.expressApp = express();
    this.initConnection(connectionString);
    
    // Configurar a aplicação Express
    this.setupExpressApp();
    
    // Iniciar os agendamentos salvos
    this.initSchedules();
  }

  private initConnection(connectionString: string): void {
    try {
      // Inicializar a conexão ADODB com o banco de dados
      this.connection = ADODB.open(connectionString);
      
      console.log('Conexão inicializada');
      
      // Testar conexão
      this.testConnection();
    } catch (error) {
      console.error('Erro ao inicializar conexão:', error);
    }
  }

  private async testConnection(): Promise<void> {
    try {
      // Executa uma consulta simples para testar a conexão
      const result = await this.connection.query('SELECT 1 AS TestResult');
      console.log('Conexão de banco de dados testada com sucesso:', result);
    } catch (error) {
      console.error('Erro ao testar conexão de banco de dados:', error);
    }
  }

  private setupExpressApp(): void {
    // Middleware para parse de JSON
    this.expressApp.use(express.json());
    
    // Rota para consultas SQL via GET
    this.expressApp.get('/query', async (req: any, res: any) => {
      const sqlQuery = req.query.sql;
      if (!sqlQuery) {
        return res.status(400).json({ error: 'Nenhuma consulta SQL fornecida. Use o parâmetro "sql".' });
      }
      
      try {
        const result = await this.executeQuery(sqlQuery);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });
    
    // Rota para consultas SQL via POST (para consultas mais complexas)
    this.expressApp.post('/query', async (req: any, res: any) => {
      const sqlQuery = req.body.sql;
      if (!sqlQuery) {
        return res.status(400).json({ error: 'Nenhuma consulta SQL fornecida no corpo da requisição.' });
      }
      
      try {
        const result = await this.executeQuery(sqlQuery);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Nova rota para consultar e enviar para API em uma única operação
    this.expressApp.post('/query-and-send', async (req: any, res: any) => {
      const { sql, apiUrl, apiKey, mapToApi = true } = req.body;
      
      if (!sql) {
        return res.status(400).json({ 
          error: 'Nenhuma consulta SQL fornecida no corpo da requisição.' 
        });
      }
      
      try {
        // Executa a consulta SQL
        const result = await this.executeQuery(sql);
        
        if (!result || !result.results || !Array.isArray(result.results)) {
          return res.status(400).json({ 
            error: 'A consulta SQL não retornou um array de resultados válido.' 
          });
        }
        
        // Configura o serviço de API
        const apiService = new ApiService({
          apiUrl: apiUrl || this.configManager.getApiUrl() || 'http://localhost:3000/api',
          apiKey: apiKey || this.configManager.getApiKey(),
          timeout: 30000
        });
        
        // Processa e envia os resultados para a API
        const processedResults = await apiService.processResultsBatch(
          result.results,
          mapToApi ? ApiService.mapEmpresaToApi : undefined
        );
        
        // Retorna os resultados do processamento
        res.json({
          totalProcessed: result.results.length,
          successCount: processedResults.filter(r => r.success).length,
          failedCount: processedResults.filter(r => !r.success).length,
          results: processedResults
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });
  }

  private async executeQuery(query: string): Promise<any> {
    try {
      // Determinar o tipo de consulta
      const isSelectQuery = query.trim().toLowerCase().startsWith('select');
      
      let result;
      if (isSelectQuery) {
        // Para SELECTs, usamos .query() que retorna resultados
        result = await this.connection.query(query);
      } else {
        // Para outros comandos (INSERT, UPDATE, DELETE, etc), usamos .execute()
        result = await this.connection.execute(query);
      }
      
      return {
        results: result,
        count: Array.isArray(result) ? result.length : 1
      };
    } catch (error) {
      console.error('Erro ao executar consulta:', error);
      throw error;
    }
  }

  private startServer(): void {
    if (this.isServerRunning) return;
    
    this.server = this.expressApp.listen(this.serverPort, () => {
      this.isServerRunning = true;
      console.log(`Servidor iniciado na porta ${this.serverPort}`);
    });
  }

  private stopServer(): void {
    if (this.server && this.isServerRunning) {
      this.server.close();
      this.server = null;
      this.isServerRunning = false;
      console.log('Servidor parado');
    }
  }

  private createTray(): void {
    // Verificar o caminho do ícone personalizado
    const customIconPath = path.join(__dirname, 'assets', 'user-icon.png');
    let icon: Electron.NativeImage;
    
    // Verificar se o ícone personalizado existe
    if (fs.existsSync(customIconPath)) {
      icon = nativeImage.createFromPath(customIconPath);
    } else {
      console.log('Ícone personalizado não encontrado. Usando ícone embutido.');
      icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'user-icon.png'));
    }
    
    this.tray = new Tray(icon);
    
    // Definir menu de contexto
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Servidor HTTP',
        submenu: [
          {
            label: 'Iniciar Servidor',
            click: () => this.startServer(),
            enabled: !this.isServerRunning
          },
          {
            label: 'Parar Servidor',
            click: () => this.stopServer(),
            enabled: this.isServerRunning
          }
        ]
      },
      { 
        label: 'Banco de Dados',
        submenu: [
          {
            label: 'Reconectar',
            click: () => this.initConnection(this.configManager.getConnectionString())
          },
          {
            label: 'Testar Conexão',
            click: () => this.testConnection()
          }
        ]
      },
      {
        label: 'Consultas Agendadas',
        submenu: [
          {
            label: 'Gerenciar Consultas',
            click: () => this.configWindow.show()
          },
          {
            label: 'Recarregar Agendamentos',
            click: () => this.initSchedules()
          }
        ]
      },
      { type: 'separator' },
      { 
        label: 'Configurações',
        click: () => this.configWindow.show()
      },
      { type: 'separator' },
      { 
        label: 'Sair', 
        click: () => this.exitApp() 
      }
    ]);
    
    this.tray.setToolTip('SQL Tray App');
    this.tray.setContextMenu(contextMenu);
    
    // Adicionar evento de clique duplo para abrir as configurações
    this.tray.on('double-click', () => {
      this.configWindow.show();
    });
  }

  private initSchedules(): void {
    // Obter as consultas agendadas da configuração
    const scheduledQueries = this.configManager.getScheduledQueries();
    
    // Atualizar os agendamentos
    this.scheduler.updateSchedules(scheduledQueries);
    
    console.log(`${scheduledQueries.length} consultas agendadas carregadas`);
  }

  private exitApp(): void {
    // Parar o servidor HTTP
    this.stopServer();
    
    // Parar todos os agendamentos
    this.scheduler.stopAll();
    
    // Encerrar a aplicação
    app.quit();
  }

  // Método público para iniciar a aplicação
  public start(): void {
    // Iniciar o servidor automaticamente
    this.startServer();
    
    // Criar a bandeja quando o app estiver pronto
    app.whenReady().then(() => {
      this.createTray();
    });
    
    // Manter a aplicação rodando mesmo quando todas as janelas estiverem fechadas
    app.on('window-all-closed', (e: any) => {
      e.preventDefault();
    });
  }
} 