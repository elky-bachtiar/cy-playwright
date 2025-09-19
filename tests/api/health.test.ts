import request from 'supertest';
import { app } from '../../src/api/app';
import { DatabaseManager } from '../../src/database/connection';
import { RedisClient } from '../../src/cache/redis-client';

jest.mock('../../src/database/connection');
jest.mock('../../src/cache/redis-client');

const mockDatabase = DatabaseManager as jest.MockedClass<typeof DatabaseManager>;
const mockRedis = RedisClient as jest.MockedClass<typeof RedisClient>;

describe('Health Check API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return healthy status when all services are operational', async () => {
      mockDatabase.prototype.isConnected.mockReturnValue(true);
      mockRedis.prototype.isConnected.mockReturnValue(true);

      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        services: {
          database: { status: 'healthy' },
          redis: { status: 'healthy' },
          fileSystem: { status: 'healthy' }
        }
      });
    });

    it('should return degraded status when database is down', async () => {
      mockDatabase.prototype.isConnected.mockReturnValue(false);
      mockRedis.prototype.isConnected.mockReturnValue(true);

      const response = await request(app)
        .get('/api/health')
        .expect(503);

      expect(response.body).toEqual({
        status: 'degraded',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        services: {
          database: { status: 'unhealthy', error: 'Database connection lost' },
          redis: { status: 'healthy' },
          fileSystem: { status: 'healthy' }
        }
      });
    });

    it('should return degraded status when Redis is down', async () => {
      mockDatabase.prototype.isConnected.mockReturnValue(true);
      mockRedis.prototype.isConnected.mockReturnValue(false);

      const response = await request(app)
        .get('/api/health')
        .expect(503);

      expect(response.body).toEqual({
        status: 'degraded',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        services: {
          database: { status: 'healthy' },
          redis: { status: 'unhealthy', error: 'Redis connection lost' },
          fileSystem: { status: 'healthy' }
        }
      });
    });

    it('should return unhealthy status when multiple services are down', async () => {
      mockDatabase.prototype.isConnected.mockReturnValue(false);
      mockRedis.prototype.isConnected.mockReturnValue(false);

      const response = await request(app)
        .get('/api/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.database.status).toBe('unhealthy');
      expect(response.body.services.redis.status).toBe('unhealthy');
    });
  });

  describe('GET /api/health/detailed', () => {
    it('should return detailed health information', async () => {
      mockDatabase.prototype.isConnected.mockReturnValue(true);
      mockDatabase.prototype.getConnectionInfo.mockReturnValue({
        host: 'localhost',
        port: 27017,
        database: 'cy-playwright',
        collections: 5,
        connectionPool: { active: 3, available: 7 }
      });

      mockRedis.prototype.isConnected.mockReturnValue(true);
      mockRedis.prototype.getConnectionInfo.mockReturnValue({
        host: 'localhost',
        port: 6379,
        database: 0,
        memory: { used: '2.5MB', peak: '3.1MB' },
        keyspace: { keys: 150, expires: 45 }
      });

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        nodeVersion: expect.any(String),
        memoryUsage: {
          rss: expect.any(Number),
          heapTotal: expect.any(Number),
          heapUsed: expect.any(Number),
          external: expect.any(Number)
        },
        services: {
          database: {
            status: 'healthy',
            details: {
              host: 'localhost',
              port: 27017,
              database: 'cy-playwright',
              collections: 5,
              connectionPool: { active: 3, available: 7 }
            }
          },
          redis: {
            status: 'healthy',
            details: {
              host: 'localhost',
              port: 6379,
              database: 0,
              memory: { used: '2.5MB', peak: '3.1MB' },
              keyspace: { keys: 150, expires: 45 }
            }
          },
          fileSystem: {
            status: 'healthy',
            details: {
              tempDirectory: expect.any(String),
              freeSpace: expect.any(String),
              permissions: 'read-write'
            }
          }
        },
        metrics: {
          activeJobs: expect.any(Number),
          completedJobs: expect.any(Number),
          failedJobs: expect.any(Number),
          averageProcessingTime: expect.any(Number)
        }
      });
    });
  });

  describe('GET /api/health/readiness', () => {
    it('should return ready when all critical services are available', async () => {
      mockDatabase.prototype.isConnected.mockReturnValue(true);
      mockRedis.prototype.isConnected.mockReturnValue(true);

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ready',
        timestamp: expect.any(String),
        checks: {
          database: { status: 'pass' },
          redis: { status: 'pass' },
          fileSystem: { status: 'pass' }
        }
      });
    });

    it('should return not ready when critical services are unavailable', async () => {
      mockDatabase.prototype.isConnected.mockReturnValue(false);
      mockRedis.prototype.isConnected.mockReturnValue(true);

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(503);

      expect(response.body).toEqual({
        status: 'not ready',
        timestamp: expect.any(String),
        checks: {
          database: { status: 'fail', error: 'Database connection lost' },
          redis: { status: 'pass' },
          fileSystem: { status: 'pass' }
        }
      });
    });
  });

  describe('GET /api/health/liveness', () => {
    it('should return alive when application is responsive', async () => {
      const response = await request(app)
        .get('/api/health/liveness')
        .expect(200);

      expect(response.body).toEqual({
        status: 'alive',
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });

    it('should include process information', async () => {
      const response = await request(app)
        .get('/api/health/liveness')
        .expect(200);

      expect(response.body.process).toEqual({
        pid: expect.any(Number),
        version: expect.any(String),
        platform: expect.any(String),
        arch: expect.any(String)
      });
    });
  });

  describe('GET /api/metrics', () => {
    it('should return application metrics', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.body).toEqual({
        timestamp: expect.any(String),
        conversions: {
          total: expect.any(Number),
          successful: expect.any(Number),
          failed: expect.any(Number),
          inProgress: expect.any(Number),
          successRate: expect.any(Number)
        },
        performance: {
          averageConversionTime: expect.any(Number),
          medianConversionTime: expect.any(Number),
          p95ConversionTime: expect.any(Number),
          p99ConversionTime: expect.any(Number)
        },
        resources: {
          memoryUsage: expect.any(Number),
          cpuUsage: expect.any(Number),
          diskUsage: expect.any(Number),
          activeConnections: expect.any(Number)
        },
        queues: {
          conversionQueue: {
            waiting: expect.any(Number),
            active: expect.any(Number),
            completed: expect.any(Number),
            failed: expect.any(Number)
          }
        }
      });
    });

    it('should include historical data when requested', async () => {
      const response = await request(app)
        .get('/api/metrics?history=24h')
        .expect(200);

      expect(response.body.history).toBeDefined();
      expect(response.body.history.conversionsPerHour).toBeInstanceOf(Array);
      expect(response.body.history.averageResponseTime).toBeInstanceOf(Array);
    });
  });
});