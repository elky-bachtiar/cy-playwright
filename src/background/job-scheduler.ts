import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

export interface JobDefinition {
  id: string;
  name: string;
  schedule: string; // Cron expression
  handler: () => Promise<void>;
  enabled: boolean;
  timeout?: number;
  retries?: number;
  metadata?: any;
}

export interface JobExecution {
  id: string;
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  result?: any;
}

export interface SchedulerConfig {
  timezone?: string;
  maxConcurrentJobs?: number;
  defaultTimeout?: number;
  defaultRetries?: number;
  checkInterval?: number;
}

export class JobScheduler extends EventEmitter {
  private logger = new Logger('JobScheduler');
  private config: SchedulerConfig;
  private jobs: Map<string, JobDefinition> = new Map();
  private executions: Map<string, JobExecution> = new Map();
  private running = false;
  private schedulerInterval?: NodeJS.Timeout;
  private activeJobs = 0;

  constructor(config: SchedulerConfig = {}) {
    super();
    this.config = {
      timezone: 'UTC',
      maxConcurrentJobs: 5,
      defaultTimeout: 30000,
      defaultRetries: 3,
      checkInterval: 1000,
      ...config
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.logger.info('Starting job scheduler');
    this.running = true;

    this.schedulerInterval = setInterval(() => {
      this.checkScheduledJobs();
    }, this.config.checkInterval);

    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.logger.info('Stopping job scheduler');
    this.running = false;

    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }

    // Wait for active jobs to complete
    while (this.activeJobs > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.emit('stopped');
  }

  addJob(job: JobDefinition): void {
    this.logger.info(`Adding job: ${job.id}`, { name: job.name, schedule: job.schedule });
    this.jobs.set(job.id, job);
    this.emit('jobAdded', job);
  }

  removeJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job) {
      this.jobs.delete(jobId);
      this.logger.info(`Removed job: ${jobId}`);
      this.emit('jobRemoved', job);
      return true;
    }
    return false;
  }

  getJob(jobId: string): JobDefinition | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): JobDefinition[] {
    return Array.from(this.jobs.values());
  }

  enableJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job) {
      job.enabled = true;
      this.logger.info(`Enabled job: ${jobId}`);
      return true;
    }
    return false;
  }

  disableJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job) {
      job.enabled = false;
      this.logger.info(`Disabled job: ${jobId}`);
      return true;
    }
    return false;
  }

  async executeJob(jobId: string): Promise<JobExecution> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const executionId = `${jobId}-${Date.now()}`;
    const execution: JobExecution = {
      id: executionId,
      jobId,
      status: 'running',
      startTime: new Date()
    };

    this.executions.set(executionId, execution);
    this.activeJobs++;

    this.logger.info(`Executing job: ${jobId}`, { executionId });
    this.emit('jobStarted', execution);

    try {
      const timeout = job.timeout || this.config.defaultTimeout!;
      const result = await this.executeWithTimeout(job.handler, timeout);

      execution.status = 'completed';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.result = result;

      this.logger.info(`Job completed: ${jobId}`, {
        executionId,
        duration: execution.duration
      });
      this.emit('jobCompleted', execution);

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.error = error instanceof Error ? error.message : String(error);

      this.logger.error(`Job failed: ${jobId}`, {
        executionId,
        error: execution.error
      });
      this.emit('jobFailed', execution);
    } finally {
      this.activeJobs--;
    }

    return execution;
  }

  getExecution(executionId: string): JobExecution | undefined {
    return this.executions.get(executionId);
  }

  getJobExecutions(jobId: string): JobExecution[] {
    return Array.from(this.executions.values())
      .filter(exec => exec.jobId === jobId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  getAllExecutions(): JobExecution[] {
    return Array.from(this.executions.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  getSchedulerStats(): any {
    const jobs = Array.from(this.jobs.values());
    const executions = Array.from(this.executions.values());

    return {
      running: this.running,
      totalJobs: jobs.length,
      enabledJobs: jobs.filter(j => j.enabled).length,
      activeJobs: this.activeJobs,
      totalExecutions: executions.length,
      completedExecutions: executions.filter(e => e.status === 'completed').length,
      failedExecutions: executions.filter(e => e.status === 'failed').length,
      config: this.config
    };
  }

  async clearExecutionHistory(): Promise<void> {
    this.executions.clear();
    this.logger.info('Cleared execution history');
  }

  private checkScheduledJobs(): void {
    if (this.activeJobs >= this.config.maxConcurrentJobs!) {
      return; // Too many active jobs
    }

    const now = new Date();

    for (const job of this.jobs.values()) {
      if (!job.enabled) {
        continue;
      }

      // Simple schedule checking - in real implementation would use cron parser
      if (this.shouldRunJob(job, now)) {
        this.executeJob(job.id).catch(error => {
          this.logger.error(`Failed to execute scheduled job: ${job.id}`, error);
        });
      }
    }
  }

  private shouldRunJob(job: JobDefinition, now: Date): boolean {
    // Simplified schedule checking for testing
    // In real implementation, would parse cron expression
    const lastExecution = this.getJobExecutions(job.id)[0];

    if (!lastExecution) {
      return true; // Never run before
    }

    // Simple rule: run every minute for testing
    const timeSinceLastRun = now.getTime() - lastExecution.startTime.getTime();
    return timeSinceLastRun > 60000; // 1 minute
  }

  private async executeWithTimeout<T>(
    handler: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      handler()
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

  async shutdown(): Promise<void> {
    await this.stop();
    this.removeAllListeners();
    this.jobs.clear();
    this.executions.clear();
  }
}