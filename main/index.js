const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, shell } = require('electron');
const serve = require('electron-serve');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

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
  : process.env.VITE_DEV_SERVER_URL || 'http://localhost:6502'; // Usar variável de ambiente ou fallback para 6502

console.log(`[App] Usando URL do servidor: ${serverUrl}`);

// Implementa mecanismo de tentativas para carregar a URL
const loadURL = (window, url, retries = 5) => {
  console.log(`Tentando carregar URL: ${url} (tentativas restantes: ${retries})`);
  
  // Verificar se a janela ainda existe e não foi destruída
  if (!window || window.isDestroyed()) {
    console.error('A janela foi destruída, não é possível carregar a URL');
    return Promise.reject(new Error('Window was destroyed'));
  }
  
  return window.loadURL(url).catch(err => {
    console.error(`Erro ao carregar URL: ${err.message} (${err.code}) loading '${url}'`);
    
    if (retries > 0 && (err.code === 'ERR_CONNECTION_REFUSED' || err.code === 'ERR_FAILED')) {
      console.log(`Conexão recusada, tentando novamente em 1 segundo...`);
      return new Promise(resolve => {
        setTimeout(() => {
          // Verificar novamente se a janela ainda existe antes de tentar novamente
          if (!window || window.isDestroyed()) {
            console.error('A janela foi destruída durante a espera, não é possível carregar a URL');
            reject(new Error('Window was destroyed during retry'));
            return;
          }
          resolve(loadURL(window, url, retries - 1));
        }, 1000);
      });
    } else {
      // Se acabarem as tentativas, mostra uma mensagem de erro na janela
      try {
        if (!window || window.isDestroyed()) {
          return Promise.reject(new Error('Window was destroyed, cannot show error page'));
        }
        
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
              <p>Erro: ${err.message} (${err.code})</p>
              <pre>
Possíveis causas:
1. O servidor Vite não está em execução
2. O servidor está usando uma porta diferente da esperada (${url.includes('localhost') ? url.split(':')[2].split('/')[0] : 'N/A'})
3. Existe um firewall bloqueando a conexão
              </pre>
              <p>
                <button onclick="window.location.reload()">Tentar Novamente</button>
              </p>
            </body>
          </html>
        `);
        return Promise.reject(err);
      } catch (displayError) {
        console.error('Erro ao exibir página de erro:', displayError);
        return Promise.reject(err);
      }
    }
  });
};

// Cria a janela principal
function createWindow() {
  console.log('Criando janela principal...');
  
  try {
    // Configura a janela principal - removido o 'show: false' para que a janela apareça automaticamente
    mainWindow = new BrowserWindow({
      width: 1100,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/index.js'),
        // Adicionar configurações para cache
        partition: 'persist:main',
        // Permitir conteúdo inseguro em desenvolvimento
        webSecurity: isProd
      },
      icon: path.join(__dirname, '../public/logo-icon.ico')
    });

    // Adicionar tratamento de erro para eventos de falha de renderização
    mainWindow.webContents.on('render-process-gone', (event, details) => {
      console.error('Processo de renderização falhou:', details.reason);
      console.error('Detalhes:', details);
      
      // Se o processo de renderização falhou, tenta recriar a janela após um atraso
      if (!mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
      setTimeout(() => {
        console.log('Recriando janela após falha...');
        createWindow();
      }, 1000);
    });

    // Adicionar tratamento de erro para falhas de carga do plugin
    mainWindow.webContents.on('plugin-crashed', (event, name, version) => {
      console.error(`Plugin ${name} versão ${version} falhou`);
    });

    // Usa o mecanismo de tentativas para carregar a URL
    loadURL(mainWindow, serverUrl)
      .then(() => console.log('URL carregada com sucesso!'))
      .catch(err => {
        console.error('Falha ao carregar URL após várias tentativas:', err.message);
        // Não finalizar aplicação em caso de erro, apenas mostrar erro na UI
      });

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
    
    // Adicionar tratamento para links externos
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      // Abrir links externos no navegador padrão 
      // (por exemplo quando clica em um link para documentação)
      if (url.startsWith('http:') || url.startsWith('https:')) {
        require('electron').shell.openExternal(url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
    
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('Janela principal carregada com sucesso');
      
      // Garantir que os handlers estejam registrados assim que a janela principal carrega
      ensureTemplateHandlers();
      
      // Disponibilizar métodos via window.electron
      mainWindow.webContents.executeJavaScript(`
        window.electron = {
          ipcRenderer: {
            invoke: (channel, data) => window.ipc.invoke(channel, data)
          }
        };
        console.log('Objetos electron injetados no frontend');
      `).catch(e => {
        console.error('Erro ao injetar objetos electron:', e);
      });
    });
    
    return mainWindow;
  } catch (error) {
    console.error('Erro crítico ao criar janela principal:', error);
    // Em caso de erro crítico, tentar criar uma janela simples com a mensagem
    try {
      const errorWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });
      
      errorWindow.loadURL(`data:text/html,
        <html>
          <head>
            <title>Erro Crítico</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
              h1 { color: #e53e3e; }
              p { margin: 20px 0; line-height: 1.5; }
              pre { background: #f8f8f8; padding: 10px; border-radius: 5px; text-align: left; white-space: pre-wrap; }
            </style>
          </head>
          <body>
            <h1>Erro Crítico</h1>
            <p>Ocorreu um erro crítico ao iniciar a aplicação:</p>
            <pre>${error.stack || error.message}</pre>
            <p>Por favor, reinicie a aplicação. Se o problema persistir, contate o suporte.</p>
          </body>
        </html>
      `);
      
      return errorWindow;
    } catch (errorWindowError) {
      console.error('Falha até ao criar janela de erro:', errorWindowError);
      // Neste ponto, é melhor encerrar a aplicação
      app.quit();
    }
  }
}

function createTray() {
  console.log('Criando ícone na bandeja do sistema...');
  
  try {
    // Caminho para o ícone da bandeja
    const iconPath = path.join(__dirname, '../public/logo-icon.ico');
    
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

// Armazenamento para dados de transformação recentes
let recentTransformations = [];

// Armazenamento para configurações de transformação
let transformationConfigs = [];

// Função para carregar configurações de transformação do arquivo
function loadTransformationConfigs() {
  try {
    const configsPath = path.join(app.getPath('userData'), 'transformation-configs.json');
    
    if (fs.existsSync(configsPath)) {
      try {
        const configsData = fs.readFileSync(configsPath, 'utf8');
        
        let configs;
        try {
          configs = JSON.parse(configsData);
        } catch (parseError) {
          console.error('Erro ao fazer parse do JSON de configurações:', parseError);
          transformationConfigs = [];
          return;
        }
        
        if (!Array.isArray(configs)) {
          console.error('Formato inválido de configurações: não é um array');
          transformationConfigs = [];
          return;
        }
        
        // Filtrar configurações válidas
        const validConfigs = configs.filter(config => {
          if (!config || typeof config !== 'object') {
            console.warn('Ignorando configuração inválida:', config);
            return false;
          }
          
          if (!config.id || !config.queryId) {
            console.warn('Ignorando configuração incompleta:', config);
            return false;
          }
          
          return true;
        });
        
        transformationConfigs = validConfigs;
        console.log(`Carregadas ${validConfigs.length} configurações de transformação`);
      } catch (error) {
        console.error('Erro ao carregar configurações de transformação:', error);
        transformationConfigs = [];
      }
    } else {
      transformationConfigs = [];
      console.log('Nenhuma configuração de transformação encontrada. Criando arquivo vazio.');
      saveTransformationConfigs();
    }
  } catch (error) {
    console.error('Erro ao carregar configurações de transformação:', error);
    transformationConfigs = [];
  }
}

// Função para salvar configurações de transformação no arquivo
function saveTransformationConfigs() {
  try {
    const configsPath = path.join(app.getPath('userData'), 'transformation-configs.json');
    
    // Verifica se o diretório existe e cria se necessário
    const dirPath = path.dirname(configsPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Diretório criado: ${dirPath}`);
    }
    
    // Cria um backup antes de salvar
    if (fs.existsSync(configsPath)) {
      const backupPath = configsPath + '.bak';
      fs.copyFileSync(configsPath, backupPath);
      console.log(`Backup criado: ${backupPath}`);
    }
    
    // Validar os dados antes de salvar
    const validConfigs = transformationConfigs.filter(config => {
      if (!config || typeof config !== 'object') {
        console.warn('Configuração inválida encontrada e removida:', config);
        return false;
      }
      
      if (!config.id || !config.name || !config.queryId) {
        console.warn('Configuração incompleta encontrada e removida:', config);
        return false;
      }
      
      return true;
    });
    
    // Salvar apenas as configurações válidas
    fs.writeFileSync(configsPath, JSON.stringify(validConfigs, null, 2), 'utf8');
    console.log(`Salvas ${validConfigs.length} configurações de transformação`);
    
    // Atualizar a variável global apenas com as configurações válidas
    transformationConfigs = validConfigs;
    
    return true;
  } catch (error) {
    console.error('Erro ao salvar configurações de transformação:', error);
    
    // Tentar recuperar do backup em caso de erro
    try {
      const configsPath = path.join(app.getPath('userData'), 'transformation-configs.json');
      const backupPath = configsPath + '.bak';
      
      if (fs.existsSync(backupPath)) {
        console.log('Tentando restaurar do backup...');
        fs.copyFileSync(backupPath, configsPath);
        
        // Recarregar as configurações do backup
        const backupData = fs.readFileSync(configsPath, 'utf8');
        transformationConfigs = JSON.parse(backupData);
        console.log(`Restauradas ${transformationConfigs.length} configurações do backup`);
        return true;
      }
    } catch (backupError) {
      console.error('Erro ao recuperar do backup:', backupError);
    }
    
    return false;
  }
}

// Modificar a função que executa consultas para salvar dados originais e transformados
async function executeQueryWithTransformTracking(queryId, configId = null) {
  console.log(`[Transform] Iniciando execução de consulta ${queryId} ${configId ? `com configuração ${configId}` : 'sem configuração'}`);
  console.log(`[Transform] Tipo do queryId: ${typeof queryId}, valor: ${queryId}`);
  
  // Garantir que queryId seja um número
  const numericQueryId = typeof queryId === 'string' ? parseInt(queryId, 10) : Number(queryId);
  
  if (isNaN(numericQueryId)) {
    console.error(`[Transform] queryId inválido, não é um número: ${queryId} (${typeof queryId})`);
    throw new Error(`ID de consulta inválido: ${queryId}`);
  }
  
  // Usar o ID numérico daqui em diante
  queryId = numericQueryId;
  console.log(`[Transform] Usando queryId (após conversão): ${queryId} (${typeof queryId})`);
  
  try {
    // Executar a consulta
    const query = await database.getQueryById(queryId);
    if (!query) {
      console.error(`[Transform] Consulta ID ${queryId} não encontrada`);
      throw new Error(`Consulta ID ${queryId} não encontrada`);
    }
    
    // Log de diagnóstico
    console.log(`[Transform] Detalhes da consulta:
    - ID: ${query.id}
    - Nome: ${query.nome}
    - Conexão ID: ${query.conexao_id}
    - Tipo: ${typeof query.conexao_id}`);
    
    // Validar a consulta SQL
    const sqlQuery = query.query || query.sql;
    if (!sqlQuery || typeof sqlQuery !== 'string') {
      console.error(`[Transform] Consulta SQL inválida:`, sqlQuery);
      throw new Error(`Consulta SQL inválida ou vazia, revise a consulta: ${JSON.stringify(query)}`);
    }
    
    console.log(`[Transform] Consulta SQL a ser executada: "${sqlQuery.substring(0, 100)}..."`);
    
    // Obter a conexão
    let conexaoId = query.conexao_id;
    
    // Garantir que o conexao_id é um número
    if (typeof conexaoId === 'string') {
      console.warn(`[Transform] conexao_id é string, convertendo para número: ${conexaoId}`);
      conexaoId = parseInt(conexaoId, 10);
      
      if (isNaN(conexaoId)) {
        console.error(`[Transform] Erro ao converter conexao_id para número: ${query.conexao_id}`);
        throw new Error(`ID de conexão inválido: ${query.conexao_id}`);
      }
    } else if (typeof conexaoId === 'object') {
      // Se for um objeto, provavelmente é um erro - verificar se tem uma propriedade id
      console.error(`[Transform] conexao_id é um objeto em vez de um número: ${JSON.stringify(conexaoId)}`);
      
      if (conexaoId && typeof conexaoId.id === 'number') {
        console.warn(`[Transform] Usando conexaoId.id que é um número: ${conexaoId.id}`);
        conexaoId = conexaoId.id;
      } else {
        // Tentar converter toString e depois para int
        const stringId = String(conexaoId);
        const numberId = parseInt(stringId, 10);
        
        if (!isNaN(numberId)) {
          console.warn(`[Transform] Convertido objeto para número: ${numberId}`);
          conexaoId = numberId;
        } else {
          throw new Error(`ID de conexão inválido (objeto): ${JSON.stringify(conexaoId)}`);
        }
      }
    } else if (typeof conexaoId !== 'number') {
      console.error(`[Transform] conexao_id tem tipo inválido: ${typeof conexaoId}, valor: ${conexaoId}`);
      throw new Error(`ID de conexão tem formato inválido: ${conexaoId} (${typeof conexaoId})`);
    }
    
    // Log adicional para debug
    console.log(`[Transform] ID da conexão final (após conversão): ${conexaoId} (${typeof conexaoId})`);
    
    const connection = await database.getConnectionById(conexaoId);
    if (!connection) {
      console.error(`[Transform] Conexão ID ${conexaoId} não encontrada`);
      throw new Error(`Conexão ID ${conexaoId} não encontrada`);
    }
    
    // Executar a consulta SQL
    console.log(`[Transform] Executando consulta na conexão ${connection.nome}`);
    const resultado = await odbcService.executeQuery(connection, sqlQuery);
    
    // Verificar se o resultado é válido
    if (!resultado || !Array.isArray(resultado) || resultado.length === 0) {
      console.warn(`[Transform] A consulta não retornou dados`);
      throw new Error(`A consulta não retornou dados. Verifique se a consulta está correta.`);
    }
    
    // Salvar os dados originais antes da transformação
    const originalData = [...resultado]; // Clone dos dados originais
    console.log(`[Transform] Dados originais: ${resultado.length} registros`);
    
    // Verificar estrutura do primeiro registro para diagnóstico
    if (resultado.length > 0) {
      console.log(`[Transform] Estrutura do primeiro registro:`, Object.keys(resultado[0]));
    }
    
    // Buscar a configuração de transformação, se fornecida
    let transformConfig = null;
    if (configId) {
      transformConfig = transformationConfigs.find(config => config.id === configId);
      if (!transformConfig) {
        console.warn(`[Transform] Configuração de transformação ID ${configId} não encontrada`);
      } else {
        console.log(`[Transform] Usando configuração de transformação: ${transformConfig.name}`);
        console.log(`[Transform] Colunas configuradas:`, Object.keys(transformConfig)
          .filter(key => typeof transformConfig[key] === 'object' && transformConfig[key] !== null));
      }
    }
    
    // Transformar dados usando a configuração de transformação ou método padrão
    let transformedData;
    
    if (transformConfig) {
      // Aplicar a configuração de transformação personalizada
      transformedData = resultado.map(row => {
        const newRow = {};
        
        // Primeiro passo: verificar se a configuração é válida
        if (!transformConfig || typeof transformConfig !== 'object') {
          console.error('[Transform] Configuração de transformação inválida:', transformConfig);
          // Se a configuração for inválida, retornar o objeto original
          return { ...row };
        }
        
        // Percorrer as colunas originais e aplicar as transformações configuradas
        Object.keys(row).forEach(colName => {
          // Verificar se existe configuração para esta coluna e se deve ser incluída
          if (transformConfig[colName] && transformConfig[colName].includeInOutput) {
            const colConfig = transformConfig[colName];
            const targetName = colConfig.targetName || colName.toLowerCase();
            let value = row[colName];
            
            // Aplicar transformação conforme o tipo configurado
            switch(colConfig.transformType) {
              case 'lowercase':
                value = typeof value === 'string' ? value.toLowerCase() : value;
                break;
              case 'uppercase':
                value = typeof value === 'string' ? value.toUpperCase() : value;
                break;
              case 'capitalize':
                value = typeof value === 'string' 
                  ? (value.charAt(0).toUpperCase() + value.slice(1).toLowerCase())
                  : value;
                break;
              case 'trim':
                value = typeof value === 'string' ? value.trim() : value;
                break;
              case 'number':
                value = parseFloat(value);
                value = isNaN(value) ? 0 : value;
                break;
              case 'boolean':
                if (typeof value === 'boolean') {
                  // Já é boolean, manter
                } else if (typeof value === 'string') {
                  value = ['true', 'sim', 's', 'yes', 'y', '1'].includes(value.toLowerCase());
                } else {
                  value = Boolean(value);
                }
                break;
              case 'date':
                try {
                  if (value) {
                    const date = new Date(value);
                    value = date.toISOString();
                  } else {
                    value = null;
                  }
                } catch (e) {
                  console.error(`[Transform] Erro ao transformar data:`, e);
                  value = null;
                }
                break;
              // Para 'none' ou 'custom', mantém o valor original
            }
            
            // Adicionar ao novo objeto
            newRow[targetName] = value;
          }
        });
        
        // Se não houver colunas incluídas na saída, usar todas as colunas originais
        if (Object.keys(newRow).length === 0) {
          console.warn('[Transform] Nenhuma coluna configurada para saída. Usando todas as colunas originais.');
          Object.keys(row).forEach(key => {
            newRow[key.toLowerCase()] = row[key];
          });
        }
        
        return newRow;
      });
      
      console.log(`[Transform] Dados transformados usando configuração personalizada`);
    } else {
      // Transformação padrão (simples)
      transformedData = resultado.map(row => {
        // Transformação básica - coloca todas as chaves em minúsculas
        const transformed = {};
        Object.entries(row).forEach(([key, value]) => {
          transformed[key.toLowerCase()] = value;
        });
        return transformed;
      });
      
      console.log(`[Transform] Dados transformados usando método padrão`);
    }
    
    // Salvar na lista de transformações recentes (limita a 5 itens)
    const transformationInfo = {
      id: Date.now().toString(), // Usando string para compatibilidade
      query_id: queryId,
      query_name: query.nome,
      timestamp: new Date().toISOString(),
      originalData,
      transformedData,
      rowCount: resultado.length,
      configId: transformConfig ? transformConfig.id : null,
      configName: transformConfig ? transformConfig.name : null
    };
    
    recentTransformations.unshift(transformationInfo);
    if (recentTransformations.length > 5) {
      recentTransformations.pop(); // Manter apenas os 5 mais recentes
    }
    
    // Continuar com o processamento normal
    console.log(`[Transform] Consulta retornou ${resultado.length} registros. Enviando para API...`);
    
    // Retornar os dados transformados para o processamento normal
    return transformedData;
  } catch (error) {
    console.error('[Transform] Erro ao executar consulta com rastreamento:', error);
    throw error;
  }
}

// Função para diagnosticar e corrigir possíveis problemas
async function autoRepairCommonIssues() {
  console.log('Iniciando verificação e reparo automático de problemas comuns...');
  
  try {
    // Verificar e corrigir problema de consistência de IDs nas configurações
    let fixed = false;
    transformationConfigs = transformationConfigs.map(config => {
      if (config.id && typeof config.id === 'number') {
        console.log(`Corrigindo ID numérico em configuração: ${config.name} (${config.id})`);
        fixed = true;
        return { ...config, id: config.id.toString() };
      }
      return config;
    });
    
    if (fixed) {
      console.log('IDs numéricos corrigidos para string nas configurações');
      saveTransformationConfigs();
    }
    
    // Verificar e corrigir problema de handlers IPC ausentes
    ensureTemplateHandlers();
    
    // Outras verificações existentes...
    
    console.log('Verificação e reparo de problemas concluído com sucesso!');
    return true;
  } catch (error) {
    console.error('Erro durante verificação e reparo:', error);
    return false;
  }
}

// Variáveis globais para armazenar configurações de transformação e templates
let transformTemplates = [];
let ipcHandlersRegistered = false; // Flag para controlar o registro dos handlers

// Função para garantir que os handlers de templates estejam registrados
function ensureTemplateHandlers() {
  console.log('Verificando handlers IPC para templates...');
  
  // Verificar se os handlers realmente estão registrados (mais detalhado)
  const requiredHandlers = [
    'get-transform-templates',
    'create-transform-template', 
    'apply-transform-template',
    'delete-transform-template'
  ];
  
  // Verificar quais handlers estão faltando
  const missingHandlers = [];
  requiredHandlers.forEach(handler => {
    // Verificar tanto o eventNames quanto diretamente se o handler existe
    if (!ipcMain.eventNames().includes(handler) || !ipcMain._handlers || !ipcMain._handlers.has(handler)) {
      missingHandlers.push(handler);
    }
  });
  
  if (missingHandlers.length > 0) {
    console.log(`Registrando handlers IPC ausentes: ${missingHandlers.join(', ')}`);
    
    // Remover handlers existentes para evitar duplicação
    requiredHandlers.forEach(handler => {
      try {
        ipcMain.removeHandler(handler);
      } catch (e) {
        // Ignora erro se o handler não existir
      }
    });
    
    // Registrar todos os handlers novamente
    registerTemplateHandlers();
    
    // Verificação adicional para create-transform-template especificamente
    if (missingHandlers.includes('create-transform-template')) {
      try {
        console.log('Verificação especial para create-transform-template...');
        
        // Verificar se já existe e remover para garantir
        ipcMain.removeHandler('create-transform-template');
        
        // Registrar novamente o handler específico
        ipcMain.handle('create-transform-template', async (e, { configId, templateName }) => {
          try {
            console.log(`[IPC] create-transform-template para config ID: ${configId}, nome: ${templateName}`);
            
            if (!configId) {
              return { success: false, message: 'ID da configuração não fornecido' };
            }
            
            if (!templateName) {
              return { success: false, message: 'Nome do template não fornecido' };
            }
            
            // Garantir que a lista de configurações esteja carregada
            if (transformationConfigs.length === 0) {
              console.log('[IPC] Lista de configurações vazia, tentando recarregar...');
              loadTransformationConfigs();
            }
            
            // Encontrar a configuração original
            const sourceConfig = transformationConfigs.find(c => c.id === configId);
            
            if (!sourceConfig) {
              console.error(`[IPC] Configuração ID ${configId} não encontrada`);
              return { 
                success: false, 
                message: `Configuração com ID ${configId} não encontrada`,
                availableConfigs: transformationConfigs.map(c => ({ id: c.id, name: c.name }))
              };
            }
            
            // Criar objeto de template, removendo ID da consulta e outros dados específicos
            const templateData = {};
            
            // Copiar apenas os dados de mapeamento e transformação, ignorando metadados específicos da consulta
            Object.keys(sourceConfig).forEach(key => {
              // Ignorar ID e queryId
              if (key !== 'id' && key !== 'queryId') {
                // Se for objeto de mapeamento de coluna (tem targetName, transformType, etc.)
                if (typeof sourceConfig[key] === 'object' && sourceConfig[key] && sourceConfig[key].targetName) {
                  templateData[key] = { ...sourceConfig[key] };
                } else if (key === 'name') {
                  // Não copiar o nome, usar o novo nome do template
                } else {
                  // Copiar outros campos
                  templateData[key] = sourceConfig[key];
                }
              }
            });
            
            // Criar novo ID único
            const templateId = Date.now().toString();
            
            // Criar e salvar o novo template
            const newTemplate = {
              id: templateId,
              name: templateName,
              createdAt: new Date().toISOString(),
              sourceConfigId: configId,
              sourceName: sourceConfig.name,
              template: templateData
            };
            
            transformTemplates.push(newTemplate);
            const saveResult = saveTransformTemplates();
            
            return { 
              success: saveResult, 
              message: saveResult ? 'Template criado com sucesso' : 'Template criado mas houve erro ao salvar',
              data: newTemplate
            };
          } catch (error) {
            console.error('[IPC] Erro ao criar template:', error);
            return { 
              success: false, 
              message: `Erro ao criar template: ${error.message}`,
              error: error.toString()
            };
          }
        });
        
        console.log('Handler create-transform-template registrado manualmente com sucesso');
      } catch (e) {
        console.error('Erro ao registrar handler create-transform-template manualmente:', e);
      }
    }
    
    return true;
  }
  
  return false;
}

// Função dedicada para registrar todos os handlers de templates
function registerTemplateHandlers() {
  console.log('Registrando handlers IPC para templates...');
  
  // Verificar se os handlers já estão registrados
  if (ipcHandlersRegistered) {
    console.log('Handlers já registrados, removendo primeiro...');
    try {
      ipcMain.removeHandler('get-transform-templates');
      ipcMain.removeHandler('create-transform-template');
      ipcMain.removeHandler('apply-transform-template');
      ipcMain.removeHandler('delete-transform-template');
    } catch (e) {
      console.warn('Erro ao remover handlers:', e);
    }
  }
  
  // Handler para listar templates disponíveis
  ipcMain.handle('get-transform-templates', async () => {
    try {
      console.log('[IPC] get-transform-templates chamado, retornando', transformTemplates.length, 'templates');
      return {
        success: true,
        data: transformTemplates
      };
    } catch (error) {
      console.error('[IPC] Erro ao obter templates:', error);
      return { 
        success: false, 
        message: `Erro ao obter templates: ${error.message}`,
        error: error.toString()
      };
    }
  });

  // Handler para criar um template a partir de uma configuração existente
  ipcMain.handle('create-transform-template', async (e, { configId, templateName }) => {
    try {
      console.log(`[IPC] create-transform-template para config ID: ${configId}, nome: ${templateName}`);
      
      if (!configId) {
        return { success: false, message: 'ID da configuração não fornecido' };
      }
      
      if (!templateName) {
        return { success: false, message: 'Nome do template não fornecido' };
      }
      
      // Garantir que a lista de configurações esteja carregada
      if (transformationConfigs.length === 0) {
        console.log('[IPC] Lista de configurações vazia, tentando recarregar...');
        loadTransformationConfigs();
      }
      
      // Encontrar a configuração original
      const sourceConfig = transformationConfigs.find(c => c.id === configId);
      
      if (!sourceConfig) {
        console.error(`[IPC] Configuração ID ${configId} não encontrada`);
        return { 
          success: false, 
          message: `Configuração com ID ${configId} não encontrada`,
          availableConfigs: transformationConfigs.map(c => ({ id: c.id, name: c.name }))
        };
      }
      
      // Criar objeto de template, removendo ID da consulta e outros dados específicos
      const templateData = {};
      
      // Copiar apenas os dados de mapeamento e transformação, ignorando metadados específicos da consulta
      Object.keys(sourceConfig).forEach(key => {
        // Ignorar ID e queryId
        if (key !== 'id' && key !== 'queryId') {
          // Se for objeto de mapeamento de coluna (tem targetName, transformType, etc.)
          if (typeof sourceConfig[key] === 'object' && sourceConfig[key] && sourceConfig[key].targetName) {
            templateData[key] = { ...sourceConfig[key] };
          } else if (key === 'name') {
            // Não copiar o nome, usar o novo nome do template
          } else {
            // Copiar outros campos
            templateData[key] = sourceConfig[key];
          }
        }
      });
      
      // Criar novo ID único
      const templateId = Date.now().toString();
      
      // Criar e salvar o novo template
      const newTemplate = {
        id: templateId,
        name: templateName,
        createdAt: new Date().toISOString(),
        sourceConfigId: configId,
        sourceName: sourceConfig.name,
        template: templateData
      };
      
      transformTemplates.push(newTemplate);
      const saveResult = saveTransformTemplates();
      
      return { 
        success: saveResult, 
        message: saveResult ? 'Template criado com sucesso' : 'Template criado mas houve erro ao salvar',
        data: newTemplate
      };
    } catch (error) {
      console.error('[IPC] Erro ao criar template:', error);
      return { 
        success: false, 
        message: `Erro ao criar template: ${error.message}`,
        error: error.toString()
      };
    }
  });

  // Handler para aplicar um template a uma consulta
  ipcMain.handle('apply-transform-template', async (e, { templateId, queryId, newConfigName }) => {
    try {
      console.log(`[IPC] apply-transform-template: template ${templateId} para consulta ${queryId}`);
      
      if (!templateId) {
        return { success: false, message: 'ID do template não fornecido' };
      }
      
      if (!queryId) {
        return { success: false, message: 'ID da consulta não fornecido' };
      }
      
      // Garantir que a lista de templates esteja carregada
      if (transformTemplates.length === 0) {
        console.log('[IPC] Lista de templates vazia, tentando recarregar...');
        loadTransformTemplates();
      }
      
      // Verificar se a consulta existe
      let query;
      try {
        query = await database.getQuery(queryId);
      } catch (dbError) {
        console.error(`[IPC] Erro ao buscar consulta ID ${queryId}:`, dbError);
        return { 
          success: false, 
          message: `Erro ao buscar consulta: ${dbError.message}`,
          error: dbError.toString()
        };
      }
      
      if (!query) {
        return { success: false, message: `Consulta ID ${queryId} não encontrada` };
      }
      
      // Encontrar o template
      const template = transformTemplates.find(t => t.id === templateId);
      if (!template) {
        return { 
          success: false, 
          message: `Template ID ${templateId} não encontrado`,
          availableTemplates: transformTemplates.map(t => ({ id: t.id, name: t.name }))
        };
      }
      
      // Criar nova configuração baseada no template
      const newConfigId = Date.now().toString();
      const newConfig = {
        id: newConfigId,
        queryId: queryId,
        name: newConfigName || `${template.name} (Aplicado)`,
        createdAt: new Date().toISOString(),
        sourceTemplateId: templateId,
        ...JSON.parse(JSON.stringify(template.template))
      };
      
      // Adicionar à lista de configurações
      transformationConfigs.push(newConfig);
      const saveResult = saveTransformationConfigs();
      
      return {
        success: saveResult,
        message: saveResult ? 'Template aplicado com sucesso' : 'Template aplicado mas houve erro ao salvar',
        data: newConfig
      };
    } catch (error) {
      console.error('[IPC] Erro ao aplicar template:', error);
      return { 
        success: false, 
        message: `Erro ao aplicar template: ${error.message}`,
        error: error.toString()
      };
    }
  });

  // Handler para excluir um template
  ipcMain.handle('delete-transform-template', async (e, templateId) => {
    try {
      console.log(`[IPC] delete-transform-template: ${templateId}`);
      
      if (!templateId) {
        return { success: false, message: 'ID do template não fornecido' };
      }
      
      // Garantir que a lista de templates esteja carregada
      if (transformTemplates.length === 0) {
        console.log('[IPC] Lista de templates vazia, tentando recarregar...');
        loadTransformTemplates();
      }
      
      // Verificar se o template existe
      const templateIndex = transformTemplates.findIndex(t => t.id === templateId);
      if (templateIndex === -1) {
        return { 
          success: false, 
          message: `Template ID ${templateId} não encontrado`,
          availableTemplates: transformTemplates.map(t => ({ id: t.id, name: t.name }))
        };
      }
      
      // Remover o template
      transformTemplates.splice(templateIndex, 1);
      const saveResult = saveTransformTemplates();
      
      return {
        success: saveResult,
        message: saveResult ? 'Template excluído com sucesso' : 'Template excluído mas houve erro ao salvar'
      };
    } catch (error) {
      console.error('[IPC] Erro ao excluir template:', error);
      return { 
        success: false, 
        message: `Erro ao excluir template: ${error.message}`,
        error: error.toString()
      };
    }
  });
  
  ipcHandlersRegistered = true;
  console.log('Handlers de templates registrados com sucesso!');
}

// Modificar a função de inicialização para garantir que os handlers estejam sempre registrados
app.whenReady().then(() => {
  console.log('Iniciando aplicativo CLI-TRAY...');
  
  // Carregar configurações e templates primeiro
  console.log('Carregando configurações de transformação...');
  loadTransformationConfigs();
  
  console.log('Carregando templates de transformação...');
  loadTransformTemplates();
  
  // Garantir que os handlers de templates estejam registrados desde o início
  ensureTemplateHandlers();
  
  // Verificar e reparar problemas comuns
  autoRepairCommonIssues()
    .then(() => {
      console.log('Verificação e reparo de problemas concluída');
      
      // Verificação específica dos handlers de templates
      repairTemplateHandlers()
        .then(isOk => {
          console.log('Verificação de handlers de template:', isOk ? 'OK' : 'Corrigido');
          
          // Inicialização normal
          createWindow();
          createTray();
          
          // Inicializar handlers IPC gerais
          setupIPCHandlers();
          
          // Garantir novamente que os handlers específicos estão registrados
          setTimeout(() => {
            ensureTemplateHandlers();
            console.log('Handlers IPC verificados após inicialização');
          }, 2000);
        })
        .catch(err => {
          console.error('Erro ao verificar handlers de template:', err);
          
          // Continuar com a inicialização mesmo com erros
          createWindow();
          createTray();
          setupIPCHandlers();
          
          // Garantir novamente que os handlers específicos estão registrados
          setTimeout(() => {
            ensureTemplateHandlers();
            console.log('Handlers IPC verificados após inicialização com erro');
          }, 2000);
        });
    })
    .catch(error => {
      console.error('Erro durante a inicialização:', error);
      
      // Tentar inicializar mesmo com erros de reparo
      loadTransformationConfigs();
      loadTransformTemplates();
      createWindow();
      createTray();
      setupIPCHandlers();
      
      // Garantir novamente que os handlers específicos estão registrados
      setTimeout(() => {
        ensureTemplateHandlers();
        console.log('Handlers IPC verificados após inicialização com erro');
      }, 2000);
    });
});

// Função para carregar templates de transformação
function loadTransformTemplates() {
  try {
    console.log('Carregando templates de transformação...');
    const templatesPath = path.join(app.getPath('userData'), 'transform-templates.json');
    
    if (fs.existsSync(templatesPath)) {
      try {
        const templatesData = fs.readFileSync(templatesPath, 'utf8');
        let templates;
        
        try {
          templates = JSON.parse(templatesData);
        } catch (parseError) {
          console.error('Erro ao fazer parse do JSON de templates:', parseError);
          console.log('Tentando recuperar do backup...');
          
          // Tentar recuperar do backup se houver erro de parse
          const backupPath = templatesPath + '.bak';
          if (fs.existsSync(backupPath)) {
            try {
              const backupData = fs.readFileSync(backupPath, 'utf8');
              templates = JSON.parse(backupData);
              console.log('Templates recuperados com sucesso do backup');
            } catch (backupError) {
              console.error('Erro ao recuperar do backup:', backupError);
              transformTemplates = [];
              return;
            }
          } else {
            console.warn('Backup não encontrado, iniciando com lista vazia');
            transformTemplates = [];
            return;
          }
        }
        
        if (!Array.isArray(templates)) {
          console.error('Formato inválido de templates: não é um array');
          transformTemplates = [];
          return;
        }
        
        // Filtrar templates válidos
        const validTemplates = templates.filter(template => {
          if (!template || typeof template !== 'object') {
            console.warn('Ignorando template inválido:', template);
            return false;
          }
          
          if (!template.id || !template.name || !template.template) {
            console.warn('Ignorando template incompleto:', template);
            return false;
          }
          
          return true;
        });
        
        transformTemplates = validTemplates;
        console.log(`Carregados ${validTemplates.length} templates de transformação`);
      } catch (fileError) {
        console.error('Erro ao ler arquivo de templates:', fileError);
        transformTemplates = [];
      }
    } else {
      transformTemplates = [];
      console.log('Nenhum template de transformação encontrado. Criando arquivo vazio.');
      saveTransformTemplates(); // Criar arquivo vazio
    }
  } catch (error) {
    console.error('Erro ao carregar templates de transformação:', error);
    transformTemplates = [];
  }
  
  // Garantir que os handlers IPC estejam registrados após o carregamento
  ensureTemplateHandlers();
}

// Função para diagnosticar e corrigir problemas relacionados a templates
async function repairTemplateHandlers() {
  console.log('Verificando handlers IPC para templates...');
  
  const result = ensureTemplateHandlers();
  return !result; // Retorna true se não precisou corrigir nada
}

function setupIPCHandlers() {
  console.log('Registrando handlers IPC...');
  
  // ... existing code ...
  
  // Handler para forçar registro de handlers
  ipcMain.handle('force-register-handlers', async () => {
    try {
      console.log('[IPC] Forçando registro de handlers');
      
      // Garantir que os handlers de templates estejam registrados
      const fixed = ensureTemplateHandlers();
      
      return {
        success: true,
        message: fixed ? 'Handlers registrados novamente com sucesso' : 'Handlers já estavam registrados',
        fixed: fixed
      };
    } catch (error) {
      console.error('[IPC] Erro ao forçar registro de handlers:', error);
      return { 
        success: false, 
        message: `Erro ao forçar registro de handlers: ${error.message}`,
        error: error.toString()
      };
    }
  });
  
  // ... existing code ...
  
  // Registrar handlers de templates específicos
  registerTemplateHandlers();
  
  console.log('Todos os handlers IPC registrados com sucesso.');
}

// Função para salvar templates de transformação
function saveTransformTemplates() {
  try {
    console.log(`Salvando ${transformTemplates.length} templates de transformação...`);
    const templatesPath = path.join(app.getPath('userData'), 'transform-templates.json');
    
    // Fazer backup do arquivo existente antes de sobrescrever
    if (fs.existsSync(templatesPath)) {
      try {
        // Criar backup com timestamp na primeira vez
        const backupPath = templatesPath + '.bak';
        fs.copyFileSync(templatesPath, backupPath);
        console.log('Backup de templates criado em:', backupPath);
      } catch (backupError) {
        console.error('Erro ao criar backup de templates:', backupError);
        // Continuar mesmo com erro de backup
      }
    }
    
    // Salvar os dados atualizados
    const templatesJson = JSON.stringify(transformTemplates, null, 2);
    fs.writeFileSync(templatesPath, templatesJson, 'utf8');
    console.log('Templates salvos com sucesso em:', templatesPath);
    return true;
  } catch (error) {
    console.error('Erro ao salvar templates de transformação:', error);
    return false;
  }
}