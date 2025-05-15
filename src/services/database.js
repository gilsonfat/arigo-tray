const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

// Banco de dados SQLite local para armazenar configurações e cache
let db;

// Diretório para o banco de dados
const DB_DIR = path.join(process.env.APPDATA || process.env.HOME, 'ClI-Tray-Agent');
const DB_PATH = path.join(DB_DIR, 'local.db');

// Inicializa o banco de dados
async function initDatabase() {
  // Verificar se o diretório existe, se não, criar
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Erro ao abrir banco de dados:', err.message);
        reject(err);
        return;
      }

      console.log('Conexão com o banco de dados SQLite estabelecida.');
      
      // Criar tabelas se não existirem
      db.serialize(() => {
        // Tabela de configurações
        db.run(`
          CREATE TABLE IF NOT EXISTS configuracoes (
            chave TEXT PRIMARY KEY,
            valor TEXT NOT NULL,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Tabela de agendamentos
        db.run(`
          CREATE TABLE IF NOT EXISTS agendamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            descricao TEXT,
            cron TEXT NOT NULL,
            ativo INTEGER DEFAULT 1,
            ultima_execucao TIMESTAMP,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Tabela de conexões ODBC
        db.run(`
          CREATE TABLE IF NOT EXISTS conexoes_odbc (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            dsn TEXT,
            connection_string TEXT,
            usuario TEXT,
            senha TEXT,
            host TEXT,
            porta TEXT,
            banco TEXT,
            driver TEXT,
            params TEXT,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Tabela de consultas SQL
        db.run(`
          CREATE TABLE IF NOT EXISTS consultas_sql (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conexao_id INTEGER,
            nome TEXT NOT NULL,
            descricao TEXT,
            query TEXT NOT NULL,
            formato_saida TEXT DEFAULT 'json',
            transform_type TEXT,
            FOREIGN KEY (conexao_id) REFERENCES conexoes_odbc (id)
          )
        `);

        // Tabela de logs
        db.run(`
          CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            mensagem TEXT NOT NULL,
            data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            console.error('Erro ao criar tabelas:', err.message);
            reject(err);
            return;
          }
          
          // Inserir configurações padrão se não existirem
          db.get("SELECT COUNT(*) as count FROM configuracoes", (err, row) => {
            if (err) {
              reject(err);
              return;
            }
            
            if (row.count === 0) {
              db.run(`
                INSERT INTO configuracoes (chave, valor) VALUES 
                ('api_url', 'https://api.exemplo.com.br'),
                ('api_key', ''),
                ('intervalo_sincronizacao', '60'),
                ('iniciar_com_windows', '1')
              `, (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                // Execute migrações para adicionar colunas faltantes
                migrateDatabase().then(resolve).catch(reject);
              });
            } else {
              // Execute migrações para adicionar colunas faltantes
              migrateDatabase().then(resolve).catch(reject);
            }
          });
        });
      });
    });
  });
}

