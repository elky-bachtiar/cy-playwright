import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { ConversionRouter } from './routes/conversion.routes';
import { RepositoryRouter } from './routes/repository.routes';
import { AnalysisRouter } from './routes/analysis.routes';
import { ReportingRouter } from './routes/reporting.routes';
import { HealthRouter } from './routes/health.routes';
import { ErrorHandler } from './middleware/error-handler';
import { RequestLogger } from './middleware/request-logger';
import { ValidationMiddleware } from './middleware/validation';

export class ApiApplication {
  private app: express.Application;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true,
      maxAge: 86400 // 24 hours
    }));

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(compression());

    // Request ID and logging
    this.app.use((req, res, next) => {
      req.id = uuidv4();
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    this.app.use(RequestLogger.middleware());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 100 : 1000,
      message: {
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: req.rateLimit ? Math.ceil(req.rateLimit.resetTime.getTime() / 1000) : 60
        });
      }
    });

    this.app.use('/api/', limiter);
  }

  private setupRoutes(): void {
    // Health check (no rate limiting)
    this.app.use('/api/health', new HealthRouter().router);

    // API routes
    this.app.use('/api/convert', new ConversionRouter().router);
    this.app.use('/api/repository', new RepositoryRouter().router);
    this.app.use('/api/analysis', new AnalysisRouter().router);
    this.app.use('/api/reports', new ReportingRouter().router);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Cypress to Playwright Converter API',
        version: process.env.npm_package_version || '1.0.0',
        status: 'running',
        documentation: '/api/docs',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        code: 'ENDPOINT_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
        suggestion: 'Check the API documentation for available endpoints'
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(ErrorHandler.middleware());
  }

  public getApp(): express.Application {
    return this.app;
  }

  public listen(port: number, callback?: () => void): void {
    this.app.listen(port, callback);
  }
}

// Export singleton instance
export const app = new ApiApplication().getApp();