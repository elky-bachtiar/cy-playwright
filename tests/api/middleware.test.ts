import request from 'supertest';
import { app } from '../../src/api/app';
import { RateLimiter } from '../../src/middleware/rate-limiter';
import { ValidationMiddleware } from '../../src/middleware/validation';

jest.mock('../../src/middleware/rate-limiter');
jest.mock('../../src/services/conversion.service');

describe('API Middleware', () => {
  describe('Rate Limiting', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should allow requests under rate limit', async () => {
      const mockRateLimiter = RateLimiter as jest.MockedClass<typeof RateLimiter>;
      mockRateLimiter.prototype.checkLimit.mockResolvedValue({
        allowed: true,
        info: {
          limit: 10,
          current: 1,
          remaining: 9,
          resetTime: new Date(Date.now() + 60000)
        }
      });

      const response = await request(app)
        .post('/api/convert/validate')
        .send({ repositoryUrl: 'https://github.com/user/cypress-project' });

      expect(response.status).not.toBe(429);
      expect(response.headers['x-ratelimit-remaining']).toBe('9');
    });

    it('should block requests over rate limit', async () => {
      const mockRateLimiter = RateLimiter as jest.MockedClass<typeof RateLimiter>;
      mockRateLimiter.prototype.checkLimit.mockResolvedValue({
        allowed: false,
        info: {
          limit: 10,
          current: 11,
          remaining: 0,
          resetTime: new Date(Date.now() + 60000)
        }
      });

      const response = await request(app)
        .post('/api/convert/validate')
        .send({ repositoryUrl: 'https://github.com/user/cypress-project' })
        .expect(429);

      expect(response.body).toEqual({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 60
      });
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
    });

    it('should handle rate limiter errors gracefully', async () => {
      const mockRateLimiter = RateLimiter as jest.MockedClass<typeof RateLimiter>;
      mockRateLimiter.prototype.checkLimit.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app)
        .post('/api/convert/validate')
        .send({ repositoryUrl: 'https://github.com/user/cypress-project' });

      // Should allow request when rate limiter fails (fail open)
      expect(response.status).not.toBe(429);
    });
  });

  describe('Request Validation', () => {
    it('should validate required fields in conversion request', async () => {
      const response = await request(app)
        .post('/api/convert')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        error: 'Repository URL is required',
        code: 'MISSING_REPOSITORY_URL'
      });
    });

    it('should validate GitHub URL format', async () => {
      const invalidUrls = [
        'not-a-url',
        'http://example.com',
        'https://gitlab.com/user/repo',
        'ftp://github.com/user/repo'
      ];

      for (const url of invalidUrls) {
        const response = await request(app)
          .post('/api/convert')
          .send({ repositoryUrl: url })
          .expect(400);

        expect(response.body.code).toBe('INVALID_REPOSITORY_URL');
      }
    });

    it('should accept valid GitHub URLs', async () => {
      const validUrls = [
        'https://github.com/user/repo',
        'https://github.com/organization/project-name',
        'https://github.com/user/repo.git',
        'git@github.com:user/repo.git'
      ];

      // Mock services to avoid actual API calls
      jest.doMock('../../src/services/repository.service', () => ({
        RepositoryService: jest.fn().mockImplementation(() => ({
          validateRepository: jest.fn().mockResolvedValue({ valid: true })
        }))
      }));

      jest.doMock('../../src/services/conversion.service', () => ({
        ConversionService: jest.fn().mockImplementation(() => ({
          startConversion: jest.fn().mockResolvedValue({ jobId: 'test-job', status: 'started' })
        }))
      }));

      for (const url of validUrls) {
        const response = await request(app)
          .post('/api/convert')
          .send({ repositoryUrl: url, outputPath: './test' });

        expect(response.status).not.toBe(400);
      }
    });

    it('should validate conversion options', async () => {
      const invalidOptions = {
        repositoryUrl: 'https://github.com/user/repo',
        outputPath: './test',
        options: {
          preserveStructure: 'invalid', // should be boolean
          generateTypes: 'yes', // should be boolean
          optimizeSelectors: 1 // should be boolean
        }
      };

      const response = await request(app)
        .post('/api/convert')
        .send(invalidOptions)
        .expect(400);

      expect(response.body.code).toBe('INVALID_OPTIONS');
    });

    it('should validate job ID format', async () => {
      const invalidJobIds = [
        'invalid-chars-!@#',
        'toolong' + 'x'.repeat(100),
        '',
        '   ',
        'job-with-spaces '
      ];

      for (const jobId of invalidJobIds) {
        const response = await request(app)
          .get(`/api/convert/${jobId}/status`)
          .expect(400);

        expect(response.body.code).toBe('INVALID_JOB_ID');
      }
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in responses', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
    });

    it('should handle OPTIONS requests', async () => {
      const response = await request(app)
        .options('/api/convert')
        .expect(200);

      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });
  });

  describe('Error Handling', () => {
    it('should return structured error responses', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Endpoint not found',
        code: 'ENDPOINT_NOT_FOUND',
        path: '/api/nonexistent'
      });
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/convert')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.code).toBe('INVALID_JSON');
    });

    it('should include request ID in responses', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(/^req-[a-f0-9-]+$/);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('should not expose server information', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['server']).toBeUndefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });
});