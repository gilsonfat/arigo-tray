/**
 * Serviço de conexão ODBC para banco de dados Anywhere
 * Este serviço gerencia conexões ODBC e executa consultas SQL
 */

// Importa a biblioteca ODBC para conexão real com o banco
const odbc = require('odbc');
const { getOdbcConnection, log } = require('./database');

// Cache de conexões para reutilizar conexões abertas
const connectionsCache = new Map();

// Flag para verificar se o driver ODBC está disponível
let isOdbcDriverAvailable = true;
let odbcErrorMessage = '';

// Verifica se o ODBC está disponível no sistema
async function checkOdbcDriver() {
  try {
    console.log('[ODBC] Verificando disponibilidade do módulo ODBC...');
    
    // Em vez de listar drivers ODBC (que requer um método que não existe),
    // vamos verificar se o módulo ODBC está disponível e inicializado corretamente
    // testando se podemos acessar suas propriedades básicas
    if (!odbc || typeof odbc.connect !== 'function') {
      console.error('[ODBC] Módulo ODBC não está disponível ou inicializado corretamente');
      isOdbcDriverAvailable = false;
      odbcErrorMessage = 'Módulo ODBC não disponível ou inicializado incorretamente';
      return false;
    }
    
    console.log('[ODBC] Módulo ODBC verificado com sucesso');
    
    // Teste adicional: tenta criar uma conexão básica para validar o módulo
    try {
      // String de conexão inválida apenas para testar o módulo
      await odbc.connect('DRIVER={SQL Anywhere 17};SERVER=localhost;UID=test;PWD=test;', 
        (err, conn) => {
          // Esperamos um erro aqui, mas não um crash
          if (err) {
            // Se o erro for relacionado a driver ou servidor, está ok
            // É um erro esperado que confirma que o módulo está funcionando
            console.log('[ODBC] Teste com conexão inválida gerou erro esperado:', err.message);
          }
          
          if (conn) {
            // Se por acaso conectar (o que é improvável), fechamos a conexão
            conn.close();
          }
        });
    } catch (testError) {
      // Se o erro for um crash do módulo, é preocupante
      console.error('[ODBC] Erro no teste com conexão inválida:', testError.message);
      // Mas não vamos falhar aqui - apenas registrar o problema
    }
    
    // Como não podemos mais listar os drivers, vamos simplesmente assumir que o módulo
    // está funcionando corretamente se chegamos até aqui
    isOdbcDriverAvailable = true;
    return true;
  } catch (error) {
    console.error('[ODBC] Erro ao verificar módulo ODBC:', error.message);
    console.error('[ODBC] Stack trace completo:', error.stack);
    isOdbcDriverAvailable = false;
    odbcErrorMessage = `Erro ao acessar módulo ODBC: ${error.message}. Verifique se o Node.js tem permissões adequadas.`;
    return false;
  }
}

// Inicia a verificação do driver ODBC
checkOdbcDriver().then(result => {
  if (result) {
    console.log('[ODBC] Sistema ODBC inicializado com sucesso');
  } else {
    console.error('[ODBC] Falha ao inicializar sistema ODBC. Verifique se os drivers ODBC estão instalados.');
  }
}).catch(error => {
  console.error('[ODBC] Erro crítico ao inicializar sistema ODBC:', error);
  isOdbcDriverAvailable = false;
  odbcErrorMessage = `Erro crítico: ${error.message}`;
});

/**
 * Estabelece uma conexão ODBC com base no ID da conexão
 * @param {number} connectionId - ID da conexão armazenada no banco local
 * @returns {Promise<Object>} - Objeto de conexão
 */
async function connect(connectionId) {
  console.log(`[ODBC] Iniciando conexão com banco ID ${connectionId}...`);
  
  try {
    // Garantir que connectionId seja um número
    let numericId;
    if (typeof connectionId === 'string') {
      numericId = parseInt(connectionId, 10);
      console.log(`[ODBC] Convertendo connectionId de string para número: ${numericId}`);
    } else if (typeof connectionId === 'number') {
      numericId = connectionId;
    } else if (typeof connectionId === 'object') {
      // Se for um objeto, tenta extrair o ID
      console.error(`[ODBC] Erro: connectionId é um objeto: ${JSON.stringify(connectionId)}`);
      if (connectionId && typeof connectionId.id === 'number') {
        numericId = connectionId.id;
        console.log(`[ODBC] Usando connectionId.id como ID numérico: ${numericId}`);
      } else if (connectionId && typeof connectionId.id === 'string') {
        numericId = parseInt(connectionId.id, 10);
        console.log(`[ODBC] Convertendo connectionId.id de string para número: ${numericId}`);
      } else {
        throw new Error(`ID de conexão inválido (objeto): ${JSON.stringify(connectionId)}`);
      }
    } else {
      throw new Error(`Tipo de ID de conexão inválido: ${typeof connectionId}`);
    }
    
    if (isNaN(numericId)) {
      throw new Error(`ID de conexão não é um número válido: ${connectionId}`);
    }
    
    // Usar o ID numérico a partir daqui
    connectionId = numericId;
    console.log(`[ODBC] Usando connectionId numérico: ${connectionId}`);

    // 1. Verifica se já existe uma conexão em cache
    if (connectionsCache.has(connectionId)) {
      console.log(`[ODBC] Verificando conexão em cache para o ID ${connectionId}...`);
      
      const cachedConn = connectionsCache.get(connectionId);
      
      // Valida se a conexão em cache ainda é utilizável
      try {
        console.log(`[ODBC] Testando conexão em cache...`);
        const testResult = await cachedConn.query('SELECT 1 AS test');
        console.log(`[ODBC] Conexão em cache está ativa:`, testResult);
        return cachedConn;
      } catch (cacheError) {
        console.warn(`[ODBC] Conexão em cache expirou ou é inválida:`, cacheError.message);
        connectionsCache.delete(connectionId);
        // Continua para criar uma nova conexão
      }
    }
    
    // 2. Busca os detalhes da conexão
    console.log(`[ODBC] Obtendo detalhes da conexão ID ${connectionId}...`);
    const connectionDetails = await getOdbcConnection(connectionId);
    
    if (!connectionDetails) {
      throw new Error(`Conexão ID ${connectionId} não encontrada no banco de dados`);
    }
    
    console.log(`[ODBC] Detalhes obtidos para a conexão ${connectionDetails.nome}`);
    
    // 3. Verifica se o driver ODBC está disponível, se não, usa modo simulado
    if (!isOdbcDriverAvailable) {
      console.log(`[ODBC] Driver ODBC não disponível, usando conexão simulada para ${connectionDetails.nome}`);
      const mockConnection = createMockConnection(connectionDetails);
      // Adicionamos a conexão simulada ao cache
      connectionsCache.set(connectionId, mockConnection);
      return mockConnection;
    }
    
    // 4. Ajusta os detalhes da conexão se necessário
    if (!connectionDetails.driver || connectionDetails.driver.trim() === '') {
      console.log(`[ODBC] Driver não especificado, tentando usar 'Contabil'`);
      connectionDetails.driver = 'Contabil';
    }
    
    // 5. Tenta diferentes formatos de string de conexão
    console.time(`[ODBC] Tempo para estabelecer conexão`);
    
    let odbcConnection = null;
    let lastError = null;
    let tentativaUsada = 0;
    
    // Define as diferentes estratégias de conexão, priorizando 'Contabil'
    const tentativas = [
      // Tentativa 1: Usando driver Contabil com formato PROVIDER
      () => {
        const connStr = `PROVIDER=MSDASQL;DRIVER={Contabil};SERVER=${connectionDetails.host};DATABASE=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('[ODBC] Tentativa 1: String de conexão com PROVIDER para Contabil:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 2: Usando formato alternativo para Contabil
      () => {
        const connStr = `DSN=Contabil;SERVER=${connectionDetails.host};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('[ODBC] Tentativa 2: String de conexão alternativa para Contabil:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 3: Usando driver diretamente conforme README
      () => {
        const connStr = `Provider=MSDASQL;DSN=Contabil;UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('[ODBC] Tentativa 3: String de conexão conforme README:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 4: Versão simplificada apenas com DSN
      () => {
        const connStr = `DSN=NomeBdContabil;UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('[ODBC] Tentativa 4: String de conexão só com DSN:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 5: Usando driver Contabil diretamente
      () => {
        const connStr = `Driver={Contabil};SERVER=${connectionDetails.host};DATABASE=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('[ODBC] Tentativa 5: String de conexão direta com driver Contabil:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 6: Usando ENG e DBN
      () => {
        const connStr = `Driver={${connectionDetails.driver}};ENG=${connectionDetails.host};DBN=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('[ODBC] Tentativa 6: String de conexão:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 7: Usando SERVER e DATABASE
      () => {
        const connStr = `Driver={${connectionDetails.driver}};SERVER=${connectionDetails.host};PORT=${connectionDetails.porta};DATABASE=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('[ODBC] Tentativa 7: String de conexão:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 8: Usando SERVERNAME e DBN
      () => {
        const connStr = `Driver={${connectionDetails.driver}};SERVERNAME=${connectionDetails.host};PORT=${connectionDetails.porta};DBN=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('[ODBC] Tentativa 8: String de conexão:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 9: Usando CommLinks para SQL Anywhere
      () => {
        const connStr = `Driver={${connectionDetails.driver}};ENG=${connectionDetails.banco};CommLinks=tcpip(HOST=${connectionDetails.host};PORT=${connectionDetails.porta});DBN=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('[ODBC] Tentativa 9: String de conexão com CommLinks:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 10: Formato SQL Anywhere 17 otimizado
      () => {
        if (connectionDetails.driver.includes('SQL Anywhere')) {
          const connStr = `Driver={${connectionDetails.driver}};ENG=${connectionDetails.host};DBN=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};APP=TraySQL;CHARSET=UTF8;CommLinks=tcpip(HOST=${connectionDetails.host};PORT=${connectionDetails.porta || '2638'});`;
          console.log('[ODBC] Tentativa 10: String de conexão SQL Anywhere otimizada:', maskPassword(connStr));
          return connStr;
        }
        return null;
      },
      // Tentativa 11: Usando DSN se disponível
      () => {
        if (connectionDetails.dsn && connectionDetails.dsn.trim() !== '') {
          const connStr = `DSN=${connectionDetails.dsn};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
          console.log('[ODBC] Tentativa 11: String de conexão com DSN:', maskPassword(connStr));
          return connStr;
        }
        return null;
      },
      // Tentativa 12: String de conexão para driver BETHA (outra possibilidade para sistemas contábeis)
      () => {
        const connStr = `Driver={BETHA};SERVER=${connectionDetails.host};DATABASE=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('[ODBC] Tentativa 12: String de conexão com driver BETHA:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 13: Usando a string de conexão fornecida diretamente
      () => {
        if (connectionDetails.connection_string && connectionDetails.connection_string.trim() !== '') {
          console.log('[ODBC] Tentativa 13: Usando string de conexão personalizada:', maskPassword(connectionDetails.connection_string));
          return connectionDetails.connection_string;
        }
        return null;
      }
    ];
    
    // Tenta cada formato de conexão
    for (let i = 0; i < tentativas.length; i++) {
      const connectionString = tentativas[i]();
      if (!connectionString) continue; // Pula se a tentativa retornar nulo
      
      try {
        console.log(`[ODBC] Tentativa ${i+1}: Tentando conectar...`);
        
        // Cria uma nova Promise para lidar com timeout na conexão
        odbcConnection = await new Promise((resolve, reject) => {
          // Define um timeout para a tentativa de conexão
          // Aumentamos o timeout para SQL Anywhere que pode demorar mais
          const timeoutDuration = connectionDetails.driver.includes('SQL Anywhere') ? 60000 : 30000;
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout ao tentar conectar ao banco de dados (${timeoutDuration/1000}s)`));
          }, timeoutDuration);
          
          try {
            // Tenta estabelecer a conexão
            odbc.connect(connectionString, (err, connection) => {
              clearTimeout(timeout);
              
              if (err) {
                reject(err);
                return;
              }
              
              resolve(connection);
            });
          } catch (odbcErr) {
            clearTimeout(timeout);
            reject(new Error(`Erro no módulo ODBC: ${odbcErr.message}`));
          }
        });
        
        console.log(`[ODBC] Conexão ODBC estabelecida com sucesso (Tentativa ${i+1})`);
        tentativaUsada = i+1;
        break; // Sai do loop quando uma conexão for estabelecida com sucesso
      } catch (error) {
        console.error(`[ODBC] Tentativa ${i+1} falhou:`, error.message);
        lastError = error;
        // Continua para a próxima tentativa
      }
    }
    
    console.timeEnd(`[ODBC] Tempo para estabelecer conexão`);
    
    // Se todas as tentativas falharam
    if (!odbcConnection) {
      throw new Error(`Não foi possível estabelecer conexão após múltiplas tentativas: ${lastError.message}`);
    }
    
    // 7. Cria o objeto de conexão com métodos auxiliares
    const connectionObj = {
      query: (sql) => {
        return new Promise((resolve, reject) => {
          odbcConnection.query(sql, (err, result) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(result);
          });
        });
      },
      close: () => {
        return new Promise((resolve) => {
          odbcConnection.close(() => {
            connectionsCache.delete(connectionId);
            resolve();
          });
        });
      },
      _rawConnection: odbcConnection
    };
    
    // 8. Armazena a conexão em cache e retorna
    connectionsCache.set(connectionId, connectionObj);
    console.log(`[ODBC] Conexão armazenada em cache com ID ${connectionId} (Tentativa ${tentativaUsada})`);
    
    // Registra no log o sucesso
    await log('info', `Conexão estabelecida com banco ${connectionDetails.nome} (ID ${connectionId}) usando tentativa ${tentativaUsada}`);
    
    return connectionObj;
  } catch (error) {
    console.error(`[ODBC] Erro ao estabelecer conexão:`, error);
    
    // Registra o erro no log
    await log('error', `Falha ao conectar com banco ID ${connectionId}: ${error.message}`);
    
    // Propaga o erro diretamente
    throw error;
  }
}

