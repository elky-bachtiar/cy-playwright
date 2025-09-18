import { PerformanceOptimizer } from '../../src/performance/performance-optimizer';
import { LoadBalancer } from '../../src/performance/load-balancer';
import { ResourceManager } from '../../src/performance/resource-manager';
import { CompressionService } from '../../src/performance/compression-service';
import { testSetup } from '../setup/test-setup';

describe('Performance Optimization System', () => {
  let performanceOptimizer: PerformanceOptimizer;
  let loadBalancer: LoadBalancer;
  let resourceManager: ResourceManager;
  let compressionService: CompressionService;

  beforeAll(async () => {
    await testSetup.setupRedis();
  });

  afterAll(async () => {
    await testSetup.teardown();
  });

  beforeEach(async () => {
    await testSetup.clearDatabase();
    performanceOptimizer = new PerformanceOptimizer();
    loadBalancer = new LoadBalancer();
    resourceManager = new ResourceManager();
    compressionService = new CompressionService();
  });

  afterEach(async () => {
    await performanceOptimizer.shutdown();
    await loadBalancer.shutdown();
    await resourceManager.shutdown();
  });

  describe('PerformanceOptimizer', () => {
    it('should initialize with performance monitoring', async () => {
      await performanceOptimizer.initialize({
        enableMonitoring: true,
        metricsInterval: 1000,
        optimizationThresholds: {
          cpuUsage: 0.8,
          memoryUsage: 0.9,
          responseTime: 2000
        }
      });

      expect(performanceOptimizer.isMonitoring()).toBe(true);
      expect(performanceOptimizer.getMetricsInterval()).toBe(1000);
    });

    it('should detect performance bottlenecks', async () => {
      await performanceOptimizer.initialize({
        enableMonitoring: true,
        metricsInterval: 100
      });

      // Simulate high CPU usage
      performanceOptimizer.reportMetric('cpu', 0.95);
      performanceOptimizer.reportMetric('memory', 0.85);
      performanceOptimizer.reportMetric('responseTime', 3000);

      await new Promise(resolve => setTimeout(resolve, 200));

      const bottlenecks = await performanceOptimizer.detectBottlenecks();

      expect(bottlenecks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'cpu',
            severity: 'high',
            currentValue: 0.95,
            threshold: 0.8
          }),
          expect.objectContaining({
            type: 'responseTime',
            severity: 'high',
            currentValue: 3000,
            threshold: 2000
          })
        ])
      );
    });

    it('should implement automatic optimization strategies', async () => {
      await performanceOptimizer.initialize({
        enableAutoOptimization: true,
        optimizationStrategies: [
          'resource-scaling',
          'cache-optimization',
          'request-throttling'
        ]
      });

      // Trigger optimization conditions
      performanceOptimizer.reportMetric('queueLength', 150);
      performanceOptimizer.reportMetric('responseTime', 2500);

      const optimizations = await performanceOptimizer.triggerOptimization();

      expect(optimizations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            strategy: 'resource-scaling',
            action: 'scale-up-workers',
            impact: expect.any(String)
          }),
          expect.objectContaining({
            strategy: 'cache-optimization',
            action: 'increase-cache-size',
            impact: expect.any(String)
          })
        ])
      );
    });

    it('should monitor real-time performance metrics', async () => {
      await performanceOptimizer.initialize({
        enableMonitoring: true,
        metricsInterval: 50
      });

      // Start monitoring
      const metrics = [];
      performanceOptimizer.on('metrics', (data) => {
        metrics.push(data);
      });

      // Simulate load for monitoring
      for (let i = 0; i < 5; i++) {
        performanceOptimizer.recordRequest(100 + i * 20); // Increasing response times
        await new Promise(resolve => setTimeout(resolve, 60));
      }

      expect(metrics.length).toBeGreaterThan(3);
      expect(metrics[0]).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          cpu: expect.any(Number),
          memory: expect.any(Number),
          responseTime: expect.any(Number),
          throughput: expect.any(Number)
        })
      );
    });

    it('should implement request batching optimization', async () => {
      await performanceOptimizer.initialize({
        enableBatching: true,
        batchSize: 10,
        batchTimeout: 100
      });

      const batchedResults = [];

      // Add multiple requests quickly
      const requests = [];
      for (let i = 0; i < 25; i++) {
        requests.push(
          performanceOptimizer.addToBatch(`request-${i}`, { id: i, data: `test-${i}` })
        );
      }

      const results = await Promise.all(requests);

      // Should be processed in batches
      expect(results).toHaveLength(25);
      results.forEach(result => {
        expect(result.batchId).toBeDefined();
        expect(result.processed).toBe(true);
      });

      // Verify batching occurred
      const batchStats = await performanceOptimizer.getBatchStats();
      expect(batchStats.totalBatches).toBeGreaterThanOrEqual(3); // 25 requests / 10 batch size
    });

    it('should optimize database query performance', async () => {
      await performanceOptimizer.initialize({
        enableQueryOptimization: true,
        queryCache: true
      });

      const testQuery = {
        type: 'find',
        collection: 'conversions',
        filters: { status: 'completed' },
        sort: { createdAt: -1 },
        limit: 50
      };

      // First execution (should be slow)
      const firstExecution = await performanceOptimizer.executeOptimizedQuery(testQuery);
      const firstDuration = firstExecution.executionTime;

      // Second execution (should use cache)
      const secondExecution = await performanceOptimizer.executeOptimizedQuery(testQuery);
      const secondDuration = secondExecution.executionTime;

      expect(secondDuration).toBeLessThan(firstDuration * 0.5); // At least 50% faster
      expect(secondExecution.fromCache).toBe(true);
    });

    it('should implement adaptive resource allocation', async () => {
      await performanceOptimizer.initialize({
        enableAdaptiveAllocation: true,
        allocationStrategies: ['cpu-based', 'queue-based', 'time-based']
      });

      // Simulate varying load patterns
      const loadPatterns = [
        { time: '09:00', load: 0.3 },
        { time: '12:00', load: 0.8 },
        { time: '15:00', load: 0.9 },
        { time: '18:00', load: 0.4 },
        { time: '22:00', load: 0.1 }
      ];

      for (const pattern of loadPatterns) {
        performanceOptimizer.recordLoadPattern(pattern.time, pattern.load);
      }

      const allocation = await performanceOptimizer.calculateOptimalAllocation();

      expect(allocation).toEqual({
        peakHours: expect.arrayContaining(['12:00', '15:00']),
        recommendedWorkers: {
          peak: expect.any(Number),
          normal: expect.any(Number),
          low: expect.any(Number)
        },
        scalingTriggers: expect.any(Array)
      });
    });
  });

  describe('LoadBalancer', () => {
    it('should distribute requests across multiple workers', async () => {
      await loadBalancer.initialize({
        algorithm: 'round-robin',
        workers: [
          { id: 'worker-1', weight: 1, health: 'healthy' },
          { id: 'worker-2', weight: 1, health: 'healthy' },
          { id: 'worker-3', weight: 1, health: 'healthy' }
        ]
      });

      const assignments = [];
      for (let i = 0; i < 9; i++) {
        const assignment = await loadBalancer.assignRequest(`request-${i}`);
        assignments.push(assignment.workerId);
      }

      // Should distribute evenly in round-robin
      expect(assignments).toEqual([
        'worker-1', 'worker-2', 'worker-3',
        'worker-1', 'worker-2', 'worker-3',
        'worker-1', 'worker-2', 'worker-3'
      ]);
    });

    it('should implement weighted load balancing', async () => {
      await loadBalancer.initialize({
        algorithm: 'weighted-round-robin',
        workers: [
          { id: 'high-capacity', weight: 3, health: 'healthy' },
          { id: 'medium-capacity', weight: 2, health: 'healthy' },
          { id: 'low-capacity', weight: 1, health: 'healthy' }
        ]
      });

      const assignments = [];
      for (let i = 0; i < 12; i++) {
        const assignment = await loadBalancer.assignRequest(`request-${i}`);
        assignments.push(assignment.workerId);
      }

      // Count assignments per worker
      const counts = assignments.reduce((acc, workerId) => {
        acc[workerId] = (acc[workerId] || 0) + 1;
        return acc;
      }, {});

      expect(counts['high-capacity']).toBe(6);   // 3/6 weight = 50%
      expect(counts['medium-capacity']).toBe(4); // 2/6 weight = 33%
      expect(counts['low-capacity']).toBe(2);    // 1/6 weight = 17%
    });

    it('should implement least-connections algorithm', async () => {
      await loadBalancer.initialize({
        algorithm: 'least-connections',
        workers: [
          { id: 'worker-1', activeConnections: 5 },
          { id: 'worker-2', activeConnections: 2 },
          { id: 'worker-3', activeConnections: 8 }
        ]
      });

      const assignment = await loadBalancer.assignRequest('test-request');

      // Should assign to worker with least connections
      expect(assignment.workerId).toBe('worker-2');
    });

    it('should handle worker health checks and failover', async () => {
      await loadBalancer.initialize({
        algorithm: 'round-robin',
        healthCheckInterval: 100,
        workers: [
          { id: 'healthy-worker', health: 'healthy' },
          { id: 'unhealthy-worker', health: 'unhealthy' },
          { id: 'degraded-worker', health: 'degraded' }
        ]
      });

      // Should only assign to healthy workers
      const assignments = [];
      for (let i = 0; i < 6; i++) {
        const assignment = await loadBalancer.assignRequest(`request-${i}`);
        assignments.push(assignment.workerId);
      }

      // Should only include healthy and degraded workers (not unhealthy)
      expect(assignments).not.toContain('unhealthy-worker');
      expect(assignments.filter(id => id === 'healthy-worker').length).toBeGreaterThan(0);
    });

    it('should implement sticky sessions for stateful requests', async () => {
      await loadBalancer.initialize({
        algorithm: 'round-robin',
        enableStickySession: true,
        sessionKey: 'userId'
      });

      const userId = 'user-123';

      // First request should establish session
      const firstAssignment = await loadBalancer.assignRequest('request-1', { userId });
      const assignedWorker = firstAssignment.workerId;

      // Subsequent requests with same userId should go to same worker
      for (let i = 2; i <= 5; i++) {
        const assignment = await loadBalancer.assignRequest(`request-${i}`, { userId });
        expect(assignment.workerId).toBe(assignedWorker);
      }
    });

    it('should provide load balancing statistics', async () => {
      await loadBalancer.initialize({
        algorithm: 'round-robin',
        enableStats: true,
        workers: [
          { id: 'worker-1' },
          { id: 'worker-2' }
        ]
      });

      // Process some requests
      for (let i = 0; i < 10; i++) {
        await loadBalancer.assignRequest(`request-${i}`);
      }

      const stats = await loadBalancer.getStats();

      expect(stats).toEqual({
        totalRequests: 10,
        workerStats: {
          'worker-1': {
            requests: 5,
            responseTime: expect.any(Number),
            errorRate: expect.any(Number)
          },
          'worker-2': {
            requests: 5,
            responseTime: expect.any(Number),
            errorRate: expect.any(Number)
          }
        },
        algorithm: 'round-robin',
        averageResponseTime: expect.any(Number)
      });
    });
  });

  describe('ResourceManager', () => {
    it('should monitor system resource usage', async () => {
      await resourceManager.initialize({
        monitoringInterval: 100,
        thresholds: {
          cpu: 0.8,
          memory: 0.9,
          disk: 0.85
        }
      });

      const resourceStats = await resourceManager.getResourceStats();

      expect(resourceStats).toEqual({
        cpu: {
          usage: expect.any(Number),
          cores: expect.any(Number),
          loadAverage: expect.any(Array)
        },
        memory: {
          total: expect.any(Number),
          used: expect.any(Number),
          free: expect.any(Number),
          percentage: expect.any(Number)
        },
        disk: {
          total: expect.any(Number),
          used: expect.any(Number),
          free: expect.any(Number),
          percentage: expect.any(Number)
        }
      });
    });

    it('should implement automatic resource scaling', async () => {
      await resourceManager.initialize({
        enableAutoScaling: true,
        scaleUpThreshold: 0.8,
        scaleDownThreshold: 0.3,
        cooldownPeriod: 300000 // 5 minutes
      });

      // Simulate high resource usage
      resourceManager.reportUsage('cpu', 0.9);
      resourceManager.reportUsage('memory', 0.85);

      const scalingDecision = await resourceManager.evaluateScaling();

      expect(scalingDecision).toEqual({
        action: 'scale-up',
        reason: 'High CPU and memory usage detected',
        recommendedWorkers: expect.any(Number),
        currentWorkers: expect.any(Number)
      });
    });

    it('should manage memory pool efficiently', async () => {
      await resourceManager.initialize({
        memoryPool: {
          initialSize: 100 * 1024 * 1024, // 100MB
          maxSize: 500 * 1024 * 1024,     // 500MB
          growthFactor: 1.5
        }
      });

      // Allocate memory blocks
      const allocations = [];
      for (let i = 0; i < 10; i++) {
        const allocation = await resourceManager.allocateMemory(10 * 1024 * 1024); // 10MB each
        allocations.push(allocation);
      }

      const poolStats = await resourceManager.getMemoryPoolStats();

      expect(poolStats).toEqual({
        totalAllocated: 100 * 1024 * 1024, // 100MB total
        freeBlocks: expect.any(Number),
        fragmentation: expect.any(Number),
        efficiency: expect.any(Number)
      });

      // Free some allocations
      for (let i = 0; i < 5; i++) {
        await resourceManager.freeMemory(allocations[i].id);
      }

      const updatedStats = await resourceManager.getMemoryPoolStats();
      expect(updatedStats.totalAllocated).toBe(50 * 1024 * 1024); // 50MB remaining
    });

    it('should handle resource contention gracefully', async () => {
      await resourceManager.initialize({
        enableContentionDetection: true,
        maxConcurrentOperations: 5
      });

      // Start multiple concurrent operations
      const operations = [];
      for (let i = 0; i < 10; i++) {
        operations.push(
          resourceManager.executeWithResourceLock(`operation-${i}`, async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return { completed: true, id: i };
          })
        );
      }

      const results = await Promise.all(operations);

      // All should complete successfully despite contention
      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.completed).toBe(true);
        expect(result.id).toBe(index);
      });

      const contentionStats = await resourceManager.getContentionStats();
      expect(contentionStats.queuedOperations).toBeGreaterThan(0);
    });

    it('should optimize garbage collection patterns', async () => {
      await resourceManager.initialize({
        enableGCOptimization: true,
        gcStrategy: 'adaptive'
      });

      // Simulate memory allocation patterns
      const allocations = [];
      for (let i = 0; i < 100; i++) {
        allocations.push(new Array(10000).fill(`data-${i}`));

        if (i % 20 === 0) {
          // Trigger GC optimization analysis
          await resourceManager.analyzeGCPatterns();
        }
      }

      const gcStats = await resourceManager.getGCStats();

      expect(gcStats).toEqual({
        collections: expect.any(Number),
        averagePause: expect.any(Number),
        memoryFreed: expect.any(Number),
        efficiency: expect.any(Number),
        recommendations: expect.any(Array)
      });
    });
  });

  describe('CompressionService', () => {
    it('should compress data efficiently for storage', async () => {
      await compressionService.initialize({
        algorithm: 'gzip',
        level: 6
      });

      const testData = {
        analysis: {
          repository: 'large-project',
          files: new Array(1000).fill(null).map((_, i) => ({
            name: `file-${i}.js`,
            content: 'function test() { return "test data"; }'.repeat(100)
          }))
        }
      };

      const originalSize = JSON.stringify(testData).length;
      const compressed = await compressionService.compress(testData);
      const decompressed = await compressionService.decompress(compressed);

      expect(compressed.byteLength).toBeLessThan(originalSize * 0.5); // At least 50% compression
      expect(decompressed).toEqual(testData);
    });

    it('should choose optimal compression algorithm based on data type', async () => {
      await compressionService.initialize({
        autoSelectAlgorithm: true
      });

      const textData = { type: 'text', content: 'Lorem ipsum '.repeat(1000) };
      const binaryData = { type: 'binary', content: new Uint8Array(10000) };
      const jsonData = { type: 'json', data: { nested: { deep: { objects: true } } } };

      const textCompressed = await compressionService.compressOptimal(textData);
      const binaryCompressed = await compressionService.compressOptimal(binaryData);
      const jsonCompressed = await compressionService.compressOptimal(jsonData);

      expect(textCompressed.algorithm).toBe('gzip');    // Good for text
      expect(binaryCompressed.algorithm).toBe('lz4');   // Fast for binary
      expect(jsonCompressed.algorithm).toBe('brotli');  // Efficient for JSON
    });

    it('should stream large data compression', async () => {
      await compressionService.initialize({
        enableStreaming: true,
        chunkSize: 64 * 1024 // 64KB chunks
      });

      // Create large data stream
      const largeData = new Array(10000).fill(null).map((_, i) => ({
        id: i,
        data: 'large data content '.repeat(100)
      }));

      const compressionStream = compressionService.createCompressionStream();
      const chunks = [];

      compressionStream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      compressionStream.on('end', () => {
        const totalCompressed = Buffer.concat(chunks);
        expect(totalCompressed.length).toBeGreaterThan(0);
      });

      // Write data in chunks
      for (let i = 0; i < largeData.length; i += 100) {
        const chunk = largeData.slice(i, i + 100);
        compressionStream.write(JSON.stringify(chunk));
      }

      compressionStream.end();
    });

    it('should implement adaptive compression based on performance', async () => {
      await compressionService.initialize({
        adaptiveCompression: true,
        performanceTarget: 100 // 100ms max compression time
      });

      const performanceData = [];

      // Test different data sizes
      for (let size = 100; size <= 10000; size += 1000) {
        const testData = {
          size,
          content: 'x'.repeat(size)
        };

        const startTime = Date.now();
        const compressed = await compressionService.compressAdaptive(testData);
        const compressionTime = Date.now() - startTime;

        performanceData.push({
          size,
          compressionTime,
          compressionRatio: testData.content.length / compressed.byteLength,
          algorithm: compressed.algorithm
        });
      }

      // Should adapt algorithm based on size and performance
      const smallDataAlgorithm = performanceData.find(d => d.size <= 1000)?.algorithm;
      const largeDataAlgorithm = performanceData.find(d => d.size >= 5000)?.algorithm;

      expect(smallDataAlgorithm).toBe('lz4');   // Fast for small data
      expect(largeDataAlgorithm).toBe('gzip');  // Better compression for large data
    });
  });

  describe('Integrated Performance Testing', () => {
    it('should maintain performance under realistic load', async () => {
      // Initialize all systems
      await performanceOptimizer.initialize({ enableMonitoring: true });
      await loadBalancer.initialize({
        algorithm: 'least-connections',
        workers: [
          { id: 'worker-1', health: 'healthy' },
          { id: 'worker-2', health: 'healthy' }
        ]
      });
      await resourceManager.initialize({ enableAutoScaling: true });

      const testLoad = {
        concurrentUsers: 50,
        requestsPerSecond: 100,
        testDuration: 5000 // 5 seconds
      };

      const startTime = Date.now();
      const requests = [];

      // Simulate realistic load
      for (let i = 0; i < testLoad.concurrentUsers; i++) {
        requests.push(
          simulateUserLoad(i, testLoad.requestsPerSecond / testLoad.concurrentUsers, testLoad.testDuration)
        );
      }

      const results = await Promise.all(requests);
      const totalDuration = Date.now() - startTime;

      // Performance assertions
      expect(totalDuration).toBeLessThan(testLoad.testDuration * 1.2); // Within 20% of expected

      const successfulRequests = results.flat().filter(r => r.success).length;
      const totalRequests = results.flat().length;
      const successRate = successfulRequests / totalRequests;

      expect(successRate).toBeGreaterThan(0.95); // 95% success rate

      const avgResponseTime = results.flat()
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.responseTime, 0) / successfulRequests;

      expect(avgResponseTime).toBeLessThan(1000); // Average response time under 1 second
    });

    async function simulateUserLoad(userId: number, rps: number, duration: number): Promise<any[]> {
      const requests = [];
      const interval = 1000 / rps;
      const endTime = Date.now() + duration;

      while (Date.now() < endTime) {
        const requestStart = Date.now();

        try {
          // Simulate API request
          await loadBalancer.assignRequest(`user-${userId}-request-${Date.now()}`);
          await new Promise(resolve => setTimeout(resolve, Math.random() * 100)); // Simulate processing

          requests.push({
            success: true,
            responseTime: Date.now() - requestStart,
            userId
          });
        } catch (error) {
          requests.push({
            success: false,
            error: error.message,
            userId
          });
        }

        await new Promise(resolve => setTimeout(resolve, interval));
      }

      return requests;
    }
  });
});