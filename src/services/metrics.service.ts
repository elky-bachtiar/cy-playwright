import { Logger } from '../utils/logger';

export interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface MetricSummary {
  name: string;
  count: number;
  sum: number;
  average: number;
  min: number;
  max: number;
  unit: string;
  timeRange: {
    start: Date;
    end: Date;
  };
}

export interface ConversionMetrics {
  totalConversions: number;
  successfulConversions: number;
  failedConversions: number;
  averageConversionTime: number;
  averageFileSize: number;
  averageTestCount: number;
  conversionsByHour: Record<string, number>;
  errorsByType: Record<string, number>;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIO: number;
  activeConnections: number;
  requestsPerMinute: number;
  averageResponseTime: number;
  errorRate: number;
}

export interface PerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  throughput: number;
  concurrentUsers: number;
  peakMemoryUsage: number;
}

export class MetricsService {
  private metrics: Map<string, Metric[]> = new Map();
  private logger = new Logger('MetricsService');
  private readonly maxMetricsPerType = 10000; // Prevent memory bloat

  constructor() {
    // Clean up old metrics every hour
    setInterval(() => this.cleanupOldMetrics(), 60 * 60 * 1000);
  }

  recordMetric(
    name: string,
    value: number,
    unit: string = 'count',
    tags?: Record<string, string>
  ): void {
    const metric: Metric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      tags
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricsArray = this.metrics.get(name)!;
    metricsArray.push(metric);

    // Keep only recent metrics to prevent memory issues
    if (metricsArray.length > this.maxMetricsPerType) {
      metricsArray.splice(0, metricsArray.length - this.maxMetricsPerType);
    }

    this.logger.debug(`Recorded metric: ${name} = ${value} ${unit}`, { tags });
  }

  getMetricSummary(name: string, timeRangeHours: number = 24): MetricSummary | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
    const recentMetrics = metrics.filter(m => m.timestamp >= cutoffTime);

    if (recentMetrics.length === 0) {
      return null;
    }

