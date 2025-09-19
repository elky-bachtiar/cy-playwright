import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

export interface ResourceConfig {
  maxConcurrentJobs?: number;
  memoryLimit?: number; // MB
  cpuThreshold?: number; // 0-1
  diskThreshold?: number; // 0-1
  scalingPolicy?: 'aggressive' | 'conservative' | 'manual';
  autoScaleInterval?: number;
}

export interface ResourceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  activeJobs: number;
  queuedJobs: number;
  totalJobs: number;
  averageJobDuration: number;
}

export interface JobInfo {
  id: string;
  type: string;
  priority: number;
  startTime: number;
  estimatedDuration: number;
  resourceRequirements: {
    memory: number;
    cpu: number;
  };
}

export interface ScalingDecision {
  action: 'scale-up' | 'scale-down' | 'no-action';
  reason: string;
  targetWorkers: number;
  priority: 'low' | 'medium' | 'high';
}

export class ResourceManager extends EventEmitter {
  private logger = new Logger('ResourceManager');
  private config: ResourceConfig;
  private activeJobs: Map<string, JobInfo> = new Map();
  private jobQueue: JobInfo[] = [];
  private currentWorkers = 1;
  private metrics: ResourceMetrics = {
    cpuUsage: 0,
    memoryUsage: 0,
    diskUsage: 0,
    activeJobs: 0,
    queuedJobs: 0,
    totalJobs: 0,
    averageJobDuration: 0
  };
  private scalingInterval?: NodeJS.Timeout;
  private jobDurations: number[] = [];

  constructor(config: ResourceConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing resource manager');

    if (this.config.autoScaleInterval && this.config.scalingPolicy !== 'manual') {
      this.startAutoScaling();
    }

    this.logger.info('Resource manager initialized successfully');
  }

  async allocateResources(job: JobInfo): Promise<boolean> {
    // Check if we have enough resources
    if (!this.canAllocateJob(job)) {
      this.jobQueue.push(job);
      this.metrics.queuedJobs = this.jobQueue.length;
      this.logger.debug(`Job ${job.id} queued - insufficient resources`);
      return false;
    }

    this.activeJobs.set(job.id, { ...job, startTime: Date.now() });
    this.metrics.activeJobs = this.activeJobs.size;
    this.metrics.totalJobs++;

    this.logger.debug(`Resources allocated for job ${job.id}`);
    this.emit('jobStarted', job);

    return true;
  }

  async releaseResources(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    const duration = Date.now() - job.startTime;
    this.jobDurations.push(duration);

    // Keep only last 100 durations for average calculation
    if (this.jobDurations.length > 100) {
      this.jobDurations.shift();
    }

    this.activeJobs.delete(jobId);
    this.metrics.activeJobs = this.activeJobs.size;
    this.metrics.averageJobDuration = this.jobDurations.reduce((sum, d) => sum + d, 0) / this.jobDurations.length;

    this.logger.debug(`Resources released for job ${jobId} (duration: ${duration}ms)`);
    this.emit('jobCompleted', { jobId, duration });

    // Try to process queued jobs
    await this.processQueue();
  }

  async updateMetrics(): Promise<void> {
    // Simulate system metrics collection
    this.metrics.cpuUsage = Math.random() * 0.8 + 0.1; // 10-90%
    this.metrics.memoryUsage = Math.random() * 0.7 + 0.2; // 20-90%
    this.metrics.diskUsage = Math.random() * 0.5 + 0.1; // 10-60%

    this.emit('metricsUpdated', this.metrics);
  }

  async getMetrics(): Promise<ResourceMetrics> {
    await this.updateMetrics();
    return { ...this.metrics };
  }

