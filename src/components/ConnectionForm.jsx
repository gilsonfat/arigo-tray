import React, { useState, useEffect } from 'react';
import Button from './Button';
import Alert from './Alert';
import LoadingSpinner from './LoadingSpinner';
import { testConnection, getOdbcDrivers } from '../lib/ipcApi'; // Importar getOdbcDrivers

const ConnectionForm = ({ connection, onSave, onCancel }) => {
  console.log('[ConnectionForm] Inicializando com connection:', connection);
  
  // Quando estamos editando, pegamos os dados existentes ou os campos individuais se existirem
  const [formData, setFormData] = useState({
    nome: '',
    driver: 'SQL Anywhere 17', // Driver padrão
    host: '',
    porta: '2638', // Porta padrão SQL Anywhere
    banco: '',
    usuario: '',
    senha: '',
    params: '', // Campo opcional para parâmetros extras
    ...(connection || {}) // Preenche com dados existentes se editando
  });

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, message }
  const [formError, setFormError] = useState('');
  const [availableDrivers, setAvailableDrivers] = useState([]); // Estado para armazenar os drivers disponíveis
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(false); // Para controlar o estado de carregamento

  // Carregar os drivers disponíveis quando o componente montar
  useEffect(() => {
    const loadDrivers = async () => {
      try {
        setIsLoadingDrivers(true);
        console.log('[ConnectionForm] Carregando drivers ODBC disponíveis...');
        const drivers = await getOdbcDrivers();
        console.log('[ConnectionForm] Drivers ODBC disponíveis:', drivers);
        
        if (drivers && drivers.length > 0) {
          setAvailableDrivers(drivers);
          
          // Se não houver driver selecionado e existirem drivers disponíveis, seleciona o primeiro
          if (!formData.driver && drivers.length > 0) {
            setFormData(prev => ({ ...prev, driver: drivers[0] }));
          }
        } else {
          console.warn('[ConnectionForm] Nenhum driver ODBC encontrado');
          setAvailableDrivers(['SQL Anywhere 17', 'SQL Anywhere 16', 'SQL Anywhere']); // Fallback para drivers padrão
        }
      } catch (error) {
        console.error('[ConnectionForm] Erro ao carregar drivers ODBC:', error);
        setAvailableDrivers(['SQL Anywhere 17', 'SQL Anywhere 16', 'SQL Anywhere']); // Fallback para drivers padrão
      } finally {
        setIsLoadingDrivers(false);
      }
    };
    
    loadDrivers();
  }, []);

  // Limpa o resultado do teste se os dados da conexão mudarem
  useEffect(() => {
    setTestResult(null);
  }, [formData.host, formData.porta, formData.banco, formData.usuario, formData.senha, formData.driver, formData.params]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    console.log(`[ConnectionForm] Campo alterado: ${name} = ${value}`);
    setFormData(prev => ({ ...prev, [name]: value }));
    setFormError(''); // Limpa erro ao digitar
  };

  const handleTest = async () => {
    console.log('[ConnectionForm] Testando conexão com dados:', formData);
    setIsTesting(true);
    setTestResult(null);
    setFormError('');
    try {
        // Passa os dados atuais do formulário para teste
      const result = await testConnection(formData);
      console.log('[ConnectionForm] Resultado do teste:', result);
      setTestResult(result);
    } catch (error) {
      console.error("[ConnectionForm] Erro ao testar conexão:", error);
      setTestResult({ success: false, message: error.message || "Erro desconhecido" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('[ConnectionForm] Submetendo formulário com dados:', formData);
    
    // Validação simples
    if (!formData.nome || !formData.host || !formData.banco || !formData.usuario || !formData.senha) {
        setFormError('Preencha todos os campos obrigatórios (*).');
        return;
    }

    // Mapeia os campos do formulário para o formato completo que o banco de dados espera
    const connectionData = {
      ...formData, // Mantém todos os campos originais do formulário
      // Constrói a string de conexão combinando todos os dados
      connection_string: `DRIVER={${formData.driver}};SERVER=${formData.host};PORT=${formData.porta};DBN=${formData.banco};UID=${formData.usuario};PWD=${formData.senha};${formData.params || ''}`,
      // Se for um novo objeto, garanta que dsn tenha valor padrão
      dsn: formData.dsn || ''
    };
    
    console.log('[ConnectionForm] Enviando dados para salvar:', connectionData);
    onSave(connectionData); // Chama a função de salvar passada pelo pai
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
        value={formData[id] || ''}
        onChange={handleChange}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        placeholder={placeholder}
        disabled={isTesting}
      />
    </div>
  );

  // Botões para o formulário
  const renderFormButtons = () => (
    <div className="mt-6 flex space-x-3 justify-end">
      <Button
        type="button"
        variant="secondary"
        onClick={onCancel}
        disabled={isTesting}
      >
        Cancelar
      </Button>
      <Button
        type="submit"
        variant="primary"
        disabled={isTesting}
      >
        Salvar Conexão
      </Button>
    </div>
  );

  return (
    <form id="modal-form" onSubmit={handleSubmit} className="space-y-4">
      {formError && <Alert type="error" message={formError} onClose={() => setFormError('')} />}
      {testResult && (
        <Alert
          type={testResult.success ? 'success' : 'error'}
          message={`Teste de conexão: ${testResult.message}`}
          onClose={() => setTestResult(null)}
          autoClose={false} // Não fecha automaticamente o resultado do teste
        />
      )}

      {/* Campos do formulário que estavam faltando */}
      {renderInputField('nome', 'Nome da Conexão', true, 'text', 'Ex: Produção Principal')}

      <div>
        <label htmlFor="driver" className="block text-sm font-medium text-gray-700 mb-1">
          Driver ODBC<span className="text-red-500">*</span>
        </label>
        <select
          id="driver"
          name="driver"
          value={formData.driver || ''}
          onChange={handleChange}
          required
          disabled={isTesting || isLoadingDrivers}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        >
          {isLoadingDrivers ? (
            <option value="">Carregando drivers...</option>
          ) : (
            availableDrivers.length > 0 ? (
              availableDrivers.map((driver, index) => (
                <option key={index} value={driver}>
                  {driver}
                </option>
              ))
            ) : (
              <option value="">Nenhum driver encontrado</option>
            )
          )}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderInputField('host', 'Host / Servidor', true, 'text', '192.168.1.100 ou NOME_SERVIDOR')}
        {renderInputField('porta', 'Porta', false, 'number', '2638')}
      </div>

      {renderInputField('banco', 'Nome do Banco (DatabaseName)', true, 'text', 'meu_banco')}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderInputField('usuario', 'Usuário (UID)', true)}
        {renderInputField('senha', 'Senha (PWD)', true, 'password')}
      </div>

       {renderInputField('params', 'Parâmetros Adicionais', false, 'text', 'Ex: CharSet=UTF-8;Int=No')}
        <p className="text-xs text-gray-500">Parâmetros extras da string de conexão (chave=valor;chave2=valor2).</p>


      {/* Botão de Teste */}
      <div className="pt-4 flex justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={handleTest}
          isLoading={isTesting}
          disabled={isTesting}
          className="w-full sm:w-auto"
        >
          {isTesting ? 'Testando...' : 'Testar Conexão'}
        </Button>
        
        {/* Botões de salvar/cancelar */}
        {renderFormButtons()}
      </div>
    </form>
  );
};

export default ConnectionForm;

 