// Função para migrar banco de dados e adicionar colunas faltantes
async function migrateDatabase() {
  console.log('Verificando e aplicando migrações de banco de dados...');
  
  const addColumnIfNotExists = (table, column, type) => {
    return new Promise((resolve, reject) => {
      // Primeiro verifica se a coluna existe
      db.all(`PRAGMA table_info(${table})`, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Se a coluna não for encontrada, adiciona
        if (!rows || !rows.some(row => row.name === column)) {
          console.log(`Adicionando coluna '${column}' à tabela '${table}'`);
          db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, (err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        } else {
          resolve(); // A coluna já existe
        }
      });
    });
  };
  
  try {
    // Adiciona colunas extras à tabela de conexões se não existirem
    await addColumnIfNotExists('conexoes_odbc', 'host', 'TEXT');
    await addColumnIfNotExists('conexoes_odbc', 'porta', 'TEXT');
    await addColumnIfNotExists('conexoes_odbc', 'banco', 'TEXT');
    await addColumnIfNotExists('conexoes_odbc', 'driver', 'TEXT');
    await addColumnIfNotExists('conexoes_odbc', 'params', 'TEXT');

    // Adiciona colunas extras à tabela de agendamentos se não existirem
    await addColumnIfNotExists('agendamentos', 'consulta_id', 'INTEGER');
    await addColumnIfNotExists('agendamentos', 'api_url', 'TEXT');
    await addColumnIfNotExists('agendamentos', 'api_metodo', 'TEXT DEFAULT "POST"');
    await addColumnIfNotExists('agendamentos', 'api_headers', 'TEXT DEFAULT "{}"');
    await addColumnIfNotExists('agendamentos', 'api_key', 'TEXT');
    await addColumnIfNotExists('agendamentos', 'tipo', 'TEXT DEFAULT "sync"');
    await addColumnIfNotExists('agendamentos', 'comando', 'TEXT');
    
    // Adiciona coluna de transformação de dados à tabela de consultas SQL
    await addColumnIfNotExists('consultas_sql', 'transform_type', 'TEXT');

    // Preenche colunas novas com valores da string de conexão para registros existentes
    const connections = await query('SELECT * FROM conexoes_odbc');
    for (const conn of connections) {
      // Verifica se a conexão tem valores nos novos campos
      if (!conn.host && conn.connection_string) {
        try {
          // Tenta extrair informações da string de conexão
          const connectionParts = {};
          const parts = conn.connection_string.split(';');
          
          for (const part of parts) {
            const [key, value] = part.split('=');
            if (key && value) {
              connectionParts[key.trim().toLowerCase()] = value.trim();
            }
          }
          
          // Tenta identificar driver, host, porta, banco
          let driver = connectionParts['driver'] || '';
          if (driver.startsWith('{') && driver.endsWith('}')) {
            driver = driver.substring(1, driver.length - 1);
          }
          
          const host = connectionParts['server'] || '';
          const porta = connectionParts['port'] || '';
          const banco = connectionParts['dbn'] || connectionParts['database'] || '';
          
          // Atualiza o registro com os valores extraídos
          if (host || porta || banco || driver) {
            await run(
              'UPDATE conexoes_odbc SET host = ?, porta = ?, banco = ?, driver = ? WHERE id = ?',
              [host, porta, banco, driver, conn.id]
            );
            console.log(`Atualizada conexão ID ${conn.id} com dados extraídos da string de conexão`);
          }
        } catch (e) {
          console.error(`Erro ao processar string de conexão para ID ${conn.id}:`, e.message);
        }
      }
    }
    
    console.log('Migrações concluídas com sucesso');
    return true;
  } catch (error) {
    console.error('Erro durante migrações:', error.message);
    throw error;
  }
}