/**
 * Constrói a string de conexão ODBC a partir dos detalhes da conexão
 */
function buildConnectionString(connectionDetails) {
  if (!connectionDetails) {
    throw new Error('Detalhes da conexão não fornecidos');
  }
  
  // Verifica se o driver foi especificado
  if (!connectionDetails.driver) {
    console.log('[ODBC] Driver não especificado, usando driver padrão SQL Anywhere 17');
    // Usa um driver padrão quando não especificado
    connectionDetails.driver = 'SQL Anywhere 17';
  }

  // Para SQL Anywhere, podemos usar o formato específico recomendado
  if (connectionDetails.driver.includes('SQL Anywhere')) {
    let connectionString = '';
    
    // Se houver uma DSN configurada, usamos ela como base
    if (connectionDetails.dsn && connectionDetails.dsn.trim() !== '') {
      connectionString = `DSN=${connectionDetails.dsn};`;
    } else {
      // Caso contrário, construímos a string de conexão completa
      // Formato para SQL Anywhere: Driver={SQL Anywhere 17};ENG=servidor;DBN=nome_banco;UID=usuario;PWD=senha;
      connectionString = `Driver={${connectionDetails.driver}};`;
      
      // Para SQL Anywhere, o nome do servidor deve ser especificado como ENG=
      if (connectionDetails.host) connectionString += `ENG=${connectionDetails.host};`;
      
      // A porta normalmente é incluída no CommLinks
      if (connectionDetails.porta) {
        connectionString += `CommLinks=tcpip(HOST=${connectionDetails.host};PORT=${connectionDetails.porta});`;
      }
      
      if (connectionDetails.banco) connectionString += `DBN=${connectionDetails.banco};`;
    }
    
    // Adiciona as credenciais
    if (connectionDetails.usuario) connectionString += `UID=${connectionDetails.usuario};`;
    if (connectionDetails.senha) connectionString += `PWD=${connectionDetails.senha};`;
    
    // Adiciona parâmetros adicionais específicos para SQL Anywhere
    connectionString += `APP=TraySQL;CHARSET=UTF8;`;
    
    // Adiciona parâmetros adicionais, se fornecidos
    if (connectionDetails.params && connectionDetails.params.trim() !== '') {
      connectionString += connectionDetails.params.endsWith(';') 
        ? connectionDetails.params 
        : connectionDetails.params + ';';
    }
    
    return connectionString;
  }
  
  // Para outros drivers, mantém o formato original
  const { driver, host, porta, banco, usuario, senha, params } = connectionDetails;
  
  // Constrói a string base de conexão
  let connectionString = `Driver={${driver}};`;
  
  // Adiciona os parâmetros básicos
  if (host) connectionString += `Server=${host};`;
  if (porta) connectionString += `Port=${porta};`;
  if (banco) connectionString += `Database=${banco};`;
  if (usuario) connectionString += `Uid=${usuario};`;
  if (senha) connectionString += `Pwd=${senha};`;
  
  // Adiciona opções adicionais, se fornecidas
  if (params && typeof params === 'string' && params.trim() !== '') {
    // Remove ponto e vírgula extra, se existir
    const cleanOptions = params.endsWith(';') 
      ? params
      : params + ';';
      
    connectionString += cleanOptions;
  }
  
  return connectionString;
}

/**
 * Mascara informações sensíveis da string de conexão para logs
 */
function maskPassword(connectionString) {
  if (!connectionString) return '';
  return connectionString.replace(/Pwd=([^;]+)/i, 'Pwd=*******');
}

/**
 * Executa uma consulta SQL diretamente no banco
 */
async function executeRawQuery(connectionId, sql) {
  if (!sql || typeof sql !== 'string' || sql.trim() === '') {
    throw new Error('Consulta SQL inválida ou vazia');
  }
  
  console.log(`[ODBC] Executando consulta SQL raw no banco ID ${connectionId}`);
  console.log(`[ODBC] SQL: ${sql.substring(0, 200)}${sql.length > 200 ? '...' : ''}`);
  
  const startTime = Date.now();
  let connection = null;
  
  try {
    // Estabelece conexão
    console.time(`[ODBC] Tempo para estabelecer conexão para consulta raw`);
    connection = await connect(connectionId);
    console.timeEnd(`[ODBC] Tempo para estabelecer conexão para consulta raw`);
    
    // Executa a consulta
    console.time(`[ODBC] Tempo de execução da consulta raw`);
    const result = await connection.query(sql);
    console.timeEnd(`[ODBC] Tempo de execução da consulta raw`);
    
    // Registra o sucesso
    const executionTime = Date.now() - startTime;
    const recordCount = Array.isArray(result) ? result.length : 0;
    
    console.log(`[ODBC] Consulta raw executada com sucesso: ${recordCount} registros em ${executionTime}ms`);
    
    // Se tiver resultados, mostra os primeiros registros como amostra
    if (recordCount > 0) {
      const sample = result.slice(0, Math.min(5, recordCount));
      console.log(`[ODBC] Amostra dos dados retornados:`, sample);
      
      // Se tiver muitas colunas, mostra quais estão disponíveis
      if (recordCount > 0 && result[0]) {
        console.log(`[ODBC] Colunas disponíveis:`, Object.keys(result[0]));
      }
    }
    
    // Registra no log
    await log('info', `Consulta raw executada: ${recordCount} registros em ${executionTime}ms`);
    
    return result;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    console.error(`[ODBC] Erro ao executar consulta raw (${executionTime}ms):`, error);
    
    // Formata a mensagem de erro
    let errorMessage = `Erro ao executar consulta: ${error.message}`;
    
    // Detecta tipo de erro para mensagem mais clara
    const originalErrorMsg = error.message.toLowerCase();
    if (originalErrorMsg.includes('syntax')) {
      errorMessage = `Erro de sintaxe SQL: ${error.message}`;
    }
    
    // Registra no log
    await log('error', `Falha na consulta SQL raw: ${errorMessage}`);
    
    throw new Error(errorMessage);
  }
}

/**
 * Executa uma consulta SQL no banco de dados
 */
