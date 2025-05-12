const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain } = require('electron');
const serve = require('electron-serve');
const path = require('path');
const fs = require('fs');

// --- Importa os serviços ---
const database = require('../src/services/database'); // Assumindo caminho relativo correto
const odbcService = require('../src/services/odbcService');
const dataSyncService = require('../src/services/dataSyncService');
const scheduler = require('../src/services/scheduler');

const isProd = process.env.NODE_ENV === 'production';
const isDev = process.env.NODE_ENV === 'development';

// Servir a aplicação em produção
const serveURL = serve({ directory: path.join(__dirname, '../dist') }); // Ajusta caminho do build

// Manter uma referência global para evitar que o objeto seja coletado pelo GC
let mainWindow;
let tray;

// URL do servidor
const serverUrl = isProd 
  ? 'app://rse/' 
  : 'http://localhost:5176'; // Atualizado para porta 5176 para corresponder ao vite.config

// Implementa mecanismo de tentativas para carregar a URL
const loadURL = (window, url, retries = 5) => {
  console.log(`Tentando carregar URL: ${url} (tentativas restantes: ${retries})`);
  
  return window.loadURL(url).catch(err => {
    console.error(`Erro ao carregar URL: ${err.message}`);
    
    if (retries > 0 && err.code === 'ERR_CONNECTION_REFUSED') {
      console.log(`Conexão recusada, tentando novamente em 1 segundo...`);
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(loadURL(window, url, retries - 1));
        }, 1000);
      });
    } else {
      // Se acabarem as tentativas, mostra uma mensagem de erro na janela
      window.loadURL(`data:text/html,
        <html>
          <head>
            <title>Erro de Conexão</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
              h1 { color: #e53e3e; }
              p { margin: 20px 0; line-height: 1.5; }
              button { background: #4299e1; color: white; border: none; padding: 10px 20px; 
                      border-radius: 5px; cursor: pointer; }
              button:hover { background: #3182ce; }
              pre { background: #f8f8f8; padding: 10px; border-radius: 5px; text-align: left; 
                   white-space: pre-wrap; font-size: 14px; }
            </style>
          </head>
          <body>
            <h1>Erro de Conexão</h1>
            <p>Não foi possível conectar ao servidor de desenvolvimento em <strong>${url}</strong></p>
            <p>Erro: ${err.message}</p>
            <pre>
Possíveis causas:
1. O servidor Vite não está em execução
2. O servidor está usando uma porta diferente da esperada (${url.includes('localhost') ? url.split(':')[2] : 'N/A'})
3. Existe um firewall bloqueando a conexão
            </pre>
            <p>
              <button onclick="window.location.reload()">Tentar Novamente</button>
            </p>
          </body>
        </html>
      `);
      return Promise.reject(err);
    }
  });
};

// Cria a janela principal
function createWindow() {
  console.log('Criando janela principal...');
  
  // Configura a janela principal - removido o 'show: false' para que a janela apareça automaticamente
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js')
    },
    icon: path.join(__dirname, '../public/icon.ico')
  });

  // Usa o mecanismo de tentativas para carregar a URL
  loadURL(mainWindow, serverUrl)
    .then(() => console.log('URL carregada com sucesso!'))
    .catch(err => console.error('Falha ao carregar URL após várias tentativas:', err.message));

  // Evento para lidar com o fechamento da janela (minimizar para a bandeja em vez de fechar)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  console.log('Criando ícone na bandeja do sistema...');
  
  try {
    // Caminho para o ícone da bandeja
    const iconPath = path.join(__dirname, '../public/icon.ico');
    
    // Verifica se o arquivo do ícone existe
    if (!fs.existsSync(iconPath)) {
      console.error(`Arquivo de ícone não encontrado: ${iconPath}`);
      // Usa um ícone fallback em base64 se o arquivo não existir
      // ... código de fallback existente ...
    }
    
    // Cria o ícone na bandeja
    tray = new Tray(iconPath);
    
    // Define um tooltip para o ícone
    tray.setToolTip('CLI Tray Agent');
    
    // Cria um menu de contexto para a bandeja
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Abrir', 
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        } 
      },
      { type: 'separator' },
      { 
        label: 'Sair', 
        click: () => {
          app.isQuitting = true;
          app.quit();
        } 
      }
    ]);
    
    // Define o menu de contexto
    tray.setContextMenu(contextMenu);
    
    // Ao clicar duas vezes no ícone, mostra a janela principal
    tray.on('double-click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) { 
        createWindow(); // Cria uma nova janela se necessário
      } else {
        mainWindow.show();
        mainWindow.focus(); 
      }
    });
    
    console.log('Ícone da bandeja criado com sucesso!');
  } catch (error) {
    console.error('Erro ao criar ícone na bandeja:', error);
  }
}

