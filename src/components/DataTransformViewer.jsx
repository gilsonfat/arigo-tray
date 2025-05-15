import React, { useState } from 'react';

function DataTransformViewer({ originalData, transformedData, onClose }) {
  const [activeTab, setActiveTab] = useState('transformed');

  if (!originalData || !transformedData) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-11/12 md:w-4/5 lg:w-3/4 max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Visualizador de Transformação de Dados</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4">
          <div className="flex border-b">
            <button
              className={`py-2 px-4 font-medium ${activeTab === 'original' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('original')}
            >
              Dados Originais
            </button>
            <button
              className={`py-2 px-4 font-medium ${activeTab === 'transformed' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('transformed')}
            >
              Dados Transformados
            </button>
            <button
              className={`py-2 px-4 font-medium ${activeTab === 'diff' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('diff')}
            >
              Comparação
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          {activeTab === 'original' && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Dados Originais - SQL</h3>
              {Array.isArray(originalData) ? (
                <div>
                  <div className="mb-2 text-sm text-gray-500">{originalData.length} registros encontrados</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          {originalData.length > 0 && Object.keys(originalData[0]).map(key => (
                            <th key={key} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {originalData.slice(0, 50).map((item, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            {Object.values(item).map((value, i) => (
                              <td key={i} className="px-3 py-2 text-xs text-gray-900">
                                {value === null ? <span className="text-gray-400">NULL</span> : String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {originalData.length > 50 && (
                      <div className="mt-2 text-sm text-gray-500 text-center">
                        Mostrando 50 de {originalData.length} registros
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {JSON.stringify(originalData, null, 2)}
                </pre>
              )}
            </div>
          )}

          {activeTab === 'transformed' && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Dados Transformados - API</h3>
              {Array.isArray(transformedData) ? (
                <div>
                  <div className="mb-2 text-sm text-gray-500">{transformedData.length} registros para envio</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          {transformedData.length > 0 && Object.keys(transformedData[0]).map(key => (
                            <th key={key} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {transformedData.slice(0, 50).map((item, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            {Object.values(item).map((value, i) => (
                              <td key={i} className="px-3 py-2 text-xs text-gray-900">
                                {value === null ? <span className="text-gray-400">NULL</span> : String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {transformedData.length > 50 && (
                      <div className="mt-2 text-sm text-gray-500 text-center">
                        Mostrando 50 de {transformedData.length} registros
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {JSON.stringify(transformedData, null, 2)}
                </pre>
              )}
            </div>
          )}

          {activeTab === 'diff' && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Comparação de Estrutura</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-medium text-gray-500 mb-1">Estrutura Original</h4>
                  {Array.isArray(originalData) && originalData.length > 0 ? (
                    <div className="bg-white p-2 rounded border text-xs">
                      {Object.keys(originalData[0]).map(key => (
                        <div key={key} className="mb-1">{key}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">Sem dados para mostrar</div>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-medium text-gray-500 mb-1">Estrutura Transformada</h4>
                  {Array.isArray(transformedData) && transformedData.length > 0 ? (
                    <div className="bg-white p-2 rounded border text-xs">
                      {Object.keys(transformedData[0]).map(key => (
                        <div key={key} className="mb-1">{key}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">Sem dados para mostrar</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

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

export default DataTransformViewer; 