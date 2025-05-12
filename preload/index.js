const { contextBridge, ipcRenderer } = require('electron');

// Expõe um objeto chamado 'electron' no 'window' do processo de renderização.
// Este objeto terá uma propriedade 'ipcRenderer' com métodos seguros.
contextBridge.exposeInMainWorld('electron', {
  // Expõe apenas os métodos do ipcRenderer que queremos usar no frontend
  // para evitar expor funcionalidades perigosas.
  ipcRenderer: {
    invoke: (channel, ...args) => {
      const validChannels = [
        'get-connections', 'create-connection', 'update-connection', 'delete-connection', 'test-connection',
        'get-queries', 'create-query', 'update-query', 'delete-query', 'execute-query', 'test-query',
        'get-tasks', 'create-task', 'update-task', 'delete-task', 'execute-task',
        'sync-all', 'force-sync',
        'diagnose-connection', 'get-odbc-drivers'
      ];
      if (validChannels.includes(channel)) {
        console.log(`[preload] Invocando canal IPC: ${channel}`, args);
        try {
          return ipcRenderer.invoke(channel, ...args)
            .then(result => {
              console.log(`[preload] Resultado IPC de ${channel}:`, result);
              return result;
            })
            .catch(error => {
              console.error(`[preload] Erro IPC em ${channel}:`, error);
              throw error; // Repassa o erro para ser tratado pelo cliente
            });
        } catch (error) {
          console.error(`[preload] Erro ao invocar ${channel}:`, error);
          throw error;
        }
      }
      return Promise.reject(new Error(`Canal IPC não permitido: ${channel}`));
    },
    // Adicione 'send' ou 'on' aqui se precisar deles, mas 'invoke' é geralmente preferível.
    // send: (channel, data) => ipcRenderer.send(channel, data),
    // on: (channel, func) => {
    //   const subscription = (event, ...args) => func(...args);
    //   ipcRenderer.on(channel, subscription);
    //   return () => ipcRenderer.removeListener(channel, subscription); // Retorna função de cleanup
    // },
    // removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  },
  // Você pode expor outras APIs do Node ou Electron aqui de forma segura, se necessário
  // Exemplo: versions: process.versions,
});

console.log('Preload script loaded and contextBridge executed.'); // Log para confirmar carregamento 