import { Router, Request, Response } from 'express';
import { HealthService } from '../../services/health.service';
import { MetricsService } from '../../services/metrics.service';
import { AsyncHandler } from '../middleware/async-handler';

export class HealthRouter {
  public router: Router;
  private healthService: HealthService;
  private metricsService: MetricsService;

  constructor() {
    this.router = Router();
    this.healthService = new HealthService();
    this.metricsService = new MetricsService();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Basic health check
    this.router.get('/', AsyncHandler.wrap(this.getHealth.bind(this)));

    // Detailed health information
    this.router.get('/detailed', AsyncHandler.wrap(this.getDetailedHealth.bind(this)));

    // Readiness probe (for Kubernetes)
    this.router.get('/readiness', AsyncHandler.wrap(this.getReadiness.bind(this)));

    // Liveness probe (for Kubernetes)
    this.router.get('/liveness', AsyncHandler.wrap(this.getLiveness.bind(this)));

    // Application metrics
    this.router.get('/metrics', AsyncHandler.wrap(this.getMetrics.bind(this)));
  }

  private async getHealth(req: Request, res: Response): Promise<void> {
    const health = await this.healthService.getBasicHealth();

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  }

  private async getDetailedHealth(req: Request, res: Response): Promise<void> {
    const health = await this.healthService.getDetailedHealth();

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  }

  private async getReadiness(req: Request, res: Response): Promise<void> {
    const readiness = await this.healthService.getReadiness();

    const statusCode = readiness.status === 'ready' ? 200 : 503;
    res.status(statusCode).json(readiness);
  }

  private async getLiveness(req: Request, res: Response): Promise<void> {
    const liveness = await this.healthService.getLiveness();

    res.status(200).json({
      ...liveness,
      process: {
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime()
      }
    });
  }

  private async getMetrics(req: Request, res: Response): Promise<void> {
    const { history } = req.query;

    const metrics = await this.metricsService.getMetrics({
      includeHistory: history === 'true' || typeof history === 'string'
    });

    res.json({
      timestamp: new Date().toISOString(),
      ...metrics
    });
  }
}