// Obtém uma conexão ODBC por ID
async function getOdbcConnection(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM conexoes_odbc WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

// Função para executar consulta no banco de dados local
async function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

// Função para executar um comando no banco de dados local
async function run(sql, params = []) {
  console.log(`[database] Executando SQL: ${sql}`);
  console.log(`[database] Parâmetros: ${JSON.stringify(params)}`);
  
  return new Promise((resolve, reject) => {
    try {
      db.run(sql, params, function(err) {
        if (err) {
          console.error(`[database] Erro no SQL: ${sql}`);
          console.error(`[database] Detalhes do erro:`, err);
          reject(err);
          return;
        }
        
        console.log(`[database] SQL executado com sucesso. LastID: ${this.lastID}, Changes: ${this.changes}`);
        resolve({ id: this.lastID, changes: this.changes });
      });
    } catch (err) {
      console.error(`[database] Exceção ao executar SQL: ${sql}`);
      console.error(`[database] Detalhes da exceção:`, err);
      reject(err);
    }
  });
}

// Função para executar uma consulta ODBC (será implementada em outro arquivo)
async function executeOdbcQuery(conexaoId, queryText) {
  try {
    console.log(`[database] Executando consulta ODBC na conexão ID ${conexaoId}`);
    // Esta função será implementada no arquivo odbcService.js
    const odbcService = require('./odbcService');
    
    // Verificar se a conexão existe e tem os dados mínimos
    const connectionDetails = await getConnectionById(conexaoId);
    if (!connectionDetails) {
      throw new Error(`Conexão ID ${conexaoId} não encontrada`);
    }
    
    // Se não tiver driver especificado, apenas logamos o aviso
    if (!connectionDetails.driver) {
      console.warn(`[database] Conexão ID ${conexaoId} não tem driver especificado, continuando com driver simulado`);
    }
    
    return await odbcService.executeQuery(conexaoId, queryText);
  } catch (error) {
    console.error(`[database] Erro ao executar consulta ODBC: ${error.message}`);
    // Registro o erro no log
    await log('error', `Falha ao executar consulta ODBC: ${error.message}`);
    throw error;  // Propaga o erro para ser tratado no handler IPC
  }
}

// Registra um log no banco de dados
async function log(tipo, mensagem) {
  return run('INSERT INTO logs (tipo, mensagem) VALUES (?, ?)', [tipo, mensagem]);
}

/**
 * Obtém os logs do sistema
 * @param {Object} options - Opções para filtrar os logs
 * @param {string} options.tipo - Tipo de log (info, error, debug) para filtrar
 * @param {number} options.limit - Limite de registros a retornar
 * @param {number} options.offset - Offset para paginação
 * @returns {Promise<Array>} - Array com os logs encontrados
 */
async function getLogs(options = {}) {
  try {
    const { tipo, limit = 100, offset = 0 } = options;
    
    // Base da consulta
    let sql = `
      SELECT id, tipo, mensagem, data_registro 
      FROM logs 
      WHERE 1=1
    `;
    
    // Parâmetros da consulta
    const params = [];
    
    // Adiciona filtro por tipo se fornecido
    if (tipo) {
      sql += ' AND tipo = ?';
      params.push(tipo);
    }
    
    // Ordena por data mais recente primeiro
    sql += ' ORDER BY data_registro DESC';
    
    // Adiciona limitação e paginação
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return query(sql, params);
  } catch (error) {
    console.error(`[database] Erro ao obter logs:`, error);
    return [];
  }
}

/**
 * Obtém o número de logs por tipo
 * @returns {Promise<Object>} - Objeto com contagem de logs por tipo
 */
async function getLogCount() {
  try {
    // Obtém a contagem geral
    const totalResult = await query('SELECT COUNT(*) as total FROM logs');
    const total = totalResult[0]?.total || 0;
    
    // Obtém contagem por tipo
    const typeCountResult = await query(
      'SELECT tipo, COUNT(*) as count FROM logs GROUP BY tipo'
    );
    
    // Obtém contagem de hoje
    const today = new Date().toISOString().split('T')[0];
    const todayResult = await query(
      `SELECT COUNT(*) as today FROM logs 
       WHERE date(data_registro) = date(?)`,
      [today]
    );
    
    // Formata o resultado
    const result = {
      total,
      today: todayResult[0]?.today || 0,
      byType: {}
    };
    
    // Adiciona contagem por tipo
    typeCountResult.forEach(row => {
      result.byType[row.tipo] = row.count;
    });
    
    return result;
  } catch (error) {
    console.error(`[database] Erro ao contar logs:`, error);
    return { total: 0, today: 0, byType: {} };
  }
}

// Fecha a conexão com o banco de dados
function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Erro ao fechar banco de dados:', err.message);
      } else {
        console.log('Conexão com o banco de dados fechada.');
      }
    });
  }
}

// Funções para Conexões ODBC
async function getConnections() {
  return query('SELECT * FROM conexoes_odbc ORDER BY nome');
}

async function getConnectionById(id) {
  console.log(`[database] Buscando conexão com ID: ${id} (tipo: ${typeof id})`);
  
  if (!id) {
    console.error('[database] Erro: ID da conexão não fornecido');
    return null;
  }
  
  // Garantir que o ID seja um número
  let numericId;
  if (typeof id === 'string') {
    numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      console.error(`[database] Erro: ID da conexão não é um número válido: ${id}`);
      return null;
    }
  } else if (typeof id === 'number') {
    numericId = id;
  } else if (typeof id === 'object') {
    console.error(`[database] Erro: ID da conexão é um objeto: ${JSON.stringify(id)}`);
    if (id && typeof id.id === 'number') {
      numericId = id.id;
      console.warn(`[database] Usando id.id como ID: ${numericId}`);
    } else {
      console.error(`[database] Não foi possível extrair ID numérico do objeto`);
      return null;
    }
  } else {
    console.error(`[database] Erro: ID da conexão tem tipo inválido: ${typeof id}`);
    return null;
  }
  
  console.log(`[database] Consultando conexão com ID numérico: ${numericId}`);
  
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM conexoes_odbc WHERE id = ?', [numericId], (err, row) => {
      if (err) {
        console.error(`[database] Erro ao buscar conexão:`, err);
        reject(err);
        return;
      }
      
      if (!row) {
        console.warn(`[database] Conexão ID ${numericId} não encontrada`);
      } else {
        console.log(`[database] Conexão encontrada: ${row.nome || 'sem nome'} (ID: ${row.id})`);
      }
      
      resolve(row);
    });
  });
}

