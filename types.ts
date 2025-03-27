// Definição de uma consulta SQL agendada
export interface ScheduledQuery {
  id: string;
  name: string;
  query: string;
  schedule: string; // Expressão cron (ex: "0 8 * * *" para diariamente às 8h)
  enabled: boolean;
  lastRun?: Date;
  lastResult?: any;
  destination?: QueryDestination;
}

// Tipos de destinos para resultados de consultas
export type DestinationType = 'file' | 'http' | 'none';

// Configuração de destino para resultados de consultas
export interface QueryDestination {
  type: DestinationType;
  path?: string; // Caminho do arquivo para destino 'file'
  url?: string;  // URL para destino 'http'
  headers?: Record<string, string>; // Cabeçalhos HTTP para destino 'http'
}

// Configuração global do aplicativo
export interface AppConfig {
  connectionString: string;
  serverPort: number;
  scheduledQueries: ScheduledQuery[];
  appStartup: boolean; // Iniciar com o Windows
  startMinimized: boolean; // Iniciar minimizado
  apiUrl?: string; // URL da API para envio de dados
  apiKey?: string; // Chave de autenticação da API
}

// Configuração padrão para novos usuários
export const DEFAULT_CONFIG: AppConfig = {
  connectionString: "Provider=MSDASQL;DSN=Contabil;UID=sistema;PWD=1234;",
  serverPort: 8765,
  scheduledQueries: [],
  appStartup: true,
  startMinimized: true,
  apiUrl: "http://localhost:3000/api",
  apiKey: ""
}; 