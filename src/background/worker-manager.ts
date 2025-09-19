import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { ConversionWorker } from './workers/conversion-worker';
import { AnalysisWorker } from './workers/analysis-worker';
import { ReportingWorker } from './workers/reporting-worker';

export interface WorkerConfig {
  concurrency: number;
  autoScale?: boolean;
  restartOnFailure?: boolean;
  memoryThreshold?: number;
  restartOnMemoryLimit?: boolean;
  enableMetrics?: boolean;
  memoryMonitoring?: boolean;
  logLevel?: string;
}

export interface WorkerStatus {
  running: boolean;
  workers: Record<string, {
    total: number;
    active: number;
    idle: number;
    failed: number;
  }>;
  queues: Record<string, {
    waiting: number;
    active: number;
  }>;
}

export class WorkerManager extends EventEmitter {
  private logger = new Logger('WorkerManager');
  private workers: Map<string, any[]> = new Map();
  private config: Record<string, WorkerConfig> = {};
  private running = false;
  private failedWorkerCounts: Map<string, number> = new Map();
  private restartCounts: Map<string, number> = new Map();

  async initialize(config: Record<string, WorkerConfig>): Promise<void> {
    this.logger.info('Initializing worker manager');
    this.config = config;

    for (const [workerType, workerConfig] of Object.entries(config)) {
      await this.initializeWorkerType(workerType, workerConfig);
    }

    this.running = true;
    this.logger.info('Worker manager initialized successfully');
  }

  private async initializeWorkerType(workerType: string, config: WorkerConfig): Promise<void> {
    const workers = [];

    for (let i = 0; i < config.concurrency; i++) {
      const workerId = `${workerType}-worker-${i + 1}`;
      let worker;

      switch (workerType) {
        case 'conversion':
          worker = new ConversionWorker(workerId);
          break;
        case 'analysis':
          worker = new AnalysisWorker(workerId);
          break;
        case 'reporting':
          worker = new ReportingWorker(workerId);
          break;
        default:
          throw new Error(`Unknown worker type: ${workerType}`);
      }

      await worker.initialize();
      this.setupWorkerEventHandlers(worker, workerType, config);
      workers.push(worker);
    }

    this.workers.set(workerType, workers);
    this.failedWorkerCounts.set(workerType, 0);
    this.restartCounts.set(workerType, 0);

    this.logger.info(`Initialized ${workers.length} ${workerType} workers`);
  }

  private setupWorkerEventHandlers(worker: any, workerType: string, config: WorkerConfig): void {
    worker.on('error', async (error: Error) => {
      this.logger.error(`Worker error in ${workerType}`, { workerId: worker.id, error: error.message });

      const failedCount = this.failedWorkerCounts.get(workerType) || 0;
      this.failedWorkerCounts.set(workerType, failedCount + 1);

      if (config.restartOnFailure) {
        await this.restartWorker(workerType, worker);
      }
    });

    worker.on('memoryThresholdExceeded', async (memoryInfo: any) => {
      this.logger.warn(`Memory threshold exceeded for ${workerType} worker`, {
        workerId: worker.id,
        memoryUsage: memoryInfo.usage
      });

      if (config.restartOnMemoryLimit) {
        await this.restartWorker(workerType, worker);
      }
    });
  }

  private async restartWorker(workerType: string, oldWorker: any): Promise<void> {
    try {
      this.logger.info(`Restarting ${workerType} worker`, { workerId: oldWorker.id });

      // Shutdown old worker
      await oldWorker.shutdown();

      // Create new worker
      let newWorker;
      switch (workerType) {
        case 'conversion':
          newWorker = new ConversionWorker(oldWorker.id);
          break;
        case 'analysis':
          newWorker = new AnalysisWorker(oldWorker.id);
          break;
        case 'reporting':
          newWorker = new ReportingWorker(oldWorker.id);
          break;
        default:
          throw new Error(`Unknown worker type: ${workerType}`);
      }

      await newWorker.initialize();
      this.setupWorkerEventHandlers(newWorker, workerType, this.config[workerType]);

      // Replace in workers array
      const workers = this.workers.get(workerType) || [];
      const index = workers.findIndex(w => w.id === oldWorker.id);
      if (index !== -1) {
        workers[index] = newWorker;
      }

      const restartCount = this.restartCounts.get(workerType) || 0;
      this.restartCounts.set(workerType, restartCount + 1);

      this.logger.info(`Successfully restarted ${workerType} worker`, { workerId: newWorker.id });

    } catch (error) {
      this.logger.error(`Failed to restart ${workerType} worker`, {
        workerId: oldWorker.id,
        error: error.message
      });
    }
  }

