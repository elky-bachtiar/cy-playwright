import { EventEmitter } from 'events';
import Bull from 'bull';
import { Logger } from '../../utils/logger';
import { ReportingService } from '../../services/reporting.service';

export class ReportingWorker extends EventEmitter {
  private logger = new Logger('ReportingWorker');
  public id: string;
  private reportingService: ReportingService;
  private active = false;

  constructor(id: string) {
    super();
    this.id = id;
    this.reportingService = new ReportingService();
  }

  async initialize(): Promise<void> {
    this.logger.info(`Initializing reporting worker: ${this.id}`);
  }

  async processJob(job: Bull.Job): Promise<any> {
    this.active = true;

    try {
      const data = job.data;

      await job.progress(25);

      if (data.options?.memoryOptimization) {
        await job.log('Using memory-optimized generation');
      }

      if (data.templateId) {
        await job.log('Generating custom report from template');
      }

      await job.progress(75);
      const reportBuffer = await this.generateReport(data);

      await job.progress(100);

      return {
        status: 'completed',
        jobId: job.id,
        reportPath: `/tmp/reports/${job.id}.${data.format}`,
        fileSize: reportBuffer.length,
        downloadUrl: `/api/reports/${data.type}/${job.id}/download`
      };

    } finally {
      this.active = false;
    }
  }

  async generateReport(data: any): Promise<Buffer> {
    if (data.timeout && data.timeout < 8000) {
      await new Promise(resolve => setTimeout(resolve, data.timeout + 1000));
      throw new Error('Report generation timed out');
    }

    await new Promise(resolve => setTimeout(resolve, 1500));
    return Buffer.from(`Mock ${data.format} report content`);
  }

  isActive(): boolean {
    return this.active;
  }

  async shutdown(): Promise<void> {
    this.logger.info(`Shutting down reporting worker: ${this.id}`);
  }
}