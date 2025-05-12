import React from 'react';

/**
 * Componente de tabela genérico para exibir dados
 */
const Table = ({ 
  columns = [], 
  data = [], 
  emptyMessage = 'Nenhum dado encontrado', 
  hoverable = false,
  className = ''
}) => {
  // Se não houver dados, exibe uma mensagem
  if (!data.length) {
    return (
      <div className="bg-gray-50 border rounded p-8 text-center text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200 border">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column, index) => (
              <th 
                key={column.key || index}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {column.label || column.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, rowIndex) => (
            <tr 
              key={row.id || rowIndex}
              className={hoverable ? 'hover:bg-gray-50' : ''}
            >
              {columns.map((column, colIndex) => (
                <td 
                  key={`${rowIndex}-${column.key || colIndex}`}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                >
                  {column.render 
                    ? column.render(row)
                    : row[column.key] !== undefined 
                      ? String(row[column.key])
                      : '-'
                  }
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Table; 