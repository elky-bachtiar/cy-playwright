import request from 'supertest';
import { app } from '../../src/api/app';
import { ConversionService } from '../../src/services/conversion.service';
import { RepositoryService } from '../../src/services/repository.service';
import fs from 'fs-extra';
import path from 'path';

jest.mock('../../src/services/conversion.service');
jest.mock('../../src/services/repository.service');
jest.mock('fs-extra');

// Create explicit mocks to avoid type inference issues
const mockConversionService = {
  prototype: {
    startConversion: jest.fn(),
    getConversionStatus: jest.fn(),
    cancelConversion: jest.fn(),
    getConversionResult: jest.fn()
  }
};

const mockRepositoryService = {
  prototype: {
    validateRepository: jest.fn()
  }
};

const mockFs = {
  readFile: jest.fn()
};

// Apply the mocks
Object.assign(ConversionService, mockConversionService);
Object.assign(RepositoryService, mockRepositoryService);
Object.assign(fs, mockFs);

describe('Conversion API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/convert', () => {
    const validConversionRequest = {
      repositoryUrl: 'https://github.com/user/cypress-project',
      outputPath: './converted-project',
      options: {
        preserveStructure: true,
        generateTypes: true,
        optimizeSelectors: true
      }
    };

    it('should successfully initiate conversion for valid repository', async () => {
      const mockJobId = 'job-123';
      const mockValidation = {
        isValid: true,
        isCypressProject: true,
        isPlaywrightProject: false,
        hasValidStructure: true,
        issues: [],
        recommendations: [],
        projectInfo: {
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            'cypress': '12.0.0'
          },
          devDependencies: {}
        }
      };

      mockRepositoryService.prototype.validateRepository.mockResolvedValue(mockValidation);
      mockConversionService.prototype.startConversion.mockResolvedValue(mockJobId);

      const response = await request(app)
        .post('/api/convert')
        .send(validConversionRequest)
        .expect(202);

      expect(response.body).toEqual({
        jobId: mockJobId,
        status: 'started',
        message: 'Conversion initiated successfully',
        estimatedDuration: 30000
      });

      expect(mockRepositoryService.prototype.validateRepository).toHaveBeenCalledWith(
        validConversionRequest.repositoryUrl
      );
      expect(mockConversionService.prototype.startConversion).toHaveBeenCalledWith({
        repositoryUrl: validConversionRequest.repositoryUrl,
        outputPath: validConversionRequest.outputPath,
        options: validConversionRequest.options,
        validation: mockValidation
      });
    });

    it('should return 400 for missing repository URL', async () => {
      const invalidRequest = {
        outputPath: './converted-project'
      };

      const response = await request(app)
        .post('/api/convert')
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Repository URL is required',
        code: 'MISSING_REPOSITORY_URL'
      });
    });

    it('should return 400 for invalid repository URL format', async () => {
      const invalidRequest = {
        repositoryUrl: 'not-a-valid-url',
        outputPath: './converted-project'
      };

      const response = await request(app)
        .post('/api/convert')
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid repository URL format',
        code: 'INVALID_REPOSITORY_URL'
      });
    });

    it('should return 404 for non-existent repository', async () => {
      const nonExistentRequest = {
        repositoryUrl: 'https://github.com/user/non-existent',
        outputPath: './converted-project'
      };

      mockRepositoryService.prototype.validateRepository.mockRejectedValue(
        new Error('Repository not found')
      );

      const response = await request(app)
        .post('/api/convert')
        .send(nonExistentRequest)
        .expect(404);

      expect(response.body).toEqual({
        error: 'Repository not found or inaccessible',
        code: 'REPOSITORY_NOT_FOUND'
      });
    });

    it('should return 422 for non-Cypress repository', async () => {
      const nonCypressRequest = {
        repositoryUrl: 'https://github.com/user/react-project',
        outputPath: './converted-project'
      };

      mockRepositoryService.prototype.validateRepository.mockResolvedValue({
        isValid: false,
        isCypressProject: false,
        isPlaywrightProject: false,
        hasValidStructure: false,
        issues: ['Not a Cypress project'],
        recommendations: ['Install Cypress dependencies', 'Add cypress.config.js'],
        projectInfo: {
          name: 'react-project',
          version: '1.0.0',
          dependencies: {},
          devDependencies: {}
        }
      });

      const response = await request(app)
        .post('/api/convert')
        .send(nonCypressRequest)
        .expect(422);

      expect(response.body).toEqual({
        error: 'Repository is not a valid Cypress project',
        code: 'INVALID_CYPRESS_PROJECT',
        details: {
          reason: 'Not a Cypress project',
          suggestions: ['Install Cypress dependencies', 'Add cypress.config.js']
        }
      });
    });

    it('should return 429 for rate limit exceeded', async () => {
      const rateLimitRequest = {
        repositoryUrl: 'https://github.com/user/cypress-project',
        outputPath: './converted-project'
      };

      mockConversionService.prototype.startConversion.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      const response = await request(app)
        .post('/api/convert')
        .send(rateLimitRequest)
        .expect(429);

      expect(response.body).toEqual({
        error: 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 60
      });
    });

    it('should handle conversion service errors gracefully', async () => {
      mockRepositoryService.prototype.validateRepository.mockResolvedValue({
        isValid: true,
        isCypressProject: true,
        isPlaywrightProject: false,
        hasValidStructure: true,
        issues: [],
        recommendations: [],
        projectInfo: {
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            'cypress': '12.0.0'
          },
          devDependencies: {}
        }
      });

      mockConversionService.prototype.startConversion.mockRejectedValue(
        new Error('Internal conversion error')
      );

      const response = await request(app)
        .post('/api/convert')
        .send(validConversionRequest)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Internal server error during conversion initiation',
        code: 'CONVERSION_START_ERROR'
      });
    });
  });

  describe('GET /api/convert/:jobId/status', () => {
    const mockJobId = 'job-123';

    it('should return conversion status for valid job ID', async () => {
      const mockStatus = {
        id: mockJobId,
        status: 'in_progress' as const,
        repositoryUrl: 'https://github.com/user/cypress-project',
        progress: 45,
        startTime: new Date('2025-01-01T00:00:00Z'),
        outputPath: './converted-project'
      };

      mockConversionService.prototype.getConversionStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get(`/api/convert/${mockJobId}/status`)
        .expect(200);

      expect(response.body).toEqual(mockStatus);
    });

    it('should return 404 for non-existent job ID', async () => {
      const nonExistentJobId = 'job-999';

      mockConversionService.prototype.getConversionStatus.mockRejectedValue(
        new Error('Job not found')
      );

      const response = await request(app)
        .get(`/api/convert/${nonExistentJobId}/status`)
        .expect(404);

      expect(response.body).toEqual({
        error: 'Conversion job not found',
        code: 'JOB_NOT_FOUND'
      });
    });

    it('should return completed status with download link', async () => {
      const completedStatus = {
        id: mockJobId,
        status: 'completed' as const,
        repositoryUrl: 'https://github.com/user/cypress-project',
        progress: 100,
        startTime: new Date('2025-01-01T00:00:00Z'),
        endTime: new Date('2025-01-01T00:02:00Z'),
        outputPath: './converted-project',
        summary: {
          filesConverted: 8,
          testsConverted: 15,
          customCommandsConverted: 2,
          configurationsMigrated: 1,
          issuesFound: [],
          warnings: []
        }
      };

      mockConversionService.prototype.getConversionStatus.mockResolvedValue(completedStatus);

      const response = await request(app)
        .get(`/api/convert/${mockJobId}/status`)
        .expect(200);

      expect(response.body).toEqual(completedStatus);
    });

    it('should return failed status with error details', async () => {
      const failedStatus = {
        id: mockJobId,
        status: 'failed' as const,
        repositoryUrl: 'https://github.com/user/cypress-project',
        progress: 30,
        startTime: new Date('2025-01-01T00:00:00Z'),
        endTime: new Date('2025-01-01T00:01:00Z'),
        errorMessage: 'Failed to parse AST for file: complex-test.cy.js'
      };

      mockConversionService.prototype.getConversionStatus.mockResolvedValue(failedStatus);

      const response = await request(app)
        .get(`/api/convert/${mockJobId}/status`)
        .expect(200);

      expect(response.body).toEqual(failedStatus);
    });
  });

  describe('GET /api/convert/:jobId/download', () => {
    const mockJobId = 'job-123';

    it('should return download stream for completed conversion', async () => {
      const mockZipPath = '/tmp/conversions/job-123/converted-project.zip';
      const mockZipBuffer = Buffer.from('mock zip content');

      mockConversionService.prototype.getConversionStatus.mockResolvedValue({
        id: mockJobId,
        repositoryUrl: 'https://github.com/user/cypress-project',
        status: 'completed',
        progress: 100,
        startTime: new Date(),
        endTime: new Date()
      });

      mockConversionService.prototype.getConversionResult.mockResolvedValue(mockZipBuffer);

      const response = await request(app)
        .get(`/api/convert/${mockJobId}/download`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/zip');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="converted-project.zip"'
      );
      expect(response.body).toEqual(mockZipBuffer);
    });

    it('should return 404 for non-existent job', async () => {
      mockConversionService.prototype.getConversionStatus.mockRejectedValue(
        new Error('Job not found')
      );

      const response = await request(app)
        .get(`/api/convert/non-existent/download`)
        .expect(404);

      expect(response.body).toEqual({
        error: 'Conversion job not found',
        code: 'JOB_NOT_FOUND'
      });
    });

    it('should return 400 for incomplete conversion', async () => {
      mockConversionService.prototype.getConversionStatus.mockResolvedValue({
        id: mockJobId,
        repositoryUrl: 'https://github.com/user/cypress-project',
        status: 'in_progress',
        progress: 50,
        startTime: new Date()
      });

      const response = await request(app)
        .get(`/api/convert/${mockJobId}/download`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Conversion not yet completed',
        code: 'CONVERSION_INCOMPLETE'
      });
    });

    it('should return 500 for missing download file', async () => {
      mockConversionService.prototype.getConversionStatus.mockResolvedValue({
        id: mockJobId,
        repositoryUrl: 'https://github.com/user/cypress-project',
        status: 'completed',
        progress: 100,
        startTime: new Date(),
        endTime: new Date()
      });

      mockConversionService.prototype.getConversionResult.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/convert/${mockJobId}/download`)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Download file not available',
        code: 'DOWNLOAD_FILE_MISSING'
      });
    });
  });

  describe('DELETE /api/convert/:jobId', () => {
    const mockJobId = 'job-123';

    it('should successfully cancel ongoing conversion', async () => {
      mockConversionService.prototype.getConversionStatus.mockResolvedValue({
        id: mockJobId,
        repositoryUrl: 'https://github.com/user/cypress-project',
        status: 'in_progress',
        progress: 50,
        startTime: new Date()
      });

      mockConversionService.prototype.cancelConversion.mockResolvedValue(true);

      const response = await request(app)
        .delete(`/api/convert/${mockJobId}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Conversion cancelled successfully',
        jobId: mockJobId
      });
    });

    it('should return 404 for non-existent job', async () => {
      mockConversionService.prototype.getConversionStatus.mockRejectedValue(
        new Error('Job not found')
      );

      const response = await request(app)
        .delete(`/api/convert/non-existent`)
        .expect(404);

      expect(response.body).toEqual({
        error: 'Conversion job not found',
        code: 'JOB_NOT_FOUND'
      });
    });

    it('should return 400 for already completed job', async () => {
      mockConversionService.prototype.getConversionStatus.mockResolvedValue({
        id: mockJobId,
        status: 'completed',
        repositoryUrl: 'https://github.com/test/repo',
        progress: 100,
        startTime: new Date()
      });

      const response = await request(app)
        .delete(`/api/convert/${mockJobId}`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Cannot cancel completed conversion',
        code: 'CONVERSION_ALREADY_COMPLETED'
      });
    });
  });

  describe('POST /api/convert/validate', () => {
    it('should validate repository without starting conversion', async () => {
      const validateRequest = {
        repositoryUrl: 'https://github.com/user/cypress-project'
      };

      const mockValidation = {
        isValid: true,
        isCypressProject: true,
        isPlaywrightProject: false,
        hasValidStructure: true,
        issues: [],
        recommendations: ['Consider using semantic locators for better maintainability'],
        projectInfo: {
          name: 'cypress-project',
          version: '1.0.0',
          dependencies: { cypress: '12.0.0' },
          devDependencies: {}
        }
      };

      mockRepositoryService.prototype.validateRepository.mockResolvedValue(mockValidation);

      const response = await request(app)
        .post('/api/convert/validate')
        .send(validateRequest)
        .expect(200);

      expect(response.body).toEqual(mockValidation);
    });

    it('should return 400 for missing repository URL', async () => {
      const response = await request(app)
        .post('/api/convert/validate')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        error: 'Repository URL is required',
        code: 'MISSING_REPOSITORY_URL'
      });
    });
  });
});