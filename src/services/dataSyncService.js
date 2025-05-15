/**
 * Serviço de sincronização de dados
 * Realiza a sincronização entre os dados do banco local e a API externa
 */

const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { query, run, log } = require('./database');
const { executeQuery, formatResults } = require('./odbcService');

/**
 * Sincroniza dados entre o banco de dados local e a API externa
 */
async function syncData() {
  try {
    // Registra o início da sincronização
    await log('info', 'Iniciando sincronização de dados');
    
    // Obtém as configurações da API
    const config = await getApiConfig();
    if (!config.api_url || !config.api_key) {
      throw new Error('Configurações de API incompletas. Verifique a URL e a API Key.');
    }
    
    // Obtém as consultas SQL programadas para sincronização
    const queries = await getScheduledQueries();
    
    if (queries.length === 0) {
      console.log('Nenhuma consulta para sincronizar');
      return;
    }
    
    // Para cada consulta, executa e envia os dados para a API
    for (const queryConfig of queries) {
      await processSingleQuery(queryConfig, config);
    }
    
    // Atualiza o status de sincronização no banco local
    await run(
      'UPDATE configuracoes SET valor = ? WHERE chave = ?',
      [new Date().toISOString(), 'ultima_sincronizacao']
    );
    
    await log('info', 'Sincronização concluída com sucesso');
    return true;
  } catch (error) {
    await log('error', `Erro na sincronização: ${error.message}`);
    console.error('Erro na sincronização:', error);
    throw error;
  }
}

/**
 * Processa uma única consulta SQL e envia para a API
 * @param {Object} queryConfig - Configuração da consulta SQL
 * @param {Object} apiConfig - Configuração da API
 * @param {Object} taskConfig - Configuração da tarefa (opcional)
 */
async function processSingleQuery(queryConfig, apiConfig, taskConfig = null) {
  try {
    console.log(`Processando consulta: ${queryConfig.nome}`);
    
    // Executa a consulta SQL no banco de dados via ODBC
    const results = await executeQuery(queryConfig.conexao_id, queryConfig.query);
    
    // Verifica se temos resultados
    if (!results || results.length === 0) {
      console.log(`Nenhum resultado para a consulta: ${queryConfig.nome}`);
      await log('info', `Nenhum resultado para a consulta: ${queryConfig.nome}`);
      return {
        queryName: queryConfig.nome,
        recordCount: 0,
        message: 'Nenhum resultado encontrado'
      };
    }
    
    // Log detalhado dos dados consultados (limitando a exibição para não sobrecarregar os logs)
    console.log(`[DEBUG] Consulta ${queryConfig.nome} - Dados consultados (${results.length} registros):`);
    console.log(JSON.stringify(results.slice(0, 2), null, 2)); // Exibe apenas os 2 primeiros registros
    await log('debug', `Consulta ${queryConfig.nome} retornou ${results.length} registros.`);
    
    // Formata os resultados no formato especificado
    // Adicionado suporte para transformação de dados se a consulta tiver um tipo de transformação
    const formattedData = formatResults(
      results, 
      queryConfig.formato_saida, 
      queryConfig.transform_type // Pode ser 'terceiros', 'produtos', etc. ou null
    );
    
    // Log detalhado da transformação aplicada
    console.log(`[DEBUG] Consulta ${queryConfig.nome} - Dados após transformação (${queryConfig.transform_type || 'nenhuma'}):`);
    const sampleData = Array.isArray(formattedData) 
      ? formattedData.slice(0, 2) // Exibe apenas os 2 primeiros registros se for array
      : formattedData; // Se não for array, exibe tudo
    console.log(JSON.stringify(sampleData, null, 2));
    
    console.log(`Consulta retornou ${results.length} registros. Enviando para API...`);
    
    // Envia os dados para a API
    const response = await sendToApi(formattedData, queryConfig.nome, apiConfig, taskConfig);
    
    await log('info', `Consulta '${queryConfig.nome}' sincronizada: ${results.length} registros`);
    
    return {
      queryName: queryConfig.nome,
      recordCount: results.length,
      apiResponse: response
    };
  } catch (error) {
    await log('error', `Erro ao processar consulta '${queryConfig.nome}': ${error.message}`);
    throw error;
  }
}

/**
 * Obtém as configurações da API do banco de dados local
 */
async function getApiConfig() {
  const configRows = await query('SELECT chave, valor FROM configuracoes WHERE chave IN (?, ?, ?)', [
    'api_url', 'api_key', 'intervalo_sincronizacao'
  ]);
  
  const config = {};
  for (const row of configRows) {
    config[row.chave] = row.valor;
  }
  
  return config;
}

/**
 * Obtém todas as consultas SQL agendadas para sincronização
 */