async function createConnection(data) {
  console.log('[database] Criando nova conexão:', JSON.stringify(data, null, 2));
  
  // Garante que temos valores padrão para todos os campos, evitando erros de NULL
  const nome = data.nome || '';
  const dsn = data.dsn || '';
  const connection_string = data.connection_string || '';
  const usuario = data.usuario || '';
  const senha = data.senha || '';
  const host = data.host || '';
  const porta = data.porta || '';
  const banco = data.banco || '';
  const driver = data.driver || '';
  const params = data.params || '';
  
  try {
    const result = await run(
      'INSERT INTO conexoes_odbc (nome, dsn, connection_string, usuario, senha, host, porta, banco, driver, params) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nome, dsn, connection_string, usuario, senha, host, porta, banco, driver, params]
    );
    
    console.log('[database] Conexão criada com sucesso:', result);
    return { 
      id: result.id, 
      nome, 
      dsn, 
      connection_string, 
      usuario, 
      senha, 
      host, 
      porta, 
      banco, 
      driver, 
      params 
    };
  } catch (err) {
    console.error('[database] Erro ao criar conexão:', err);
    throw err;
  }
}

async function updateConnection(id, data) {
  console.log('[database] Atualizando conexão:', id, JSON.stringify(data, null, 2));
  
  if (!id) {
    throw new Error('ID não especificado para atualização de conexão');
  }
  
  // Garante que temos valores padrão para todos os campos, evitando erros de NULL
  const nome = data.nome || '';
  const dsn = data.dsn || '';
  const connection_string = data.connection_string || '';
  const usuario = data.usuario || '';
  const senha = data.senha || '';
  const host = data.host || '';
  const porta = data.porta || '';
  const banco = data.banco || '';
  const driver = data.driver || '';
  const params = data.params || '';
  
  try {
    await run(
      'UPDATE conexoes_odbc SET nome = ?, dsn = ?, connection_string = ?, usuario = ?, senha = ?, host = ?, porta = ?, banco = ?, driver = ?, params = ? WHERE id = ?',
      [nome, dsn, connection_string, usuario, senha, host, porta, banco, driver, params, id]
    );
    
    console.log('[database] Conexão atualizada com sucesso:', id);
    return { 
      id: Number(id), 
      nome, 
      dsn, 
      connection_string, 
      usuario, 
      senha, 
      host, 
      porta, 
      banco, 
      driver, 
      params 
    };
  } catch (err) {
    console.error('[database] Erro ao atualizar conexão:', err);
    throw err;
  }
}

async function deleteConnection(id) {
  return run('DELETE FROM conexoes_odbc WHERE id = ?', [id]);
}

// Funções para Consultas SQL
async function getQueriesWithConnectionNames() {
  console.log('[database] Buscando consultas SQL com nomes de conexões');
  
  const queries = await query(`
    SELECT q.*, c.nome as connection_name, c.id as connection_id
    FROM consultas_sql q 
    LEFT JOIN conexoes_odbc c ON q.conexao_id = c.id
    ORDER BY q.nome
  `);
  
  // Verificar se o resultado tem informações de conexão e logar para debug
  if (queries && Array.isArray(queries)) {
    console.log(`[database] Encontradas ${queries.length} consultas`);
    
    // Verifica se alguma consulta está sem nome de conexão
    const queriesWithoutConnection = queries.filter(q => !q.connection_name && q.conexao_id);
    
    if (queriesWithoutConnection.length > 0) {
      console.warn(`[database] ${queriesWithoutConnection.length} consultas com conexao_id, mas sem connection_name`);
      
      // Tenta buscar e atribuir os nomes de conexões faltantes
      for (const query of queriesWithoutConnection) {
        try {
          const connection = await getConnectionById(query.conexao_id);
          if (connection) {
            const index = queries.findIndex(q => q.id === query.id);
            if (index !== -1) {
              queries[index].connection_name = connection.nome || `Conexão ${connection.id}`;
              console.log(`[database] Adicionado nome de conexão: ${queries[index].connection_name} para consulta ${query.id}`);
            }
          } else {
            console.warn(`[database] Conexão ID ${query.conexao_id} não encontrada para consulta ${query.id}`);
          }
        } catch (error) {
          console.error(`[database] Erro ao buscar conexão: ${error.message}`);
        }
      }
    }
  }
  
  return queries;
}

