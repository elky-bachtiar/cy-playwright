import { Logger } from '../utils/logger';

export interface RedisClientConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  timeout?: number;
  retries?: number;
  keyPrefix?: string;
}

export interface RedisStats {
  connected: boolean;
  keyCount: number;
  memoryUsage: number;
  connections: number;
  uptime: number;
}

export class RedisClient {
  private logger = new Logger('RedisClient');
  private config: RedisClientConfig;
  private connected = false;
  private data: Map<string, { value: any; expiry?: number }> = new Map();

  constructor(config: RedisClientConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.logger.info('Connecting to Redis', {
      host: this.config.host,
      port: this.config.port,
      db: this.config.db
    });

    try {
      // Mock connection for testing
      this.connected = true;
      this.logger.info('Redis connected successfully');
    } catch (error) {
      this.logger.error('Redis connection failed', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from Redis');
    this.connected = false;
    this.data.clear();
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this.connected) {
      throw new Error('Redis client not connected');
    }

    const fullKey = this.getFullKey(key);
    const expiry = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : undefined;

    this.data.set(fullKey, { value, expiry });
    this.logger.debug(`Set key: ${fullKey}`, { ttl: ttlSeconds });
  }

  async get(key: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Redis client not connected');
    }

    const fullKey = this.getFullKey(key);
    const item = this.data.get(fullKey);

    if (!item) {
      return null;
    }

    // Check if expired
    if (item.expiry && Date.now() > item.expiry) {
      this.data.delete(fullKey);
      return null;
    }

    return item.value;
  }

  async delete(key: string): Promise<boolean> {
    if (!this.connected) {
      throw new Error('Redis client not connected');
    }

    const fullKey = this.getFullKey(key);
    const existed = this.data.has(fullKey);
    this.data.delete(fullKey);

    this.logger.debug(`Deleted key: ${fullKey}`, { existed });
    return existed;
  }

  async exists(key: string): Promise<boolean> {
    if (!this.connected) {
      throw new Error('Redis client not connected');
    }

    const fullKey = this.getFullKey(key);
    const item = this.data.get(fullKey);

    if (!item) {
      return false;
    }

    // Check if expired
    if (item.expiry && Date.now() > item.expiry) {
      this.data.delete(fullKey);
      return false;
    }

    return true;
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.connected) {
      throw new Error('Redis client not connected');
    }

    const regex = new RegExp(pattern.replace('*', '.*'));
    const matchingKeys: string[] = [];

    for (const [key, item] of this.data.entries()) {
      // Check if expired
      if (item.expiry && Date.now() > item.expiry) {
        this.data.delete(key);
        continue;
      }

      // Remove prefix for pattern matching
      const unprefixedKey = this.removePrefix(key);
      if (regex.test(unprefixedKey)) {
        matchingKeys.push(unprefixedKey);
      }
    }

    return matchingKeys;
  }

  async incr(key: string): Promise<number> {
    if (!this.connected) {
      throw new Error('Redis client not connected');
    }

    const current = await this.get(key);
    const newValue = (typeof current === 'number' ? current : 0) + 1;
    await this.set(key, newValue);
    return newValue;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.connected) {
      throw new Error('Redis client not connected');
    }

    const fullKey = this.getFullKey(key);
    const item = this.data.get(fullKey);

    if (!item) {
      return false;
    }

    item.expiry = Date.now() + (ttlSeconds * 1000);
    return true;
  }

  async ttl(key: string): Promise<number> {
    if (!this.connected) {
      throw new Error('Redis client not connected');
    }

    const fullKey = this.getFullKey(key);
    const item = this.data.get(fullKey);

    if (!item || !item.expiry) {
      return -1; // No expiry set
    }

    const remaining = Math.max(0, item.expiry - Date.now());
    return Math.ceil(remaining / 1000);
  }

  async flush(): Promise<void> {
    if (!this.connected) {
      throw new Error('Redis client not connected');
    }

    this.data.clear();
    this.logger.debug('Flushed all keys');
  }

  async ping(): Promise<string> {
    if (!this.connected) {
      throw new Error('Redis client not connected');
    }

    return 'PONG';
  }

  async getStats(): Promise<RedisStats> {
    return {
      connected: this.connected,
      keyCount: this.data.size,
      memoryUsage: this.estimateMemoryUsage(),
      connections: this.connected ? 1 : 0,
      uptime: this.connected ? 3600 : 0 // Mock uptime
    };
  }

  getConnectionInfo(): any {
    return {
      host: this.config.host,
      port: this.config.port,
      db: this.config.db,
      connected: this.connected,
      status: this.connected ? 'ready' : 'disconnected'
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  async shutdown(): Promise<void> {
    await this.disconnect();
  }

  private getFullKey(key: string): string {
    const prefix = this.config.keyPrefix || '';
    return prefix + key;
  }

  private removePrefix(key: string): string {
    const prefix = this.config.keyPrefix || '';
    return key.startsWith(prefix) ? key.slice(prefix.length) : key;
  }

  private estimateMemoryUsage(): number {
    let total = 0;
    for (const [key, item] of this.data.entries()) {
      total += key.length * 2; // Approximate string overhead
      total += JSON.stringify(item.value).length * 2;
      total += 64; // Object overhead
    }
    return total;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, item] of this.data.entries()) {
      if (item.expiry && now > item.expiry) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.data.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.logger.debug(`Cleaned up ${expiredKeys.length} expired keys`);
    }
  }
}

// Singleton instance for application use
let redisClient: RedisClient | null = null;

export function createRedisClient(config: RedisClientConfig): RedisClient {
  redisClient = new RedisClient(config);
  return redisClient;
}

export function getRedisClient(): RedisClient {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call createRedisClient first.');
  }
  return redisClient;
}

export async function initializeRedis(config: RedisClientConfig): Promise<RedisClient> {
  const client = createRedisClient(config);
  await client.connect();
  return client;
}