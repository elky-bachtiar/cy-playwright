import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { RedisCache } from './redis-cache';
import { MemoryCache } from './memory-cache';

export interface CacheLayer {
  type: 'memory' | 'redis';
  maxSize?: number;
  ttl?: number;
  maxMemoryMB?: number;
}

export interface CacheConfig {
  layers: CacheLayer[];
  strategy: 'simple' | 'layered';
  enableStats?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: number;
}

export class CacheManager extends EventEmitter {
  private logger = new Logger('CacheManager');
  private layers: Map<string, any> = new Map();
  private config: CacheConfig;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0,
    totalKeys: 0,
    memoryUsage: 0
  };
  private initialized = false;

  async initialize(config: CacheConfig): Promise<void> {
    try {
      this.logger.info('Initializing cache manager');
      this.config = config;

      for (const [index, layerConfig] of config.layers.entries()) {
        const layerName = `${layerConfig.type}-${index}`;
        let cache;

        switch (layerConfig.type) {
          case 'memory':
            cache = new MemoryCache();
            await cache.initialize({
              maxSize: layerConfig.maxSize || 100,
              ttl: layerConfig.ttl || 300,
              maxMemoryMB: layerConfig.maxMemoryMB
            });
            break;
          case 'redis':
            cache = new RedisCache();
            await cache.initialize({
              host: process.env.REDIS_HOST || 'localhost',
              port: parseInt(process.env.REDIS_PORT || '6379'),
              ttl: layerConfig.ttl || 3600
            });
            break;
          default:
            throw new Error(`Unsupported cache type: ${layerConfig.type}`);
        }

        this.layers.set(layerName, cache);
      }

      this.initialized = true;
      this.logger.info('Cache manager initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize cache manager', error);
      throw error;
    }
  }

  async get(key: string): Promise<any> {
    if (!this.initialized) {
      throw new Error('Cache manager not initialized');
    }

    try {
      for (const [layerName, cache] of this.layers) {
        const value = await cache.get(key);
        if (value !== null) {
          this.stats.hits++;
          this.updateHitRate();
          this.logger.debug(`Cache hit in ${layerName}`, { key });
          return value;
        }
      }

      this.stats.misses++;
      this.updateHitRate();
      this.logger.debug('Cache miss', { key });
      return null;

    } catch (error) {
      this.logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Cache manager not initialized');
    }

    try {
      let success = false;

      for (const [layerName, cache] of this.layers) {
        const result = await cache.set(key, value, ttl);
        if (result) {
          success = true;
          this.logger.debug(`Cache set in ${layerName}`, { key });
        }
      }

      if (success) {
        this.stats.sets++;
        this.stats.totalKeys = await this.getTotalKeyCount();
      }

      return success;

    } catch (error) {
      this.logger.error('Cache set error', { key, error: error.message });
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Cache manager not initialized');
    }

    try {
      let success = false;

      for (const [layerName, cache] of this.layers) {
        const result = await cache.delete(key);
        if (result) {
          success = true;
          this.logger.debug(`Cache delete in ${layerName}`, { key });
        }
      }

      if (success) {
        this.stats.deletes++;
        this.stats.totalKeys = await this.getTotalKeyCount();
      }

      return success;

    } catch (error) {
      this.logger.error('Cache delete error', { key, error: error.message });
      return false;
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    let deletedCount = 0;

    try {
      for (const [layerName, cache] of this.layers) {
        if (cache.deletePattern) {
          const count = await cache.deletePattern(pattern);
          deletedCount += count;
          this.logger.debug(`Pattern delete in ${layerName}`, { pattern, count });
        }
      }

      this.stats.deletes += deletedCount;
      this.stats.totalKeys = await this.getTotalKeyCount();

      return deletedCount;

    } catch (error) {
      this.logger.error('Cache pattern delete error', { pattern, error: error.message });
      return 0;
    }
  }

  async getStats(): Promise<CacheStats> {
    if (this.config.enableStats) {
      this.stats.memoryUsage = process.memoryUsage().heapUsed;
      this.stats.totalKeys = await this.getTotalKeyCount();
    }

    return { ...this.stats };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getLayerCount(): number {
    return this.layers.size;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down cache manager');

    try {
      for (const [layerName, cache] of this.layers) {
        this.logger.debug(`Shutting down cache layer: ${layerName}`);
        if (cache.shutdown) {
          await cache.shutdown();
        }
      }

      this.layers.clear();
      this.initialized = false;

      this.logger.info('Cache manager shut down successfully');

    } catch (error) {
      this.logger.error('Error during cache manager shutdown', error);
      throw error;
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private async getTotalKeyCount(): Promise<number> {
    let totalKeys = 0;

    try {
      for (const [layerName, cache] of this.layers) {
        if (cache.getKeyCount) {
          totalKeys += await cache.getKeyCount();
        }
      }
    } catch (error) {
      this.logger.warn('Failed to get total key count', error);
    }

    return totalKeys;
  }
}