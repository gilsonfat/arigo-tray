import React from 'react';
import { FaCheckCircle, FaTimesCircle, FaExclamationTriangle, FaQuestionCircle, FaInfoCircle } from 'react-icons/fa';

// Componente para exibir os resultados do diagnóstico de conexão
const ConnectionDiagnostics = ({ results, connection }) => {
  if (!results) {
    return (
      <div className="p-4 text-center">
        <FaQuestionCircle className="text-gray-400 text-4xl mx-auto mb-2" />
        <p className="text-gray-500">Nenhum resultado de diagnóstico disponível.</p>
      </div>
    );
  }

  // Verifica se é uma conexão SQL Anywhere
  const isSQLAnywhere = connection?.driver?.toLowerCase().includes('sql anywhere');

  // Mapeia os status para componentes visuais
  const statusIcon = (status) => {
    switch (status) {
      case 'ok':
        return <FaCheckCircle className="text-green-500 text-xl" />;
      case 'erro':
        return <FaTimesCircle className="text-red-500 text-xl" />;
      case 'aviso':
        return <FaExclamationTriangle className="text-yellow-500 text-xl" />;
      case 'verificar':
        // Para SQL Anywhere, usamos azul informativo em vez de amarelo de aviso
        return isSQLAnywhere ? 
          <FaInfoCircle className="text-blue-500 text-xl" /> : 
          <FaExclamationTriangle className="text-blue-500 text-xl" />;
      default:
        return <FaQuestionCircle className="text-gray-400 text-xl" />;
    }
  };

  // Mapeia os status para classes CSS de cores
  const statusColor = (status) => {
    switch (status) {
      case 'ok': return 'bg-green-50 border-green-200';
      case 'erro': return 'bg-red-50 border-red-200';
      case 'aviso': return 'bg-yellow-50 border-yellow-200';
      case 'verificar': return 'bg-blue-50 border-blue-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  // Componente para cada seção de diagnóstico
  const DiagnosticSection = ({ title, data }) => (
    <div className={`border p-4 rounded-md mb-3 ${statusColor(data.status)}`}>
      <div className="flex items-center gap-2 mb-2">
        {statusIcon(data.status)}
        <h3 className="font-medium text-gray-800">{title}</h3>
      </div>
      <p className="text-sm mb-1">{data.mensagem}</p>
      {data.sugestao && (
        <p className="text-sm italic text-gray-600">
          <strong>Sugestão:</strong> {data.sugestao}
        </p>
      )}
    </div>
  );

  // Mensagem personalizada para SQL Anywhere
  const getSQLAnywhereMessage = () => {
    if (results.resultado.status === 'ok') {
      return 'A conexão foi testada com sucesso!';
    }
    
    if (results.resultado.status === 'verificar') {
      return 'O SQL Anywhere pode estar funcionando corretamente, mesmo que o diagnóstico não consiga verificar completamente. Teste executando consultas.';
    }
    
    return 'Foram encontrados problemas com a conexão SQL Anywhere.';
  };

  // Renderiza o componente principal
  return (
    <div className="p-4">
      <div className="mb-4 text-center">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Diagnóstico da Conexão: {connection?.nome || 'Conexão'}
        </h2>
        <p className="text-sm text-gray-600">
          {isSQLAnywhere 
            ? getSQLAnywhereMessage()
            : (results.resultado.status === 'ok' 
                ? 'A conexão foi testada com sucesso!' 
                : 'Foram encontrados problemas com a conexão.')}
        </p>
      </div>

      {/* Resultado geral/final */}
      <div className={`border p-4 rounded-md mb-5 ${statusColor(results.resultado.status)}`}>
        <div className="flex items-center gap-2 mb-2">
          {statusIcon(results.resultado.status)}
          <h3 className="font-medium text-gray-800">Resultado Final</h3>
        </div>
        <p className="text-md mb-1 font-medium">{results.resultado.mensagem}</p>
        {results.resultado.sugestao && (
          <p className="text-sm italic">
            <strong>Sugestão:</strong> {results.resultado.sugestao}
          </p>
        )}
        
        {/* Mensagem adicional para SQL Anywhere */}
        {isSQLAnywhere && results.resultado.status === 'verificar' && (
          <p className="mt-2 text-sm bg-blue-100 p-2 rounded">
            <strong>Nota:</strong> Conexões SQL Anywhere podem funcionar normalmente mesmo quando o 
            diagnóstico não consegue se conectar. Isso pode ocorrer devido às especificidades do driver.
            Recomendamos testar a conexão executando consultas reais.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Seções individuais do diagnóstico */}
        <DiagnosticSection title="Driver ODBC" data={results.driver} />
        <DiagnosticSection title="Servidor" data={results.servidor} />
        <DiagnosticSection title="Credenciais" data={results.credenciais} />
        <DiagnosticSection title="Banco de Dados" data={results.banco} />
      </div>

      {/* Informações da conexão */}
      <div className="mt-6 border border-gray-200 rounded-md p-4 bg-gray-50">
        <h3 className="font-medium text-gray-800 mb-2">Detalhes da Conexão</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><strong>Nome:</strong> {connection?.nome || 'N/A'}</div>
          <div><strong>Driver:</strong> {connection?.driver || 'N/A'}</div>
          <div><strong>Host:</strong> {connection?.host || 'N/A'}</div>
          <div><strong>Porta:</strong> {connection?.porta || 'N/A'}</div>
          <div><strong>Banco:</strong> {connection?.banco || 'N/A'}</div>
          <div><strong>Usuário:</strong> {connection?.usuario || 'N/A'}</div>
        </div>
      </div>
    </div>
  );
};

export default ConnectionDiagnostics; 