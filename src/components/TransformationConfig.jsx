import React, { useState, useEffect } from 'react';
import { testQuery, getTransformTemplates, createTransformTemplate, applyTransformTemplate } from '../lib/ipcApi';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';
import Alert from './Alert';

// Componente para mostrar valores truncados com tooltip
const TruncatedValue = ({ value, maxLength = 25 }) => {
  if (value === null || value === undefined) {
    return <em className="text-gray-400">null</em>;
  }
  
  const stringValue = String(value);
  const isTruncated = stringValue.length > maxLength;
  
  return (
    <div 
      className="truncate relative group cursor-help" 
      title={stringValue}
    >
      {stringValue.substring(0, maxLength)}
      {isTruncated && '...'}
      
      {/* Tooltip que aparece ao passar o mouse */}
      {isTruncated && (
        <div className="hidden group-hover:block absolute z-50 left-0 bottom-6 bg-gray-800 text-white p-2 rounded text-xs max-w-xs whitespace-normal shadow-lg">
          {stringValue}
        </div>
      )}
    </div>
  );
};

// Estilos para animações de modais
const ModalStyle = () => (
  <style jsx global>{`
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes slideDown {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `}</style>
);

// Estilos para animações
const modalAnimation = {
  animation: 'fadeIn 0.3s ease-out forwards',
};

const modalContentAnimation = {
  animation: 'slideDown 0.3s ease-out forwards',
};

