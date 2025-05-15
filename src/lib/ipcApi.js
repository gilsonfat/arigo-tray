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
  
  // Verificar se o último argumento contém opções de timeout
  let timeoutMs = 15000; // 15 segundos de timeout padrão
  let onTimeout = null;
  
  // Extrair o último argumento se for opções de timeout
  const lastArg = args.length > 0 ? args[args.length - 1] : null;
  if (lastArg && typeof lastArg === 'object' && lastArg.timeoutMs) {
    timeoutMs = lastArg.timeoutMs;
    onTimeout = lastArg.onTimeout;
    console.log(`[ipcApi] Usando timeout personalizado de ${timeoutMs}ms para canal ${channel}`);
    
    // Remover o último argumento se for opções de timeout
    // para não enviá-lo ao processo principal
    if (channel === 'diagnose-connection') {
      args = args.slice(0, args.length - 1);
    }
  }
  
  // Criar Promise com timeout para evitar espera infinita
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error(`Timeout após ${timeoutMs}ms ao invocar ${channel}`);
      if (onTimeout && typeof onTimeout === 'function') {
        onTimeout();
      }
      reject(error);
    }, timeoutMs);
  });
  
  const ipcPromise = ipcRenderer.invoke(channel, ...args)
    .then(result => {
      if (channel === 'create-task' || channel === 'update-task') {
        console.log(`Resultado de ${channel}:`, result);
      }
      return result;
    })
    .catch(error => {
      console.error(`Erro ao invocar ${channel}:`, error);
      throw error;
    });
  
  // Retorna a primeira Promise a resolver/rejeitar (IPC ou timeout)
  return Promise.race([ipcPromise, timeoutPromise]);
};

