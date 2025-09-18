import request from 'supertest';
import { app } from '../../src/api/app';
import { ConversionService } from '../../src/services/conversion.service';
import { RepositoryService } from '../../src/services/repository.service';
import fs from 'fs-extra';
import path from 'path';

jest.mock('../../src/services/conversion.service');
jest.mock('../../src/services/repository.service');
jest.mock('fs-extra');

const mockConversionService = ConversionService as jest.MockedClass<typeof ConversionService>;
const mockRepositoryService = RepositoryService as jest.MockedClass<typeof RepositoryService>;
const mockFs = fs as jest.Mocked<typeof fs>;

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
        valid: true,
        cypressVersion: '12.0.0',
        testFiles: ['cypress/e2e/test1.cy.js'],
        configFiles: ['cypress.config.js']
      };

      mockRepositoryService.prototype.validateRepository.mockResolvedValue(mockValidation);
      mockConversionService.prototype.startConversion.mockResolvedValue({
        jobId: mockJobId,
        status: 'started',
        estimatedDuration: 30000
      });

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
        valid: false,
        reason: 'Not a Cypress project',
        suggestions: ['Install Cypress dependencies', 'Add cypress.config.js']
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
        valid: true,
        cypressVersion: '12.0.0',
        testFiles: ['cypress/e2e/test1.cy.js']
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
        jobId: mockJobId,
        status: 'processing',
        progress: 45,
        currentStep: 'Converting test files',
        filesProcessed: 3,
        totalFiles: 8,
        startTime: '2025-01-01T00:00:00Z',
        estimatedCompletion: '2025-01-01T00:01:30Z'
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
        jobId: mockJobId,
        status: 'completed',
        progress: 100,
        currentStep: 'Completed',
        filesProcessed: 8,
        totalFiles: 8,
        startTime: '2025-01-01T00:00:00Z',
        completionTime: '2025-01-01T00:02:00Z',
        downloadUrl: `/api/convert/${mockJobId}/download`,
        validationResults: {
          testsConverted: 15,
          warningsCount: 2,
          errorsCount: 0
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
        jobId: mockJobId,
        status: 'failed',
        progress: 30,
        currentStep: 'Converting test files',
        filesProcessed: 2,
        totalFiles: 8,
        startTime: '2025-01-01T00:00:00Z',
        failureTime: '2025-01-01T00:01:00Z',
        error: 'Failed to parse AST for file: complex-test.cy.js',
        errorCode: 'AST_PARSE_ERROR'
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
        jobId: mockJobId,
        status: 'completed'
      });

      mockConversionService.prototype.getDownloadPath.mockResolvedValue(mockZipPath);
      mockFs.readFile.mockResolvedValue(mockZipBuffer);

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
        jobId: mockJobId,
        status: 'processing'
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
        jobId: mockJobId,
        status: 'completed'
      });

      mockConversionService.prototype.getDownloadPath.mockResolvedValue('/path/to/missing.zip');
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

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
        jobId: mockJobId,
        status: 'processing'
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
        jobId: mockJobId,
        status: 'completed'
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
        valid: true,
        cypressVersion: '12.0.0',
        testFiles: ['cypress/e2e/test1.cy.js', 'cypress/e2e/test2.cy.js'],
        configFiles: ['cypress.config.js'],
        supportFiles: ['cypress/support/e2e.js'],
        customCommands: [
          { name: 'login', file: 'cypress/support/commands.js', lineNumber: 10 }
        ],
        estimatedConversionTime: 45000,
        complexity: 'medium',
        potentialIssues: [
          {
            type: 'warning',
            message: 'Custom commands detected - may require manual review',
            files: ['cypress/support/commands.js']
          }
        ]
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