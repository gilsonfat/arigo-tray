import Store from 'electron-store';
import { app } from 'electron';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AppConfig, DEFAULT_CONFIG, ScheduledQuery } from './types';

export class ConfigManager {
  private store: Store<AppConfig>;
  
  constructor() {
    this.store = new Store<AppConfig>({
      name: 'sql-tray-config',
      defaults: DEFAULT_CONFIG
    });
    
    // Migrar configurações antigas se necessário
    this.migrateConfig();
  }
  
  // Obter a configuração completa
  getConfig(): AppConfig {
    return this.store.store;
  }
  
  // Salvar a configuração completa
  saveConfig(config: AppConfig): void {
    this.store.store = config;
  }
  
  // Obter a string de conexão
  getConnectionString(): string {
    return this.store.get('connectionString');
  }
  
  // Definir a string de conexão
  setConnectionString(connectionString: string): void {
    this.store.set('connectionString', connectionString);
  }
  
  // Obter a porta do servidor
  getServerPort(): number {
    return this.store.get('serverPort');
  }
  
  // Definir a porta do servidor
  setServerPort(port: number): void {
    this.store.set('serverPort', port);
  }
  
  // Obter a URL da API
  getApiUrl(): string {
    return this.store.get('apiUrl') || '';
  }
  
  // Definir a URL da API
  setApiUrl(url: string): void {
    this.store.set('apiUrl', url);
  }
  
  // Obter a chave da API
  getApiKey(): string {
    return this.store.get('apiKey') || '';
  }
  
  // Definir a chave da API
  setApiKey(key: string): void {
    this.store.set('apiKey', key);
  }
  
  // Obter todas as consultas agendadas
  getScheduledQueries(): ScheduledQuery[] {
    return this.store.get('scheduledQueries');
  }
  
  // Adicionar uma nova consulta agendada
  addScheduledQuery(query: Omit<ScheduledQuery, 'id'>): ScheduledQuery {
    const newQuery: ScheduledQuery = {
      ...query,
      id: uuidv4()
    };
    
    const queries = this.getScheduledQueries();
    queries.push(newQuery);
    this.store.set('scheduledQueries', queries);
    
    return newQuery;
  }
  
  // Atualizar uma consulta agendada existente
  updateScheduledQuery(query: ScheduledQuery): void {
    const queries = this.getScheduledQueries();
    const index = queries.findIndex(q => q.id === query.id);
    
    if (index !== -1) {
      queries[index] = query;
      this.store.set('scheduledQueries', queries);
    }
  }
  
  // Remover uma consulta agendada
  removeScheduledQuery(queryId: string): void {
    const queries = this.getScheduledQueries();
    const filteredQueries = queries.filter(q => q.id !== queryId);
    this.store.set('scheduledQueries', filteredQueries);
  }
  
  // Limpar todas as consultas agendadas
  clearScheduledQueries(): void {
    this.store.set('scheduledQueries', []);
  }
  
  // Verificar se o aplicativo está configurado para iniciar com o Windows
  isStartWithWindows(): boolean {
    return this.store.get('appStartup');
  }
  
  // Definir se o aplicativo deve iniciar com o Windows
  setStartWithWindows(enabled: boolean): void {
    this.store.set('appStartup', enabled);
    
    // Configurar inicialização automática com o Windows
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: this.store.get('startMinimized')
    });
  }
  
  // Verificar se o aplicativo deve iniciar minimizado
  isStartMinimized(): boolean {
    return this.store.get('startMinimized');
  }
  
  // Definir se o aplicativo deve iniciar minimizado
  setStartMinimized(enabled: boolean): void {
    this.store.set('startMinimized', enabled);
    
    // Atualizar configuração de login se necessário
    if (this.isStartWithWindows()) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: enabled
      });
    }
  }
  
  // Migrar configurações antigas para o novo formato se necessário
  private migrateConfig(): void {
    // Exemplo de migração de configuração
    // Verificar versão do esquema e atualizar se necessário
    const version = this.store.get('version') as number | undefined;
    
    if (!version) {
      // Primeira versão, nada a migrar
    }
  }
} 