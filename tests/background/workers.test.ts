import { WorkerManager } from '../../src/background/worker-manager';
import { ConversionWorker } from '../../src/background/workers/conversion-worker';
import { AnalysisWorker } from '../../src/background/workers/analysis-worker';
import { ReportingWorker } from '../../src/background/workers/reporting-worker';
import { testSetup } from '../setup/test-setup';

jest.mock('../../src/services/conversion.service');
jest.mock('../../src/services/analysis.service');
jest.mock('../../src/services/reporting.service');

describe('Background Workers', () => {
  let workerManager: WorkerManager;

  beforeAll(async () => {
    await testSetup.setupRedis();
  });

  afterAll(async () => {
    await testSetup.teardown();
  });

  beforeEach(async () => {
    await testSetup.clearDatabase();
    workerManager = new WorkerManager();
  });

  afterEach(async () => {
    await workerManager.shutdown();
  });

  describe('WorkerManager', () => {
    it('should initialize all worker types', async () => {
      await workerManager.initialize({
        conversion: { concurrency: 2 },
        analysis: { concurrency: 1 },
        reporting: { concurrency: 1 }
      });

      expect(workerManager.isRunning()).toBe(true);
      expect(workerManager.getWorkerCount('conversion')).toBe(2);
      expect(workerManager.getWorkerCount('analysis')).toBe(1);
      expect(workerManager.getWorkerCount('reporting')).toBe(1);
    });

    it('should scale workers based on queue load', async () => {
      await workerManager.initialize({
        conversion: { concurrency: 1, autoScale: true }
      });

      // Simulate high queue load
      await workerManager.adjustWorkerCount('conversion', 5);

      expect(workerManager.getWorkerCount('conversion')).toBe(3); // Scaled up but limited
    });

    it('should handle worker failures and restarts', async () => {
      await workerManager.initialize({
        conversion: { concurrency: 1, restartOnFailure: true }
      });

      const workers = workerManager.getWorkers('conversion');
      const worker = workers[0];

      // Simulate worker failure
      worker.emit('error', new Error('Worker crashed'));

      // Wait for restart
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(workerManager.getWorkerCount('conversion')).toBe(1);
      expect(workerManager.getFailedWorkerCount('conversion')).toBe(1);
    });

    it('should provide worker status and health', async () => {
      await workerManager.initialize({
        conversion: { concurrency: 2 },
        analysis: { concurrency: 1 }
      });

      const status = await workerManager.getStatus();

      expect(status).toEqual({
        running: true,
        workers: {
          conversion: {
            total: 2,
            active: expect.any(Number),
            idle: expect.any(Number),
            failed: 0
          },
          analysis: {
            total: 1,
            active: expect.any(Number),
            idle: expect.any(Number),
            failed: 0
          }
        },
        queues: {
          conversion: {
            waiting: expect.any(Number),
            active: expect.any(Number)
          },
          analysis: {
            waiting: expect.any(Number),
            active: expect.any(Number)
          }
        }
      });
    });

    it('should handle graceful shutdown', async () => {
      await workerManager.initialize({
        conversion: { concurrency: 2 },
        analysis: { concurrency: 1 }
      });

      expect(workerManager.isRunning()).toBe(true);

      await workerManager.shutdown();

      expect(workerManager.isRunning()).toBe(false);
      expect(workerManager.getWorkerCount('conversion')).toBe(0);
      expect(workerManager.getWorkerCount('analysis')).toBe(0);
    });
  });

  describe('ConversionWorker', () => {
    let worker: ConversionWorker;

    beforeEach(async () => {
      worker = new ConversionWorker('conversion-worker-1');
      await worker.initialize();
    });

    afterEach(async () => {
      await worker.shutdown();
    });

    it('should process conversion jobs successfully', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/test-project',
        outputPath: './converted-project',
        options: {
          preserveStructure: true,
          generateTypes: true
        }
      };

      const mockJob = {
        id: 'conv-job-1',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const result = await worker.processJob(mockJob as any);

      expect(result).toEqual({
        status: 'completed',
        jobId: 'conv-job-1',
        filesConverted: expect.any(Number),
        downloadPath: expect.any(String),
        validationResults: expect.any(Object)
      });

      expect(mockJob.progress).toHaveBeenCalledTimes(4); // 25%, 50%, 75%, 100%
    });

    it('should handle repository cloning errors', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/private-project',
        outputPath: './converted-project'
      };

      const mockJob = {
        id: 'conv-job-2',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      // Mock git clone failure
      jest.spyOn(worker, 'cloneRepository').mockRejectedValue(
        new Error('Repository not found or access denied')
      );

      await expect(worker.processJob(mockJob as any)).rejects.toThrow(
        'Repository not found or access denied'
      );
    });

    it('should handle conversion timeout', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/large-project',
        outputPath: './converted-project',
        timeout: 1000 // 1 second timeout
      };

      const mockJob = {
        id: 'conv-job-3',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      // Mock slow conversion
      jest.spyOn(worker, 'convertProject').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { filesConverted: 10 };
      });

      await expect(worker.processJob(mockJob as any)).rejects.toThrow('timeout');
    });

    it('should clean up temporary files after processing', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/cleanup-test',
        outputPath: './converted-project'
      };

      const mockJob = {
        id: 'conv-job-4',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const cleanupSpy = jest.spyOn(worker, 'cleanupTempFiles');

      await worker.processJob(mockJob as any);

      expect(cleanupSpy).toHaveBeenCalledWith('conv-job-4');
    });

    it('should handle memory optimization for large projects', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/huge-project',
        outputPath: './converted-project',
        options: {
          memoryOptimization: true,
          batchSize: 5
        }
      };

      const mockJob = {
        id: 'conv-job-5',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const result = await worker.processJob(mockJob as any);

      expect(result.status).toBe('completed');
      expect(mockJob.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing in batches for memory optimization')
      );
    });
  });

  describe('AnalysisWorker', () => {
    let worker: AnalysisWorker;

    beforeEach(async () => {
      worker = new AnalysisWorker('analysis-worker-1');
      await worker.initialize();
    });

    afterEach(async () => {
      await worker.shutdown();
    });

    it('should perform comprehensive repository analysis', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/analysis-project',
        analysisTypes: ['repository', 'complexity', 'patterns'],
        options: {
          includePatterns: true,
          includeComplexity: true,
          includeEstimate: true
        }
      };

      const mockJob = {
        id: 'analysis-job-1',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const result = await worker.processJob(mockJob as any);

      expect(result).toEqual({
        status: 'completed',
        jobId: 'analysis-job-1',
        analysis: {
          repository: expect.any(Object),
          complexity: expect.any(Object),
          patterns: expect.any(Object)
        },
        conversionEstimate: expect.any(Object)
      });
    });

    it('should cache analysis results for duplicate requests', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/cached-project',
        analysisTypes: ['repository']
      };

      const mockJob1 = {
        id: 'analysis-job-2a',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const mockJob2 = {
        id: 'analysis-job-2b',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const analyzeRepoSpy = jest.spyOn(worker, 'analyzeRepository');

      // First analysis
      await worker.processJob(mockJob1 as any);

      // Second analysis (should use cache)
      await worker.processJob(mockJob2 as any);

      expect(analyzeRepoSpy).toHaveBeenCalledTimes(1); // Only called once due to caching
      expect(mockJob2.log).toHaveBeenCalledWith(
        expect.stringContaining('Using cached analysis results')
      );
    });

    it('should handle analysis for different programming languages', async () => {
      const typescriptJobData = {
        repositoryUrl: 'https://github.com/user/typescript-project',
        analysisTypes: ['repository', 'patterns'],
        options: { includeTypeAnalysis: true }
      };

      const mockJob = {
        id: 'analysis-job-3',
        data: typescriptJobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const result = await worker.processJob(mockJob as any);

      expect(result.analysis.patterns.typeAnalysis).toBeDefined();
      expect(result.analysis.patterns.typeAnalysis.customInterfaces).toBeDefined();
    });

    it('should handle large repository analysis with streaming', async () => {
      const largeRepoData = {
        repositoryUrl: 'https://github.com/user/monorepo-project',
        analysisTypes: ['repository', 'complexity'],
        options: { streamAnalysis: true }
      };

      const mockJob = {
        id: 'analysis-job-4',
        data: largeRepoData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const result = await worker.processJob(mockJob as any);

      expect(result.status).toBe('completed');
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('Analyzing files in chunks')
      );
    });
  });

  describe('ReportingWorker', () => {
    let worker: ReportingWorker;

    beforeEach(async () => {
      worker = new ReportingWorker('reporting-worker-1');
      await worker.initialize();
    });

    afterEach(async () => {
      await worker.shutdown();
    });

    it('should generate PDF conversion reports', async () => {
      const jobData = {
        conversionJobId: 'conv-job-123',
        format: 'pdf',
        template: 'standard',
        includeDetails: true
      };

      const mockJob = {
        id: 'report-job-1',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const result = await worker.processJob(mockJob as any);

      expect(result).toEqual({
        status: 'completed',
        jobId: 'report-job-1',
        reportPath: expect.stringContaining('.pdf'),
        fileSize: expect.any(Number),
        downloadUrl: expect.any(String)
      });
    });

    it('should generate Excel analytics reports', async () => {
      const jobData = {
        type: 'analytics',
        format: 'excel',
        timeRange: '30d',
        includeCharts: true
      };

      const mockJob = {
        id: 'report-job-2',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const result = await worker.processJob(mockJob as any);

      expect(result.reportPath).toContain('.xlsx');
      expect(result.status).toBe('completed');
    });

    it('should handle custom report generation', async () => {
      const jobData = {
        type: 'custom',
        templateId: 'executive-summary',
        data: {
          dateRange: { start: '2025-01-01', end: '2025-01-31' },
          repositories: ['repo1', 'repo2'],
          metrics: ['success-rate', 'performance']
        },
        format: 'pdf'
      };

      const mockJob = {
        id: 'report-job-3',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const result = await worker.processJob(mockJob as any);

      expect(result.status).toBe('completed');
      expect(mockJob.log).toHaveBeenCalledWith(
        expect.stringContaining('Generating custom report from template')
      );
    });

    it('should handle report generation timeouts', async () => {
      const jobData = {
        type: 'large-analytics',
        format: 'pdf',
        timeout: 5000, // 5 second timeout
        dataSize: 'large'
      };

      const mockJob = {
        id: 'report-job-4',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      // Mock slow report generation
      jest.spyOn(worker, 'generateReport').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
        return { reportPath: '/tmp/report.pdf' };
      });

      await expect(worker.processJob(mockJob as any)).rejects.toThrow('timeout');
    });

    it('should optimize memory usage for large reports', async () => {
      const jobData = {
        type: 'comprehensive-analytics',
        format: 'pdf',
        options: {
          memoryOptimization: true,
          streamGeneration: true
        }
      };

      const mockJob = {
        id: 'report-job-5',
        data: jobData,
        progress: jest.fn(),
        log: jest.fn()
      };

      const result = await worker.processJob(mockJob as any);

      expect(result.status).toBe('completed');
      expect(mockJob.log).toHaveBeenCalledWith(
        expect.stringContaining('Using memory-optimized generation')
      );
    });
  });

  describe('Worker Performance and Monitoring', () => {
    it('should track worker performance metrics', async () => {
      await workerManager.initialize({
        conversion: { concurrency: 2, enableMetrics: true }
      });

      const metrics = await workerManager.getWorkerMetrics('conversion');

      expect(metrics).toEqual({
        totalJobs: expect.any(Number),
        completedJobs: expect.any(Number),
        failedJobs: expect.any(Number),
        averageProcessingTime: expect.any(Number),
        throughput: expect.any(Number),
        memoryUsage: expect.any(Number),
        cpuUsage: expect.any(Number)
      });
    });

    it('should detect and handle memory leaks', async () => {
      await workerManager.initialize({
        conversion: { concurrency: 1, memoryMonitoring: true }
      });

      const worker = workerManager.getWorkers('conversion')[0];
      const memoryMonitorSpy = jest.spyOn(worker, 'checkMemoryUsage');

      // Simulate processing jobs
      for (let i = 0; i < 5; i++) {
        await worker.processJob({
          id: `memory-test-${i}`,
          data: { repositoryUrl: `https://github.com/user/project-${i}` },
          progress: jest.fn(),
          log: jest.fn()
        } as any);
      }

      expect(memoryMonitorSpy).toHaveBeenCalled();
    });

    it('should handle worker restart on memory threshold', async () => {
      await workerManager.initialize({
        conversion: {
          concurrency: 1,
          memoryThreshold: 100 * 1024 * 1024, // 100MB
          restartOnMemoryLimit: true
        }
      });

      const originalWorkerCount = workerManager.getWorkerCount('conversion');

      // Simulate high memory usage
      const worker = workerManager.getWorkers('conversion')[0];
      worker.emit('memoryThresholdExceeded', { usage: 150 * 1024 * 1024 });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(workerManager.getWorkerCount('conversion')).toBe(originalWorkerCount);
      expect(workerManager.getRestartCount('conversion')).toBeGreaterThan(0);
    });

    it('should provide detailed worker logs', async () => {
      await workerManager.initialize({
        conversion: { concurrency: 1, logLevel: 'debug' }
      });

      const logs = await workerManager.getWorkerLogs('conversion', {
        level: 'info',
        limit: 50
      });

      expect(logs).toEqual({
        entries: expect.arrayContaining([
          expect.objectContaining({
            timestamp: expect.any(String),
            level: expect.any(String),
            message: expect.any(String),
            workerId: expect.any(String)
          })
        ]),
        total: expect.any(Number)
      });
    });
  });
});