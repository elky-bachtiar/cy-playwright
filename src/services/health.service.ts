import { Logger } from '../utils/logger';
import { DatabaseManager } from '../database/connection';
import { RedisClient } from '../cache/redis-client';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: ServiceHealth[];
  uptime: number;
  version: string;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  details?: Record<string, any>;
  error?: string;
}

export interface DetailedHealthStatus extends HealthStatus {
  system: SystemHealth;
  dependencies: DependencyHealth[];
}

export interface SystemHealth {
  memory: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  disk: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
}

export interface DependencyHealth {
  name: string;
  type: 'database' | 'cache' | 'external_api' | 'file_system';
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  details: Record<string, any>;
}

export class HealthService {
  private logger = new Logger('HealthService');
  private startTime = Date.now();

  constructor(
    private databaseManager?: DatabaseManager,
    private redisClient?: RedisClient
  ) {}

  async getHealth(): Promise<HealthStatus> {
    const services = await this.checkAllServices();
    const overallStatus = this.determineOverallStatus(services);

    return {
      status: overallStatus,
      timestamp: new Date(),
      services,
      uptime: this.getUptime(),
      version: this.getVersion()
    };
  }

  async getDetailedHealth(): Promise<DetailedHealthStatus> {
    const basicHealth = await this.getHealth();
    const systemHealth = await this.getSystemHealth();
    const dependencies = await this.checkDependencies();

    return {
      ...basicHealth,
      system: systemHealth,
      dependencies
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.getHealth();
      return health.status === 'healthy';
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return false;
    }
  }

  async getUptime(): Promise<number> {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  private async checkAllServices(): Promise<ServiceHealth[]> {
    const services: ServiceHealth[] = [];

    // Check database
    if (this.databaseManager) {
      services.push(await this.checkDatabase());
    }

    // Check Redis cache
    if (this.redisClient) {
      services.push(await this.checkRedis());
    }

    // Check file system
    services.push(await this.checkFileSystem());

    // Check memory
    services.push(await this.checkMemory());

    return services;
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      if (!this.databaseManager) {
        return {
          name: 'database',
          status: 'unhealthy',
          error: 'Database manager not initialized'
        };
      }

      const isConnected = await this.databaseManager.isConnected();
      const connectionInfo = await this.databaseManager.getConnectionInfo();
      const responseTime = Date.now() - startTime;

      return {
        name: 'database',
        status: isConnected ? 'healthy' : 'unhealthy',
        responseTime,
        details: {
          connected: isConnected,
          ...connectionInfo
        }
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('Database health check failed:', error);

      return {
        name: 'database',
        status: 'unhealthy',
        responseTime,
        error: error.message
      };
    }
  }

  private async checkRedis(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      if (!this.redisClient) {
        return {
          name: 'redis',
          status: 'unhealthy',
          error: 'Redis client not initialized'
        };
      }

      const isHealthy = await this.redisClient.isHealthy();
      const stats = this.redisClient.getStats();
      const responseTime = Date.now() - startTime;

      return {
        name: 'redis',
        status: isHealthy ? 'healthy' : 'unhealthy',
        responseTime,
        details: stats
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('Redis health check failed:', error);

      return {
        name: 'redis',
        status: 'unhealthy',
        responseTime,
        error: error.message
      };
    }
  }

  private async checkFileSystem(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      const fs = await import('fs-extra');
      const path = await import('path');

      const tempDir = path.join(process.cwd(), 'tmp');
      await fs.ensureDir(tempDir);

      const testFile = path.join(tempDir, 'health-check.txt');
      await fs.writeFile(testFile, 'health check');
      await fs.readFile(testFile);
      await fs.remove(testFile);

      const responseTime = Date.now() - startTime;

      return {
        name: 'file_system',
        status: 'healthy',
        responseTime,
        details: {
          tempDir,
          writable: true,
          readable: true
        }
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('File system health check failed:', error);

      return {
        name: 'file_system',
        status: 'unhealthy',
        responseTime,
        error: error.message
      };
    }
  }

  private async checkMemory(): Promise<ServiceHealth> {
    try {
      const memoryUsage = process.memoryUsage();
      const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
      const usedMemory = memoryUsage.heapUsed;
      const memoryPercentage = (usedMemory / totalMemory) * 100;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (memoryPercentage > 90) {
        status = 'unhealthy';
      } else if (memoryPercentage > 80) {
        status = 'degraded';
      }

      return {
        name: 'memory',
        status,
        details: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          percentage: memoryPercentage
        }
      };
    } catch (error) {
      this.logger.error('Memory health check failed:', error);

      return {
        name: 'memory',
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  private async getSystemHealth(): Promise<SystemHealth> {
    const os = await import('os');
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
      memory: {
        used: usedMemory,
        free: freeMemory,
        total: totalMemory,
        percentage: (usedMemory / totalMemory) * 100
      },
      cpu: {
        usage: 0, // Would need external library to get real CPU usage
        loadAverage: os.loadavg()
      },
      disk: {
        used: 0, // Would need external library to get disk usage
        free: 0,
        total: 0,
        percentage: 0
      }
    };
  }

  private async checkDependencies(): Promise<DependencyHealth[]> {
    const dependencies: DependencyHealth[] = [];

    if (this.databaseManager) {
      const dbHealth = await this.checkDatabase();
      dependencies.push({
        name: 'database',
        type: 'database',
        status: dbHealth.status,
        responseTime: dbHealth.responseTime || 0,
        details: dbHealth.details || {}
      });
    }

    if (this.redisClient) {
      const redisHealth = await this.checkRedis();
      dependencies.push({
        name: 'redis',
        type: 'cache',
        status: redisHealth.status,
        responseTime: redisHealth.responseTime || 0,
        details: redisHealth.details || {}
      });
    }

    return dependencies;
  }

  private determineOverallStatus(services: ServiceHealth[]): 'healthy' | 'degraded' | 'unhealthy' {
    const unhealthyServices = services.filter(s => s.status === 'unhealthy');
    const degradedServices = services.filter(s => s.status === 'degraded');

    if (unhealthyServices.length > 0) {
      return 'unhealthy';
    }

    if (degradedServices.length > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  private getVersion(): string {
    try {
      const packageJson = require('../../package.json');
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  // Missing API methods for routes
  async getBasicHealth(): Promise<HealthStatus> {
    return this.getHealth();
  }

  async getReadiness(): Promise<{ ready: boolean; status: string; checks: ServiceHealth[] }> {
    const health = await this.getHealth();
    return {
      ready: health.status === 'healthy',
      status: health.status,
      checks: health.services
    };
  }

  async getLiveness(): Promise<{ alive: boolean; uptime: number }> {
    return {
      alive: true,
      uptime: this.getUptime()
    };
  }
}