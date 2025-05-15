/**
 * Script para matar processos pendentes do Electron e Vite
 * Isso ajuda a evitar conflitos de porta e processos fantasmas.
 */

const { execSync } = require('child_process');
const os = require('os');

function killProcesses() {
  console.log('🧹 Limpando processos pendentes...');
  
  try {
    // Diferentes comandos baseados no sistema operacional
    if (process.platform === 'win32') {
      // Windows
      try {
        execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
        console.log('- Processos Electron encerrados');
      } catch (e) {
        // Geralmente falha se não houver processos para matar, o que é ok
      }
      
      try {
        // Matar processos Node que estejam servindo nas portas 6501 ou 6502
        const portCheck = execSync('netstat -ano | findstr :6501 :6502').toString();
        if (portCheck) {
          const lines = portCheck.split('\n');
          for (const line of lines) {
            const match = line.match(/(\d+)$/);
            if (match && match[1]) {
              try {
                execSync(`taskkill /F /PID ${match[1]}`, { stdio: 'ignore' });
                console.log(`- Processo na porta ${line.includes('6501') ? '6501' : '6502'} encerrado (PID: ${match[1]})`);
              } catch (e) {
                // Ignorar erros de processo já encerrado
              }
            }
          }
        }
      } catch (e) {
        // Falha se não houver processos nas portas, o que é ok
      }
    } else {
      // Linux/Mac
      try {
        execSync('pkill -f electron', { stdio: 'ignore' });
        console.log('- Processos Electron encerrados');
      } catch (e) {
        // Geralmente falha se não houver processos para matar, o que é ok
      }
      
      try {
        // Matar processos na portas 6501 ou 6502
        const cmd = process.platform === 'darwin' 
          ? "lsof -i:6501,6502 | grep LISTEN | awk '{print $2}' | xargs kill -9"
          : "fuser -k 6501/tcp 6502/tcp";
        execSync(cmd, { stdio: 'ignore' });
        console.log('- Processos nas portas 6501/6502 encerrados');
      } catch (e) {
        // Falha se não houver processos nas portas, o que é ok
      }
    }
    
    console.log('✅ Limpeza concluída\n');
  } catch (error) {
    console.error('❌ Erro ao limpar processos:', error.message);
  }
}

// Executar limpeza quando o script é invocado diretamente
if (require.main === module) {
  killProcesses();
}

module.exports = { killProcesses }; 