async function getScheduledQueries() {
  return await query(`
    SELECT c.*, o.nome as conexao_nome 
    FROM consultas_sql c
    JOIN conexoes_odbc o ON c.conexao_id = o.id
    WHERE c.ativo = 1
  `);
}

/**
 * Envia os dados formatados para a API externa
 * @param {Array|Object} data - Dados a serem enviados
 * @param {string} queryName - Nome da consulta (para logging)
 * @param {Object} apiConfig - Configurações da API
 * @param {Object} taskConfig - Configurações específicas da tarefa (opcional)
 */
async function sendToApi(data, queryName, apiConfig, taskConfig = null) {
  return new Promise((resolve, reject) => {
    try {
      // Determina qual URL usar (prioriza a da tarefa)
      const apiUrl = taskConfig?.api_url || apiConfig.api_url;
      if (!apiUrl) {
        throw new Error('URL da API não configurada');
      }
      
      // Parse da URL
      const url = new URL(apiUrl);
      
      // Determina qual protocolo usar (http ou https)
      const httpModule = url.protocol === 'https:' ? https : http;
      
      // Preparar os dados para enviar
      const payload = Array.isArray(data) || (typeof data === 'object' && data !== null) 
        ? data 
        : {
            source: queryName,
            timestamp: new Date().toISOString(),
            data: data
          };
      
      // Log detalhado do payload antes de serializar para JSON
      console.log(`[DEBUG] Enviando para API (${queryName}) - Estrutura do payload:`);
      if (Array.isArray(payload)) {
        console.log(`Array com ${payload.length} itens`);
        // Mostrar apenas os 2 primeiros itens para não sobrecarregar os logs
        if (payload.length > 0) {
          console.log(JSON.stringify(payload.slice(0, 2), null, 2));
        }
      } else {
        console.log(JSON.stringify(payload, null, 2));
      }
      
      // Conversão para string JSON
      const postData = JSON.stringify(payload);
      
      console.log(`Enviando ${postData.length} bytes para ${apiUrl}`);
      
      // Processa headers personalizados da tarefa se existirem
      let customHeaders = {};
      if (taskConfig?.api_headers) {
        try {
          customHeaders = JSON.parse(taskConfig.api_headers);
          console.log(`[DEBUG] Headers personalizados: ${JSON.stringify(customHeaders, null, 2)}`);
        } catch (headerError) {
          console.error('Erro ao processar headers JSON:', headerError);
          // Continua com headers padrão
        }
      }
      
      // Configurar a requisição
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: taskConfig?.api_metodo || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Authorization': `Bearer ${apiConfig.api_key}`,
          ...customHeaders // Mescla com os headers personalizados
        }
      };
      
      console.log(`Enviando requisição ${options.method} para ${url.hostname}${options.path}`);
      
      // Criar a requisição
      const req = httpModule.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          console.log(`Resposta da API: Status ${res.statusCode}`);
          
          // Tenta converter para JSON, mas mantém como string se falhar
          let parsedResponse;
          try {
            parsedResponse = JSON.parse(responseData);
          } catch (e) {
            parsedResponse = responseData;
          }
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              success: true,
              statusCode: res.statusCode,
              data: parsedResponse
            });
          } else {
            reject(new Error(`API respondeu com status ${res.statusCode}: ${responseData}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error(`Erro na requisição API:`, error);
        reject(error);
      });
      
      // Configura timeout para a requisição
      req.setTimeout(30000, () => {
        req.abort();
        reject(new Error('Timeout ao aguardar resposta da API (30s)'));
      });
      
      // Enviar os dados
      req.write(postData);
      req.end();
    } catch (error) {
      console.error('Erro ao enviar para API:', error);
      reject(error);
    }
  });
}

/**
 * Verifica a última sincronização e retorna se está atualizada
 */
async function checkLastSync() {
  try {
    const lastSync = await query('SELECT valor FROM configuracoes WHERE chave = ?', ['ultima_sincronizacao']);
    
    if (!lastSync || !lastSync[0] || !lastSync[0].valor) {
      return {
        lastSync: null,
        isUpToDate: false,
        nextSyncDue: new Date()
      };
    }
    
    const lastSyncDate = new Date(lastSync[0].valor);
    const intervalConfig = await query('SELECT valor FROM configuracoes WHERE chave = ?', ['intervalo_sincronizacao']);
    
    const intervalMinutes = parseInt(intervalConfig[0]?.valor || '60', 10);
    const nextSyncDue = new Date(lastSyncDate.getTime() + intervalMinutes * 60 * 1000);
    const now = new Date();
    
    return {
      lastSync: lastSyncDate,
      isUpToDate: nextSyncDue > now,
      nextSyncDue
    };
  } catch (error) {
    console.error('Erro ao verificar última sincronização:', error);
    return {
      lastSync: null,
      isUpToDate: false,
      error: error.message
    };
  }
}

// Exporta as funções do módulo
module.exports = {
  syncData,
  checkLastSync,
  getApiConfig,
  syncSingleTaskNow,
  syncAllTasksNow
};

/**
 * Sincroniza uma única tarefa agendada
 * @param {number} taskId - ID da tarefa a ser executada
 */
async function syncSingleTaskNow(taskId) {
  try {
    // Registra o início da execução
    await log('info', `Iniciando execução manual da tarefa ID ${taskId}`);
    
    // Busca a tarefa específica
    const tasks = await query('SELECT * FROM agendamentos WHERE id = ?', [taskId]);
    
    if (!tasks || tasks.length === 0) {
      throw new Error(`Tarefa ID ${taskId} não encontrada`);
    }
    
    const task = tasks[0];
    
    // Atualiza o horário da última execução
    await run(
      'UPDATE agendamentos SET ultima_execucao = ? WHERE id = ?',
      [new Date().toISOString(), task.id]
    );
    
    // Configuração de tarefa para envio à API
    const taskConfig = {
      api_url: task.api_url,
      api_metodo: task.api_metodo || 'POST',
      api_headers: task.api_headers
    };
    
    // Verifica se a tarefa está relacionada com consulta SQL
    if (task.consulta_id) {
      // Busca a consulta relacionada
      const queries = await query('SELECT * FROM consultas_sql WHERE id = ?', [task.consulta_id]);
      if (!queries || queries.length === 0) {
        throw new Error(`Consulta ID ${task.consulta_id} não encontrada`);
      }
      
      const queryConfig = queries[0];
      
      // Obtém as configurações da API
      const config = await getApiConfig();
      if (!config.api_url) {
        // Se não tiver URL da API configurada, usa a da tarefa
        config.api_url = task.api_url;
      }
      
      // Executa a consulta e envia para a API
      await log('info', `Executando consulta '${queryConfig.nome}' associada à tarefa ID ${taskId}`);
      const result = await processSingleQuery(queryConfig, config, taskConfig);
      
      await log('info', `Tarefa manual ID ${taskId} executada com sucesso`);
      
      return {
        success: true,
        message: `Tarefa "${task.nome}" executada com sucesso`,
        details: result
      };
    } 
    // Se não tem consulta associada mas tem URL de API, envia dados vazios
    else if (task.api_url) {
      // Implementar lógica específica para chamada de API direta
      await log('info', `Chamando API ${task.api_url} diretamente`);
      
      // Configurar API com dados da tarefa
      const apiConfig = {
        api_url: task.api_url,
        api_key: task.api_key || ''
      };
      
      // Enviar dados vazios ou específicos para a API
      await sendToApi([], task.nome, apiConfig, taskConfig);
      
      await log('info', `Tarefa manual ID ${taskId} executada com sucesso (chamada direta API)`);
      
      return {
        success: true,
        message: `Tarefa "${task.nome}" executada com sucesso (apenas chamada API)`,
        details: null
      };
    } else {
      throw new Error(`Tarefa ID ${taskId} não possui nem consulta nem API configurada`);
    }
  } catch (error) {
    await log('error', `Erro ao executar tarefa ID ${taskId}: ${error.message}`);
    console.error(`Erro ao executar tarefa ID ${taskId}:`, error);
    
    return {
      success: false,
      message: `Erro ao executar tarefa: ${error.message}`,
      details: null
    };
  }
}

/**
 * Sincroniza todas as tarefas ativas
 */
async function syncAllTasksNow() {
  try {
    await log('info', 'Iniciando sincronização manual de todas as tarefas');
    
    // Busca todas as tarefas ativas
    const tasks = await query('SELECT * FROM agendamentos WHERE ativo = 1');
    
    if (!tasks || tasks.length === 0) {
      await log('info', 'Nenhuma tarefa ativa encontrada para sincronização');
      return {
        success: true,
        message: 'Nenhuma tarefa ativa encontrada para sincronização',
        details: null
      };
    }
    
    const results = [];
    
    // Executa cada tarefa
    for (const task of tasks) {
      try {
        const result = await syncSingleTaskNow(task.id);
        results.push({
          taskId: task.id,
          taskName: task.nome,
          success: result.success,
          message: result.message
        });
      } catch (taskError) {
        await log('error', `Erro ao executar tarefa ${task.nome}: ${taskError.message}`);
        results.push({
          taskId: task.id,
          taskName: task.nome,
          success: false,
          message: taskError.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    await log('info', `Sincronização manual concluída: ${successCount}/${results.length} tarefas executadas com sucesso`);
    
    return {
      success: true,
      message: `${successCount} de ${results.length} tarefas executadas com sucesso`,
      details: results
    };
  } catch (error) {
    await log('error', `Erro na sincronização manual: ${error.message}`);
    console.error('Erro na sincronização manual:', error);
    
    return {
      success: false,
      message: `Erro na sincronização: ${error.message}`,
      details: null
    };
  }
} 