async function getQueryById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM consultas_sql WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

async function createQuery(data) {
  console.log('[database] Criando nova consulta SQL:', JSON.stringify(data, null, 2));
  
  // Garante que temos valores padrão para todos os campos, evitando erros de NULL
  const nome = data.nome || '';
  const descricao = data.descricao || '';
  
  // Garante que conexao_id seja um número válido
  let conexao_id = null;
  
  if (data.conexao_id) {
    conexao_id = typeof data.conexao_id === 'string' 
      ? parseInt(data.conexao_id, 10) 
      : Number(data.conexao_id);
      
    if (isNaN(conexao_id)) {
      console.error('[database] Erro: ID da conexão inválido:', data.conexao_id);
      throw new Error('ID da conexão inválido ou não numérico');
    }
  }
  
  const sql = data.sql || data.query || ''; // Permite usar tanto sql quanto query como nome do campo
  const formato_saida = data.formato_saida || 'json';
  const transform_type = data.transform_type || null;
  
  // Validações básicas
  if (!nome) {
    throw new Error('Nome da consulta é obrigatório');
  }
  
  if (!sql) {
    throw new Error('Consulta SQL é obrigatória');
  }
  
  if (!conexao_id) {
    throw new Error('ID da conexão é obrigatório');
  }
  
  try {
    // Verifica se a conexão existe antes de prosseguir
    const connection = await getConnectionById(conexao_id);
    if (!connection) {
      console.error(`[database] Erro: Conexão ID ${conexao_id} não encontrada`);
      throw new Error(`Conexão ID ${conexao_id} não encontrada`);
    }
    
    console.log(`[database] Conexão validada: ${connection.nome || connection.name || connection.id}`);
    
    // Inserir a consulta no banco de dados
    const result = await run(
      'INSERT INTO consultas_sql (nome, descricao, conexao_id, query, formato_saida, transform_type) VALUES (?, ?, ?, ?, ?, ?)',
      [nome, descricao, conexao_id, sql, formato_saida, transform_type]
    );
    
    // Verificar se a consulta foi criada corretamente com o ID da conexão
    const createdQuery = await getQueryById(result.id);
    if (createdQuery && createdQuery.conexao_id !== conexao_id) {
      console.warn(`[database] Aviso: conexao_id na consulta criada (${createdQuery.conexao_id}) difere do esperado (${conexao_id})`);
      
      // Corrigir o ID da conexão se necessário
      await run(
        'UPDATE consultas_sql SET conexao_id = ? WHERE id = ?',
        [conexao_id, result.id]
      );
      
      console.log(`[database] conexao_id corrigido para consulta ID ${result.id}`);
    }
    
    console.log('[database] Consulta SQL criada com sucesso:', result);
    return { 
      id: result.id, 
      nome, 
      descricao, 
      conexao_id, 
      query: sql, // Retorna como query para manter compatibilidade
      sql,        // Também retorna como sql para aplicações que usam esse nome
      formato_saida,
      transform_type
    };
  } catch (err) {
    console.error('[database] Erro ao criar consulta SQL:', err);
    throw err;
  }
}