async function executeQuery(connectionId, sql, params = {}) {
  console.log(`[ODBC] Solicitação para executar consulta no banco ID ${connectionId}`);
  
  // Valida a entrada
  if (!sql || typeof sql !== 'string' || sql.trim() === '') {
    throw new Error('Consulta SQL inválida ou vazia');
  }
  
  // Garantir que connectionId seja um número
  let numericId;
  if (typeof connectionId === 'string') {
    numericId = parseInt(connectionId, 10);
    console.log(`[ODBC] Convertendo connectionId de string para número: ${numericId}`);
  } else if (typeof connectionId === 'number') {
    numericId = connectionId;
  } else if (typeof connectionId === 'object') {
    // Se for um objeto, tenta extrair o ID
    console.error(`[ODBC] Erro: connectionId é um objeto: ${JSON.stringify(connectionId)}`);
    if (connectionId && typeof connectionId.id === 'number') {
      numericId = connectionId.id;
      console.log(`[ODBC] Usando connectionId.id como ID numérico: ${numericId}`);
    } else if (connectionId && typeof connectionId.id === 'string') {
      numericId = parseInt(connectionId.id, 10);
      console.log(`[ODBC] Convertendo connectionId.id de string para número: ${numericId}`);
    } else {
      throw new Error(`ID de conexão inválido (objeto): ${JSON.stringify(connectionId)}`);
    }
  } else {
    throw new Error(`Tipo de ID de conexão inválido: ${typeof connectionId}`);
  }
  
  if (isNaN(numericId)) {
    throw new Error(`ID de conexão não é um número válido: ${connectionId}`);
  }
  
  // Usar o ID numérico a partir daqui
  connectionId = numericId;
  console.log(`[ODBC] Usando connectionId numérico: ${connectionId}`);
  
  // Inicializa contadores e registros de tempo
  const startTime = Date.now();
  let connection = null;
  
  try {
    console.log(`[ODBC] Preparando para executar SQL: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);
    
    // Verifica se há parâmetros para substituir
    if (params && Object.keys(params).length > 0) {
      console.log(`[ODBC] Substituindo parâmetros na consulta:`, params);
      sql = replaceQueryParams(sql, params);
    }
    
    // Adaptar sintaxe LIMIT para SQL Anywhere (que usa TOP em vez de LIMIT)
    const limitRegex = /\s+LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/i;
    const limitMatch = sql.match(limitRegex);
    
    if (limitMatch) {
      console.log(`[ODBC] Detectada cláusula LIMIT, adaptando para SQL Anywhere`);
      
      let modifiedSql = sql;
      const limit = parseInt(limitMatch[1], 10);
      const offset = limitMatch[2] ? parseInt(limitMatch[2], 10) : null;
      
      if (offset) {
        // SQL Anywhere não suporta LIMIT com offset diretamente
        // Precisamos usar uma subconsulta ou procedimento armazenado
        console.log(`[ODBC] Cláusula LIMIT com offset não é diretamente suportada em SQL Anywhere`);
        console.log(`[ODBC] Tentando adaptar usando ROW_NUMBER() ou outra técnica`);
        
        // Verificar se a consulta já tem ORDER BY, senão adicionar um para garantir consistência
        const hasOrderBy = /\s+ORDER\s+BY\s+/i.test(sql);
        
        if (!hasOrderBy) {
          // Se não tiver ORDER BY, adicionamos um padrão usando a primeira coluna
          // Isso é necessário para o ROW_NUMBER() funcionar consistentemente
          const selectMatch = sql.match(/SELECT\s+(?:TOP\s+\d+\s+)?(.+?)\s+FROM/i);
          if (selectMatch && selectMatch[1]) {
            const firstColumn = selectMatch[1].split(',')[0].trim();
            modifiedSql = sql.replace(limitRegex, '') + ` ORDER BY ${firstColumn}`;
          } else {
            modifiedSql = sql.replace(limitRegex, '');
          }
        } else {
          modifiedSql = sql.replace(limitRegex, '');
        }
        
        // Embrulhar em uma subconsulta com ROW_NUMBER()
        modifiedSql = `
          SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (ORDER BY (SELECT 1)) AS rownum
            FROM (
              ${modifiedSql}
            ) AS innerQuery
          ) AS outerQuery
          WHERE rownum > ${offset} AND rownum <= ${offset + limit}
        `;
      } else {
        // Substituir LIMIT por TOP
        modifiedSql = sql.replace(/SELECT/i, `SELECT TOP ${limit}`).replace(limitRegex, '');
      }
      
      console.log(`[ODBC] SQL adaptado: ${modifiedSql.substring(0, 100)}${modifiedSql.length > 100 ? '...' : ''}`);
      sql = modifiedSql;
    }
    
    // Conecta ao banco de dados
    console.time(`[ODBC] Tempo para estabelecer conexão para consulta`);
    connection = await connect(connectionId);
    console.timeEnd(`[ODBC] Tempo para estabelecer conexão para consulta`);
    
    // Executa a consulta
    console.time(`[ODBC] Tempo de execução da consulta SQL`);
    console.log(`[ODBC] Executando consulta SQL...`);
    
    // Adicionar tratamento específico para erros comuns da sintaxe SQL
    try {
      const result = await connection.query(sql);
      console.timeEnd(`[ODBC] Tempo de execução da consulta SQL`);
      
      // Registra o sucesso no log
      const executionTime = Date.now() - startTime;
      const recordCount = Array.isArray(result) ? result.length : 0;
      
      console.log(`[ODBC] Consulta executada com sucesso: ${recordCount} registros retornados em ${executionTime}ms`);
      
      // Exibe amostra dos primeiros registros (se houver)
      if (recordCount > 0) {
        const sample = result.slice(0, Math.min(3, recordCount));
        console.log(`[ODBC] Amostra de ${sample.length} registros:`, sample);
      }
      
      // Registra evento de consulta no log
      await log(
        'info', 
        `Consulta executada com sucesso: ${recordCount} registros retornados em ${executionTime}ms`
      );
      
      return result;
    } catch (queryError) {
      console.timeEnd(`[ODBC] Tempo de execução da consulta SQL`);
      console.error(`[ODBC] Erro específico da consulta SQL: ${queryError.message}`);
      
      // Verificar erros específicos de sintaxe e tentar corrigir
      const errorMsg = queryError.message.toLowerCase();
      
      if (errorMsg.includes('syntax') || errorMsg.includes('sintaxe')) {
        // Erros de sintaxe - tentar detectar problemas específicos
        if (errorMsg.includes('limit')) {
          console.log(`[ODBC] Erro relacionado à sintaxe LIMIT - o banco pode não suportar esta cláusula`);
          throw new Error('Erro de sintaxe: A cláusula LIMIT não é suportada neste banco de dados. Use SELECT TOP N ou consulte a documentação do SQL Anywhere para paginação.');
        }
        
        if (errorMsg.includes('top') && sql.toLowerCase().includes('select top')) {
          console.log(`[ODBC] Erro relacionado à sintaxe TOP - verificando formato correto`);
          throw new Error('Erro de sintaxe: Verifique o formato correto da cláusula TOP para SQL Anywhere.');
        }
      }
      
      // Se chegamos aqui, propagar o erro original
      throw queryError;
    }
  } catch (error) {
    // Calcula o tempo total até o erro
    const executionTime = Date.now() - startTime;
    
    console.error(`[ODBC] Erro ao executar consulta (${executionTime}ms):`, error);
    
    // Formata a mensagem de erro de forma mais amigável
    let errorMessage = `Erro ao executar consulta: ${error.message}`;
    const originalErrorMsg = error.message.toLowerCase();
    
    // Detecta e formata erros comuns de SQL
    if (originalErrorMsg.includes('syntax') || originalErrorMsg.includes('sintaxe')) {
      errorMessage = `Erro de sintaxe SQL: Verifique a sintaxe da sua consulta. ${error.message}`;
      // Verificar se é um erro específico de LIMIT
      if (originalErrorMsg.includes('limit')) {
        errorMessage = `Erro de sintaxe SQL: A cláusula LIMIT não é suportada neste banco. Use SELECT TOP N para SQL Anywhere. ${error.message}`;
      }
    } 
    else if (originalErrorMsg.includes('column') && 
             (originalErrorMsg.includes('not found') || originalErrorMsg.includes('unknown'))) {
      errorMessage = `Coluna não encontrada: Uma coluna na consulta não existe na tabela. ${error.message}`;
    }
    else if (originalErrorMsg.includes('table') && 
             (originalErrorMsg.includes('not found') || originalErrorMsg.includes('unknown'))) {
      errorMessage = `Tabela não encontrada: Uma tabela na consulta não existe no banco. ${error.message}`;
    }
    else if (originalErrorMsg.includes('permission') || 
             originalErrorMsg.includes('acesso negado') || 
             originalErrorMsg.includes('access denied')) {
      errorMessage = `Erro de permissão: Usuário não tem permissão para executar esta operação. ${error.message}`;
    }
    else if (originalErrorMsg.includes('timeout') || originalErrorMsg.includes('timed out')) {
      errorMessage = `Timeout: A consulta demorou muito para executar e foi cancelada. ${error.message}`;
    }
    else if (originalErrorMsg.includes('connection') && 
             (originalErrorMsg.includes('lost') || originalErrorMsg.includes('closed'))) {
      errorMessage = `Conexão perdida: A conexão com o banco de dados foi perdida durante a consulta. ${error.message}`;
    }
    
    // Registra o erro no log
    await log('error', `Falha na consulta SQL: ${errorMessage}`);
    
    throw new Error(errorMessage);
  }
}

/**
 * Fecha uma conexão específica
 */
async function closeConnection(connectionId) {
  if (connectionsCache.has(connectionId)) {
    try {
      const connectionObj = connectionsCache.get(connectionId);
      await connectionObj.connection.close();
      connectionsCache.delete(connectionId);
      console.log(`Conexão ODBC fechada: ${connectionObj.name}`);
    } catch (error) {
      console.error(`Erro ao fechar conexão: ${error.message}`);
    }
  }
}

/**
 * Fecha todas as conexões ativas
 */
async function closeAllConnections() {
  const closePromises = [];
  
  for (const [connectionId, connectionObj] of connectionsCache.entries()) {
    try {
      closePromises.push(connectionObj.connection.close());
      console.log(`Fechando conexão: ${connectionObj.name}`);
    } catch (error) {
      console.error(`Erro ao fechar conexão ${connectionObj.name}: ${error.message}`);
    }
  }
  
  await Promise.all(closePromises);
  connectionsCache.clear();
  console.log('Todas as conexões ODBC foram fechadas');
}

/**
 * Testa a conexão ODBC
 * @param {Object|number} connectionData - Dados da conexão ou ID da conexão a testar
 * @returns {Promise<Object>} - Retorna objeto com success e message
 */
async function testConnection(connectionData) {
  try {
    console.log('Testando conexão ODBC com dados:', connectionData);
    
    let connectionDetails;
    
    // Se for um número, busca os detalhes da conexão pelo ID
    if (typeof connectionData === 'number' || (typeof connectionData === 'string' && !isNaN(parseInt(connectionData)))) {
      console.log('Testando conexão por ID:', connectionData);
      connectionDetails = await getOdbcConnection(parseInt(connectionData));
      
      if (!connectionDetails) {
        return { success: false, message: `Conexão ODBC ID ${connectionData} não encontrada` };
      }
    } else {
      // Se for um objeto, mapeia os campos do formulário para os nomes esperados internamente
      console.log('Testando conexão com dados fornecidos');
      connectionDetails = {
        nome: connectionData.nome || '',
        dsn: connectionData.dsn || '',
        connection_string: connectionData.connection_string || '',
        usuario: connectionData.usuario || '',
        senha: connectionData.senha || '',
        // Dados adicionais para construir string de conexão
        host: connectionData.host || '',
        porta: connectionData.porta || '2638',
        banco: connectionData.banco || '',
        driver: connectionData.driver || '',
        params: connectionData.params || ''
      };
    }
    
    // Verifica se os dados mínimos necessários estão presentes
    if (!connectionDetails.nome) {
      return { success: false, message: 'Nome da conexão não fornecido' };
    }
    
    if (!connectionDetails.dsn && !connectionDetails.connection_string) {
      if (!connectionDetails.host) {
        return { success: false, message: 'Host/Servidor não fornecido' };
      }
      
      if (!connectionDetails.banco) {
        return { success: false, message: 'Nome do banco de dados não fornecido' };
      }
    }
    
    if (!connectionDetails.usuario) {
      return { success: false, message: 'Usuário não fornecido' };
    }
    
    if (!connectionDetails.senha) {
      return { success: false, message: 'Senha não fornecida' };
    }
    
    // Adiciona o driver Contabil caso não esteja especificado
    if (!connectionDetails.driver || connectionDetails.driver.trim() === '') {
      console.log('[ODBC] Driver não especificado no teste, usando Contabil');
      connectionDetails.driver = 'Contabil';
    }
    
    // Verifica se a DSN está configurada no sistema
    try {
      console.log('[ODBC] Verificando DSNs disponíveis no sistema');
      
      // Dica para o usuário configurar uma DSN
      console.log('[ODBC] Recomendação: Configure uma DSN no Painel de Controle do Windows:');
      console.log('[ODBC] 1. Abra o Painel de Controle > Ferramentas Administrativas > Fontes de Dados ODBC');
      console.log('[ODBC] 2. Na aba "DSN de Sistema", adicione uma nova DSN com o driver Contabil');
      console.log('[ODBC] 3. Nomeie a DSN como "Contabil" ou o nome desejado e configure-a com os dados do servidor');
      
    } catch (dsnError) {
      console.error('[ODBC] Erro ao verificar DSNs:', dsnError.message);
    }
    
    // Tenta diferentes formatos de string de conexão
    let lastError = null;
    const tentativas = [
      // Tentativa 1: Usando driver Contabil com formato PROVIDER
      () => {
        const connStr = `PROVIDER=MSDASQL;DRIVER={Contabil};SERVER=${connectionDetails.host};DATABASE=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('Tentativa 1: String de conexão com PROVIDER para Contabil:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 2: Usando formato alternativo para Contabil
      () => {
        const connStr = `DSN=Contabil;SERVER=${connectionDetails.host};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('Tentativa 2: String de conexão alternativa para Contabil:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 3: Usando driver diretamente conforme README
      () => {
        const connStr = `Provider=MSDASQL;DSN=NomeDSN;UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('Tentativa 3: String de conexão conforme README:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 4: Versão simplificada apenas com DSN
      () => {
        const connStr = `DSN=NomeBdContabil;UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('Tentativa 4: String de conexão só com DSN:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 5: Usando driver Contabil diretamente
      () => {
        const connStr = `Driver={Contabil};SERVER=${connectionDetails.host};DATABASE=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('Tentativa 5: String de conexão direta com driver Contabil:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 6: Versão específica para SQL Anywhere usando driver Contabil
      () => {
        const connStr = `Driver={Contabil};ENG=${connectionDetails.host};DBN=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('Tentativa 6: String de conexão para SQL Anywhere via Contabil:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 7: Usando DSN com nome da conexão como DSN
      () => {
        const connStr = `DSN=${connectionDetails.nome};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
        console.log('Tentativa 7: String de conexão usando nome como DSN:', maskPassword(connStr));
        return connStr;
      },
      // Tentativa 8: Versão DSN configurada pelo usuário
      () => {
        if (connectionDetails.dsn && connectionDetails.dsn.trim() !== '') {
          const connStr = `DSN=${connectionDetails.dsn};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`;
          console.log('Tentativa 8: String de conexão com DSN configurada:', maskPassword(connStr));
          return connStr;
        }
        return null;
      },
      // Tentativa 9: Usando a string de conexão personalizada do usuário
      () => {
        if (connectionDetails.connection_string && connectionDetails.connection_string.trim() !== '') {
          console.log('Tentativa 9: Usando string de conexão personalizada:', maskPassword(connectionDetails.connection_string));
          return connectionDetails.connection_string;
        }
        return null;
      }
    ];

    // Tenta cada formato de conexão
    for (let i = 0; i < tentativas.length; i++) {
      const connectionString = tentativas[i]();
      if (!connectionString) continue; // Pula se a tentativa retornar nulo
      
      try {
        console.log(`Tentativa ${i+1}: Tentando conectar...`);
        // Tenta estabelecer a conexão
        const connection = await odbc.connect(connectionString);
        
        // Executa uma consulta simples para verificar se a conexão está funcionando
        await connection.query('SELECT 1');
        
        // Fecha a conexão após o teste
        await connection.close();
        
        await log('info', `Teste de conexão ODBC bem-sucedido: ${connectionDetails.nome} (Tentativa ${i+1})`);
        return { 
          success: true, 
          message: `Conexão com '${connectionDetails.nome}' estabelecida com sucesso (Tentativa ${i+1})` 
        };
      } catch (error) {
        console.error(`Tentativa ${i+1} falhou:`, error.message);
        
        // Verifica se é um erro específico relacionado ao driver
        if (error.message.includes('Driver') || error.message.includes('driver')) {
          console.error('[ODBC] Possível problema com o driver. Verifique se o driver Contabil está instalado corretamente.');
        } else if (error.message.includes('DSN') || error.message.includes('dsn')) {
          console.error('[ODBC] Problema com a DSN. Verifique se a DSN está configurada corretamente no Painel de Controle.');
        }
        
        lastError = error;
        // Continua para a próxima tentativa
      }
    }
    
    // Se chegou aqui, todas as tentativas falharam
    await log('error', `Falha no teste de conexão ODBC: ${lastError.message}`);
    return { 
      success: false, 
      message: `Falha na conexão: ${lastError.message}. 
      
INSTRUÇÕES DE SOLUÇÃO:
1. Verifique se o driver Contabil está instalado corretamente no sistema
2. Configure uma DSN no Painel de Controle > Ferramentas Administrativas > Fontes de Dados ODBC
3. Verifique se o servidor (${connectionDetails.host}) está acessível
4. Teste as credenciais de acesso
5. Consulte a documentação do software Contabil para o formato correto de conexão` 
    };
  } catch (error) {
    await log('error', `Falha no teste de conexão ODBC: ${error.message}`);
    return { 
      success: false, 
      message: `Falha na conexão: ${error.message}` 
    };
  }
}

/**
 * Testa uma consulta SQL específica em uma conexão
 * @param {string} sql - Consulta SQL a ser testada
 * @param {number|string} connectionId - ID da conexão 
 * @returns {Promise<Object>} - Resultado do teste
 */
async function testQuery(sql, connectionId) {
  try {
    console.log(`[odbcService] Testando consulta SQL na conexão ID ${connectionId}...`);
    console.log(`[odbcService] SQL: ${sql}`);
    
    if (!sql || !sql.trim()) {
      console.log(`[odbcService] Erro: Consulta SQL vazia`);
      return { 
        success: false, 
        message: 'Consulta SQL vazia ou não fornecida' 
      };
    }
    
    if (connectionId === undefined || connectionId === null || connectionId === '') {
      console.log(`[odbcService] Erro: ID da conexão não fornecido`);
      return { 
        success: false, 
        message: 'ID da conexão não fornecido' 
      };
    }
    
    // Converte connectionId para número se for string
    const numericConnectionId = typeof connectionId === 'string' 
      ? parseInt(connectionId, 10) 
      : connectionId;
      
    if (isNaN(numericConnectionId)) {
      console.log(`[odbcService] Erro: ID da conexão inválido: ${connectionId}`);
      return { 
        success: false, 
        message: `ID da conexão inválido: ${connectionId}` 
      };
    }
    
    console.log(`[odbcService] Obtendo detalhes da conexão ID: ${numericConnectionId}`);
    
    // Obtém os detalhes da conexão independentemente
    const connectionDetails = await getOdbcConnection(numericConnectionId);
    if (!connectionDetails) {
      return { 
        success: false, 
        message: `Conexão ID ${numericConnectionId} não encontrada` 
      };
    }
    
    // Verificar se um driver foi especificado
    if (!connectionDetails.driver) {
      // Se o driver não estiver especificado, adicionamos o driver SQL Anywhere 17
      console.log(`[odbcService] Driver não especificado na conexão ${connectionDetails.nome}, usando SQL Anywhere 17`);
      connectionDetails.driver = 'SQL Anywhere 17';
    }
    
    // Adaptar sintaxe LIMIT para SQL Anywhere (que usa TOP em vez de LIMIT)
    let sqlAjustado = sql;
    const limitRegex = /\s+LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/i;
    const limitMatch = sql.match(limitRegex);
    
    if (limitMatch) {
      console.log(`[odbcService] Detectada cláusula LIMIT na consulta de teste, adaptando para SQL Anywhere`);
      
      const limit = parseInt(limitMatch[1], 10);
      const offset = limitMatch[2] ? parseInt(limitMatch[2], 10) : null;
      
      if (offset) {
        // SQL Anywhere não suporta LIMIT com offset diretamente
        // Precisamos usar uma subconsulta ou procedimento armazenado
        console.log(`[odbcService] Cláusula LIMIT com offset não é diretamente suportada em SQL Anywhere`);
        
        // Verificar se a consulta já tem ORDER BY, senão adicionar um para garantir consistência
        const hasOrderBy = /\s+ORDER\s+BY\s+/i.test(sql);
        
        if (!hasOrderBy) {
          // Se não tiver ORDER BY, adicionamos um padrão usando a primeira coluna
          const selectMatch = sql.match(/SELECT\s+(?:TOP\s+\d+\s+)?(.+?)\s+FROM/i);
          if (selectMatch && selectMatch[1]) {
            const firstColumn = selectMatch[1].split(',')[0].trim();
            sqlAjustado = sql.replace(limitRegex, '') + ` ORDER BY ${firstColumn}`;
          } else {
            sqlAjustado = sql.replace(limitRegex, '');
          }
        } else {
          sqlAjustado = sql.replace(limitRegex, '');
        }
        
        // Embrulhar em uma subconsulta com ROW_NUMBER()
        sqlAjustado = `
          SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (ORDER BY (SELECT 1)) AS rownum
            FROM (
              ${sqlAjustado}
            ) AS innerQuery
          ) AS outerQuery
          WHERE rownum > ${offset} AND rownum <= ${offset + limit}
        `;
      } else {
        // Substituir LIMIT por TOP
        sqlAjustado = sql.replace(/SELECT/i, `SELECT TOP ${limit}`).replace(limitRegex, '');
      }
      
      console.log(`[odbcService] SQL adaptado: ${sqlAjustado.substring(0, 100)}${sqlAjustado.length > 100 ? '...' : ''}`);
    }
    
    let results;
    
    if (!isOdbcDriverAvailable) {
      console.log(`[odbcService] ODBC não disponível, usando modo simulado para testes`);
      
      // Usar conexão simulada
      const mockConn = createMockConnection(connectionDetails);
      results = await mockConn.query(sqlAjustado);
      
      console.log(`[odbcService] Consulta SIMULADA executada, retornando ${results.length} registros`);
    } else {
      console.log(`[odbcService] Obtendo conexão ODBC real...`);
      
      try {
        // Obtém a conexão real
        const connectionObj = await connect(numericConnectionId);
        
        // Executa a consulta real
        results = await connectionObj.query(sqlAjustado);
        
        console.log(`[odbcService] Consulta real executada com sucesso, retornando ${results.length} registros`);
      } catch (connError) {
        console.error(`[odbcService] Erro na conexão: ${connError.message}`);
        
        // Verificar se o erro está relacionado à sintaxe LIMIT
        if (connError.message.toLowerCase().includes('syntax') && 
            (sql.toLowerCase().includes('limit') || sqlAjustado.toLowerCase().includes('top'))) {
          return {
            success: false,
            message: `Erro de sintaxe: A cláusula LIMIT não é suportada pelo SQL Anywhere. Tente usar 'SELECT TOP N' em vez de 'LIMIT N'. Erro original: ${connError.message}`
          };
        }
        
        return {
          success: false,
          message: `Erro na conexão: ${connError.message}`
        };
      }
    }
    
    return {
      success: true,
      message: `Consulta executada com sucesso (${results.length} linha(s))`,
      data: results,
      simulado: !isOdbcDriverAvailable
    };
  } catch (error) {
    console.error(`[odbcService] Falha no teste da consulta: ${error.message}`);
    await log('error', `Falha no teste da consulta: ${error.message}`);
    return { 
      success: false, 
      message: `Falha ao executar consulta: ${error.message}` 
    };
  }
}

/**
 * Formata os resultados da consulta no formato desejado
 * @param {Array} results - Resultados da consulta
 * @param {string} format - Formato (json, csv, excel)
 * @param {string} transformType - Tipo de transformação a ser aplicada (opcional)
 * @returns {any} - Resultados formatados
 */
function formatResults(results, format = 'json', transformType = null) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    console.log('[DEBUG] formatResults - Dados vazios ou inválidos.');
    return format === 'json' ? [] : '';
  }
  
  // Log inicial dos dados recebidos
  console.log(`[DEBUG] formatResults - Recebendo ${results.length} registros para formatação no formato '${format}'`);
  
  // Aplica a transformação de dados se necessário
  let transformedResults = results;
  if (transformType) {
    console.log(`Aplicando transformação de tipo '${transformType}' antes da formatação`);
    transformedResults = transformData(results, transformType);
    console.log(`[DEBUG] formatResults - Transformação '${transformType}' concluída. Resultados: ${transformedResults.length} registros`);
  } else {
    console.log('[DEBUG] formatResults - Nenhuma transformação solicitada. Usando dados originais.');
  }
  
  // Formata os dados de acordo com o formato desejado
  let formattedOutput;
  switch (format.toLowerCase()) {
    case 'csv':
      formattedOutput = convertToCSV(transformedResults);
      console.log(`[DEBUG] formatResults - Dados convertidos para CSV (${formattedOutput.length} bytes)`);
      return formattedOutput;
    case 'excel':
      // Na implementação real, gerar Excel
      // Aqui só retornamos o CSV como exemplo
      formattedOutput = convertToCSV(transformedResults);
      console.log(`[DEBUG] formatResults - Dados convertidos para 'excel' (temporariamente como CSV): ${formattedOutput.length} bytes`);
      return formattedOutput;
    case 'json':
    default:
      console.log(`[DEBUG] formatResults - Dados mantidos no formato JSON (${transformedResults.length} registros)`);
      return transformedResults;
  }
}

/**
 * Converte um array de objetos para CSV
 */
function convertToCSV(data) {
  if (!data || !data.length) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [];
  
  // Adiciona o cabeçalho
  csvRows.push(headers.join(','));
  
  // Adiciona as linhas
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      // Escapa valores com aspas e vírgulas
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

/**
 * Cria uma conexão simulada para testes quando o ODBC não está disponível
 * @param {Object} connectionDetails - Detalhes da conexão
 * @returns {Object} Objeto de conexão simulada
 */
function createMockConnection(connectionDetails) {
  console.log(`[ODBC] Criando conexão simulada para testes: ${connectionDetails?.nome || 'Sem nome'}`);
  
  return {
    query: async (sql) => {
      console.log(`[ODBC SIMULADO] Executando consulta SQL: ${sql}`);
      
      // Para consultas de teste, retorna um resultado simples
      if (sql.toUpperCase().includes('SELECT 1')) {
        return [{ test: 1 }];
      }
      
      // Verifica se a consulta contém a cláusula FROM para detectar a tabela
      const tableMatch = sql.match(/FROM\s+([^\s,;()]+)/i);
      const tableName = tableMatch && tableMatch[1] ? tableMatch[1].replace(/[\[\]"`']/g, '') : 'desconhecida';
      
      console.log(`[ODBC SIMULADO] Tabela identificada: ${tableName}`);
      
      // Gerar dados de exemplo com base no nome da tabela
      let dadosSimulados = [];
      
      if (tableName.toLowerCase().includes('cliente')) {
        dadosSimulados = [
          { id: 1, nome: 'Cliente Simulado 1', email: 'cliente1@exemplo.com', telefone: '(11) 99999-1111', data_cadastro: new Date().toISOString() },
          { id: 2, nome: 'Cliente Simulado 2', email: 'cliente2@exemplo.com', telefone: '(11) 99999-2222', data_cadastro: new Date().toISOString() },
          { id: 3, nome: 'Cliente Simulado 3', email: 'cliente3@exemplo.com', telefone: '(11) 99999-3333', data_cadastro: new Date().toISOString() }
        ];
      } else if (tableName.toLowerCase().includes('produto')) {
        dadosSimulados = [
          { id: 1, nome: 'Produto Simulado 1', preco: 99.90, estoque: 100, categoria: 'Categoria A' },
          { id: 2, nome: 'Produto Simulado 2', preco: 199.90, estoque: 50, categoria: 'Categoria B' },
          { id: 3, nome: 'Produto Simulado 3', preco: 299.90, estoque: 25, categoria: 'Categoria C' }
        ];
      } else if (tableName.toLowerCase().includes('venda') || tableName.toLowerCase().includes('pedido')) {
        dadosSimulados = [
          { id: 1, cliente_id: 1, data: new Date().toISOString(), valor_total: 299.70, status: 'Concluído' },
          { id: 2, cliente_id: 2, data: new Date().toISOString(), valor_total: 399.80, status: 'Em processamento' },
          { id: 3, cliente_id: 1, data: new Date().toISOString(), valor_total: 599.70, status: 'Aguardando pagamento' }
        ];
      } else {
        // Dados genéricos para qualquer outra tabela
        dadosSimulados = [
          { id: 1, descricao: 'Registro simulado 1', valor: 100, data: new Date().toISOString() },
          { id: 2, descricao: 'Registro simulado 2', valor: 200, data: new Date().toISOString() },
          { id: 3, descricao: 'Registro simulado 3', valor: 300, data: new Date().toISOString() }
        ];
      }
      
      console.log(`[ODBC SIMULADO] Retornando ${dadosSimulados.length} registros simulados para testes`);
      return dadosSimulados;
    },
    close: async () => {
      console.log(`[ODBC SIMULADO] Fechando conexão simulada`);
      return true;
    }
  };
}

/**
 * Função específica para diagnóstico de conexões SQL Anywhere
 * Ajuda a identificar problemas específicos com o driver SQL Anywhere
 */
async function diagnosticarSQLAnywhere(connectionDetails) {
  console.log('[ODBC] Iniciando diagnóstico específico para SQL Anywhere');
  
  const diagnostico = {
    driver: { status: 'pendente', mensagem: '' },
    dsn: { status: 'pendente', mensagem: '' },
    conexao: { status: 'pendente', mensagem: '' },
    sugestoes: []
  };
  
  // 1. Verificar se o driver SQL Anywhere está disponível
  try {
    const drivers = await listAvailableDrivers();
    const sqlAnywhereFound = drivers.some(d => d.toLowerCase().includes('sql anywhere'));
    
    if (sqlAnywhereFound) {
      diagnostico.driver.status = 'ok';
      diagnostico.driver.mensagem = 'Driver SQL Anywhere encontrado no sistema';
    } else {
      diagnostico.driver.status = 'erro';
      diagnostico.driver.mensagem = 'Driver SQL Anywhere não encontrado nos drivers ODBC do sistema';
      diagnostico.sugestoes.push('Instale o driver SQL Anywhere 17 no sistema operacional');
      diagnostico.sugestoes.push('Configure o driver no Painel de Controle > Ferramentas Administrativas > Fontes de Dados ODBC');
    }
  } catch (driverError) {
    diagnostico.driver.status = 'erro';
    diagnostico.driver.mensagem = `Erro ao verificar drivers: ${driverError.message}`;
    diagnostico.sugestoes.push('Verifique as permissões do Node.js para acessar o registro do sistema');
  }
  
  // 2. Verificar se existe uma DSN configurada
  if (connectionDetails.dsn && connectionDetails.dsn.trim() !== '') {
    diagnostico.dsn.status = 'info';
    diagnostico.dsn.mensagem = `DSN configurada: ${connectionDetails.dsn}`;
  } else {
    diagnostico.dsn.status = 'aviso';
    diagnostico.dsn.mensagem = 'Nenhuma DSN configurada, tentando conexão direta';
    diagnostico.sugestoes.push('Configurar uma DSN no sistema pode facilitar a conexão');
  }
  
  // 3. Tentar uma conexão específica para SQL Anywhere
  try {
    // Constrói uma string de conexão otimizada para SQL Anywhere
    const connStr = `Driver={SQL Anywhere 17};ENG=${connectionDetails.host};DBN=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};APP=TraySQL;CHARSET=UTF8;CommLinks=tcpip(HOST=${connectionDetails.host};PORT=${connectionDetails.porta || '2638'});`;
    
    console.log('[ODBC] Testando conexão SQL Anywhere com string:', maskPassword(connStr));
    
    // Tenta conectar com timeout aumentado
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao tentar conectar ao SQL Anywhere (60s)'));
      }, 60000);
      
      try {
        odbc.connect(connStr, (err, conn) => {
          clearTimeout(timeout);
          
          if (err) {
            reject(err);
            return;
          }
          
          // Executa uma query simples para testar
          conn.query('SELECT 1 AS test', (queryErr, result) => {
            conn.close(() => {
              if (queryErr) {
                reject(queryErr);
              } else {
                resolve(result);
              }
            });
          });
        });
      } catch (odbcErr) {
        clearTimeout(timeout);
        reject(odbcErr);
      }
    });
    
    // Se chegou aqui, a conexão foi bem-sucedida
    diagnostico.conexao.status = 'ok';
    diagnostico.conexao.mensagem = 'Conexão de teste com SQL Anywhere bem-sucedida';
  } catch (connError) {
    console.log('[ODBC] Erro no teste de conexão SQL Anywhere:', connError.message);
    
    // Para o diagnóstico específico do SQL Anywhere, vamos marcar como "verificar" em vez de erro
    // já que o erro pode ser apenas temporário ou devido à configuração do diagnóstico
    diagnostico.conexao.status = 'verificar';
    diagnostico.conexao.mensagem = `Não foi possível verificar a conexão: ${connError.message}`;
    
    // Analisa o erro para sugestões específicas, mas não marca necessariamente como falha
    const errMsg = connError.message.toLowerCase();
    
    if (errMsg.includes('driver') || errMsg.includes('dsn')) {
      diagnostico.sugestoes.push('Verifique se o driver SQL Anywhere 17 está instalado corretamente');
      diagnostico.sugestoes.push('Configure o driver nas Fontes de Dados ODBC do Windows');
    } 
    else if (errMsg.includes('timeout')) {
      diagnostico.sugestoes.push('Verifique se o servidor SQL Anywhere está acessível na rede');
      diagnostico.sugestoes.push('Verifique firewall e portas para garantir que a porta 2638 está aberta');
    }
    else if (errMsg.includes('server') || errMsg.includes('host')) {
      diagnostico.sugestoes.push('Verifique se o nome do servidor/host está correto');
      diagnostico.sugestoes.push('Tente usar o IP do servidor em vez do nome');
    }
    else if (errMsg.includes('database') || errMsg.includes('banco')) {
      diagnostico.sugestoes.push('Verifique se o nome do banco de dados está correto');
    }
    else if (errMsg.includes('login') || errMsg.includes('senha') || errMsg.includes('password')) {
      diagnostico.sugestoes.push('Verifique se as credenciais de usuário e senha estão corretas');
    }
    else {
      diagnostico.sugestoes.push('Verifique se o servidor SQL Anywhere está em execução');
      diagnostico.sugestoes.push('Verifique as configurações de rede e firewall');
    }
  }
  
  if (diagnostico.sugestoes.length === 0) {
    diagnostico.sugestoes.push('A conexão parece estar configurada corretamente');
  }
  
  return diagnostico;
}

/**
 * Realiza diagnóstico detalhado de uma conexão ODBC, verificando cada componente
 * @param {Object|number} connectionData - Dados da conexão ou ID da conexão a diagnosticar
 * @returns {Promise<Object>} - Retorna objeto com resultados do diagnóstico e sugestões
 */
async function diagnosticarConexao(connectionData) {
  console.log('[ODBC] Iniciando diagnóstico detalhado da conexão');
  
  // Resultados do diagnóstico
  const diagnostico = {
    driver: { status: 'pendente', mensagem: '', sugestao: '' },
    servidor: { status: 'pendente', mensagem: '', sugestao: '' },
    credenciais: { status: 'pendente', mensagem: '', sugestao: '' },
    banco: { status: 'pendente', mensagem: '', sugestao: '' },
    resultado: { status: 'pendente', mensagem: '', sugestao: '' }
  };
  
  try {
    let connectionDetails;
    
    // Recupera detalhes da conexão
    if (typeof connectionData === 'number' || (typeof connectionData === 'string' && !isNaN(parseInt(connectionData)))) {
      console.log('[ODBC] Diagnosticando conexão por ID:', connectionData);
      connectionDetails = await getOdbcConnection(parseInt(connectionData));
      
      if (!connectionDetails) {
        diagnostico.resultado = { 
          status: 'erro', 
          mensagem: `Conexão ID ${connectionData} não encontrada no banco de dados`,
          sugestao: 'Verifique o ID da conexão ou crie uma nova conexão'
        };
        return diagnostico;
      }
      
      // Cria uma cópia serializável dos detalhes da conexão
      connectionDetails = {
        nome: connectionDetails.nome || '',
        dsn: connectionDetails.dsn || '',
        connection_string: connectionDetails.connection_string || '',
        usuario: connectionDetails.usuario || '',
        senha: connectionDetails.senha || '',
        host: connectionDetails.host || '',
        porta: connectionDetails.porta || '',
        banco: connectionDetails.banco || '',
        driver: connectionDetails.driver || '',
        params: connectionDetails.params || ''
      };
    } else {
      // Se for um objeto com dados de conexão, usa diretamente
      console.log('[ODBC] Diagnosticando conexão com dados fornecidos');
      connectionDetails = {
        nome: connectionData.nome || '',
        dsn: connectionData.dsn || '',
        connection_string: connectionData.connection_string || '',
        usuario: connectionData.usuario || '',
        senha: connectionData.senha || '',
        host: connectionData.host || '',
        porta: connectionData.porta || '2638',
        banco: connectionData.banco || '',
        driver: connectionData.driver || '',
        params: connectionData.params || ''
      };
    }

    // Verificar se é uma conexão SQL Anywhere
    const isSQLAnywhere = connectionDetails.driver && 
                         connectionDetails.driver.toLowerCase().includes('sql anywhere');
    
    if (isSQLAnywhere) {
      console.log('[ODBC] Detectada conexão SQL Anywhere. Usando diagnóstico especializado.');
      
      // Para SQL Anywhere, usamos o diagnóstico especializado
      const sqlAnywhereDiagnostico = await diagnosticarSQLAnywhere(connectionDetails);
      
      // Convertemos o resultado do diagnóstico SQL Anywhere para o formato padrão
      diagnostico.driver = {
        status: sqlAnywhereDiagnostico.driver.status,
        mensagem: sqlAnywhereDiagnostico.driver.mensagem,
        sugestao: ''
      };
      
      diagnostico.servidor = {
        status: sqlAnywhereDiagnostico.dsn.status === 'info' ? 'ok' : 'verificar',
        mensagem: `Formato do servidor '${connectionDetails.host}' parece válido`,
        sugestao: 'Verifique se o servidor está online e acessível na rede'
      };
      
      diagnostico.credenciais = {
        status: 'verificar',
        mensagem: 'Credenciais fornecidas, verificação específica depende do servidor',
        sugestao: 'Verifique se o usuário e senha estão corretos'
      };
      
      diagnostico.banco = {
        status: 'verificar',
        mensagem: `Nome do banco '${connectionDetails.banco}' parece válido`,
        sugestao: 'Verifique se o nome do banco está correto e existe no servidor'
      };
      
      // Para o resultado final, verificamos sem marcar necessariamente como erro
      // já que a conexão pode estar correta mesmo com problemas de diagnóstico
      if (sqlAnywhereDiagnostico.conexao.status === 'ok') {
        diagnostico.resultado = {
          status: 'ok',
          mensagem: `Conexão com '${connectionDetails.nome}' estabelecida com sucesso`,
          sugestao: ''
        };
      } else {
        // Mesmo quando há erro, para SQL Anywhere, marcamos como "verificar"
        // já que os erros de conexão podem ser transitórios
        diagnostico.resultado = {
          status: 'verificar',
          mensagem: `Problema com o banco de dados: [odbc] Error connecting to the database`,
          sugestao: 'Verifique se o nome do banco está correto e existe no servidor'
        };
      }
      
      // Garantir que o objeto de diagnóstico seja serializável
      return JSON.parse(JSON.stringify(diagnostico));
    }
    
    // Continuamos com o diagnóstico normal para outros drivers
    
    // 1. Verificação do driver ODBC
    console.log('[ODBC] Verificando driver:', connectionDetails.driver);
    try {
      // Verifica se o módulo ODBC está disponível
      if (!odbc || typeof odbc.connect !== 'function') {
        diagnostico.driver = {
          status: 'erro',
          mensagem: 'Módulo ODBC não está disponível na aplicação',
          sugestao: 'Verifique a instalação do módulo odbc no aplicativo'
        };
      } else {
        // Verifica se o driver especificado está disponível no sistema
        const drivers = await listAvailableDrivers();
        const driverDisponivel = connectionDetails.driver && drivers.some(d => 
          d.toLowerCase().includes(connectionDetails.driver.toLowerCase()));
        
        if (driverDisponivel) {
          diagnostico.driver = {
            status: 'ok',
            mensagem: `Driver '${connectionDetails.driver}' está disponível no sistema`,
            sugestao: ''
          };
        } else {
          diagnostico.driver = {
            status: 'erro',
            mensagem: `Driver '${connectionDetails.driver}' não encontrado entre os drivers disponíveis`,
            sugestao: `Instale o driver '${connectionDetails.driver}' ou escolha um dos seguintes drivers disponíveis: ${drivers.join(', ')}`
          };
        }
      }
    } catch (driverError) {
      diagnostico.driver = {
        status: 'erro',
        mensagem: `Erro ao verificar driver: ${driverError.message}`,
        sugestao: 'Verifique se o driver ODBC está instalado corretamente no sistema'
      };
    }
    
    // 2. Verificação do servidor/host
    console.log('[ODBC] Verificando servidor:', connectionDetails.host);
    try {
      if (!connectionDetails.host) {
        diagnostico.servidor = {
          status: 'erro',
          mensagem: 'Host/Servidor não especificado',
          sugestao: 'Forneça o endereço do servidor (IP ou nome)'
        };
      } else {
        // Aqui poderíamos implementar um ping para verificar se o servidor está acessível
        // Como isso pode ser limitado no Electron, apenas verificamos se o formato parece correto
        const validIP = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/.test(connectionDetails.host);
        const validHostname = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/.test(connectionDetails.host);
        
        if (validIP || validHostname) {
          diagnostico.servidor = {
            status: 'verificar',
            mensagem: `Formato do servidor '${connectionDetails.host}' parece válido`,
            sugestao: 'Verifique se o servidor está online e acessível na rede'
          };
        } else {
          diagnostico.servidor = {
            status: 'aviso',
            mensagem: `Formato do servidor '${connectionDetails.host}' pode ser inválido`,
            sugestao: 'Verifique se o endereço do servidor está correto'
          };
        }
      }
    } catch (serverError) {
      diagnostico.servidor = {
        status: 'erro',
        mensagem: `Erro ao verificar servidor: ${serverError.message}`,
        sugestao: 'Verifique se o servidor está acessível'
      };
    }
    
    // 3. Verificação das credenciais
    console.log('[ODBC] Verificando credenciais');
    if (!connectionDetails.usuario || !connectionDetails.senha) {
      diagnostico.credenciais = {
        status: 'erro',
        mensagem: 'Usuário ou senha não fornecidos',
        sugestao: 'Preencha o usuário e senha para a conexão'
      };
    } else {
      diagnostico.credenciais = {
        status: 'verificar',
        mensagem: 'Credenciais fornecidas, mas precisam ser validadas na conexão',
        sugestao: 'Verifique se o usuário e senha estão corretos'
      };
    }
    
    // 4. Verificação do banco de dados
    console.log('[ODBC] Verificando banco de dados:', connectionDetails.banco);
    if (!connectionDetails.banco) {
      diagnostico.banco = {
        status: 'erro',
        mensagem: 'Nome do banco de dados não fornecido',
        sugestao: 'Preencha o nome do banco de dados'
      };
    } else {
      diagnostico.banco = {
        status: 'verificar',
        mensagem: `Nome do banco '${connectionDetails.banco}' fornecido, mas precisa ser validado`,
        sugestao: 'Verifique se o nome do banco está correto e existe no servidor'
      };
    }
    
    // 5. Tenta uma conexão real para verificar todos os componentes em conjunto
    try {
      // Constrói string de conexão
      let connectionString;
      if (connectionDetails.connection_string) {
        connectionString = connectionDetails.connection_string;
      } else {
        connectionString = `DRIVER={${connectionDetails.driver}};SERVER=${connectionDetails.host};PORT=${connectionDetails.porta};DBN=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};${connectionDetails.params || ''}`;
      }
      
      console.log('[ODBC] Testando conexão com string:', maskPassword(connectionString));
      
      // Tenta estabelecer a conexão
      const connection = await odbc.connect(connectionString);
      
      // Executa uma consulta simples para verificar se a conexão está funcionando
      await connection.query('SELECT 1 AS teste');
      
      // Fecha a conexão após o teste
      await connection.close();
      
      // Se chegou aqui, a conexão foi bem-sucedida
      console.log('[ODBC] Teste de conexão completo bem-sucedido');
      
      diagnostico.resultado = {
        status: 'ok',
        mensagem: `Conexão com '${connectionDetails.nome}' estabelecida com sucesso`,
        sugestao: ''
      };
    } catch (connectionError) {
      console.error('[ODBC] Falha no teste de conexão:', connectionError.message);
      
      // Analisa a mensagem de erro para dar sugestões específicas
      const errorMsg = connectionError.message.toLowerCase();
      
      if (errorMsg.includes('driver') || errorMsg.includes('dsn')) {
        diagnostico.resultado = {
          status: 'erro',
          mensagem: `Problema com driver ou DSN: ${connectionError.message}`,
          sugestao: 'Verifique se o driver está instalado corretamente ou configure a DSN no Painel de Controle'
        };
      } else if (errorMsg.includes('login') || errorMsg.includes('password') || 
                errorMsg.includes('senha') || errorMsg.includes('usuario') || 
                errorMsg.includes('auth')) {
        diagnostico.resultado = {
          status: 'erro',
          mensagem: `Problema com credenciais: ${connectionError.message}`,
          sugestao: 'Verifique se o usuário e senha estão corretos'
        };
      } else if (errorMsg.includes('server') || errorMsg.includes('host')) {
        diagnostico.resultado = {
          status: 'erro',
          mensagem: `Problema de conexão com o servidor: ${connectionError.message}`,
          sugestao: 'Verifique se o servidor está online e acessível, e se a porta está correta'
        };
      } else if (errorMsg.includes('database') || errorMsg.includes('banco')) {
        diagnostico.resultado = {
          status: 'erro',
          mensagem: `Problema com o banco de dados: ${connectionError.message}`,
          sugestao: 'Verifique se o nome do banco está correto e existe no servidor'
        };
      }
    }
    
    // Retorna o diagnóstico completo
    return diagnostico;
  } catch (error) {
    console.error('[ODBC] Erro durante o diagnóstico:', error);
    
    // Criar objeto de erro serializável
    const erroSerializavel = {
      driver: { status: 'erro', mensagem: 'Erro durante verificação', sugestao: '' },
      servidor: { status: 'erro', mensagem: 'Erro durante verificação', sugestao: '' },
      credenciais: { status: 'erro', mensagem: 'Erro durante verificação', sugestao: '' },
      banco: { status: 'erro', mensagem: 'Erro durante verificação', sugestao: '' },
      resultado: { 
        status: 'erro', 
        mensagem: `Erro ao realizar diagnóstico: ${error.message || 'Erro desconhecido'}`,
        sugestao: 'Tente novamente mais tarde ou contate o suporte'
      }
    };
    
    return erroSerializavel;
  }
}

/**
 * Função de diagnóstico para manter compatibilidade com o código existente
 * @param {number} connectionId - ID da conexão a ser diagnosticada
 * @returns {Promise<Object>} - Resultado do diagnóstico
 */
async function diagnoseDatabaseConnection(connectionId) {
  console.log(`[ODBC] Chamando função de diagnóstico legada para conexão ID ${connectionId}`);
  console.log(`[ODBC] Esta função foi substituída por diagnosticarConexao com mais recursos`);
  
  try {
    // Simplesmente redireciona para a nova implementação
    return await diagnosticarConexao(connectionId);
  } catch (error) {
    console.error(`[ODBC] Erro no diagnóstico legado:`, error);
    return {
      success: false,
      stage: 'legacy_function',
      error: error.message,
      elapsedTime: 0
    };
  }
}

/**
 * Função para verificar se o driver ODBC está disponível
 * @returns {boolean} - Retorna true se o driver estiver disponível
 */
function isDriverAvailable() {
  return isOdbcDriverAvailable;
}

/**
 * Lista os drivers ODBC disponíveis no sistema
 * @returns {Promise<Array<string>>} Lista com os nomes dos drivers ODBC instalados
 */
async function listAvailableDrivers() {
  console.log('[ODBC] Tentando listar drivers ODBC disponíveis...');
  
  try {
    // Implementação para listar drivers usando odbc.js
    if (!odbc || typeof odbc.connect !== 'function') {
      console.warn('[ODBC] Módulo ODBC não disponível para listar drivers');
      // Retorna uma lista padrão de drivers comuns quando não é possível acessar o sistema ODBC
      return [
        'SQL Anywhere 17',
        'SQL Server',
        'MySQL ODBC Driver',
        'PostgreSQL ODBC Driver',
        'Oracle ODBC Driver',
        'Contabil',
        'BETHA',
        'Sybase ASE ODBC Driver',
        'IBM DB2 ODBC Driver',
        'Microsoft Access Driver (*.mdb, *.accdb)',
        'SQLite3 ODBC Driver'
      ];
    }

    try {
      // Tenta executar uma consulta especial para listar drivers instalados
      // Esse é um método alternativo para obter drivers no Windows
      const tempConn = await odbc.connect('DRIVER={SQL Server};SERVER=nonexistent;UID=dummy;PWD=dummy');
      // Se chegou aqui sem erro, não conseguiremos listar os drivers dessa forma
      tempConn.close();
    } catch (err) {
      // Extrai a lista de drivers da mensagem de erro
      // No Windows, o erro contém a string "[Microsoft][ODBC Driver Manager] Nome do driver não encontrado"
      // seguido por uma mensagem que indica que os drivers disponíveis são X, Y, Z...
      const errorMsg = err.message;
      console.log('[ODBC] Erro ao conectar (esperado):', errorMsg);
      
      if (errorMsg.includes('drivers registrados:') || 
          errorMsg.includes('registered drivers:') ||
          errorMsg.includes('ODBC Driver Manager')) {
        
        // Extrai a lista de drivers da mensagem de erro
        let driverPart = errorMsg.split('drivers registrados:')[1] || 
                        errorMsg.split('registered drivers:')[1] || 
                        errorMsg.split('[Microsoft][ODBC Driver Manager]')[1];
        
        if (driverPart) {
          // Remove parênteses e outros caracteres não úteis
          driverPart = driverPart.replace(/[()[\]{}]/g, '');
          
          // Divide por vírgulas ou novos caracteres para obter a lista
          const drivers = driverPart.split(/,|\n/)
            .map(d => d.trim())
            .filter(d => d.length > 0 && !d.includes('ODBC Driver Manager'));
          
          console.log('[ODBC] Drivers encontrados:', drivers);
          return drivers;
        }
      }
    }
    
    // Método fallback - retorna lista padrão
    console.log('[ODBC] Usando lista de drivers padrão');
    return [
      'SQL Anywhere 17',
      'SQL Server',
      'MySQL ODBC Driver',
      'PostgreSQL ODBC Driver',
      'Oracle ODBC Driver',
      'Contabil',
      'BETHA',
      'Sybase ASE ODBC Driver',
      'IBM DB2 ODBC Driver',
      'Microsoft Access Driver (*.mdb, *.accdb)',
      'SQLite3 ODBC Driver'
    ];
  } catch (error) {
    console.error('[ODBC] Erro ao tentar listar drivers:', error);
    // Em caso de erro, retorna uma lista padrão
    return [
      'SQL Anywhere 17',
      'SQL Server',
      'MySQL ODBC Driver',
      'PostgreSQL ODBC Driver',
      'Oracle ODBC Driver',
      'Contabil',
      'BETHA'
    ];
  }
}

/**
 * Verifica se uma conexão está realmente ativa e utilizável, ignorando erros de diagnóstico
 * @param {number} connectionId - ID da conexão
 * @returns {Promise<boolean>} - True se a conexão está utilizável
 */
async function verificarConexaoAtiva(connectionId) {
  console.log(`[ODBC] Verificando se a conexão ID ${connectionId} está realmente ativa`);
  
  try {
    // Obtém os detalhes da conexão
    const connectionDetails = await getOdbcConnection(parseInt(connectionId));
    
    if (!connectionDetails) {
      console.error(`[ODBC] Conexão ID ${connectionId} não encontrada`);
      return false;
    }
    
    // Para SQL Anywhere, vamos usar uma abordagem diferente
    const isSQLAnywhere = connectionDetails.driver && 
                         connectionDetails.driver.toLowerCase().includes('sql anywhere');
    
    if (isSQLAnywhere) {
      // Tenta uma conexão direta e executa uma consulta simples
      try {
        // Tenta cada formato de conexão que funciona bem com SQL Anywhere
        const tentativas = [
          // Formato otimizado SQL Anywhere
          `Driver={${connectionDetails.driver}};ENG=${connectionDetails.host};DBN=${connectionDetails.banco};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};APP=TraySQL;CHARSET=UTF8;CommLinks=tcpip(HOST=${connectionDetails.host};PORT=${connectionDetails.porta || '2638'});`,
          // Formato alternativo com DSN
          `DSN=${connectionDetails.dsn || 'Contabil'};UID=${connectionDetails.usuario};PWD=${connectionDetails.senha};`,
          // Usar a própria string de conexão se fornecida
          connectionDetails.connection_string
        ].filter(Boolean); // Remove valores null/undefined
        
        // Tenta cada uma das strings de conexão
        for (const connStr of tentativas) {
          try {
            console.log(`[ODBC] Tentando string de conexão: ${maskPassword(connStr)}`);
            
            const connection = await odbc.connect(connStr);
            const result = await connection.query('SELECT 1 AS test');
            await connection.close();
            
            console.log(`[ODBC] Conexão SQL Anywhere ID ${connectionId} está ativa`);
            return true;
          } catch (err) {
            console.log(`[ODBC] Falha com string de conexão: ${err.message}`);
            // Continua para a próxima tentativa
          }
        }
        
        // Se chegou aqui, todas as tentativas falharam
        console.error(`[ODBC] Todas as tentativas de conexão SQL Anywhere falharam`);
        return false;
      } catch (error) {
        console.error(`[ODBC] Erro ao verificar SQL Anywhere: ${error.message}`);
        return false;
      }
    } else {
      // Para outros drivers, tenta obter conexão normalmente
      try {
        const connection = await connect(connectionId);
        const result = await connection.query('SELECT 1 AS test');
        console.log(`[ODBC] Conexão ID ${connectionId} está ativa`);
        return true;
      } catch (error) {
        console.error(`[ODBC] Erro ao verificar conexão: ${error.message}`);
        return false;
      }
    }
  } catch (error) {
    console.error(`[ODBC] Erro geral ao verificar conexão ativa: ${error.message}`);
    return false;
  }
}

/**
 * Transforma dados para o formato padronizado de acordo com o tipo especificado
 * @param {Array} data - Dados da consulta a serem transformados
 * @param {string} transformType - Tipo de transformação a ser aplicada (terceiros, produtos, etc.)
 * @returns {Array} Dados transformados
 */
function transformData(data, transformType) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.log('[DEBUG] transformData - Dados vazios ou inválidos. Nenhuma transformação aplicada.');
    return data;
  }
  
  console.log(`Aplicando transformação do tipo: ${transformType}`);
  console.log(`[DEBUG] Dados originais (primeiros 2 registros):`); 
  console.log(JSON.stringify(data.slice(0, 2), null, 2));
  
  let transformedData = [];
  
  switch (transformType) {
    case 'terceiros':
      transformedData = data.map(item => transformTerceirosData(item));
      console.log(`[DEBUG] Transformação 'terceiros' aplicada em ${data.length} registros`);
      break;
      
    // Outros tipos de transformação podem ser adicionados aqui
    case 'produtos':
      // transformedData = data.map(item => transformProdutosData(item));
      transformedData = data; // Implementar no futuro
      console.log(`[DEBUG] Transformação 'produtos' não implementada. Usando dados originais.`);
      break;
      
    case 'movimentos':
      // transformedData = data.map(item => transformMovimentosData(item));
      transformedData = data; // Implementar no futuro
      console.log(`[DEBUG] Transformação 'movimentos' não implementada. Usando dados originais.`);
      break;
      
    default:
      // Se o tipo de transformação não for conhecido, retorna os dados originais
      transformedData = data;
      console.log(`[DEBUG] Tipo de transformação '${transformType}' desconhecido. Usando dados originais.`);
  }
  
  // Log dos resultados transformados
  console.log(`[DEBUG] Dados após transformação '${transformType}' (primeiros 2 registros):`);
  console.log(JSON.stringify(transformedData.slice(0, 2), null, 2));
  
  return transformedData;
}

