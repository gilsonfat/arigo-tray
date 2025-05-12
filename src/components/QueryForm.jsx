import React, { useState, useEffect, useCallback } from 'react';
import Button from './Button';
import Alert from './Alert';
import LoadingSpinner from './LoadingSpinner';
import { testQuery, getConnections } from '../lib/ipcApi'; // Importa APIs necessárias

const QueryForm = ({ query, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    query: '', // Mudei de 'sql' para 'query' para corresponder ao backend
    conexao_id: '', // ID da conexão selecionada
    formato_saida: 'json',
    ...(query || {}) // Preenche se editando
  });
  
  // Se estiver editando e o query original tiver 'sql' mas não 'query', ajusta
  useEffect(() => {
    if (query && query.sql && !formData.query) {
      setFormData(prev => ({ ...prev, query: query.sql }));
    }
  }, [query]);
  
  const [connections, setConnections] = useState([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, message, data? }
  const [formError, setFormError] = useState('');

  // Busca conexões disponíveis para o select
  const fetchConnections = useCallback(async () => {
    setConnectionsLoading(true);
    try {
      const response = await getConnections();
      if (response.success) {
        setConnections(response.data || []);
        // Se criando uma nova query e tem conexões, pré-seleciona a primeira
        if (!query && response.data?.length > 0 && !formData.conexao_id) {
          setFormData(prev => ({ ...prev, conexao_id: response.data[0].id }));
        }
      } else {
        setFormError(`Erro ao carregar conexões: ${response.message}`);
        setConnections([]);
      }
    } catch (error) {
      setFormError(`Erro crítico ao carregar conexões: ${error.message}`);
    } finally {
      setConnectionsLoading(false);
    }
  }, [query, formData.conexao_id]); // Adiciona formData.conexao_id para evitar loop

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Limpa resultado do teste se SQL ou conexão mudarem
  useEffect(() => {
    setTestResult(null);
  }, [formData.query, formData.conexao_id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setFormError(''); // Limpa erro ao digitar
  };

  const handleTest = async () => {
    if (!formData.query || !formData.conexao_id) {
      setFormError("Selecione uma conexão e insira a consulta SQL para testar.");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setFormError('');
    try {
      const result = await testQuery(formData.query, formData.conexao_id);
      setTestResult(result); // API retorna { success, message, data? }
    } catch (error) {
      console.error("Erro ao testar consulta:", error);
      setTestResult({ success: false, message: error.message || "Erro desconhecido" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nome || !formData.query || !formData.conexao_id) {
      setFormError('Preencha Nome, Consulta SQL e selecione uma Conexão.');
      return;
    }
    
    // Garante que os dados estão no formato correto
    const queryData = {
      nome: formData.nome,
      descricao: formData.descricao || '',
      conexao_id: parseInt(formData.conexao_id, 10), // Convertendo para número 
      query: formData.query, // Campo principal
      formato_saida: formData.formato_saida,
    };
    
    console.log('[QueryForm] Enviando dados para salvar:', queryData);
    onSave(queryData);
  };

  const renderInputField = (id, label, required = false, type = "text", placeholder = "") => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        id={id}
        name={id}
        value={formData[id]}
        onChange={handleChange}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        placeholder={placeholder}
        disabled={isTesting}
      />
    </div>
  );

  return (
    <form id="modal-form" onSubmit={handleSubmit} className="space-y-4">
      {formError && <Alert type="error" message={formError} onClose={() => setFormError('')} />}
      {testResult && (
        <Alert
          type={testResult.success ? 'success' : 'error'}
          message={`Teste da Consulta: ${testResult.message}${testResult.data ? ` (${testResult.data.length} linha(s))` : ''}`}
          onClose={() => setTestResult(null)}
          autoClose={false}
        />
      )}
       {/* Exibe dados do teste se sucesso (limitado) */}
       {testResult?.success && testResult?.data && (
         <div className="mt-2 p-3 bg-gray-100 rounded max-h-40 overflow-auto border">
           <pre className="text-xs font-mono">{JSON.stringify(testResult.data.slice(0, 5), null, 2)}</pre>
            {testResult.data.length > 5 && <p className="text-xs text-gray-500">... (mostrando 5 de {testResult.data.length} linhas)</p>}
         </div>
       )}

      {renderInputField('nome', 'Nome da Consulta', true, 'text', 'Ex: Buscar Clientes Novos')}
      {renderInputField('descricao', 'Descrição', false, 'text', 'Consulta para extrair clientes cadastrados hoje')}

      <div>
        <label htmlFor="conexao_id" className="block text-sm font-medium text-gray-700 mb-1">
          Conexão ODBC<span className="text-red-500">*</span>
        </label>
        {connectionsLoading ? (
          <LoadingSpinner size="sm" message="Carregando conexões..." />
        ) : (
          <select
            id="conexao_id"
            name="conexao_id"
            value={formData.conexao_id}
            onChange={handleChange}
            required
            disabled={isTesting || connections.length === 0}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          >
            <option value="" disabled>{connections.length === 0 ? 'Nenhuma conexão encontrada' : '-- Selecione --'}</option>
            {connections.map(conn => (
              <option key={conn.id} value={conn.id}>{conn.nome} ({conn.banco}@{conn.host})</option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-1">
          Consulta SQL<span className="text-red-500">*</span>
        </label>
        <textarea
          id="query"
          name="query"
          rows="8" // Ajuste conforme necessário
          value={formData.query}
          onChange={handleChange}
          required
          disabled={isTesting}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm font-mono text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          placeholder="SELECT * FROM Clientes WHERE DataCadastro = TODAY()"
        ></textarea>
         <p className="text-xs text-gray-500 mt-1">Insira a consulta SQL que será executada.</p>
      </div>

      <div>
        <label htmlFor="formato_saida" className="block text-sm font-medium text-gray-700">Formato de Saída</label>
        <select
          id="formato_saida"
          name="formato_saida"
          value={formData.formato_saida}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2"
        >
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
          <option value="excel">Excel</option>
        </select>
      </div>

      {/* Botão de Teste */}
      <div className="pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={handleTest}
          isLoading={isTesting}
          disabled={isTesting || !formData.conexao_id || !formData.query || connectionsLoading}
          className="w-full sm:w-auto"
        >
          {isTesting ? 'Testando...' : 'Testar Consulta'}
        </Button>
      </div>
    </form>
  );
};

export default QueryForm; 