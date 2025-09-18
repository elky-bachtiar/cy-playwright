import { Router, Request, Response } from 'express';
import { RepositoryService } from '../../services/repository.service';
import { GitHubService } from '../../services/github.service';
import { ValidationMiddleware } from '../middleware/validation';
import { AsyncHandler } from '../middleware/async-handler';

export class RepositoryRouter {
  public router: Router;
  private repositoryService: RepositoryService;
  private githubService: GitHubService;

  constructor() {
    this.router = Router();
    this.repositoryService = new RepositoryService();
    this.githubService = new GitHubService();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Analyze repository structure and patterns
    this.router.post(
      '/analyze',
      ValidationMiddleware.validateRepositoryUrl(),
      AsyncHandler.wrap(this.analyzeRepository.bind(this))
    );

    // Search GitHub repositories
    this.router.get(
      '/search',
      ValidationMiddleware.validateSearchQuery(),
      AsyncHandler.wrap(this.searchRepositories.bind(this))
    );

    // Get trending Cypress repositories
    this.router.get(
      '/trending',
      AsyncHandler.wrap(this.getTrendingRepositories.bind(this))
    );

    // Validate repository access
    this.router.post(
      '/validate-access',
      ValidationMiddleware.validateRepositoryUrl(),
      ValidationMiddleware.validateAccessToken(),
      AsyncHandler.wrap(this.validateAccess.bind(this))
    );

    // Get repository branches
    this.router.get(
      '/:owner/:repo/branches',
      ValidationMiddleware.validateOwnerRepo(),
      AsyncHandler.wrap(this.getBranches.bind(this))
    );

    // Get repository file tree
    this.router.get(
      '/:owner/:repo/tree',
      ValidationMiddleware.validateOwnerRepo(),
      AsyncHandler.wrap(this.getFileTree.bind(this))
    );

    // Get specific file content
    this.router.get(
      '/:owner/:repo/file/*',
      ValidationMiddleware.validateOwnerRepo(),
      AsyncHandler.wrap(this.getFileContent.bind(this))
    );
  }

  private async analyzeRepository(req: Request, res: Response): Promise<void> {
    const { repositoryUrl, accessToken, branch = 'main' } = req.body;

    try {
      const analysis = await this.repositoryService.analyzeRepository(
        repositoryUrl,
        accessToken,
        branch
      );

      res.json(analysis);
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Repository not found or inaccessible',
          code: 'REPOSITORY_NOT_FOUND'
        });
      } else if (error.message.includes('Not a Cypress project')) {
        res.status(422).json({
          error: 'Repository is not a valid Cypress project',
          code: 'INVALID_CYPRESS_PROJECT'
        });
      } else if (error.message.includes('timeout')) {
        res.status(408).json({
          error: 'Repository analysis timed out',
          code: 'ANALYSIS_TIMEOUT',
          suggestion: 'Repository may be too large. Try again or contact support.'
        });
      } else {
        throw error;
      }
    }
  }

  private async searchRepositories(req: Request, res: Response): Promise<void> {
    const {
      q: query,
      language,
      stars,
      size,
      sort = 'stars',
      order = 'desc',
      page = 1,
      per_page: perPage = 20
    } = req.query;

    try {
      const searchResults = await this.githubService.searchCypressRepositories({
        query: query as string,
        language: language as string,
        stars: stars as string,
        size: size as string,
        sort: sort as string,
        order: order as 'asc' | 'desc',
        page: Number(page),
        perPage: Number(perPage)
      });

      res.json(searchResults);
    } catch (error) {
      if (error.message.includes('rate limit')) {
        res.status(429).json({
          error: 'GitHub API rate limit exceeded',
          code: 'GITHUB_RATE_LIMIT',
          retryAfter: 3600
        });
      } else if (error.message.includes('Bad credentials')) {
        res.status(401).json({
          error: 'Invalid GitHub credentials',
          code: 'INVALID_GITHUB_CREDENTIALS'
        });
      } else {
        throw error;
      }
    }
  }

  private async getTrendingRepositories(req: Request, res: Response): Promise<void> {
    const { period = 'daily' } = req.query;

    try {
      const trending = await this.githubService.getTrendingCypressRepositories(period as string);
      res.json(trending);
    } catch (error) {
      if (error.message.includes('rate limit')) {
        res.status(429).json({
          error: 'GitHub API rate limit exceeded',
          code: 'GITHUB_RATE_LIMIT',
          retryAfter: 3600
        });
      } else {
        throw error;
      }
    }
  }

  private async validateAccess(req: Request, res: Response): Promise<void> {
    const { repositoryUrl, accessToken } = req.body;

    try {
      const validation = await this.repositoryService.validateAccess(repositoryUrl, accessToken);
      res.json(validation);
    } catch (error) {
      if (error.message.includes('Insufficient permissions')) {
        res.status(403).json({
          error: 'Insufficient repository access permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      } else if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Repository not found',
          code: 'REPOSITORY_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async getBranches(req: Request, res: Response): Promise<void> {
    const { owner, repo } = req.params;
    const { accessToken } = req.query;

    try {
      const branches = await this.repositoryService.getBranches(
        owner,
        repo,
        accessToken as string
      );

      res.json(branches);
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Repository not found',
          code: 'REPOSITORY_NOT_FOUND'
        });
      } else if (error.message.includes('rate limit')) {
        res.status(429).json({
          error: 'GitHub API rate limit exceeded',
          code: 'GITHUB_RATE_LIMIT',
          retryAfter: 3600
        });
      } else {
        throw error;
      }
    }
  }

  private async getFileTree(req: Request, res: Response): Promise<void> {
    const { owner, repo } = req.params;
    const { branch = 'main', path = '', accessToken } = req.query;

    try {
      const tree = await this.repositoryService.getFileTree(
        owner,
        repo,
        branch as string,
        path as string,
        accessToken as string
      );

      res.json(tree);
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Repository or path not found',
          code: 'PATH_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async getFileContent(req: Request, res: Response): Promise<void> {
    const { owner, repo } = req.params;
    const filePath = req.params[0]; // Capture the wildcard path
    const { branch = 'main', accessToken } = req.query;

    try {
      const content = await this.repositoryService.getFileContent(
        owner,
        repo,
        filePath,
        branch as string,
        accessToken as string
      );

      // Set appropriate content type based on file extension
      const extension = filePath.split('.').pop()?.toLowerCase();
      const contentType = this.getContentType(extension);

      res.setHeader('Content-Type', contentType);
      res.json(content);
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'File not found',
          code: 'FILE_NOT_FOUND'
        });
      } else if (error.message.includes('too large')) {
        res.status(413).json({
          error: 'File too large to display',
          code: 'FILE_TOO_LARGE'
        });
      } else {
        throw error;
      }
    }
  }

  private getContentType(extension?: string): string {
    const types = {
      'js': 'application/javascript',
      'ts': 'application/typescript',
      'json': 'application/json',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'yml': 'text/yaml',
      'yaml': 'text/yaml'
    };

    return types[extension || ''] || 'text/plain';
  }
}