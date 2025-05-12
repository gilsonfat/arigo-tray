import React, { useState, useEffect, useCallback } from 'react';
import { getConnections, createConnection, updateConnection, deleteConnection, testConnection, diagnoseConnection } from '../lib/ipcApi';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Alert from '../components/Alert';
import LoadingSpinner from '../components/LoadingSpinner';
import ConnectionForm from '../components/ConnectionForm'; // Assumindo que ConnectionForm.jsx existe em src/components/
import ConnectionDiagnostics from '../components/ConnectionDiagnostics';
import { FaSearch, FaStethoscope } from 'react-icons/fa';
import ConfirmDialog from '../components/ConfirmDialog';

// Componente para o ícone de diagnóstico
const DiagnoseIcon = () => <FaStethoscope />;

const Connections = () => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // Erro geral da página
  const [showModal, setShowModal] = useState(false);
  const [currentConnection, setCurrentConnection] = useState(null); // null para criar, objeto para editar
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null); // Erro específico do modal
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState(null);
  const [actionResult, setActionResult] = useState(null); // Feedback de sucesso/erro após ação
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [diagnosticConnection, setDiagnosticConnection] = useState(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);

  // Função para buscar conexões
  const fetchConnections = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionResult(null); // Limpa feedback anterior
    try {
      const response = await getConnections();
      if (response.success) {
        setConnections(response.data || []);
      } else {
        setError(response.message || 'Erro desconhecido ao buscar conexões.');
      }
    } catch (err) {
      console.error("Catch no fetchConnections:", err);
      setError(err.message || 'Erro crítico ao buscar conexões.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Busca conexões ao montar o componente
  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // --- Handlers para CRUD ---

  const handleOpenModal = (connection = null) => {
    setCurrentConnection(connection); // Define se é edição ou criação
    setModalError(null); // Limpa erros do modal anterior
    setShowModal(true);
  };

  const handleCloseModal = () => {
    if (modalLoading) return; // Impede fechar enquanto salva
    setShowModal(false);
    setCurrentConnection(null);
    setModalError(null);
  };

  const handleSaveConnection = async (formData) => {
    setModalLoading(true);
    setModalError(null);
    setActionResult(null);
    try {
      let response;

      if (currentConnection?.id) {
        // Atualização
        response = await updateConnection(currentConnection.id, formData);
      } else {
        // Criação
        response = await createConnection(formData);
      }

      if (response.success) {
        setActionResult({
          type: 'success',
          message: `Conexão "${formData.nome}" ${currentConnection?.id ? 'atualizada' : 'criada'} com sucesso!`
        });

        setShowModal(false);
        fetchConnections();
      } else {
        // Exibe erro dentro do modal
        setModalError(response.message || `Erro ao ${currentConnection?.id ? 'atualizar' : 'criar'} conexão.`);
      }
    } catch (error) {
         console.error("Catch no handleSaveConnection:", error);
         setModalError(error.message || 'Erro crítico ao salvar conexão.');
    } finally {
       setModalLoading(false);
    }
  };


  const handleDeleteRequest = (connection) => {
    setConnectionToDelete(connection);
    setShowConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    if (!connectionToDelete) return;
    setActionResult(null);
    try {
      const response = await deleteConnection(connectionToDelete.id);
      if (response.success) {
        setActionResult({ type: 'success', message: `Conexão "${connectionToDelete.nome}" excluída com sucesso!` });
        fetchConnections(); // Recarrega
      } else {
        setActionResult({ type: 'error', message: response.message || 'Erro ao excluir conexão.' });
      }
    } catch (err) {
        console.error("Catch no handleConfirmDelete:", err);
        setActionResult({ type: 'error', message: err.message || 'Erro crítico ao excluir conexão.' });
    } finally {
      setShowConfirmDelete(false);
      setConnectionToDelete(null);
    }
  };

  const handleDiagnose = async (connection) => {
    setDiagnosticConnection(connection);
    setDiagnosticLoading(true);
    setDiagnosticResult(null);
    setShowDiagnosticModal(true);
    
    try {
      console.log(`Iniciando diagnóstico para conexão: ${connection.nome} (ID: ${connection.id})`);
      
      const resultado = await diagnoseConnection(connection.id);
      console.log('Resultado do diagnóstico:', resultado);
      
      // A nova função retorna diretamente o objeto de diagnóstico
      setDiagnosticResult(resultado);
    } catch (error) {
      console.error('Exceção ao executar diagnóstico:', error);
      setActionResult({
        type: 'error',
        message: `Erro ao diagnosticar conexão: ${error.message}`
      });
      setShowDiagnosticModal(false);
    } finally {
      setDiagnosticLoading(false);
    }
  };

  const handleCloseDiagnosticModal = () => {
    setShowDiagnosticModal(false);
    setDiagnosticResult(null);
    setDiagnosticConnection(null);
  };

  // --- Renderização ---

  if (loading) {
    return <LoadingSpinner message="Carregando conexões..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-800">Conexões ODBC</h1>
        <Button variant="success" onClick={() => handleOpenModal()}>
          Adicionar Nova Conexão
        </Button>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
      {actionResult && (
         <Alert
            type={actionResult.type}
            message={actionResult.message}
            onClose={() => setActionResult(null)}
            autoClose={actionResult.type === 'success'}
         />
      )}

      {/* Tabela de Conexões */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Host</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Banco</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {connections.length === 0 && !loading && (
              <tr>
                <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                  Nenhuma conexão encontrada.
                </td>
              </tr>
            )}
            {connections.map((conn) => (
              <tr key={conn.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{conn.nome}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{conn.host}{conn.porta ? `:${conn.porta}` : ''}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{conn.banco}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{conn.usuario}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                  <Button variant="secondary" size="sm" onClick={() => handleOpenModal(conn)}>
                    Editar
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDeleteRequest(conn)}>
                    Excluir
                  </Button>
                  <Button 
                    variant="info" 
                    size="sm"
                    onClick={() => handleDiagnose(conn)} 
                    disabled={loading || diagnosticLoading}
                    title="Diagnosticar Conexão"
                  >
                    <DiagnoseIcon />
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
        title={currentConnection ? 'Editar Conexão' : 'Adicionar Nova Conexão'}
        size="lg" // Ajuste o tamanho conforme necessário
        preventClose={modalLoading} // Impede fechar enquanto salva
        showFooter={false} // Não usamos o footer padrão do modal, o form já tem botões
      >
        {modalError && (
          <Alert 
            type="error" 
            message={modalError} 
            onClose={() => setModalError(null)} 
          />
        )}
        <ConnectionForm 
          connection={currentConnection} 
          onSave={handleSaveConnection} 
          onCancel={handleCloseModal} 
        />
      </Modal>

      {/* Modal de Diagnóstico */}
      <Modal
        isOpen={showDiagnosticModal}
        onClose={handleCloseDiagnosticModal}
        title={`Diagnóstico: ${diagnosticConnection?.nome || 'Conexão'}`}
        size="lg"
      >
        {diagnosticLoading ? (
          <div className="p-8 text-center">
            <LoadingSpinner message="Realizando diagnóstico da conexão..." />
          </div>
        ) : (
          <ConnectionDiagnostics 
            results={diagnosticResult} 
            connection={diagnosticConnection} 
          />
        )}
        <div className="flex justify-end mt-4">
          <Button variant="primary" onClick={handleCloseDiagnosticModal}>
            Fechar
          </Button>
        </div>
      </Modal>

      {/* Modal de Confirmar Exclusão */}
      <ConfirmDialog
        isOpen={showConfirmDelete}
        title="Confirmar Exclusão"
        message={`Tem certeza que deseja excluir a conexão "${connectionToDelete?.nome}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirmDelete(false)}
        variant="danger"
      />

    </div>
  );
};

export default Connections; 