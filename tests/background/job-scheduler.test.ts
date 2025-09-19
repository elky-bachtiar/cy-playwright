import { JobScheduler } from '../../src/background/job-scheduler';
import { ScheduledJobManager } from '../../src/background/scheduled-job-manager';
import { CronJobService } from '../../src/background/cron-job-service';
import { testSetup } from '../setup/test-setup';

jest.mock('node-cron');
jest.mock('../../src/services/cleanup.service');
jest.mock('../../src/services/analytics.service');
jest.mock('../../src/services/monitoring.service');

describe('Job Scheduler', () => {
  let jobScheduler: JobScheduler;
  let scheduledJobManager: ScheduledJobManager;
  let cronJobService: CronJobService;

  beforeAll(async () => {
    await testSetup.setupRedis();
  });

  afterAll(async () => {
    await testSetup.teardown();
  });

  beforeEach(async () => {
    await testSetup.clearDatabase();
    jobScheduler = new JobScheduler();
    scheduledJobManager = new ScheduledJobManager();
    cronJobService = new CronJobService();
  });

  afterEach(async () => {
    await jobScheduler.shutdown();
    await scheduledJobManager.shutdown();
    await cronJobService.shutdown();
  });

  describe('JobScheduler', () => {
    it('should initialize with default scheduled jobs', async () => {
      await jobScheduler.initialize();

      const scheduledJobs = await jobScheduler.getScheduledJobs();

      expect(scheduledJobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'cleanup-temp-files',
            schedule: '0 2 * * *', // Daily at 2 AM
            enabled: true
          }),
          expect.objectContaining({
            name: 'generate-analytics',
            schedule: '0 1 * * *', // Daily at 1 AM
            enabled: true
          }),
          expect.objectContaining({
            name: 'cleanup-completed-jobs',
            schedule: '0 3 * * 0', // Weekly on Sunday at 3 AM
            enabled: true
          }),
          expect.objectContaining({
            name: 'system-health-check',
            schedule: '*/15 * * * *', // Every 15 minutes
            enabled: true
          })
        ])
      );
    });

    it('should schedule custom jobs', async () => {
      await jobScheduler.initialize();

      const customJob = {
        name: 'custom-backup',
        schedule: '0 4 * * *', // Daily at 4 AM
        jobType: 'backup',
        data: {
          backupPath: '/backups',
          retentionDays: 30
        },
        enabled: true
      };

      const scheduledJob = await jobScheduler.scheduleJob(customJob);

      expect(scheduledJob.id).toBeDefined();
      expect(scheduledJob.name).toBe('custom-backup');
      expect(scheduledJob.nextRun).toBeDefined();
    });

    it('should handle job execution and logging', async () => {
      await jobScheduler.initialize();

      const testJob = {
        name: 'test-job',
        schedule: '*/1 * * * * *', // Every second for testing
        jobType: 'test',
        data: { testValue: 'test' },
        enabled: true
      };

      const job = await jobScheduler.scheduleJob(testJob);

      // Wait for job to execute
      await new Promise(resolve => setTimeout(resolve, 1500));

      const executionHistory = await jobScheduler.getJobExecutionHistory(job.id);

      expect(executionHistory.length).toBeGreaterThan(0);
      expect(executionHistory[0]).toEqual(
        expect.objectContaining({
          jobId: job.id,
          executedAt: expect.any(Date),
          status: 'completed',
          duration: expect.any(Number)
        })
      );
    });

    it('should handle job failures and retries', async () => {
      await jobScheduler.initialize();

      const failingJob = {
        name: 'failing-job',
        schedule: '*/1 * * * * *',
        jobType: 'test-failure',
        data: { shouldFail: true },
        enabled: true,
        retryAttempts: 3,
        retryDelay: 100
      };

      const job = await jobScheduler.scheduleJob(failingJob);

      // Wait for job to fail and retry
      await new Promise(resolve => setTimeout(resolve, 2000));

      const executionHistory = await jobScheduler.getJobExecutionHistory(job.id);
      const failedExecutions = executionHistory.filter(e => e.status === 'failed');

      expect(failedExecutions.length).toBeGreaterThan(0);
      expect(failedExecutions.length).toBeLessThanOrEqual(3); // Max retry attempts
    });

    it('should enable and disable scheduled jobs', async () => {
      await jobScheduler.initialize();

      const job = await jobScheduler.scheduleJob({
        name: 'toggle-job',
        schedule: '0 0 * * *',
        jobType: 'test',
        enabled: true
      });

      expect(job.enabled).toBe(true);

      await jobScheduler.disableJob(job.id);
      const disabledJob = await jobScheduler.getJob(job.id);
      expect(disabledJob.enabled).toBe(false);

      await jobScheduler.enableJob(job.id);
      const enabledJob = await jobScheduler.getJob(job.id);
      expect(enabledJob.enabled).toBe(true);
    });

    it('should handle timezone-aware scheduling', async () => {
      await jobScheduler.initialize();

      const timezoneJob = {
        name: 'timezone-job',
        schedule: '0 9 * * *', // 9 AM
        timezone: 'America/New_York',
        jobType: 'test',
        enabled: true
      };

      const job = await jobScheduler.scheduleJob(timezoneJob);

      expect(job.timezone).toBe('America/New_York');
      expect(job.nextRun).toBeDefined();

      // Verify next run is calculated with timezone
      const nextRun = new Date(job.nextRun);
      expect(nextRun.getTime()).toBeGreaterThan(Date.now());
    });

    it('should provide job statistics and monitoring', async () => {
      await jobScheduler.initialize();

      // Add some test jobs
      await jobScheduler.scheduleJob({
        name: 'stats-job-1',
        schedule: '*/5 * * * *',
        jobType: 'test',
        enabled: true
      });

      await jobScheduler.scheduleJob({
        name: 'stats-job-2',
        schedule: '0 0 * * *',
        jobType: 'test',
        enabled: false
      });

      const stats = await jobScheduler.getStatistics();

      expect(stats).toEqual({
        totalJobs: expect.any(Number),
        enabledJobs: expect.any(Number),
        disabledJobs: expect.any(Number),
        runningJobs: expect.any(Number),
        recentExecutions: expect.any(Number),
        failureRate: expect.any(Number),
        averageExecutionTime: expect.any(Number)
      });
    });
  });

  describe('ScheduledJobManager', () => {
    it('should manage job lifecycle', async () => {
      await scheduledJobManager.initialize();

      const jobConfig = {
        name: 'lifecycle-test',
        schedule: '0 0 * * *',
        handler: jest.fn().mockResolvedValue({ success: true }),
        enabled: true
      };

      const jobId = await scheduledJobManager.createJob(jobConfig);
      expect(jobId).toBeDefined();

      const job = await scheduledJobManager.getJob(jobId);
      expect(job.name).toBe('lifecycle-test');

      await scheduledJobManager.updateJob(jobId, { enabled: false });
      const updatedJob = await scheduledJobManager.getJob(jobId);
      expect(updatedJob.enabled).toBe(false);

      await scheduledJobManager.deleteJob(jobId);
      await expect(scheduledJobManager.getJob(jobId)).rejects.toThrow('Job not found');
    });

    it('should handle concurrent job execution limits', async () => {
      await scheduledJobManager.initialize();

      const concurrentJobConfig = {
        name: 'concurrent-test',
        schedule: '*/1 * * * * *',
        handler: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
          return { success: true };
        }),
        maxConcurrentInstances: 1,
        enabled: true
      };

      const jobId = await scheduledJobManager.createJob(concurrentJobConfig);

      // Wait for multiple execution attempts
      await new Promise(resolve => setTimeout(resolve, 3000));

      const executionHistory = await scheduledJobManager.getExecutionHistory(jobId);
      const concurrentExecutions = executionHistory.filter(e =>
        e.status === 'running' || e.status === 'completed'
      );

      expect(concurrentExecutions.length).toBe(1); // Should not exceed max concurrent instances
    });

    it('should handle job dependencies', async () => {
      await scheduledJobManager.initialize();

      const dependencyJob = await scheduledJobManager.createJob({
        name: 'dependency-job',
        schedule: '0 0 * * *',
        handler: jest.fn().mockResolvedValue({ success: true }),
        enabled: true
      });

      const dependentJob = await scheduledJobManager.createJob({
        name: 'dependent-job',
        schedule: '0 1 * * *',
        dependencies: [dependencyJob],
        handler: jest.fn().mockResolvedValue({ success: true }),
        enabled: true
      });

      const job = await scheduledJobManager.getJob(dependentJob);
      expect(job.dependencies).toContain(dependencyJob);
    });

    it('should handle job priority scheduling', async () => {
      await scheduledJobManager.initialize();

      const highPriorityJob = await scheduledJobManager.createJob({
        name: 'high-priority',
        schedule: '*/1 * * * * *',
        priority: 1,
        handler: jest.fn().mockResolvedValue({ success: true }),
        enabled: true
      });

      const lowPriorityJob = await scheduledJobManager.createJob({
        name: 'low-priority',
        schedule: '*/1 * * * * *',
        priority: 10,
        handler: jest.fn().mockResolvedValue({ success: true }),
        enabled: true
      });

      const executionQueue = await scheduledJobManager.getExecutionQueue();

      const highPriorityIndex = executionQueue.findIndex(j => j.id === highPriorityJob);
      const lowPriorityIndex = executionQueue.findIndex(j => j.id === lowPriorityJob);

      expect(highPriorityIndex).toBeLessThan(lowPriorityIndex);
    });
  });

  describe('CronJobService', () => {
    it('should validate cron expressions', async () => {
      await cronJobService.initialize();

      const validExpressions = [
        '0 0 * * *',      // Daily at midnight
        '*/15 * * * *',   // Every 15 minutes
        '0 9-17 * * 1-5', // Business hours weekdays
        '0 0 1 * *'       // Monthly
      ];

      const invalidExpressions = [
        '60 0 * * *',     // Invalid minute
        '0 25 * * *',     // Invalid hour
        '0 0 32 * *',     // Invalid day
        'invalid cron'     // Invalid format
      ];

      for (const expr of validExpressions) {
        expect(cronJobService.validateCronExpression(expr)).toBe(true);
      }

      for (const expr of invalidExpressions) {
        expect(cronJobService.validateCronExpression(expr)).toBe(false);
      }
    });

    it('should calculate next execution times', async () => {
      await cronJobService.initialize();

      const now = new Date('2025-01-15T10:30:00Z');
      const expression = '0 12 * * *'; // Daily at noon

      const nextRun = cronJobService.getNextExecutionTime(expression, now);
      const expectedNext = new Date('2025-01-15T12:00:00Z');

      expect(nextRun.getTime()).toBe(expectedNext.getTime());
    });

    it('should handle multiple timezone calculations', async () => {
      await cronJobService.initialize();

      const expression = '0 9 * * *'; // 9 AM
      const timezones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
      const baseDate = new Date('2025-01-15T10:00:00Z');

      const nextRuns = timezones.map(tz => ({
        timezone: tz,
        nextRun: cronJobService.getNextExecutionTime(expression, baseDate, tz)
      }));

      expect(nextRuns).toHaveLength(4);
      nextRuns.forEach(run => {
        expect(run.nextRun).toBeInstanceOf(Date);
        expect(run.nextRun.getTime()).toBeGreaterThan(baseDate.getTime());
      });
    });

    it('should handle daylight saving time transitions', async () => {
      await cronJobService.initialize();

      // Test DST transition in US Eastern timezone
      const dstStart = new Date('2025-03-08T06:00:00Z'); // Day before DST starts
      const expression = '0 2 * * *'; // 2 AM (during DST gap)

      const nextRun = cronJobService.getNextExecutionTime(
        expression,
        dstStart,
        'America/New_York'
      );

      expect(nextRun).toBeInstanceOf(Date);
      // Should handle the DST gap appropriately
    });

    it('should support complex cron expressions', async () => {
      await cronJobService.initialize();

      const complexExpressions = [
        '0 */2 * * 1-5',        // Every 2 hours, weekdays only
        '30 9,17 * * 1-5',      // 9:30 AM and 5:30 PM, weekdays
        '0 0 1,15 * *',         // 1st and 15th of each month
        '0 0 * * 0',            // Sundays only
        '0 2 * * 1',            // Mondays at 2 AM
        '*/5 9-17 * * 1-5'      // Every 5 minutes during business hours
      ];

      for (const expr of complexExpressions) {
        expect(cronJobService.validateCronExpression(expr)).toBe(true);

        const nextRun = cronJobService.getNextExecutionTime(expr);
        expect(nextRun).toBeInstanceOf(Date);
        expect(nextRun.getTime()).toBeGreaterThan(Date.now());
      }
    });
  });

  describe('Scheduled Job Types', () => {
    beforeEach(async () => {
      await jobScheduler.initialize();
    });

    it('should execute cleanup jobs correctly', async () => {
      const cleanupJob = {
        name: 'test-cleanup',
        schedule: '*/1 * * * * *',
        jobType: 'cleanup',
        data: {
          targetPath: '/tmp/test-cleanup',
          olderThanDays: 7,
          filePatterns: ['*.tmp', '*.log']
        },
        enabled: true
      };

      const job = await jobScheduler.scheduleJob(cleanupJob);

      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 1500));

      const history = await jobScheduler.getJobExecutionHistory(job.id);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].status).toBe('completed');
    });

    it('should execute analytics generation jobs', async () => {
      const analyticsJob = {
        name: 'test-analytics',
        schedule: '*/1 * * * * *',
        jobType: 'analytics',
        data: {
          reportType: 'daily-summary',
          timeRange: '24h',
          outputFormat: 'json'
        },
        enabled: true
      };

      const job = await jobScheduler.scheduleJob(analyticsJob);

      await new Promise(resolve => setTimeout(resolve, 1500));

      const history = await jobScheduler.getJobExecutionHistory(job.id);
      expect(history[0].result).toEqual(
        expect.objectContaining({
          reportGenerated: true,
          reportPath: expect.any(String)
        })
      );
    });

    it('should execute system monitoring jobs', async () => {
      const monitoringJob = {
        name: 'test-monitoring',
        schedule: '*/1 * * * * *',
        jobType: 'monitoring',
        data: {
          checks: ['memory', 'disk', 'queue-health'],
          alertThresholds: {
            memory: 0.8,
            disk: 0.9,
            queueLength: 100
          }
        },
        enabled: true
      };

      const job = await jobScheduler.scheduleJob(monitoringJob);

      await new Promise(resolve => setTimeout(resolve, 1500));

      const history = await jobScheduler.getJobExecutionHistory(job.id);
      expect(history[0].result).toEqual(
        expect.objectContaining({
          healthStatus: expect.any(String),
          metrics: expect.any(Object),
          alerts: expect.any(Array)
        })
      );
    });

    it('should execute database maintenance jobs', async () => {
      const maintenanceJob = {
        name: 'test-maintenance',
        schedule: '*/1 * * * * *',
        jobType: 'maintenance',
        data: {
          operations: ['cleanup-logs', 'optimize-indexes', 'update-stats'],
          databases: ['conversion-history', 'analytics']
        },
        enabled: true
      };

      const job = await jobScheduler.scheduleJob(maintenanceJob);

      await new Promise(resolve => setTimeout(resolve, 1500));

      const history = await jobScheduler.getJobExecutionHistory(job.id);
      expect(history[0].result).toEqual(
        expect.objectContaining({
          operationsCompleted: expect.any(Array),
          optimizationResults: expect.any(Object)
        })
      );
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle job processor crashes', async () => {
      await jobScheduler.initialize();

      const crashingJob = {
        name: 'crashing-job',
        schedule: '*/1 * * * * *',
        jobType: 'test-crash',
        enabled: true,
        restartOnFailure: true
      };

      const job = await jobScheduler.scheduleJob(crashingJob);

      // Wait for crash and recovery
      await new Promise(resolve => setTimeout(resolve, 2000));

      const status = await jobScheduler.getJobStatus(job.id);
      expect(status.restartCount).toBeGreaterThan(0);
    });

    it('should handle Redis connection failures', async () => {
      await jobScheduler.initialize();

      // Simulate Redis disconnection
      const redisClient = jobScheduler.getRedisClient();
      redisClient.emit('error', new Error('Connection lost'));

      // Should attempt reconnection
      await new Promise(resolve => setTimeout(resolve, 1000));

      const health = await jobScheduler.getHealth();
      expect(health.redis).toEqual(
        expect.objectContaining({
          status: expect.stringMatching(/connected|reconnecting/)
        })
      );
    });

    it('should handle job queue overflow', async () => {
      await jobScheduler.initialize();

      // Schedule many jobs quickly
      const jobs = [];
      for (let i = 0; i < 100; i++) {
        jobs.push(jobScheduler.scheduleJob({
          name: `overflow-job-${i}`,
          schedule: '*/1 * * * * *',
          jobType: 'test',
          enabled: true
        }));
      }

      await Promise.all(jobs);

      const stats = await jobScheduler.getStatistics();
      expect(stats.totalJobs).toBe(100);

      // Should handle queue overflow gracefully
      expect(stats.failureRate).toBeLessThan(0.1); // Less than 10% failure rate
    });
  });
});