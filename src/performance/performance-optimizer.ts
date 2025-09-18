import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

export interface PerformanceConfig {
  enableMonitoring?: boolean;
  metricsInterval?: number;
  optimizationThresholds?: {
    cpuUsage: number;
    memoryUsage: number;
    responseTime: number;
  };
  enableAutoOptimization?: boolean;
  optimizationStrategies?: string[];
  enableBatching?: boolean;
  batchSize?: number;
  batchTimeout?: number;
  enableQueryOptimization?: boolean;
  queryCache?: boolean;
  enableAdaptiveAllocation?: boolean;
  allocationStrategies?: string[];
}

export interface PerformanceMetrics {
  timestamp: number;
  cpu: number;
  memory: number;
  responseTime: number;
  throughput: number;
  queueLength?: number;
}

export interface Bottleneck {
  type: string;
  severity: 'low' | 'medium' | 'high';
  currentValue: number;
  threshold: number;
  description: string;
}

export interface OptimizationAction {
  strategy: string;
  action: string;
  impact: string;
  estimatedImprovement: number;
}

export class PerformanceOptimizer extends EventEmitter {
  private logger = new Logger('PerformanceOptimizer');
  private config: PerformanceConfig;
  private monitoring = false;
  private metricsInterval?: NodeJS.Timeout;
  private currentMetrics: PerformanceMetrics = {
    timestamp: Date.now(),
    cpu: 0,
    memory: 0,
    responseTime: 0,
    throughput: 0
  };
  private responseTimesBuffer: number[] = [];
  private batchQueue: any[] = [];
  private batchTimer?: NodeJS.Timeout;
  private queryCache: Map<string, any> = new Map();
  private loadPatterns: Map<string, number> = new Map();

  async initialize(config: PerformanceConfig): Promise<void> {
    this.logger.info('Initializing performance optimizer');
    this.config = config;

    if (config.enableMonitoring) {
      this.startMonitoring();
    }

    this.logger.info('Performance optimizer initialized successfully');
  }

  private startMonitoring(): void {
    this.monitoring = true;
    const interval = this.config.metricsInterval || 5000;

    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, interval);

