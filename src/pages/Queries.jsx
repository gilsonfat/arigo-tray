import React, { useState, useEffect, useCallback } from 'react';
import { FaPlus, FaEdit, FaTrash, FaPlay, FaExchangeAlt, FaCog } from 'react-icons/fa';
import { 
  getQueries, 
  createQuery, 
  updateQuery, 
  deleteQuery, 
  executeQuery, 
  getTransformation,
  getTransformationConfigs,
  saveTransformationConfig,
  deleteTransformationConfig,
  getTransformationConfig
} from '../lib/ipcApi';
import Modal from '../components/Modal';
import Table from '../components/Table';
import Button from '../components/Button';
import Alert from '../components/Alert';
import QueryForm from '../components/QueryForm';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import DataTransformViewer from '../components/DataTransformViewer';
import TransformationConfig from '../components/TransformationConfig';

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
  const [transformationData, setTransformationData] = useState(null);
  const [showTransformViewer, setShowTransformViewer] = useState(false);
  const [isTransformConfigOpen, setIsTransformConfigOpen] = useState(false);
  const [selectedQueryForTransform, setSelectedQueryForTransform] = useState(null);
  const [transformConfigs, setTransformConfigs] = useState([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [currentTransformConfig, setCurrentTransformConfig] = useState(null);
  const [isSelectConfigOpen, setIsSelectConfigOpen] = useState(false);
  const [isSelectConfigForExec, setIsSelectConfigForExec] = useState(false);

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
    
    // Adicionar um controle para evitar submissões múltiplas
    if (loading) {
      console.log('[Queries] Operação já em andamento, ignorando chamada duplicada');
      return;
    }
    
    setLoading(true);
    
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
      
      // Garantir que o conexao_id seja um número
      const formattedData = {
        ...queryData,
        conexao_id: typeof queryData.conexao_id === 'string' 
          ? parseInt(queryData.conexao_id, 10) 
          : queryData.conexao_id
      };
      
      console.log('[Queries] Dados formatados para envio:', formattedData);

      // Verificar se estamos atualizando ou criando
      if (currentQuery && currentQuery.id) {
        response = await updateQuery(currentQuery.id, formattedData);
      } else {
        response = await createQuery(formattedData);
      }

      if (response.success) {
        setActionFeedback({
          type: 'success',
          message: `Consulta ${currentQuery ? 'atualizada' : 'criada'} com sucesso!`
        });
        await fetchQueries(); // Recarrega a lista
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
    } finally {
      setLoading(false);
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

  // Visualizar a transformação de dados
  const handleViewTransformation = async () => {
    if (!executionResult?.transformationId) {
      setActionFeedback({
        type: 'error',
        message: 'Nenhuma transformação disponível para visualizar'
      });
      return;
    }
    
    try {
      const transformationData = await getTransformation(executionResult.transformationId);
      setTransformationData(transformationData);
      setShowTransformViewer(true);
    } catch (err) {
      console.error('Erro ao obter dados da transformação:', err);
      setActionFeedback({
        type: 'error',
        message: `Erro ao visualizar transformação: ${err.message}`
      });
    }
  };

  // Carregar configurações de transformação
  const loadTransformConfigs = async (queryId) => {
    console.log('Iniciando carregamento de configurações para consulta:', queryId);
    
    if (!queryId) {
      console.error('ID de consulta não fornecido para carregar configurações');
      return;
    }
    
    setLoadingConfigs(true);
    try {
      const result = await getTransformationConfigs(queryId);
      
      if (!result) {
        console.error('Resposta vazia ao buscar configurações de transformação');
        setTransformConfigs([]);
        return;
      }
      
      if (!result.success) {
        console.error('Erro ao buscar configurações:', result.message);
        setActionFeedback({
          type: 'error',
          message: `Erro ao carregar configurações: ${result.message}`
        });
        setTransformConfigs([]);
        return;
      }
      
      // Verificar se os dados retornados são um array
      if (!Array.isArray(result.data)) {
        console.error('Resposta inválida: dados não são um array:', result.data);
        setTransformConfigs([]);
        return;
      }
      
      console.log(`Carregadas ${result.data.length} configurações para consulta ${queryId}`);
      setTransformConfigs(result.data);
    } catch (err) {
      console.error('Erro ao carregar configurações de transformação:', err);
      setActionFeedback({
        type: 'error',
        message: `Erro ao carregar configurações: ${err.message}`
      });
      setTransformConfigs([]);
    } finally {
      setLoadingConfigs(false);
    }
  };

  // Abrir modal de configuração de transformação
  const handleOpenTransformConfig = async (query, configId = null) => {
    console.log('Abrindo configuração de transformação para consulta:', query?.id, 'configID:', configId);
    
    if (!query) {
      console.error('Tentativa de abrir configuração sem consulta válida');
      setActionFeedback({
        type: 'error',
        message: 'Consulta inválida. Tente novamente.'
      });
      return;
    }
    
    // Armazenar a consulta selecionada
    setSelectedQueryForTransform(query);
    
    try {
      // Carregar configurações para esta consulta
      console.log('Carregando configurações para consulta:', query.id);
      await loadTransformConfigs(query.id);
      
      // Verificar se temos configurações carregadas
      console.log('Configurações carregadas:', transformConfigs.length);
      
      if (configId) {
        // Carregar configuração específica
        console.log('Tentando carregar configuração específica:', configId);
        try {
          const configResult = await getTransformationConfig(configId);
          
          if (!configResult || !configResult.success) {
            console.error('Erro ao obter configuração específica:', configResult?.message || 'Resposta inválida');
            throw new Error(configResult?.message || 'Não foi possível carregar a configuração');
          }
          
          // Obter os dados da configuração
          const configData = configResult.data;
          console.log('Configuração carregada com sucesso:', configData);
          
          // Verificar e garantir que os campos necessários estejam presentes
          setCurrentTransformConfig(configData);
          setIsTransformConfigOpen(true);
        } catch (err) {
          console.error('Erro ao carregar configuração específica:', err);
          setActionFeedback({
            type: 'error',
            message: `Erro ao carregar configuração: ${err.message}`
          });
          return;
        }
      } else if (transformConfigs.length > 0) {
        // Se temos alguma configuração existente, carregar a primeira por padrão
        // ou mostrar o seletor se houver mais de uma
        if (transformConfigs.length === 1) {
          // Se há apenas uma configuração, usá-la diretamente
          const configId = transformConfigs[0].id;
          console.log('Carregando a única configuração existente:', configId);
          
          try {
            const configResult = await getTransformationConfig(configId);
            
            if (!configResult || !configResult.success) {
              throw new Error(configResult?.message || 'Não foi possível carregar a configuração');
            }
            
            setCurrentTransformConfig(configResult.data);
            setIsTransformConfigOpen(true);
          } catch (err) {
            console.error('Erro ao carregar configuração automática:', err);
            // Continuar e criar uma nova configuração
            setCurrentTransformConfig(null);
            setIsTransformConfigOpen(true);
          }
        } else {
          // Se há mais de uma configuração, mostrar o seletor
          console.log('Exibindo seletor de configurações existentes');
          setIsSelectConfigOpen(true);
        }
      } else {
        // Se não temos configurações, abrir modal vazio
        console.log('Criando nova configuração');
        setCurrentTransformConfig(null);
        setIsTransformConfigOpen(true);
      }
    } catch (err) {
      console.error('Erro ao preparar modal de configuração:', err);
      setActionFeedback({
        type: 'error',
        message: `Erro ao preparar configuração: ${err.message}`
      });
    }
  };

  // Selecionar uma configuração existente
  const handleSelectConfig = async (configId) => {
    setIsSelectConfigOpen(false);
    
    if (configId === 'new') {
      // Criar nova configuração
      setCurrentTransformConfig(null);
      setIsTransformConfigOpen(true);
    } else {
      // Carregar configuração selecionada
      try {
        console.log('Carregando configuração selecionada:', configId);
        const configResult = await getTransformationConfig(configId);
        
        if (!configResult || !configResult.success) {
          console.error('Erro ao obter configuração:', configResult?.message || 'Resposta inválida');
          throw new Error(configResult?.message || 'Não foi possível carregar a configuração');
        }
        
        // Obter os dados da configuração
        const configData = configResult.data;
        console.log('Configuração carregada com sucesso:', configData);
        
        // Garantir que os dados estejam formatados corretamente
        setCurrentTransformConfig(configData);
        setIsTransformConfigOpen(true);
      } catch (err) {
        console.error('Erro ao carregar configuração:', err);
        setActionFeedback({
          type: 'error',
          message: `Erro ao carregar configuração: ${err.message}`
        });
      }
    }
  };

  // Salvar configuração de transformação
  const handleSaveTransformConfig = async (configData) => {
    console.log('Salvando configuração de transformação:', configData);
    
    try {
      // Verificar se queryId é válido
      if (!selectedQueryForTransform || !selectedQueryForTransform.id) {
        console.error('ID da consulta não disponível para salvar configuração');
        setActionFeedback({
          type: 'error',
          message: 'Erro ao salvar: ID da consulta não encontrado'
        });
        return null;
      }
      
      // Garantir que queryId seja um número
      let queryId = selectedQueryForTransform.id;
      if (typeof queryId === 'string') {
        queryId = parseInt(queryId, 10);
        if (isNaN(queryId)) {
          console.error('ID da consulta inválido:', selectedQueryForTransform.id);
          setActionFeedback({
            type: 'error',
            message: 'Erro ao salvar: ID de consulta inválido'
          });
          return null;
        }
      }
      
      // Verificar se temos configurações existentes para esta consulta
      let existingConfig = null;
      
      // Verificar se já existe uma configuração com este ID
      if (configData.id) {
        existingConfig = transformConfigs.find(config => config.id === configData.id);
        console.log('Verificando configuração existente por ID:', configData.id, existingConfig ? 'encontrada' : 'não encontrada');
      }
      
      // Se não encontramos por ID, verificar se existe alguma configuração para esta consulta
      if (!existingConfig && transformConfigs.length > 0) {
        // Verificar se existe uma com o mesmo nome
        existingConfig = transformConfigs.find(config => 
          config.name === configData.name && Number(config.queryId) === Number(queryId)
        );
        
        console.log('Verificando configuração existente por nome:', configData.name, existingConfig ? 'encontrada' : 'não encontrada');
        
        // Se não existe com o mesmo nome, mas existe alguma configuração para esta consulta, 
        // considerar usar a primeira configuração existente
        if (!existingConfig && transformConfigs.length === 1) {
          existingConfig = transformConfigs[0];
          console.log('Usando a única configuração existente:', existingConfig.id);
        }
      }
      
      // Se encontramos uma configuração existente, usar o ID dela
      if (existingConfig) {
        console.log('Atualizando configuração existente:', existingConfig.id);
        configData.id = existingConfig.id;
      }
      
      // Preparar dados para salvar
      const configToSave = {
        ...configData,
        queryId: queryId
      };
      
      console.log('Enviando configuração para salvar:', configToSave);
      
      // Salvar a configuração
      const saveResult = await saveTransformationConfig(configToSave);
      
      if (!saveResult) {
        console.error('Servidor retornou resposta vazia');
        throw new Error('O servidor retornou uma resposta vazia. Verifique a conexão com o servidor.');
      }
      
      if (!saveResult.success) {
        console.error('Servidor retornou erro:', saveResult);
        throw new Error(saveResult.message || 'Erro desconhecido do servidor');
      }
      
      console.log('Configuração salva com sucesso:', saveResult.data);
      
      // Recarregar a lista de configurações para manter sincronizado
      await loadTransformConfigs(queryId);
      
      setActionFeedback({
        type: 'success',
        message: existingConfig ? 'Configuração atualizada com sucesso!' : 'Nova configuração salva com sucesso!'
      });
      
      // Fechar o modal de configuração
      setIsTransformConfigOpen(false);
      setCurrentTransformConfig(null);
      
      // Retornar a configuração salva para permitir feedback no componente filho
      return saveResult.data;
    } catch (err) {
      console.error('Erro ao salvar configuração:', err);
      setActionFeedback({
        type: 'error',
        message: `Erro ao salvar configuração: ${err.message}`
      });
      return null;
    }
  };

  // Executar uma consulta com configuração específica
  const handleExecuteWithConfig = async (query) => {
    // Abrir seletor de configuração
    setSelectedQueryForTransform(query);
    
    // Carregar configurações para esta consulta
    setLoadingConfigs(true);
    try {
      const configs = await getTransformationConfigs(query.id);
      setTransformConfigs(configs || []);
      
      if (configs && configs.length > 0) {
        // Abrir modal de seleção para execução
        setIsSelectConfigForExec(true);
      } else {
        // Não há configurações, mostrar mensagem
        setActionFeedback({
          type: 'warning',
          message: 'Não existem configurações de transformação para esta consulta.'
        });
      }
    } catch (err) {
      console.error('Erro ao carregar configurações de transformação:', err);
      setActionFeedback({
        type: 'error',
        message: `Erro ao carregar configurações: ${err.message}`
      });
    } finally {
      setLoadingConfigs(false);
    }
  };

  // Executar com a configuração selecionada
  const executeWithSelectedConfig = async (configId) => {
    setIsSelectConfigForExec(false);
    
    if (!selectedQueryForTransform || !configId) return;
    
    setIsExecuting(true);
    setExecutionResult(null);
    
    try {
      const response = await executeQuery(selectedQueryForTransform.id, configId);
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
      key: 'connection_name', 
      label: 'Conexão',
      render: (row) => row.connection_name || 'N/A'
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (row) => (
        <div className="flex space-x-2 justify-end">
          <Button 
            variant="icon" 
            size="sm" 
            title="Configurar transformação"
            onClick={() => handleOpenTransformConfig(row)}
          >
            <FaCog className="text-purple-600" />
          </Button>
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
            title="Executar com transformação"
            onClick={() => handleExecuteWithConfig(row)}
            disabled={isExecuting}
          >
            <FaExchangeAlt className="text-green-800" />
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
            <div className="flex justify-between w-full">
              {executionResult.success && executionResult.transformationId && (
                <Button 
                  variant="secondary" 
                  leftIcon={<FaExchangeAlt />}
                  onClick={handleViewTransformation}
                >
                  Visualizar Transformação
                </Button>
              )}
              <Button onClick={() => setExecutionResult(null)}>Fechar</Button>
            </div>
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

      {/* Modal para visualização de transformação de dados */}
      {showTransformViewer && transformationData && (
        <DataTransformViewer 
          originalData={transformationData.originalData}
          transformedData={transformationData.transformedData}
          onClose={() => setShowTransformViewer(false)}
        />
      )}

      {/* Modal para seleção de configuração existente */}
      {isSelectConfigOpen && (
        <Modal
          title="Selecionar Configuração de Transformação"
          isOpen={isSelectConfigOpen}
          onClose={() => setIsSelectConfigOpen(false)}
          size="md"
          footer={
            <div className="flex justify-end">
              <Button onClick={() => setIsSelectConfigOpen(false)} variant="secondary">
                Cancelar
              </Button>
            </div>
          }
        >
          <div className="p-4">
            <div className="mb-4">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Configurações disponíveis para {selectedQueryForTransform?.nome}
              </h3>
              <p className="text-sm text-gray-500">
                Selecione uma configuração existente ou crie uma nova.
              </p>
            </div>
            
            {loadingConfigs ? (
              <div className="py-4 text-center">
                <LoadingSpinner message="Carregando configurações..." />
              </div>
            ) : (
              <div className="space-y-2">
                <div 
                  className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                  onClick={() => handleSelectConfig('new')}
                >
                  <div>
                    <span className="font-medium text-blue-600">+ Criar nova configuração</span>
                  </div>
                  <FaPlus className="text-blue-600" />
                </div>
                
                {transformConfigs.length > 0 ? (
                  transformConfigs.map(config => (
                    <div 
                      key={config.id}
                      className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                      onClick={() => handleSelectConfig(config.id)}
                    >
                      <div>
                        <span className="font-medium">{config.name}</span>
                        <p className="text-xs text-gray-500">
                          Criado em {new Date(config.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <FaEdit className="text-gray-400" />
                    </div>
                  ))
                ) : (
                  <p className="py-2 text-sm text-gray-500 text-center">
                    Nenhuma configuração encontrada para esta consulta.
                  </p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal para configuração de transformação */}
      {isTransformConfigOpen && selectedQueryForTransform && (
        <Modal
          title={currentTransformConfig ? 'Editar Configuração de Transformação' : 'Nova Configuração de Transformação'}
          isOpen={isTransformConfigOpen}
          onClose={() => setIsTransformConfigOpen(false)}
          size="xl"
          noFooter={true}
        >
          <TransformationConfig
            queryId={selectedQueryForTransform.id}
            connectionId={selectedQueryForTransform.conexao_id}
            sql={selectedQueryForTransform.query || selectedQueryForTransform.sql}
            currentMapping={currentTransformConfig}
            onSave={handleSaveTransformConfig}
            onCancel={() => setIsTransformConfigOpen(false)}
          />
        </Modal>
      )}

      {/* Modal para seleção de configuração para execução */}
      {isSelectConfigForExec && (
        <Modal
          title="Selecionar Configuração de Execução"
          isOpen={isSelectConfigForExec}
          onClose={() => setIsSelectConfigForExec(false)}
          size="md"
          footer={
            <div className="flex justify-end">
              <Button onClick={() => setIsSelectConfigForExec(false)} variant="secondary">
                Cancelar
              </Button>
            </div>
          }
        >
          <div className="p-4">
            <div className="mb-4">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Configurações disponíveis para {selectedQueryForTransform?.nome}
              </h3>
              <p className="text-sm text-gray-500">
                Selecione uma configuração existente ou crie uma nova.
              </p>
            </div>
            
            {loadingConfigs ? (
              <div className="py-4 text-center">
                <LoadingSpinner message="Carregando configurações..." />
              </div>
            ) : (
              <div className="space-y-2">
                <div 
                  className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                  onClick={() => executeWithSelectedConfig('new')}
                >
                  <div>
                    <span className="font-medium text-blue-600">+ Criar nova configuração</span>
                  </div>
                  <FaPlus className="text-blue-600" />
                </div>
                
                {transformConfigs.length > 0 ? (
                  transformConfigs.map(config => (
                    <div 
                      key={config.id}
                      className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                      onClick={() => executeWithSelectedConfig(config.id)}
                    >
                      <div>
                        <span className="font-medium">{config.name}</span>
                        <p className="text-xs text-gray-500">
                          Criado em {new Date(config.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <FaEdit className="text-gray-400" />
                    </div>
                  ))
                ) : (
                  <p className="py-2 text-sm text-gray-500 text-center">
                    Nenhuma configuração encontrada para esta consulta.
                  </p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default QueriesPage; 