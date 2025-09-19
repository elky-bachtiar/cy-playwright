import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import * as zlib from 'zlib';

export interface CompressionConfig {
  algorithm: 'gzip' | 'deflate' | 'br' | 'lz4';
  level?: number; // 1-9 for gzip/deflate, 1-11 for brotli
  threshold?: number; // Minimum size in bytes before compression
  enableCaching?: boolean;
  cacheSize?: number;
}

export interface CompressionStats {
  totalRequests: number;
  compressedRequests: number;
  totalBytesIn: number;
  totalBytesOut: number;
  compressionRatio: number;
  averageCompressionTime: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface CompressionResult {
  compressed: Buffer;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressionTime: number;
  algorithm: string;
  fromCache: boolean;
}

export class CompressionService extends EventEmitter {
  private logger = new Logger('CompressionService');
  private config: CompressionConfig;
  private cache: Map<string, Buffer> = new Map();
  private stats: CompressionStats = {
    totalRequests: 0,
    compressedRequests: 0,
    totalBytesIn: 0,
    totalBytesOut: 0,
    compressionRatio: 0,
    averageCompressionTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  };
  private compressionTimes: number[] = [];

  constructor(config: CompressionConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing compression service');
    this.logger.info(`Using ${this.config.algorithm} compression with level ${this.config.level || 'default'}`);
  }

  async compress(data: string | Buffer): Promise<CompressionResult> {
    const startTime = Date.now();
    const inputBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const originalSize = inputBuffer.length;

    this.stats.totalRequests++;
    this.stats.totalBytesIn += originalSize;

    // Check if data is below compression threshold
    if (originalSize < (this.config.threshold || 1024)) {
      return {
        compressed: inputBuffer,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
        compressionTime: 0,
        algorithm: 'none',
        fromCache: false
      };
    }

    // Check cache if enabled
    if (this.config.enableCaching) {
      const cacheKey = this.generateCacheKey(inputBuffer);
      const cached = this.cache.get(cacheKey);

      if (cached) {
        this.stats.cacheHits++;
        return {
          compressed: cached,
          originalSize,
          compressedSize: cached.length,
          compressionRatio: originalSize / cached.length,
          compressionTime: 0,
          algorithm: this.config.algorithm,
          fromCache: true
        };
      }

      this.stats.cacheMisses++;
    }

    // Perform compression
    let compressed: Buffer;

    try {
      compressed = await this.performCompression(inputBuffer);
    } catch (error) {
      this.logger.error('Compression failed', error);
      throw error;
    }

    const compressionTime = Date.now() - startTime;
    const compressedSize = compressed.length;
    const compressionRatio = originalSize / compressedSize;

    // Update stats
    this.stats.compressedRequests++;
    this.stats.totalBytesOut += compressedSize;
    this.compressionTimes.push(compressionTime);

    // Keep only last 100 compression times for average calculation
    if (this.compressionTimes.length > 100) {
      this.compressionTimes.shift();
    }

    this.stats.averageCompressionTime = this.compressionTimes.reduce((sum, time) => sum + time, 0) / this.compressionTimes.length;
    this.stats.compressionRatio = this.stats.totalBytesIn / this.stats.totalBytesOut;

    // Cache the result if enabled
    if (this.config.enableCaching && compressed.length < originalSize * 0.9) {
      this.addToCache(this.generateCacheKey(inputBuffer), compressed);
    }

    const result: CompressionResult = {
      compressed,
      originalSize,
      compressedSize,
      compressionRatio,
      compressionTime,
      algorithm: this.config.algorithm,
      fromCache: false
    };

    this.emit('compressionCompleted', result);
    return result;
  }