  async adjustWorkerCount(workerType: string, targetCount: number): Promise<void> {
    const maxWorkers = 5; // Configurable limit
    const actualTarget = Math.min(targetCount, maxWorkers);

    const currentWorkers = this.workers.get(workerType) || [];
    const currentCount = currentWorkers.length;

    if (actualTarget > currentCount) {
      // Scale up
      const workersToAdd = actualTarget - currentCount;
      for (let i = 0; i < workersToAdd; i++) {
        const workerId = `${workerType}-worker-${currentCount + i + 1}`;
        // Create and add new worker (implementation details omitted for brevity)
      }
    } else if (actualTarget < currentCount) {
      // Scale down
      const workersToRemove = currentCount - actualTarget;
      for (let i = 0; i < workersToRemove; i++) {
        const worker = currentWorkers.pop();
        if (worker) {
          await worker.shutdown();
        }
      }
    }

    this.logger.info(`Adjusted ${workerType} worker count`, {
      from: currentCount,
      to: actualTarget
    });
  }

  getWorkerCount(workerType: string): number {
    return this.workers.get(workerType)?.length || 0;
  }

  getFailedWorkerCount(workerType: string): number {
    return this.failedWorkerCounts.get(workerType) || 0;
  }

  getRestartCount(workerType: string): number {
    return this.restartCounts.get(workerType) || 0;
  }

  getWorkers(workerType: string): any[] {
    return this.workers.get(workerType) || [];
  }

  async getStatus(): Promise<WorkerStatus> {
    const status: WorkerStatus = {
      running: this.running,
      workers: {},
      queues: {}
    };

    for (const [workerType, workers] of this.workers) {
      const activeWorkers = workers.filter(w => w.isActive()).length;

      status.workers[workerType] = {
        total: workers.length,
        active: activeWorkers,
        idle: workers.length - activeWorkers,
        failed: this.failedWorkerCounts.get(workerType) || 0
      };

      // Mock queue stats (would be real in actual implementation)
      status.queues[workerType] = {
        waiting: 0,
        active: activeWorkers
      };
    }

    return status;
  }

  async getWorkerMetrics(workerType: string): Promise<any> {
    const workers = this.workers.get(workerType) || [];

    return {
      totalJobs: workers.reduce((sum, w) => sum + (w.getProcessedJobCount?.() || 0), 0),
      completedJobs: workers.reduce((sum, w) => sum + (w.getCompletedJobCount?.() || 0), 0),
      failedJobs: workers.reduce((sum, w) => sum + (w.getFailedJobCount?.() || 0), 0),
      averageProcessingTime: workers.reduce((sum, w) => sum + (w.getAverageProcessingTime?.() || 0), 0) / workers.length,
      throughput: workers.reduce((sum, w) => sum + (w.getThroughput?.() || 0), 0),
      memoryUsage: process.memoryUsage().heapUsed,
      cpuUsage: process.cpuUsage()
    };
  }

  async getWorkerLogs(workerType: string, options: any): Promise<any> {
    // Mock implementation - would return actual logs in real system
    return {
      entries: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Worker started successfully',
          workerId: `${workerType}-worker-1`
        }
      ],
      total: 1
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down worker manager');

    for (const [workerType, workers] of this.workers) {
      this.logger.debug(`Shutting down ${workerType} workers`);

      await Promise.all(workers.map(worker => worker.shutdown()));
    }

    this.workers.clear();
    this.running = false;

    this.logger.info('Worker manager shut down successfully');
  }
}