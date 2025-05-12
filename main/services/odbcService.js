async function executeQuery(connectionId, sql, params = {}) {
  console.log(`[ODBC] Solicitação para executar consulta no banco ID ${connectionId}`);
  console.log(`[ODBC] SQL completo: ${sql}`);
  
  // Valida a entrada
  if (!sql || typeof sql !== 'string' || sql.trim() === '') {
    throw new Error('Consulta SQL inválida ou vazia');
  }
  
  // Inicializa contadores e registros de tempo
  const startTime = Date.now();
  let connection = null;
  
  try {
    console.log(`[ODBC] Preparando para executar SQL: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);
    
    // Verifica se há parâmetros para substituir
    if (params && Object.keys(params).length > 0) {
      console.log(`[ODBC] Substituindo parâmetros na consulta:`, params);
      sql = replaceQueryParams(sql, params);
      console.log(`[ODBC] SQL após substituição de parâmetros: ${sql}`);
    }
    
    // Conecta ao banco de dados
    console.time(`[ODBC] Tempo para estabelecer conexão para consulta`);
    console.log(`[ODBC] Tentando conectar ao banco ID ${connectionId}...`);
    connection = await connect(connectionId);
    console.timeEnd(`[ODBC] Tempo para estabelecer conexão para consulta`);
    console.log(`[ODBC] Conexão estabelecida com sucesso, tipo de conexão:`, 
                connection.isSimulated ? 'Simulada' : 'Real');
    
    // Executa a consulta
    console.time(`[ODBC] Tempo de execução da consulta SQL`);
    console.log(`[ODBC] Executando consulta SQL...`);
    
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
        console.log(`[ODBC] Estrutura do primeiro registro:`, Object.keys(result[0]));
      } else {
        console.log(`[ODBC] Nenhum registro retornado pela consulta`);
      }
      
      // Registra evento de consulta no log
      await log(
        'info', 
        `Consulta executada com sucesso: ${recordCount} registros retornados em ${executionTime}ms`
      );
      
      return result;
    } catch (queryError) {
      console.error(`[ODBC] Erro específico na execução da consulta:`, queryError);
      console.error(`[ODBC] Detalhes completos do erro:`, JSON.stringify(queryError, null, 2));
      throw queryError; // Propaga o erro para o tratamento geral
    }
  } catch (error) {
    // Calcula o tempo total até o erro
    const executionTime = Date.now() - startTime;
    
    console.error(`[ODBC] Erro ao executar consulta (${executionTime}ms):`, error);
    console.error(`[ODBC] Stack de erro:`, error.stack);
    
    // Formata a mensagem de erro de forma mais amigável
    let errorMessage = `Erro ao executar consulta: ${error.message}`;
    const originalErrorMsg = error.message.toLowerCase();
    
    // Detecta e formata erros comuns de SQL
    if (originalErrorMsg.includes('syntax') || originalErrorMsg.includes('sintaxe')) {
      errorMessage = `Erro de sintaxe SQL: Verifique a sintaxe da sua consulta. ${error.message}`;
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

async function connect(connectionId) {
  const startTime = Date.now();
  console.log(`[ODBC] Iniciando conexão com ID: ${connectionId} (${new Date().toISOString()})`);
  
  try {
    // Busca as informações de conexão do banco de dados
    console.log(`[ODBC] Buscando detalhes da conexão ${connectionId} no banco local`);
    const connection = await database.getConnectionById(connectionId);
    
    if (!connection) {
      throw new Error(`Conexão com ID ${connectionId} não encontrada`);
    }
    
    console.log(`[ODBC] Detalhes da conexão encontrados:`, JSON.stringify({
      id: connection.id,
      name: connection.name,
      driver: connection.driver,
      server: connection.server,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      // senha omitida por segurança
    }));
    
    // Verificar se o modo de simulação está ativado
    if (connection.simulated === 1) {
      console.log(`[ODBC] Conexão ${connectionId} está configurada para modo simulado`);
      return new SimulatedOdbcConnection(connection);
    }
    
    // Verificar se é possível se conectar ao banco
    console.log(`[ODBC] Verificando driver ODBC para: ${connection.driver}`);
    await checkOdbcDriver(connection.driver);
    console.log(`[ODBC] Driver ODBC verificado com sucesso: ${connection.driver}`);
    
    // Constrói a string de conexão
    const connectionString = buildConnectionString(connection);
    console.log(`[ODBC] String de conexão (sem senha): ${connectionString.replace(/PWD=[^;]*;/i, 'PWD=****;')}`);
    
    // Cria a conexão ODBC
    console.time(`[ODBC] Tempo para criar conexão ODBC`);
    console.log(`[ODBC] Tentando conectar via ODBC para ${connection.server}:${connection.port}/${connection.database}...`);
    
    const odbcConnection = new odbc.Connection();
    
    try {
      console.log(`[ODBC] Chamando odbcConnection.connect() com a string de conexão`);
      await odbcConnection.connect(connectionString);
      
      console.timeEnd(`[ODBC] Tempo para criar conexão ODBC`);
      const connectionTime = Date.now() - startTime;
      console.log(`[ODBC] Conexão ODBC estabelecida com sucesso em ${connectionTime}ms`);
      
      // Testa a conexão com uma query simples
      try {
        console.log(`[ODBC] Executando query de teste na conexão...`);
        const testResult = await odbcConnection.query('SELECT 1 AS test');
        console.log(`[ODBC] Query de teste executada com sucesso. Resultado:`, testResult);
      } catch (testError) {
        console.warn(`[ODBC] A query de teste falhou, mas a conexão foi estabelecida:`, testError);
      }
      
      // Retorna um objeto de conexão ODBC
      return new RealOdbcConnection(odbcConnection, connection);
    } catch (connectionError) {
      console.error(`[ODBC] Erro ao conectar via ODBC:`, connectionError);
      console.error(`[ODBC] Mensagem de erro:`, connectionError.message);
      console.error(`[ODBC] Stack de erro:`, connectionError.stack);
      
      // Tenta extrair mais informações do erro
      let errorDetails = '';
      if (connectionError.odbcErrors && connectionError.odbcErrors.length > 0) {
        errorDetails = connectionError.odbcErrors.map(e => 
          `[Código: ${e.code}] ${e.message}`).join('; ');
        console.error(`[ODBC] Detalhes do erro ODBC:`, errorDetails);
      }
      
      throw new Error(
        `Falha ao conectar com o banco de dados via ODBC. ` +
        `${connectionError.message} ${errorDetails ? `Detalhes: ${errorDetails}` : ''}`
      );
    }
  } catch (error) {
    const errorTime = Date.now() - startTime;
    console.error(`[ODBC] Erro geral na função connect após ${errorTime}ms:`, error);
    
    // Registra o erro
    await log('error', `Falha ao conectar ao banco de dados: ${error.message}`);
    
    throw error;
  }
}

function buildConnectionString(connection) {
  console.log(`[ODBC] Construindo string de conexão para ${connection.name}`);
  
  if (!connection.driver) {
    console.error('[ODBC] Erro: Driver não especificado na configuração da conexão');
    throw new Error('Driver ODBC não especificado na configuração da conexão');
  }
  
  let connectionString = `DSN=${connection.driver};`;
  
  if (connection.server) {
    connectionString += `SERVER=${connection.server};`;
    console.log(`[ODBC] Adicionado SERVER=${connection.server}`);
  }
  
  if (connection.database) {
    connectionString += `DATABASE=${connection.database};`;
    console.log(`[ODBC] Adicionado DATABASE=${connection.database}`);
  } else {
    console.warn('[ODBC] Aviso: Nome do banco de dados não especificado');
  }
  
  if (connection.port) {
    connectionString += `PORT=${connection.port};`;
    console.log(`[ODBC] Adicionado PORT=${connection.port}`);
  } else {
    console.warn('[ODBC] Aviso: Porta não especificada, usando porta padrão do driver');
  }
  
  if (connection.username) {
    connectionString += `UID=${connection.username};`;
    console.log(`[ODBC] Adicionado UID=${connection.username}`);
  }
  
  if (connection.password) {
    connectionString += `PWD=${connection.password};`;
    console.log('[ODBC] Adicionada senha à string de conexão (não exibida por segurança)');
  } else {
    console.warn('[ODBC] Aviso: Senha não especificada na conexão');
  }
  
  // Adiciona opções extras baseadas no driver
  if (connection.driver.toLowerCase().includes('sql anywhere')) {
    // Opções específicas para SQL Anywhere
    connectionString += `APP=TraySQL;CHARSET=UTF8;`;
    console.log('[ODBC] Adicionadas opções específicas para SQL Anywhere: APP=TraySQL;CHARSET=UTF8');
  } else if (connection.driver.toLowerCase().includes('sql server')) {
    // Opções específicas para SQL Server
    connectionString += `APP=TraySQL;Trusted_Connection=No;`;
    console.log('[ODBC] Adicionadas opções específicas para SQL Server: APP=TraySQL;Trusted_Connection=No');
  } else if (connection.driver.toLowerCase().includes('mysql')) {
    // Opções específicas para MySQL
    connectionString += `CHARSET=utf8;`;
    console.log('[ODBC] Adicionada opção específica para MySQL: CHARSET=utf8');
  }
  
  // Adiciona parâmetro de timeout
  connectionString += `TIMEOUT=30;`;
  console.log('[ODBC] Adicionado TIMEOUT=30 segundos');
  
  console.log(`[ODBC] String de conexão construída (sem senha): ${connectionString.replace(/PWD=[^;]*;/i, 'PWD=****;')}`);
  return connectionString;
}

const executeQuery = async (connection, query, params = []) => {
  try {
    console.log(`[ODBC] Iniciando execução de consulta. Conexão: ${connection.name}`);
    console.log(`[ODBC] SQL: ${query}`);
    console.log(`[ODBC] Parâmetros: ${JSON.stringify(params)}`);

    // Verificações iniciais
    if (!connection || !connection.id) {
      console.error('[ODBC] Erro: Objeto de conexão inválido ou incompleto');
      throw new Error('Conexão inválida ou incompleta');
    }
    
    if (!query || query.trim() === '') {
      console.error('[ODBC] Erro: Consulta SQL vazia ou inválida');
      throw new Error('Consulta SQL vazia ou inválida');
    }

    // Constrói a string de conexão
    const connectionString = buildConnectionString(connection);
    console.log('[ODBC] Conectando ao banco de dados...');
    
    // Registra início da operação com timestamp
    const startTime = new Date();
    console.log(`[ODBC] Timestamp de início: ${startTime.toISOString()}`);

    // Estabelecer conexão
    const odbcConn = await connect(connectionString);
    console.log('[ODBC] Conexão estabelecida com sucesso');
    
    // Prepara a consulta com parâmetros
    const preparedQuery = prepareQuery(query, params);
    console.log(`[ODBC] Consulta preparada: ${preparedQuery.query}`);
    console.log(`[ODBC] Parâmetros após preparação: ${JSON.stringify(preparedQuery.params)}`);

    // Executa consulta
    console.log('[ODBC] Executando consulta...');
    const result = await odbcConn.query(preparedQuery.query, preparedQuery.params);
    
    // Registra conclusão da operação
    const endTime = new Date();
    const executionTime = (endTime - startTime) / 1000; // Tempo em segundos
    console.log(`[ODBC] Consulta executada com sucesso em ${executionTime.toFixed(2)} segundos`);
    
    if (result && Array.isArray(result)) {
      console.log(`[ODBC] Resultado obtido: ${result.length} linhas`);
      
      // Log de amostra do resultado (primeiras 2 linhas)
      if (result.length > 0) {
        console.log('[ODBC] Amostra do resultado:');
        console.log(JSON.stringify(result.slice(0, 2), null, 2));
      }
    } else {
      console.log('[ODBC] Resultado obtido não é um array ou está vazio');
    }

    // Fecha a conexão
    await odbcConn.close();
    console.log('[ODBC] Conexão fechada');
    
    return result;
  } catch (error) {
    console.error(`[ODBC] Erro durante a execução da consulta: ${error.message}`);
    console.error(`[ODBC] Stack trace: ${error.stack}`);
    
    // Informações adicionais sobre o erro
    if (error.sqlState) {
      console.error(`[ODBC] SQL State: ${error.sqlState}`);
    }
    if (error.code) {
      console.error(`[ODBC] Código de erro: ${error.code}`);
    }

    throw {
      message: `Erro ao executar consulta: ${error.message}`,
      originalError: error,
      query: query,
      connection: {
        id: connection.id,
        name: connection.name,
        driver: connection.driver,
        server: connection.server
      }
    };
  }
};

// Função para preparar a consulta com parâmetros (evita SQL injection)
const prepareQuery = (query, params) => {
  let preparedQuery = query;
  const preparedParams = [];
  
  // Se não há parâmetros, retorna a consulta original
  if (!params || params.length === 0) {
    console.log('[ODBC] Nenhum parâmetro fornecido, retornando consulta original');
    return { query: preparedQuery, params: preparedParams };
  }

  try {
    // Verifica se a consulta usa ? para parâmetros ou :param1, :param2, etc.
    if (query.includes('?')) {
      console.log('[ODBC] Consulta usa marcadores "?" para parâmetros');
      
      // Conta os marcadores de parâmetro
      const paramCount = (query.match(/\?/g) || []).length;
      console.log(`[ODBC] Detectados ${paramCount} marcadores de parâmetros`);
      
      if (paramCount !== params.length) {
        console.warn(`[ODBC] Aviso: Número de parâmetros (${params.length}) difere do número de marcadores (${paramCount})`);
      }
      
      return { query: preparedQuery, params };
    } else {
      // Assumir que os parâmetros estão no formato :param1, :param2, etc.
      console.log('[ODBC] Consulta parece usar parâmetros nomeados');
      
      // Se for um objeto, converte para array
      if (!Array.isArray(params) && typeof params === 'object') {
        console.log('[ODBC] Convertendo parâmetros de objeto para array');
        
        // Converte os parâmetros nomeados em ? e cria um array com os valores
        Object.keys(params).forEach(key => {
          const paramPlaceholder = `:${key}`;
          if (preparedQuery.includes(paramPlaceholder)) {
            preparedQuery = preparedQuery.replace(new RegExp(`:${key}\\b`, 'g'), '?');
            preparedParams.push(params[key]);
            console.log(`[ODBC] Substituído parâmetro "${key}" com valor: ${params[key]}`);
          } else {
            console.warn(`[ODBC] Aviso: Parâmetro "${key}" não encontrado na consulta`);
          }
        });
      } else {
        console.log('[ODBC] Usando parâmetros fornecidos diretamente');
        return { query: preparedQuery, params };
      }
    }
    
    console.log(`[ODBC] Consulta preparada: ${preparedQuery}`);
    console.log(`[ODBC] Parâmetros preparados: ${JSON.stringify(preparedParams)}`);
    
    return { query: preparedQuery, params: preparedParams };
  } catch (error) {
    console.error(`[ODBC] Erro ao preparar consulta: ${error.message}`);
    // Retorna a consulta original em caso de erro
    return { query, params };
  }
};

/**
 * Realiza diagnóstico detalhado de uma conexão ODBC, verificando cada componente
 * @param {number} connectionId - ID da conexão a diagnosticar
 * @returns {Promise<Object>} - Retorna objeto com resultados do diagnóstico e sugestões
 */
async function diagnosticarConexao(connectionId) {
  console.log('[ODBC] Iniciando diagnóstico detalhado da conexão ID:', connectionId);
  
  // Resultados do diagnóstico
  const diagnostico = {
    driver: { status: 'pendente', mensagem: '', sugestao: '' },
    servidor: { status: 'pendente', mensagem: '', sugestao: '' },
    credenciais: { status: 'pendente', mensagem: '', sugestao: '' },
    banco: { status: 'pendente', mensagem: '', sugestao: '' },
    resultado: { status: 'pendente', mensagem: '', sugestao: '' }
  };
  
  try {
    // Recupera detalhes da conexão
    console.log('[ODBC] Buscando detalhes da conexão no banco local');
    const connection = await database.getConnectionById(connectionId);
    
    if (!connection) {
      diagnostico.resultado = { 
        status: 'erro', 
        mensagem: `Conexão ID ${connectionId} não encontrada no banco de dados`,
        sugestao: 'Verifique o ID da conexão ou crie uma nova conexão'
      };
      return diagnostico;
    }
    
    console.log('[ODBC] Detalhes da conexão encontrados:', JSON.stringify({
      id: connection.id,
      name: connection.name,
      driver: connection.driver,
      server: connection.server,
      port: connection.port,
      database: connection.database,
      username: connection.username
      // senha omitida por segurança
    }));
    
    // 1. Verificação do driver ODBC
    console.log('[ODBC] Verificando driver:', connection.driver);
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
        console.log('[ODBC] Drivers disponíveis:', drivers);
        
        const driverDisponivel = connection.driver && drivers.some(d => 
          d.toLowerCase().includes(connection.driver.toLowerCase()));
        
        if (driverDisponivel) {
          diagnostico.driver = {
            status: 'ok',
            mensagem: `Driver '${connection.driver}' está disponível no sistema`,
            sugestao: ''
          };
        } else {
          diagnostico.driver = {
            status: 'erro',
            mensagem: `Driver '${connection.driver}' não encontrado entre os drivers disponíveis`,
            sugestao: `Instale o driver '${connection.driver}' ou escolha um dos seguintes drivers disponíveis: ${drivers.join(', ')}`
          };
        }
      }
    } catch (driverError) {
      console.error('[ODBC] Erro ao verificar driver:', driverError);
      diagnostico.driver = {
        status: 'erro',
        mensagem: `Erro ao verificar driver: ${driverError.message}`,
        sugestao: 'Verifique se o driver ODBC está instalado corretamente no sistema'
      };
    }
    
    // 2. Verificação do servidor/host
    console.log('[ODBC] Verificando servidor:', connection.server);
    try {
      if (!connection.server) {
        diagnostico.servidor = {
          status: 'erro',
          mensagem: 'Host/Servidor não especificado',
          sugestao: 'Forneça o endereço do servidor (IP ou nome)'
        };
      } else {
        // Aqui poderíamos implementar um ping para verificar se o servidor está acessível
        // Como isso pode ser limitado no Electron, apenas verificamos se o formato parece correto
        const validIP = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/.test(connection.server);
        const validHostname = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/.test(connection.server);
        
        if (validIP || validHostname) {
          diagnostico.servidor = {
            status: 'verificar',
            mensagem: `Formato do servidor '${connection.server}' parece válido`,
            sugestao: 'Verifique se o servidor está online e acessível na rede'
          };
        } else {
          diagnostico.servidor = {
            status: 'aviso',
            mensagem: `Formato do servidor '${connection.server}' pode ser inválido`,
            sugestao: 'Verifique se o endereço do servidor está correto'
          };
        }
      }
    } catch (serverError) {
      console.error('[ODBC] Erro ao verificar servidor:', serverError);
      diagnostico.servidor = {
        status: 'erro',
        mensagem: `Erro ao verificar servidor: ${serverError.message}`,
        sugestao: 'Verifique se o servidor está acessível'
      };
    }
    
    // 3. Verificação das credenciais
    console.log('[ODBC] Verificando credenciais');
    if (!connection.username || !connection.password) {
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
    console.log('[ODBC] Verificando banco de dados:', connection.database);
    if (!connection.database) {
      diagnostico.banco = {
        status: 'erro',
        mensagem: 'Nome do banco de dados não fornecido',
        sugestao: 'Preencha o nome do banco de dados'
      };
    } else {
      diagnostico.banco = {
        status: 'verificar',
        mensagem: `Nome do banco '${connection.database}' fornecido, mas precisa ser validado`,
        sugestao: 'Verifique se o nome do banco está correto e existe no servidor'
      };
    }
    
    // 5. Tenta uma conexão real para verificar todos os componentes em conjunto
    try {
      // Constrói string de conexão
      const connectionString = buildConnectionString(connection);
      console.log('[ODBC] Testando conexão com string (sem senha):', 
                 connectionString.replace(/PWD=[^;]*;/i, 'PWD=****;'));
      
      // Tenta estabelecer a conexão
      const odbcConn = await odbc.connect(connectionString);
      
      // Executa uma consulta simples para verificar se a conexão está funcionando
      await odbcConn.query('SELECT 1 AS teste');
      
      // Fecha a conexão após o teste
      await odbcConn.close();
      
      // Se chegou aqui, a conexão foi bem-sucedida
      console.log('[ODBC] Teste de conexão completo bem-sucedido');
      
      diagnostico.resultado = {
        status: 'ok',
        mensagem: `Conexão com '${connection.name}' estabelecida com sucesso`,
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
      } else if (errorMsg.includes('server') || errorMsg.includes('host') || 
                errorMsg.includes('connect') || errorMsg.includes('network')) {
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
      } else {
        diagnostico.resultado = {
          status: 'erro',
          mensagem: `Falha na conexão: ${connectionError.message}`,
          sugestao: 'Verifique todos os parâmetros de conexão e tente novamente'
        };
      }
    }
    
    // Retorna o diagnóstico completo
    return diagnostico;
  } catch (error) {
    console.error('[ODBC] Erro durante o diagnóstico:', error);
    return {
      driver: { status: 'erro', mensagem: 'Erro durante verificação', sugestao: '' },
      servidor: { status: 'erro', mensagem: 'Erro durante verificação', sugestao: '' },
      credenciais: { status: 'erro', mensagem: 'Erro durante verificação', sugestao: '' },
      banco: { status: 'erro', mensagem: 'Erro durante verificação', sugestao: '' },
      resultado: { 
        status: 'erro', 
        mensagem: `Erro ao realizar diagnóstico: ${error.message}`,
        sugestao: 'Tente novamente mais tarde ou contate o suporte'
      }
    };
  }
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
    const connection = await database.getConnectionById(connectionId);
    
    if (!connection) {
      console.error(`[ODBC] Conexão ID ${connectionId} não encontrada`);
      return false;
    }
    
    // Para SQL Anywhere, vamos usar uma abordagem diferente
    const isSQLAnywhere = connection.driver && 
                         connection.driver.toLowerCase().includes('sql anywhere');
    
    if (isSQLAnywhere) {
      // Tenta uma conexão direta e executa uma consulta simples
      try {
        // Tenta cada formato de conexão que funciona bem com SQL Anywhere
        const tentativas = [
          // Formato otimizado SQL Anywhere
          `Driver={${connection.driver}};ENG=${connection.server};DBN=${connection.database};UID=${connection.username};PWD=${connection.password};APP=TraySQL;CHARSET=UTF8;CommLinks=tcpip(HOST=${connection.server};PORT=${connection.port || '2638'});`,
          // Formato alternativo com DSN
          `DSN=${connection.dsn || 'Contabil'};UID=${connection.username};PWD=${connection.password};`,
          // Usar a própria string de conexão se fornecida
          connection.connection_string
        ].filter(Boolean); // Remove valores null/undefined
        
        // Tenta cada uma das strings de conexão
        for (const connStr of tentativas) {
          try {
            console.log(`[ODBC] Tentando string de conexão para verificação: ${connStr.replace(/PWD=[^;]+/i, 'PWD=*****')}`);
            
            const odbcConn = await odbc.connect(connStr);
            const result = await odbcConn.query('SELECT 1 AS test');
            await odbcConn.close();
            
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
        const connectionString = buildConnectionString(connection);
        const odbcConn = await odbc.connect(connectionString);
        const result = await odbcConn.query('SELECT 1 AS test');
        await odbcConn.close();
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

// Exporta as funções
module.exports = {
  connect,
  executeQuery,
  buildConnectionString,
  prepareQuery,
  diagnosticarConexao,
  listAvailableDrivers,
  verificarConexaoAtiva
}; 