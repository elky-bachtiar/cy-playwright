import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

export interface Job {
  id: string;
  type: string;
  data: any;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processAt: Date;
  timeout?: number;
  metadata?: any;
}

export interface JobResult {
  jobId: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  attempts: number;
}

export interface ProcessorConfig {
  concurrency: number;
  maxRetries: number;
  retryDelay: number;
  defaultTimeout: number;
  pollInterval: number;
}

export interface JobHandler {
  (job: Job): Promise<any>;
}

export class JobProcessor extends EventEmitter {
  private logger = new Logger('JobProcessor');
  private config: ProcessorConfig;
  private handlers: Map<string, JobHandler> = new Map();
  private queue: Job[] = [];
  private processing: Map<string, Job> = new Map();
  private completed: Map<string, JobResult> = new Map();
  private running = false;
  private processingInterval?: NodeJS.Timeout;

  constructor(config: Partial<ProcessorConfig> = {}) {
    super();
    this.config = {
      concurrency: 5,
      maxRetries: 3,
      retryDelay: 1000,
      defaultTimeout: 30000,
      pollInterval: 1000,
      ...config
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.logger.info('Starting job processor');
    this.running = true;

    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.config.pollInterval);

    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.logger.info('Stopping job processor');
    this.running = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    // Wait for active jobs to complete
    while (this.processing.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.emit('stopped');
  }

  registerHandler(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
    this.logger.info(`Registered handler for job type: ${jobType}`);
  }

  unregisterHandler(jobType: string): boolean {
    const existed = this.handlers.delete(jobType);
    if (existed) {
      this.logger.info(`Unregistered handler for job type: ${jobType}`);
    }
    return existed;
  }

  async addJob(job: Omit<Job, 'id' | 'createdAt' | 'attempts'>): Promise<string> {
    const fullJob: Job = {
      ...job,
      id: this.generateJobId(),
      createdAt: new Date(),
      attempts: 0
    };

    this.queue.push(fullJob);
    this.sortQueue();

    this.logger.info(`Added job to queue: ${fullJob.id}`, {
      type: fullJob.type,
      priority: fullJob.priority
    });

    this.emit('jobAdded', fullJob);
    return fullJob.id;
  }

  async cancelJob(jobId: string): Promise<boolean> {
    // Remove from queue
    const queueIndex = this.queue.findIndex(job => job.id === jobId);
    if (queueIndex >= 0) {
      const job = this.queue.splice(queueIndex, 1)[0];
      this.logger.info(`Cancelled queued job: ${jobId}`);
      this.emit('jobCancelled', job);
      return true;
    }

    // Check if currently processing
    if (this.processing.has(jobId)) {
      this.logger.warn(`Cannot cancel job currently being processed: ${jobId}`);
      return false;
    }

    return false;
  }

  getJob(jobId: string): Job | undefined {
    // Check queue
    const queuedJob = this.queue.find(job => job.id === jobId);
    if (queuedJob) {
      return queuedJob;
    }

    // Check processing
    return this.processing.get(jobId);
  }

  getQueuedJobs(): Job[] {
    return [...this.queue];
  }

  getProcessingJobs(): Job[] {
    return Array.from(this.processing.values());
  }

  getJobResult(jobId: string): JobResult | undefined {
    return this.completed.get(jobId);
  }

  getAllResults(): JobResult[] {
    return Array.from(this.completed.values())
      .sort((a, b) => b.attempts - a.attempts);
  }

  getStats(): any {
    return {
      running: this.running,
      queueSize: this.queue.length,
      processing: this.processing.size,
      completed: this.completed.size,
      registeredHandlers: this.handlers.size,
      config: this.config
    };
  }

  async clearCompleted(): Promise<void> {
    this.completed.clear();
    this.logger.info('Cleared completed job results');
  }

  private processQueue(): void {
    if (!this.running || this.processing.size >= this.config.concurrency) {
      return;
    }

    const now = new Date();
    const availableSlots = this.config.concurrency - this.processing.size;

    for (let i = 0; i < availableSlots && this.queue.length > 0; i++) {
      const job = this.queue.find(j => j.processAt <= now);
      if (!job) {
        break; // No jobs ready to process
      }

      // Remove from queue and start processing
      const jobIndex = this.queue.indexOf(job);
      this.queue.splice(jobIndex, 1);
      this.processing.set(job.id, job);

      this.processJob(job).catch(error => {
        this.logger.error(`Unexpected error processing job ${job.id}`, error);
      });
    }
  }

  private async processJob(job: Job): Promise<void> {
    const startTime = Date.now();
    job.attempts++;

    this.logger.info(`Processing job: ${job.id}`, {
      type: job.type,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts
    });

    this.emit('jobStarted', job);

    try {
      const handler = this.handlers.get(job.type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      const timeout = job.timeout || this.config.defaultTimeout;
      const result = await this.executeWithTimeout(handler, job, timeout);

      const duration = Date.now() - startTime;
      const jobResult: JobResult = {
        jobId: job.id,
        success: true,
        result,
        duration,
        attempts: job.attempts
      };

      this.completed.set(job.id, jobResult);
      this.processing.delete(job.id);

      this.logger.info(`Job completed: ${job.id}`, { duration });
      this.emit('jobCompleted', job, jobResult);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Job failed: ${job.id}`, {
        error: errorMessage,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts
      });

      if (job.attempts < job.maxAttempts) {
        // Retry the job
        job.processAt = new Date(Date.now() + this.config.retryDelay);
        this.queue.push(job);
        this.sortQueue();
        this.processing.delete(job.id);

        this.logger.info(`Job scheduled for retry: ${job.id}`, {
          nextAttempt: job.processAt
        });
        this.emit('jobRetry', job);

      } else {
        // Mark as failed
        const jobResult: JobResult = {
          jobId: job.id,
          success: false,
          error: errorMessage,
          duration,
          attempts: job.attempts
        };

        this.completed.set(job.id, jobResult);
        this.processing.delete(job.id);

        this.logger.error(`Job permanently failed: ${job.id}`);
        this.emit('jobFailed', job, jobResult);
      }
    }
  }

  private async executeWithTimeout<T>(
    handler: JobHandler,
    job: Job,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      handler(job)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private sortQueue(): void {
    // Sort by priority (higher first) and then by processAt time
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.processAt.getTime() - b.processAt.getTime();
    });
  }

  private generateJobId(): string {
    return `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async shutdown(): Promise<void> {
    await this.stop();
    this.removeAllListeners();
    this.handlers.clear();
    this.queue.length = 0;
    this.processing.clear();
    this.completed.clear();
  }
}