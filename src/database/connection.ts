import { Logger } from '../utils/logger';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  connectionTimeout?: number;
  queryTimeout?: number;
  poolSize?: number;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  fields: string[];
}

export interface DatabaseConnection {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  transaction<T>(callback: (trx: DatabaseConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class DatabaseManager {
  private logger = new Logger('DatabaseManager');
  private config: DatabaseConfig;
  private connected = false;
  private connections: DatabaseConnection[] = [];

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.logger.info('Connecting to database', {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database
    });

    try {
      // Mock connection for testing
      this.connected = true;
      this.logger.info('Database connected successfully');
    } catch (error) {
      this.logger.error('Database connection failed', error);
      throw error;
    }
  }

  async getConnection(): Promise<DatabaseConnection> {
    if (!this.connected) {
      await this.connect();
    }

    // Mock connection implementation
    const connection: DatabaseConnection = {
      async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
        // Mock query implementation
        return {
          rows: [] as T[],
          rowCount: 0,
          fields: []
        };
      },

      async transaction<T>(callback: (trx: DatabaseConnection) => Promise<T>): Promise<T> {
        // Mock transaction implementation
        return callback(this);
      },

      async close(): Promise<void> {
        // Mock close implementation
      }
    };

    this.connections.push(connection);
    return connection;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const connection = await this.getConnection();
    return connection.query<T>(sql, params);
  }

  async transaction<T>(callback: (trx: DatabaseConnection) => Promise<T>): Promise<T> {
    const connection = await this.getConnection();
    return connection.transaction(callback);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.query('SELECT 1 as test');
      return true;
    } catch (error) {
      this.logger.error('Database connection test failed', error);
      return false;
    }
  }

  async isHealthy(): Promise<boolean> {
    return this.connected && await this.testConnection();
  }

  async getStats(): Promise<any> {
    return {
      connected: this.connected,
      activeConnections: this.connections.length,
      config: {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database
      }
    };
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from database');

    // Close all connections
    await Promise.all(this.connections.map(conn => conn.close()));
    this.connections = [];
    this.connected = false;

    this.logger.info('Database disconnected');
  }

  async shutdown(): Promise<void> {
    await this.disconnect();
  }
}

// Singleton instance for application use
let databaseManager: DatabaseManager | null = null;

export function createDatabaseManager(config: DatabaseConfig): DatabaseManager {
  databaseManager = new DatabaseManager(config);
  return databaseManager;
}

export function getDatabaseManager(): DatabaseManager {
  if (!databaseManager) {
    throw new Error('Database manager not initialized. Call createDatabaseManager first.');
  }
  return databaseManager;
}

export async function initializeDatabase(config: DatabaseConfig): Promise<DatabaseManager> {
  const manager = createDatabaseManager(config);
  await manager.connect();
  return manager;
}