  async decompress(data: Buffer, algorithm?: string): Promise<Buffer> {
    const startTime = Date.now();
    const compressionAlgorithm = algorithm || this.config.algorithm;

    try {
      let decompressed: Buffer;

      switch (compressionAlgorithm) {
        case 'gzip':
          decompressed = await this.promisify(zlib.gunzip)(data);
          break;
        case 'deflate':
          decompressed = await this.promisify(zlib.inflate)(data);
          break;
        case 'br':
          decompressed = await this.promisify(zlib.brotliDecompress)(data);
          break;
        default:
          throw new Error(`Unsupported decompression algorithm: ${compressionAlgorithm}`);
      }

      const decompressionTime = Date.now() - startTime;
      this.logger.debug(`Decompression completed in ${decompressionTime}ms`);

      this.emit('decompressionCompleted', {
        originalSize: data.length,
        decompressedSize: decompressed.length,
        decompressionTime,
        algorithm: compressionAlgorithm
      });

      return decompressed;
    } catch (error) {
      this.logger.error('Decompression failed', error);
      throw error;
    }
  }

  async compressStream(inputStream: NodeJS.ReadableStream): Promise<NodeJS.ReadableStream> {
    let compressionStream: NodeJS.ReadWriteStream;

    switch (this.config.algorithm) {
      case 'gzip':
        compressionStream = zlib.createGzip({ level: this.config.level });
        break;
      case 'deflate':
        compressionStream = zlib.createDeflate({ level: this.config.level });
        break;
      case 'br':
        compressionStream = zlib.createBrotliCompress({
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: this.config.level || 6
          }
        });
        break;
      default:
        throw new Error(`Unsupported compression algorithm: ${this.config.algorithm}`);
    }

    return inputStream.pipe(compressionStream);
  }

  async getStats(): Promise<CompressionStats> {
    return { ...this.stats };
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
    this.logger.debug('Compression cache cleared');
  }

  async optimizeCache(): Promise<void> {
    const maxSize = this.config.cacheSize || 100;

    if (this.cache.size > maxSize) {
      // Simple LRU eviction - remove oldest entries
      const keys = Array.from(this.cache.keys());
      const toRemove = keys.slice(0, this.cache.size - maxSize);

      for (const key of toRemove) {
        this.cache.delete(key);
      }

      this.logger.debug(`Cache optimized: removed ${toRemove.length} entries`);
    }
  }

  private async performCompression(data: Buffer): Promise<Buffer> {
    switch (this.config.algorithm) {
      case 'gzip':
        return this.promisify<Buffer>(zlib.gzip)(data, { level: this.config.level });
      case 'deflate':
        return this.promisify<Buffer>(zlib.deflate)(data, { level: this.config.level });
      case 'br':
        return this.promisify<Buffer>(zlib.brotliCompress)(data, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: this.config.level || 6
          }
        });
      default:
        throw new Error(`Unsupported compression algorithm: ${this.config.algorithm}`);
    }
  }

  private promisify<T>(fn: Function): (data: Buffer, options?: any) => Promise<T> {
    return (data: Buffer, options?: any): Promise<T> => {
      return new Promise((resolve, reject) => {
        try {
          if (options) {
            fn(data, options, (error: Error | null, result: T) => {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            });
          } else {
            fn(data, (error: Error | null, result: T) => {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            });
          }
        } catch (error) {
          reject(error);
        }
      });
    };
  }

  private generateCacheKey(data: Buffer): string {
    // Simple hash function for cache key generation
    let hash = 0;
    for (let i = 0; i < Math.min(data.length, 1024); i++) {
      const char = data[i];
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${this.config.algorithm}-${hash}-${data.length}`;
  }

  private addToCache(key: string, data: Buffer): void {
    if (!this.config.enableCaching) return;

    this.cache.set(key, data);

    // Trigger cache optimization if needed
    if (this.cache.size > (this.config.cacheSize || 100) * 1.2) {
      this.optimizeCache();
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down compression service');
    this.clearCache();
    this.removeAllListeners();
  }

  getBestCompressionAlgorithm(data: Buffer): string {
    // Simple heuristic for algorithm selection
    if (data.length < 1024) {
      return 'none';
    }

    // Text-like data - brotli is often best
    const textLikeScore = this.calculateTextLikeScore(data);
    if (textLikeScore > 0.7) {
      return 'br';
    }

    // For binary data, gzip is usually reliable
    return 'gzip';
  }

  private calculateTextLikeScore(data: Buffer): number {
    const sample = data.slice(0, Math.min(1024, data.length));
    let textChars = 0;

    for (const byte of sample) {
      // ASCII printable characters and common whitespace
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        textChars++;
      }
    }

    return textChars / sample.length;
  }
}