import { CacheManager } from '../../src/cache/cache-manager';
import { RedisCache } from '../../src/cache/redis-cache';
import { MemoryCache } from '../../src/cache/memory-cache';
import { LRUCacheStrategy } from '../../src/cache/cache-strategy';
import { testSetup } from '../setup/test-setup';

describe('Caching System', () => {
  let cacheManager: CacheManager;
  let redisCache: RedisCache;
  let memoryCache: MemoryCache;
  let cacheStrategy: LRUCacheStrategy;

  beforeAll(async () => {
    await testSetup.setupRedis();
  });

  afterAll(async () => {
    await testSetup.teardown();
  });

  beforeEach(async () => {
    await testSetup.clearDatabase();
    cacheManager = new CacheManager();
    redisCache = new RedisCache();
    memoryCache = new MemoryCache();
    cacheStrategy = new LRUCacheStrategy({ maxSize: 100 });
  });

  afterEach(async () => {
    await cacheManager.shutdown();
    await redisCache.shutdown();
    await memoryCache.shutdown();
  });

  describe('CacheManager', () => {
    it('should initialize with multiple cache layers', async () => {
      await cacheManager.initialize({
        layers: [
          { type: 'memory', maxSize: 100, ttl: 300 },
          { type: 'redis', ttl: 3600 }
        ],
        strategy: 'layered'
      });

      expect(cacheManager.isInitialized()).toBe(true);
      expect(cacheManager.getLayerCount()).toBe(2);
    });

    it('should cache and retrieve data efficiently', async () => {
      await cacheManager.initialize({
        layers: [{ type: 'memory', maxSize: 50, ttl: 300 }],
        strategy: 'simple'
      });

      const testData = { id: 1, name: 'test-project', complexity: 'medium' };
      const cacheKey = 'analysis:repo:user/test-project';

      // Cache data
      await cacheManager.set(cacheKey, testData, 300);

      // Retrieve data
      const cachedData = await cacheManager.get(cacheKey);

      expect(cachedData).toEqual(testData);
    });

    it('should handle cache misses gracefully', async () => {
      await cacheManager.initialize({
        strategy: 'layered',
        layers: [{ type: 'memory', maxSize: 50 }]
      });

      const result = await cacheManager.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should respect TTL (time-to-live) settings', async () => {
      await cacheManager.initialize({
        strategy: 'layered',
        layers: [{ type: 'memory', ttl: 100 }] // 100ms TTL
      });

      const testData = { value: 'expires-soon' };
      await cacheManager.set('ttl-test', testData, 100);

      // Should exist immediately
      let result = await cacheManager.get('ttl-test');
      expect(result).toEqual(testData);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      result = await cacheManager.get('ttl-test');
      expect(result).toBeNull();
    });

    it('should handle cache invalidation', async () => {
      await cacheManager.initialize({
        strategy: 'layered',
        layers: [{ type: 'memory', maxSize: 50 }]
      });

      await cacheManager.set('invalidate-test', { data: 'test' });

      // Verify data exists
      let result = await cacheManager.get('invalidate-test');
      expect(result).toBeTruthy();

      // Invalidate
      await cacheManager.delete('invalidate-test');

      // Verify data is gone
      result = await cacheManager.get('invalidate-test');
      expect(result).toBeNull();
    });

    it('should support pattern-based invalidation', async () => {
      await cacheManager.initialize({
        strategy: 'layered',
        layers: [{ type: 'redis' }]
      });

      // Cache multiple related items
      await cacheManager.set('analysis:repo:user/project1', { data: 'project1' });
      await cacheManager.set('analysis:repo:user/project2', { data: 'project2' });
      await cacheManager.set('analysis:repo:org/project3', { data: 'project3' });
      await cacheManager.set('conversion:repo:user/project1', { data: 'conversion1' });

      // Invalidate all analysis caches for user
      await cacheManager.deletePattern('analysis:repo:user/*');

      // Check results
      expect(await cacheManager.get('analysis:repo:user/project1')).toBeNull();
      expect(await cacheManager.get('analysis:repo:user/project2')).toBeNull();
      expect(await cacheManager.get('analysis:repo:org/project3')).toBeTruthy();
      expect(await cacheManager.get('conversion:repo:user/project1')).toBeTruthy();
    });

    it('should provide cache statistics', async () => {
      await cacheManager.initialize({
        strategy: 'layered',
        layers: [{ type: 'memory', maxSize: 50 }],
        enableStats: true
      });

      // Perform cache operations
      await cacheManager.set('stats-test-1', { data: 'test1' });
      await cacheManager.set('stats-test-2', { data: 'test2' });
      await cacheManager.get('stats-test-1'); // hit
      await cacheManager.get('stats-test-1'); // hit
      await cacheManager.get('non-existent'); // miss

      const stats = await cacheManager.getStats();

      expect(stats).toEqual({
        hits: 2,
        misses: 1,
        sets: 2,
        deletes: 0,
        hitRate: 0.67, // 2/3
        totalKeys: 2,
        memoryUsage: expect.any(Number)
      });
    });

    it('should handle concurrent cache operations', async () => {
      await cacheManager.initialize({
        layers: [{ type: 'memory', maxSize: 100 }]
      });

      const concurrentOperations = [];

      // Create 50 concurrent set operations
      for (let i = 0; i < 50; i++) {
        concurrentOperations.push(
          cacheManager.set(`concurrent-${i}`, { index: i, data: `test-${i}` })
        );
      }

      await Promise.all(concurrentOperations);

      // Verify all data was cached
      for (let i = 0; i < 50; i++) {
        const result = await cacheManager.get(`concurrent-${i}`);
        expect(result).toEqual({ index: i, data: `test-${i}` });
      }
    });

    it('should implement LRU eviction when cache is full', async () => {
      await cacheManager.initialize({
        layers: [{ type: 'memory', maxSize: 3 }] // Small cache for testing
      });

      // Fill cache
      await cacheManager.set('item-1', { data: '1' });
      await cacheManager.set('item-2', { data: '2' });
      await cacheManager.set('item-3', { data: '3' });

      // Access item-1 to make it recently used
      await cacheManager.get('item-1');

      // Add new item, should evict item-2 (least recently used)
      await cacheManager.set('item-4', { data: '4' });

      expect(await cacheManager.get('item-1')).toBeTruthy(); // Still there
      expect(await cacheManager.get('item-2')).toBeNull(); // Evicted
      expect(await cacheManager.get('item-3')).toBeTruthy(); // Still there
      expect(await cacheManager.get('item-4')).toBeTruthy(); // Newly added
    });
  });

  describe('RedisCache', () => {
    beforeEach(async () => {
      await redisCache.initialize({
        host: 'localhost',
        port: 6379,
        db: 15, // Test database
        keyPrefix: 'test:'
      });
    });

    it('should store and retrieve complex objects', async () => {
      const complexObject = {
        analysis: {
          repository: { name: 'test-repo', complexity: 'high' },
          patterns: [
            { type: 'selector', count: 45 },
            { type: 'command', count: 12 }
          ]
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }
      };

      await redisCache.set('complex-object', complexObject, 300);
      const retrieved = await redisCache.get('complex-object');

      expect(retrieved).toEqual(complexObject);
    });

    it('should handle Redis connection failures gracefully', async () => {
      // Simulate Redis disconnection
      await redisCache.disconnect();

      // Operations should not throw but return fallback values
      const result = await redisCache.get('test-key');
      expect(result).toBeNull();

      const setResult = await redisCache.set('test-key', { data: 'test' });
      expect(setResult).toBe(false); // Indicates failure
    });

    it('should support atomic operations', async () => {
      const key = 'atomic-counter';

      // Initialize counter
      await redisCache.set(key, 0);

      // Increment atomically multiple times
      const incrementPromises = [];
      for (let i = 0; i < 10; i++) {
        incrementPromises.push(redisCache.increment(key));
      }

      await Promise.all(incrementPromises);

      const finalValue = await redisCache.get(key);
      expect(finalValue).toBe(10);
    });

    it('should implement distributed locking', async () => {
      const lockKey = 'analysis:repo:user/project';
      const lockTimeout = 1000; // 1 second

      // Acquire lock
      const lockAcquired = await redisCache.acquireLock(lockKey, lockTimeout);
      expect(lockAcquired).toBe(true);

      // Try to acquire same lock (should fail)
      const secondLockAttempt = await redisCache.acquireLock(lockKey, lockTimeout);
      expect(secondLockAttempt).toBe(false);

      // Release lock
      await redisCache.releaseLock(lockKey);

      // Now should be able to acquire again
      const thirdLockAttempt = await redisCache.acquireLock(lockKey, lockTimeout);
      expect(thirdLockAttempt).toBe(true);
    });

    it('should handle large data sets efficiently', async () => {
      const largeDataSet = [];
      for (let i = 0; i < 1000; i++) {
        largeDataSet.push({
          id: i,
          name: `item-${i}`,
          data: `data-${i}`.repeat(100) // Make each item reasonably large
        });
      }

      const startTime = Date.now();
      await redisCache.set('large-dataset', largeDataSet, 300);
      const setTime = Date.now() - startTime;

      const retrieveStartTime = Date.now();
      const retrieved = await redisCache.get('large-dataset');
      const retrieveTime = Date.now() - retrieveStartTime;

      expect(retrieved).toHaveLength(1000);
      expect(setTime).toBeLessThan(1000); // Should complete within 1 second
      expect(retrieveTime).toBeLessThan(500); // Should retrieve within 0.5 seconds
    });
  });

  describe('MemoryCache', () => {
    beforeEach(async () => {
      await memoryCache.initialize({
        maxSize: 100,
        ttl: 300,
        checkPeriod: 60
      });
    });

    it('should respect memory limits', async () => {
      const smallCache = new MemoryCache();
      await smallCache.initialize({
        maxSize: 3,
        maxMemoryMB: 1 // 1MB limit
      });

      // Try to store data that exceeds memory limit
      const largeObject = {
        data: 'x'.repeat(2 * 1024 * 1024) // 2MB string
      };

      const result = await smallCache.set('large-object', largeObject);
      expect(result).toBe(false); // Should fail due to memory limit

      await smallCache.shutdown();
    });

    it('should automatically clean up expired entries', async () => {
      const quickExpireCache = new MemoryCache();
      await quickExpireCache.initialize({
        maxSize: 50,
        ttl: 100, // 100ms TTL
        checkPeriod: 50 // Check every 50ms
      });

      await quickExpireCache.set('expire-test', { data: 'test' });

      // Should exist initially
      expect(await quickExpireCache.get('expire-test')).toBeTruthy();

      // Wait for cleanup cycle
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should be cleaned up
      expect(await quickExpireCache.get('expire-test')).toBeNull();

      await quickExpireCache.shutdown();
    });

    it('should provide memory usage statistics', async () => {
      // Add some data
      for (let i = 0; i < 10; i++) {
        await memoryCache.set(`item-${i}`, { index: i, data: `test-${i}` });
      }

      const stats = await memoryCache.getMemoryStats();

      expect(stats).toEqual({
        itemCount: 10,
        memoryUsageBytes: expect.any(Number),
        memoryUsageMB: expect.any(Number),
        maxSize: 100
      });

      expect(stats.memoryUsageBytes).toBeGreaterThan(0);
    });

    it('should handle rapid memory pressure scenarios', async () => {
      const pressureCache = new MemoryCache();
      await pressureCache.initialize({
        maxSize: 10,
        maxMemoryMB: 0.1 // Very small memory limit
      });

      // Rapidly add items to trigger memory pressure
      let successfulSets = 0;
      let failedSets = 0;

      for (let i = 0; i < 50; i++) {
        const result = await pressureCache.set(`pressure-${i}`, {
          data: 'test'.repeat(1000) // Each item is ~4KB
        });

        if (result) {
          successfulSets++;
        } else {
          failedSets++;
        }
      }

      expect(successfulSets).toBeLessThan(50); // Some should fail due to memory limits
      expect(failedSets).toBeGreaterThan(0);

      await pressureCache.shutdown();
    });
  });

  describe('CacheStrategy', () => {
    beforeEach(async () => {
      await cacheStrategy.initialize({
        defaultTtl: 300,
        strategies: {
          'analysis': { ttl: 3600, priority: 'high' },
          'conversion': { ttl: 1800, priority: 'medium' },
          'temporary': { ttl: 60, priority: 'low' }
        }
      });
    });

    it('should apply different strategies based on key patterns', async () => {
      const analysisKey = 'analysis:repo:user/project';
      const conversionKey = 'conversion:job:123';
      const tempKey = 'temporary:session:abc';

      const analysisStrategy = cacheStrategy.getStrategy(analysisKey);
      const conversionStrategy = cacheStrategy.getStrategy(conversionKey);
      const tempStrategy = cacheStrategy.getStrategy(tempKey);

      expect(analysisStrategy.ttl).toBe(3600);
      expect(analysisStrategy.priority).toBe('high');

      expect(conversionStrategy.ttl).toBe(1800);
      expect(conversionStrategy.priority).toBe('medium');

      expect(tempStrategy.ttl).toBe(60);
      expect(tempStrategy.priority).toBe('low');
    });

    it('should implement cache warming strategies', async () => {
      const warmupData = [
        { key: 'analysis:repo:popular/project1', data: { popularity: 'high' } },
        { key: 'analysis:repo:popular/project2', data: { popularity: 'high' } },
        { key: 'analysis:repo:popular/project3', data: { popularity: 'high' } }
      ];

      await cacheStrategy.warmCache(warmupData);

      // Verify all items were cached with appropriate strategies
      for (const item of warmupData) {
        const cached = await cacheManager.get(item.key);
        expect(cached).toEqual(item.data);
      }
    });

    it('should implement intelligent cache prefetching', async () => {
      const baseKey = 'analysis:repo:user/project';

      // Simulate access pattern
      await cacheManager.get(`${baseKey}-main`);

      // Should trigger prefetching of related items
      const prefetchedKeys = await cacheStrategy.triggerPrefetch(baseKey);

      expect(prefetchedKeys).toEqual(
        expect.arrayContaining([
          `${baseKey}-complexity`,
          `${baseKey}-patterns`,
          `${baseKey}-estimate`
        ])
      );
    });

    it('should handle cache coherence across instances', async () => {
      const coherenceKey = 'shared:analysis:project123';

      // Set up cache coherence
      await cacheStrategy.enableCoherence(coherenceKey);

      // Simulate update from another instance
      await cacheStrategy.invalidateCoherent(coherenceKey);

      // Local cache should be invalidated
      const result = await cacheManager.get(coherenceKey);
      expect(result).toBeNull();
    });

    it('should optimize cache performance based on access patterns', async () => {
      const accessPatterns = [
        { key: 'hot-key-1', accessCount: 100, lastAccess: Date.now() },
        { key: 'warm-key-1', accessCount: 50, lastAccess: Date.now() - 3600000 },
        { key: 'cold-key-1', accessCount: 5, lastAccess: Date.now() - 86400000 }
      ];

      const optimization = await cacheStrategy.optimizeBasedOnPatterns(accessPatterns);

      expect(optimization).toEqual({
        hotKeys: ['hot-key-1'],
        candidatesForEviction: ['cold-key-1'],
        recommendedTtlAdjustments: expect.any(Array),
        memoryOptimizations: expect.any(Array)
      });
    });
  });

  describe('Cache Performance Benchmarks', () => {
    it('should meet performance benchmarks for common operations', async () => {
      await cacheManager.initialize({
        layers: [
          { type: 'memory', maxSize: 1000 },
          { type: 'redis' }
        ]
      });

      const testData = { id: 1, complexity: 'medium', patterns: ['test'] };

      // Benchmark set operations
      const setStartTime = Date.now();
      for (let i = 0; i < 100; i++) {
        await cacheManager.set(`benchmark-set-${i}`, testData);
      }
      const setDuration = Date.now() - setStartTime;

      // Benchmark get operations
      const getStartTime = Date.now();
      for (let i = 0; i < 100; i++) {
        await cacheManager.get(`benchmark-set-${i}`);
      }
      const getDuration = Date.now() - getStartTime;

      // Performance assertions
      expect(setDuration).toBeLessThan(1000); // 100 sets in < 1 second
      expect(getDuration).toBeLessThan(500);  // 100 gets in < 0.5 seconds

      // Throughput calculations
      const setsPerSecond = 100 / (setDuration / 1000);
      const getsPerSecond = 100 / (getDuration / 1000);

      expect(setsPerSecond).toBeGreaterThan(100); // At least 100 sets/sec
      expect(getsPerSecond).toBeGreaterThan(200); // At least 200 gets/sec
    });

    it('should handle high concurrency efficiently', async () => {
      await cacheManager.initialize({
        strategy: 'layered',
        layers: [{ type: 'memory', maxSize: 1000 }]
      });

      const concurrentRequests = 1000;
      const startTime = Date.now();

      // Create concurrent operations
      const operations = [];
      for (let i = 0; i < concurrentRequests; i++) {
        if (i % 2 === 0) {
          operations.push(cacheManager.set(`concurrent-${i}`, { index: i }));
        } else {
          operations.push(cacheManager.get(`concurrent-${i - 1}`));
        }
      }

      await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should maintain performance under memory pressure', async () => {
      const pressureCache = new CacheManager();
      await pressureCache.initialize({
        layers: [{ type: 'memory', maxSize: 100 }] // Small cache
      });

      const iterations = 500; // More items than cache can hold
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await pressureCache.set(`pressure-${i}`, { index: i, data: `test-${i}` });

        // Occasionally read to test mixed workload
        if (i % 10 === 0) {
          await pressureCache.get(`pressure-${Math.max(0, i - 50)}`);
        }
      }

      const duration = Date.now() - startTime;

      // Should maintain reasonable performance even with evictions
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds

      await pressureCache.shutdown();
    });
  });
});