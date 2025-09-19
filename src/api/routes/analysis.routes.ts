import { Router, Request, Response } from 'express';
import { AnalysisService } from '../../services/analysis.service';
import { ReportingService } from '../../services/reporting.service';
import { ValidationMiddleware } from '../middleware/validation';
import { AsyncHandler } from '../middleware/async-handler';

export class AnalysisRouter {
  public router: Router;
  private analysisService: AnalysisService;
  private reportingService: ReportingService;

  constructor() {
    this.router = Router();
    this.analysisService = new AnalysisService();
    this.reportingService = new ReportingService();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Analyze repository structure and patterns
    this.router.post(
      '/repository',
      ValidationMiddleware.validateRepositoryUrl(),
      AsyncHandler.wrap(this.analyzeRepository.bind(this))
    );

    // Analyze code complexity patterns
    this.router.post(
      '/complexity',
      ValidationMiddleware.validateRepositoryUrl(),
      AsyncHandler.wrap(this.analyzeComplexity.bind(this))
    );

    // Analyze specific test patterns
    this.router.post(
      '/patterns',
      ValidationMiddleware.validateRepositoryUrl(),
      AsyncHandler.wrap(this.analyzePatterns.bind(this))
    );

    // Compare two repositories
    this.router.post(
      '/compare',
      AsyncHandler.wrap(this.compareRepositories.bind(this))
    );

    // Get analysis benchmarks
    this.router.get(
      '/benchmarks',
      AsyncHandler.wrap(this.getBenchmarks.bind(this))
    );

    // Get analysis report
    this.router.get(
      '/reports/:jobId',
      ValidationMiddleware.validateJobId(),
      AsyncHandler.wrap(this.getAnalysisReport.bind(this))
    );

    // Start background analysis
    this.router.post(
      '/start',
      ValidationMiddleware.validateRepositoryUrl(),
      AsyncHandler.wrap(this.startAnalysis.bind(this))
    );

    // Get analysis status
    this.router.get(
      '/status/:jobId',
      ValidationMiddleware.validateJobId(),
      AsyncHandler.wrap(this.getAnalysisStatus.bind(this))
    );

    // Cancel analysis
    this.router.delete(
      '/:jobId',
      ValidationMiddleware.validateJobId(),
      AsyncHandler.wrap(this.cancelAnalysis.bind(this))
    );
  }

  private async analyzeRepository(req: Request, res: Response): Promise<void> {
    const {
      repositoryUrl,
      branch = 'main',
      accessToken,
      includePatterns = true,
      includeComplexity = true,
      includeEstimate = true
    } = req.body;

    try {
      const analysis = await this.analysisService.analyzeRepository({
        repositoryUrl,
        branch,
        accessToken,
        options: {
          includePatterns,
          includeComplexity,
          includeEstimate
        }
      });

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
          suggestion: 'Repository may be too large. Try with a smaller branch or contact support.'
        });
      } else {
        throw error;
      }
    }
  }

  private async analyzeComplexity(req: Request, res: Response): Promise<void> {
    const {
      repositoryUrl,
      branch = 'main',
      accessToken,
      includeFiles = true,
      includeMetrics = true,
      includeTypeAnalysis = false
    } = req.body;

    try {
      const complexityAnalysis = await this.analysisService.analyzeComplexity({
        repositoryUrl,
        branch,
        accessToken,
        options: {
          includeFiles,
          includeMetrics,
          includeTypeAnalysis
        }
      });

      res.json(complexityAnalysis);
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Repository not found or inaccessible',
          code: 'REPOSITORY_NOT_FOUND'
        });
      } else if (error.message.includes('timeout')) {
        res.status(408).json({
          error: 'Complexity analysis timed out',
          code: 'ANALYSIS_TIMEOUT'
        });
      } else {
        throw error;
      }
    }
  }

  private async analyzePatterns(req: Request, res: Response): Promise<void> {
    const {
      repositoryUrl,
      branch = 'main',
      accessToken,
      patternTypes = ['selectors', 'commands', 'hooks', 'intercepts']
    } = req.body;

    try {
      const patternAnalysis = await this.analysisService.analyzePatterns({
        repositoryUrl,
        branch,
        accessToken,
        patternTypes
      });

      res.json(patternAnalysis);
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Repository not found or inaccessible',
          code: 'REPOSITORY_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async compareRepositories(req: Request, res: Response): Promise<void> {
    const {
      repository1,
      repository2,
      compareFields = ['complexity', 'patterns', 'testCoverage'],
      accessToken1,
      accessToken2
    } = req.body;

    if (!repository1 || !repository2) {
      return res.status(400).json({
        error: 'Both repository URLs are required for comparison',
        code: 'MISSING_REPOSITORIES'
      });
    }

    try {
      const comparison = await this.analysisService.compareRepositories({
        repository1,
        repository2,
        compareFields,
        accessToken1,
        accessToken2
      });

      res.json(comparison);
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'One or both repositories not found',
          code: 'REPOSITORY_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async getBenchmarks(req: Request, res: Response): Promise<void> {
    const { category } = req.query;

    try {
      const benchmarks = await this.analysisService.getBenchmarks(category as string);
      res.json(benchmarks);
    } catch (error) {
      throw error;
    }
  }

  private async getAnalysisReport(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const { format = 'json' } = req.query;

    try {
      const report = await this.reportingService.getAnalysisReport(jobId, format as string);

      if (report.status === 'processing') {
        res.status(202).json(report);
      } else {
        res.json(report);
      }
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Analysis job not found',
          code: 'ANALYSIS_JOB_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async startAnalysis(req: Request, res: Response): Promise<void> {
    const {
      repositoryUrl,
      branch = 'main',
      accessToken,
      analysisTypes = ['repository', 'complexity', 'patterns'],
      priority = 'normal'
    } = req.body;

    try {
      const analysisJob = await this.analysisService.startBackgroundAnalysis({
        repositoryUrl,
        branch,
        accessToken,
        analysisTypes,
        priority
      });

      res.status(202).json({
        jobId: analysisJob.jobId,
        status: analysisJob.status,
        message: 'Analysis started successfully',
        estimatedDuration: analysisJob.estimatedDuration,
        queuePosition: analysisJob.queuePosition
      });
    } catch (error) {
      if (error.message.includes('Rate limit')) {
        res.status(429).json({
          error: 'Analysis rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: 300
        });
      } else if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Repository not found or inaccessible',
          code: 'REPOSITORY_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async getAnalysisStatus(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;

    try {
      const status = await this.analysisService.getAnalysisStatus(jobId);
      res.json(status);
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Analysis job not found',
          code: 'ANALYSIS_JOB_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async cancelAnalysis(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;

    try {
      const cancelled = await this.analysisService.cancelAnalysis(jobId);

      if (cancelled) {
        res.json({
          message: 'Analysis cancelled successfully',
          jobId
        });
      } else {
        res.status(400).json({
          error: 'Failed to cancel analysis',
          code: 'CANCELLATION_FAILED'
        });
      }
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Analysis job not found',
          code: 'ANALYSIS_JOB_NOT_FOUND'
        });
      } else if (error.message.includes('already completed')) {
        res.status(400).json({
          error: 'Cannot cancel completed analysis',
          code: 'ANALYSIS_ALREADY_COMPLETED'
        });
      } else {
        throw error;
      }
    }
  }
}