import request from 'supertest';
import { app } from '../../src/api/app';
import { RepositoryService } from '../../src/services/repository.service';
import { GitHubService } from '../../src/services/github.service';

jest.mock('../../src/services/repository.service');
jest.mock('../../src/services/github.service');

const mockRepositoryService = RepositoryService as jest.MockedClass<typeof RepositoryService>;
const mockGitHubService = GitHubService as jest.MockedClass<typeof GitHubService>;

describe('Repository API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/repository/analyze', () => {
    const analysisRequest = {
      repositoryUrl: 'https://github.com/user/cypress-project'
    };

    it('should analyze repository structure and patterns', async () => {
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
          ],
          pluginFiles: [
            'cypress/plugins/index.js'
          ]
        },
        patterns: {
          customCommands: [
            {
              name: 'login',
              file: 'cypress/support/commands.js',
              lineNumber: 10,
              parameters: ['username', 'password'],
              complexity: 'medium'
            },
            {
              name: 'selectProduct',
              file: 'cypress/support/commands.js',
              lineNumber: 25,
              parameters: ['productId'],
              complexity: 'low'
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
              complexity: 'medium'
            }
          ],
          viewportConfigurations: [
            { width: 1280, height: 720, name: 'desktop' },
            { width: 768, height: 1024, name: 'tablet' },
            { width: 375, height: 667, name: 'mobile' }
          ]
        },
        complexity: {
          overall: 'medium',
          testFiles: 'low',
          customCommands: 'medium',
          selectors: 'high',
          hooks: 'low',
          score: 6.5
        },
        conversionEstimate: {
          estimatedTime: 45000,
          confidence: 'high',
          potentialIssues: [
            {
              type: 'warning',
              category: 'selectors',
              message: 'XPath selectors detected - may need manual conversion',
              files: ['cypress/e2e/dashboard.cy.js'],
              severity: 'medium'
            },
            {
              type: 'info',
              category: 'commands',
              message: 'Custom commands will be converted to Page Object methods',
              files: ['cypress/support/commands.js'],
              severity: 'low'
            }
          ],
          recommendations: [
            'Consider using semantic locators for better maintainability',
            'Custom commands are well-structured for conversion',
            'Page object pattern is already partially implemented'
          ]
        }
      };

      mockRepositoryService.prototype.analyzeRepository.mockResolvedValue(mockAnalysis);

      const response = await request(app)
        .post('/api/repository/analyze')
        .send(analysisRequest)
        .expect(200);

      expect(response.body).toEqual(mockAnalysis);
      expect(mockRepositoryService.prototype.analyzeRepository).toHaveBeenCalledWith(
        analysisRequest.repositoryUrl
      );
    });

    it('should handle private repositories with authentication', async () => {
      const privateRepoRequest = {
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

      mockRepositoryService.prototype.analyzeRepository.mockResolvedValue(mockAnalysis);

      const response = await request(app)
        .post('/api/repository/analyze')
        .send(privateRepoRequest)
        .expect(200);

      expect(response.body).toEqual(mockAnalysis);
    });

    it('should return 404 for non-existent repository', async () => {
      mockRepositoryService.prototype.analyzeRepository.mockRejectedValue(
        new Error('Repository not found')
      );

      const response = await request(app)
        .post('/api/repository/analyze')
        .send({ repositoryUrl: 'https://github.com/user/non-existent' })
        .expect(404);

      expect(response.body).toEqual({
        error: 'Repository not found or inaccessible',
        code: 'REPOSITORY_NOT_FOUND'
      });
    });

    it('should return 422 for non-Cypress repository', async () => {
      mockRepositoryService.prototype.analyzeRepository.mockRejectedValue(
        new Error('Not a Cypress project')
      );

      const response = await request(app)
        .post('/api/repository/analyze')
        .send({ repositoryUrl: 'https://github.com/user/react-app' })
        .expect(422);

      expect(response.body).toEqual({
        error: 'Repository is not a valid Cypress project',
        code: 'INVALID_CYPRESS_PROJECT'
      });
    });

    it('should handle analysis timeout gracefully', async () => {
      mockRepositoryService.prototype.analyzeRepository.mockRejectedValue(
        new Error('Analysis timeout')
      );

      const response = await request(app)
        .post('/api/repository/analyze')
        .send(analysisRequest)
        .expect(408);

      expect(response.body).toEqual({
        error: 'Repository analysis timed out',
        code: 'ANALYSIS_TIMEOUT',
        suggestion: 'Repository may be too large. Try again or contact support.'
      });
    });
  });

  describe('GET /api/repository/search', () => {
    it('should search GitHub repositories with Cypress projects', async () => {
      const mockSearchResults = {
        totalCount: 250,
        repositories: [
          {
            name: 'cypress-example',
            fullName: 'user1/cypress-example',
            description: 'Example Cypress project',
            stars: 120,
            language: 'JavaScript',
            lastUpdated: '2025-01-01T00:00:00Z',
            cypressVersion: '12.0.0',
            testCount: 15,
            complexity: 'medium'
          },
          {
            name: 'e2e-tests',
            fullName: 'org/e2e-tests',
            description: 'End-to-end tests with Cypress',
            stars: 45,
            language: 'TypeScript',
            lastUpdated: '2024-12-20T00:00:00Z',
            cypressVersion: '13.0.0',
            testCount: 32,
            complexity: 'high'
          }
        ],
        page: 1,
        perPage: 20,
        hasMore: true
      };

      mockGitHubService.prototype.searchCypressRepositories.mockResolvedValue(mockSearchResults);

      const response = await request(app)
        .get('/api/repository/search?q=cypress&sort=stars&order=desc&page=1')
        .expect(200);

      expect(response.body).toEqual(mockSearchResults);
      expect(mockGitHubService.prototype.searchCypressRepositories).toHaveBeenCalledWith({
        query: 'cypress',
        sort: 'stars',
        order: 'desc',
        page: 1,
        perPage: 20
      });
    });

    it('should handle search with advanced filters', async () => {
      const response = await request(app)
        .get('/api/repository/search?q=cypress&language=typescript&stars=>10&size=<1000')
        .expect(200);

      expect(mockGitHubService.prototype.searchCypressRepositories).toHaveBeenCalledWith({
        query: 'cypress',
        language: 'typescript',
        stars: '>10',
        size: '<1000',
        page: 1,
        perPage: 20
      });
    });

    it('should return empty results for no matches', async () => {
      mockGitHubService.prototype.searchCypressRepositories.mockResolvedValue({
        totalCount: 0,
        repositories: [],
        page: 1,
        perPage: 20,
        hasMore: false
      });

      const response = await request(app)
        .get('/api/repository/search?q=very-specific-non-existent-query')
        .expect(200);

      expect(response.body.totalCount).toBe(0);
      expect(response.body.repositories).toEqual([]);
    });

    it('should handle GitHub API rate limit', async () => {
      mockGitHubService.prototype.searchCypressRepositories.mockRejectedValue(
        new Error('GitHub API rate limit exceeded')
      );

      const response = await request(app)
        .get('/api/repository/search?q=cypress')
        .expect(429);

      expect(response.body).toEqual({
        error: 'GitHub API rate limit exceeded',
        code: 'GITHUB_RATE_LIMIT',
        retryAfter: 3600
      });
    });
  });

  describe('GET /api/repository/trending', () => {
    it('should return trending Cypress repositories', async () => {
      const mockTrending = {
        repositories: [
          {
            name: 'awesome-cypress',
            fullName: 'community/awesome-cypress',
            description: 'Curated list of awesome Cypress resources',
            stars: 2500,
            starsToday: 15,
            language: 'JavaScript',
            cypressVersion: '12.0.0',
            category: 'educational'
          },
          {
            name: 'cypress-testing-library',
            fullName: 'testing-library/cypress-testing-library',
            description: 'Cypress utilities for testing-library',
            stars: 1800,
            starsToday: 8,
            language: 'TypeScript',
            cypressVersion: '13.0.0',
            category: 'library'
          }
        ],
        period: 'daily',
        lastUpdated: '2025-01-01T12:00:00Z'
      };

      mockGitHubService.prototype.getTrendingCypressRepositories.mockResolvedValue(mockTrending);

      const response = await request(app)
        .get('/api/repository/trending?period=daily')
        .expect(200);

      expect(response.body).toEqual(mockTrending);
    });

    it('should support different trending periods', async () => {
      const periods = ['daily', 'weekly', 'monthly'];

      for (const period of periods) {
        await request(app)
          .get(`/api/repository/trending?period=${period}`)
          .expect(200);

        expect(mockGitHubService.prototype.getTrendingCypressRepositories).toHaveBeenCalledWith(period);
      }
    });
  });

  describe('POST /api/repository/validate-access', () => {
    it('should validate repository access permissions', async () => {
      const validateRequest = {
        repositoryUrl: 'https://github.com/user/private-repo',
        accessToken: 'github_pat_xxx'
      };

      const mockValidation = {
        accessible: true,
        permissions: {
          read: true,
          write: false,
          admin: false
        },
        repositoryInfo: {
          name: 'private-repo',
          private: true,
          size: 2048
        }
      };

      mockRepositoryService.prototype.validateAccess.mockResolvedValue(mockValidation);

      const response = await request(app)
        .post('/api/repository/validate-access')
        .send(validateRequest)
        .expect(200);

      expect(response.body).toEqual(mockValidation);
    });

    it('should return 403 for insufficient permissions', async () => {
      mockRepositoryService.prototype.validateAccess.mockRejectedValue(
        new Error('Insufficient permissions')
      );

      const response = await request(app)
        .post('/api/repository/validate-access')
        .send({
          repositoryUrl: 'https://github.com/user/private-repo',
          accessToken: 'invalid_token'
        })
        .expect(403);

      expect(response.body).toEqual({
        error: 'Insufficient repository access permissions',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    });

    it('should validate token format', async () => {
      const response = await request(app)
        .post('/api/repository/validate-access')
        .send({
          repositoryUrl: 'https://github.com/user/repo',
          accessToken: 'invalid-token-format'
        })
        .expect(400);

      expect(response.body.code).toBe('INVALID_TOKEN_FORMAT');
    });
  });

  describe('GET /api/repository/:owner/:repo/branches', () => {
    it('should list repository branches', async () => {
      const mockBranches = [
        {
          name: 'main',
          sha: 'abc123',
          protected: true,
          default: true
        },
        {
          name: 'develop',
          sha: 'def456',
          protected: false,
          default: false
        },
        {
          name: 'feature/new-tests',
          sha: 'ghi789',
          protected: false,
          default: false
        }
      ];

      mockRepositoryService.prototype.getBranches.mockResolvedValue(mockBranches);

      const response = await request(app)
        .get('/api/repository/user/cypress-project/branches')
        .expect(200);

      expect(response.body).toEqual(mockBranches);
      expect(mockRepositoryService.prototype.getBranches).toHaveBeenCalledWith('user', 'cypress-project');
    });

    it('should handle repository with no branches', async () => {
      mockRepositoryService.prototype.getBranches.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/repository/user/empty-repo/branches')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });
});