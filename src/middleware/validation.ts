import { Logger } from '../utils/logger';

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'email' | 'url';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  allowedValues?: any[];
  customValidator?: (value: any, data: any) => boolean | string;
}

export interface ValidationSchema {
  [key: string]: ValidationRule | ValidationRule[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  sanitizedData?: any;
}

export class Validator {
  private logger = new Logger('Validator');

  validate(data: any, schema: ValidationSchema): ValidationResult {
    const errors: ValidationError[] = [];
    const sanitizedData: any = {};

    for (const [fieldPath, rules] of Object.entries(schema)) {
      const fieldValue = this.getNestedValue(data, fieldPath);
      const fieldRules = Array.isArray(rules) ? rules : [rules];

      for (const rule of fieldRules) {
        const fieldErrors = this.validateField(fieldPath, fieldValue, rule, data);
        errors.push(...fieldErrors);

        // Sanitize the data if validation passes
        if (fieldErrors.length === 0) {
          this.setNestedValue(sanitizedData, fieldPath, this.sanitizeValue(fieldValue, rule));
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: errors.length === 0 ? sanitizedData : undefined
    };
  }

  private validateField(fieldPath: string, value: any, rule: ValidationRule, data: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required check
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: fieldPath,
        message: `${rule.field} is required`,
        value
      });
      return errors; // No point in further validation if required field is missing
    }

    // Skip further validation if field is not required and empty
    if (!rule.required && (value === undefined || value === null || value === '')) {
      return errors;
    }

    // Type validation
    if (rule.type) {
      const typeError = this.validateType(fieldPath, value, rule.type);
      if (typeError) {
        errors.push(typeError);
        return errors; // No point in further validation if type is wrong
      }
    }

    // Length validation for strings
    if (typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        errors.push({
          field: fieldPath,
          message: `${rule.field} must be at least ${rule.minLength} characters long`,
          value
        });
      }

      if (rule.maxLength && value.length > rule.maxLength) {
        errors.push({
          field: fieldPath,
          message: `${rule.field} must be no more than ${rule.maxLength} characters long`,
          value
        });
      }
    }

    // Numeric range validation
    if (typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        errors.push({
          field: fieldPath,
          message: `${rule.field} must be at least ${rule.min}`,
          value
        });
      }

      if (rule.max !== undefined && value > rule.max) {
        errors.push({
          field: fieldPath,
          message: `${rule.field} must be no more than ${rule.max}`,
          value
        });
      }
    }

    // Pattern validation
    if (rule.pattern && typeof value === 'string') {
      if (!rule.pattern.test(value)) {
        errors.push({
          field: fieldPath,
          message: `${rule.field} has invalid format`,
          value
        });
      }
    }

    // Allowed values validation
    if (rule.allowedValues && !rule.allowedValues.includes(value)) {
      errors.push({
        field: fieldPath,
        message: `${rule.field} must be one of: ${rule.allowedValues.join(', ')}`,
        value
      });
    }

    // Custom validation
    if (rule.customValidator) {
      const customResult = rule.customValidator(value, data);
      if (customResult !== true) {
        errors.push({
          field: fieldPath,
          message: typeof customResult === 'string' ? customResult : `${rule.field} is invalid`,
          value
        });
      }
    }

    return errors;
  }

  private validateType(fieldPath: string, value: any, expectedType: string): ValidationError | null {
    let actualType = typeof value;

    // Special handling for arrays
    if (expectedType === 'array' && Array.isArray(value)) {
      return null;
    }

    // Special handling for email
    if (expectedType === 'email' && typeof value === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return {
          field: fieldPath,
          message: `Invalid email format`,
          value
        };
      }
      return null;
    }

    // Special handling for URL
    if (expectedType === 'url' && typeof value === 'string') {
      try {
        new URL(value);
        return null;
      } catch {
        return {
          field: fieldPath,
          message: `Invalid URL format`,
          value
        };
      }
    }

    // Handle null as object
    if (expectedType === 'object' && value === null) {
      actualType = 'object';
    }

    if (actualType !== expectedType) {
      return {
        field: fieldPath,
        message: `Expected ${expectedType} but got ${actualType}`,
        value
      };
    }

    return null;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  private sanitizeValue(value: any, rule: ValidationRule): any {
    if (typeof value === 'string') {
      // Basic sanitization - trim whitespace
      value = value.trim();

      // Convert to proper type if needed
      if (rule.type === 'number') {
        const num = Number(value);
        return isNaN(num) ? value : num;
      }

      if (rule.type === 'boolean') {
        return value.toLowerCase() === 'true' || value === '1';
      }
    }

    return value;
  }
}

export class ValidationMiddleware {
  private validator = new Validator();
  private logger = new Logger('ValidationMiddleware');

  // Validate request body
  validateBody(schema: ValidationSchema) {
    return (req: any, res: any, next: any) => {
      const result = this.validator.validate(req.body, schema);

      if (!result.isValid) {
        this.logger.warn('Request body validation failed', {
          errors: result.errors,
          body: req.body
        });

        return res.status(400).json({
          error: 'Validation Error',
          message: 'Request body contains invalid data',
          details: result.errors
        });
      }

      // Replace body with sanitized data
      req.body = result.sanitizedData;
      next();
    };
  }

