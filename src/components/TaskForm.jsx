import React, { useState, useEffect, useCallback } from 'react';
import Button from './Button';
import Alert from './Alert';
import LoadingSpinner from './LoadingSpinner';
import { getQueries } from '../lib/ipcApi'; // API para buscar consultas

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
    e.preventDefault();
    // Validação
    if (!formData.nome || !formData.cron || !formData.consulta_id || !formData.api_url) {
      setFormError('Preencha Nome, Cron, Consulta e URL da API.');
      return;
    }
     if (!isHeadersValid) {
        setFormError('O formato dos Headers (JSON) é inválido.');
        return;
     }
     // TODO: Adicionar validação de Cron se necessário (biblioteca externa?)
    onSave(formData);
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
    <form id="modal-form" onSubmit={handleSubmit} className="space-y-4">
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

      {/* Botões de salvar/cancelar são controlados pelo Modal */}
    </form>
  );
};

export default TaskForm; 