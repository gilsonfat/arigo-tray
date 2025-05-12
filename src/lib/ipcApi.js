// src/lib/ipcApi.js

const { ipcRenderer } = window.electron;

const logApiError = (method, error) => {
  console.error(`Erro na chamada API "${method}":`, error);
  // Tenta extrair uma mensagem mais útil do erro, se possível
  const message = error?.message || 'Ocorreu um erro inesperado. Verifique os logs do console.';
  return { success: false, message };
};

const invokeIpc = (channel, ...args) => {
  console.log(`Invocando canal IPC: ${channel}`, args);
  return ipcRenderer.invoke(channel, ...args);
};

// --- Home / Sincronização ---
export const syncAll = () => invokeIpc('sync-all');
export const forceSync = () => invokeIpc('force-sync');


// --- Conexões ODBC ---
export const getConnections = () => invokeIpc('get-connections');
export const getConnection = (id) => invokeIpc('get-connection', id);
export const createConnection = (data) => invokeIpc('create-connection', data);
export const updateConnection = (id, data) => invokeIpc('update-connection', id, data);
export const deleteConnection = (id) => invokeIpc('delete-connection', id);
// Passamos os dados da conexão diretamente para teste, sem salvar
export const testConnection = (connectionData) => invokeIpc('test-connection', connectionData);
export const diagnoseConnection = (connectionId) => invokeIpc('diagnose-connection', connectionId);
export const getOdbcDrivers = () => invokeIpc('get-odbc-drivers');


// --- Consultas SQL ---
export const getQueries = () => invokeIpc('get-queries');
export const getQuery = (id) => invokeIpc('get-query', id);
export const createQuery = (data) => invokeIpc('create-query', data);
export const updateQuery = (id, data) => invokeIpc('update-query', id, data);
export const deleteQuery = (id) => invokeIpc('delete-query', id);
// Passa o SQL e o ID da conexão para teste
export const testQuery = (sql, connectionId) => {
  console.log(`[ipcApi] Testando consulta SQL:`, sql, `na conexão ID:`, connectionId);
  return ipcRenderer.invoke('test-query', sql, connectionId);
};
// Executa uma consulta salva pelo seu ID
export const executeQuery = (id) => invokeIpc('execute-query', id);


// --- Tarefas Agendadas ---
export const getTasks = () => invokeIpc('get-tasks');
export const getTask = (id) => invokeIpc('get-task', id);
export const createTask = (data) => invokeIpc('create-task', data);
export const updateTask = (id, data) => invokeIpc('update-task', id, data);
export const deleteTask = (id) => invokeIpc('delete-task', id);
// Adiciona função para executar uma tarefa específica agora
export const executeTask = (id) => invokeIpc('execute-task', id); 