    const values = recentMetrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      name,
      count: recentMetrics.length,
      sum,
      average: sum / recentMetrics.length,
      min: Math.min(...values),
      max: Math.max(...values),
      unit: recentMetrics[0].unit,
      timeRange: {
        start: recentMetrics[0].timestamp,
        end: recentMetrics[recentMetrics.length - 1].timestamp
      }
    };
  }

  getAllMetricSummaries(timeRangeHours: number = 24): MetricSummary[] {
    const summaries: MetricSummary[] = [];

    for (const metricName of this.metrics.keys()) {
      const summary = this.getMetricSummary(metricName, timeRangeHours);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries;
  }

  getConversionMetrics(timeRangeHours: number = 24): ConversionMetrics {
    const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

    // Get conversion-related metrics
    const totalConversions = this.getMetricCount('conversion.started', cutoffTime);
    const successfulConversions = this.getMetricCount('conversion.completed', cutoffTime);
    const failedConversions = this.getMetricCount('conversion.failed', cutoffTime);

    const avgConversionTime = this.getMetricAverage('conversion.duration', cutoffTime);
    const avgFileSize = this.getMetricAverage('conversion.file_size', cutoffTime);
    const avgTestCount = this.getMetricAverage('conversion.test_count', cutoffTime);

    const conversionsByHour = this.getHourlyBreakdown('conversion.started', timeRangeHours);
    const errorsByType = this.getErrorBreakdown(cutoffTime);

    return {
      totalConversions,
      successfulConversions,
      failedConversions,
      averageConversionTime: avgConversionTime || 0,
      averageFileSize: avgFileSize || 0,
      averageTestCount: avgTestCount || 0,
      conversionsByHour,
      errorsByType
    };
  }

  getSystemMetrics(): SystemMetrics {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      cpuUsage: 0, // Would need external library for real CPU usage
      memoryUsage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      diskUsage: 0, // Would need external library for disk usage
      networkIO: 0, // Would need external library for network I/O
      activeConnections: this.getMetricValue('system.active_connections') || 0,
      requestsPerMinute: this.getMetricRate('http.requests', 60) || 0,
      averageResponseTime: this.getMetricAverage('http.response_time', new Date(Date.now() - 60 * 60 * 1000)) || 0,
      errorRate: this.calculateErrorRate()
    };
  }

  getPerformanceMetrics(timeRangeHours: number = 1): PerformanceMetrics {
    const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

    const requestCount = this.getMetricCount('http.requests', cutoffTime);
    const avgResponseTime = this.getMetricAverage('http.response_time', cutoffTime) || 0;
    const p95ResponseTime = this.getMetricPercentile('http.response_time', 95, cutoffTime) || 0;
    const p99ResponseTime = this.getMetricPercentile('http.response_time', 99, cutoffTime) || 0;
    const errorRate = this.calculateErrorRate(cutoffTime);
    const throughput = requestCount / timeRangeHours;
    const concurrentUsers = this.getMetricMax('system.concurrent_users', cutoffTime) || 0;
    const peakMemoryUsage = this.getMetricMax('system.memory_usage', cutoffTime) || 0;

    return {
      requestCount,
      averageResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      errorRate,
      throughput,
      concurrentUsers,
      peakMemoryUsage
    };
  }

  recordConversionStarted(repositoryUrl: string, projectType: string): void {
    this.recordMetric('conversion.started', 1, 'count', {
      repository: repositoryUrl,
      project_type: projectType
    });
  }

  recordConversionCompleted(duration: number, fileCount: number, testCount: number): void {
    this.recordMetric('conversion.completed', 1, 'count');
    this.recordMetric('conversion.duration', duration, 'seconds');
    this.recordMetric('conversion.file_count', fileCount, 'files');
    this.recordMetric('conversion.test_count', testCount, 'tests');
  }

  recordConversionFailed(duration: number, errorType: string): void {
    this.recordMetric('conversion.failed', 1, 'count', { error_type: errorType });
    this.recordMetric('conversion.duration', duration, 'seconds');
  }

  recordHttpRequest(method: string, path: string, statusCode: number, responseTime: number): void {
    this.recordMetric('http.requests', 1, 'count', {
      method,
      path,
      status_code: statusCode.toString()
    });
    this.recordMetric('http.response_time', responseTime, 'milliseconds', {
      method,
      path
    });

    if (statusCode >= 400) {
      this.recordMetric('http.errors', 1, 'count', {
        status_code: statusCode.toString()
      });
    }
  }

  recordResourceUsage(cpuUsage: number, memoryUsage: number, diskUsage: number): void {
    this.recordMetric('system.cpu_usage', cpuUsage, 'percentage');
    this.recordMetric('system.memory_usage', memoryUsage, 'percentage');
    this.recordMetric('system.disk_usage', diskUsage, 'percentage');
  }

  private getMetricCount(name: string, cutoffTime: Date): number {
    const metrics = this.metrics.get(name);
    if (!metrics) return 0;

    return metrics.filter(m => m.timestamp >= cutoffTime).length;
  }

  private getMetricAverage(name: string, cutoffTime: Date): number | null {
    const metrics = this.metrics.get(name);
    if (!metrics) return null;

    const recentMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
    if (recentMetrics.length === 0) return null;

    const sum = recentMetrics.reduce((acc, metric) => acc + metric.value, 0);
    return sum / recentMetrics.length;
  }

  private getMetricValue(name: string): number | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;

    return metrics[metrics.length - 1].value;
  }

  private getMetricRate(name: string, windowSeconds: number): number | null {
    const metrics = this.metrics.get(name);
    if (!metrics) return null;

    const cutoffTime = new Date(Date.now() - windowSeconds * 1000);
    const recentCount = metrics.filter(m => m.timestamp >= cutoffTime).length;

    return (recentCount / windowSeconds) * 60; // Convert to per-minute rate
  }

  private getMetricMax(name: string, cutoffTime: Date): number | null {
    const metrics = this.metrics.get(name);
    if (!metrics) return null;

    const recentMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
    if (recentMetrics.length === 0) return null;

    return Math.max(...recentMetrics.map(m => m.value));
  }

  private getMetricPercentile(name: string, percentile: number, cutoffTime: Date): number | null {
    const metrics = this.metrics.get(name);
    if (!metrics) return null;

    const recentMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
    if (recentMetrics.length === 0) return null;

    const values = recentMetrics.map(m => m.value).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * values.length) - 1;

    return values[index];
  }

  private calculateErrorRate(cutoffTime: Date = new Date(Date.now() - 60 * 60 * 1000)): number {
    const totalRequests = this.getMetricCount('http.requests', cutoffTime);
    const errorRequests = this.getMetricCount('http.errors', cutoffTime);

    if (totalRequests === 0) return 0;
    return (errorRequests / totalRequests) * 100;
  }

  private getHourlyBreakdown(metricName: string, timeRangeHours: number): Record<string, number> {
    const metrics = this.metrics.get(metricName);
    if (!metrics) return {};

    const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
    const recentMetrics = metrics.filter(m => m.timestamp >= cutoffTime);

    const hourlyBreakdown: Record<string, number> = {};

    recentMetrics.forEach(metric => {
      const hour = metric.timestamp.toISOString().substring(0, 13); // YYYY-MM-DDTHH
      hourlyBreakdown[hour] = (hourlyBreakdown[hour] || 0) + 1;
    });

    return hourlyBreakdown;
  }

  private getErrorBreakdown(cutoffTime: Date): Record<string, number> {
    const errorMetrics = this.metrics.get('conversion.failed');
    if (!errorMetrics) return {};

    const recentErrors = errorMetrics.filter(m => m.timestamp >= cutoffTime);
    const errorsByType: Record<string, number> = {};

    recentErrors.forEach(metric => {
      const errorType = metric.tags?.error_type || 'unknown';
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    });

    return errorsByType;
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Keep 7 days

    for (const [name, metrics] of this.metrics.entries()) {
      const recentMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
      this.metrics.set(name, recentMetrics);
    }

    this.logger.info('Cleaned up old metrics');
  }

  // Health check methods
  async isHealthy(): Promise<boolean> {
    try {
      return this.metrics.size >= 0; // Basic health check
    } catch {
      return false;
    }
  }

  getStats(): Record<string, any> {
    return {
      metricTypes: this.metrics.size,
      totalMetrics: Array.from(this.metrics.values()).reduce((sum, arr) => sum + arr.length, 0),
      memoryUsage: process.memoryUsage()
    };
  }
}