// Estratégia de retry para chamadas IPC
const retryIPCCall = async (channelName, args = {}, maxRetries = 3) => {
  let lastError = null;
  
  // Aumentar o número de tentativas se for o canal create-transform-template
  const retryAttempts = channelName === 'create-transform-template' ? 5 : maxRetries;
  
  for (let attempt = 0; attempt <= retryAttempts; attempt++) {
    try {
      // Se não for a primeira tentativa, esperar com backoff exponencial
      if (attempt > 0) {
        const backoffTime = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s, 4s...
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        console.log(`Tentativa ${attempt} para ${channelName}...`);
      }
      
      // Verificação especial para o canal create-transform-template
      if (channelName === 'create-transform-template' && attempt > 0) {
        // Forçar o registro dos handlers antes
        try {
          console.log(`Forçando registro de handlers antes de tentar novamente ${channelName}...`);
          await window.electron.ipcRenderer.invoke('force-register-handlers');
          await new Promise(resolve => setTimeout(resolve, 200)); // Pequena pausa para registro
        } catch (registerError) {
          console.log('Erro ao forçar registro de handlers:', registerError);
          // Continuar mesmo com erro, tentando a chamada IPC
        }
      }
      
      // Tenta a chamada IPC
      const result = await window.electron.ipcRenderer.invoke(channelName, args);
      
      // Se a chamada não retornar erro
      return result;
    } catch (error) {
      console.error(`Erro na tentativa ${attempt} para ${channelName}:`, error);
      lastError = error;
      
      // Verifica se o erro é sobre canal não permitido
      if (error.message && error.message.includes('não permitido')) {
        console.log(`Canal ${channelName} não permitido, tentando forçar registro e aguardando...`);
        
        // Tentar forçar reinicialização do canal em qualquer tentativa para esse erro específico
        try {
          await window.electron.ipcRenderer.invoke('force-register-handlers');
          // Espera adicional para garantir que os handlers sejam registrados
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          console.log('Falha ao forçar registro de handlers:', e);
        }
      }
    }
  }
  
  // Se chegou aqui, todas as tentativas falharam
  throw lastError || new Error(`Falha ao invocar ${channelName} após ${retryAttempts} tentativas`);
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
export const diagnoseConnection = (connectionId) => {
  console.log('[ipcApi] Iniciando diagnóstico de conexão:', connectionId);
  
  // Definir um timeout maior para o diagnóstico (65 segundos)
  const timeoutOptions = {
    timeoutMs: 65000, // 65 segundos
    onTimeout: () => console.error('[ipcApi] Timeout ao diagnosticar conexão após 65 segundos')
  };
  
  return invokeIpc('diagnose-connection', connectionId, timeoutOptions)
    .then(result => {
      console.log('[ipcApi] Diagnóstico concluído com status:', result?.resultado?.status || 'desconhecido');
      return result;
    })
    .catch(error => {
      console.error('[ipcApi] Erro ao diagnosticar conexão:', error);
      
      // Tratamento específico para erro de clonagem de objeto
      if (error.message && error.message.includes('An object could not be cloned')) {
        console.error('[ipcApi] Erro de serialização detectado, retornando objeto de erro para o usuário');
        return {
          driver: { status: 'erro', mensagem: 'Erro de serialização', sugestao: '' },
          servidor: { status: 'erro', mensagem: 'Erro de serialização', sugestao: '' },
          credenciais: { status: 'erro', mensagem: 'Erro de serialização', sugestao: '' },
          banco: { status: 'erro', mensagem: 'Erro de serialização', sugestao: '' },
          resultado: { 
            status: 'erro', 
            mensagem: 'Erro ao processar informações do diagnóstico',
            sugestao: 'Contate o suporte técnico. Código de erro: OBJECT_CLONE_ERR'
          }
        };
      }
      
      // Tratamento específico para erro de timeout
      if (error.message && error.message.includes('Timeout após')) {
        console.error('[ipcApi] Erro de timeout detectado, retornando objeto de erro para o usuário');
        return {
          driver: { status: 'erro', mensagem: 'Timeout durante diagnóstico', sugestao: '' },
          servidor: { status: 'erro', mensagem: 'Timeout durante diagnóstico', sugestao: '' },
          credenciais: { status: 'erro', mensagem: 'Timeout durante diagnóstico', sugestao: '' },
          banco: { status: 'erro', mensagem: 'Timeout durante diagnóstico', sugestao: '' },
          resultado: { 
            status: 'erro', 
            mensagem: 'O diagnóstico demorou muito para ser concluído',
            sugestao: 'O servidor pode estar inacessível ou sobrecarregado. Verifique a conectividade de rede.'
          }
        };
      }
      
      throw error;
    });
};
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
export const executeQuery = (id, configId = null) => {
  // Garantir que o ID seja um número
  const queryId = typeof id === 'string' ? parseInt(id, 10) : Number(id);
  
  if (isNaN(queryId)) {
    console.error('[ipcApi] ID de consulta inválido:', id);
    return Promise.reject(new Error(`ID de consulta inválido: ${id}`));
  }
  
  console.log(`[ipcApi] Executando consulta ID ${queryId}${configId ? ` com configuração ${configId}` : ''}`);
  
  // Somente passar configId se for definido
  return configId 
    ? invokeIpc('execute-query', queryId, configId)
    : invokeIpc('execute-query', queryId);
};


// --- Tarefas Agendadas ---
export const getTasks = () => invokeIpc('get-tasks');
export const getTask = (id) => invokeIpc('get-task', id);
export const createTask = (data) => {
  console.log('[ipcApi] Enviando dados para criar tarefa:', JSON.stringify(data, null, 2));
  
  // Garantir que consulta_id seja um número
  if (data && data.consulta_id) {
    const numericId = parseInt(data.consulta_id, 10);
    if (!isNaN(numericId)) {
      data.consulta_id = numericId;
    } else {
      console.error('[ipcApi] Erro: consulta_id inválido:', data.consulta_id);
      return Promise.reject(new Error('ID da consulta inválido. Precisa ser um número.'));
    }
  } else {
    console.error('[ipcApi] Erro: consulta_id não fornecido');
    return Promise.reject(new Error('ID da consulta é obrigatório.'));
  }
  
  // Garantir que os campos obrigatórios existam
  if (!data.nome || !data.cron || !data.api_url) {
    console.error('[ipcApi] Erro: campos obrigatórios ausentes:', 
      { nome: !!data.nome, cron: !!data.cron, api_url: !!data.api_url });
    return Promise.reject(new Error('Todos os campos obrigatórios devem ser preenchidos.'));
  }
  
  console.log('[ipcApi] Dados validados, enviando para o processo principal...');
  return invokeIpc('create-task', data)
    .then(result => {
      console.log('[ipcApi] Resposta da criação de tarefa:', result);
      if (!result) {
        throw new Error('Nenhuma resposta recebida do servidor');
      }
      if (!result.success) {
        throw new Error(result.message || 'Erro ao criar tarefa');
      }
      return result;
    })
    .catch(error => {
      console.error('[ipcApi] Erro ao criar tarefa:', error);
      throw error;
    });
};

export const updateTask = (id, data) => {
  console.log('[ipcApi] Enviando dados para atualizar tarefa:', id, JSON.stringify(data, null, 2));
  
  // Garantir que consulta_id seja um número
  if (data && data.consulta_id) {
    const numericId = parseInt(data.consulta_id, 10);
    if (!isNaN(numericId)) {
      data.consulta_id = numericId;
    } else {
      console.error('[ipcApi] Erro: consulta_id inválido:', data.consulta_id);
      return Promise.reject(new Error('ID da consulta inválido. Precisa ser um número.'));
    }
  } else {
    console.error('[ipcApi] Erro: consulta_id não fornecido');
    return Promise.reject(new Error('ID da consulta é obrigatório.'));
  }
  
  // Garantir que ID seja um número
  if (!id || isNaN(parseInt(id, 10))) {
    console.error('[ipcApi] Erro: ID inválido:', id);
    return Promise.reject(new Error('ID de tarefa inválido.'));
  }
  
  console.log('[ipcApi] Dados validados, enviando para o processo principal...');
  return invokeIpc('update-task', id, data)
    .then(result => {
      console.log('[ipcApi] Resposta da atualização de tarefa:', result);
      if (!result) {
        throw new Error('Nenhuma resposta recebida do servidor');
      }
      if (!result.success) {
        throw new Error(result.message || 'Erro ao atualizar tarefa');
      }
      return result;
    })
    .catch(error => {
      console.error('[ipcApi] Erro ao atualizar tarefa:', error);
      throw error;
    });
};

export const deleteTask = (id) => invokeIpc('delete-task', id);
// Adiciona função para executar uma tarefa específica agora
export const executeTask = (id) => invokeIpc('execute-task', id);

// Funções de IPC para logs
export const getLogs = (options = {}) => {
  console.log('[ipcApi] Obtendo logs com opções:', options);
  return invokeIpc('get-logs', options)
    .then(result => {
      if (!result.success) {
        throw new Error(result.message || 'Erro ao obter logs');
      }
      return result.data;
    })
    .catch(error => {
      console.error('[ipcApi] Erro ao obter logs:', error);
      throw error;
    });
};

export const getLogCount = () => {
  console.log('[ipcApi] Obtendo contagem de logs');
  return invokeIpc('get-log-count')
    .then(result => {
      if (!result.success) {
        throw new Error(result.message || 'Erro ao obter contagem de logs');
      }
      return result.data;
    })
    .catch(error => {
      console.error('[ipcApi] Erro ao obter contagem de logs:', error);
      throw error;
    });
};

// Funções para visualizar transformações de dados
export const getTransformations = () => {
  console.log('[ipcApi] Obtendo lista de transformações recentes');
  return invokeIpc('get-transformations')
    .then(result => {
      if (!result.success) {
        throw new Error(result.message || 'Erro ao obter transformações');
      }
      return result.data;
    })
    .catch(error => {
      console.error('[ipcApi] Erro ao obter transformações:', error);
      throw error;
    });
};

export const getTransformation = (id) => {
  console.log('[ipcApi] Obtendo detalhes da transformação:', id);
  return invokeIpc('get-transformation', id)
    .then(result => {
      if (!result.success) {
        throw new Error(result.message || 'Erro ao obter detalhes da transformação');
      }
      return result.data;
    })
    .catch(error => {
      console.error('[ipcApi] Erro ao obter detalhes da transformação:', error);
      throw error;
    });
};

// Funções para gerenciar configurações de transformação
export const getTransformationConfigs = (queryId) => {
  console.log('[ipcApi] Obtendo configurações de transformação para a consulta:', queryId);
  return invokeIpc('get-transformation-configs', queryId)
    .then(result => {
      if (!result.success) {
        throw new Error(result.message || 'Erro ao obter configurações de transformação');
      }
      return result.data;
    })
    .catch(error => {
      console.error('[ipcApi] Erro ao obter configurações de transformação:', error);
      throw error;
    });
};

export const getTransformationConfig = (configId) => {
  console.log('[ipcApi] Obtendo configuração de transformação:', configId);
  return invokeIpc('get-transformation-config', configId)
    .then(result => {
      if (!result.success) {
        throw new Error(result.message || 'Erro ao obter configuração de transformação');
      }
      return result.data;
    })
    .catch(error => {
      console.error('[ipcApi] Erro ao obter configuração de transformação:', error);
      throw error;
    });
};

export const saveTransformationConfig = (config) => {
  console.log('[ipcApi] Salvando configuração de transformação:', config);
  return invokeIpc('save-transformation-config', config)
    .then(result => {
      if (!result.success) {
        throw new Error(result.message || 'Erro ao salvar configuração de transformação');
      }
      return result.data;
    })
    .catch(error => {
      console.error('[ipcApi] Erro ao salvar configuração de transformação:', error);
      throw error;
    });
};

export const deleteTransformationConfig = (configId) => {
  console.log('[ipcApi] Excluindo configuração de transformação:', configId);
  return invokeIpc('delete-transformation-config', configId)
    .then(result => {
      if (!result.success) {
        throw new Error(result.message || 'Erro ao excluir configuração de transformação');
      }
      return result.data;
    })
    .catch(error => {
      console.error('[ipcApi] Erro ao excluir configuração de transformação:', error);
      throw error;
    });
};

// Função para criar um template a partir de uma configuração existente
export const createTransformTemplate = async (configId, templateName) => {
  try {
    return await retryIPCCall('create-transform-template', { configId, templateName });
  } catch (error) {
    console.error('Erro ao criar template:', error);
    return {
      success: false,
      message: error.message || 'Erro ao criar template',
      error: error.toString()
    };
  }
};

// Função para listar templates disponíveis
export const getTransformTemplates = async () => {
  try {
    return await retryIPCCall('get-transform-templates');
  } catch (error) {
    console.error('Erro ao obter templates:', error);
    return {
      success: false,
      message: error.message || 'Erro ao obter templates',
      error: error.toString()
    };
  }
};

// Função para aplicar um template a uma consulta
export const applyTransformTemplate = async (templateId, queryId, newConfigName) => {
  try {
    return await retryIPCCall('apply-transform-template', { templateId, queryId, newConfigName });
  } catch (error) {
    console.error('Erro ao aplicar template:', error);
    return {
      success: false,
      message: error.message || 'Erro ao aplicar template',
      error: error.toString()
    };
  }
};

// Função para excluir um template
export const deleteTransformTemplate = async (templateId) => {
  try {
    return await retryIPCCall('delete-transform-template', templateId);
  } catch (error) {
    console.error('Erro ao excluir template:', error);
    return {
      success: false,
      message: error.message || 'Erro ao excluir template',
      error: error.toString()
    };
  }
}; 