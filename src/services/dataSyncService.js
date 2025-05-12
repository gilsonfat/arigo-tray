/**
 * Serviço de sincronização de dados
 * Realiza a sincronização entre os dados do banco local e a API externa
 */

const path = require('path');
const https = require('https');
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
 */
async function processSingleQuery(queryConfig, apiConfig) {
  try {
    console.log(`Processando consulta: ${queryConfig.nome}`);
    
    // Executa a consulta SQL no banco de dados via ODBC
    const results = await executeQuery(queryConfig.conexao_id, queryConfig.query);
    
    // Verifica se temos resultados
    if (!results || results.length === 0) {
      console.log(`Nenhum resultado para a consulta: ${queryConfig.nome}`);
      await log('info', `Nenhum resultado para a consulta: ${queryConfig.nome}`);
      return;
    }
    
    // Formata os resultados no formato especificado
    const formattedData = formatResults(results, queryConfig.formato_saida);
    
    // Envia os dados para a API
    const response = await sendToApi(formattedData, queryConfig.nome, apiConfig);
    
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
 */
async function sendToApi(data, queryName, apiConfig) {
  return new Promise((resolve, reject) => {
    // Preparar os dados para enviar
    const postData = JSON.stringify({
      source: queryName,
      timestamp: new Date().toISOString(),
      data: data
    });
    
    // Configurar a requisição
    const options = {
      hostname: new URL(apiConfig.api_url).hostname,
      port: 443,
      path: '/api/data',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${apiConfig.api_key}`
      }
    };
    
    // Criar a requisição
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(responseData));
        } else {
          reject(new Error(`API respondeu com status ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    // Enviar os dados
    req.write(postData);
    req.end();
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
  getApiConfig
}; 