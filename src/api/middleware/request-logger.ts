import { Request, Response, NextFunction } from 'express';
import { Logger } from '../../utils/logger';

export class RequestLogger {
  private static logger = new Logger('RequestLogger');

  static middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      // Log incoming request
      this.logger.info('Incoming request', {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: this.getClientIP(req),
        requestId: req.id,
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length']
      });

      // Override res.end to capture response details
      const originalEnd = res.end;
      let responseBody = '';

      // Capture response body for logging (only for development)
      if (process.env.NODE_ENV === 'development') {
        const originalSend = res.send;
        res.send = function(body: any) {
          responseBody = body;
          return originalSend.call(this, body);
        };
      }

      res.end = function(chunk?: any, encoding?: any) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Log response
        RequestLogger.logger.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          requestId: req.id,
          contentLength: res.getHeader('content-length'),
          userAgent: req.headers['user-agent'],
          ip: RequestLogger.getClientIP(req)
        });

        // Log slow requests as warnings
        if (duration > 5000) {
          RequestLogger.logger.warn('Slow request detected', {
            method: req.method,
            url: req.url,
            duration: `${duration}ms`,
            requestId: req.id
          });
        }

        // Log errors
        if (res.statusCode >= 400) {
          const logLevel = res.statusCode >= 500 ? 'error' : 'warn';
          RequestLogger.logger[logLevel]('Request failed', {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            requestId: req.id,
            responseBody: process.env.NODE_ENV === 'development' ? responseBody : undefined
          });
        }

        return originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  }

  private static getClientIP(req: Request): string {
    return (
      req.headers['x-forwarded-for'] as string ||
      req.headers['x-real-ip'] as string ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Log API metrics for monitoring
   */
  static logMetrics(req: Request, res: Response, duration: number): void {
    const metrics = {
      timestamp: new Date().toISOString(),
      method: req.method,
      endpoint: this.sanitizeEndpoint(req.route?.path || req.url),
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      ip: this.getClientIP(req),
      requestId: req.id
    };

    // In a real application, you might send these to a metrics collection service
    this.logger.info('Request metrics', metrics);
  }

  /**
   * Sanitize endpoint paths to remove dynamic parameters for better aggregation
   */
  private static sanitizeEndpoint(path: string): string {
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id') // UUIDs
      .replace(/\/\d+/g, '/:id') // Numeric IDs
      .replace(/\/[a-f0-9]{24}/g, '/:id') // MongoDB ObjectIds
      .replace(/\/[a-zA-Z0-9\-_]+\/[a-zA-Z0-9\-_]+/g, '/:owner/:repo'); // GitHub owner/repo
  }

  /**
   * Log security events
   */
  static logSecurityEvent(req: Request, event: string, details?: any): void {
    this.logger.warn('Security event', {
      event,
      method: req.method,
      url: req.url,
      ip: this.getClientIP(req),
      userAgent: req.headers['user-agent'],
      requestId: req.id,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  /**
   * Log rate limit events
   */
  static logRateLimit(req: Request, limit: number, remaining: number): void {
    this.logger.warn('Rate limit approached', {
      method: req.method,
      url: req.url,
      ip: this.getClientIP(req),
      limit,
      remaining,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }
}