async function updateQuery(id, data) {
  console.log('[database] Atualizando consulta SQL:', id, JSON.stringify(data, null, 2));
  
  if (!id) {
    throw new Error('ID não especificado para atualização da consulta');
  }
  
  // Garante que temos valores padrão para todos os campos, evitando erros de NULL
  const nome = data.nome || '';
  const descricao = data.descricao || '';
  
  // Garante que conexao_id seja um número válido
  let conexao_id = null;
  
  if (data.conexao_id) {
    conexao_id = typeof data.conexao_id === 'string' 
      ? parseInt(data.conexao_id, 10) 
      : Number(data.conexao_id);
      
    if (isNaN(conexao_id)) {
      console.error('[database] Erro: ID da conexão inválido:', data.conexao_id);
      throw new Error('ID da conexão inválido ou não numérico');
    }
  }
  
  const sql = data.sql || data.query || ''; // Permite usar tanto sql quanto query como nome do campo
  const formato_saida = data.formato_saida || 'json';
  const transform_type = data.transform_type || null;
  
  // Validações básicas
  if (!nome) {
    throw new Error('Nome da consulta é obrigatório');
  }
  
  if (!sql) {
    throw new Error('Consulta SQL é obrigatória');
  }
  
  if (!conexao_id) {
    throw new Error('ID da conexão é obrigatório');
  }
  
  try {
    // Verifica se a conexão existe antes de prosseguir
    const connection = await getConnectionById(conexao_id);
    if (!connection) {
      console.error(`[database] Erro: Conexão ID ${conexao_id} não encontrada`);
      throw new Error(`Conexão ID ${conexao_id} não encontrada`);
    }
    
    console.log(`[database] Conexão validada: ${connection.nome || connection.name || connection.id}`);
    
    // Atualizar a consulta no banco de dados
    await run(
      'UPDATE consultas_sql SET nome = ?, descricao = ?, conexao_id = ?, query = ?, formato_saida = ?, transform_type = ? WHERE id = ?',
      [nome, descricao, conexao_id, sql, formato_saida, transform_type, id]
    );
    
    // Verificar se a consulta foi atualizada corretamente com o ID da conexão
    const updatedQuery = await getQueryById(id);
    if (updatedQuery && updatedQuery.conexao_id !== conexao_id) {
      console.warn(`[database] Aviso: conexao_id na consulta atualizada (${updatedQuery.conexao_id}) difere do esperado (${conexao_id})`);
      
      // Corrigir o ID da conexão se necessário
      await run(
        'UPDATE consultas_sql SET conexao_id = ? WHERE id = ?',
        [conexao_id, id]
      );
      
      console.log(`[database] conexao_id corrigido para consulta ID ${id}`);
    }
    
    console.log('[database] Consulta SQL atualizada com sucesso:', id);
    return { 
      id: Number(id), 
      nome, 
      descricao, 
      conexao_id, 
      query: sql, // Retorna como query para manter compatibilidade
      sql,        // Também retorna como sql para aplicações que usam esse nome
      formato_saida,
      transform_type
    };
  } catch (err) {
    console.error('[database] Erro ao atualizar consulta SQL:', err);
    throw err;
  }
}

async function deleteQuery(id) {
  return run('DELETE FROM consultas_sql WHERE id = ?', [id]);
}

// Funções para Tarefas/Agendamentos
async function getTasksWithDetails() {
  return query(`
    SELECT a.*, 
           q.nome as nome_consulta
    FROM agendamentos a
    LEFT JOIN consultas_sql q ON a.consulta_id = q.id
    ORDER BY a.nome
  `);
}

async function getTaskById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM agendamentos WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

