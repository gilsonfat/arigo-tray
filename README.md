# SQL Tray App

<div align="center">
  <p>
    <strong>Aplicação para Consultas SQL Automatizadas com Suporte a API</strong>
  </p>
  <p>
    <a href="#instalação">Instalação</a> •
    <a href="#funcionalidades">Funcionalidades</a> •
    <a href="#configuração">Configuração</a> •
    <a href="#uso">Como Usar</a>
  </p>
</div>

## 📋 Sobre

O SQL Tray App é uma aplicação desktop que permite executar consultas SQL em bancos de dados ODBC e enviar os resultados para uma API externa. A aplicação roda na bandeja do sistema (system tray) e oferece uma interface amigável para gerenciamento de consultas agendadas.

## ✨ Funcionalidades

- 🔄 Execução automática de consultas SQL agendadas
- 🌐 Integração com APIs externas
- 📊 Salvamento de resultados em arquivos JSON
- ⏰ Agendamento flexível usando expressões cron
- 🔐 Suporte a autenticação de API
- 📝 Interface gráfica para configuração
- 📋 Logs detalhados de execução
- 🔌 Suporte a múltiplos destinos para resultados

## 🚀 Instalação

1. Clone o repositório e instale as dependências:
```bash
git clone https://github.com/seu-usuario/cli-tray.git
cd cli-tray
npm install
```

2. Compile o projeto:
```bash
npm run build
```

3. Inicie a aplicação:
```bash
npm start
```

## ⚙️ Configuração

### Banco de Dados

Configure a string de conexão ODBC através da interface de configuração:
```
Provider=MSDASQL;DSN=NomeDSN;UID=usuario;PWD=senha;
```

### API Externa

Configure a URL da API e a chave de autenticação (se necessária) na aba de configuração da API.

## 📝 Como Usar

### Consultas Agendadas

1. Clique no ícone na bandeja do sistema
2. Vá para a aba "Consultas Agendadas"
3. Clique em "Nova Consulta"
4. Configure:
   - Nome da consulta
   - Query SQL
   - Agendamento (formato cron)
   - Destino dos resultados

### Formato Cron

Exemplos de agendamento:
```
0 8 * * *     # Todos os dias às 8h
0 */2 * * *   # A cada 2 horas
0 9 * * 1-5   # Dias úteis às 9h
```

### Destinos de Resultados

- **Arquivo**: Salva em JSON
- **API**: Envia para API externa
- **Nenhum**: Apenas armazena internamente

## 🔧 Desenvolvimento

### Estrutura do Projeto

```
cli-tray/
├── src/
│   ├── main.ts           # Processo principal
│   ├── config-window.ts  # Janela de configuração
│   ├── api-service.ts    # Serviço de API
│   └── types.ts          # Definições de tipos
├── ui/
│   ├── config.html       # Interface
│   ├── config.js         # Lógica da interface
│   └── styles.css        # Estilos
└── assets/              # Recursos
```

### Scripts

- `npm run build`: Compila o projeto
- `npm start`: Inicia a aplicação
- `npm run dev`: Modo desenvolvimento

## 📦 Dependências Principais

- Electron
- Express
- node-adodb
- axios
- electron-store
- winston

## 🤝 Contribuindo

1. Faça um fork do projeto
2. Crie uma branch (`git checkout -b feature/NomeFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona feature'`)
4. Push para a branch (`git push origin feature/NomeFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT.

---

<div align="center">
  <p>Desenvolvido com ❤️</p>
  <p>Versão 1.0.0</p>
</div>
