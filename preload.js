const { ipcRenderer, contextBridge } = require('electron');

// Expor API para a janela de configuração
contextBridge.exposeInMainWorld('sqlTrayApi', {
  // Configurações
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // Gerenciamento de consultas agendadas
  getScheduledQueries: () => ipcRenderer.invoke('get-scheduled-queries'),
  addScheduledQuery: (query) => ipcRenderer.invoke('add-scheduled-query', query),
  updateScheduledQuery: (query) => ipcRenderer.invoke('update-scheduled-query', query),
  removeScheduledQuery: (queryId) => ipcRenderer.invoke('remove-scheduled-query', queryId),
  
  // Executar consulta
  runQueryNow: (queryId) => ipcRenderer.invoke('run-query-now', queryId),
  
  // Diálogos de arquivos
  selectDestinationFile: () => ipcRenderer.invoke('select-destination-file'),
  
  // Teste de conexão
  testConnection: (connectionString) => ipcRenderer.invoke('test-connection', connectionString),
  
  // Testar conexão com a API
  testApiConnection: (apiUrl, apiKey) => ipcRenderer.invoke('test-api-connection', apiUrl, apiKey),
  
  // Abrir pasta de logs
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder')
}); 