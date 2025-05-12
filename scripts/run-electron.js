// Script para iniciar o Electron com configurações específicas
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configurar variáveis de ambiente que podem afetar o comportamento do Electron
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
process.env.ELECTRON_NO_ATTACH_CONSOLE = 'true';
process.env.ELECTRON_ENABLE_LOGGING = '1';
process.env.ELECTRON_DEBUG_NATIVE_MODULES = '1';

// Caminho para o diretório do projeto
const projectRoot = path.resolve(__dirname, '..');

console.log('Iniciando o Electron em modo simples...');

// Executa o Electron com spawn para melhor captura de erros
const electron = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron', '.'],
  {
    cwd: projectRoot,
    env: process.env,
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'] // Capture stdout e stderr
  }
);

// Captura saída padrão
electron.stdout.on('data', (data) => {
  console.log(`[Electron stdout]: ${data.toString().trim()}`);
});

// Captura erros
electron.stderr.on('data', (data) => {
  console.error(`[Electron stderr]: ${data.toString().trim()}`);
});

// Manipula o encerramento
electron.on('close', (code) => {
  if (code !== 0) {
    console.error(`Electron encerrou com código de erro: ${code}`);
  } else {
    console.log('Electron encerrou normalmente.');
  }
});

// Manipula erros do processo
electron.on('error', (err) => {
  console.error('Falha ao iniciar o processo do Electron:', err);
}); 