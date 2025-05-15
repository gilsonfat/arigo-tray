import React, { useState, useEffect, useCallback } from 'react';
import { getTasks, createTask, updateTask, deleteTask, executeTask } from '../lib/ipcApi';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Alert from '../components/Alert';
import LoadingSpinner from '../components/LoadingSpinner';
import TaskForm from '../components/TaskForm'; // Importa o formulário
import ConfirmDialog from '../components/ConfirmDialog';
// import { PlayIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'; // Removido Heroicons por simplicidade, pode adicionar depois

// Ícones SVG simples como componentes
const PlayIcon = () => <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const PencilIcon = () => <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;
const TrashIcon = () => <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;


const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // Erro geral
  const [showModal, setShowModal] = useState(false);
  const [currentTask, setCurrentTask] = useState(null); // null para criar
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null); // Erro do modal
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [executingTaskId, setExecutingTaskId] = useState(null); // ID da tarefa sendo executada manualmente
  const [actionResult, setActionResult] = useState(null); // Feedback geral

  // Função para buscar tarefas
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionResult(null);
    try {
      const response = await getTasks();
      if (response.success) {
        // Ordena tarefas por nome ou data de criação, se disponível
        const sortedTasks = (response.data || []).sort((a, b) => a.nome.localeCompare(b.nome));
        setTasks(sortedTasks);
      } else {
        setError(response.message || 'Erro desconhecido ao buscar tarefas.');
      }
    } catch (err) {
      console.error("Catch no fetchTasks:", err);
      setError(err.message || 'Erro crítico ao buscar tarefas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // --- Handlers ---
  const handleOpenModal = (task = null) => {
    setCurrentTask(task);
    setModalError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    if (modalLoading) return;
    setShowModal(false);
    setCurrentTask(null);
    setModalError(null);
  };

  const handleSaveTask = async (formData) => {
    setModalLoading(true);
    setModalError(null);
    setActionResult(null);
    try {
      console.log('Salvando tarefa com dados:', JSON.stringify(formData, null, 2));
      
      if (!formData) {
        throw new Error('Dados do formulário são inválidos ou vazios');
      }
      
      // Validação crítica dos campos obrigatórios
      if (!formData.nome || !formData.cron || !formData.consulta_id || !formData.api_url) {
        const camposFaltantes = [];
        if (!formData.nome) camposFaltantes.push('Nome');
        if (!formData.cron) camposFaltantes.push('Cron');
        if (!formData.consulta_id) camposFaltantes.push('Consulta SQL');
        if (!formData.api_url) camposFaltantes.push('URL da API');
        
        throw new Error(`Campos obrigatórios não preenchidos: ${camposFaltantes.join(', ')}`);
      }
      
      // Prepara os dados garantindo os tipos corretos e validando
      const dataToSend = {
        ...formData,
        nome: formData.nome.trim(),
        descricao: (formData.descricao || '').trim(),
        cron: formData.cron.trim(),
        ativo: formData.ativo ? 1 : 0,
        consulta_id: parseInt(formData.consulta_id, 10),
        api_url: formData.api_url.trim(),
        api_metodo: formData.api_metodo || 'POST',
        api_headers: formData.api_headers || '{}'
      };
      
      // Verifica se a conversão de consulta_id resultou em um número válido
      if (isNaN(dataToSend.consulta_id)) {
        throw new Error('ID da consulta inválido. Precisa ser um número.');
      }
      
      console.log('Dados formatados para envio:', JSON.stringify(dataToSend, null, 2));

      let response;
      if (currentTask?.id) {
        console.log(`Atualizando tarefa ID ${currentTask.id}:`, JSON.stringify(dataToSend, null, 2));
        response = await updateTask(currentTask.id, dataToSend);
      } else {
        console.log('Criando nova tarefa:', JSON.stringify(dataToSend, null, 2));
        response = await createTask(dataToSend);
      }

      console.log('Resposta do servidor:', JSON.stringify(response, null, 2));

      if (!response) {
        throw new Error('Nenhuma resposta recebida do servidor');
      }

      if (response.success) {
        handleCloseModal();
        fetchTasks(); // Recarrega
        setActionResult({ type: 'success', message: `Tarefa "${formData.nome}" ${currentTask?.id ? 'atualizada' : 'criada'} com sucesso!` });
      } else {
        console.error('Erro retornado pelo servidor:', response.message);
        setModalError(response.message || `Falha ao ${currentTask?.id ? 'atualizar' : 'criar'} tarefa.`);
      }
    } catch (err) {
        console.error("Catch no handleSaveTask:", err);
        setModalError(err.message || 'Erro crítico ao salvar tarefa.');
    } finally {
        setModalLoading(false);
    }
  };

  const handleDeleteRequest = (task) => {
    setTaskToDelete(task);
    setShowConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    setActionResult(null);
    try {
      const response = await deleteTask(taskToDelete.id);
      if (response.success) {
        setActionResult({ type: 'success', message: `Tarefa "${taskToDelete.nome}" excluída com sucesso!` });
        fetchTasks(); // Recarrega
      } else {
        setActionResult({ type: 'error', message: response.message || 'Erro ao excluir tarefa.' });
      }
    } catch (err) {
        console.error("Catch no handleConfirmDelete:", err);
        setActionResult({ type: 'error', message: err.message || 'Erro crítico ao excluir tarefa.' });
    } finally {
      setShowConfirmDelete(false);
      setTaskToDelete(null);
    }
  };

  // Handler para executar tarefa manualmente
  const handleExecuteTask = async (taskId, taskName) => {
    setExecutingTaskId(taskId); // Mostra loading no botão específico
    setActionResult(null);
    try {
        const response = await executeTask(taskId);
        if (response.success) {
            setActionResult({ type: 'success', message: `Tarefa "${taskName}" executada manualmente com sucesso! ${response.message || ''}`.trim() });
        } else {
             setActionResult({ type: 'error', message: `Falha ao executar tarefa "${taskName}": ${response.message || 'Erro desconhecido'}` });
        }
    } catch(err) {
        console.error("Catch no handleExecuteTask:", err);
        setActionResult({ type: 'error', message: `Erro crítico ao executar tarefa "${taskName}": ${err.message}` });
    } finally {
        setExecutingTaskId(null); // Remove loading do botão
    }
  };

  // --- Renderização ---
  if (loading) {
    return <LoadingSpinner message="Carregando tarefas agendadas..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-800">Tarefas Agendadas</h1>
        <Button variant="success" onClick={() => handleOpenModal()}>
          Adicionar Nova Tarefa
        </Button>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
      {actionResult && (
         <Alert
            type={actionResult.type}
            message={actionResult.message}
            onClose={() => setActionResult(null)}
            autoClose={actionResult.type === 'success'} // Fecha só sucesso
         />
      )}

      {/* Tabela de Tarefas */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cron</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Consulta</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">API URL</th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tasks.length === 0 && !loading && (
              <tr>
                <td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">
                  Nenhuma tarefa agendada encontrada.
                </td>
              </tr>
            )}
            {tasks.map((task) => (
              <tr key={task.id} className={!task.ativo ? 'bg-gray-50 opacity-70' : ''}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${task.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      <span className={`w-2 h-2 mr-1.5 rounded-full ${task.ativo ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      {task.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{task.nome}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{task.cron}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.nome_consulta || 'N/A'}</td> {/* Assumindo que backend retorna nome_consulta */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate" title={task.api_url}>
                    {task.api_url}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                   {/* Botão Executar Agora */}
                   <Button
                     variant="info"
                     size="sm"
                     onClick={() => handleExecuteTask(task.id, task.nome)}
                     isLoading={executingTaskId === task.id}
                     disabled={executingTaskId === task.id || !task.ativo}
                     title="Executar Tarefa Agora"
                     className="px-2 py-1" // Tamanho menor para ícone
                   >
                      <PlayIcon />
                   </Button>
                   <Button
                     variant="secondary"
                     size="sm"
                     onClick={() => handleOpenModal(task)}
                     title="Editar Tarefa"
                     className="px-2 py-1"
                   >
                     <PencilIcon />
                   </Button>
                   <Button
                     variant="danger"
                     size="sm"
                     onClick={() => handleDeleteRequest(task)}
                     title="Excluir Tarefa"
                      className="px-2 py-1"
                   >
                    <TrashIcon />
                   </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de Criação/Edição */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={currentTask ? 'Editar Tarefa Agendada' : 'Adicionar Nova Tarefa'}
        size="lg" // Tamanho adequado para este form
        preventClose={modalLoading}
        footerContent={
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={handleCloseModal} disabled={modalLoading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="modal-form"
              variant="primary"
              isLoading={modalLoading}
              disabled={modalLoading}
              onClick={(e) => {
                console.log('Botão Salvar Tarefa clicado!');
                try {
                  // Verifica se o formulário existe
                  const form = document.getElementById('modal-form');
                  if (form) {
                    console.log('Formulário encontrado, forçando submit manualmente');
                    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
                    
                    // Adiciona um ouvinte de evento para depuração
                    form.addEventListener('submit', function(event) {
                      console.log('Evento submit capturado pelo listener:', event);
                    }, { once: true });
                    
                    // Dispara o evento submit no formulário
                    const submitSuccess = form.dispatchEvent(submitEvent);
                    console.log('Resultado do dispatchEvent:', submitSuccess ? 'Não cancelado' : 'Cancelado');
                    
                    if (!submitSuccess) {
                      console.log('O evento submit foi cancelado, tentando chamar diretamente');
                      // Tenta acionar o submit diretamente
                      const internalButton = document.getElementById('internal-submit-button');
                      if (internalButton) {
                        console.log('Botão interno encontrado, clicando');
                        internalButton.click();
                      }
                    }
                  } else {
                    console.error('Formulário não encontrado!');
                    // Tenta forçar um submit direto
                    if (typeof handleSaveTask === 'function' && showModal) {
                      console.log('Tentando salvar diretamente via handleSaveTask');
                      // Obtém o formulário atual diretamente do DOM
                      const formElements = document.querySelectorAll('form[id="modal-form"]');
                      if (formElements.length > 0) {
                        console.log('Formulário encontrado via seletor, tentando enviar');
                        formElements[0].dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                      }
                    }
                  }
                } catch (err) {
                  console.error('Erro ao tentar submeter o formulário:', err);
                }
              }}
            >
             {modalLoading ? 'Salvando...' : 'Salvar Tarefa'}
            </Button>
          </div>
        }
      >
        {modalError && <Alert type="error" message={modalError} onClose={() => setModalError(null)} />}
        <div id="task-form-container">
          {showModal && (
              <TaskForm
                  task={currentTask}
                  onSave={handleSaveTask}
                  onCancel={handleCloseModal}
                  key={currentTask?.id || 'new-task'} // Reseta o form
              />
          )}
        </div>
      </Modal>

      {/* Modal de Confirmação de Exclusão */}
      <ConfirmDialog
        isOpen={showConfirmDelete}
        title="Confirmar Exclusão"
        message={
          <>
            <p>Tem certeza que deseja excluir a tarefa "<strong>{taskToDelete?.nome}</strong>"?</p>
            <p className="text-sm text-red-600 mt-2">Isso removerá o agendamento. Esta ação não pode ser desfeita.</p>
          </>
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirmDelete(false)}
        variant="danger"
      />

    </div>
  );
};

export default Tasks; 