// Função para registrar os manipuladores IPC
function setupIPCHandlers() {
  console.log('Registrando handlers IPC...');

  // Conexões
  ipcMain.handle('get-connections', async () => {
    console.log('[IPC] get-connections');
    try { return { success: true, data: await database.getConnections() }; }
    catch (e) { console.error('[IPC Error] get-connections:', e); return { success: false, message: e.message }; }
  });
  ipcMain.handle('get-connection', async (e, id) => {
     console.log('[IPC] get-connection', id);
     try { return { success: true, data: await database.getConnectionById(id) }; }
     catch (e) { console.error('[IPC Error] get-connection:', e); return { success: false, message: e.message }; }
  });
  ipcMain.handle('get-odbc-drivers', async () => {
    console.log('[IPC] get-odbc-drivers');
    try { 
      const drivers = await odbcService.listAvailableDrivers();
      console.log('[IPC] Drivers ODBC disponíveis:', drivers);
      return { success: true, data: drivers }; 
    } catch (e) { 
      console.error('[IPC Error] get-odbc-drivers:', e); 
      return { success: false, message: e.message }; 
    }
  });
  ipcMain.handle('create-connection', async (e, data) => {
     console.log('[IPC] create-connection', JSON.stringify(data, null, 2));
     try { 
       console.log('[IPC] Tentando criar conexão com os dados:', JSON.stringify(data, null, 2));
       const result = await database.createConnection(data);
       console.log('[IPC] Conexão criada com sucesso:', result);
       return { success: true, data: result, message: 'Conexão criada.' }; 
     } catch (e) { 
       console.error('[IPC Error] create-connection:', e); 
       return { success: false, message: e.message }; 
     }
  });
  ipcMain.handle('update-connection', async (e, id, data) => {
     console.log('[IPC] update-connection', id, JSON.stringify(data, null, 2));
     try { 
       console.log('[IPC] Tentando atualizar conexão', id, 'com os dados:', JSON.stringify(data, null, 2));
       const result = await database.updateConnection(id, data);
       console.log('[IPC] Conexão atualizada com sucesso:', result);
       return { success: true, data: result, message: 'Conexão atualizada.' }; 
     } catch (e) { 
       console.error('[IPC Error] update-connection:', e); 
       return { success: false, message: e.message }; 
     }
  });
  ipcMain.handle('delete-connection', async (e, id) => {
     console.log('[IPC] delete-connection', id);
     try { await database.deleteConnection(id); return { success: true, message: 'Conexão excluída.' }; }
     catch (e) { console.error('[IPC Error] delete-connection:', e); return { success: false, message: e.message }; }
  });
  ipcMain.handle('test-connection', async (e, data) => {
     console.log('[IPC] test-connection', JSON.stringify(data, null, 2));
     try {
       // Chama o teste de conexão com os dados fornecidos
       const result = await odbcService.testConnection(data);
       console.log('[IPC] test-connection result:', result);
       
       // Se falhou e parece ser problema do driver, fornece mais informações
       if (!result.success && result.message.includes('Error connecting to the database')) {
         console.log('[IPC] Possível problema com o driver ODBC do SQL Anywhere');
         return {
           success: false,
           message: `Falha na conexão: Verifique se o driver SQL Anywhere 17 está instalado corretamente. 
                    Detalhes: ${result.message}
                    
                    Dicas de solução:
                    1. Certifique-se que o SQL Anywhere 17 está instalado
                    2. Verifique se o driver ODBC está registrado no sistema
                    3. Tente usar uma DSN configurada no painel de controle ODBC`,
           originalMessage: result.message
         };
       }
       
       // Garante que estamos retornando no formato esperado
       return { 
         success: result.success, 
         message: result.message 
       };
     } catch (e) {
       console.error('[IPC Error] test-connection:', e);
       return { 
         success: false, 
         message: e.message || 'Erro desconhecido ao testar conexão'
       };
     }
  });

  // Consultas
  ipcMain.handle('get-queries', async () => {
    console.log('[IPC] get-queries');
    try { return { success: true, data: await database.getQueriesWithConnectionNames() }; } // Assume que essa função existe no DB para pegar nome da conexão junto
    catch (e) { console.error('[IPC Error] get-queries:', e); return { success: false, message: e.message }; }
  });
  ipcMain.handle('get-query', async (e, id) => {
     console.log('[IPC] get-query', id);
     try { return { success: true, data: await database.getQueryById(id) }; }
     catch (e) { console.error('[IPC Error] get-query:', e); return { success: false, message: e.message }; }
  });
  ipcMain.handle('create-query', async (e, data) => {
     console.log('[IPC] create-query', JSON.stringify(data, null, 2));
     try { 
       console.log('[IPC] Tentando criar consulta SQL com os dados:', JSON.stringify(data, null, 2));
       if (!data.nome) {
         console.error('[IPC] Erro: Nome da consulta é obrigatório');
         return { success: false, message: 'Nome da consulta é obrigatório' };
       }
       if (!data.query && !data.sql) {
         console.error('[IPC] Erro: Query SQL não fornecida');
         return { success: false, message: 'Consulta SQL não fornecida' };
       }
       if (!data.conexao_id) {
         console.error('[IPC] Erro: ID da conexão não fornecido');
         return { success: false, message: 'Selecione uma conexão' };
       }
       
       // Garante que os dados estão no formato esperado pelo banco de dados
       const queryData = {
         nome: data.nome,
         descricao: data.descricao || '',
         conexao_id: parseInt(data.conexao_id, 10),
         query: data.query || data.sql,
         formato_saida: data.formato_saida || 'json'
       };
       
       console.log('[IPC] Dados formatados para salvar:', queryData);
       const result = await database.createQuery(queryData);
       console.log('[IPC] Consulta SQL criada com sucesso:', result);
       return { success: true, data: result, message: 'Consulta criada.' }; 
     } catch (e) { 
       console.error('[IPC Error] create-query:', e); 
       return { success: false, message: e.message }; 
     }
  });
  ipcMain.handle('update-query', async (e, id, data) => {
     console.log('[IPC] update-query', id, JSON.stringify(data, null, 2));
     try { 
       console.log('[IPC] Tentando atualizar consulta SQL', id, 'com os dados:', JSON.stringify(data, null, 2));
       if (!data.nome) {
         console.error('[IPC] Erro: Nome da consulta é obrigatório');
         return { success: false, message: 'Nome da consulta é obrigatório' };
       }
       if (!data.query && !data.sql) {
         console.error('[IPC] Erro: Query SQL não fornecida');
         return { success: false, message: 'Consulta SQL não fornecida' };
       }
       if (!data.conexao_id) {
         console.error('[IPC] Erro: ID da conexão não fornecido');
         return { success: false, message: 'Selecione uma conexão' };
       }
       
       // Garante que os dados estão no formato esperado pelo banco de dados
       const queryData = {
         nome: data.nome,
         descricao: data.descricao || '',
         conexao_id: parseInt(data.conexao_id, 10),
         query: data.query || data.sql,
         formato_saida: data.formato_saida || 'json'
       };
       
       console.log('[IPC] Dados formatados para atualizar:', queryData);
       const result = await database.updateQuery(id, queryData);
       console.log('[IPC] Consulta SQL atualizada com sucesso:', result);
       return { success: true, data: result, message: 'Consulta atualizada.' }; 
     } catch (e) { 
       console.error('[IPC Error] update-query:', e); 
       return { success: false, message: e.message }; 
     }
  });
  ipcMain.handle('delete-query', async (e, id) => {
     console.log('[IPC] delete-query', id);
     try { await database.deleteQuery(id); return { success: true, message: 'Consulta excluída.' }; }
     catch (e) { console.error('[IPC Error] delete-query:', e); return { success: false, message: e.message }; }
  });
   ipcMain.handle('test-query', async (e, sql, connectionId) => {
     console.log('[IPC] test-query', { sql, connectionId });
     try {
       const result = await odbcService.testQuery(sql, connectionId); // Chama o serviço ODBC
       
       // Adiciona aviso se estiver em modo simulado
       if (result.simulado) {
         result.message = `[MODO DE TESTE] ${result.message} (ODBC não disponível - Utilizando dados fictícios para teste)`;
       }
       
       return { 
         success: result.success, 
         message: result.message, 
         data: result.data,
         simulado: result.simulado 
       }; // Retorna dados se sucesso
     } catch (e) {
       console.error('[IPC Error] test-query:', e);
       return { success: false, message: e.message };
     }
  });
   
   ipcMain.handle('execute-query', async (e, id) => {
     console.log('[IPC] execute-query', id);
     try {
       // Primeiro, obtém os dados da consulta
       const query = await database.getQueryById(id);
       if (!query) {
         return { success: false, message: `Consulta ID ${id} não encontrada` };
       }
       
       console.log('[IPC] Executando consulta SQL:', query.nome);
       
       try {
         // Executa a consulta usando o odbcService
         const result = await database.executeOdbcQuery(query.conexao_id, query.query);
         
         return { 
           success: true, 
           message: `Consulta executada com sucesso (${result.length} registros)`, 
           data: result 
         };
       } catch (odbcError) {
         console.error('[IPC] Erro ao executar consulta ODBC:', odbcError.message);
         
         // Verifica se podemos usar dados simulados
         if (odbcError.message.includes('Driver não especificado') || 
             odbcError.message.includes('Driver ODBC não está disponível')) {
           console.log('[IPC] Tentando executar em modo simulado');
           
           // Utiliza o testQuery com os mesmos parâmetros que retorna dados simulados quando ODBC não está disponível
           const mockResult = await odbcService.testQuery(query.query, query.conexao_id);
           
           if (mockResult.success) {
             return {
               success: true,
               message: `[MODO DE TESTE] Consulta executada com dados simulados (${mockResult.data.length} registros)`,
               data: mockResult.data,
               simulado: true
             };
           } else {
             // Se mesmo o mock falhar, retorna o erro original
             return {
               success: false,
               message: mockResult.message,
               simulado: true
             };
           }
         }
         
         // Se não é um erro que podemos simular, retorna o erro original
         return { 
           success: false, 
           message: odbcError.message
         };
       }
     } catch (e) {
       console.error('[IPC Error] execute-query:', e);
       return { success: false, message: e.message };
     }
   });
   
   console.log('Handlers IPC para Consultas registrados.');

  // Tarefas
  ipcMain.handle('get-tasks', async () => {
    console.log('[IPC] get-tasks');
    try { return { success: true, data: await database.getTasksWithDetails() }; } // Assume que essa função existe no DB para pegar nomes
    catch (e) { console.error('[IPC Error] get-tasks:', e); return { success: false, message: e.message }; }
  });
  ipcMain.handle('get-task', async (e, id) => {
     console.log('[IPC] get-task', id);
     try { return { success: true, data: await database.getTaskById(id) }; }
     catch (e) { console.error('[IPC Error] get-task:', e); return { success: false, message: e.message }; }
  });
  ipcMain.handle('create-task', async (e, data) => {
     console.log('[IPC] create-task', data);
     try {
       const newTask = await database.createTask(data);
       scheduler.scheduleTask(newTask); // Agenda a nova tarefa criada
       return { success: true, data: newTask, message: 'Tarefa criada e agendada.' };
      } catch (e) {
        console.error('[IPC Error] create-task:', e);
        return { success: false, message: e.message };
      }
  });
  ipcMain.handle('update-task', async (e, id, data) => {
     console.log('[IPC] update-task', id, data);
     try {
       const updatedTask = await database.updateTask(id, data);
       scheduler.rescheduleTask(updatedTask); // Reagenda a tarefa atualizada
       return { success: true, data: updatedTask, message: 'Tarefa atualizada e reagendada.' };
      } catch (e) {
       console.error('[IPC Error] update-task:', e);
       return { success: false, message: e.message };
      }
  });
  ipcMain.handle('delete-task', async (e, id) => {
     console.log('[IPC] delete-task', id);
     try {
       scheduler.unscheduleTask(id); // Desagenda a tarefa
       await database.deleteTask(id);
       return { success: true, message: 'Tarefa excluída e desagendada.' };
      } catch (e) {
       console.error('[IPC Error] delete-task:', e);
       return { success: false, message: e.message };
      }
  });
   ipcMain.handle('execute-task', async (e, id) => {
     console.log('[IPC] execute-task', id);
     try {
       const result = await dataSyncService.syncSingleTaskNow(id); // Chama o serviço de sincronização
       return { success: result.success, message: result.message, details: result.details };
     } catch (e) {
       console.error('[IPC Error] execute-task:', e);
       return { success: false, message: e.message };
     }
   });
   console.log('Handlers IPC para Tarefas registrados.');

  // Forçar Sincronização
  ipcMain.handle('force-sync', async () => {
     console.log('[IPC] force-sync');
     try {
       const result = await dataSyncService.syncAllTasksNow(); // Chama o serviço
       return { success: result.success, message: result.message, details: result.details };
     } catch (e) {
       console.error('[IPC Error] force-sync:', e);
       return { success: false, message: e.message };
     }
  });
  console.log('Handler IPC para Force Sync registrado.');

  // ODBC Connection Diagnostics
  ipcMain.handle('diagnose-connection', async (event, connectionId) => {
    console.log(`[IPC] Solicitação de diagnóstico para conexão ID: ${connectionId}`);
    try {
      // Obtém a conexão para verificar se é SQL Anywhere
      const connection = await database.getConnectionById(connectionId);
      
      if (!connection) {
        throw new Error(`Conexão ID ${connectionId} não encontrada`);
      }
      
      console.log(`[IPC] Diagnosticando conexão: ${connection.name} (ID: ${connectionId})`);
      
      // Verifica se é uma conexão SQL Anywhere
      const isSQLAnywhere = connection.driver && 
                           connection.driver.toLowerCase().includes('sql anywhere');
      
      // Executa o diagnóstico normal
      const result = await odbcService.diagnosticarConexao(connectionId);
      
      // Para SQL Anywhere, se o resultado for negativo mas a conexão estiver ativa,
      // ajustamos o resultado para não alarmar o usuário desnecessariamente
      if (isSQLAnywhere && result.resultado.status !== 'ok') {
        console.log(`[IPC] Conexão SQL Anywhere detectada com status ${result.resultado.status}. Verificando conexão ativa...`);
        
        // Verifica se a conexão está realmente ativa, apesar do diagnóstico falhar
        const isAtiva = await odbcService.verificarConexaoAtiva(connectionId);
        
        if (isAtiva) {
          console.log(`[IPC] Conexão SQL Anywhere ID ${connectionId} está ativa mesmo com diagnóstico negativo`);
          
          // Atualiza o resultado para refletir que a conexão está funcionando
          result.resultado = {
            status: 'verificar',
            mensagem: `Conexão SQL Anywhere verificada e está funcionando.`,
            sugestao: 'Esta conexão pode funcionar corretamente apesar do diagnóstico não conseguir verificar completamente.'
          };
        }
      }
      
      console.log(`[IPC] Diagnóstico de conexão concluído com status: ${result.resultado.status}`);
      return result;
    } catch (error) {
      console.error(`[IPC] Erro ao diagnosticar conexão:`, error);
      return {
        driver: { status: 'erro', mensagem: 'Erro no IPC', sugestao: '' },
        servidor: { status: 'erro', mensagem: 'Erro no IPC', sugestao: '' },
        credenciais: { status: 'erro', mensagem: 'Erro no IPC', sugestao: '' },
        banco: { status: 'erro', mensagem: 'Erro no IPC', sugestao: '' },
        resultado: { 
          status: 'erro', 
          mensagem: `Erro no processo de diagnóstico: ${error.message}`,
          sugestao: 'Tente novamente mais tarde ou contate o suporte'
        }
      };
    }
  });

  console.log('Todos os handlers IPC registrados com sucesso.');
}

