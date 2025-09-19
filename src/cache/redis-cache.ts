import Redis from 'ioredis';
import { Logger } from '../utils/logger';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  ttl?: number;
  keyPrefix?: string;
}

export class RedisCache {
  private logger = new Logger('RedisCache');
  private client: Redis;
  private config: RedisConfig;
  private connected = false;

  async initialize(config: RedisConfig): Promise<void> {
    try {
      this.logger.info('Initializing Redis cache');
      this.config = config;

      this.client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db || 0,
        keyPrefix: config.keyPrefix || 'cy-playwright:',
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true
      });

      await this.client.connect();
      this.connected = true;

      this.setupEventHandlers();
      this.logger.info('Redis cache initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Redis cache', error);
      throw error;
    }
  }

  async get(key: string): Promise<any> {
    if (!this.connected) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;

    } catch (error) {
      this.logger.error('Redis get error', { key, error: error.message });
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    if (!this.connected) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      const expireTime = ttl || this.config.ttl || 3600;

      await this.client.setex(key, expireTime, serialized);
      return true;

    } catch (error) {
      this.logger.error('Redis set error', { key, error: error.message });
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.connected) {
      return false;
    }

    try {
      const result = await this.client.del(key);
      return result > 0;

    } catch (error) {
      this.logger.error('Redis delete error', { key, error: error.message });
      return false;
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    if (!this.connected) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.client.del(...keys);
      return result;

    } catch (error) {
      this.logger.error('Redis pattern delete error', { pattern, error: error.message });
      return 0;
    }
  }

  async increment(key: string): Promise<number> {
    if (!this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.incr(key);

    } catch (error) {
      this.logger.error('Redis increment error', { key, error: error.message });
      throw error;
    }
  }

  async acquireLock(key: string, timeout: number): Promise<boolean> {
    if (!this.connected) {
      return false;
    }

    try {
      const lockKey = `lock:${key}`;
      const lockValue = `${Date.now()}-${Math.random()}`;

      const result = await this.client.set(lockKey, lockValue, 'PX', timeout, 'NX');
      return result === 'OK';

    } catch (error) {
      this.logger.error('Redis acquire lock error', { key, error: error.message });
      return false;
    }
  }

  async releaseLock(key: string): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      const lockKey = `lock:${key}`;
      await this.client.del(lockKey);

    } catch (error) {
      this.logger.error('Redis release lock error', { key, error: error.message });
    }
  }

  async getKeyCount(): Promise<number> {
    if (!this.connected) {
      return 0;
    }

    try {
      const info = await this.client.info('keyspace');
      const dbInfo = info.split('\n').find(line => line.startsWith(`db${this.config.db || 0}:`));

      if (dbInfo) {
        const match = dbInfo.match(/keys=(\d+)/);
        return match ? parseInt(match[1]) : 0;
      }

      return 0;

    } catch (error) {
      this.logger.error('Redis key count error', error);
      return 0;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Redis cache');
    await this.disconnect();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.logger.info('Redis connected');
      this.connected = true;
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis connection error', error);
      this.connected = false;
    });

    this.client.on('close', () => {
      this.logger.warn('Redis connection closed');
      this.connected = false;
    });

    this.client.on('reconnecting', () => {
      this.logger.info('Redis reconnecting');
    });
  }
}