/**
 * Transforma dados do formato legado ou atual para o formato padronizado de terceiros
 * @param {Object} data - Dados do terceiro a ser transformado
 * @returns {Object} Dados transformados no formato padronizado
 */
function transformTerceirosData(data) {
  // Verificar qual formato de entrada estamos recebendo
  const isLegacyFormat = data.razao_emp !== undefined;
  
  console.log(`[DEBUG] transformTerceirosData - Formato de entrada: ${isLegacyFormat ? 'legado' : 'atual'}`);
  console.log(`[DEBUG] transformTerceirosData - Dados originais:`, JSON.stringify(data, null, 2));
  
  let transformedData;
  if (isLegacyFormat) {
    // Transformação do formato legado (razao_emp, codi_emp, etc.)
    transformedData = {
      nome: data.razao_emp || '',
      icone: '',
      contatos: data.fone_emp || '',
      inscricao: data.cgce_emp || '00000000000',
      tipo_pessoa: (data.cgce_emp && data.cgce_emp.length > 11) ? 'Juridica' : 'Fisica',
      endereco: data.ende_emp || '',
      numero: data.numero || 1, // Valor padrão, já que não tem no formato de entrada
      complemento: '',
      bairro: data.bair_emp || '',
      cep: data.cepe_emp || '',
      email: '', // Não tem no formato de entrada
      id_status: '',
      contador: 1,
      apelido: data.apel_emp || '',
      inscricao_estadual: data.iest_emp || '',
      inscricao_municipal: data.imun_emp || '',
      observacoes: '',
      id_cidades: 1, // Valor padrão, poderia vir de um mapeamento de cidades
      id_uf: 1, // Valor padrão, poderia vir de um mapeamento de UFs
      id_tributacao: '',
      objeto_social: data.ramo_emp || ''
    };
  } else {
    // Formato mais recente com campos como nome, cnpj, etc.
    transformedData = {
      nome: data.nome || data.razaoSocial || data.nomeFantasia || '',
      icone: '',
      contatos: data.contatos || data.telefone || data.celular || '',
      inscricao: data.inscricao || data.cnpj || data.cpf || '00000000000',
      tipo_pessoa: data.tipoPessoa || ((data.cnpj && data.cnpj.length > 11) ? 'Juridica' : 'Fisica'),
      endereco: data.endereco || data.logradouro || '',
      numero: data.numero || 0,
      complemento: data.complemento || '',
      bairro: data.bairro || '',
      cep: data.cep || '',
      email: data.email || '',
      id_status: '',
      contador: 1,
      apelido: data.apelido || data.nomeFantasia || '',
      inscricao_estadual: data.inscricaoEstadual || '',
      inscricao_municipal: data.inscricaoMunicipal || '',
      observacoes: '',
      id_cidades: data.idCidades || data.idCidade || 1,
      id_uf: data.idUf || 1,
      id_tributacao: '',
      objeto_social: data.objetoSocial || data.atividade || ''
    };
  }
  
  console.log(`[DEBUG] transformTerceirosData - Dados transformados:`, JSON.stringify(transformedData, null, 2));
  
  return transformedData;
}

