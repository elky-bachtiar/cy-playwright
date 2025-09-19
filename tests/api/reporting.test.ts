import request from 'supertest';
import { app } from '../../src/api/app';
import { ReportingService } from '../../src/services/reporting.service';
import { ConversionService } from '../../src/services/conversion.service';
import fs from 'fs-extra';

jest.mock('../../src/services/reporting.service');
jest.mock('../../src/services/conversion.service');
jest.mock('fs-extra');

const mockReportingService = ReportingService as jest.MockedClass<typeof ReportingService>;
const mockConversionService = ConversionService as jest.MockedClass<typeof ConversionService>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Reporting API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/reports/conversion/:jobId', () => {
    const jobId = 'conversion-job-123';

    it('should generate detailed conversion report', async () => {
      const mockReport = {
        id: `report_${jobId}`,
        timestamp: new Date('2025-01-01T12:00:00Z'),
        projectInfo: {
          name: 'cypress-project',
          type: 'cypress' as const,
          language: 'javascript' as const,
          testFramework: 'cypress',
          totalFiles: 15,
          totalTests: 45
        },
        conversionSummary: {
          filesConverted: 13,
          testsConverted: 40,
          customCommandsConverted: 3,
          configurationsMigrated: 1,
          issuesFound: [],
          warnings: ['XPath selector may need manual review']
        },
        detailedAnalysis: {
          filesProcessed: [{
            originalPath: 'cypress/e2e/login.cy.js',
            convertedPath: 'tests/login.spec.js',
            status: 'success' as const,
            testCount: 12,
            linesChanged: 35,
            conversionNotes: ['Converted 12 Cypress commands', 'Updated 5 assertions'],
            issues: []
          }],
          customCommandsConverted: [],
          configurationsUpdated: [],
          dependenciesChanged: [],
          ciPipelineUpdates: []
        },
        recommendations: [],
        warnings: [],
        performance: {
          conversionTime: 2700000,
          beforeMetrics: {
            testSuiteSize: 1250,
            dependencyCount: 15
          },
          afterMetrics: {
            testSuiteSize: 1180,
            dependencyCount: 16
          },
          improvements: [],
          concerns: []
        },
        compatibility: {
          browserSupport: [],
          featureCompatibility: [],
          pluginCompatibility: [],
          overallCompatibility: 'good' as const,
          issues: []
        },
        nextSteps: [
          'Update continuous integration configuration',
          'Schedule team training session',
          'Plan gradual rollout strategy'
        ]
      };

      mockReportingService.prototype.getConversionReport.mockResolvedValue(mockReport);

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}`)
        .expect(200);

      expect(response.body).toEqual(mockReport);
    });

    it('should include detailed format when requested', async () => {
      const detailedReport = {
        id: `report_${jobId}`,
        timestamp: new Date('2025-01-01T12:00:00Z'),
        projectInfo: {
          name: 'cypress-project',
          type: 'cypress' as const,
          language: 'javascript' as const,
          testFramework: 'cypress',
          totalFiles: 15,
          totalTests: 45
        },
        conversionSummary: {
          filesConverted: 13,
          testsConverted: 40,
          customCommandsConverted: 3,
          configurationsMigrated: 1,
          issuesFound: [],
          warnings: []
        },
        detailedAnalysis: {
          filesProcessed: [],
          customCommandsConverted: [],
          configurationsUpdated: [],
          dependenciesChanged: [],
          ciPipelineUpdates: []
        },
        recommendations: [],
        warnings: [],
        performance: {
          conversionTime: 2700000,
          beforeMetrics: {
            testSuiteSize: 1250,
            dependencyCount: 15
          },
          afterMetrics: {
            testSuiteSize: 1180,
            dependencyCount: 16
          },
          improvements: [],
          concerns: []
        },
        compatibility: {
          browserSupport: [],
          featureCompatibility: [],
          pluginCompatibility: [],
          overallCompatibility: 'good' as const,
          issues: []
        },
        nextSteps: []
      };

      mockReportingService.prototype.getConversionReport.mockResolvedValue(detailedReport);

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}?format=detailed`)
        .expect(200);

      expect(response.body.id).toBe(`report_${jobId}`);
      expect(response.body.detailedAnalysis).toBeDefined();
    });

    it('should return 404 for non-existent conversion job', async () => {
      mockReportingService.prototype.getConversionReport.mockRejectedValue(
        new Error('Conversion job not found')
      );

      const response = await request(app)
        .get('/api/reports/conversion/non-existent-job')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Conversion job not found',
        code: 'CONVERSION_JOB_NOT_FOUND'
      });
    });

    it('should return 404 for incomplete conversion', async () => {
      mockReportingService.prototype.getConversionReport.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}`)
        .expect(404);

      expect(response.body.error).toBe('Conversion report not found');
    });
  });

  describe('GET /api/reports/conversion/:jobId/download', () => {
    const jobId = 'conversion-job-123';

    it('should download conversion report in PDF format', async () => {
      const mockPdfBuffer = Buffer.from('mock PDF content');

      mockReportingService.prototype.generateReportPdf.mockResolvedValue(mockPdfBuffer);

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}/download?format=pdf`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('conversion-report.pdf');
    });

    it('should download conversion report in Excel format', async () => {
      const mockExcelBuffer = Buffer.from('mock Excel content');

      mockReportingService.prototype.generateReportPdf.mockResolvedValue(mockExcelBuffer);

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}/download?format=excel`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('conversion-report.pdf');
    });

    it('should download conversion report in JSON format', async () => {
      const mockJsonReport = {
        id: `report_${jobId}`,
        timestamp: new Date('2025-01-01T12:00:00Z'),
        projectInfo: {
          name: 'cypress-project',
          type: 'cypress' as const,
          language: 'javascript' as const,
          testFramework: 'cypress',
          totalFiles: 15,
          totalTests: 45
        },
        conversionSummary: {
          filesConverted: 13,
          testsConverted: 40,
          customCommandsConverted: 3,
          configurationsMigrated: 1,
          issuesFound: [],
          warnings: []
        },
        detailedAnalysis: {
          filesProcessed: [],
          customCommandsConverted: [],
          configurationsUpdated: [],
          dependenciesChanged: [],
          ciPipelineUpdates: []
        },
        recommendations: [],
        warnings: [],
        performance: {
          conversionTime: 2700000,
          beforeMetrics: {
            testSuiteSize: 1250,
            dependencyCount: 15
          },
          afterMetrics: {
            testSuiteSize: 1180,
            dependencyCount: 16
          },
          improvements: [],
          concerns: []
        },
        compatibility: {
          browserSupport: [],
          featureCompatibility: [],
          pluginCompatibility: [],
          overallCompatibility: 'good' as const,
          issues: []
        },
        nextSteps: []
      };

      mockReportingService.prototype.exportReport.mockResolvedValue(Buffer.from(JSON.stringify(mockJsonReport)));

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}/download?format=json`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/octet-stream');
      expect(response.headers['content-disposition']).toContain('conversion-report.json');
    });

    it('should default to PDF format when format not specified', async () => {
      const mockPdfBuffer = Buffer.from('default PDF content');

      mockReportingService.prototype.generateReportPdf.mockResolvedValue(mockPdfBuffer);

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}/download`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('should return 400 for unsupported format', async () => {
      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}/download?format=unsupported`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Unsupported report format',
        code: 'UNSUPPORTED_FORMAT',
        supportedFormats: ['pdf', 'excel', 'json', 'html']
      });
    });
  });

  describe('GET /api/reports/summary', () => {
    it('should return conversion summary across all jobs', async () => {
      const mockSummary = {
        filesConverted: 45,
        testsConverted: 380,
        customCommandsConverted: 23,
        configurationsMigrated: 12,
        issuesFound: ['XPath selector conversion', 'Custom command complexity'],
        warnings: ['Some selectors may need manual review']
      };

      mockReportingService.prototype.getConversionSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .get('/api/reports/summary')
        .expect(200);

      expect(response.body).toEqual(mockSummary);
    });

    it('should filter summary by date range', async () => {
      const filteredSummary = {
        filesConverted: 12,
        testsConverted: 100,
        customCommandsConverted: 8,
        configurationsMigrated: 3,
        issuesFound: [],
        warnings: []
      };

      mockReportingService.prototype.getConversionSummary.mockResolvedValue(filteredSummary);

      const response = await request(app)
        .get('/api/reports/summary?startDate=2025-01-15&endDate=2025-01-31')
        .expect(200);

      expect(response.body.filesConverted).toBe(12);
    });
  });

  describe('GET /api/reports/analytics', () => {
    it('should return detailed analytics and metrics', async () => {
      const mockAnalytics = {
        generatedAt: '2025-01-01T12:00:00Z',
        timeRange: '30d',
        conversions: {
          volume: {
            total: 156,
            successful: 132,
            failed: 18,
            cancelled: 6
          },
          performance: {
            averageDuration: 2100000, // 35 minutes
            medianDuration: 1800000, // 30 minutes
            p95Duration: 4200000, // 70 minutes
            fastestConversion: 600000, // 10 minutes
            slowestConversion: 7200000 // 2 hours
          },
          complexity: {
            simple: 45,
            medium: 78,
            complex: 33
          }
        },
        repositories: {
          languages: {
            javascript: 89,
            typescript: 52,
            mixed: 15
          },
          sizes: {
            small: 67, // < 10 files
            medium: 73, // 10-50 files
            large: 16 // > 50 files
          },
          cypressVersions: {
            'v10.x': 23,
            'v11.x': 45,
            'v12.x': 67,
            'v13.x': 21
          }
        },
        issues: {
          byCategory: {
            selectors: 45,
            customCommands: 34,
            configuration: 23,
            dependencies: 12,
            testing: 8
          },
          resolution: {
            automatic: 89,
            manualReview: 33,
            failed: 12
          }
        },
        userBehavior: {
          peakHours: [9, 10, 11, 14, 15, 16],
          averageProjectsPerUser: 2.3,
          retryRate: 0.15,
          downloadRate: 0.92
        },
        performance: {
          systemMetrics: {
            averageCpuUsage: 0.65,
            averageMemoryUsage: 0.78,
            peakConcurrentJobs: 8
          },
          apiMetrics: {
            averageResponseTime: 245,
            p95ResponseTime: 890,
            errorRate: 0.023
          }
        }
      };

      mockReportingService.prototype.getAnalytics.mockResolvedValue(mockAnalytics);

      const response = await request(app)
        .get('/api/reports/analytics')
        .expect(200);

      expect(response.body).toEqual(mockAnalytics);
    });

    it('should support different time ranges', async () => {
      const weeklyAnalytics = {
        timeRange: '7d',
        conversions: {
          volume: {
            total: 23,
            successful: 20,
            failed: 2,
            cancelled: 1
          }
        }
      };

      mockReportingService.prototype.getAnalytics.mockResolvedValue(weeklyAnalytics);

      const response = await request(app)
        .get('/api/reports/analytics?timeRange=7d')
        .expect(200);

      expect(response.body.timeRange).toBe('7d');
    });
  });

  describe('POST /api/reports/custom', () => {
    it('should generate custom report with specified parameters', async () => {
      const customReportRequest = {
        name: 'Monthly Team Report',
        filters: {
          dateRange: {
            start: '2025-01-01',
            end: '2025-01-31'
          },
          repositories: [
            'github.com/team/project-a',
            'github.com/team/project-b'
          ],
          status: ['completed', 'failed']
        },
        metrics: [
          'conversion-success-rate',
          'average-duration',
          'common-issues',
          'code-quality-improvement'
        ],
        format: 'pdf',
        groupBy: 'repository'
      };

      const mockCustomReport = {
        reportId: 'custom-report-789',
        name: 'Monthly Team Report',
        status: 'generating',
        estimatedCompletion: '2025-01-01T12:05:00Z',
        downloadUrl: '/api/reports/custom/custom-report-789/download'
      };

      const response = await request(app)
        .post('/api/reports/custom')
        .send(customReportRequest)
        .expect(501);

      expect(response.body.error).toBe('Custom reports not implemented');
    });

    it('should validate custom report parameters', async () => {
      const invalidRequest = {
        name: '',
        filters: {},
        metrics: []
      };

      const response = await request(app)
        .post('/api/reports/custom')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/reports/custom/:reportId', () => {
    it('should return custom report status and download link', async () => {
      const reportId = 'custom-report-789';
      const mockReportStatus = {
        reportId,
        name: 'Monthly Team Report',
        status: 'completed',
        generatedAt: '2025-01-01T12:05:00Z',
        fileSize: 2048576,
        downloadUrl: `/api/reports/custom/${reportId}/download`,
        expiresAt: '2025-01-08T12:05:00Z'
      };

      const response = await request(app)
        .get(`/api/reports/custom/${reportId}`)
        .expect(501);

      expect(response.body.error).toBe('Custom reports not implemented');
    });

    it('should return processing status for incomplete reports', async () => {
      const processingStatus = {
        reportId: 'custom-report-456',
        status: 'processing',
        progress: 60,
        currentStep: 'Aggregating conversion metrics'
      };

      const response = await request(app)
        .get('/api/reports/custom/custom-report-456')
        .expect(501);

      expect(response.body.error).toBe('Custom reports not implemented');
    });
  });

  describe('GET /api/reports/templates', () => {
    it('should return available report templates', async () => {
      const mockTemplates = {
        templates: [
          {
            id: 'executive-summary',
            name: 'Executive Summary',
            description: 'High-level overview of conversion metrics and ROI',
            metrics: ['success-rate', 'cost-savings', 'time-reduction'],
            formats: ['pdf', 'pptx'],
            estimatedSize: 'small'
          },
          {
            id: 'technical-detail',
            name: 'Technical Detail Report',
            description: 'In-depth technical analysis and recommendations',
            metrics: ['code-quality', 'complexity-analysis', 'performance-comparison'],
            formats: ['pdf', 'html', 'json'],
            estimatedSize: 'large'
          },
          {
            id: 'team-progress',
            name: 'Team Progress Report',
            description: 'Team-focused metrics and progress tracking',
            metrics: ['team-velocity', 'learning-curve', 'adoption-rate'],
            formats: ['pdf', 'excel'],
            estimatedSize: 'medium'
          }
        ],
        customizable: {
          metrics: [
            'conversion-success-rate',
            'average-duration',
            'code-quality-improvement',
            'test-coverage-comparison',
            'performance-improvement',
            'maintainability-score'
          ],
          groupingOptions: ['repository', 'team', 'time-period', 'complexity'],
          filterOptions: ['date-range', 'repository', 'status', 'complexity', 'language']
        }
      };

      const response = await request(app)
        .get('/api/reports/templates')
        .expect(501);

      expect(response.body.error).toBe('Report templates not implemented');
    });
  });
});