  async evaluateScaling(): Promise<ScalingDecision> {
    await this.updateMetrics();

    const { cpuUsage, memoryUsage, activeJobs, queuedJobs } = this.metrics;
    const maxJobs = this.config.maxConcurrentJobs || 10;
    const cpuThreshold = this.config.cpuThreshold || 0.8;
    const memoryThreshold = this.config.memoryLimit ? (this.config.memoryLimit * 1024 * 1024) : Infinity;

    // Scale up conditions
    if (queuedJobs > 0 && activeJobs < maxJobs) {
      if (cpuUsage < cpuThreshold && memoryUsage < 0.8) {
        return {
          action: 'scale-up',
          reason: 'Jobs queued and resources available',
          targetWorkers: Math.min(this.currentWorkers + 1, maxJobs),
          priority: queuedJobs > 5 ? 'high' : 'medium'
        };
      }
    }

    // Scale up if resource usage is high but we can handle more jobs
    if (cpuUsage > cpuThreshold || memoryUsage > 0.9) {
      if (activeJobs < maxJobs) {
        return {
          action: 'scale-up',
          reason: 'High resource usage detected',
          targetWorkers: Math.min(this.currentWorkers + 2, maxJobs),
          priority: 'high'
        };
      }
    }

    // Scale down conditions
    if (activeJobs === 0 && queuedJobs === 0 && this.currentWorkers > 1) {
      return {
        action: 'scale-down',
        reason: 'No active or queued jobs',
        targetWorkers: 1,
        priority: 'low'
      };
    }

    if (cpuUsage < 0.3 && memoryUsage < 0.4 && queuedJobs === 0 && this.currentWorkers > 1) {
      return {
        action: 'scale-down',
        reason: 'Low resource usage',
        targetWorkers: Math.max(this.currentWorkers - 1, 1),
        priority: 'low'
      };
    }

    return {
      action: 'no-action',
      reason: 'Resource usage within acceptable range',
      targetWorkers: this.currentWorkers,
      priority: 'low'
    };
  }

  async scaleWorkers(targetWorkers: number): Promise<boolean> {
    if (targetWorkers === this.currentWorkers) {
      return true;
    }

    const previousWorkers = this.currentWorkers;
    this.currentWorkers = Math.max(1, targetWorkers);

    this.logger.info(`Scaled workers from ${previousWorkers} to ${this.currentWorkers}`);
    this.emit('workersScaled', {
      previous: previousWorkers,
      current: this.currentWorkers,
      action: targetWorkers > previousWorkers ? 'scale-up' : 'scale-down'
    });

    if (this.currentWorkers > previousWorkers) {
      // Process queued jobs after scaling up
      await this.processQueue();
    }

    return true;
  }

  private canAllocateJob(job: JobInfo): boolean {
    const maxJobs = this.config.maxConcurrentJobs || 10;
    const maxMemory = this.config.memoryLimit || 1024; // MB

    if (this.activeJobs.size >= maxJobs) {
      return false;
    }

    // Check memory requirements
    const currentMemoryUsage = Array.from(this.activeJobs.values())
      .reduce((sum, activeJob) => sum + activeJob.resourceRequirements.memory, 0);

    if (currentMemoryUsage + job.resourceRequirements.memory > maxMemory) {
      return false;
    }

    return true;
  }

  private async processQueue(): Promise<void> {
    const processableJobs = [];

    for (let i = 0; i < this.jobQueue.length; i++) {
      const job = this.jobQueue[i];
      if (this.canAllocateJob(job)) {
        processableJobs.push({ job, index: i });
      }
    }

    // Sort by priority (higher priority first)
    processableJobs.sort((a, b) => b.job.priority - a.job.priority);

    // Remove processed jobs from queue (in reverse order to maintain indices)
    for (const { job, index } of processableJobs.reverse()) {
      this.jobQueue.splice(index, 1);
      await this.allocateResources(job);
    }

    this.metrics.queuedJobs = this.jobQueue.length;
  }

  private startAutoScaling(): void {
    const interval = this.config.autoScaleInterval || 30000;
    this.scalingInterval = setInterval(async () => {
      if (this.config.scalingPolicy === 'manual') return;

      try {
        const decision = await this.evaluateScaling();

        if (decision.action !== 'no-action') {
          const shouldScale = this.config.scalingPolicy === 'aggressive' ||
                             decision.priority === 'high';

          if (shouldScale) {
            await this.scaleWorkers(decision.targetWorkers);
          }
        }
      } catch (error) {
        this.logger.error('Auto-scaling evaluation failed', error);
      }
    }, interval);

    this.logger.info(`Auto-scaling started with ${interval}ms interval`);
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down resource manager');

    if (this.scalingInterval) {
      clearInterval(this.scalingInterval);
    }

    // Wait for active jobs to complete (simplified)
    if (this.activeJobs.size > 0) {
      this.logger.info(`Waiting for ${this.activeJobs.size} active jobs to complete`);
      // In real implementation, would wait for jobs or force terminate
    }

    this.activeJobs.clear();
    this.jobQueue.length = 0;
    this.removeAllListeners();
  }

  getQueueSize(): number {
    return this.jobQueue.length;
  }

  getActiveJobs(): JobInfo[] {
    return Array.from(this.activeJobs.values());
  }

  getCurrentWorkerCount(): number {
    return this.currentWorkers;
  }
}