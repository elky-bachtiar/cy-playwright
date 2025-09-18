import { Logger } from '../utils/logger';

export interface CacheStrategyConfig {
  maxSize?: number;
  ttl?: number;
  evictionPolicy?: 'lru' | 'lfu' | 'ttl';
  compressionThreshold?: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  hitRate: number;
  averageResponseTime: number;
}

export abstract class CacheStrategy {
  protected logger = new Logger('CacheStrategy');
  protected config: CacheStrategyConfig;
  protected metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalRequests: 0,
    hitRate: 0,
    averageResponseTime: 0
  };

  constructor(config: CacheStrategyConfig) {
    this.config = config;
  }

  abstract get(key: string): Promise<any>;
  abstract set(key: string, value: any, ttl?: number): Promise<boolean>;
  abstract delete(key: string): Promise<boolean>;
  abstract clear(): Promise<void>;
  abstract getStats(): Promise<CacheMetrics>;

  protected recordHit(): void {
    this.metrics.hits++;
    this.metrics.totalRequests++;
    this.updateHitRate();
  }

  protected recordMiss(): void {
    this.metrics.misses++;
    this.metrics.totalRequests++;
    this.updateHitRate();
  }

  protected recordEviction(): void {
    this.metrics.evictions++;
  }

  private updateHitRate(): void {
    this.metrics.hitRate = this.metrics.totalRequests > 0
      ? this.metrics.hits / this.metrics.totalRequests
      : 0;
  }

  async shouldEvict(): Promise<boolean> {
    return false; // Override in subclasses
  }

  async optimizeStorage(): Promise<void> {
    // Override in subclasses for specific optimization strategies
  }
}

export class LRUCacheStrategy extends CacheStrategy {
  private accessOrder: Map<string, number> = new Map();
  private accessCounter = 0;

  async get(key: string): Promise<any> {
    this.accessOrder.set(key, ++this.accessCounter);
    this.recordHit();
    return null; // Implementation specific to cache layer
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    this.accessOrder.set(key, ++this.accessCounter);

    if (this.config.maxSize && this.accessOrder.size > this.config.maxSize) {
      await this.evictLRU();
    }

    return true;
  }

  async delete(key: string): Promise<boolean> {
    this.accessOrder.delete(key);
    return true;
  }

  async clear(): Promise<void> {
    this.accessOrder.clear();
  }

  async getStats(): Promise<CacheMetrics> {
    return { ...this.metrics };
  }

  private async evictLRU(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.accessOrder.delete(oldestKey);
      this.recordEviction();
      this.logger.debug(`Evicted LRU key: ${oldestKey}`);
    }
  }
}

export class TTLCacheStrategy extends CacheStrategy {
  private expiryTimes: Map<string, number> = new Map();

  async get(key: string): Promise<any> {
    const expiry = this.expiryTimes.get(key);

    if (expiry && Date.now() > expiry) {
      this.expiryTimes.delete(key);
      this.recordMiss();
      return null;
    }

    this.recordHit();
    return null; // Implementation specific to cache layer
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const expiryTime = Date.now() + ((ttl || this.config.ttl || 300) * 1000);
    this.expiryTimes.set(key, expiryTime);
    return true;
  }

  async delete(key: string): Promise<boolean> {
    this.expiryTimes.delete(key);
    return true;
  }

  async clear(): Promise<void> {
    this.expiryTimes.clear();
  }

  async getStats(): Promise<CacheMetrics> {
    return { ...this.metrics };
  }

  async cleanupExpired(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, expiry] of this.expiryTimes.entries()) {
      if (now > expiry) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.expiryTimes.delete(key);
      this.recordEviction();
    }

    if (expiredKeys.length > 0) {
      this.logger.debug(`Cleaned up ${expiredKeys.length} expired keys`);
    }
  }
}