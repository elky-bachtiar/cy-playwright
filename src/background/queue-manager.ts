import Bull from 'bull';
import Redis from 'ioredis';
import { Logger } from '../utils/logger';
import { ConversionQueue } from './conversion-queue';
import { AnalysisQueue } from './analysis-queue';
import { ReportingQueue } from './reporting-queue';

export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  defaultJobOptions: {
    removeOnComplete: number;
    removeOnFail: number;
    attempts: number;
    backoff: string | object;
  };
  concurrency: {
    conversion: number;
    analysis: number;
    reporting: number;
  };
}

export interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: string | object;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  repeat?: object;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}

export interface QueueHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  queues: Record<string, {
    status: 'healthy' | 'degraded' | 'unhealthy';
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }>;
  workers: number;
  memory: number;
}

export class QueueManager {
  private logger = new Logger('QueueManager');
  private redisClient: Redis;
  private queues: Map<string, Bull.Queue> = new Map();
  private conversionQueue: ConversionQueue;
  private analysisQueue: AnalysisQueue;
  private reportingQueue: ReportingQueue;
  private config: QueueConfig;
  private initialized = false;

  constructor(config?: Partial<QueueConfig>) {
    this.config = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0')
      },
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 3,
        backoff: 'exponential'
      },
      concurrency: {
        conversion: parseInt(process.env.CONVERSION_CONCURRENCY || '2'),
        analysis: parseInt(process.env.ANALYSIS_CONCURRENCY || '1'),
        reporting: parseInt(process.env.REPORTING_CONCURRENCY || '1')
      },
      ...config
    };
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing queue manager');

      // Initialize Redis connection
      this.redisClient = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true
      });

      await this.redisClient.connect();

      // Initialize specialized queues
      this.conversionQueue = new ConversionQueue(this.config);
      this.analysisQueue = new AnalysisQueue(this.config);
      this.reportingQueue = new ReportingQueue(this.config);

      await this.conversionQueue.initialize();
      await this.analysisQueue.initialize();
      await this.reportingQueue.initialize();

      // Register queues in manager
      this.queues.set('conversion', this.conversionQueue.getQueue());
      this.queues.set('analysis', this.analysisQueue.getQueue());
      this.queues.set('reporting', this.reportingQueue.getQueue());

      // Setup error handlers
      this.setupErrorHandlers();

      this.initialized = true;
      this.logger.info('Queue manager initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize queue manager', error);
      throw error;
    }
  }

  async addJob(queueName: string, data: any, options: JobOptions = {}): Promise<Bull.Job> {
    if (!this.initialized) {
      throw new Error('Queue manager not initialized');
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const jobOptions = {
      ...this.config.defaultJobOptions,
      ...options
    };

    this.logger.debug(`Adding job to ${queueName} queue`, { data, options: jobOptions });

    const job = await queue.add(data, jobOptions);

    this.logger.info(`Job added to ${queueName} queue`, {
      jobId: job.id,
      priority: jobOptions.priority
    });

    return job;
  }

  async getJob(queueName: string, jobId: string | number): Promise<Bull.Job | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    return await queue.getJob(jobId);
  }

  async cancelJob(queueName: string, jobId: string | number): Promise<boolean> {
    try {
      const job = await this.getJob(queueName, jobId);
      if (!job) {
        return false;
      }

      await job.remove();
      this.logger.info(`Job cancelled`, { queueName, jobId });
      return true;

    } catch (error) {
      this.logger.error(`Failed to cancel job`, { queueName, jobId, error });
      return false;
    }
  }

  async processJob(queueName: string, processor: (job: Bull.Job) => Promise<any>): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const concurrency = this.config.concurrency[queueName as keyof typeof this.config.concurrency] || 1;

    queue.process(concurrency, async (job: Bull.Job) => {
      this.logger.info(`Processing job`, {
        queueName,
        jobId: job.id,
        attemptsMade: job.attemptsMade
      });

      try {
        const result = await processor(job);
        this.logger.info(`Job completed successfully`, { queueName, jobId: job.id });
        return result;

      } catch (error) {
        this.logger.error(`Job failed`, { queueName, jobId: job.id, error: error.message });
        throw error;
      }
    });
  }

  async getQueueStats(queueName: string): Promise<QueueStats> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + completed.length + failed.length + delayed.length
    };
  }

  async getHealth(): Promise<QueueHealth> {
    const health: QueueHealth = {
      status: 'healthy',
      queues: {},
      workers: 0,
      memory: process.memoryUsage().heapUsed
    };

    for (const [queueName, queue] of this.queues) {
      try {
        const stats = await this.getQueueStats(queueName);

        let queueStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

        // Determine queue health based on metrics
        if (stats.failed > 10 || stats.waiting > 100) {
          queueStatus = 'degraded';
        }
        if (stats.failed > 50 || stats.waiting > 500) {
          queueStatus = 'unhealthy';
        }

        health.queues[queueName] = {
          status: queueStatus,
          waiting: stats.waiting,
          active: stats.active,
          completed: stats.completed,
          failed: stats.failed
        };

        health.workers += stats.active;

        // Update overall health
        if (queueStatus === 'unhealthy') {
          health.status = 'unhealthy';
        } else if (queueStatus === 'degraded' && health.status === 'healthy') {
          health.status = 'degraded';
        }

      } catch (error) {
        this.logger.error(`Failed to get health for queue ${queueName}`, error);
        health.queues[queueName] = {
          status: 'unhealthy',
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0
        };
        health.status = 'unhealthy';
      }
    }

    return health;
  }

  async getMetrics(): Promise<any> {
    const metrics = {
      timestamp: new Date().toISOString(),
      queues: {} as any,
      workers: {
        total: 0,
        active: 0,
        idle: 0
      },
      system: {
        memory: process.memoryUsage().heapUsed,
        cpu: process.cpuUsage(),
        connections: this.redisClient.status === 'ready' ? 1 : 0
      }
    };

    for (const [queueName, queue] of this.queues) {
      try {
        const stats = await this.getQueueStats(queueName);

        metrics.queues[queueName] = {
          throughput: await this.calculateThroughput(queueName),
          averageWaitTime: await this.calculateAverageWaitTime(queueName),
          averageProcessingTime: await this.calculateAverageProcessingTime(queueName),
          errorRate: stats.failed / (stats.completed + stats.failed || 1),
          ...stats
        };

        metrics.workers.total += this.config.concurrency[queueName as keyof typeof this.config.concurrency] || 1;
        metrics.workers.active += stats.active;

      } catch (error) {
        this.logger.error(`Failed to get metrics for queue ${queueName}`, error);
      }
    }

    metrics.workers.idle = metrics.workers.total - metrics.workers.active;

    return metrics;
  }

  getQueue(queueName: string): Bull.Queue | undefined {
    return this.queues.get(queueName);
  }

  getRedisClient(): Redis {
    return this.redisClient;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down queue manager');

    try {
      // Close all queues
      for (const [queueName, queue] of this.queues) {
        this.logger.debug(`Closing queue: ${queueName}`);
        await queue.close();
      }

      // Close specialized queues
      if (this.conversionQueue) {
        await this.conversionQueue.shutdown();
      }
      if (this.analysisQueue) {
        await this.analysisQueue.shutdown();
      }
      if (this.reportingQueue) {
        await this.reportingQueue.shutdown();
      }

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      this.queues.clear();
      this.initialized = false;

      this.logger.info('Queue manager shut down successfully');

    } catch (error) {
      this.logger.error('Error during queue manager shutdown', error);
      throw error;
    }
  }

  private setupErrorHandlers(): void {
    this.redisClient.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });

    this.redisClient.on('connect', () => {
      this.logger.info('Redis connected');
    });

    this.redisClient.on('disconnect', () => {
      this.logger.warn('Redis disconnected');
    });

    // Setup queue error handlers
    for (const [queueName, queue] of this.queues) {
      queue.on('error', (error) => {
        this.logger.error(`Queue error in ${queueName}`, error);
      });

      queue.on('failed', (job, error) => {
        this.logger.error(`Job failed in ${queueName}`, {
          jobId: job.id,
          error: error.message,
          attemptsMade: job.attemptsMade
        });
      });

      queue.on('stalled', (job) => {
        this.logger.warn(`Job stalled in ${queueName}`, { jobId: job.id });
      });
    }
  }

  private async calculateThroughput(queueName: string): Promise<number> {
    // Calculate jobs per hour for the last 24 hours
    try {
      const queue = this.queues.get(queueName);
      if (!queue) return 0;

      const completedJobs = await queue.getCompleted();
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);

      const recentCompleted = completedJobs.filter(job =>
        job.finishedOn && job.finishedOn > oneDayAgo
      );

      return recentCompleted.length;

    } catch (error) {
      this.logger.error(`Failed to calculate throughput for ${queueName}`, error);
      return 0;
    }
  }

  private async calculateAverageWaitTime(queueName: string): Promise<number> {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) return 0;

      const activeJobs = await queue.getActive();
      if (activeJobs.length === 0) return 0;

      const waitTimes = activeJobs.map(job => {
        if (job.processedOn && job.timestamp) {
          return job.processedOn - job.timestamp;
        }
        return 0;
      }).filter(time => time > 0);

      return waitTimes.length > 0
        ? waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length
        : 0;

    } catch (error) {
      this.logger.error(`Failed to calculate average wait time for ${queueName}`, error);
      return 0;
    }
  }

  private async calculateAverageProcessingTime(queueName: string): Promise<number> {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) return 0;

      const completedJobs = await queue.getCompleted();
      if (completedJobs.length === 0) return 0;

      const processingTimes = completedJobs.map(job => {
        if (job.finishedOn && job.processedOn) {
          return job.finishedOn - job.processedOn;
        }
        return 0;
      }).filter(time => time > 0);

      return processingTimes.length > 0
        ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
        : 0;

    } catch (error) {
      this.logger.error(`Failed to calculate average processing time for ${queueName}`, error);
      return 0;
    }
  }
}