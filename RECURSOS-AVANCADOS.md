# Recursos Avançados do Mapeador de Dados

Este documento descreve os recursos avançados implementados no `mapeador-dados-avancado.js`, que estende o mapeador de dados básico com funcionalidades para processamento de grandes volumes de dados, performance, confiabilidade e depuração.

## Sumário

1. [Cache de Resultados](#cache-de-resultados)
2. [Logging Avançado](#logging-avançado)
3. [Tratamento Específico de Erros](#tratamento-específico-de-erros)
4. [Processamento Paralelo](#processamento-paralelo)
5. [Mecanismo de Retry](#mecanismo-de-retry)
6. [Como Usar](#como-usar)
7. [Configurações Personalizadas](#configurações-personalizadas)

## Cache de Resultados

O sistema de cache evita reprocessamento desnecessário de consultas que já foram executadas anteriormente, melhorando significativamente a performance para consultas frequentes.

### Funcionamento
- O cache é baseado em uma chave MD5 gerada a partir do conteúdo do arquivo e do tipo de mapeamento
- Os resultados processados são armazenados em arquivos JSON no diretório de cache
- Antes de processar um arquivo, o sistema verifica se já existe um cache válido

### Métodos Principais
- `Cache.gerarChave(caminhoArquivo, tipoMapeamento)` - Gera uma chave hash para o cache
- `Cache.verificarCache(chave)` - Verifica se existe um cache válido para a chave
- `Cache.salvarCache(chave, dados)` - Salva os dados processados no cache
- `Cache.invalidarCache(chave)` - Remove um cache específico
- `Cache.limparTodos()` - Remove todos os caches

### Exemplo de Uso
```javascript
const { processarConsultaAvancada } = require('./mapeador-dados-avancado');

// Usar cache (comportamento padrão)
await processarConsultaAvancada({
  caminhoArquivo: './dados.json',
  tipoMapeamento: 'empresa',
  usarCache: true  // Opcional, já é o padrão
});

// Ignorar cache existente
await processarConsultaAvancada({
  caminhoArquivo: './dados.json',
  tipoMapeamento: 'empresa',
  ignorarCache: true  // Força reprocessamento mesmo com cache existente
});
```

## Logging Avançado

O sistema de logging avançado facilita a depuração e monitoramento do processamento, com níveis de log, formatação estruturada e logs em arquivo.

### Níveis de Log
- `debug` - Informações detalhadas para depuração
- `info` - Informações gerais sobre o progresso
- `warn` - Avisos que podem indicar problemas
- `error` - Erros que afetam o processamento

### Funcionalidades
- Logs estruturados com timestamp
- Salvamento automático em arquivos diários
- Formatação de objetos JSON para melhor legibilidade
- Configuração de nível mínimo de log

### Métodos Principais
- `Logger.debug(mensagem, dados)` - Log de nível debug
- `Logger.info(mensagem, dados)` - Log de nível info
- `Logger.warn(mensagem, dados)` - Log de nível warn
- `Logger.error(mensagem, erro)` - Log de nível error com formatação especial de erros

### Exemplo de Uso
```javascript
const { Logger } = require('./mapeador-dados-avancado');

// Logs de diferentes níveis
Logger.debug('Iniciando processamento do registro', { id: 123 });
Logger.info('Processamento concluído');
Logger.warn('Falha ao enviar para API, tentando novamente', { tentativa: 2 });
Logger.error('Erro fatal', new Error('Mensagem de erro'));
```

## Tratamento Específico de Erros

O sistema de tratamento específico de erros fornece mensagens mais claras e facilita a resolução de problemas.

### Tipos de Erros Tratados
- Erros de leitura de arquivo (arquivo não encontrado, permissão negada, JSON inválido)
- Erros de API com diferentes códigos de status
- Erros de processamento de registros

### Funcionalidades
- Mensagens de erro mais descritivas
- Classificação automática de erros
- Decisão automatizada sobre retry para erros de API

### Métodos Principais
- `TratamentoErros.tratarErroLeitura(erro, caminhoArquivo)` - Trata erros de leitura de arquivo
- `TratamentoErros.tratarErroAPI(erro, registro, tentativa)` - Analisa erros de API e determina se deve tentar novamente

### Exemplo de Resposta de Erro
```
[2023-05-15T10:30:45.123Z] [ERROR] Erro ao processar arquivo ./dados.json
Erro: Formato de JSON inválido no arquivo: ./dados.json
Stack: Error: Unexpected token < in JSON at position 0 ...
```

## Processamento Paralelo

O processamento paralelo aproveita múltiplos núcleos da CPU para processar grandes volumes de dados de forma mais eficiente.

### Funcionamento
- Divisão dos registros em chunks para processamento paralelo
- Uso de worker threads para processamento simultâneo
- Combinação automática dos resultados

### Configurações
- `minRegistrosParaParalelizar` - Quantidade mínima de registros para ativar paralelismo
- `maxThreads` - Número máximo de threads simultâneos (padrão: número de CPUs - 1)
- `ativar` - Flag para ativar/desativar o paralelismo

### Métodos Principais
- `ProcessamentoParalelo.processarRegistrosParalelo(registros, tipoMapeamento)` - Processa registros paralelamente

### Exemplo de Uso
```javascript
// Configurando o processamento paralelo
await processarConsultaAvancada({
  caminhoArquivo: './dados_grandes.json',
  tipoMapeamento: 'empresa',
  configuracao: {
    PARALELO: {
      ativar: true,
      minRegistrosParaParalelizar: 100,
      maxThreads: 4
    }
  }
});
```

## Mecanismo de Retry

O mecanismo de retry aumenta a confiabilidade no envio de dados para a API, tratando falhas temporárias.

### Funcionamento
- Tentativas automáticas para erros recuperáveis
- Backoff exponencial entre tentativas
- Análise inteligente de quais erros devem ser tentados novamente

### Configurações
- `MAX_RETRY` - Número máximo de tentativas (padrão: 3)
- `RETRY_DELAY` - Tempo base de espera entre tentativas em ms (padrão: 1000ms)

### Métodos Principais
- `RetryAPI.enviarComRetry(dados, url)` - Envia dados para API com retry automático

### Exemplo de Uso
```javascript
// Configurando o mecanismo de retry
await processarConsultaAvancada({
  caminhoArquivo: './dados.json',
  tipoMapeamento: 'empresa',
  configuracao: {
    MAX_RETRY: 5,
    RETRY_DELAY: 2000  // 2 segundos
  }
});
```

## Como Usar

O mapeador avançado pode ser usado como script de linha de comando ou programaticamente.

### Uso na Linha de Comando

```bash
node mapeador-dados-avancado.js <arquivo_dados> <tipo_mapeamento> [opcoes]
```

**Opções Disponíveis:**
- `--salvar` - Salvar resultados em arquivo
- `--sem-api` - Não enviar para API
- `--dir=CAMINHO` - Diretório para salvar resultados
- `--sem-cache` - Não usar cache
- `--limpar-cache` - Limpar cache antes de processar
- `--log=NIVEL` - Nível de log (debug, info, warn, error)
- `--paralelo=N` - Número máximo de threads (0 para desativar)

**Exemplo:**
```bash
node mapeador-dados-avancado.js ./logs/empresa.json empresa --salvar --log=debug --paralelo=4
```

### Uso Programático

```javascript
const { processarConsultaAvancada } = require('./mapeador-dados-avancado');

async function exemplo() {
  try {
    const resultado = await processarConsultaAvancada({
      caminhoArquivo: './logs/dados.json',
      tipoMapeamento: 'empresa',
      salvarResultados: true,
      enviarAPI: true,
      diretorioResultados: './resultados',
      usarCache: true,
      ignorarCache: false,
      configuracao: {
        // Configurações personalizadas
        API_URL: 'http://meuservidor.com/api',
        LOG_LEVEL: 'debug',
        MAX_RETRY: 5
      }
    });
    
    console.log(`Processados: ${resultado.total}, Sucessos: ${resultado.sucessos}`);
  } catch (erro) {
    console.error('Erro:', erro);
  }
}
```

## Configurações Personalizadas

Você pode personalizar todas as configurações do mapeador avançado:

```javascript
const opcoes = {
  // ... outros parâmetros
  configuracao: {
    // API
    API_URL: 'http://localhost:3000/api/requests',
    
    // Cache
    CACHE_DIR: './cache',
    
    // Logs
    LOGS_DIR: './logs',
    LOG_LEVEL: 'info', // 'debug', 'info', 'warn', 'error'
    
    // Retry
    MAX_RETRY: 3,
    RETRY_DELAY: 1000, // ms
    
    // Paralelismo
    PARALELO: {
      ativar: true,
      minRegistrosParaParalelizar: 50,
      maxThreads: 4
    }
  }
};
```

Essas configurações permitem ajustar o comportamento do mapeador para diferentes cenários e requisitos de performance. 