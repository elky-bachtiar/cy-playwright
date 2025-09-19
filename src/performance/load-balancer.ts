import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

export interface LoadBalancerConfig {
  algorithm: 'round-robin' | 'least-connections' | 'weighted-round-robin' | 'ip-hash';
  healthCheckInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
  weights?: Map<string, number>;
}

export interface ServerInstance {
  id: string;
  host: string;
  port: number;
  weight?: number;
  isHealthy: boolean;
  activeConnections: number;
  totalRequests: number;
  lastHealthCheck: number;
  responseTime: number;
}

export interface LoadBalancerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  serverStats: Map<string, ServerInstance>;
}

export class LoadBalancer extends EventEmitter {
  private logger = new Logger('LoadBalancer');
  private config: LoadBalancerConfig;
  private servers: Map<string, ServerInstance> = new Map();
  private currentIndex = 0;
  private healthCheckInterval?: NodeJS.Timeout;
  private stats: LoadBalancerStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    serverStats: new Map()
  };

  constructor(config: LoadBalancerConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing load balancer');

    if (this.config.healthCheckInterval) {
      this.startHealthChecks();
    }

    this.logger.info('Load balancer initialized successfully');
  }

  addServer(server: Omit<ServerInstance, 'isHealthy' | 'activeConnections' | 'totalRequests' | 'lastHealthCheck' | 'responseTime'>): void {
    const serverInstance: ServerInstance = {
      ...server,
      isHealthy: true,
      activeConnections: 0,
      totalRequests: 0,
      lastHealthCheck: Date.now(),
      responseTime: 0,
      weight: server.weight || 1
    };

    this.servers.set(server.id, serverInstance);
    this.stats.serverStats.set(server.id, serverInstance);
    this.logger.info(`Added server: ${server.id} (${server.host}:${server.port})`);
  }

  removeServer(serverId: string): void {
    if (this.servers.delete(serverId)) {
      this.stats.serverStats.delete(serverId);
      this.logger.info(`Removed server: ${serverId}`);
    }
  }

  async getNextServer(): Promise<ServerInstance | null> {
    const healthyServers = Array.from(this.servers.values()).filter(s => s.isHealthy);

    if (healthyServers.length === 0) {
      this.logger.warn('No healthy servers available');
      return null;
    }

    switch (this.config.algorithm) {
      case 'round-robin':
        return this.getRoundRobinServer(healthyServers);
      case 'least-connections':
        return this.getLeastConnectionsServer(healthyServers);
      case 'weighted-round-robin':
        return this.getWeightedRoundRobinServer(healthyServers);
      case 'ip-hash':
        return this.getIPHashServer(healthyServers);
      default:
        return this.getRoundRobinServer(healthyServers);
    }
  }

  async recordRequest(serverId: string, responseTime: number, success: boolean): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) return;

    server.totalRequests++;
    server.responseTime = (server.responseTime + responseTime) / 2; // Moving average

    this.stats.totalRequests++;
    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }

    this.stats.averageResponseTime = (this.stats.averageResponseTime + responseTime) / 2;

    if (success) {
      server.activeConnections = Math.max(0, server.activeConnections - 1);
    }
  }

  async recordConnectionStart(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (server) {
      server.activeConnections++;
    }
  }

  async getStats(): Promise<LoadBalancerStats> {
    return {
      ...this.stats,
      serverStats: new Map(this.stats.serverStats)
    };
  }

  private getRoundRobinServer(servers: ServerInstance[]): ServerInstance {
    const server = servers[this.currentIndex % servers.length];
    this.currentIndex++;
    return server;
  }

  private getLeastConnectionsServer(servers: ServerInstance[]): ServerInstance {
    return servers.reduce((least, current) =>
      current.activeConnections < least.activeConnections ? current : least
    );
  }

  private getWeightedRoundRobinServer(servers: ServerInstance[]): ServerInstance {
    const totalWeight = servers.reduce((sum, server) => sum + (server.weight || 1), 0);
    let randomWeight = Math.random() * totalWeight;

    for (const server of servers) {
      randomWeight -= (server.weight || 1);
      if (randomWeight <= 0) {
        return server;
      }
    }

    return servers[0]; // Fallback
  }

  private getIPHashServer(servers: ServerInstance[]): ServerInstance {
    // Simplified IP hash - in real implementation would use client IP
    const hash = Math.floor(Math.random() * servers.length);
    return servers[hash];
  }

  private startHealthChecks(): void {
    const interval = this.config.healthCheckInterval || 30000;
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, interval);

    this.logger.info(`Health checks started with ${interval}ms interval`);
  }

  private async performHealthChecks(): Promise<void> {
    const promises = Array.from(this.servers.values()).map(server =>
      this.checkServerHealth(server)
    );

    await Promise.all(promises);
  }

  private async checkServerHealth(server: ServerInstance): Promise<void> {
    try {
      const startTime = Date.now();

      // Simplified health check - in real implementation would make HTTP request
      await new Promise(resolve => setTimeout(resolve, 10));

      const responseTime = Date.now() - startTime;

      server.isHealthy = true;
      server.lastHealthCheck = Date.now();
      server.responseTime = responseTime;

      this.emit('serverHealthy', server);
    } catch (error) {
      server.isHealthy = false;
      server.lastHealthCheck = Date.now();

      this.logger.warn(`Server ${server.id} health check failed`, error);
      this.emit('serverUnhealthy', server);
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down load balancer');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.servers.clear();
    this.removeAllListeners();
  }
}