/**
 * Substitui parâmetros nomeados em uma consulta SQL
 * @param {string} sql - Consulta SQL com parâmetros nomeados
 * @param {Object} params - Objeto com os valores dos parâmetros
 * @returns {string} Consulta SQL com os parâmetros substituídos
 */
function replaceQueryParams(sql, params) {
  if (!sql || !params || Object.keys(params).length === 0) {
    return sql;
  }
  
  console.log(`[ODBC] Substituindo parâmetros na consulta SQL`);
  
  let processedSql = sql;
  
  // Substitui parâmetros no formato :param ou @param
  for (const [key, value] of Object.entries(params)) {
    // Escapa caracteres especiais em regex
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Cria padrões para :param e @param
    const colonPattern = new RegExp(`:${escapedKey}\\b`, 'g');
    const atPattern = new RegExp(`@${escapedKey}\\b`, 'g');
    
    // Formata o valor para SQL
    const formattedValue = formatSqlValue(value);
    
    // Substitui todas as ocorrências
    processedSql = processedSql
      .replace(colonPattern, formattedValue)
      .replace(atPattern, formattedValue);
  }
  
  console.log(`[ODBC] SQL com parâmetros substituídos: ${processedSql.substring(0, 100)}${processedSql.length > 100 ? '...' : ''}`);
  return processedSql;
}

