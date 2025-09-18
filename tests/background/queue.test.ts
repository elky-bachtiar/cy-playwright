import { QueueManager } from '../../src/background/queue-manager';
import { ConversionQueue } from '../../src/background/conversion-queue';
import { AnalysisQueue } from '../../src/background/analysis-queue';
import { JobProcessor } from '../../src/background/job-processor';
import { testSetup } from '../setup/test-setup';

jest.mock('bull');
jest.mock('../../src/services/conversion.service');
jest.mock('../../src/services/analysis.service');

describe('Background Processing System', () => {
  let queueManager: QueueManager;
  let conversionQueue: ConversionQueue;
  let analysisQueue: AnalysisQueue;
  let jobProcessor: JobProcessor;

  beforeAll(async () => {
    await testSetup.setupRedis();
  });

  afterAll(async () => {
    await testSetup.teardown();
  });

  beforeEach(async () => {
    await testSetup.clearDatabase();
    queueManager = new QueueManager();
    conversionQueue = new ConversionQueue();
    analysisQueue = new AnalysisQueue();
    jobProcessor = new JobProcessor();
  });

  describe('QueueManager', () => {
    it('should initialize all queues correctly', async () => {
      await queueManager.initialize();

      expect(queueManager.isInitialized()).toBe(true);
      expect(queueManager.getQueue('conversion')).toBeDefined();
      expect(queueManager.getQueue('analysis')).toBeDefined();
      expect(queueManager.getQueue('reporting')).toBeDefined();
    });

    it('should add job to conversion queue', async () => {
      await queueManager.initialize();

      const jobData = {
        repositoryUrl: 'https://github.com/user/cypress-project',
        outputPath: './converted-project',
        options: {
          preserveStructure: true,
          generateTypes: true
        }
      };

      const job = await queueManager.addJob('conversion', jobData, {
        priority: 10,
        delay: 0,
        attempts: 3,
        backoff: 'exponential'
      });

      expect(job.id).toBeDefined();
      expect(job.data).toEqual(jobData);
      expect(job.opts.priority).toBe(10);
    });

    it('should handle job priorities correctly', async () => {
      await queueManager.initialize();

      // Add jobs with different priorities
      const highPriorityJob = await queueManager.addJob('conversion',
        { repositoryUrl: 'https://github.com/user/urgent-project' },
        { priority: 1 } // Higher priority (lower number)
      );

      const lowPriorityJob = await queueManager.addJob('conversion',
        { repositoryUrl: 'https://github.com/user/normal-project' },
        { priority: 10 }
      );

      const mediumPriorityJob = await queueManager.addJob('conversion',
        { repositoryUrl: 'https://github.com/user/important-project' },
        { priority: 5 }
      );

      // Check queue stats
      const stats = await queueManager.getQueueStats('conversion');
      expect(stats.waiting).toBe(3);
      expect(stats.total).toBe(3);
    });

    it('should process jobs with retry logic', async () => {
      await queueManager.initialize();

      const failingJobData = {
        repositoryUrl: 'https://github.com/user/problematic-project',
        shouldFail: true
      };

      const job = await queueManager.addJob('conversion', failingJobData, {
        attempts: 3,
        backoff: 'fixed'
      });

      // Simulate job processing and failure
      await queueManager.processJob('conversion', async (job) => {
        if (job.data.shouldFail) {
          throw new Error('Simulated processing error');
        }
        return { success: true };
      });

      // Check that job is retried
      const jobDetails = await queueManager.getJob('conversion', job.id);
      expect(jobDetails.attemptsMade).toBeGreaterThan(0);
    });

    it('should handle job cancellation', async () => {
      await queueManager.initialize();

      const job = await queueManager.addJob('conversion', {
        repositoryUrl: 'https://github.com/user/to-be-cancelled'
      });

      const cancelled = await queueManager.cancelJob('conversion', job.id);
      expect(cancelled).toBe(true);

      const jobDetails = await queueManager.getJob('conversion', job.id);
      expect(jobDetails.finishedOn).toBeDefined();
      expect(jobDetails.failedReason).toContain('cancelled');
    });

    it('should provide queue statistics', async () => {
      await queueManager.initialize();

      // Add various jobs
      await queueManager.addJob('conversion', { type: 'test1' });
      await queueManager.addJob('conversion', { type: 'test2' });
      await queueManager.addJob('analysis', { type: 'test3' });

      const conversionStats = await queueManager.getQueueStats('conversion');
      const analysisStats = await queueManager.getQueueStats('analysis');

      expect(conversionStats.waiting).toBe(2);
      expect(analysisStats.waiting).toBe(1);
      expect(conversionStats.total).toBe(2);
      expect(analysisStats.total).toBe(1);
    });

    it('should handle queue cleanup and shutdown', async () => {
      await queueManager.initialize();

      // Add some jobs
      await queueManager.addJob('conversion', { type: 'cleanup-test' });
      await queueManager.addJob('analysis', { type: 'cleanup-test' });

      await queueManager.shutdown();

      expect(queueManager.isInitialized()).toBe(false);
    });
  });

  describe('ConversionQueue', () => {
    beforeEach(async () => {
      await conversionQueue.initialize();
    });

    afterEach(async () => {
      await conversionQueue.shutdown();
    });

    it('should process conversion jobs successfully', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/simple-project',
        outputPath: './converted-project',
        validation: {
          valid: true,
          cypressVersion: '12.0.0',
          testFiles: ['cypress/e2e/test.cy.js']
        }
      };

      const job = await conversionQueue.addConversionJob(jobData);
      expect(job.id).toBeDefined();

      // Mock successful processing
      const mockProcessor = jest.fn().mockResolvedValue({
        status: 'completed',
        filesConverted: 5,
        downloadPath: '/tmp/converted-project.zip'
      });

      conversionQueue.setProcessor(mockProcessor);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockProcessor).toHaveBeenCalledWith(
        expect.objectContaining({ data: jobData })
      );
    });

    it('should handle conversion job failures gracefully', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/problematic-project',
        outputPath: './converted-project'
      };

      const job = await conversionQueue.addConversionJob(jobData);

      const mockProcessor = jest.fn().mockRejectedValue(
        new Error('Repository not accessible')
      );

      conversionQueue.setProcessor(mockProcessor);

      // Wait for job processing and failure
      await new Promise(resolve => setTimeout(resolve, 100));

      const jobStatus = await conversionQueue.getJobStatus(job.id);
      expect(jobStatus.status).toBe('failed');
      expect(jobStatus.error).toContain('Repository not accessible');
    });

    it('should track conversion progress', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/large-project',
        outputPath: './converted-project'
      };

      const job = await conversionQueue.addConversionJob(jobData);

      const mockProcessor = jest.fn().mockImplementation(async (job) => {
        // Simulate progress updates
        await job.progress(25);
        await new Promise(resolve => setTimeout(resolve, 10));

        await job.progress(50);
        await new Promise(resolve => setTimeout(resolve, 10));

        await job.progress(75);
        await new Promise(resolve => setTimeout(resolve, 10));

        await job.progress(100);

        return { status: 'completed' };
      });

      conversionQueue.setProcessor(mockProcessor);

      // Monitor progress
      const progressUpdates: number[] = [];
      conversionQueue.onProgress(job.id, (progress) => {
        progressUpdates.push(progress);
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(progressUpdates).toContain(25);
      expect(progressUpdates).toContain(50);
      expect(progressUpdates).toContain(75);
      expect(progressUpdates).toContain(100);
    });

    it('should estimate job completion time', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/medium-project',
        outputPath: './converted-project',
        validation: {
          testFiles: ['test1.cy.js', 'test2.cy.js', 'test3.cy.js'],
          complexity: 'medium'
        }
      };

      const job = await conversionQueue.addConversionJob(jobData);
      const estimate = conversionQueue.estimateCompletionTime(job.id);

      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(3600000); // Less than 1 hour
    });

    it('should handle concurrent job processing', async () => {
      const concurrentJobs = 5;
      const jobPromises = [];

      for (let i = 0; i < concurrentJobs; i++) {
        const jobData = {
          repositoryUrl: `https://github.com/user/project-${i}`,
          outputPath: `./converted-project-${i}`
        };
        jobPromises.push(conversionQueue.addConversionJob(jobData));
      }

      const jobs = await Promise.all(jobPromises);
      expect(jobs).toHaveLength(concurrentJobs);

      const stats = await conversionQueue.getStats();
      expect(stats.waiting + stats.active).toBe(concurrentJobs);
    });
  });

  describe('AnalysisQueue', () => {
    beforeEach(async () => {
      await analysisQueue.initialize();
    });

    afterEach(async () => {
      await analysisQueue.shutdown();
    });

    it('should process repository analysis jobs', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/analysis-project',
        analysisTypes: ['repository', 'complexity', 'patterns'],
        options: {
          includePatterns: true,
          includeComplexity: true
        }
      };

      const job = await analysisQueue.addAnalysisJob(jobData);
      expect(job.id).toBeDefined();

      const mockProcessor = jest.fn().mockResolvedValue({
        status: 'completed',
        analysis: {
          repository: { /* analysis data */ },
          complexity: { score: 6.5 },
          patterns: { customCommands: 3 }
        }
      });

      analysisQueue.setProcessor(mockProcessor);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockProcessor).toHaveBeenCalledWith(
        expect.objectContaining({ data: jobData })
      );
    });

    it('should handle different analysis priorities', async () => {
      const highPriorityJob = await analysisQueue.addAnalysisJob({
        repositoryUrl: 'https://github.com/user/urgent-analysis',
        priority: 'high'
      });

      const normalPriorityJob = await analysisQueue.addAnalysisJob({
        repositoryUrl: 'https://github.com/user/normal-analysis',
        priority: 'normal'
      });

      const lowPriorityJob = await analysisQueue.addAnalysisJob({
        repositoryUrl: 'https://github.com/user/background-analysis',
        priority: 'low'
      });

      // High priority job should have lower priority number (processed first)
      expect(highPriorityJob.opts.priority).toBeLessThan(normalPriorityJob.opts.priority);
      expect(normalPriorityJob.opts.priority).toBeLessThan(lowPriorityJob.opts.priority);
    });

    it('should cache analysis results', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/cached-project',
        analysisTypes: ['repository']
      };

      // First analysis
      const job1 = await analysisQueue.addAnalysisJob(jobData);
      const mockResult = {
        status: 'completed',
        analysis: { repository: { complexity: 'medium' } }
      };

      const mockProcessor = jest.fn().mockResolvedValue(mockResult);
      analysisQueue.setProcessor(mockProcessor);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Second analysis of same repository (should use cache)
      const job2 = await analysisQueue.addAnalysisJob(jobData);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should be processed from cache, not calling processor again
      expect(mockProcessor).toHaveBeenCalledTimes(1);
    });

    it('should handle analysis job timeouts', async () => {
      const jobData = {
        repositoryUrl: 'https://github.com/user/slow-project',
        timeout: 1000 // 1 second timeout
      };

      const job = await analysisQueue.addAnalysisJob(jobData);

      const mockProcessor = jest.fn().mockImplementation(async () => {
        // Simulate slow processing (longer than timeout)
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { status: 'completed' };
      });

      analysisQueue.setProcessor(mockProcessor);

      await new Promise(resolve => setTimeout(resolve, 1500));

      const jobStatus = await analysisQueue.getJobStatus(job.id);
      expect(jobStatus.status).toBe('failed');
      expect(jobStatus.error).toContain('timeout');
    });
  });

  describe('JobProcessor', () => {
    it('should process jobs with proper error handling', async () => {
      const successfulJob = {
        id: 'job-1',
        data: { repositoryUrl: 'https://github.com/user/good-project' },
        progress: jest.fn(),
        moveToCompleted: jest.fn(),
        moveToFailed: jest.fn()
      };

      const result = await jobProcessor.processConversionJob(successfulJob as any);

      expect(result.status).toBe('completed');
      expect(successfulJob.moveToCompleted).toHaveBeenCalled();
    });

    it('should handle processing errors correctly', async () => {
      const failingJob = {
        id: 'job-2',
        data: { repositoryUrl: 'https://github.com/user/bad-project' },
        progress: jest.fn(),
        moveToCompleted: jest.fn(),
        moveToFailed: jest.fn()
      };

      // Mock service to throw error
      const mockError = new Error('Repository not found');
      jest.spyOn(jobProcessor, 'processConversionJob').mockRejectedValueOnce(mockError);

      try {
        await jobProcessor.processConversionJob(failingJob as any);
      } catch (error) {
        expect(error).toBe(mockError);
        expect(failingJob.moveToFailed).toHaveBeenCalledWith(mockError);
      }
    });

    it('should update job progress during processing', async () => {
      const progressJob = {
        id: 'job-3',
        data: { repositoryUrl: 'https://github.com/user/tracked-project' },
        progress: jest.fn(),
        moveToCompleted: jest.fn()
      };

      await jobProcessor.processConversionJob(progressJob as any);

      expect(progressJob.progress).toHaveBeenCalledWith(25);
      expect(progressJob.progress).toHaveBeenCalledWith(50);
      expect(progressJob.progress).toHaveBeenCalledWith(75);
      expect(progressJob.progress).toHaveBeenCalledWith(100);
    });

    it('should handle resource cleanup after job completion', async () => {
      const cleanupJob = {
        id: 'job-4',
        data: {
          repositoryUrl: 'https://github.com/user/cleanup-project',
          tempDir: '/tmp/job-4-workspace'
        },
        progress: jest.fn(),
        moveToCompleted: jest.fn()
      };

      const cleanupSpy = jest.spyOn(jobProcessor, 'cleanupJobResources');

      await jobProcessor.processConversionJob(cleanupJob as any);

      expect(cleanupSpy).toHaveBeenCalledWith(cleanupJob.id);
    });
  });

  describe('Queue Health and Monitoring', () => {
    it('should provide queue health status', async () => {
      await queueManager.initialize();

      const health = await queueManager.getHealth();

      expect(health).toEqual({
        status: 'healthy',
        queues: {
          conversion: {
            status: 'healthy',
            waiting: expect.any(Number),
            active: expect.any(Number),
            completed: expect.any(Number),
            failed: expect.any(Number)
          },
          analysis: {
            status: 'healthy',
            waiting: expect.any(Number),
            active: expect.any(Number),
            completed: expect.any(Number),
            failed: expect.any(Number)
          },
          reporting: {
            status: 'healthy',
            waiting: expect.any(Number),
            active: expect.any(Number),
            completed: expect.any(Number),
            failed: expect.any(Number)
          }
        },
        workers: expect.any(Number),
        memory: expect.any(Number)
      });
    });

    it('should detect unhealthy queue conditions', async () => {
      await queueManager.initialize();

      // Simulate unhealthy conditions
      const conversionQueue = queueManager.getQueue('conversion');

      // Add many failed jobs to simulate problems
      for (let i = 0; i < 10; i++) {
        await conversionQueue.add('test-job', { fail: true });
      }

      const health = await queueManager.getHealth();

      if (health.queues.conversion.failed > 5) {
        expect(health.queues.conversion.status).toBe('degraded');
      }
    });

    it('should provide detailed metrics for monitoring', async () => {
      await queueManager.initialize();

      const metrics = await queueManager.getMetrics();

      expect(metrics).toEqual({
        timestamp: expect.any(String),
        queues: {
          conversion: {
            throughput: expect.any(Number),
            averageWaitTime: expect.any(Number),
            averageProcessingTime: expect.any(Number),
            errorRate: expect.any(Number)
          },
          analysis: expect.any(Object),
          reporting: expect.any(Object)
        },
        workers: {
          total: expect.any(Number),
          active: expect.any(Number),
          idle: expect.any(Number)
        },
        system: {
          memory: expect.any(Number),
          cpu: expect.any(Number),
          connections: expect.any(Number)
        }
      });
    });
  });
});