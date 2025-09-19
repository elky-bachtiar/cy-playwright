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
        jobId,
        status: 'completed',
        generatedAt: '2025-01-01T12:00:00Z',
        conversion: {
          sourceRepository: 'https://github.com/user/cypress-project',
          branch: 'main',
          startTime: '2025-01-01T10:00:00Z',
          completionTime: '2025-01-01T10:45:00Z',
          duration: 2700000 // 45 minutes in milliseconds
        },
        statistics: {
          filesProcessed: {
            total: 15,
            testFiles: 8,
            supportFiles: 4,
            configFiles: 1,
            fixtureFiles: 2
          },
          conversionResults: {
            successful: 13,
            warnings: 2,
            errors: 0,
            skipped: 0
          },
          linesOfCode: {
            original: 1250,
            converted: 1180,
            reduction: 0.056
          }
        },
        fileDetails: [
          {
            sourceFile: 'cypress/e2e/login.cy.js',
            targetFile: 'tests/login.spec.js',
            status: 'success',
            changes: {
              commandsConverted: 12,
              assertionsConverted: 5,
              selectorsOptimized: 3
            },
            issues: []
          },
          {
            sourceFile: 'cypress/e2e/dashboard.cy.js',
            targetFile: 'tests/dashboard.spec.js',
            status: 'warning',
            changes: {
              commandsConverted: 28,
              assertionsConverted: 15,
              selectorsOptimized: 8
            },
            issues: [
              {
                type: 'warning',
                message: 'XPath selector may need manual review',
                line: 45,
                suggestion: 'Consider using getByRole or getByText'
              }
            ]
          }
        ],
        playwrightConfig: {
          projectName: 'cypress-converted-project',
          browsers: ['chromium', 'firefox', 'webkit'],
          testDir: 'tests',
          parallelism: 4,
          timeout: 30000
        },
        validationResults: {
          syntaxValid: true,
          testsRunnable: true,
          coverageEquivalent: 0.95,
          performanceComparison: {
            cypressRuntime: 180, // seconds
            playwrightRuntime: 145, // seconds
            improvement: 0.194
          }
        },
        recommendations: {
          immediate: [
            'Review XPath selectors in dashboard tests',
            'Update CI/CD configuration for Playwright',
            'Install Playwright browsers'
          ],
          optimization: [
            'Consider using Page Object Model pattern',
            'Implement parallel test execution',
            'Add visual regression testing'
          ],
          maintenance: [
            'Set up automated test reports',
            'Configure test result notifications',
            'Document migration decisions'
          ]
        },
        migration: {
          checklist: [
            { task: 'Backup original tests', status: 'completed' },
            { task: 'Convert test syntax', status: 'completed' },
            { task: 'Update configuration', status: 'completed' },
            { task: 'Run validation tests', status: 'completed' },
            { task: 'Update CI/CD pipeline', status: 'pending' },
            { task: 'Train team on Playwright', status: 'pending' }
          ],
          nextSteps: [
            'Update continuous integration configuration',
            'Schedule team training session',
            'Plan gradual rollout strategy'
          ]
        }
      };

      mockReportingService.prototype.getConversionReport.mockResolvedValue(mockReport);

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}`)
        .expect(200);

      expect(response.body).toEqual(mockReport);
    });

    it('should include detailed format when requested', async () => {
      const detailedReport = {
        jobId,
        format: 'detailed',
        additionalMetrics: {
          codeQuality: {
            complexity: { before: 6.5, after: 5.2 },
            maintainability: { before: 7.2, after: 8.1 },
            testability: { before: 6.8, after: 7.9 }
          },
          selectorAnalysis: {
            beforeConversion: {
              dataTestId: 23,
              className: 67,
              id: 12,
              xpath: 15,
              text: 8
            },
            afterConversion: {
              getByRole: 45,
              getByText: 32,
              getByTestId: 23,
              locator: 25
            }
          }
        }
      };

      mockReportingService.prototype.getConversionReport.mockResolvedValue(detailedReport);

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}?format=detailed`)
        .expect(200);

      expect(response.body.format).toBe('detailed');
      expect(response.body.additionalMetrics).toBeDefined();
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

    it('should return 202 for incomplete conversion', async () => {
      const incompleteReport = {
        jobId,
        status: 'processing',
        progress: 75,
        currentStep: 'Validating converted tests',
        estimatedCompletion: '2025-01-01T12:15:00Z'
      };

      mockReportingService.prototype.getConversionReport.mockResolvedValue(incompleteReport);

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}`)
        .expect(202);

      expect(response.body.status).toBe('processing');
    });
  });

  describe('GET /api/reports/conversion/:jobId/download', () => {
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

      mockReportingService.prototype.generateReportExcel.mockResolvedValue(mockExcelBuffer);

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}/download?format=excel`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(response.headers['content-disposition']).toContain('conversion-report.xlsx');
    });

    it('should download conversion report in JSON format', async () => {
      const mockJsonReport = {
        jobId,
        format: 'json',
        data: { /* comprehensive report data */ }
      };

      mockReportingService.prototype.getConversionReport.mockResolvedValue(mockJsonReport);

      const response = await request(app)
        .get(`/api/reports/conversion/${jobId}/download?format=json`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/json');
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
        period: {
          start: '2025-01-01T00:00:00Z',
          end: '2025-01-31T23:59:59Z'
        },
        totals: {
          conversions: 45,
          successful: 38,
          failed: 4,
          inProgress: 3,
          successRate: 0.844
        },
        averages: {
          conversionTime: 1800000, // 30 minutes
          filesPerProject: 12.5,
          testCoverage: 0.92,
          codeReduction: 0.08
        },
        trends: {
          conversionsPerDay: [
            { date: '2025-01-01', count: 2 },
            { date: '2025-01-02', count: 3 },
            { date: '2025-01-03', count: 1 }
          ],
          successRateOverTime: [
            { date: '2025-01-01', rate: 0.85 },
            { date: '2025-01-02', rate: 0.87 },
            { date: '2025-01-03', rate: 0.89 }
          ]
        },
        topRepositories: [
          {
            repository: 'github.com/user/large-project',
            conversions: 5,
            averageTime: 3600000,
            complexity: 'high'
          },
          {
            repository: 'github.com/org/medium-project',
            conversions: 3,
            averageTime: 2400000,
            complexity: 'medium'
          }
        ],
        commonIssues: [
          {
            issue: 'XPath selector conversion',
            frequency: 23,
            impact: 'medium'
          },
          {
            issue: 'Custom command complexity',
            frequency: 18,
            impact: 'high'
          }
        ]
      };

      mockReportingService.prototype.getConversionSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .get('/api/reports/summary')
        .expect(200);

      expect(response.body).toEqual(mockSummary);
    });

    it('should filter summary by date range', async () => {
      const filteredSummary = {
        period: {
          start: '2025-01-15T00:00:00Z',
          end: '2025-01-31T23:59:59Z'
        },
        totals: {
          conversions: 12,
          successful: 10,
          failed: 1,
          inProgress: 1
        }
      };

      mockReportingService.prototype.getConversionSummary.mockResolvedValue(filteredSummary);

      const response = await request(app)
        .get('/api/reports/summary?startDate=2025-01-15&endDate=2025-01-31')
        .expect(200);

      expect(response.body.period.start).toBe('2025-01-15T00:00:00Z');
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

      mockReportingService.prototype.generateCustomReport.mockResolvedValue(mockCustomReport);

      const response = await request(app)
        .post('/api/reports/custom')
        .send(customReportRequest)
        .expect(202);

      expect(response.body).toEqual(mockCustomReport);
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

      mockReportingService.prototype.getCustomReportStatus.mockResolvedValue(mockReportStatus);

      const response = await request(app)
        .get(`/api/reports/custom/${reportId}`)
        .expect(200);

      expect(response.body).toEqual(mockReportStatus);
    });

    it('should return processing status for incomplete reports', async () => {
      const processingStatus = {
        reportId: 'custom-report-456',
        status: 'processing',
        progress: 60,
        currentStep: 'Aggregating conversion metrics'
      };

      mockReportingService.prototype.getCustomReportStatus.mockResolvedValue(processingStatus);

      const response = await request(app)
        .get('/api/reports/custom/custom-report-456')
        .expect(202);

      expect(response.body.status).toBe('processing');
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

      mockReportingService.prototype.getReportTemplates.mockResolvedValue(mockTemplates);

      const response = await request(app)
        .get('/api/reports/templates')
        .expect(200);

      expect(response.body).toEqual(mockTemplates);
    });
  });
});