    this.logger.info(`Performance monitoring started with ${interval}ms interval`);
  }

  private collectMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    this.currentMetrics = {
      timestamp: Date.now(),
      cpu: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      memory: memUsage.heapUsed / memUsage.heapTotal,
      responseTime: this.calculateAverageResponseTime(),
      throughput: this.calculateThroughput()
    };

    this.emit('metrics', this.currentMetrics);

    // Trigger auto-optimization if enabled
    if (this.config.enableAutoOptimization) {
      this.checkForOptimizationTriggers();
    }
  }

  reportMetric(type: string, value: number): void {
    switch (type) {
      case 'cpu':
        this.currentMetrics.cpu = value;
        break;
      case 'memory':
        this.currentMetrics.memory = value;
        break;
      case 'responseTime':
        this.currentMetrics.responseTime = value;
        break;
      case 'queueLength':
        this.currentMetrics.queueLength = value;
        break;
    }
  }

  recordRequest(responseTime: number): void {
    this.responseTimesBuffer.push(responseTime);

    // Keep only last 100 response times
    if (this.responseTimesBuffer.length > 100) {
      this.responseTimesBuffer.shift();
    }
  }

  async detectBottlenecks(): Promise<Bottleneck[]> {
    const bottlenecks: Bottleneck[] = [];
    const thresholds = this.config.optimizationThresholds;

    if (!thresholds) {
      return bottlenecks;
    }

    // CPU bottleneck
    if (this.currentMetrics.cpu > thresholds.cpuUsage) {
      bottlenecks.push({
        type: 'cpu',
        severity: this.currentMetrics.cpu > 0.9 ? 'high' : 'medium',
        currentValue: this.currentMetrics.cpu,
        threshold: thresholds.cpuUsage,
        description: 'High CPU usage detected'
      });
    }

    // Memory bottleneck
    if (this.currentMetrics.memory > thresholds.memoryUsage) {
      bottlenecks.push({
        type: 'memory',
        severity: this.currentMetrics.memory > 0.95 ? 'high' : 'medium',
        currentValue: this.currentMetrics.memory,
        threshold: thresholds.memoryUsage,
        description: 'High memory usage detected'
      });
    }

    // Response time bottleneck
    if (this.currentMetrics.responseTime > thresholds.responseTime) {
      bottlenecks.push({
        type: 'responseTime',
        severity: this.currentMetrics.responseTime > thresholds.responseTime * 2 ? 'high' : 'medium',
        currentValue: this.currentMetrics.responseTime,
        threshold: thresholds.responseTime,
        description: 'High response time detected'
      });
    }

    return bottlenecks;
  }

  async triggerOptimization(): Promise<OptimizationAction[]> {
    const actions: OptimizationAction[] = [];
    const bottlenecks = await this.detectBottlenecks();

    for (const bottleneck of bottlenecks) {
      switch (bottleneck.type) {
        case 'cpu':
          actions.push({
            strategy: 'resource-scaling',
            action: 'scale-up-workers',
            impact: 'Distribute CPU load across more workers',
            estimatedImprovement: 30
          });
          break;

        case 'memory':
          actions.push({
            strategy: 'cache-optimization',
            action: 'increase-cache-size',
            impact: 'Reduce memory pressure through cache optimization',
            estimatedImprovement: 25
          });
          break;

        case 'responseTime':
          actions.push({
            strategy: 'request-throttling',
            action: 'enable-request-batching',
            impact: 'Reduce response time through request optimization',
            estimatedImprovement: 40
          });
          break;
      }
    }

    // Execute optimization actions
    for (const action of actions) {
      await this.executeOptimization(action);
    }

    return actions;
  }

  private async executeOptimization(action: OptimizationAction): Promise<void> {
    this.logger.info('Executing optimization', {
      strategy: action.strategy,
      action: action.action
    });

    // Implementation would depend on the specific action
    // This is a simplified example
    switch (action.action) {
      case 'scale-up-workers':
        // Would trigger worker scaling
        break;
      case 'increase-cache-size':
        // Would adjust cache parameters
        break;
      case 'enable-request-batching':
        // Would enable batching if not already enabled
        this.config.enableBatching = true;
        break;
    }
  }

  async addToBatch(requestId: string, data: any): Promise<any> {
    return new Promise((resolve) => {
      this.batchQueue.push({ requestId, data, resolve });

      if (this.batchQueue.length >= (this.config.batchSize || 10)) {
        this.processBatch();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.processBatch();
        }, this.config.batchTimeout || 100);
      }
    });
  }

  private processBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    const batch = this.batchQueue.splice(0);
    const batchId = `batch-${Date.now()}`;

    // Process all requests in the batch
    batch.forEach(item => {
      item.resolve({
        batchId,
        processed: true,
        requestId: item.requestId
      });
    });

    this.logger.debug(`Processed batch with ${batch.length} requests`, { batchId });
  }

  async getBatchStats(): Promise<any> {
    return {
      totalBatches: Math.ceil(this.responseTimesBuffer.length / (this.config.batchSize || 10)),
      averageBatchSize: this.config.batchSize || 10,
      currentQueueSize: this.batchQueue.length
    };
  }

  async executeOptimizedQuery(query: any): Promise<any> {
    const queryKey = this.generateQueryKey(query);

    // Check cache first
    if (this.config.queryCache && this.queryCache.has(queryKey)) {
      return {
        ...this.queryCache.get(queryKey),
        fromCache: true,
        executionTime: 1 // Very fast from cache
      };
    }

    // Execute query
    const startTime = Date.now();

    // Mock query execution
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));

    const executionTime = Date.now() - startTime;
    const result = {
      data: { results: [] }, // Mock result
      executionTime,
      fromCache: false
    };

    // Cache the result
    if (this.config.queryCache) {
      this.queryCache.set(queryKey, result);
    }

    return result;
  }

  recordLoadPattern(time: string, load: number): void {
    this.loadPatterns.set(time, load);
  }

  async calculateOptimalAllocation(): Promise<any> {
    const patterns = Array.from(this.loadPatterns.entries());
    const peakThreshold = 0.7;

    const peakHours = patterns
      .filter(([time, load]) => load > peakThreshold)
      .map(([time]) => time);

    return {
      peakHours,
      recommendedWorkers: {
        peak: Math.ceil(Math.max(...patterns.map(([, load]) => load)) * 10),
        normal: 5,
        low: 2
      },
      scalingTriggers: [
        { metric: 'cpu', threshold: 0.7 },
        { metric: 'queueLength', threshold: 50 }
      ]
    };
  }

  isMonitoring(): boolean {
    return this.monitoring;
  }

  getMetricsInterval(): number {
    return this.config.metricsInterval || 5000;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down performance optimizer');

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.monitoring = false;
  }

  private calculateAverageResponseTime(): number {
    if (this.responseTimesBuffer.length === 0) {
      return 0;
    }

    const sum = this.responseTimesBuffer.reduce((acc, time) => acc + time, 0);
    return sum / this.responseTimesBuffer.length;
  }

  private calculateThroughput(): number {
    // Simplified throughput calculation
    return this.responseTimesBuffer.length;
  }

  private checkForOptimizationTriggers(): void {
    // Check if automatic optimization should be triggered
    const thresholds = this.config.optimizationThresholds;
    if (!thresholds) return;

    if (this.currentMetrics.cpu > thresholds.cpuUsage ||
        this.currentMetrics.memory > thresholds.memoryUsage ||
        this.currentMetrics.responseTime > thresholds.responseTime) {

      this.triggerOptimization().catch(error => {
        this.logger.error('Auto-optimization failed', error);
      });
    }
  }

  private generateQueryKey(query: any): string {
    return Buffer.from(JSON.stringify(query)).toString('base64');
  }
}