import React, { useState, useEffect, useCallback } from 'react';
import { FaPlus, FaEdit, FaTrash, FaPlay } from 'react-icons/fa';
import { getQueries, createQuery, updateQuery, deleteQuery, executeQuery } from '../lib/ipcApi';
import Modal from '../components/Modal';
import Table from '../components/Table';
import Button from '../components/Button';
import Alert from '../components/Alert';
import QueryForm from '../components/QueryForm';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';

const QueriesPage = () => {
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentQuery, setCurrentQuery] = useState(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [queryToDelete, setQueryToDelete] = useState(null);
  const [actionFeedback, setActionFeedback] = useState({ type: '', message: '' });
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);

  // Buscar consultas
  const fetchQueries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getQueries();
      if (response.success) {
        setQueries(response.data || []);
        setError('');
      } else {
        setError(`Erro ao buscar consultas: ${response.message}`);
        setQueries([]);
      }
    } catch (err) {
      console.error('Erro crítico ao buscar consultas:', err);
      setError(`Erro crítico ao buscar consultas: ${err.message}`);
      setQueries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  // Abrir modal para criar/editar
  const handleOpenModal = (query = null) => {
    setCurrentQuery(query);
    setIsModalOpen(true);
  };

  // Fechar modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentQuery(null);
  };

  // Salvar uma consulta (criar ou atualizar)
  const handleSaveQuery = async (queryData) => {
    console.log('[Queries] Salvando consulta:', queryData);
    
    try {
      let response;
      
      // Garantir que temos uma query válida
      if (!queryData.query) {
        setActionFeedback({
          type: 'error',
          message: 'A consulta SQL é obrigatória'
        });
        return;
      }

      // Verificar se estamos atualizando ou criando
      if (currentQuery && currentQuery.id) {
        response = await updateQuery(currentQuery.id, queryData);
      } else {
        response = await createQuery(queryData);
      }

      if (response.success) {
        setActionFeedback({
          type: 'success',
          message: `Consulta ${currentQuery ? 'atualizada' : 'criada'} com sucesso!`
        });
        fetchQueries(); // Recarrega a lista
        handleCloseModal();
      } else {
        console.error('Erro ao salvar consulta:', response);
        setActionFeedback({
          type: 'error',
          message: `Erro ao salvar: ${response.message}`
        });
      }
    } catch (err) {
      console.error('Erro crítico ao salvar consulta:', err);
      setActionFeedback({
        type: 'error',
        message: `Erro ao salvar: ${err.message}`
      });
    }
  };

  // Confirmar exclusão
  const handleConfirmDelete = (query) => {
    setQueryToDelete(query);
    setIsConfirmOpen(true);
  };

  // Executar exclusão
  const handleDeleteQuery = async () => {
    if (!queryToDelete || !queryToDelete.id) return;
    
    try {
      const response = await deleteQuery(queryToDelete.id);
      if (response.success) {
        setActionFeedback({
          type: 'success',
          message: 'Consulta excluída com sucesso!'
        });
        fetchQueries(); // Recarrega a lista
      } else {
        setActionFeedback({
          type: 'error',
          message: `Erro ao excluir: ${response.message}`
        });
      }
    } catch (err) {
      console.error('Erro crítico ao excluir consulta:', err);
      setActionFeedback({
        type: 'error',
        message: `Erro ao excluir: ${err.message}`
      });
    } finally {
      setIsConfirmOpen(false);
      setQueryToDelete(null);
    }
  };

  // Executar uma consulta
  const handleExecuteQuery = async (query) => {
    if (!query || !query.id) return;
    
    setIsExecuting(true);
    setExecutionResult(null);
    
    try {
      const response = await executeQuery(query.id);
      setExecutionResult(response);
      if (!response.success) {
        setActionFeedback({
          type: 'error',
          message: `Erro ao executar consulta: ${response.message}`
        });
      }
    } catch (err) {
      console.error('Erro crítico ao executar consulta:', err);
      setActionFeedback({
        type: 'error',
        message: `Erro ao executar: ${err.message}`
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Definir colunas para a tabela
  const columns = [
    { key: 'nome', label: 'Nome' },
    { key: 'descricao', label: 'Descrição' },
    { 
      key: 'conexao_nome', 
      label: 'Conexão',
      render: (row) => row.conexao_nome || 'N/A'
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (row) => (
        <div className="flex space-x-2 justify-end">
          <Button 
            variant="icon" 
            size="sm" 
            title="Executar consulta"
            onClick={() => handleExecuteQuery(row)}
            disabled={isExecuting}
          >
            <FaPlay className="text-green-600" />
          </Button>
          <Button 
            variant="icon" 
            size="sm" 
            title="Editar consulta"
            onClick={() => handleOpenModal(row)}
          >
            <FaEdit className="text-blue-600" />
          </Button>
          <Button 
            variant="icon" 
            size="sm" 
            title="Excluir consulta"
            onClick={() => handleConfirmDelete(row)}
          >
            <FaTrash className="text-red-600" />
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Consultas SQL</h1>
        <Button onClick={() => handleOpenModal()} leftIcon={<FaPlus />}>
          Nova Consulta
        </Button>
      </div>

      {actionFeedback.message && (
        <Alert 
          type={actionFeedback.type} 
          message={actionFeedback.message}
          onClose={() => setActionFeedback({ type: '', message: '' })}
        />
      )}

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {loading ? (
        <LoadingSpinner message="Carregando consultas..." />
      ) : (
        <Table
          columns={columns}
          data={queries}
          emptyMessage="Nenhuma consulta encontrada. Clique em 'Nova Consulta' para criar."
          hoverable
        />
      )}

      {/* Modal para criar/editar consulta */}
      {isModalOpen && (
        <Modal
          title={currentQuery ? 'Editar Consulta' : 'Nova Consulta'}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          footer={
            <div className="flex justify-end space-x-3">
              <Button variant="secondary" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button type="submit" form="modal-form">
                Salvar Consulta
              </Button>
            </div>
          }
        >
          <QueryForm
            query={currentQuery}
            onSave={handleSaveQuery}
            onCancel={handleCloseModal}
          />
        </Modal>
      )}

      {/* Modal de confirmação para excluir */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Confirmar Exclusão"
        message={`Tem certeza que deseja excluir a consulta "${queryToDelete?.nome}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteQuery}
        onCancel={() => {
          setIsConfirmOpen(false);
          setQueryToDelete(null);
        }}
        variant="danger"
      />

      {/* Modal para exibir resultados da execução */}
      {executionResult && (
        <Modal
          title="Resultado da Execução"
          isOpen={!!executionResult}
          onClose={() => setExecutionResult(null)}
          size="lg"
          footer={
            <Button onClick={() => setExecutionResult(null)}>Fechar</Button>
          }
        >
          <div className="space-y-4">
            <div className="bg-gray-100 p-4 rounded">
              <h3 className="font-bold mb-2">{executionResult.success ? 'Consulta executada com sucesso' : 'Erro na execução'}</h3>
              {executionResult.message && (
                <p className="text-sm text-gray-700 mb-2">{executionResult.message}</p>
              )}
              {executionResult.data && (
                <>
                  <p className="text-sm mb-2">
                    {Array.isArray(executionResult.data) 
                      ? `${executionResult.data.length} registro(s) encontrado(s)` 
                      : 'Resultado obtido:'}
                  </p>
                  <div className="max-h-96 overflow-auto">
                    <pre className="text-xs whitespace-pre-wrap">
                      {JSON.stringify(executionResult.data, null, 2)}
                    </pre>
                  </div>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default QueriesPage; 