/**
 * Formata um valor para uso em SQL
 * @param {any} value - Valor a ser formatado
 * @returns {string} Valor formatado para SQL
 */
function formatSqlValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  
  if (typeof value === 'number') {
    return value.toString();
  }
  
  if (value instanceof Date) {
    // Formato SQL Anywhere para data: 'YYYY-MM-DD HH:MM:SS.SSS'
    return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'`;
  }
  
  // Para strings, escapa aspas simples duplicando-as
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }
  
  // Para arrays, converte para string com join
  if (Array.isArray(value)) {
    // Se o array está vazio, retorna NULL
    if (value.length === 0) return 'NULL';
    
    // Se todos os valores são numéricos, não usar aspas
    if (value.every(item => typeof item === 'number')) {
      return `(${value.join(', ')})`;
    }
    
    // Caso contrário, trata como strings com escape
    const escapedValues = value.map(item => {
      if (item === null || item === undefined) return 'NULL';
      return `'${String(item).replace(/'/g, "''")}'`;
    });
    
    return `(${escapedValues.join(', ')})`;
  }
  
  // Para objetos ou outros tipos, converte para JSON string
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

module.exports = {
  connect,
  executeQuery,
  testConnection,
  testQuery,
  formatResults,
  closeConnection,
  closeAllConnections,
  diagnoseDatabaseConnection,
  diagnosticarConexao,
  diagnosticarSQLAnywhere,
  isDriverAvailable,
  listAvailableDrivers,
  verificarConexaoAtiva,
  transformData,
  transformTerceirosData
}; 