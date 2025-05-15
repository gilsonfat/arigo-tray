const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 6500; // Porta do servidor Vite conforme configurado no vite.config.mjs
const MAX_ATTEMPTS = 15; // Aumentado para dar mais tempo ao Vite iniciar
const RETRY_INTERVAL = 1000; // 1 segundo

console.log('Iniciando script para verificar o servidor Vite e iniciar o Electron');
console.log(`Porta configurada: ${PORT} | Tentativas máximas: ${MAX_ATTEMPTS} | Intervalo: ${RETRY_INTERVAL}ms`);

function checkViteServer(attempt = 1) {
  if (attempt > MAX_ATTEMPTS) {
    console.error(`Não foi possível conectar ao servidor Vite após ${MAX_ATTEMPTS} tentativas.`);
    console.error('Verifique se o servidor Vite está sendo iniciado corretamente na porta ' + PORT);
    process.exit(1);
  }

  console.log(`Verificando se o Vite está rodando (tentativa ${attempt}/${MAX_ATTEMPTS})...`);
  
  const req = http.get(`http://localhost:${PORT}`, (res) => {
    if (res.statusCode === 200) {
      console.log('Servidor Vite detectado com sucesso! Iniciando Electron...');
      startElectron();
    } else {
      console.log(`Servidor respondeu com status ${res.statusCode}, tentando novamente...`);
      setTimeout(() => checkViteServer(attempt + 1), RETRY_INTERVAL);
    }
  });

  req.on('error', (error) => {
    console.log(`Tentativa ${attempt}: Servidor Vite ainda não está pronto (${error.message})`);
    setTimeout(() => checkViteServer(attempt + 1), RETRY_INTERVAL);
  });

  req.on('timeout', () => {
    console.log(`Tentativa ${attempt}: Timeout ao conectar com o servidor Vite`);
    req.destroy();
    setTimeout(() => checkViteServer(attempt + 1), RETRY_INTERVAL);
  });

  req.setTimeout(2000); // 2 segundos de timeout
  req.end();
}

function startElectron() {
  console.log('Iniciando processo do Electron...');
  
  // Configurando variáveis de ambiente para facilitar diagnósticos
  const env = {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: 1,
    NODE_ENV: 'development',
    ELECTRON_VITE_PORT: PORT.toString()
  };
  
  // Caminho para o executável do Electron
  const electronProcess = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx', 
    ['electron', '.'],
    { 
      stdio: 'inherit',
      shell: true,
      env
    }
  );

  electronProcess.on('close', (code) => {
    console.log(`Electron encerrado com código: ${code}`);
    process.exit(code);
  });
  
  electronProcess.on('error', (err) => {
    console.error('Erro ao iniciar o Electron:', err);
    process.exit(1);
  });
  
  console.log('Processo do Electron iniciado com sucesso!');
}

// Inicia a verificação
console.log('Iniciando verificação do servidor Vite...');
checkViteServer(); 