async function createTask(data) {
  console.log('[database] Criando nova tarefa agendada:', JSON.stringify(data, null, 2));
  
  try {
    // Valores padrão para os campos requeridos
    const nome = data.nome || '';
    const descricao = data.descricao || '';
    const cron = data.cron || '';
    const ativo = data.ativo === undefined ? 1 : (data.ativo ? 1 : 0);
    
    // Garantir que a consulta_id seja um número
    let consulta_id = null;
    if (data.consulta_id) {
      consulta_id = parseInt(data.consulta_id, 10);
      if (isNaN(consulta_id)) {
        throw new Error('ID da consulta deve ser um número válido');
      }
    }
    
    // Campos opcionais
    const api_url = data.api_url || '';
    const api_metodo = data.api_metodo || 'POST';
    const api_headers = data.api_headers || '{}';
    const api_key = data.api_key || '';
    const tipo = data.tipo || 'sync';
    const comando = data.comando || '';

    // Validações básicas
    if (!nome) {
      throw new Error('Nome da tarefa é obrigatório');
    }
    
    if (!cron) {
      throw new Error('Expressão cron é obrigatória');
    }
    
    if (!consulta_id) {
      throw new Error('ID da consulta é obrigatório');
    }
    
    if (!api_url) {
      throw new Error('URL da API é obrigatória');
    }
    
    console.log('[database] Validação passou, preparando para inserir tarefa no banco de dados');
    
    // Validar se a consulta existe, se foi informada
    if (consulta_id) {
      const query = await getQueryById(consulta_id);
      if (!query) {
        throw new Error(`Consulta ID ${consulta_id} não encontrada`);
      }
      console.log(`[database] Consulta ID ${consulta_id} validada: ${query.nome}`);
    }
    
    // Preparar os parâmetros em um objeto para facilitar debug
    const params = [
      nome, descricao, cron, ativo, consulta_id, 
      api_url, api_metodo, api_headers, api_key, tipo, comando
    ];
    console.log('[database] Parâmetros para inserção:', params);
    
    // Inserir a tarefa no banco
    const result = await run(
      `INSERT INTO agendamentos 
       (nome, descricao, cron, ativo, consulta_id, api_url, api_metodo, api_headers, api_key, tipo, comando) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params
    );
    
    console.log('[database] Tarefa criada com sucesso. Resultado:', result);
    
    if (!result || !result.id) {
      throw new Error('Erro ao inserir tarefa no banco de dados: nenhum ID retornado');
    }
    
    // Retornar os dados completos da tarefa
    return { 
      id: result.id, 
      nome, 
      descricao, 
      cron, 
      ativo: ativo === 1,
      consulta_id,
      api_url,
      api_metodo,
      api_headers,
      api_key,
      tipo,
      comando
    };
  } catch (err) {
    console.error('[database] Erro ao criar tarefa:', err);
    throw err;
  }
}

async function updateTask(id, data) {
  console.log('[database] Atualizando tarefa agendada:', id, data);
  
  try {
    if (!id) {
      throw new Error('ID não especificado para atualização da tarefa');
    }
    
    // Valores padrão para os campos requeridos
    const nome = data.nome || '';
    const descricao = data.descricao || '';
    const cron = data.cron || '';
    const ativo = data.ativo === undefined ? 1 : (data.ativo ? 1 : 0);
    
    // Campos opcionais
    const consulta_id = data.consulta_id ? Number(data.consulta_id) : null;
    const api_url = data.api_url || '';
    const api_metodo = data.api_metodo || 'POST';
    const api_headers = data.api_headers || '{}';
    const api_key = data.api_key || '';
    const tipo = data.tipo || 'sync';
    const comando = data.comando || '';

    // Validações básicas
    if (!nome) {
      throw new Error('Nome da tarefa é obrigatório');
    }
    
    if (!cron) {
      throw new Error('Expressão cron é obrigatória');
    }
    
    // Validar se a consulta existe, se foi informada
    if (consulta_id) {
      const query = await getQueryById(consulta_id);
      if (!query) {
        throw new Error(`Consulta ID ${consulta_id} não encontrada`);
      }
    }
    
    // Atualizar a tarefa no banco
    await run(
      `UPDATE agendamentos SET 
       nome = ?, descricao = ?, cron = ?, ativo = ?, 
       consulta_id = ?, api_url = ?, api_metodo = ?, 
       api_headers = ?, api_key = ?, tipo = ?, comando = ? 
       WHERE id = ?`,
      [nome, descricao, cron, ativo, consulta_id, api_url, api_metodo, 
       api_headers, api_key, tipo, comando, id]
    );
    
    console.log('[database] Tarefa atualizada com sucesso:', id);
    
    // Retornar os dados completos da tarefa
    return { 
      id: Number(id), 
      nome, 
      descricao, 
      cron, 
      ativo: ativo === 1,
      consulta_id,
      api_url,
      api_metodo,
      api_headers,
      api_key,
      tipo,
      comando
    };
  } catch (err) {
    console.error('[database] Erro ao atualizar tarefa:', err);
    throw err;
  }
}

async function deleteTask(id) {
  return run('DELETE FROM agendamentos WHERE id = ?', [id]);
}

module.exports = {
  initDatabase,
  query,
  run,
  getOdbcConnection,
  executeOdbcQuery,
  log,
  closeDatabase,
  // Conexões
  getConnections,
  getConnectionById,
  createConnection,
  updateConnection,
  deleteConnection,
  // Consultas
  getQueriesWithConnectionNames,
  getQueryById,
  createQuery,
  updateQuery,
  deleteQuery,
  // Tarefas
  getTasksWithDetails,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  // Logs
  getLogs,
  getLogCount
}; 