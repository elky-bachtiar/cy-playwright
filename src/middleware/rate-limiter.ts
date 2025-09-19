import { Logger } from '../utils/logger';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string; // Function to generate key for tracking
  onLimitReached?: (req: any, res: any) => void;
  message?: string;
  headers?: boolean; // Include rate limit headers in response
}

export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
}

export interface RateLimitStore {
  get(key: string): Promise<RateLimitInfo | null>;
  set(key: string, info: RateLimitInfo): Promise<void>;
  increment(key: string): Promise<RateLimitInfo>;
  reset(key: string): Promise<void>;
}

class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitInfo>();
  private logger = new Logger('MemoryRateLimitStore');

  async get(key: string): Promise<RateLimitInfo | null> {
    const info = this.store.get(key);
    if (!info) return null;

    // Check if window has expired
    if (Date.now() > info.resetTime.getTime()) {
      this.store.delete(key);
      return null;
    }

    return info;
  }

  async set(key: string, info: RateLimitInfo): Promise<void> {
    this.store.set(key, info);
  }

  async increment(key: string): Promise<RateLimitInfo> {
    const existing = await this.get(key);

    if (!existing) {
      // Create new entry
      const info: RateLimitInfo = {
        limit: 0, // Will be set by rate limiter
        current: 1,
        remaining: 0, // Will be calculated by rate limiter
        resetTime: new Date(Date.now() + 60000) // Default 1 minute window
      };
      await this.set(key, info);
      return info;
    }

    // Increment existing
    existing.current++;
    existing.remaining = Math.max(0, existing.limit - existing.current);
    await this.set(key, existing);

    return existing;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, info] of this.store.entries()) {
      if (now > info.resetTime.getTime()) {
        this.store.delete(key);
      }
    }
  }
}

