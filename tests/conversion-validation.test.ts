import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ConversionValidator } from '../src/services/conversion-validator';

// Mock child_process for TypeScript compilation
jest.mock('child_process', () => ({
  exec: jest.fn(),
  spawn: jest.fn()
}));

// Mock file system operations
jest.mock('fs-extra', () => ({
  readdir: jest.fn(),
  stat: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  pathExists: jest.fn(),
  ensureDir: jest.fn()
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExec = require('child_process').exec as jest.MockedFunction<typeof require('child_process').exec>;

describe('ConversionValidator', () => {
  let validator: ConversionValidator;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    validator = new ConversionValidator();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateSyntax', () => {
    test('should validate syntactically correct TypeScript files', async () => {
      const validCode = `
        import { test, expect } from '@playwright/test';

        test('valid test', async ({ page }) => {
          await page.goto('/');
          await expect(page).toHaveTitle('Home');
        });
      `;

      mockFs.readFile.mockResolvedValue(validCode);
      mockFs.pathExists.mockResolvedValue(true);

      const result = await validator.validateSyntax('/test/valid.spec.ts');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should detect syntax errors in TypeScript files', async () => {
      const invalidCode = `
        import { test, expect } from '@playwright/test';

        test('invalid test', async ({ page }) => {
          await page.goto('/');
          await expect(page).toHaveTitle('Home'
          // Missing closing parenthesis and semicolon
        });
      `;

      mockFs.readFile.mockResolvedValue(invalidCode);
      mockFs.pathExists.mockResolvedValue(true);

      const result = await validator.validateSyntax('/test/invalid.spec.ts');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('syntax error');
    });

    test('should detect missing imports', async () => {
      const codeWithMissingImports = `
        test('test without imports', async ({ page }) => {
          await page.goto('/');
          await expect(page).toHaveTitle('Home');
        });
      `;

      mockFs.readFile.mockResolvedValue(codeWithMissingImports);
      mockFs.pathExists.mockResolvedValue(true);

      const result = await validator.validateSyntax('/test/missing-imports.spec.ts');

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('test'))).toBe(true);
    });

    test('should validate import resolution', async () => {
      const codeWithImports = `
        import { test, expect } from '@playwright/test';
        import { LoginPage } from '../pages/login-page';
        import { DatabaseHelper } from '../utils/database-helper';

        test('test with imports', async ({ page }) => {
          const loginPage = new LoginPage(page);
          await loginPage.navigate();
        });
      `;

      mockFs.readFile.mockResolvedValue(codeWithImports);
      mockFs.pathExists.mockImplementation(async (filePath: string) => {
        return filePath.includes('login-page') || filePath.includes('database-helper') || filePath.includes('.spec.ts');
      });

      const result = await validator.validateSyntax('/test/with-imports.spec.ts');

      expect(result.isValid).toBe(true);
      expect(result.importValidation).toBeDefined();
      expect(result.importValidation!.resolvedImports).toContain('../pages/login-page');
    });

    test('should handle non-existent files', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      const result = await validator.validateSyntax('/test/nonexistent.spec.ts');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File does not exist: /test/nonexistent.spec.ts');
    });
  });

  describe('validateCompilation', () => {
    test('should validate TypeScript compilation successfully', async () => {
      mockExec.mockImplementation((command, callback) => {
        // Simulate successful TypeScript compilation
        callback!(null, 'Compilation successful', '');
      });

      const result = await validator.validateCompilation(testProjectPath);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should detect TypeScript compilation errors', async () => {
      const compilationErrors = `
        src/test.spec.ts(5,10): error TS2304: Cannot find name 'invalidFunction'.
        src/test.spec.ts(8,15): error TS2339: Property 'nonExistentMethod' does not exist on type 'Page'.
      `;

      mockExec.mockImplementation((command, callback) => {
        callback!(new Error('Compilation failed'), '', compilationErrors);
      });

      const result = await validator.validateCompilation(testProjectPath);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('TS2304'))).toBe(true);
      expect(result.errors.some(error => error.includes('TS2339'))).toBe(true);
    });

    test('should handle TypeScript compilation warnings', async () => {
      const compilationOutput = `
        src/test.spec.ts(3,10): warning TS6133: 'unused' is declared but its value is never read.
      `;

      mockExec.mockImplementation((command, callback) => {
        callback!(null, 'Compilation completed with warnings', compilationOutput);
      });

      const result = await validator.validateCompilation(testProjectPath);

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('TS6133');
    });
  });

  describe('validateBasicTestExecution', () => {
    test('should validate basic test execution without running full tests', async () => {
      const mockTestCode = `
        import { test, expect } from '@playwright/test';

        test('basic test', async ({ page }) => {
          await page.goto('about:blank');
          expect(page).toBeDefined();
        });
      `;

      mockFs.readFile.mockResolvedValue(mockTestCode);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.writeFile.mockResolvedValue();
      mockFs.ensureDir.mockResolvedValue();

      mockExec.mockImplementation((command, callback) => {
        if (command.includes('playwright test')) {
          // Simulate successful test execution
          callback!(null, 'Test execution completed successfully', '');
        } else {
          callback!(null, '', '');
        }
      });

      const result = await validator.validateBasicTestExecution(['/test/basic.spec.ts']);

      expect(result.canExecute).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect test execution failures', async () => {
      const mockTestCode = `
        import { test, expect } from '@playwright/test';

        test('failing test', async ({ page }) => {
          await page.goto('invalid://url');
        });
      `;

      mockFs.readFile.mockResolvedValue(mockTestCode);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.writeFile.mockResolvedValue();
      mockFs.ensureDir.mockResolvedValue();

      mockExec.mockImplementation((command, callback) => {
        if (command.includes('playwright test')) {
          callback!(new Error('Test execution failed'), '', 'Navigation timeout exceeded');
        } else {
          callback!(null, '', '');
        }
      });

      const result = await validator.validateBasicTestExecution(['/test/failing.spec.ts']);

      expect(result.canExecute).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('calculateConversionQuality', () => {
    test('should calculate conversion rate and quality metrics', async () => {
      const validationResults = [
        { filePath: '/test/file1.spec.ts', isValid: true, errors: [], warnings: [] },
        { filePath: '/test/file2.spec.ts', isValid: true, errors: [], warnings: ['minor warning'] },
        { filePath: '/test/file3.spec.ts', isValid: false, errors: ['syntax error'], warnings: [] },
        { filePath: '/test/file4.spec.ts', isValid: true, errors: [], warnings: [] }
      ];

      const metrics = await validator.calculateConversionQuality(validationResults);

      expect(metrics.totalFiles).toBe(4);
      expect(metrics.successfullyValidated).toBe(3);
      expect(metrics.conversionRate).toBe(0.75); // 3/4 = 75%
      expect(metrics.errorRate).toBe(0.25);
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.totalWarnings).toBe(1);
    });

    test('should provide detailed error categorization', async () => {
      const validationResults = [
        {
          filePath: '/test/syntax.spec.ts',
          isValid: false,
          errors: ['Syntax error: Missing semicolon'],
          warnings: []
        },
        {
          filePath: '/test/import.spec.ts',
          isValid: false,
          errors: ['Import error: Cannot resolve module'],
          warnings: []
        },
        {
          filePath: '/test/type.spec.ts',
          isValid: false,
          errors: ['Type error: Property does not exist'],
          warnings: []
        }
      ];

      const metrics = await validator.calculateConversionQuality(validationResults);

      expect(metrics.errorCategories).toBeDefined();
      expect(metrics.errorCategories['syntax']).toBe(1);
      expect(metrics.errorCategories['import']).toBe(1);
      expect(metrics.errorCategories['type']).toBe(1);
    });

    test('should meet 85% success rate threshold for quality validation', async () => {
      // Create a scenario with >85% success rate
      const highQualityResults = Array.from({ length: 100 }, (_, i) => ({
        filePath: `/test/file${i}.spec.ts`,
        isValid: i < 90, // 90% success rate
        errors: i >= 90 ? ['conversion error'] : [],
        warnings: []
      }));

      const metrics = await validator.calculateConversionQuality(highQualityResults);

      expect(metrics.conversionRate).toBeGreaterThan(0.85);
      expect(metrics.meetsQualityThreshold).toBe(true);

      // Create a scenario with <85% success rate
      const lowQualityResults = Array.from({ length: 100 }, (_, i) => ({
        filePath: `/test/file${i}.spec.ts`,
        isValid: i < 80, // 80% success rate
        errors: i >= 80 ? ['conversion error'] : [],
        warnings: []
      }));

      const lowMetrics = await validator.calculateConversionQuality(lowQualityResults);

      expect(lowMetrics.conversionRate).toBeLessThan(0.85);
      expect(lowMetrics.meetsQualityThreshold).toBe(false);
    });
  });

  describe('validateConvertedProject', () => {
    test('should perform comprehensive validation of entire converted project', async () => {
      const testFiles = [
        '/project/tests/login.spec.ts',
        '/project/tests/dashboard.spec.ts',
        '/project/tests/settings.spec.ts'
      ];

      mockFs.readdir.mockResolvedValue(['login.spec.ts', 'dashboard.spec.ts', 'settings.spec.ts']);
      mockFs.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => false } as any);
      mockFs.pathExists.mockResolvedValue(true);

      // Mock successful validation for all files
      mockFs.readFile.mockResolvedValue(`
        import { test, expect } from '@playwright/test';
        test('valid test', async ({ page }) => {
          await page.goto('/');
        });
      `);

      mockExec.mockImplementation((command, callback) => {
        callback!(null, 'Success', '');
      });

      const result = await validator.validateConvertedProject(testProjectPath);

      expect(result.overallSuccess).toBe(true);
      expect(result.qualityMetrics.conversionRate).toBeGreaterThan(0.85);
      expect(result.validationSummary.syntaxValidation.passed).toBe(3);
      expect(result.validationSummary.compilationValidation.success).toBe(true);
    });

    test('should provide detailed failure analysis for failed validation', async () => {
      const testFiles = ['/project/tests/broken.spec.ts'];

      mockFs.readdir.mockResolvedValue(['broken.spec.ts']);
      mockFs.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => false } as any);
      mockFs.pathExists.mockResolvedValue(true);

      mockFs.readFile.mockResolvedValue(`
        import { test, expect } from '@playwright/test';
        test('broken test', async ({ page }) => {
          await page.goto('/');
          invalid syntax here
        });
      `);

      mockExec.mockImplementation((command, callback) => {
        callback!(new Error('Compilation failed'), '', 'TypeScript compilation errors');
      });

      const result = await validator.validateConvertedProject(testProjectPath);

      expect(result.overallSuccess).toBe(false);
      expect(result.qualityMetrics.conversionRate).toBeLessThan(0.85);
      expect(result.validationSummary.syntaxValidation.failed).toBe(1);
      expect(result.validationSummary.compilationValidation.success).toBe(false);
    });
  });

  describe('generateValidationReport', () => {
    test('should generate comprehensive validation report', async () => {
      const validationResult = {
        overallSuccess: true,
        qualityMetrics: {
          totalFiles: 10,
          successfullyValidated: 9,
          conversionRate: 0.9,
          errorRate: 0.1,
          totalErrors: 1,
          totalWarnings: 2,
          meetsQualityThreshold: true,
          errorCategories: { syntax: 1 }
        },
        validationSummary: {
          syntaxValidation: { passed: 9, failed: 1, warnings: 2 },
          compilationValidation: { success: true, errors: [], warnings: [] },
          executionValidation: { canExecute: true, errors: [] }
        },
        fileValidationResults: [],
        performanceMetrics: { validationTime: 1500, filesPerSecond: 6.67 }
      };

      mockFs.writeFile.mockResolvedValue();
      mockFs.ensureDir.mockResolvedValue();

      await validator.generateValidationReport(validationResult, '/output/validation-report.json');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/output/validation-report.json',
        expect.stringContaining('"overallSuccess": true')
      );
    });
  });

  describe('performance validation', () => {
    test('should validate large projects within performance criteria', async () => {
      const manyFiles = Array.from({ length: 100 }, (_, i) => `/test/file${i}.spec.ts`);

      mockFs.readdir.mockResolvedValue(manyFiles.map(f => path.basename(f)));
      mockFs.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => false } as any);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue('import { test } from "@playwright/test";');

      mockExec.mockImplementation((command, callback) => {
        // Simulate quick responses
        setTimeout(() => callback!(null, 'Success', ''), 10);
      });

      const startTime = Date.now();
      const result = await validator.validateConvertedProject('/test/large-project');
      const duration = Date.now() - startTime;

      expect(result.performanceMetrics.validationTime).toBeLessThan(10000); // Under 10 seconds
      expect(result.performanceMetrics.filesPerSecond).toBeGreaterThan(10); // At least 10 files/sec
    });
  });
});