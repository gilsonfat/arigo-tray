import React from 'react';

function LogModal({ log, onClose }) {
  // Formatar a data
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Cores para diferentes tipos de logs
  const logTypeColors = {
    info: 'bg-blue-100 text-blue-800',
    error: 'bg-red-100 text-red-800',
    warning: 'bg-yellow-100 text-yellow-800',
    debug: 'bg-purple-100 text-purple-800',
    default: 'bg-gray-100 text-gray-800'
  };

  if (!log) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-11/12 md:w-3/4 lg:w-2/3 max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Detalhes do Log</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <span className="text-sm font-medium text-gray-500">ID:</span>
            <span className="ml-2">{log.id}</span>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500">Data:</span>
            <span className="ml-2">{formatDate(log.data_registro)}</span>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500">Tipo:</span>
            <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-md ${logTypeColors[log.tipo] || logTypeColors.default}`}>
              {log.tipo}
            </span>
          </div>
          {log.origem && (
            <div>
              <span className="text-sm font-medium text-gray-500">Origem:</span>
              <span className="ml-2">{log.origem}</span>
            </div>
          )}
        </div>

        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Mensagem:</h3>
          <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-sm font-mono overflow-auto max-h-[40vh]">
            {log.mensagem}
          </div>
        </div>

        {log.dados && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Dados Anexados:</h3>
            <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-sm font-mono overflow-auto max-h-[40vh]">
              {typeof log.dados === 'string' 
                ? log.dados 
                : JSON.stringify(log.dados, null, 2)}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogModal; 