export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private store: RateLimitStore;
  private logger = new Logger('RateLimiter');
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: RateLimitConfig, store?: RateLimitStore) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      skipSuccessfulRequests: config.skipSuccessfulRequests ?? false,
      skipFailedRequests: config.skipFailedRequests ?? false,
      keyGenerator: config.keyGenerator ?? this.defaultKeyGenerator,
      onLimitReached: config.onLimitReached ?? this.defaultOnLimitReached,
      message: config.message ?? 'Too many requests, please try again later',
      headers: config.headers ?? true
    };

    this.store = store || new MemoryRateLimitStore();

    // Start cleanup interval for memory store
    if (this.store instanceof MemoryRateLimitStore) {
      this.cleanupInterval = setInterval(() => {
        (this.store as MemoryRateLimitStore).cleanup();
      }, this.config.windowMs);
    }
  }

  async checkLimit(req: any): Promise<{ allowed: boolean; info: RateLimitInfo }> {
    const key = this.config.keyGenerator(req);
    const info = await this.store.increment(key);

    // Set limit and reset time if this is a new entry
    if (info.current === 1) {
      info.limit = this.config.maxRequests;
      info.resetTime = new Date(Date.now() + this.config.windowMs);
      info.remaining = info.limit - info.current;
      await this.store.set(key, info);
    }

    const allowed = info.current <= this.config.maxRequests;

    this.logger.debug(`Rate limit check for key ${key}`, {
      current: info.current,
      limit: info.limit,
      allowed
    });

    return { allowed, info };
  }

  middleware() {
    return async (req: any, res: any, next: any) => {
      try {
        const { allowed, info } = await this.checkLimit(req);

        // Add headers if enabled
        if (this.config.headers) {
          this.addHeaders(res, info);
        }

        if (!allowed) {
          this.logger.warn(`Rate limit exceeded for ${this.config.keyGenerator(req)}`, {
            current: info.current,
            limit: info.limit
          });

          this.config.onLimitReached(req, res);
          return;
        }

        // Store info for potential cleanup after response
        req.rateLimitInfo = info;
        next();

      } catch (error) {
        this.logger.error('Rate limiter error:', error);
        next(); // Continue on error to avoid breaking the application
      }
    };
  }

  async resetKey(key: string): Promise<void> {
    await this.store.reset(key);
    this.logger.info(`Reset rate limit for key: ${key}`);
  }

  async getStatus(key: string): Promise<RateLimitInfo | null> {
    return await this.store.get(key);
  }

  async getAllStatus(): Promise<Record<string, RateLimitInfo>> {
    // This would need to be implemented based on the store type
    // For now, return empty object
    return {};
  }

  private defaultKeyGenerator(req: any): string {
    // Default to IP address
    return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
  }

  private defaultOnLimitReached(req: any, res: any): void {
    res.status(429).json({
      error: 'Too Many Requests',
      message: this.config.message,
      retryAfter: Math.ceil(this.config.windowMs / 1000)
    });
  }

  private addHeaders(res: any, info: RateLimitInfo): void {
    res.set({
      'X-RateLimit-Limit': info.limit.toString(),
      'X-RateLimit-Remaining': info.remaining.toString(),
      'X-RateLimit-Reset': new Date(info.resetTime).toISOString(),
      'Retry-After': Math.ceil((info.resetTime.getTime() - Date.now()) / 1000).toString()
    });
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Pre-configured rate limiters for common use cases
export class APIRateLimiter extends RateLimiter {
  constructor(maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) { // 15 minutes
    super({
      windowMs,
      maxRequests,
      message: 'API rate limit exceeded. Please try again later.',
      headers: true
    });
  }
}

export class ConversionRateLimiter extends RateLimiter {
  constructor(maxRequests: number = 5, windowMs: number = 60 * 60 * 1000) { // 1 hour
    super({
      windowMs,
      maxRequests,
      message: 'Conversion rate limit exceeded. Please wait before starting another conversion.',
      headers: true,
      keyGenerator: (req) => {
        // Rate limit by user or IP for conversions
        return req.user?.id || req.ip || 'anonymous';
      }
    });
  }
}

export class DownloadRateLimiter extends RateLimiter {
  constructor(maxRequests: number = 20, windowMs: number = 60 * 1000) { // 1 minute
    super({
      windowMs,
      maxRequests,
      message: 'Download rate limit exceeded. Please wait before downloading again.',
      headers: true
    });
  }
}

// Health check and statistics
export interface RateLimiterStats {
  totalRequests: number;
  blockedRequests: number;
  activeKeys: number;
  hitRate: number;
  averageRequestsPerWindow: number;
}

export class RateLimiterMonitor {
  private stats: RateLimiterStats = {
    totalRequests: 0,
    blockedRequests: 0,
    activeKeys: 0,
    hitRate: 0,
    averageRequestsPerWindow: 0
  };

  private logger = new Logger('RateLimiterMonitor');

  recordRequest(allowed: boolean): void {
    this.stats.totalRequests++;
    if (!allowed) {
      this.stats.blockedRequests++;
    }
    this.updateHitRate();
  }

  updateActiveKeys(count: number): void {
    this.stats.activeKeys = count;
  }

  getStats(): RateLimiterStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      activeKeys: 0,
      hitRate: 0,
      averageRequestsPerWindow: 0
    };
  }

  private updateHitRate(): void {
    if (this.stats.totalRequests > 0) {
      this.stats.hitRate = (this.stats.blockedRequests / this.stats.totalRequests) * 100;
    }
  }

  logStats(): void {
    this.logger.info('Rate limiter statistics', this.stats);
  }
}

// Factory functions for easy setup
export function createAPIRateLimiter(options?: Partial<RateLimitConfig>): RateLimiter {
  return new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    message: 'API rate limit exceeded',
    headers: true,
    ...options
  });
}

export function createConversionRateLimiter(options?: Partial<RateLimitConfig>): RateLimiter {
  return new RateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5,
    message: 'Conversion rate limit exceeded',
    headers: true,
    keyGenerator: (req) => req.user?.id || req.ip || 'anonymous',
    ...options
  });
}

export function createDownloadRateLimiter(options?: Partial<RateLimitConfig>): RateLimiter {
  return new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    message: 'Download rate limit exceeded',
    headers: true,
    ...options
  });
}