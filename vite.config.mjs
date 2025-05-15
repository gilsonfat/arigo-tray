import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

// Calcula o __dirname para ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [
    react(),
    // Plugin personalizado para compartilhar URL do servidor com o Electron
    {
      name: 'vite:electron-dev-url',
      configureServer(server) {
        // Após o servidor iniciar, compartilhar a URL
        server.httpServer.once('listening', () => {
          // Capturar a URL real que o Vite está usando
          const address = server.httpServer.address();
          if (address && typeof address !== 'string') {
            const protocol = server.config.server.https ? 'https' : 'http';
            const host = address.address === '::' ? 'localhost' : address.address;
            const port = address.port;
            const url = `${protocol}://${host}:${port}`;
            // Definir variável de ambiente para o processo principal do Electron
            process.env.VITE_DEV_SERVER_URL = url;
            console.log(`\n🔄 Vite Dev Server URL configurada para processo Electron: ${url}\n`);
          }
        });
      }
    }
  ],
  server: {
    port: 6502,
    strictPort: true // Falhar se a porta estiver em uso, em vez de tentar a próxima
  },
  build: {
    outDir: path.join(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  }
}); 