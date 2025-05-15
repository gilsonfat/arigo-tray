import React, { useState, useEffect, useCallback } from 'react';
import Button from './Button';
import Alert from './Alert';
import LoadingSpinner from './LoadingSpinner';
import { getQueries, getQuery } from '../lib/ipcApi'; // API para buscar consultas

// Componente para ajudar com a sintaxe Cron (opcional, mas útil)
const CronHelper = () => (
  <div className="text-xs text-gray-500 mt-1 bg-gray-50 p-2 rounded border">
    Formato Cron: Minuto Hora DiaMês Mês DiaSemana <br />
    (* = qualquer valor, */5 = a cada 5) <br />
    Ex: <code>0 9 * * 1-5</code> (9h de Seg a Sex) | <code>*/15 * * * *</code> (A cada 15 min) <br/>
    <a href="https://crontab.guru/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
      Testar expressão Cron
    </a>
  </div>
);

const TaskForm = ({ task, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    cron: '', // Ex: '0 * * * *' (a cada hora)
    consulta_id: '',
    api_url: '',
    api_metodo: 'POST', // Método padrão
    api_headers: '{}', // Headers em JSON
    ativo: true,
    ...(task || {}) // Preenche se editando
  });
  const [queries, setQueries] = useState([]);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const [formError, setFormError] = useState('');
  const [isHeadersValid, setIsHeadersValid] = useState(true);
  const [selectedQuery, setSelectedQuery] = useState(null); // Armazena detalhes da consulta selecionada

  // Busca consultas disponíveis
  const fetchQueries = useCallback(async () => {
    setQueriesLoading(true);
    try {
      const response = await getQueries();
      if (response.success) {
        setQueries(response.data || []);
        // Pré-seleciona se criando e tem consultas
        if (!task && response.data?.length > 0 && !formData.consulta_id) {
          setFormData(prev => ({ ...prev, consulta_id: response.data[0].id }));
        }
      } else {
        setFormError(`Erro ao carregar consultas: ${response.message}`);
        setQueries([]);
      }
    } catch (error) {
      setFormError(`Erro crítico ao carregar consultas: ${error.message}`);
    } finally {
      setQueriesLoading(false);
    }
  }, [task, formData.consulta_id]); // Adiciona formData.consulta_id

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  // Busca detalhes da consulta quando o ID muda
  useEffect(() => {
    const fetchQueryDetails = async () => {
      if (!formData.consulta_id) {
        setSelectedQuery(null);
        return;
      }
      
      // Sempre garantir que consulta_id seja tratado como número
      const queryId = parseInt(formData.consulta_id, 10);
      
      try {
        console.log(`Buscando detalhes da consulta ID: ${queryId}`);
        const response = await getQuery(queryId);
        
        if (response.success) {
          console.log(`Detalhes da consulta obtidos:`, response.data);
          setSelectedQuery(response.data);
          
          // Sugestão para URL da API com base no tipo de transformação
          if (response.data.transform_type === 'terceiros' && !formData.api_url) {
            setFormData(prev => ({
              ...prev,
              api_url: 'http://localhost:3000/terceiros',
              api_headers: '{\n  "Content-Type": "application/json; charset=utf-8"\n}'
            }));
          }
        } else {
          console.error(`Erro ao buscar consulta: ${response.message}`);
        }
      } catch (error) {
        console.error("Erro ao buscar detalhes da consulta:", error);
        // Não interromper a UI em caso de erro na consulta
      }
    };
    
    fetchQueryDetails();
  }, [formData.consulta_id]);

  // Valida JSON dos Headers
  useEffect(() => {
    try {
      JSON.parse(formData.api_headers || '{}');
      setIsHeadersValid(true);
      // Limpa erro de JSON se válido e se o erro atual for de JSON
      if (formError === 'O formato dos Headers (JSON) é inválido.') {
           setFormError('');
      }
    } catch (e) {
      setIsHeadersValid(false);
    }
  }, [formData.api_headers, formError]); // Adiciona formError como dependência


  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Limpa erro geral apenas se não for erro de validação de header
    if (formError && formError !== 'O formato dos Headers (JSON) é inválido.') {
         setFormError('');
    }
  };

  const handleSubmit = (e) => {
    console.log('Event submit capturado no TaskForm:', e.type);
    e.preventDefault();
    
    // Adiciona para debug
    console.log('Submetendo formulário de tarefa com ID:', e.target.id);
    console.log('Dados do formulário:', JSON.stringify(formData, null, 2));
    
    // Validação mais rigorosa
    const nome = formData.nome?.trim() || '';
    const cron = formData.cron?.trim() || '';
    const consulta_id = formData.consulta_id ? String(formData.consulta_id) : '';
    const api_url = formData.api_url?.trim() || '';
    
    console.log('Valores validados:', { nome, cron, consulta_id, api_url });
    
    // Validação
    if (!nome || !cron || !consulta_id || !api_url) {
      const missing = [];
      if (!nome) missing.push('Nome');
      if (!cron) missing.push('Cron');
      if (!consulta_id) missing.push('Consulta');
      if (!api_url) missing.push('URL da API');
      
      const errorMsg = `Preencha todos os campos obrigatórios: ${missing.join(', ')}`;
      console.error('Erro de validação:', errorMsg);
      setFormError(errorMsg);
      return;
    }
    
    if (!isHeadersValid) {
      setFormError('O formato dos Headers (JSON) é inválido.');
      return;
    }
    
    // Garante que o formulário tenha campos numéricos como números e que strings sejam válidas
    const preparedData = {
      ...formData,
      nome: nome,
      descricao: formData.descricao?.trim() || '',
      cron: cron,
      consulta_id: parseInt(consulta_id, 10), // Converte para número
      api_url: api_url,
      api_metodo: formData.api_metodo || 'POST',
      api_headers: formData.api_headers || '{}'
    };
    
    console.log('Dados formatados para envio:', preparedData);
    
    try {
      // Verifica se a string consulta_id pode ser convertida para número
      if (isNaN(parseInt(consulta_id, 10))) {
        throw new Error('ID da consulta é inválido. Selecione uma consulta válida.');
      }
      
      // Validação básica de CRON
      if (!/^[0-9*\/ -,]+$/.test(cron)) {
        throw new Error('Expressão CRON inválida. Use apenas números, asteriscos e caracteres especiais válidos.');
      }
      
      // Validação básica de URL
      try {
        new URL(api_url);
      } catch (urlError) {
        throw new Error('URL da API inválida. Insira uma URL completa e válida.');
      }
      
      console.log('Validação do formulário concluída com sucesso. Enviando dados.');
      onSave(preparedData);
    } catch (error) {
      console.error('Erro ao validar/salvar tarefa:', error);
      setFormError(`Erro ao salvar tarefa: ${error.message}`);
    }
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
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <form 
      id="modal-form" 
      onSubmit={handleSubmit} 
      className="space-y-4"
      data-testid="task-form"
    >
      {formError && <Alert type="error" message={formError} onClose={() => setFormError('')} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         {renderInputField('nome', 'Nome da Tarefa', true, 'text', 'Ex: Enviar Vendas Diárias')}
          <div>
              <label htmlFor="ativo" className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <label className="inline-flex items-center cursor-pointer mt-2">
                <input
                  type="checkbox"
                  id="ativo"
                  name="ativo"
                  checked={formData.ativo}
                  onChange={handleChange}
                  className="sr-only peer"
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ms-3 text-sm font-medium text-gray-900">
                  {formData.ativo ? 'Ativa' : 'Inativa'}
                </span>
              </label>
          </div>
      </div>


      {renderInputField('descricao', 'Descrição', false, 'text', 'Envia dados consolidados para API Xpto')}

      <div>
        <label htmlFor="cron" className="block text-sm font-medium text-gray-700 mb-1">
          Frequência (Expressão Cron)<span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="cron"
          name="cron"
          value={formData.cron}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm font-mono text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="0 9 * * 1-5"
        />
        <CronHelper />
      </div>


      <div>
        <label htmlFor="consulta_id" className="block text-sm font-medium text-gray-700 mb-1">
          Consulta SQL a ser executada<span className="text-red-500">*</span>
        </label>
        {queriesLoading ? (
          <LoadingSpinner size="sm" message="Carregando consultas..." />
        ) : (
          <>
            <select
              id="consulta_id"
              name="consulta_id"
              value={formData.consulta_id}
              onChange={handleChange}
              required
              disabled={queries.length === 0}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            >
              <option value="" disabled>{queries.length === 0 ? 'Nenhuma consulta SQL encontrada' : '-- Selecione a Consulta --'}</option>
              {queries.map(q => (
                <option key={q.id} value={q.id}>{q.nome}</option>
              ))}
            </select>
            
            {/* Mostrar informações sobre transformação de dados se disponível */}
            {selectedQuery?.transform_type && (
              <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                <p className="text-sm text-blue-700">
                  <span className="font-medium">Transformação de dados:</span> {selectedQuery.transform_type}
                  {selectedQuery.transform_type === 'terceiros' && (
                    <span className="block mt-1 text-xs">Esta consulta será transformada para o formato padrão de terceiros antes do envio.</span>
                  )}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <h3 className="text-lg font-medium text-gray-800 pt-4 border-t mt-6">Destino da API</h3>

      {renderInputField('api_url', 'URL da API', true, 'url', 'https://api.exemplo.com/dados')}

       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
              <label htmlFor="api_metodo" className="block text-sm font-medium text-gray-700 mb-1">
                Método HTTP
              </label>
              <select
                id="api_metodo"
                name="api_metodo"
                value={formData.api_metodo}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                {/* Adicionar outros métodos se necessário */}
              </select>
          </div>
       </div>

      <div>
        <label htmlFor="api_headers" className="block text-sm font-medium text-gray-700 mb-1">
          Headers da Requisição (JSON)
        </label>
        <textarea
          id="api_headers"
          name="api_headers"
          rows="3"
          value={formData.api_headers}
          onChange={handleChange}
          className={`w-full px-3 py-2 border rounded-md shadow-sm font-mono text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${!isHeadersValid ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}`}
          placeholder='{ "Content-Type": "application/json", "Authorization": "Bearer SEU_TOKEN" }'
        ></textarea>
         {!isHeadersValid && <p className="text-xs text-red-500 mt-1">Formato JSON inválido.</p>}
        <p className="text-xs text-gray-500 mt-1">Insira os cabeçalhos HTTP como um objeto JSON válido.</p>
      </div>

      {/* Botão de submit visível que estará disponível em caso de problemas */}
      <div className="text-right pt-4 border-t border-gray-200 mt-8">
        <button 
          type="submit" 
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          id="form-submit-fallback"
        >
          Salvar Tarefa (Botão de Fallback)
        </button>
      </div>
      
      {/* Botão invisível para debug */}
      <button 
        type="submit" 
        style={{ display: 'none' }}
        id="internal-submit-button"
      >
        Submit Interno
      </button>
    </form>
  );
};

export default TaskForm; 