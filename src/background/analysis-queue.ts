import Bull from 'bull';
import { Logger } from '../utils/logger';
import { AnalysisService } from '../services/analysis.service';

export interface AnalysisJobData {
  repositoryUrl: string;
  branch?: string;
  accessToken?: string;
  analysisTypes: string[];
  priority?: 'low' | 'normal' | 'high';
  timeout?: number;
  options?: any;
}

export class AnalysisQueue {
  private logger = new Logger('AnalysisQueue');
  private queue: Bull.Queue;
  private analysisService: AnalysisService;
  private config: any;

  constructor(config: any) {
    this.config = config;
    this.analysisService = new AnalysisService();
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing analysis queue');

    this.queue = new Bull('analysis', {
      redis: this.config.redis,
      defaultJobOptions: {
        ...this.config.defaultJobOptions,
        removeOnComplete: 50,
        removeOnFail: 25
      }
    });

    this.setupDefaultProcessor();
    this.setupEventHandlers();

    this.logger.info('Analysis queue initialized successfully');
  }

  async addAnalysisJob(data: AnalysisJobData): Promise<Bull.Job> {
    const jobOptions: Bull.JobOptions = {
      priority: this.getPriorityValue(data.priority),
      attempts: 2,
      backoff: 'fixed'
    };

    const job = await this.queue.add('analyze-repository', data, jobOptions);

    this.logger.info('Analysis job added to queue', {
      jobId: job.id,
      repositoryUrl: data.repositoryUrl,
      analysisTypes: data.analysisTypes
    });

    return job;
  }

  async getJobStatus(jobId: string | number): Promise<any> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const state = await job.getState();
    return {
      jobId: job.id,
      status: state,
      progress: job.progress(),
      data: job.data
    };
  }

  setProcessor(processor: (job: Bull.Job) => Promise<any>): void {
    this.queue.process('analyze-repository', this.config.concurrency.analysis, processor);
  }

  getQueue(): Bull.Queue {
    return this.queue;
  }

  async shutdown(): Promise<void> {
    await this.queue.close();
    this.logger.info('Analysis queue shut down successfully');
  }

  private setupDefaultProcessor(): void {
    this.queue.process('analyze-repository', this.config.concurrency.analysis, async (job: Bull.Job) => {
      const data: AnalysisJobData = job.data;

      try {
        await job.progress(25);
        const repositoryAnalysis = await this.analysisService.analyzeRepository({
          repositoryUrl: data.repositoryUrl,
          branch: data.branch,
          accessToken: data.accessToken,
          options: data.options
        });

        await job.progress(75);
        const complexityAnalysis = await this.analysisService.analyzeComplexity({
          repositoryUrl: data.repositoryUrl,
          branch: data.branch,
          accessToken: data.accessToken,
          options: data.options
        });

        await job.progress(100);

        return {
          status: 'completed',
          jobId: job.id,
          analysis: {
            repository: repositoryAnalysis,
            complexity: complexityAnalysis
          }
        };

      } catch (error) {
        this.logger.error('Analysis job failed', { jobId: job.id, error: error.message });
        throw error;
      }
    });
  }

  private setupEventHandlers(): void {
    this.queue.on('completed', (job, result) => {
      this.logger.info('Analysis job completed', { jobId: job.id });
    });

    this.queue.on('failed', (job, error) => {
      this.logger.error('Analysis job failed', { jobId: job.id, error: error.message });
    });
  }

  private getPriorityValue(priority: string = 'normal'): number {
    const priorityMap = { 'high': 1, 'normal': 5, 'low': 10 };
    return priorityMap[priority] || 5;
  }
}