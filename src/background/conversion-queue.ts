import Bull from 'bull';
import { Logger } from '../utils/logger';
import { ConversionService } from '../services/conversion.service';
import { ConversionRequest, ConversionStatus } from '../types/api.types';

export interface ConversionJobData extends ConversionRequest {
  jobId?: string;
  validation?: any;
  priority?: 'low' | 'normal' | 'high';
  estimatedDuration?: number;
}

export interface ConversionJobResult {
  status: 'completed' | 'failed';
  jobId: string;
  filesConverted?: number;
  downloadPath?: string;
  validationResults?: any;
  error?: string;
  warnings?: any[];
}

export class ConversionQueue {
  private logger = new Logger('ConversionQueue');
  private queue: Bull.Queue;
  private conversionService: ConversionService;
  private config: any;
  private processor?: (job: Bull.Job) => Promise<any>;

  constructor(config: any) {
    this.config = config;
    this.conversionService = new ConversionService();
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing conversion queue');

      this.queue = new Bull('conversion', {
        redis: this.config.redis,
        defaultJobOptions: {
          ...this.config.defaultJobOptions,
          removeOnComplete: 100,
          removeOnFail: 50
        }
      });

      // Set up default processor
      this.setupDefaultProcessor();

      // Set up event handlers
      this.setupEventHandlers();

      this.logger.info('Conversion queue initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize conversion queue', error);
      throw error;
    }
  }

  async addConversionJob(data: ConversionJobData): Promise<Bull.Job> {
    const jobOptions: Bull.JobOptions = {
      priority: this.getPriorityValue(data.priority),
      delay: 0,
      attempts: 3,
      backoff: 'exponential',
      removeOnComplete: true,
      removeOnFail: false
    };

    // Add estimated duration if not provided
    if (!data.estimatedDuration) {
      data.estimatedDuration = this.estimateJobDuration(data);
    }

    const job = await this.queue.add('convert-repository', data, jobOptions);

    this.logger.info('Conversion job added to queue', {
      jobId: job.id,
      repositoryUrl: data.repositoryUrl,
      priority: data.priority,
      estimatedDuration: data.estimatedDuration
    });

    return job;
  }

  async getJobStatus(jobId: string | number): Promise<ConversionStatus> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    const progress = job.progress();

    let status: ConversionStatus['status'];
    switch (state) {
      case 'waiting':
      case 'delayed':
        status = 'queued';
        break;
      case 'active':
        status = 'processing';
        break;
      case 'completed':
        status = 'completed';
        break;
      case 'failed':
        status = 'failed';
        break;
      default:
        status = 'queued';
    }

    const conversionStatus: ConversionStatus = {
      jobId: job.id.toString(),
      status,
      progress: typeof progress === 'number' ? progress : 0,
      currentStep: this.getCurrentStep(progress),
      filesProcessed: 0,
      totalFiles: 0,
      startTime: job.processedOn ? new Date(job.processedOn).toISOString() : new Date().toISOString()
    };

    if (job.finishedOn) {
      conversionStatus.completionTime = new Date(job.finishedOn).toISOString();
    }

    if (job.failedReason) {
      conversionStatus.error = job.failedReason;
      conversionStatus.errorCode = this.extractErrorCode(job.failedReason);
    }

    if (state === 'completed' && job.returnvalue) {
      conversionStatus.downloadUrl = `/api/convert/${jobId}/download`;
      conversionStatus.validationResults = job.returnvalue.validationResults;
    }

    return conversionStatus;
  }

  estimateCompletionTime(jobId: string | number): number {
    // Estimate based on queue position and average processing time
    const averageProcessingTime = 30 * 60 * 1000; // 30 minutes default
    const queuePosition = this.getQueuePosition(jobId);
    return Date.now() + (queuePosition * averageProcessingTime);
  }

  onProgress(jobId: string | number, callback: (progress: number) => void): void {
    this.queue.on('progress', (job, progress) => {
      if (job.id === jobId) {
        callback(progress);
      }
    });
  }

  async getStats(): Promise<any> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaiting(),
      this.queue.getActive(),
      this.queue.getCompleted(),
      this.queue.getFailed()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    };
  }

  setProcessor(processor: (job: Bull.Job) => Promise<any>): void {
    this.processor = processor;
    this.queue.process('convert-repository', this.config.concurrency.conversion, processor);
  }

  getQueue(): Bull.Queue {
    return this.queue;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down conversion queue');

    try {
      await this.queue.close();
      this.logger.info('Conversion queue shut down successfully');
    } catch (error) {
      this.logger.error('Error shutting down conversion queue', error);
      throw error;
    }
  }

  private setupDefaultProcessor(): void {
    this.queue.process('convert-repository', this.config.concurrency.conversion, async (job: Bull.Job) => {
      return await this.processConversionJob(job);
    });
  }

  private async processConversionJob(job: Bull.Job): Promise<ConversionJobResult> {
    const data: ConversionJobData = job.data;

    try {
      this.logger.info('Starting conversion job processing', {
        jobId: job.id,
        repositoryUrl: data.repositoryUrl
      });

      // Update progress: Repository validation
      await job.progress(10);

      // Clone repository
      await job.progress(25);
      const cloneResult = await this.conversionService.cloneRepository(
        data.repositoryUrl,
        data.accessToken,
        data.branch
      );

      // Convert project files
      await job.progress(50);
      const conversionResult = await this.conversionService.convertProject(
        cloneResult.localPath,
        data.outputPath,
        data.options
      );

      // Generate package files
      await job.progress(75);
      await this.conversionService.generatePackageFiles(
        data.outputPath,
        conversionResult.config
      );

      // Validate conversion
      await job.progress(90);
      const validationResults = await this.conversionService.validateConversion(
        data.outputPath
      );

      // Create download package
      await job.progress(95);
      const downloadPath = await this.conversionService.createDownloadPackage(
        data.outputPath,
        job.id.toString()
      );

      await job.progress(100);

      const result: ConversionJobResult = {
        status: 'completed',
        jobId: job.id.toString(),
        filesConverted: conversionResult.filesConverted,
        downloadPath,
        validationResults
      };

      this.logger.info('Conversion job completed successfully', {
        jobId: job.id,
        filesConverted: result.filesConverted
      });

      return result;

    } catch (error) {
      this.logger.error('Conversion job failed', {
        jobId: job.id,
        repositoryUrl: data.repositoryUrl,
        error: error.message
      });

      const result: ConversionJobResult = {
        status: 'failed',
        jobId: job.id.toString(),
        error: error.message
      };

      throw error;
    } finally {
      // Cleanup temporary files
      await this.cleanupTempFiles(job.id.toString());
    }
  }

  private async cleanupTempFiles(jobId: string): Promise<void> {
    try {
      await this.conversionService.cleanupTempFiles(jobId);
      this.logger.debug('Temporary files cleaned up', { jobId });
    } catch (error) {
      this.logger.warn('Failed to cleanup temporary files', { jobId, error: error.message });
    }
  }

  private setupEventHandlers(): void {
    this.queue.on('completed', (job, result) => {
      this.logger.info('Conversion job completed', {
        jobId: job.id,
        processingTime: job.finishedOn - job.processedOn
      });
    });

    this.queue.on('failed', (job, error) => {
      this.logger.error('Conversion job failed', {
        jobId: job.id,
        error: error.message,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts
      });
    });

    this.queue.on('progress', (job, progress) => {
      this.logger.debug('Conversion job progress updated', {
        jobId: job.id,
        progress
      });
    });

    this.queue.on('stalled', (job) => {
      this.logger.warn('Conversion job stalled', { jobId: job.id });
    });

    this.queue.on('error', (error) => {
      this.logger.error('Conversion queue error', error);
    });
  }

  private getPriorityValue(priority: string = 'normal'): number {
    const priorityMap = {
      'high': 1,
      'normal': 10,
      'low': 20
    };

    return priorityMap[priority] || 10;
  }

  private estimateJobDuration(data: ConversionJobData): number {
    // Base time: 15 minutes
    let estimatedMs = 15 * 60 * 1000;

    // Adjust based on validation data
    if (data.validation) {
      const testFileCount = data.validation.testFiles?.length || 5;
      estimatedMs += testFileCount * 2 * 60 * 1000; // 2 minutes per test file

      if (data.validation.complexity === 'high') {
        estimatedMs *= 1.5;
      } else if (data.validation.complexity === 'low') {
        estimatedMs *= 0.8;
      }
    }

    // Adjust based on options
    if (data.options?.generateTypes) {
      estimatedMs += 5 * 60 * 1000; // +5 minutes for TypeScript generation
    }

    return Math.min(estimatedMs, 2 * 60 * 60 * 1000); // Max 2 hours
  }

  private getCurrentStep(progress: number): string {
    if (progress < 25) return 'Cloning repository';
    if (progress < 50) return 'Analyzing project structure';
    if (progress < 75) return 'Converting test files';
    if (progress < 90) return 'Generating configuration';
    if (progress < 100) return 'Creating download package';
    return 'Completed';
  }

  private getQueuePosition(jobId: string | number): number {
    // Simplified queue position calculation
    // In a real implementation, this would check the actual queue position
    return 1;
  }

  private extractErrorCode(errorMessage: string): string {
    // Extract error codes from common error patterns
    if (errorMessage.includes('Repository not found')) {
      return 'REPOSITORY_NOT_FOUND';
    }
    if (errorMessage.includes('Access denied')) {
      return 'ACCESS_DENIED';
    }
    if (errorMessage.includes('timeout')) {
      return 'CONVERSION_TIMEOUT';
    }
    if (errorMessage.includes('Not a Cypress project')) {
      return 'INVALID_CYPRESS_PROJECT';
    }

    return 'CONVERSION_ERROR';
  }
}