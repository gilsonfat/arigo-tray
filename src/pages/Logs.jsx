import React, { useState, useEffect } from 'react';
import { getLogs, getLogCount } from '../lib/ipcApi';
import LoadingSpinner from '../components/LoadingSpinner';
import Alert from '../components/Alert';
import Button from '../components/Button';
import LogModal from '../components/LogModal';

// Cores para diferentes tipos de logs
const logTypeColors = {
  info: 'bg-blue-100 text-blue-800',
  error: 'bg-red-100 text-red-800',
  warning: 'bg-yellow-100 text-yellow-800',
  debug: 'bg-purple-100 text-purple-800',
  default: 'bg-gray-100 text-gray-800'
};

function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statistics, setStatistics] = useState({ total: 0, today: 0, byType: {} });
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [selectedLog, setSelectedLog] = useState(null);
  
  const LOGS_PER_PAGE = 50;

  // Carregar logs
  useEffect(() => {
    loadLogs();
    loadStatistics();
  }, [filter, page]);

  // Função para carregar logs
  const loadLogs = async () => {
    try {
      setLoading(true);
      const options = {
        tipo: filter || undefined,
        limit: LOGS_PER_PAGE,
        offset: page * LOGS_PER_PAGE
      };
      
      const logsData = await getLogs(options);
      
      if (page === 0) {
        setLogs(logsData);
      } else {
        setLogs(prevLogs => [...prevLogs, ...logsData]);
      }
      
      // Verificar se há mais logs para carregar
      setHasMore(logsData.length === LOGS_PER_PAGE);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar logs:', err);
      setError('Falha ao carregar logs. ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Função para carregar estatísticas
  const loadStatistics = async () => {
    try {
      const stats = await getLogCount();
      setStatistics(stats);
    } catch (err) {
      console.error('Erro ao carregar estatísticas:', err);
    }
  };

  // Manipular alteração de filtro
  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setPage(0); // Resetar para a primeira página quando o filtro mudar
    setLogs([]); // Limpar logs atuais
  };

  // Função para carregar mais logs
  const loadMore = () => {
    setPage(prevPage => prevPage + 1);
  };

  // Função para formatar data
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Função para alternar detalhes expandidos
  const toggleExpand = (id) => {
    setExpanded(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Função para abrir log no modal
  const openLogModal = (log) => {
    setSelectedLog(log);
  };

  // Função para fechar o modal
  const closeLogModal = () => {
    setSelectedLog(null);
  };

  // Função para limpar filtros
  const clearFilter = () => {
    setFilter('');
    setPage(0);
  };

  // Recarregar logs
  const handleRefresh = () => {
    setPage(0);
    setLogs([]);
    loadLogs();
    loadStatistics();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Logs do Sistema</h1>
          <Button onClick={handleRefresh} variant="primary">
            Atualizar
          </Button>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Cards de estatísticas */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Total de Logs</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{statistics.total}</dd>
            </div>
          </div>
          
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Logs Hoje</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{statistics.today}</dd>
            </div>
          </div>
          
          {Object.entries(statistics.byType).map(([type, count]) => (
            <div key={type} className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Logs de tipo "{type}"
                </dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{count}</dd>
              </div>
            </div>
          ))}
        </div>
        
        {/* Filtros */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Filtros</h2>
          </div>
          <div className="p-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="filter-type" className="block text-sm font-medium text-gray-700">
                Tipo de Log
              </label>
              <select
                id="filter-type"
                value={filter}
                onChange={(e) => handleFilterChange(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos os tipos</option>
                <option value="info">Info</option>
                <option value="error">Error</option>
                <option value="warning">Warning</option>
                <option value="debug">Debug</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex items-end">
              <Button onClick={clearFilter} variant="secondary" className="h-10">
                Limpar Filtros
              </Button>
            </div>
          </div>
        </div>
        
        {error && (
          <Alert type="error" message={error} onClose={() => setError(null)} />
        )}
        
        {/* Lista de logs */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
            <h2 className="text-lg font-medium text-gray-900">
              Logs {filter ? `(Filtro: ${filter})` : ''}
            </h2>
          </div>
          
          {loading && logs.length === 0 ? (
            <div className="p-8 text-center">
              <LoadingSpinner message="Carregando logs..." />
            </div>
          ) : logs.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {logs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start">
                    <div className={`px-2 py-1 text-xs font-medium rounded-md ${logTypeColors[log.tipo] || logTypeColors.default}`}>
                      {log.tipo}
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="text-sm text-gray-500">
                        {formatDate(log.data_registro)}
                      </div>
                      <div 
                        className={`mt-1 text-sm text-gray-900 ${expanded[log.id] ? '' : 'line-clamp-2'}`}
                        onClick={() => toggleExpand(log.id)}
                      >
                        {log.mensagem}
                      </div>
                      <div className="mt-2 flex gap-2">
                        {log.mensagem.length > 100 && (
                          <button 
                            onClick={() => toggleExpand(log.id)} 
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            {expanded[log.id] ? 'Mostrar menos' : 'Mostrar mais'}
                          </button>
                        )}
                        <button 
                          onClick={() => openLogModal(log)} 
                          className="text-xs text-green-600 hover:text-green-800"
                        >
                          Abrir detalhes
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              Nenhum log encontrado.
            </div>
          )}
          
          {/* Botão para carregar mais */}
          {hasMore && (
            <div className="px-4 py-4 border-t border-gray-200 sm:px-6">
              <Button 
                onClick={loadMore} 
                disabled={loading}
                variant="secondary" 
                className="w-full"
              >
                {loading ? 'Carregando...' : 'Carregar mais logs'}
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Modal de detalhes do log */}
      {selectedLog && (
        <LogModal log={selectedLog} onClose={closeLogModal} />
      )}
    </div>
  );
}

export default Logs; 