// --- Eventos do Ciclo de Vida do App ---
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Não encerra se for macOS, o comportamento padrão é manter no dock/tray
    // app.quit(); // Removido para manter rodando em background
    console.log('Todas as janelas fechadas, mas a aplicação continua no tray.');
  }
});

// Antes de fechar a aplicação, fecha todas as conexões ODBC
app.on('before-quit', async () => {
  console.log('Fechando todas as conexões ODBC antes de encerrar...');
  try {
    await odbcService.closeAllConnections();
    await database.closeDatabase();
    console.log('Conexões fechadas com sucesso.');
  } catch (error) {
    console.error('Erro ao fechar conexões:', error);
  }
});

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
       if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
} 

// Quando o Electron estiver pronto
app.whenReady().then(() => {
  console.log('Aplicação iniciada! Configurando componentes...');
  
  // Inicializa o banco de dados
  database.initDatabase()
    .then(() => console.log('Banco de dados inicializado com sucesso!'))
    .catch(err => console.error('Erro ao inicializar o banco de dados:', err));
  
  // Cria a bandeja e a janela principal
  createTray();
  createWindow(); // Cria a janela principal automaticamente ao iniciar
  
  // Inicia as tarefas agendadas
  scheduler.runScheduledTasks();
  
  // Registra os handlers de IPC
  setupIPCHandlers();
  
  // No macOS, recria a janela ao clicar no ícone do dock
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  
  console.log('Aplicação pronta!');
}); 