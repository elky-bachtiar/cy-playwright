import { Router, Request, Response, NextFunction } from 'express';
import { ConversionService } from '../../services/conversion.service';
import { RepositoryService } from '../../services/repository.service';
import { ValidationMiddleware } from '../middleware/validation';
import { AsyncHandler } from '../middleware/async-handler';
import { ConversionRequest, ConversionOptions } from '../../types/api.types';

export class ConversionRouter {
  public router: Router;
  private conversionService: ConversionService;
  private repositoryService: RepositoryService;

  constructor() {
    this.router = Router();
    this.conversionService = new ConversionService();
    this.repositoryService = new RepositoryService();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Validate repository without starting conversion
    this.router.post(
      '/validate',
      ValidationMiddleware.validateRepositoryUrl(),
      AsyncHandler.wrap(this.validateRepository.bind(this))
    );

    // Start conversion process
    this.router.post(
      '/',
      ValidationMiddleware.validateConversionRequest(),
      AsyncHandler.wrap(this.startConversion.bind(this))
    );

    // Get conversion status
    this.router.get(
      '/:jobId/status',
      ValidationMiddleware.validateJobId(),
      AsyncHandler.wrap(this.getConversionStatus.bind(this))
    );

    // Download converted project
    this.router.get(
      '/:jobId/download',
      ValidationMiddleware.validateJobId(),
      AsyncHandler.wrap(this.downloadConversion.bind(this))
    );

    // Cancel conversion
    this.router.delete(
      '/:jobId',
      ValidationMiddleware.validateJobId(),
      AsyncHandler.wrap(this.cancelConversion.bind(this))
    );

    // Get conversion logs
    this.router.get(
      '/:jobId/logs',
      ValidationMiddleware.validateJobId(),
      AsyncHandler.wrap(this.getConversionLogs.bind(this))
    );

    // List user's conversions
    this.router.get(
      '/',
      AsyncHandler.wrap(this.listConversions.bind(this))
    );
  }

  private async validateRepository(req: Request, res: Response): Promise<void> {
    const { repositoryUrl, accessToken } = req.body;

    try {
      const validation = await this.repositoryService.validateRepository(
        repositoryUrl,
        accessToken
      );

      res.json(validation);
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Repository not found or inaccessible',
          code: 'REPOSITORY_NOT_FOUND'
        });
      } else if (error.message.includes('Not a Cypress project')) {
        res.status(422).json({
          error: 'Repository is not a valid Cypress project',
          code: 'INVALID_CYPRESS_PROJECT',
          details: error.details || {}
        });
      } else {
        throw error;
      }
    }
  }

  private async startConversion(req: Request, res: Response): Promise<void> {
    const conversionRequest: ConversionRequest = {
      repositoryUrl: req.body.repositoryUrl,
      outputPath: req.body.outputPath || './converted-project',
      options: req.body.options || {},
      accessToken: req.body.accessToken,
      branch: req.body.branch || 'main',
      userEmail: req.body.userEmail
    };

    try {
      // First validate the repository
      const validation = await this.repositoryService.validateRepository(
        conversionRequest.repositoryUrl,
        conversionRequest.accessToken
      );

      if (!validation.valid) {
        return res.status(422).json({
          error: 'Repository is not a valid Cypress project',
          code: 'INVALID_CYPRESS_PROJECT',
          details: validation
        });
      }

      // Start the conversion process
      const result = await this.conversionService.startConversion({
        ...conversionRequest,
        validation
      });

      res.status(202).json({
        jobId: result.jobId,
        status: result.status,
        message: 'Conversion initiated successfully',
        estimatedDuration: result.estimatedDuration,
        queuePosition: result.queuePosition || 0
      });
    } catch (error) {
      if (error.message.includes('Rate limit')) {
        res.status(429).json({
          error: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: 60
        });
      } else if (error.message.includes('Repository not found')) {
        res.status(404).json({
          error: 'Repository not found or inaccessible',
          code: 'REPOSITORY_NOT_FOUND'
        });
      } else {
        res.status(500).json({
          error: 'Internal server error during conversion initiation',
          code: 'CONVERSION_START_ERROR',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }
  }

  private async getConversionStatus(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;

    try {
      const status = await this.conversionService.getConversionStatus(jobId);
      res.json(status);
    } catch (error) {
      if (error.message.includes('Job not found')) {
        res.status(404).json({
          error: 'Conversion job not found',
          code: 'JOB_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async downloadConversion(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;

    try {
      // Check if conversion is completed
      const status = await this.conversionService.getConversionStatus(jobId);

      if (status.status !== 'completed') {
        return res.status(400).json({
          error: 'Conversion not yet completed',
          code: 'CONVERSION_INCOMPLETE',
          currentStatus: status.status
        });
      }

      // Get download stream
      const downloadInfo = await this.conversionService.getDownloadInfo(jobId);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadInfo.filename}"`);
      res.setHeader('Content-Length', downloadInfo.size);

      const stream = await this.conversionService.getDownloadStream(jobId);
      stream.pipe(res);

      stream.on('error', (error) => {
        console.error('Download stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Error during file download',
            code: 'DOWNLOAD_ERROR'
          });
        }
      });

    } catch (error) {
      if (error.message.includes('Job not found')) {
        res.status(404).json({
          error: 'Conversion job not found',
          code: 'JOB_NOT_FOUND'
        });
      } else if (error.message.includes('Download file not available')) {
        res.status(500).json({
          error: 'Download file not available',
          code: 'DOWNLOAD_FILE_MISSING'
        });
      } else {
        throw error;
      }
    }
  }

  private async cancelConversion(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;

    try {
      // Check current status
      const status = await this.conversionService.getConversionStatus(jobId);

      if (status.status === 'completed') {
        return res.status(400).json({
          error: 'Cannot cancel completed conversion',
          code: 'CONVERSION_ALREADY_COMPLETED'
        });
      }

      if (status.status === 'failed') {
        return res.status(400).json({
          error: 'Cannot cancel failed conversion',
          code: 'CONVERSION_ALREADY_FAILED'
        });
      }

      const cancelled = await this.conversionService.cancelConversion(jobId);

      if (cancelled) {
        res.json({
          message: 'Conversion cancelled successfully',
          jobId
        });
      } else {
        res.status(400).json({
          error: 'Failed to cancel conversion',
          code: 'CANCELLATION_FAILED'
        });
      }
    } catch (error) {
      if (error.message.includes('Job not found')) {
        res.status(404).json({
          error: 'Conversion job not found',
          code: 'JOB_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async getConversionLogs(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const { level = 'info', limit = 100, offset = 0 } = req.query;

    try {
      const logs = await this.conversionService.getConversionLogs(jobId, {
        level: level as string,
        limit: Number(limit),
        offset: Number(offset)
      });

      res.json({
        jobId,
        logs: logs.entries,
        pagination: {
          total: logs.total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: logs.total > Number(offset) + Number(limit)
        }
      });
    } catch (error) {
      if (error.message.includes('Job not found')) {
        res.status(404).json({
          error: 'Conversion job not found',
          code: 'JOB_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async listConversions(req: Request, res: Response): Promise<void> {
    const {
      status,
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    try {
      const conversions = await this.conversionService.listConversions({
        status: status as string,
        limit: Number(limit),
        offset: Number(offset),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      });

      res.json({
        conversions: conversions.items,
        pagination: {
          total: conversions.total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: conversions.total > Number(offset) + Number(limit)
        }
      });
    } catch (error) {
      throw error;
    }
  }
}