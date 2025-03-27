import { app } from 'electron';
import path from 'path';

// Importa a classe SQLTrayApp do arquivo adodb-connection
import { SQLTrayApp } from './adodb-connection';

// Previne que múltiplas instâncias do aplicativo sejam abertas
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Outra instância do aplicativo já está em execução. Fechando esta instância.');
  app.quit();
} else {
  // Gerencia erros não tratados
  process.on('uncaughtException', (error) => {
    console.error('Erro não tratado:', error);
  });

  // Verifica se a aplicação está pronta para iniciar
  app.on('ready', () => {
    console.log('Aplicação Electron iniciada com sucesso');
  });

  // Inicia a aplicação quando o Electron estiver pronto
  app.whenReady().then(() => {
    const trayApp = new SQLTrayApp();
    trayApp.start();
  });

  // Garante que o aplicativo não seja fechado quando todas as janelas forem fechadas
  app.on('window-all-closed', (e: any) => {
    e.preventDefault();
  });
} 