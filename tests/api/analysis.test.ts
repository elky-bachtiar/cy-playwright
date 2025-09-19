import request from 'supertest';
import { app } from '../../src/api/app';
import { AnalysisService } from '../../src/services/analysis.service';
import { ReportingService } from '../../src/services/reporting.service';
import { RepositoryService } from '../../src/services/repository.service';

jest.mock('../../src/services/analysis.service');
jest.mock('../../src/services/reporting.service');
jest.mock('../../src/services/repository.service');

const mockAnalysisService = AnalysisService as jest.MockedClass<typeof AnalysisService>;
const mockReportingService = ReportingService as jest.MockedClass<typeof ReportingService>;
const mockRepositoryService = RepositoryService as jest.MockedClass<typeof RepositoryService>;

describe('Analysis and Reporting API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/analysis/repository', () => {
    const analysisRequest = {
      repositoryUrl: 'https://github.com/user/cypress-project',
      branch: 'main',
      includePatterns: true,
      includeComplexity: true,
      includeEstimate: true
    };

    it('should analyze repository patterns and structure', async () => {
      const mockAnalysis = {
        repositoryInfo: {
          name: 'cypress-project',
          owner: 'user',
          description: 'Test project with Cypress tests',
          language: 'JavaScript',
          size: 1024,
          stars: 42,
          forks: 7,
          openIssues: 3,
          lastUpdated: '2025-01-01T00:00:00Z'
        },
        cypressInfo: {
          version: '12.0.0',
          configFile: 'cypress.config.js',
          testFiles: [
            'cypress/e2e/login.cy.js',
            'cypress/e2e/dashboard.cy.js',
            'cypress/e2e/profile.cy.js'
          ],
          supportFiles: [
            'cypress/support/e2e.js',
            'cypress/support/commands.js'
          ],
          fixtureFiles: [
            'cypress/fixtures/users.json',
            'cypress/fixtures/products.json'
          ]
        },
        patterns: {
          customCommands: [
            {
              name: 'login',
              file: 'cypress/support/commands.js',
              lineNumber: 10,
              parameters: ['username', 'password'],
              complexity: 'medium',
              description: 'Custom login command with session management'
            }
          ],
          selectorPatterns: {
            dataTestIds: 45,
            classes: 120,
            ids: 32,
            attributes: 18,
            xpath: 3,
            centralized: true,
            selectorFiles: ['cypress/support/selectors.js']
          },
          pageObjects: [
            {
              file: 'cypress/support/pages/LoginPage.js',
              className: 'LoginPage',
              methods: ['visit', 'enterCredentials', 'submit'],
              complexity: 'medium',
              selectorCount: 8
            }
          ],
          viewportConfigurations: [
            { width: 1280, height: 720, name: 'desktop' },
            { width: 768, height: 1024, name: 'tablet' }
          ],
          interceptPatterns: [
            {
              method: 'GET',
              url: '/api/users',
              alias: 'getUsers',
              file: 'cypress/e2e/dashboard.cy.js',
              lineNumber: 15
            }
          ],
          taskPatterns: [
            {
              name: 'seedDatabase',
              file: 'cypress/plugins/index.js',
              complexity: 'high',
              parameters: ['data']
            }
          ]
        },
        complexity: {
          overall: 'medium',
          testFiles: 'low',
          customCommands: 'medium',
          selectors: 'high',
          hooks: 'low',
          score: 6.5,
          factors: [
            {
              factor: 'Custom Commands',
              impact: 'medium',
              description: 'Complex custom commands requiring manual review',
              count: 3
            },
            {
              factor: 'XPath Selectors',
              impact: 'high',
              description: 'XPath selectors may need manual conversion',
              count: 3
            }
          ]
        },
        conversionEstimate: {
          estimatedTime: 45000,
          confidence: 'high',
          potentialIssues: [
            {
              type: 'warning',
              category: 'selectors',
              message: 'XPath selectors detected - may need manual conversion',
              file: 'cypress/e2e/dashboard.cy.js',
              lineNumber: 25,
              severity: 'medium',
              suggestion: 'Consider using semantic locators for better maintainability'
            }
          ],
          recommendations: [
            'Consider using semantic locators for better maintainability',
            'Custom commands are well-structured for conversion',
            'Page object pattern is already partially implemented'
          ]
        }
      };

      mockAnalysisService.prototype.analyzeRepository.mockResolvedValue(mockAnalysis);

      const response = await request(app)
        .post('/api/analysis/repository')
        .send(analysisRequest)
        .expect(200);

      expect(response.body).toEqual(mockAnalysis);
      expect(mockAnalysisService.prototype.analyzeRepository).toHaveBeenCalledWith({
        repositoryUrl: analysisRequest.repositoryUrl,
        branch: analysisRequest.branch,
        options: {
          includePatterns: true,
          includeComplexity: true,
          includeEstimate: true
        }
      });
    });

    it('should handle analysis with access token for private repositories', async () => {
      const privateRepoRequest = {
        ...analysisRequest,
        repositoryUrl: 'https://github.com/user/private-cypress-project',
        accessToken: 'github_pat_xxx'
      };

      const mockAnalysis = {
        repositoryInfo: {
          name: 'private-cypress-project',
          owner: 'user',
          private: true,
          description: 'Private test project',
          language: 'TypeScript'
        },
        cypressInfo: {
          version: '13.0.0',
          configFile: 'cypress.config.ts',
          testFiles: ['cypress/e2e/secure-test.cy.ts']
        }
      };

      mockAnalysisService.prototype.analyzeRepository.mockResolvedValue(mockAnalysis);

      const response = await request(app)
        .post('/api/analysis/repository')
        .send(privateRepoRequest)
        .expect(200);

      expect(response.body).toEqual(mockAnalysis);
    });

    it('should return 404 for non-existent repository', async () => {
      mockAnalysisService.prototype.analyzeRepository.mockRejectedValue(
        new Error('Repository not found')
      );

      const response = await request(app)
        .post('/api/analysis/repository')
        .send({
          repositoryUrl: 'https://github.com/user/non-existent',
          branch: 'main'
        })
        .expect(404);

      expect(response.body).toEqual({
        error: 'Repository not found or inaccessible',
        code: 'REPOSITORY_NOT_FOUND'
      });
    });

    it('should return 422 for non-Cypress repository', async () => {
      mockAnalysisService.prototype.analyzeRepository.mockRejectedValue(
        new Error('Not a Cypress project')
      );

      const response = await request(app)
        .post('/api/analysis/repository')
        .send({
          repositoryUrl: 'https://github.com/user/react-app',
          branch: 'main'
        })
        .expect(422);

      expect(response.body).toEqual({
        error: 'Repository is not a valid Cypress project',
        code: 'INVALID_CYPRESS_PROJECT'
      });
    });

    it('should handle analysis timeout', async () => {
      mockAnalysisService.prototype.analyzeRepository.mockRejectedValue(
        new Error('Analysis timeout exceeded')
      );

      const response = await request(app)
        .post('/api/analysis/repository')
        .send(analysisRequest)
        .expect(408);

      expect(response.body).toEqual({
        error: 'Repository analysis timed out',
        code: 'ANALYSIS_TIMEOUT',
        suggestion: 'Repository may be too large. Try with a smaller branch or contact support.'
      });
    });
  });

  describe('POST /api/analysis/complexity', () => {
    it('should analyze code complexity patterns', async () => {
      const complexityRequest = {
        repositoryUrl: 'https://github.com/user/cypress-project',
        includeFiles: true,
        includeMetrics: true
      };

      const mockComplexityAnalysis = {
        overall: {
          score: 7.2,
          grade: 'medium',
          factors: [
            { name: 'Test File Complexity', score: 6.5, weight: 0.3 },
            { name: 'Custom Commands', score: 8.0, weight: 0.2 },
            { name: 'Selector Patterns', score: 7.8, weight: 0.25 },
            { name: 'Hooks and Setup', score: 5.5, weight: 0.15 },
            { name: 'External Dependencies', score: 6.0, weight: 0.1 }
          ]
        },
        fileComplexity: [
          {
            file: 'cypress/e2e/dashboard.cy.js',
            score: 8.5,
            grade: 'high',
            issues: [
              'Long test methods (>50 lines)',
              'Complex selector chains',
              'Multiple XPath expressions'
            ],
            metrics: {
              linesOfCode: 250,
              cyclomaticComplexity: 12,
              selectorCount: 25,
              commandCount: 45
            }
          },
          {
            file: 'cypress/e2e/login.cy.js',
            score: 4.2,
            grade: 'low',
            issues: [],
            metrics: {
              linesOfCode: 80,
              cyclomaticComplexity: 3,
              selectorCount: 6,
              commandCount: 12
            }
          }
        ],
        recommendations: [
          'Break down complex test files into smaller, focused tests',
          'Extract reusable selector patterns to centralized locations',
          'Consider using Page Object Model for complex workflows',
          'Replace XPath selectors with more stable alternatives'
        ],
        conversionImpact: {
          estimatedEffort: 'medium',
          riskFactors: [
            'High selector complexity may require manual review',
            'Complex custom commands need careful conversion'
          ],
          automationPotential: 0.75
        }
      };

      mockAnalysisService.prototype.analyzeComplexity.mockResolvedValue(mockComplexityAnalysis);

      const response = await request(app)
        .post('/api/analysis/complexity')
        .send(complexityRequest)
        .expect(200);

      expect(response.body).toEqual(mockComplexityAnalysis);
    });

    it('should handle complexity analysis for TypeScript projects', async () => {
      const typescriptRequest = {
        repositoryUrl: 'https://github.com/user/typescript-cypress-project',
        includeTypeAnalysis: true
      };

      const mockTsComplexity = {
        overall: {
          score: 5.8,
          grade: 'medium',
          typeComplexity: {
            customTypes: 12,
            interfaceComplexity: 'medium',
            genericUsage: 8
          }
        },
        typeAnalysis: {
          customInterfaces: [
            { name: 'UserData', file: 'cypress/support/types.ts', complexity: 'low' },
            { name: 'ApiResponse', file: 'cypress/support/types.ts', complexity: 'medium' }
          ],
          typeConversionNeeded: true,
          playwrightCompatibility: 0.9
        }
      };

      mockAnalysisService.prototype.analyzeComplexity.mockResolvedValue(mockTsComplexity);

      const response = await request(app)
        .post('/api/analysis/complexity')
        .send(typescriptRequest)
        .expect(200);

      expect(response.body).toEqual(mockTsComplexity);
    });
  });

  describe('POST /api/analysis/patterns', () => {
    it('should analyze specific test patterns and anti-patterns', async () => {
      const patternRequest = {
        repositoryUrl: 'https://github.com/user/cypress-project',
        patternTypes: ['selectors', 'commands', 'hooks', 'intercepts']
      };

      const mockPatternAnalysis = {
        selectors: {
          totalCount: 156,
          distribution: {
            dataTestId: 45,
            className: 67,
            id: 23,
            xpath: 12,
            text: 9
          },
          antiPatterns: [
            {
              type: 'brittle-selector',
              count: 8,
              examples: [
                { file: 'cypress/e2e/form.cy.js', line: 15, selector: '.btn.btn-primary.submit' }
              ],
              severity: 'medium',
              recommendation: 'Use data-testid attributes for more stable selectors'
            }
          ],
          bestPractices: [
            {
              type: 'semantic-selectors',
              count: 34,
              examples: [
                { file: 'cypress/e2e/navigation.cy.js', line: 22, selector: '[data-testid="nav-menu"]' }
              ]
            }
          ]
        },
        commands: {
          customCommands: [
            {
              name: 'login',
              usage: 23,
              complexity: 'medium',
              conversionDifficulty: 'easy',
              recommendedPattern: 'Page Object Method'
            },
            {
              name: 'waitForApi',
              usage: 45,
              complexity: 'high',
              conversionDifficulty: 'medium',
              recommendedPattern: 'Helper Function with wait strategies'
            }
          ],
          chainPatterns: {
            averageChainLength: 4.2,
            maxChainLength: 12,
            complexChains: [
              {
                file: 'cypress/e2e/workflow.cy.js',
                line: 34,
                length: 12,
                pattern: 'cy.get().find().filter().first().click().should()'
              }
            ]
          }
        },
        hooks: {
          beforeEach: 15,
          before: 3,
          afterEach: 8,
          after: 2,
          patterns: [
            {
              type: 'authentication',
              count: 8,
              files: ['cypress/e2e/dashboard.cy.js', 'cypress/e2e/profile.cy.js']
            },
            {
              type: 'database-reset',
              count: 3,
              files: ['cypress/e2e/crud.cy.js']
            }
          ]
        },
        intercepts: {
          totalCount: 28,
          patterns: [
            {
              type: 'api-mocking',
              count: 18,
              complexity: 'medium'
            },
            {
              type: 'network-stubbing',
              count: 10,
              complexity: 'low'
            }
          ],
          aliases: 23,
          dynamicIntercepts: 5
        },
        recommendations: {
          high: [
            'Replace XPath selectors with semantic alternatives',
            'Simplify complex command chains for better maintainability'
          ],
          medium: [
            'Centralize custom commands in dedicated modules',
            'Implement consistent error handling patterns'
          ],
          low: [
            'Add more data-testid attributes for stable selectors',
            'Document custom command usage and parameters'
          ]
        }
      };

      mockAnalysisService.prototype.analyzePatterns.mockResolvedValue(mockPatternAnalysis);

      const response = await request(app)
        .post('/api/analysis/patterns')
        .send(patternRequest)
        .expect(200);

      expect(response.body).toEqual(mockPatternAnalysis);
    });

    it('should filter patterns by specific types', async () => {
      const selectorOnlyRequest = {
        repositoryUrl: 'https://github.com/user/cypress-project',
        patternTypes: ['selectors']
      };

      const mockSelectorAnalysis = {
        selectors: {
          totalCount: 156,
          distribution: {
            dataTestId: 45,
            className: 67,
            id: 23,
            xpath: 12,
            text: 9
          }
        }
      };

      mockAnalysisService.prototype.analyzePatterns.mockResolvedValue(mockSelectorAnalysis);

      const response = await request(app)
        .post('/api/analysis/patterns')
        .send(selectorOnlyRequest)
        .expect(200);

      expect(response.body).toEqual(mockSelectorAnalysis);
    });
  });

  describe('GET /api/analysis/reports/:jobId', () => {
    it('should generate comprehensive analysis report', async () => {
      const jobId = 'analysis-job-123';
      const mockReport = {
        jobId,
        status: 'completed',
        generatedAt: '2025-01-01T12:00:00Z',
        repository: {
          url: 'https://github.com/user/cypress-project',
          name: 'cypress-project',
          owner: 'user',
          branch: 'main'
        },
        summary: {
          totalFiles: 15,
          testFiles: 8,
          supportFiles: 4,
          configFiles: 1,
          fixtureFiles: 2,
          overallComplexity: 'medium',
          conversionReadiness: 0.8
        },
        analysis: {
          repository: {},
          complexity: {},
          patterns: {}
        },
        recommendations: {
          immediate: [
            'Replace XPath selectors in dashboard tests',
            'Refactor complex command chains in workflow tests'
          ],
          beforeConversion: [
            'Add TypeScript definitions for custom commands',
            'Centralize selector management'
          ],
          postConversion: [
            'Review generated Page Object Models',
            'Optimize Playwright locator strategies'
          ]
        },
        conversionPlan: {
          phases: [
            {
              name: 'Preparation',
              duration: '2 hours',
              tasks: [
                'Backup existing test suite',
                'Update project dependencies',
                'Configure TypeScript if needed'
              ]
            },
            {
              name: 'Core Conversion',
              duration: '6 hours',
              tasks: [
                'Convert test files syntax',
                'Transform custom commands to Page Objects',
                'Update configuration files'
              ]
            },
            {
              name: 'Validation',
              duration: '3 hours',
              tasks: [
                'Run converted tests',
                'Fix conversion issues',
                'Verify test coverage'
              ]
            }
          ],
          totalEstimate: '11 hours',
          confidence: 'high'
        }
      };

      mockReportingService.prototype.getAnalysisReport.mockResolvedValue(mockReport);

      const response = await request(app)
        .get(`/api/analysis/reports/${jobId}`)
        .expect(200);

      expect(response.body).toEqual(mockReport);
    });

    it('should return 404 for non-existent analysis job', async () => {
      mockReportingService.prototype.getAnalysisReport.mockRejectedValue(
        new Error('Analysis job not found')
      );

      const response = await request(app)
        .get('/api/analysis/reports/non-existent-job')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Analysis job not found',
        code: 'ANALYSIS_JOB_NOT_FOUND'
      });
    });

    it('should return 202 for in-progress analysis', async () => {
      const inProgressReport = {
        jobId: 'analysis-job-456',
        status: 'processing',
        progress: 65,
        currentStep: 'Analyzing test patterns',
        estimatedCompletion: '2025-01-01T12:05:00Z'
      };

      mockReportingService.prototype.getAnalysisReport.mockResolvedValue(inProgressReport);

      const response = await request(app)
        .get('/api/analysis/reports/analysis-job-456')
        .expect(202);

      expect(response.body).toEqual(inProgressReport);
    });
  });

  describe('POST /api/analysis/compare', () => {
    it('should compare two repository analyses', async () => {
      const compareRequest = {
        repository1: 'https://github.com/user/cypress-v10-project',
        repository2: 'https://github.com/user/cypress-v12-project',
        compareFields: ['complexity', 'patterns', 'testCoverage']
      };

      const mockComparison = {
        repositories: [
          {
            url: 'https://github.com/user/cypress-v10-project',
            name: 'cypress-v10-project',
            cypressVersion: '10.0.0',
            analysisDate: '2025-01-01T10:00:00Z'
          },
          {
            url: 'https://github.com/user/cypress-v12-project',
            name: 'cypress-v12-project',
            cypressVersion: '12.0.0',
            analysisDate: '2025-01-01T11:00:00Z'
          }
        ],
        comparison: {
          complexity: {
            repository1: { score: 6.5, grade: 'medium' },
            repository2: { score: 5.2, grade: 'medium' },
            difference: -1.3,
            improvement: 'Repository 2 is less complex'
          },
          patterns: {
            selectors: {
              repository1: { dataTestIds: 23, xpath: 15, total: 89 },
              repository2: { dataTestIds: 45, xpath: 3, total: 67 },
              improvement: 'Better selector patterns in repository 2'
            },
            customCommands: {
              repository1: { count: 8, complexity: 'high' },
              repository2: { count: 5, complexity: 'medium' },
              improvement: 'Fewer, simpler custom commands in repository 2'
            }
          },
          testCoverage: {
            repository1: { files: 12, totalTests: 89 },
            repository2: { files: 8, totalTests: 67 },
            change: 'Fewer but more focused tests in repository 2'
          }
        },
        recommendations: [
          'Repository 2 shows better practices with semantic selectors',
          'Consider adopting Repository 2\'s approach to custom commands',
          'Repository 1 has broader test coverage but may benefit from consolidation'
        ]
      };

      mockAnalysisService.prototype.compareRepositories.mockResolvedValue(mockComparison);

      const response = await request(app)
        .post('/api/analysis/compare')
        .send(compareRequest)
        .expect(200);

      expect(response.body).toEqual(mockComparison);
    });
  });

  describe('GET /api/analysis/benchmarks', () => {
    it('should return analysis benchmarks and industry standards', async () => {
      const mockBenchmarks = {
        complexity: {
          excellent: { min: 0, max: 3 },
          good: { min: 3, max: 5 },
          average: { min: 5, max: 7 },
          poor: { min: 7, max: 10 }
        },
        selectors: {
          dataTestIdRatio: {
            excellent: 0.8,
            good: 0.6,
            average: 0.4,
            poor: 0.2
          },
          xpathRatio: {
            excellent: 0.05,
            good: 0.1,
            average: 0.2,
            poor: 0.3
          }
        },
        testStructure: {
          averageTestLength: {
            excellent: 20,
            good: 35,
            average: 50,
            poor: 80
          },
          testsPerFile: {
            excellent: 5,
            good: 8,
            average: 12,
            poor: 20
          }
        },
        customCommands: {
          averageComplexity: {
            excellent: 2,
            good: 4,
            average: 6,
            poor: 10
          },
          reuseRatio: {
            excellent: 0.8,
            good: 0.6,
            average: 0.4,
            poor: 0.2
          }
        },
        industryAverages: {
          cypressToPlaywrightMigration: {
            successRate: 0.85,
            averageTime: '2-4 weeks',
            commonChallenges: [
              'Custom command conversion',
              'Selector strategy migration',
              'Test data management'
            ]
          }
        }
      };

      mockAnalysisService.prototype.getBenchmarks.mockResolvedValue(mockBenchmarks);

      const response = await request(app)
        .get('/api/analysis/benchmarks')
        .expect(200);

      expect(response.body).toEqual(mockBenchmarks);
    });

    it('should filter benchmarks by category', async () => {
      const categoryBenchmarks = {
        complexity: {
          excellent: { min: 0, max: 3 },
          good: { min: 3, max: 5 },
          average: { min: 5, max: 7 },
          poor: { min: 7, max: 10 }
        }
      };

      mockAnalysisService.prototype.getBenchmarks.mockResolvedValue(categoryBenchmarks);

      const response = await request(app)
        .get('/api/analysis/benchmarks?category=complexity')
        .expect(200);

      expect(response.body).toEqual(categoryBenchmarks);
    });
  });
});