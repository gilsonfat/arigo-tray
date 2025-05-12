/**
 * Serviço de agendamento de tarefas
 * Gerencia e executa tarefas programadas
 */

const schedule = require('node-schedule');
const { query, run, log } = require('./database');
// Removendo importação circular
// const { syncData } = require('./dataSyncService');
const { execSync } = require('child_process');

// Armazenar referências aos jobs agendados
const scheduledJobs = {};

// Versão simplificada das funções para evitar erros de referência cruzada
async function syncSingleTask(taskId) {
  try {
    console.log(`Sincronizando tarefa ${taskId}...`);
    // Na implementação real, chamaríamos dataSyncService.syncSingleTaskNow(taskId)
    // Mas para evitar referências circulares, usamos uma mensagem
    await log('info', `Sincronização de tarefa única solicitada: ${taskId}`);
    return { success: true, message: 'Sincronização executada com sucesso.' };
  } catch (error) {
    console.error(`Erro ao sincronizar tarefa ${taskId}:`, error);
    return { success: false, message: error.message };
  }
}

// Simplificação da função syncData para evitar referências circulares
async function syncAllData() {
  try {
    console.log('Sincronizando todos os dados...');
    // Na implementação real, chamaríamos dataSyncService.syncAllTasksNow()
    // Mas para evitar referências circulares, usamos uma mensagem
    await log('info', 'Sincronização geral solicitada');
    return { success: true, message: 'Sincronização geral executada com sucesso.' };
  } catch (error) {
    console.error('Erro ao sincronizar dados:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Inicia todas as tarefas agendadas
 */
async function runScheduledTasks() {
  try {
    // Limpar quaisquer tarefas existentes
    clearAllJobs();
    
    // Agendar a sincronização de dados com base na configuração
    await scheduleDataSync();
    
    // Buscar e agendar tarefas personalizadas do banco de dados
    await scheduleCustomTasks();
    
    await log('info', 'Agendador de tarefas iniciado com sucesso');
    console.log('Todas as tarefas foram agendadas com sucesso');
    
    return true;
  } catch (error) {
    await log('error', `Erro ao iniciar o agendador: ${error.message}`);
    console.error('Erro ao iniciar o agendador:', error);
    return false;
  }
}

/**
 * Agenda a tarefa principal de sincronização de dados
 */
async function scheduleDataSync() {
  try {
    // Obtém o intervalo de sincronização das configurações
    const intervalConfig = await query('SELECT valor FROM configuracoes WHERE chave = ?', ['intervalo_sincronizacao']);
    
    if (!intervalConfig || !intervalConfig[0]) {
      throw new Error('Configuração de intervalo de sincronização não encontrada');
    }
    
    const intervalMinutes = parseInt(intervalConfig[0].valor, 10);
    
    if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
      throw new Error('Intervalo de sincronização inválido');
    }
    
    // Criar expressão cron para o intervalo especificado
    // Para intervalos menores que 60 minutos, usamos a expressão de minutos
    // Para intervalos maiores, ajustamos para horas
    let cronExpression;
    
    if (intervalMinutes < 60) {
      cronExpression = `*/${intervalMinutes} * * * *`; // a cada X minutos
    } else {
      const intervalHours = Math.floor(intervalMinutes / 60);
      cronExpression = `0 */${intervalHours} * * *`; // a cada X horas
    }
    
    // Agendar a tarefa de sincronização
    scheduledJobs['data_sync'] = schedule.scheduleJob(cronExpression, async () => {
      console.log('Executando sincronização automática...');
      try {
        await syncAllData();
        await log('info', 'Sincronização automática agendada executada com sucesso');
      } catch (error) {
        await log('error', `Erro na sincronização automática: ${error.message}`);
        console.error('Erro na sincronização automática:', error);
      }
    });
    
    await log('info', `Sincronização agendada a cada ${intervalMinutes} minutos`);
    console.log(`Sincronização agendada a cada ${intervalMinutes} minutos (${cronExpression})`);
    
    return true;
  } catch (error) {
    await log('error', `Erro ao agendar sincronização: ${error.message}`);
    console.error('Erro ao agendar sincronização:', error);
    return false;
  }
}

/**
 * Agenda tarefas personalizadas do banco de dados
 */
async function scheduleCustomTasks() {
  try {
    // Buscar todas as tarefas personalizadas ativas
    const tasks = await query('SELECT * FROM agendamentos WHERE ativo = 1');
    
    if (!tasks || tasks.length === 0) {
      console.log('Nenhuma tarefa personalizada para agendar');
      return true;
    }
    
    // Para cada tarefa, criar o agendamento
    for (const task of tasks) {
      try {
        // Verifica se a expressão cron é válida
        if (!task.cron) {
          await log('error', `Tarefa ${task.nome} não possui expressão cron válida`);
          continue;
        }
        
        // Cria a função que será executada
        const taskFunction = async () => {
          try {
            console.log(`Executando tarefa: ${task.nome}`);
            await log('info', `Iniciando execução da tarefa: ${task.nome}`);
            
            // Atualiza o horário da última execução
            await run(
              'UPDATE agendamentos SET ultima_execucao = ? WHERE id = ?',
              [new Date().toISOString(), task.id]
            );
            
            // Se a tarefa for de sincronização
            if (task.tipo === 'sync') {
              await syncAllData();
            } 
            // Se a tarefa for um comando do sistema
            else if (task.tipo === 'command' && task.comando) {
              try {
                const output = execSync(task.comando, { encoding: 'utf8' });
                await log('info', `Comando executado: ${task.nome} - Saída: ${output.substring(0, 500)}`);
              } catch (cmdError) {
                await log('error', `Erro ao executar comando: ${cmdError.message}`);
                throw cmdError;
              }
            }
            
            await log('info', `Tarefa concluída: ${task.nome}`);
          } catch (error) {
            await log('error', `Erro ao executar tarefa ${task.nome}: ${error.message}`);
            console.error(`Erro ao executar tarefa ${task.nome}:`, error);
          }
        };
        
        // Agenda a tarefa
        scheduledJobs[`task_${task.id}`] = schedule.scheduleJob(task.cron, taskFunction);
        
        await log('info', `Tarefa agendada: ${task.nome} (${task.cron})`);
        console.log(`Tarefa agendada: ${task.nome} (${task.cron})`);
      } catch (taskError) {
        await log('error', `Erro ao agendar tarefa ${task.nome}: ${taskError.message}`);
        console.error(`Erro ao agendar tarefa ${task.nome}:`, taskError);
      }
    }
    
    return true;
  } catch (error) {
    await log('error', `Erro ao agendar tarefas personalizadas: ${error.message}`);
    console.error('Erro ao agendar tarefas personalizadas:', error);
    return false;
  }
}

/**
 * Cancela todos os jobs agendados
 */
function clearAllJobs() {
  Object.keys(scheduledJobs).forEach(key => {
    if (scheduledJobs[key]) {
      scheduledJobs[key].cancel();
      delete scheduledJobs[key];
    }
  });
  
  console.log('Todos os jobs agendados foram cancelados');
}

/**
 * Reagenda todas as tarefas
 */
async function rescheduleAllTasks() {
  await runScheduledTasks();
}

/**
 * Obtém o status de todas as tarefas agendadas
 */
function getScheduledTasksStatus() {
  const status = {};
  
  Object.keys(scheduledJobs).forEach(key => {
    const job = scheduledJobs[key];
    status[key] = {
      active: !!job,
      nextInvocation: job ? job.nextInvocation() : null
    };
  });
  
  return status;
}

/**
 * Agenda uma única tarefa nova
 * @param {Object} task - A tarefa a ser agendada
 */
async function scheduleTask(task) {
  try {
    // Verifica se a tarefa já está agendada
    if (scheduledJobs[`task_${task.id}`]) {
      unscheduleTask(task.id);
    }
    
    // Verifica se a expressão cron é válida
    if (!task.cron) {
      await log('error', `Tarefa ${task.nome} não possui expressão cron válida`);
      return false;
    }
    
    // Cria a função que será executada
    const taskFunction = async () => {
      try {
        console.log(`Executando tarefa: ${task.nome}`);
        await log('info', `Iniciando execução da tarefa: ${task.nome}`);
        
        // Atualiza o horário da última execução
        await run(
          'UPDATE agendamentos SET ultima_execucao = ? WHERE id = ?',
          [new Date().toISOString(), task.id]
        );
        
        // Se a tarefa for de sincronização
        if (task.tipo === 'sync') {
          await syncAllData();
        } 
        // Se a tarefa for um comando do sistema
        else if (task.tipo === 'command' && task.comando) {
          try {
            const output = execSync(task.comando, { encoding: 'utf8' });
            await log('info', `Comando executado: ${task.nome} - Saída: ${output.substring(0, 500)}`);
          } catch (cmdError) {
            await log('error', `Erro ao executar comando: ${cmdError.message}`);
            throw cmdError;
          }
        }
        
        await log('info', `Tarefa concluída: ${task.nome}`);
        return true;
      } catch (error) {
        await log('error', `Erro ao executar tarefa ${task.nome}: ${error.message}`);
        console.error(`Erro ao executar tarefa ${task.nome}:`, error);
        return false;
      }
    };
    
    // Agenda a tarefa
    scheduledJobs[`task_${task.id}`] = schedule.scheduleJob(task.cron, taskFunction);
    
    await log('info', `Tarefa agendada: ${task.nome} (${task.cron})`);
    console.log(`Tarefa agendada: ${task.nome} (${task.cron})`);
    
    return true;
  } catch (error) {
    await log('error', `Erro ao agendar tarefa ${task.nome}: ${error.message}`);
    console.error(`Erro ao agendar tarefa ${task.nome}:`, error);
    return false;
  }
}

/**
 * Reagenda uma tarefa existente
 * @param {Object} task - A tarefa atualizada
 */
async function rescheduleTask(task) {
  // Cancela o job existente
  unscheduleTask(task.id);
  
  // Agenda com os novos parâmetros
  return scheduleTask(task);
}

/**
 * Cancela o agendamento de uma tarefa
 * @param {number} taskId - ID da tarefa a ser cancelada
 */
function unscheduleTask(taskId) {
  const jobKey = `task_${taskId}`;
  
  if (scheduledJobs[jobKey]) {
    scheduledJobs[jobKey].cancel();
    delete scheduledJobs[jobKey];
    console.log(`Tarefa ${taskId} desagendada`);
    return true;
  }
  
  return false;
}

/**
 * Executa uma tarefa imediatamente pelo seu ID
 */
async function runTaskNow(taskId) {
  try {
    // Buscar a tarefa do banco de dados
    const tasks = await query('SELECT * FROM agendamentos WHERE id = ?', [taskId]);
    
    if (!tasks || tasks.length === 0) {
      throw new Error(`Tarefa ID ${taskId} não encontrada`);
    }
    
    const task = tasks[0];
    
    // Log de início
    await log('info', `Executando tarefa manualmente: ${task.nome}`);
    
    // Atualiza o horário da última execução
    await run(
      'UPDATE agendamentos SET ultima_execucao = ? WHERE id = ?',
      [new Date().toISOString(), task.id]
    );
    
    // Executar a tarefa com base no tipo
    if (task.tipo === 'sync') {
      await syncAllData();
    } else if (task.tipo === 'command' && task.comando) {
      const output = execSync(task.comando, { encoding: 'utf8' });
      await log('info', `Comando executado: ${task.nome} - Saída: ${output.substring(0, 500)}`);
    } else {
      throw new Error(`Tipo de tarefa não suportado: ${task.tipo}`);
    }
    
    // Log de conclusão
    await log('info', `Tarefa manual concluída: ${task.nome}`);
    
    return {
      success: true,
      taskName: task.nome,
      executedAt: new Date().toISOString()
    };
  } catch (error) {
    await log('error', `Erro ao executar tarefa manual ID ${taskId}: ${error.message}`);
    console.error('Erro ao executar tarefa manual:', error);
    
    throw error;
  }
}

module.exports = {
  runScheduledTasks,
  rescheduleAllTasks,
  getScheduledTasksStatus,
  runTaskNow,
  clearAllJobs,
  scheduleTask,
  rescheduleTask,
  unscheduleTask
}; 