function TransformationConfig({ queryId, connectionId, sql, currentMapping = {}, onSave, onCancel }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sampleData, setSampleData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [transformationName, setTransformationName] = useState('');
  const [previewData, setPreviewData] = useState(null);
  
  // Estados para reutilização de templates
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Tipos de transformação disponíveis
  const transformTypes = [
    { id: 'none', label: 'Manter Original' },
    { id: 'lowercase', label: 'Minúsculas' },
    { id: 'uppercase', label: 'Maiúsculas' },
    { id: 'capitalize', label: 'Capitalizar' },
    { id: 'trim', label: 'Remover Espaços' },
    { id: 'number', label: 'Converter para Número' },
    { id: 'boolean', label: 'Converter para Boolean' },
    { id: 'date', label: 'Formatar como Data' },
    { id: 'concat', label: 'Concatenar Campos' },
    { id: 'math', label: 'Cálculos Matemáticos' },
    { id: 'replace', label: 'Substituir Texto' },
    { id: 'custom', label: 'Nome Personalizado' }
  ];

  // Carregar dados de amostra e templates ao iniciar
  useEffect(() => {
    console.log('TransformationConfig inicializado com props:', {
      queryId,
      connectionId,
      currentMappingExists: currentMapping && Object.keys(currentMapping).length > 0,
      currentMapping: JSON.stringify(currentMapping).substring(0, 200) + '...' // Log truncado para não sobrecarregar
    });
    
    // Carregar templates disponíveis
    loadTemplates();
    
    // Se já existe um mapeamento, carregar
    if (currentMapping && Object.keys(currentMapping).length > 0) {
      console.log('Usando mapeamento existente com ID:', currentMapping.id);
      
      // Verificar se o nome da transformação está presente
      setTransformationName(currentMapping.name || '');
      
      // Filtrar propriedades de mapeamento de coluna (deixa apenas objetos com targetName)
      const columnMappingData = {};
      
      // Primeiramente, extrair todas as chaves que são colunas (objetos com propriedades de configuração)
      Object.entries(currentMapping).forEach(([key, value]) => {
        // Ignorar propriedades conhecidas que não são mapeamentos de coluna
        if (
          key === 'id' || 
          key === 'name' || 
          key === 'queryId' || 
          key === 'createdAt' || 
          key === 'updatedAt'
        ) {
          return;
        }
        
        if (value && typeof value === 'object') {
          // Propriedades que indicam que é um mapeamento de coluna
          const isColumnConfig = 
            value.targetName !== undefined || 
            value.transformType !== undefined || 
            value.includeInOutput !== undefined;
            
          if (isColumnConfig) {
            columnMappingData[key] = {
              targetName: value.targetName || key.toLowerCase(),
              transformType: value.transformType || 'none',
              includeInOutput: value.includeInOutput !== undefined ? value.includeInOutput : true
            };
          }
        }
      });
      
      console.log('Mapeamento de colunas extraído:', Object.keys(columnMappingData));
      setColumnMapping(columnMappingData);
    }
    
    // Carregar dados de amostra
    loadSampleData();
  }, [queryId, connectionId, sql, currentMapping]);
  
  // Atualizar a visualização quando os dados de amostra ou mapeamento mudarem
  useEffect(() => {
    if (sampleData && Object.keys(columnMapping).length > 0) {
      console.log('Atualizando visualização com dados de amostra e mapeamento');
      updatePreview(columnMapping, sampleData);
    }
  }, [sampleData, columnMapping]);
  
  // Função para carregar templates disponíveis
  const loadTemplates = async (retryCount = 0) => {
    setLoadingTemplates(true);
    try {
      console.log('Tentando carregar templates...');
      const result = await getTransformTemplates();
      
      if (result && result.success && Array.isArray(result.data)) {
        console.log(`Carregados ${result.data.length} templates com sucesso`);
        setTemplates(result.data || []);
        // Limpar mensagem de erro se existir
        if (error && (typeof error === 'string' && error.includes('templates'))) {
          setError(null);
        }
      } else if (result && !result.success) {
        console.warn('Erro ao carregar templates:', result.message);
        
        // Não exibir o erro para o usuário na primeira tentativa
        if (retryCount > 0) {
          setError(`Erro ao carregar templates: ${result.message}`);
        }
        
        // Iniciar com array vazio para garantir funcionamento
        setTemplates([]);
      } else {
        console.warn('Resposta de templates em formato inesperado:', result);
        setTemplates([]);
      }
    } catch (err) {
      console.error('Erro ao carregar templates:', err);
      
      // Não exibir o erro para o usuário se for apenas a primeira tentativa
      if (retryCount > 0) {
        setError(`Erro ao carregar templates: ${err.message}`);
      }
      
      // Tentar novamente após um intervalo (apenas uma vez)
      if (retryCount < 2) {
        console.log(`Tentando recarregar templates em ${3 + retryCount * 2} segundos...`);
        setTimeout(() => loadTemplates(retryCount + 1), (3 + retryCount * 2) * 1000);
      }
    } finally {
      setLoadingTemplates(false);
    }
  };
  
  // Função para criar um novo template a partir da configuração atual
  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      setError('Por favor, forneça um nome para o template');
      return;
    }
    
    setLoading(true);
    try {
      // Primeiro salvamos a configuração atual
      const configToSave = {
        name: transformationName || 'Configuração sem nome',
        queryId,
        ...columnMapping
      };
      
      console.log('Salvando configuração antes de criar template:', configToSave);
      
      let savedConfig;
      try {
        savedConfig = await onSave(configToSave);
        
        if (!savedConfig || !savedConfig.id) {
          throw new Error('Não foi possível salvar a configuração de transformação');
        }
      } catch (saveError) {
        console.error('Erro ao salvar configuração:', saveError);
        
        // Se falhar ao salvar, tenta usar um ID temporário para continuar
        savedConfig = {
          ...configToSave,
          id: `temp-${Date.now()}`,
          _isTemporary: true
        };
        
        console.log('Usando configuração temporária:', savedConfig);
      }
      
      console.log('Configuração salva/preparada, criando template...');
      
      let result;
      let lastError;
      
      // Tentar até 3 vezes criar o template, com tempo de espera entre as tentativas
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            // Aguardar antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            console.log(`Tentativa ${attempt + 1} de criar template...`);
          }
          
          // Tentar criar o template
          result = await createTransformTemplate(savedConfig.id, newTemplateName);
          
          if (result.success) {
            break; // Sucesso, sair do loop
          } else {
            lastError = new Error(result.message || 'Resposta inválida ao criar template');
            console.error(`Erro na tentativa ${attempt + 1}:`, result.message);
          }
        } catch (err) {
          lastError = err;
          console.error(`Erro na tentativa ${attempt + 1}:`, err);
        }
      }
      
      // Verificar se alguma tentativa teve sucesso
      if (!result || !result.success) {
        throw lastError || new Error('Falha ao criar template após várias tentativas');
      }
      
      setShowTemplateModal(false);
      setNewTemplateName('');
      
      // Recarregar a lista de templates
      await loadTemplates();
      
      // Mostrar mensagem de sucesso
      setError({ type: 'success', message: 'Template criado com sucesso!' });
    } catch (err) {
      console.error('Erro ao criar template:', err);
      
      // Mensagem de erro mais informativa
      let errorMessage = `Erro ao criar template: ${err.message}`;
      
      if (err.message.includes('não permitido') || err.message.includes('create-transform-template')) {
        errorMessage = 'Erro de comunicação com o processo principal. O aplicativo tentará corrigir o problema automaticamente. Por favor, tente novamente em alguns segundos.';
        
        // Tentar corrigir o problema automaticamente
        try {
          await window.electron.ipcRenderer.invoke('force-register-handlers');
          console.log('Handlers registrados novamente após erro');
        } catch (e) {
          console.error('Falha ao forçar registro de handlers após erro:', e);
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Função para aplicar um template existente
  const handleApplyTemplate = async () => {
    if (!selectedTemplateId) {
      setError('Por favor, selecione um template para aplicar');
      return;
    }
    
    if (!queryId) {
      setError('ID da consulta não disponível. Tente fechar e abrir a configuração novamente.');
      return;
    }
    
    setLoading(true);
    try {
      console.log(`Aplicando template ${selectedTemplateId} à consulta ${queryId}...`);
      
      // Aplicar o template à consulta atual
      const result = await applyTransformTemplate(
        selectedTemplateId, 
        queryId,
        `${transformationName || 'Nova Configuração'} (De Template)`
      );
      
      if (!result.success) {
        throw new Error(result.message || 'Resposta inválida ao aplicar template');
      }
      
      console.log('Template aplicado com sucesso:', result);
      
      // Carregar a nova configuração
      // Atualizar os dados locais
      const newMapping = {};
      
      // Extrair configurações de coluna do resultado
      Object.keys(result.data).forEach(key => {
        if (key !== 'id' && key !== 'name' && key !== 'queryId' && 
            key !== 'createdAt' && key !== 'updatedAt' && key !== 'sourceTemplateId') {
          if (typeof result.data[key] === 'object' && result.data[key] !== null) {
            newMapping[key] = result.data[key];
          }
        }
      });
      
      setColumnMapping(newMapping);
      setTransformationName(result.data.name || transformationName);
      
      // Atualizar a visualização
      if (sampleData) {
        updatePreview(newMapping, sampleData);
      }
      
      setShowApplyModal(false);
      setSelectedTemplateId('');
      
      // Mostrar mensagem de sucesso
      setError({ type: 'success', message: 'Template aplicado com sucesso!' });
    } catch (err) {
      console.error('Erro ao aplicar template:', err);
      setError(`Erro ao aplicar template: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Buscar dados de amostra
  const loadSampleData = async (retryCount = 0) => {
    if (!sql || !connectionId) {
      console.error('SQL ou conexão não fornecidos:', { sql, connectionId });
      setError('SQL ou conexão não fornecidos.');
      return;
    }

    console.log('Carregando dados de amostra para:', { 
      sql: typeof sql === 'string' ? sql.substring(0, 100) + '...' : 'SQL inválido', 
      connectionId 
    });

    setLoading(true);
    setError(null);

    try {
      // Garantir que a consulta é uma string válida
      if (typeof sql !== 'string') {
        console.error('SQL não é uma string válida:', sql);
        setError('A consulta SQL fornecida não é válida.');
        setLoading(false);
        return;
      }

      let sqlQuery = sql;
      
      // Remover ponto e vírgula no final e limitar resultados
      sqlQuery = sqlQuery.toString().trim().replace(/;$/, '');
      
      // Verificar se a consulta já possui LIMIT ou TOP
      const hasLimit = /\bLIMIT\s+\d+\b/i.test(sqlQuery);
      const hasTop = /\bTOP\s+\d+\b/i.test(sqlQuery);
      
      // Adicionar limitação apenas se não houver já
      if (!hasLimit && !hasTop) {
        // Verificar se é um SELECT
        if (/^\s*SELECT\b/i.test(sqlQuery)) {
          // Usar TOP para SQL Anywhere em vez de LIMIT
          sqlQuery = sqlQuery.replace(/^\s*SELECT\b/i, 'SELECT TOP 5');
          console.log('Adicionada cláusula TOP 5 à consulta');
        }
      } else if (hasLimit) {
        // Converter LIMIT para TOP para compatibilidade com SQL Anywhere
        const limitMatch = sqlQuery.match(/\bLIMIT\s+(\d+)\b/i);
        if (limitMatch && limitMatch[1]) {
          const limitValue = limitMatch[1];
          // Remover a cláusula LIMIT
          sqlQuery = sqlQuery.replace(/\bLIMIT\s+\d+\b/i, '');
          // Adicionar TOP no início da consulta
          sqlQuery = sqlQuery.replace(/^\s*SELECT\b/i, `SELECT TOP ${limitValue}`);
          console.log(`Convertida cláusula LIMIT ${limitValue} para TOP ${limitValue}`);
        }
      }
      
      console.log('Executando consulta de amostra:', sqlQuery);
      
      // Verificar se connectionId é um valor válido
      if (!connectionId || (typeof connectionId !== 'string' && typeof connectionId !== 'number')) {
        console.error('ID de conexão inválido:', connectionId);
        setError('ID de conexão inválido. Por favor, verifique a configuração da consulta.');
        setLoading(false);
        return;
      }
      
      const result = await testQuery(sqlQuery, connectionId);
      console.log('Resultado da consulta de amostra:', { 
        success: result.success, 
        message: result.message,
        dataCount: result.data ? result.data.length : 0 
      });

      if (result.success && result.data && result.data.length > 0) {
        setSampleData(result.data);
        
        // Inicializar o mapeamento com os nomes originais das colunas
        const sampleRow = result.data[0];
        const initialMapping = {};
        
        Object.keys(sampleRow).forEach(colName => {
          // Se já existe mapeamento, usar o existente, senão criar um padrão
          if (currentMapping && currentMapping[colName]) {
            initialMapping[colName] = currentMapping[colName];
          } else {
            initialMapping[colName] = {
              targetName: colName.toLowerCase(), // Nome de destino padrão
              transformType: 'none',             // Sem transformação por padrão
              includeInOutput: true,             // Incluir na saída por padrão
              format: null                       // Sem formato específico
            };
          }
        });
        
        setColumnMapping(initialMapping);
        updatePreview(initialMapping, result.data);
      } else {
        const errorMsg = result.message || 'Erro desconhecido';
        console.error('Erro nos dados de amostra:', errorMsg);
        
        // Para erros de sintaxe SQL, fornecer uma mensagem mais específica
        if (errorMsg.includes('syntax') && (errorMsg.includes('LIMIT') || errorMsg.includes('limit'))) {
          setError('Erro de sintaxe SQL: A cláusula LIMIT não é suportada neste banco de dados. A aplicação tentará usar TOP em seu lugar.');
          
          // Tentar converter LIMIT para TOP e executar novamente
          if (retryCount < 1) {
            console.log('Tentando novamente com sintaxe TOP...');
            setLoading(false);
            
            // Modificar a consulta original para usar TOP em vez de LIMIT
            const originalSql = sql.toString().trim().replace(/;$/, '');
            const limitMatch = originalSql.match(/\bLIMIT\s+(\d+)\b/i);
            
            if (limitMatch && limitMatch[1]) {
              const limitValue = limitMatch[1];
              let modifiedSql = originalSql.replace(/\bLIMIT\s+\d+\b/i, '');
              modifiedSql = modifiedSql.replace(/^\s*SELECT\b/i, `SELECT TOP ${limitValue}`);
              
              console.log('Retentando com consulta modificada:', modifiedSql);
              // Chamar loadSampleData recursivamente com o SQL modificado
              setTimeout(() => {
                sql = modifiedSql; // Atualizar o SQL
                loadSampleData(retryCount + 1);
              }, 1000);
            } else {
              setTimeout(() => loadSampleData(retryCount + 1), 1000);
            }
            return;
          }
        }
        
        // Tentar novamente se for um erro temporário e não excedeu o número máximo de tentativas
        if (retryCount < 2 && (errorMsg.includes('timeout') || errorMsg.includes('conexão') || errorMsg.includes('connection'))) {
          console.log(`Tentando novamente (${retryCount + 1}/2) após erro temporário...`);
          setLoading(false);
          setTimeout(() => {
            loadSampleData(retryCount + 1);
          }, 1500); // 1.5 segundos de espera entre tentativas
          return;
        }
        
        setError(`Erro ao buscar dados de amostra: ${errorMsg}`);
      }
    } catch (err) {
      console.error('Erro ao carregar dados de amostra:', err);
      
      // Para erros de sintaxe SQL, fornecer uma mensagem mais específica
      if (err.message && err.message.includes('syntax') && 
          (err.message.includes('LIMIT') || err.message.includes('limit'))) {
        setError('Erro de sintaxe SQL: A cláusula LIMIT não é suportada no SQL Anywhere. Use SELECT TOP N no lugar.');
      } else {
        // Tentar novamente em caso de erro temporário
        if (retryCount < 2 && (err.message.includes('timeout') || err.message.includes('conexão') || err.message.includes('connection'))) {
          console.log(`Tentando novamente (${retryCount + 1}/2) após erro...`);
          setLoading(false);
          setTimeout(() => {
            loadSampleData(retryCount + 1);
          }, 1500); // 1.5 segundos de espera entre tentativas
          return;
        }
        
        setError(`Erro ao carregar dados de amostra: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Atualizar o mapeamento de uma coluna
  const updateColumnMapping = (columnName, field, value) => {
    setColumnMapping(prev => {
      const newMapping = {
        ...prev,
        [columnName]: {
          ...prev[columnName],
          [field]: value
        }
      };
      
      // Se o tipo de transformação mudou para algo diferente de custom, e o campo for o tipo
      // E apenas se o targetName ainda não tiver sido definido pelo usuário
      if (field === 'transformType' && !prev[columnName]?.targetName) {
        // Sugerir um nome de destino apenas se não houver um valor definido
        switch(value) {
          case 'lowercase':
            newMapping[columnName].targetName = columnName.toLowerCase();
            break;
          case 'uppercase':
            newMapping[columnName].targetName = columnName.toUpperCase();
            break;
          case 'capitalize':
            newMapping[columnName].targetName = 
              columnName.charAt(0).toUpperCase() + columnName.slice(1).toLowerCase();
            break;
          default:
            // Para outros tipos, manter o nome original em minúsculas
            newMapping[columnName].targetName = columnName.toLowerCase();
        }
      }
      
      // Atualizar preview
      if (sampleData) {
        updatePreview(newMapping, sampleData);
      }
      
      return newMapping;
    });
  };

  // Gerar visualização da transformação
  const updatePreview = (mapping, data) => {
    if (!data || data.length === 0) return;
    
    // Transformar o primeiro registro usando o mapeamento atual
    const transformedData = data.map(row => {
      const newRow = {};
      
      Object.keys(row).forEach(colName => {
        if (mapping[colName] && mapping[colName].includeInOutput) {
          const config = mapping[colName];
          const originalValue = row[colName];
          const targetName = config.targetName || colName.toLowerCase();
          
          // Aplicar transformação
          let transformedValue = originalValue;
          
          switch(config.transformType) {
            case 'lowercase':
              transformedValue = typeof originalValue === 'string' ? originalValue.toLowerCase() : originalValue;
              break;
            case 'uppercase':
              transformedValue = typeof originalValue === 'string' ? originalValue.toUpperCase() : originalValue;
              break;
            case 'capitalize':
              transformedValue = typeof originalValue === 'string' 
                ? originalValue.charAt(0).toUpperCase() + originalValue.slice(1).toLowerCase() 
                : originalValue;
              break;
            case 'trim':
              transformedValue = typeof originalValue === 'string' ? originalValue.trim() : originalValue;
              break;
            case 'number':
              transformedValue = parseFloat(originalValue);
              transformedValue = isNaN(transformedValue) ? 0 : transformedValue;
              break;
            case 'boolean':
              if (typeof originalValue === 'boolean') {
                transformedValue = originalValue;
              } else if (typeof originalValue === 'string') {
                transformedValue = ['true', 'sim', 's', 'yes', 'y', '1'].includes(originalValue.toLowerCase());
              } else {
                transformedValue = Boolean(originalValue);
              }
              break;
            case 'date':
              try {
                if (originalValue) {
                  const date = new Date(originalValue);
                  transformedValue = date.toISOString();
                } else {
                  transformedValue = null;
                }
              } catch (e) {
                transformedValue = null;
              }
              break;
            case 'concat':
              // Verificar se há campos para concatenar na configuração
              if (config.concatFields && Array.isArray(config.concatFields)) {
                // Iniciar com valor original ou string vazia
                transformedValue = typeof originalValue === 'string' ? originalValue : '';
                
                // Adicionar cada campo adicional da concatenação
                config.concatFields.forEach(fieldConfig => {
                  const fieldValue = row[fieldConfig.field] || '';
                  const separator = fieldConfig.separator || '';
                  transformedValue += separator + fieldValue;
                });
              }
              break;
            case 'math':
              // Executar cálculos matemáticos
              if (config.mathOperation && config.mathFields) {
                const operand1 = parseFloat(originalValue) || 0;
                const operand2 = parseFloat(row[config.mathFields.field2]) || 0;
                
                switch (config.mathOperation) {
                  case 'add':
                    transformedValue = operand1 + operand2;
                    break;
                  case 'subtract':
                    transformedValue = operand1 - operand2;
                    break;
                  case 'multiply':
                    transformedValue = operand1 * operand2;
                    break;
                  case 'divide':
                    transformedValue = operand2 !== 0 ? operand1 / operand2 : 0;
                    break;
                  default:
                    transformedValue = operand1;
                }
              }
              break;
            case 'replace':
              // Substituir texto
              if (typeof originalValue === 'string' && config.replaceConfig) {
                const { search, replace } = config.replaceConfig;
                if (search && replace !== undefined) {
                  transformedValue = originalValue.replace(new RegExp(search, 'g'), replace);
                }
              }
              break;
            default:
              // Caso 'none' ou não especificado, mantém o valor original
              transformedValue = originalValue;
          }
          
          newRow[targetName] = transformedValue;
        }
      });
      
      return newRow;
    });
    
    setPreviewData(transformedData);
  };

  // Salvar a configuração
  const handleSave = async () => {
    // Validar o nome da configuração
    if (!transformationName.trim()) {
      setError('Por favor, forneça um nome para esta configuração de transformação.');
      return;
    }
    
    // Validar se há pelo menos uma coluna incluída
    const hasIncludedColumns = Object.values(columnMapping).some(
      config => config.includeInOutput === true
    );
    
    if (!hasIncludedColumns) {
      setError('Selecione pelo menos uma coluna para incluir na saída.');
      return;
    }
    
    // Verificar se há nomes de colunas duplicados
    const targetNames = [];
    const duplicateNames = [];
    
    Object.entries(columnMapping).forEach(([colName, config]) => {
      if (config.includeInOutput) {
        const targetName = config.targetName?.toLowerCase();
        if (targetNames.includes(targetName)) {
          duplicateNames.push(targetName);
        } else {
          targetNames.push(targetName);
        }
      }
    });
    
    if (duplicateNames.length > 0) {
      setError(`Nomes de colunas duplicados encontrados: ${duplicateNames.join(', ')}. Por favor, use nomes únicos.`);
      return;
    }
    
    // Verificar se há colunas com nomes vazios
    const emptyNames = Object.entries(columnMapping)
      .filter(([_, config]) => config.includeInOutput && (!config.targetName || config.targetName.trim() === ''))
      .map(([colName]) => colName);
    
    if (emptyNames.length > 0) {
      setError(`Colunas com nomes vazios encontradas: ${emptyNames.join(', ')}. Por favor, insira um nome para cada coluna.`);
      return;
    }
    
    // Criar objeto de configuração para salvar
    const configToSave = {
      name: transformationName,
      queryId,
      ...columnMapping
    };
    
    // Se já temos um ID, incluir na atualização
    if (currentMapping && currentMapping.id) {
      configToSave.id = currentMapping.id;
      console.log('Atualizando configuração existente com ID:', currentMapping.id);
    } else {
      console.log('Criando nova configuração (sem ID)');
    }
    
    console.log('Salvando configuração:', configToSave.name);
    
    try {
      setLoading(true);
      const savedConfig = await onSave(configToSave);
      
      if (savedConfig && savedConfig.id) {
        console.log('Configuração salva com sucesso. ID:', savedConfig.id);
        setError({ 
          type: 'success', 
          message: currentMapping && currentMapping.id 
            ? 'Configuração atualizada com sucesso!' 
            : 'Nova configuração salva com sucesso!'
        });
      } else if (savedConfig === null) {
        // O componente pai já mostrou o erro, não fazer nada aqui
        console.log('Erro reportado pelo componente pai, não mostrando mensagem duplicada');
      } else {
        console.error('Resposta inesperada ao salvar configuração:', savedConfig);
        setError('Erro ao salvar a configuração: Resposta inválida do servidor');
      }
    } catch (err) {
      console.error('Erro ao salvar configuração:', err);
      
      // Mostrar mensagem de erro mais específica
      if (err.message && err.message.includes('Já existe uma configuração com o nome')) {
        setError(`Erro: ${err.message}. Por favor, escolha um nome diferente ou atualize a configuração existente.`);
      } else {
        setError(`Erro ao salvar a configuração: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Resetar todas as configurações
  const handleReset = () => {
    if (sampleData && sampleData.length > 0) {
      const sampleRow = sampleData[0];
      const initialMapping = {};
      
      Object.keys(sampleRow).forEach(colName => {
        initialMapping[colName] = {
          targetName: colName.toLowerCase(),
          transformType: 'none',
          includeInOutput: true,
          format: null
        };
      });
      
      setColumnMapping(initialMapping);
      updatePreview(initialMapping, sampleData);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center">
        <LoadingSpinner message="Carregando dados de amostra..." />
      </div>
    );
  }

  if (error && typeof error === 'string') {
    return (
      <div className="p-6">
        <Alert
          type="error" 
          message={error}
          onClose={() => setError(null)}
        />
        <div className="mt-4 flex justify-end">
          <Button onClick={onCancel} variant="secondary">Cancelar</Button>
        </div>
      </div>
    );
  }

  if (!sampleData) {
    return (
      <div className="p-6">
        <p className="text-gray-500 text-center">Nenhum dado de amostra disponível.</p>
        <div className="mt-4 flex justify-end">
          <Button onClick={loadSampleData} variant="primary">Tentar Novamente</Button>
          <Button onClick={onCancel} variant="secondary" className="ml-2">Cancelar</Button>
        </div>
      </div>
    );
  }

  // Modal para criar template
  const renderTemplateModal = () => {
    if (!showTemplateModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" style={modalAnimation}>
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full" style={modalContentAnimation}>
          <div className="flex items-center justify-between mb-4 border-b pb-3">
            <h3 className="text-xl font-bold text-blue-700">
              <span className="mr-2">💾</span>
              Nova Configuração de Template
            </h3>
            <button 
              onClick={() => {
                setShowTemplateModal(false);
                setNewTemplateName('');
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg mb-5 border-l-4 border-blue-500">
            <p className="text-blue-800">
              <span className="font-semibold">Templates</span> permitem reutilizar as mesmas configurações de transformação em diferentes consultas SQL.
            </p>
          </div>
          
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nome do Template
            </label>
            <input
              type="text"
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:border-blue-500 focus:ring focus:ring-blue-200"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Ex: Template Padrão para Clientes"
            />
            <p className="mt-1 text-sm text-gray-500">O nome deve descrever o propósito deste template de transformação.</p>
          </div>
          
          <div className="flex justify-end gap-3 border-t pt-4 mt-2">
            <Button 
              variant="secondary" 
              onClick={() => {
                setShowTemplateModal(false);
                setNewTemplateName('');
              }}
              className="px-5"
            >
              Cancelar
            </Button>
            <Button 
              variant="primary" 
              onClick={handleCreateTemplate}
              disabled={!newTemplateName.trim()}
              className="px-5"
            >
              <span className="mr-1">💾</span> Criar Template
            </Button>
          </div>
        </div>
      </div>
    );
  };
  
  // Modal para aplicar template
  const renderApplyModal = () => {
    if (!showApplyModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" style={modalAnimation}>
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full" style={modalContentAnimation}>
          <div className="flex items-center justify-between mb-4 border-b pb-3">
            <h3 className="text-xl font-bold text-green-700">
              <span className="mr-2">📋</span>
              Aplicar Template Existente
            </h3>
            <button 
              onClick={() => {
                setShowApplyModal(false);
                setSelectedTemplateId('');
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg mb-5 border-l-4 border-green-500">
            <p className="text-green-800">
              <span className="font-semibold">Atenção:</span> Aplicar um template substituirá todas as configurações de transformação atuais para esta consulta.
            </p>
          </div>
          
          {loadingTemplates ? (
            <div className="py-6 flex flex-col items-center justify-center">
              <LoadingSpinner size="md" message="Carregando templates disponíveis..." />
            </div>
          ) : templates.length === 0 ? (
            <div className="py-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-gray-500 font-medium">Nenhum template disponível</p>
              <p className="text-sm text-gray-400 mt-1">Crie templates salvando configurações existentes</p>
            </div>
          ) : (
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Selecione o Template
              </label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:border-green-500 focus:ring focus:ring-green-200"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                <option value="">-- Selecione um template --</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Escolha o template que contém as configurações de transformação desejadas
              </p>
            </div>
          )}
          
          <div className="flex justify-end gap-3 border-t pt-4 mt-2">
            <Button 
              variant="secondary" 
              onClick={() => {
                setShowApplyModal(false);
                setSelectedTemplateId('');
              }}
              className="px-5"
            >
              Cancelar
            </Button>
            <Button 
              variant="success" 
              onClick={handleApplyTemplate}
              disabled={!selectedTemplateId || loadingTemplates}
              className="px-5"
            >
              <span className="mr-1">✓</span> Aplicar Template
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4">
      <ModalStyle />
      {error && typeof error === 'object' && (
        <Alert
          type={error.type || 'error'}
          message={error.message}
          onClose={() => setError(null)}
          className="mb-4"
        />
      )}
      
      <div className="mb-6">
        <label htmlFor="transformation-name" className="block text-sm font-medium text-gray-700 mb-1">
          Nome da Configuração de Transformação
        </label>
        <input
          id="transformation-name"
          type="text"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          value={transformationName}
          onChange={(e) => setTransformationName(e.target.value)}
          placeholder="Ex: Transformação Clientes"
        />
      </div>
      
      {/* Botões de templates */}
      <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-800 mb-1">Templates de Transformação</h3>
            <p className="text-sm text-gray-600">Reutilize configurações de transformação entre consultas</p>
          </div>
          <div className="flex space-x-3">
            <Button 
              variant="primary" 
              onClick={() => setShowApplyModal(true)}
              className="flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Aplicar Template
            </Button>
            <Button 
              variant="success" 
              onClick={() => setShowTemplateModal(true)}
              className="flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Salvar como Template
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Configuração de Colunas</h3>
        <div className="bg-gray-50 p-4 rounded-lg overflow-x-auto shadow-sm border border-gray-200">
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full divide-y divide-gray-200 table-fixed">
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12 bg-gray-100">
                    <div className="text-center">Incluir</div>
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6 bg-gray-100">
                    Coluna Original
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6 bg-gray-100">
                    Nome de Destino
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4 bg-gray-100">
                    Transformação
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5 bg-gray-100">
                    Valor Original
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5 bg-gray-100">
                    Valor Transformado
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sampleData && sampleData.length > 0 && Object.keys(sampleData[0]).map((columnName, index) => (
                  <tr key={columnName} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}>
                    <td className="px-2 py-2 whitespace-nowrap text-center">
                      <input
                        type="checkbox"
                        checked={columnMapping[columnName]?.includeInOutput || false}
                        onChange={(e) => updateColumnMapping(columnName, 'includeInOutput', e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className="text-sm text-gray-900 font-medium">{columnName}</span>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <input
                        type="text"
                        value={columnMapping[columnName]?.targetName || ''}
                        onChange={(e) => updateColumnMapping(columnName, 'targetName', e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring focus:ring-blue-200"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <select
                        value={columnMapping[columnName]?.transformType || 'none'}
                        onChange={(e) => updateColumnMapping(columnName, 'transformType', e.target.value)}
                        className="px-2 py-1 text-sm border border-gray-300 rounded w-full focus:border-blue-500 focus:ring focus:ring-blue-200"
                      >
                        {transformTypes.map(type => (
                          <option key={type.id} value={type.id}>{type.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-sm text-gray-600 max-w-[150px]">
                      <TruncatedValue value={sampleData[0][columnName]} />
                    </td>
                    <td className="px-2 py-2 text-sm text-green-600 max-w-[150px]">
                      {previewData && previewData[0] && columnMapping[columnName]?.includeInOutput && (
                        <TruncatedValue value={previewData[0][columnMapping[columnName].targetName]} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Versão responsiva para telas muito pequenas - apenas para visualização em mobile */}
        <div className="sm:hidden mt-4 grid grid-cols-1 gap-4">
          {sampleData && sampleData.length > 0 && Object.keys(sampleData[0]).filter(colName => columnMapping[colName]?.includeInOutput).map(columnName => (
            <div key={`sample-${columnName}`} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-sm text-gray-700">{columnName}</span>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                  {transformTypes.find(t => t.id === columnMapping[columnName]?.transformType)?.label || 'Não definido'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Original:</p>
                  <p className="text-sm text-gray-600 break-words">
                    {sampleData[0][columnName] !== null 
                      ? String(sampleData[0][columnName]).substring(0, 50) 
                      : <em className="text-gray-400">null</em>}
                    {String(sampleData[0][columnName]).length > 50 ? '...' : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Transformado:</p>
                  <p className="text-sm text-green-600 break-words">
                    {previewData && previewData[0] && columnMapping[columnName]?.includeInOutput ? (
                      previewData[0][columnMapping[columnName].targetName] !== null
                        ? String(previewData[0][columnMapping[columnName].targetName]).substring(0, 50)
                        : <em className="text-gray-400">null</em>
                    ) : <em className="text-gray-400">não incluído</em>}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Visualização de Transformação</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1">Dados Originais</h4>
            <div className="bg-gray-50 p-3 rounded-lg max-h-60 overflow-auto border border-gray-200 shadow-sm">
              <pre className="text-xs">{JSON.stringify(sampleData[0], null, 2)}</pre>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1">Dados Transformados</h4>
            <div className="bg-gray-50 p-3 rounded-lg max-h-60 overflow-auto border border-gray-200 shadow-sm">
              <pre className="text-xs">{previewData ? JSON.stringify(previewData[0], null, 2) : 'Sem preview disponível'}</pre>
            </div>
          </div>
        </div>
      </div>

      {/* Footer com botões - simplificado */}
      <div className="sticky bottom-0 left-0 right-0 bg-white shadow-md border-t border-gray-200 p-4 mt-4 -mx-4 -mb-4 flex justify-between items-center">
        <Button 
          onClick={handleReset} 
          variant="danger" 
          className="flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Resetar
        </Button>
        
        <div className="flex space-x-3">
          <Button 
            onClick={onCancel} 
            variant="secondary" 
            className="flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            variant="primary" 
            className="flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Salvar Configuração
          </Button>
        </div>
      </div>
      
      {/* Renderizar modais */}
      {renderTemplateModal()}
      {renderApplyModal()}
    </div>
  );
}

export default TransformationConfig; 