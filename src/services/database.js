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
  return query(`
    SELECT q.*, c.nome as connection_name 
    FROM consultas_sql q 
    LEFT JOIN conexoes_odbc c ON q.conexao_id = c.id
    ORDER BY q.nome
  `);
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
  const conexao_id = data.conexao_id ? Number(data.conexao_id) : null;
  const sql = data.sql || data.query || ''; // Permite usar tanto sql quanto query como nome do campo
  const formato_saida = data.formato_saida || 'json';
  
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
    const result = await run(
      'INSERT INTO consultas_sql (nome, descricao, conexao_id, query, formato_saida) VALUES (?, ?, ?, ?, ?)',
      [nome, descricao, conexao_id, sql, formato_saida]
    );
    
    console.log('[database] Consulta SQL criada com sucesso:', result);
    return { 
      id: result.id, 
      nome, 
      descricao, 
      conexao_id, 
      query: sql, // Retorna como query para manter compatibilidade
      sql,        // Também retorna como sql para aplicações que usam esse nome
      formato_saida 
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
  const conexao_id = data.conexao_id ? Number(data.conexao_id) : null;
  const sql = data.sql || data.query || ''; // Permite usar tanto sql quanto query como nome do campo
  const formato_saida = data.formato_saida || 'json';
  
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
    await run(
      'UPDATE consultas_sql SET nome = ?, descricao = ?, conexao_id = ?, query = ?, formato_saida = ? WHERE id = ?',
      [nome, descricao, conexao_id, sql, formato_saida, id]
    );
    
    console.log('[database] Consulta SQL atualizada com sucesso:', id);
    return { 
      id: Number(id), 
      nome, 
      descricao, 
      conexao_id, 
      query: sql, // Retorna como query para manter compatibilidade
      sql,        // Também retorna como sql para aplicações que usam esse nome
      formato_saida 
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
    SELECT * FROM agendamentos
    ORDER BY nome
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
  const { nome, descricao, cron, ativo } = data;
  const result = await run(
    'INSERT INTO agendamentos (nome, descricao, cron, ativo) VALUES (?, ?, ?, ?)',
    [nome, descricao, cron, ativo === undefined ? 1 : ativo]
  );
  return { id: result.id, ...data };
}

async function updateTask(id, data) {
  const { nome, descricao, cron, ativo } = data;
  await run(
    'UPDATE agendamentos SET nome = ?, descricao = ?, cron = ?, ativo = ? WHERE id = ?',
    [nome, descricao, cron, ativo === undefined ? 1 : ativo, id]
  );
  return { id, ...data };
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
  deleteTask
}; 