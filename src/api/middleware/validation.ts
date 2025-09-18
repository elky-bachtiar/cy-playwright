import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';

export class ValidationMiddleware {
  static validateRepositoryUrl() {
    return [
      body('repositoryUrl')
        .notEmpty()
        .withMessage('Repository URL is required')
        .isURL()
        .withMessage('Invalid URL format')
        .custom((value) => {
          const githubPattern = /^https:\/\/github\.com\/[\w\.-]+\/[\w\.-]+\/?$/;
          const gitSshPattern = /^git@github\.com:[\w\.-]+\/[\w\.-]+\.git$/;

          if (!githubPattern.test(value) && !gitSshPattern.test(value)) {
            throw new Error('Must be a valid GitHub repository URL');
          }
          return true;
        }),
      this.handleValidationErrors
    ];
  }

  static validateConversionRequest() {
    return [
      body('repositoryUrl')
        .notEmpty()
        .withMessage('Repository URL is required')
        .isURL()
        .withMessage('Invalid repository URL format')
        .custom((value) => {
          const githubPattern = /^https:\/\/github\.com\/[\w\.-]+\/[\w\.-]+\/?$/;
          const gitSshPattern = /^git@github\.com:[\w\.-]+\/[\w\.-]+\.git$/;

          if (!githubPattern.test(value) && !gitSshPattern.test(value)) {
            throw new Error('Must be a valid GitHub repository URL');
          }
          return true;
        }),

      body('outputPath')
        .optional()
        .isString()
        .withMessage('Output path must be a string')
        .isLength({ min: 1, max: 200 })
        .withMessage('Output path must be between 1 and 200 characters'),

      body('branch')
        .optional()
        .isString()
        .withMessage('Branch must be a string')
        .matches(/^[\w\.\-\/]+$/)
        .withMessage('Invalid branch name format'),

      body('accessToken')
        .optional()
        .isString()
        .withMessage('Access token must be a string')
        .custom((value) => {
          if (value && !value.startsWith('github_pat_') && !value.startsWith('ghp_')) {
            throw new Error('Invalid GitHub token format');
          }
          return true;
        }),

      body('options')
        .optional()
        .isObject()
        .withMessage('Options must be an object'),

      body('options.preserveStructure')
        .optional()
        .isBoolean()
        .withMessage('preserveStructure must be a boolean'),

      body('options.generateTypes')
        .optional()
        .isBoolean()
        .withMessage('generateTypes must be a boolean'),

      body('options.optimizeSelectors')
        .optional()
        .isBoolean()
        .withMessage('optimizeSelectors must be a boolean'),

      body('options.includeExamples')
        .optional()
        .isBoolean()
        .withMessage('includeExamples must be a boolean'),

      body('userEmail')
        .optional()
        .isEmail()
        .withMessage('Invalid email format'),

      this.handleValidationErrors
    ];
  }

  static validateJobId() {
    return [
      param('jobId')
        .notEmpty()
        .withMessage('Job ID is required')
        .isString()
        .withMessage('Job ID must be a string')
        .isLength({ min: 1, max: 50 })
        .withMessage('Job ID must be between 1 and 50 characters')
        .matches(/^[a-zA-Z0-9\-_]+$/)
        .withMessage('Job ID contains invalid characters'),

      this.handleValidationErrors
    ];
  }

  static validateSearchQuery() {
    return [
      query('q')
        .notEmpty()
        .withMessage('Search query is required')
        .isString()
        .withMessage('Search query must be a string')
        .isLength({ min: 1, max: 100 })
        .withMessage('Search query must be between 1 and 100 characters'),

      query('language')
        .optional()
        .isString()
        .withMessage('Language must be a string')
        .isIn(['javascript', 'typescript', 'python', 'java', 'csharp', 'ruby', 'go'])
        .withMessage('Invalid language filter'),

      query('sort')
        .optional()
        .isIn(['stars', 'forks', 'updated', 'relevance'])
        .withMessage('Invalid sort parameter'),

      query('order')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Order must be asc or desc'),

      query('page')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Page must be between 1 and 100'),

      query('per_page')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Per page must be between 1 and 100'),

      this.handleValidationErrors
    ];
  }

  static validateAccessToken() {
    return [
      body('accessToken')
        .notEmpty()
        .withMessage('Access token is required')
        .isString()
        .withMessage('Access token must be a string')
        .custom((value) => {
          if (!value.startsWith('github_pat_') && !value.startsWith('ghp_')) {
            throw new Error('Invalid GitHub token format');
          }
          return true;
        }),

      this.handleValidationErrors
    ];
  }

  static validateOwnerRepo() {
    return [
      param('owner')
        .notEmpty()
        .withMessage('Repository owner is required')
        .isString()
        .withMessage('Owner must be a string')
        .isLength({ min: 1, max: 39 })
        .withMessage('Owner must be between 1 and 39 characters')
        .matches(/^[a-zA-Z0-9\-]+$/)
        .withMessage('Invalid owner format'),

      param('repo')
        .notEmpty()
        .withMessage('Repository name is required')
        .isString()
        .withMessage('Repository name must be a string')
        .isLength({ min: 1, max: 100 })
        .withMessage('Repository name must be between 1 and 100 characters')
        .matches(/^[a-zA-Z0-9\-_.]+$/)
        .withMessage('Invalid repository name format'),

      this.handleValidationErrors
    ];
  }

  static validatePagination() {
    return [
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),

      query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be 0 or greater'),

      this.handleValidationErrors
    ];
  }

  static validateLogLevel() {
    return [
      query('level')
        .optional()
        .isIn(['error', 'warn', 'info', 'debug'])
        .withMessage('Invalid log level'),

      this.handleValidationErrors
    ];
  }

  private static handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];

      // Map common validation errors to specific error codes
      let errorCode = 'VALIDATION_ERROR';

      if (firstError.param === 'repositoryUrl') {
        errorCode = firstError.msg.includes('required')
          ? 'MISSING_REPOSITORY_URL'
          : 'INVALID_REPOSITORY_URL';
      } else if (firstError.param === 'jobId') {
        errorCode = 'INVALID_JOB_ID';
      } else if (firstError.param === 'accessToken') {
        errorCode = 'INVALID_TOKEN_FORMAT';
      } else if (firstError.msg.includes('Options')) {
        errorCode = 'INVALID_OPTIONS';
      } else if (firstError.msg.includes('JSON')) {
        errorCode = 'INVALID_JSON';
      }

      return res.status(400).json({
        error: firstError.msg,
        code: errorCode,
        field: firstError.param,
        value: firstError.value,
        details: process.env.NODE_ENV === 'development' ? errors.array() : undefined
      });
    }

    next();
  }

  // Custom validation for JSON parsing
  static validateJSON() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.headers['content-type']?.includes('application/json')) {
        const originalSend = res.json;

        try {
          if (req.body && typeof req.body === 'string') {
            req.body = JSON.parse(req.body);
          }
        } catch (error) {
          return res.status(400).json({
            error: 'Invalid JSON format',
            code: 'INVALID_JSON'
          });
        }
      }

      next();
    };
  }

  // Rate limiting validation
  static validateRateLimit() {
    return (req: Request, res: Response, next: NextFunction) => {
      const rateLimitInfo = req.rateLimit;

      if (rateLimitInfo && rateLimitInfo.remaining === 0) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(rateLimitInfo.resetTime / 1000),
          limit: rateLimitInfo.limit,
          remaining: rateLimitInfo.remaining
        });
      }

      next();
    };
  }
}