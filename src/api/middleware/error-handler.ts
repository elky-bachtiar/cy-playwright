import { Request, Response, NextFunction } from 'express';
import { Logger } from '../../utils/logger';

export interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

export class ErrorHandler {
  private static logger = new Logger('ErrorHandler');

  static middleware() {
    return (error: ApiError, req: Request, res: Response, next: NextFunction) => {
      // Log the error
      this.logger.error('API Error:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: req.body,
        params: req.params,
        query: req.query,
        requestId: req.id
      });

      // Don't handle if response already sent
      if (res.headersSent) {
        return next(error);
      }

      const errorResponse = this.formatError(error, req);
      res.status(errorResponse.status).json(errorResponse.body);
    };
  }

  private static formatError(error: ApiError, req: Request) {
    const isDevelopment = process.env.NODE_ENV === 'development';

    // Default error response
    let status = error.status || 500;
    let code = error.code || 'INTERNAL_SERVER_ERROR';
    let message = error.message || 'An unexpected error occurred';

    // Handle specific error types
    if (error.name === 'ValidationError') {
      status = 400;
      code = 'VALIDATION_ERROR';
    } else if (error.name === 'CastError') {
      status = 400;
      code = 'INVALID_PARAMETER';
      message = 'Invalid parameter format';
    } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      status = 500;
      code = 'DATABASE_ERROR';
      message = 'Database operation failed';
    } else if (error.message.includes('ECONNREFUSED')) {
      status = 503;
      code = 'SERVICE_UNAVAILABLE';
      message = 'External service unavailable';
    } else if (error.message.includes('timeout')) {
      status = 408;
      code = 'REQUEST_TIMEOUT';
      message = 'Request timed out';
    } else if (error.message.includes('ENOTFOUND')) {
      status = 502;
      code = 'EXTERNAL_SERVICE_ERROR';
      message = 'Failed to connect to external service';
    } else if (error.message.includes('rate limit')) {
      status = 429;
      code = 'RATE_LIMIT_EXCEEDED';
    } else if (error.message.includes('unauthorized') || error.message.includes('Unauthorized')) {
      status = 401;
      code = 'UNAUTHORIZED';
    } else if (error.message.includes('forbidden') || error.message.includes('Forbidden')) {
      status = 403;
      code = 'FORBIDDEN';
    } else if (error.message.includes('not found') || error.message.includes('Not found')) {
      status = 404;
      code = 'NOT_FOUND';
    }

    // Build error response
    const errorBody: any = {
      error: message,
      code,
      timestamp: new Date().toISOString(),
      path: req.url,
      method: req.method,
      requestId: req.id
    };

    // Add additional details in development
    if (isDevelopment) {
      errorBody.stack = error.stack;
      errorBody.details = error.details;
    }

    // Add specific error details for certain error types
    if (code === 'VALIDATION_ERROR' && error.details) {
      errorBody.validationErrors = error.details;
    }

    if (code === 'RATE_LIMIT_EXCEEDED') {
      errorBody.retryAfter = 60; // Default retry after 60 seconds
    }

    // Add correlation ID for tracking
    if (req.headers['x-correlation-id']) {
      errorBody.correlationId = req.headers['x-correlation-id'];
    }

    return {
      status,
      body: errorBody
    };
  }

  /**
   * Handle unhandled promise rejections
   */
  static handleUnhandledRejection() {
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      this.logger.error('Unhandled Promise Rejection:', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise.toString()
      });

      // In production, you might want to exit the process
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('Exiting process due to unhandled promise rejection');
        process.exit(1);
      }
    });
  }

  /**
   * Handle uncaught exceptions
   */
  static handleUncaughtException() {
    process.on('uncaughtException', (error: Error) => {
      this.logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack
      });

      // Exit the process as it's in an undefined state
      this.logger.error('Exiting process due to uncaught exception');
      process.exit(1);
    });
  }

  /**
   * Create a standardized API error
   */
  static createError(message: string, status: number = 500, code?: string, details?: any): ApiError {
    const error = new Error(message) as ApiError;
    error.status = status;
    error.code = code;
    error.details = details;
    return error;
  }

  /**
   * Async wrapper that ensures errors are properly handled
   */
  static asyncWrapper(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}