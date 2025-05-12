# CLI Tray Agent

Aplicativo tray para Windows com funções de integração e comunicação.

## Tecnologias

- Electron 29
- Vite 5
- React 18
- SQLite3

## Funcionalidades

- Execução em segundo plano como ícone na bandeja do sistema
- Integração com serviços e bancos de dados locais
- Interface web para configuração e monitoramento

## Resolução do problema do tray

Para resolver o problema do ícone na bandeja do sistema, foram feitas as seguintes alterações:

1. **Simplificação do código principal**:
   - O arquivo `main/index.js` foi simplificado para focar apenas nas funcionalidades essenciais
   - Implementação de um ícone de fallback em base64 para garantir que o ícone na bandeja sempre apareça

2. **Solução de problemas com rotas**:
   - O script `electron-dev` foi atualizado para usar a opção `--kill-others` e iniciar o Electron junto com o Vite
   - Ajustada a porta no Electron para corresponder à porta usada pelo Vite (5176)

3. **Tratamento de erros**:
   - Adicionado tratamento de erros e logs mais detalhados
   - Implementação de try/catch para evitar falhas críticas

## Executando o projeto

```bash
# Instalar dependências
npm install

# Desenvolvimento
npm run electron-dev

# Apenas o Electron
npm run electron

# Apenas o frontend
npm run dev

# Criar pacote de distribuição
npm run package
```

## Depuração

Para depurar problemas com o ícone na bandeja:

1. Verifique se o ícone existe e está em um formato suportado
2. Confirme se as permissões do SO permitem a criação de ícones na bandeja
3. Use o ícone padrão em base64 caso nenhum ícone seja encontrado
