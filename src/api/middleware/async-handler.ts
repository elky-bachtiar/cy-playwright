import { Request, Response, NextFunction } from 'express';

export class AsyncHandler {
  /**
   * Wraps async route handlers to properly catch and forward errors
   */
  static wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Timeout wrapper for long-running operations
   */
  static withTimeout(fn: Function, timeoutMs: number = 30000) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      try {
        await Promise.race([
          fn(req, res, next),
          timeoutPromise
        ]);
      } catch (error) {
        if (error.message.includes('timed out')) {
          return res.status(408).json({
            error: 'Request timeout',
            code: 'REQUEST_TIMEOUT',
            timeout: timeoutMs
          });
        }
        next(error);
      }
    };
  }

  /**
   * Retry wrapper for operations that might fail temporarily
   */
  static withRetry(fn: Function, maxRetries: number = 3, delayMs: number = 1000) {
    return async (req: Request, res: Response, next: NextFunction) => {
      let lastError: Error;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await fn(req, res, next);
        } catch (error) {
          lastError = error;

          // Don't retry client errors (4xx)
          if (error.status && error.status >= 400 && error.status < 500) {
            break;
          }

          // Don't retry on last attempt
          if (attempt === maxRetries) {
            break;
          }

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }

      next(lastError);
    };
  }

  /**
   * Circuit breaker pattern for external service calls
   */
  static withCircuitBreaker(
    fn: Function,
    failureThreshold: number = 5,
    resetTimeoutMs: number = 60000
  ) {
    let failureCount = 0;
    let lastFailureTime = 0;
    let circuitOpen = false;

    return async (req: Request, res: Response, next: NextFunction) => {
      const now = Date.now();

      // Reset circuit if enough time has passed
      if (circuitOpen && (now - lastFailureTime) > resetTimeoutMs) {
        circuitOpen = false;
        failureCount = 0;
      }

      // Reject if circuit is open
      if (circuitOpen) {
        return res.status(503).json({
          error: 'Service temporarily unavailable',
          code: 'CIRCUIT_BREAKER_OPEN',
          retryAfter: Math.ceil((resetTimeoutMs - (now - lastFailureTime)) / 1000)
        });
      }

      try {
        await fn(req, res, next);
        // Reset failure count on success
        failureCount = 0;
      } catch (error) {
        failureCount++;
        lastFailureTime = now;

        // Open circuit if failure threshold is reached
        if (failureCount >= failureThreshold) {
          circuitOpen = true;
        }

        next(error);
      }
    };
  }
}