  // Validate query parameters
  validateQuery(schema: ValidationSchema) {
    return (req: any, res: any, next: any) => {
      const result = this.validator.validate(req.query, schema);

      if (!result.isValid) {
        this.logger.warn('Query parameters validation failed', {
          errors: result.errors,
          query: req.query
        });

        return res.status(400).json({
          error: 'Validation Error',
          message: 'Query parameters contain invalid data',
          details: result.errors
        });
      }

      // Replace query with sanitized data
      req.query = result.sanitizedData;
      next();
    };
  }

  // Validate path parameters
  validateParams(schema: ValidationSchema) {
    return (req: any, res: any, next: any) => {
      const result = this.validator.validate(req.params, schema);

      if (!result.isValid) {
        this.logger.warn('Path parameters validation failed', {
          errors: result.errors,
          params: req.params
        });

        return res.status(400).json({
          error: 'Validation Error',
          message: 'Path parameters contain invalid data',
          details: result.errors
        });
      }

      // Replace params with sanitized data
      req.params = result.sanitizedData;
      next();
    };
  }

  // Validate headers
  validateHeaders(schema: ValidationSchema) {
    return (req: any, res: any, next: any) => {
      const result = this.validator.validate(req.headers, schema);

      if (!result.isValid) {
        this.logger.warn('Headers validation failed', {
          errors: result.errors,
          headers: req.headers
        });

        return res.status(400).json({
          error: 'Validation Error',
          message: 'Request headers contain invalid data',
          details: result.errors
        });
      }

      next();
    };
  }

  // Generic validation function
  validate(data: any, schema: ValidationSchema): ValidationResult {
    return this.validator.validate(data, schema);
  }
}

// Pre-defined validation schemas for common use cases

export const ConversionRequestSchema: ValidationSchema = {
  repositoryUrl: {
    field: 'Repository URL',
    required: true,
    type: 'url'
  },
  'options.outputDirectory': {
    field: 'Output Directory',
    required: false,
    type: 'string',
    minLength: 1,
    maxLength: 255
  },
  'options.preserveComments': {
    field: 'Preserve Comments',
    required: false,
    type: 'boolean'
  },
  'options.generatePageObjects': {
    field: 'Generate Page Objects',
    required: false,
    type: 'boolean'
  },
  'options.includeCI': {
    field: 'Include CI',
    required: false,
    type: 'boolean'
  },
  'options.targetFramework': {
    field: 'Target Framework',
    required: false,
    type: 'string',
    allowedValues: ['playwright', 'playwright-test']
  }
};

export const RepositoryAnalysisSchema: ValidationSchema = {
  repositoryPath: {
    field: 'Repository Path',
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 500
  }
};

export const ConversionStatusSchema: ValidationSchema = {
  conversionId: {
    field: 'Conversion ID',
    required: true,
    type: 'string',
    pattern: /^conv_\d+_[a-z0-9]+$/
  }
};

export const GitHubRepositorySchema: ValidationSchema = {
  owner: {
    field: 'Repository Owner',
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 100,
    pattern: /^[a-zA-Z0-9\-_.]+$/
  },
  repo: {
    field: 'Repository Name',
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 100,
    pattern: /^[a-zA-Z0-9\-_.]+$/
  },
  branch: {
    field: 'Branch Name',
    required: false,
    type: 'string',
    minLength: 1,
    maxLength: 100
  }
};

export const PaginationSchema: ValidationSchema = {
  page: {
    field: 'Page Number',
    required: false,
    type: 'number',
    min: 1,
    max: 1000
  },
  limit: {
    field: 'Page Limit',
    required: false,
    type: 'number',
    min: 1,
    max: 100
  },
  sort: {
    field: 'Sort Field',
    required: false,
    type: 'string',
    allowedValues: ['created', 'updated', 'name', 'status']
  },
  order: {
    field: 'Sort Order',
    required: false,
    type: 'string',
    allowedValues: ['asc', 'desc']
  }
};

// Factory function for creating validation middleware
export function createValidationMiddleware(): ValidationMiddleware {
  return new ValidationMiddleware();
}

// Helper functions for common validations
export function validateGitHubUrl(url: string): boolean {
  const githubUrlPattern = /^https:\/\/github\.com\/[a-zA-Z0-9\-_.]+\/[a-zA-Z0-9\-_.]+(?:\.git)?$/;
  return githubUrlPattern.test(url);
}

export function validateConversionId(id: string): boolean {
  const conversionIdPattern = /^conv_\d+_[a-z0-9]+$/;
  return conversionIdPattern.test(id);
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9\-_.]/g, '_');
}

export function sanitizeDirectoryName(dirName: string): string {
  return dirName.replace(/[^a-zA-Z0-9\-_./]/g, '_');
}

// Custom validators for specific use cases
export const CustomValidators = {
  isValidGitHubUrl: (value: string) => {
    return validateGitHubUrl(value) || 'Must be a valid GitHub repository URL';
  },

  isValidConversionId: (value: string) => {
    return validateConversionId(value) || 'Must be a valid conversion ID';
  },

  isValidFilePath: (value: string) => {
    const invalidChars = /[<>:"|?*]/;
    return !invalidChars.test(value) || 'File path contains invalid characters';
  },

  isValidProjectName: (value: string) => {
    const validPattern = /^[a-zA-Z0-9\-_]+$/;
    return validPattern.test(value) || 'Project name can only contain letters, numbers, hyphens, and underscores';
  }
};

// Export a default instance for convenience
export const validationMiddleware = new ValidationMiddleware();