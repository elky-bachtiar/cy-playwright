import Bull from 'bull';
import { Logger } from '../utils/logger';
import { ReportingService } from '../services/reporting.service';

export interface ReportingJobData {
  type: 'conversion' | 'analytics' | 'custom';
  conversionJobId?: string;
  format: 'pdf' | 'excel' | 'json' | 'html';
  template?: string;
  data?: any;
  options?: any;
}

export class ReportingQueue {
  private logger = new Logger('ReportingQueue');
  private queue: Bull.Queue;
  private reportingService: ReportingService;
  private config: any;

  constructor(config: any) {
    this.config = config;
    this.reportingService = new ReportingService();
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing reporting queue');

    this.queue = new Bull('reporting', {
      redis: this.config.redis,
      defaultJobOptions: {
        ...this.config.defaultJobOptions,
        removeOnComplete: 25,
        removeOnFail: 10
      }
    });

    this.setupDefaultProcessor();
    this.setupEventHandlers();

    this.logger.info('Reporting queue initialized successfully');
  }

  async addReportingJob(data: ReportingJobData): Promise<Bull.Job> {
    const job = await this.queue.add('generate-report', data, {
      attempts: 2,
      backoff: 'fixed'
    });

    this.logger.info('Reporting job added to queue', {
      jobId: job.id,
      type: data.type,
      format: data.format
    });

    return job;
  }

  getQueue(): Bull.Queue {
    return this.queue;
  }

  async shutdown(): Promise<void> {
    await this.queue.close();
    this.logger.info('Reporting queue shut down successfully');
  }

  private setupDefaultProcessor(): void {
    this.queue.process('generate-report', this.config.concurrency.reporting, async (job: Bull.Job) => {
      const data: ReportingJobData = job.data;

      try {
        await job.progress(25);

        let reportBuffer: Buffer;
        switch (data.format) {
          case 'pdf':
            reportBuffer = await this.reportingService.generateReportPdf(data.conversionJobId || 'custom');
            break;
          case 'excel':
            reportBuffer = await this.reportingService.generateReportExcel(data.conversionJobId || 'custom');
            break;
          default:
            const report = await this.reportingService.getConversionReport(data.conversionJobId || 'custom');
            reportBuffer = Buffer.from(JSON.stringify(report, null, 2));
        }

        await job.progress(100);

        return {
          status: 'completed',
          jobId: job.id,
          reportPath: `/tmp/reports/${job.id}.${data.format}`,
          fileSize: reportBuffer.length,
          downloadUrl: `/api/reports/${data.type}/${job.id}/download`
        };

      } catch (error) {
        this.logger.error('Reporting job failed', { jobId: job.id, error: error.message });
        throw error;
      }
    });
  }

  private setupEventHandlers(): void {
    this.queue.on('completed', (job, result) => {
      this.logger.info('Reporting job completed', { jobId: job.id });
    });

    this.queue.on('failed', (job, error) => {
      this.logger.error('Reporting job failed', { jobId: job.id, error: error.message });
    });
  }
}