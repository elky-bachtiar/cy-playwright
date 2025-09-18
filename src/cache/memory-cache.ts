import { Logger } from '../utils/logger';

export interface MemoryConfig {
  maxSize: number;
  ttl?: number;
  maxMemoryMB?: number;
  checkPeriod?: number;
}

interface CacheItem {
  value: any;
  expiry: number;
  lastAccessed: number;
  size: number;
}

export class MemoryCache {
  private logger = new Logger('MemoryCache');
  private cache: Map<string, CacheItem> = new Map();
  private config: MemoryConfig;
  private cleanupInterval?: NodeJS.Timeout;
  private totalSize = 0;

  async initialize(config: MemoryConfig): Promise<void> {
    this.logger.info('Initializing memory cache');
    this.config = config;

    // Start cleanup timer if check period is specified
    if (config.checkPeriod) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, config.checkPeriod);
    }

    this.logger.info('Memory cache initialized successfully');
  }

  async get(key: string): Promise<any> {
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.totalSize -= item.size;
      return null;
    }

    // Update last accessed time for LRU
    item.lastAccessed = Date.now();
    return item.value;
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const serialized = JSON.stringify(value);
    const itemSize = this.estimateSize(serialized);

    // Check memory limits
    if (this.config.maxMemoryMB) {
      const maxBytes = this.config.maxMemoryMB * 1024 * 1024;
      if (itemSize > maxBytes) {
        this.logger.warn('Item too large for memory cache', { key, size: itemSize });
        return false;
      }
    }

    const now = Date.now();
    const expiry = now + ((ttl || this.config.ttl || 300) * 1000);

    const item: CacheItem = {
      value,
      expiry,
      lastAccessed: now,
      size: itemSize
    };

    // Remove existing item if present
    const existing = this.cache.get(key);
    if (existing) {
      this.totalSize -= existing.size;
    }

    // Check if we need to evict items
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    // Check memory pressure
    if (this.config.maxMemoryMB) {
      const maxBytes = this.config.maxMemoryMB * 1024 * 1024;
      while (this.totalSize + itemSize > maxBytes && this.cache.size > 0) {
        this.evictLRU();
      }

      if (this.totalSize + itemSize > maxBytes) {
        return false; // Can't fit even after evictions
      }
    }

    this.cache.set(key, item);
    this.totalSize += itemSize;

    return true;
  }

  async delete(key: string): Promise<boolean> {
    const item = this.cache.get(key);
    if (item) {
      this.cache.delete(key);
      this.totalSize -= item.size;
      return true;
    }
    return false;
  }

  async getKeyCount(): Promise<number> {
    return this.cache.size;
  }

  async getMemoryStats(): Promise<any> {
    return {
      itemCount: this.cache.size,
      memoryUsageBytes: this.totalSize,
      memoryUsageMB: this.totalSize / (1024 * 1024),
      maxSize: this.config.maxSize
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down memory cache');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cache.clear();
    this.totalSize = 0;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
        this.totalSize -= item.size;
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired items`);
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const item = this.cache.get(oldestKey);
      if (item) {
        this.cache.delete(oldestKey);
        this.totalSize -= item.size;
        this.logger.debug(`Evicted LRU item: ${oldestKey}`);
      }
    }
  }

  private estimateSize(serialized: string): number {
    // Rough estimation: each character is ~2 bytes in memory + object overhead
    return serialized.length * 2 + 64;
  }
}