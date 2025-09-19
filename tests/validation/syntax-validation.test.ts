import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SyntaxValidator, ValidationResult } from '../../src/validation/syntax-validator';
import { PlaywrightConfigValidator } from '../../src/validation/config-validator';
import { LocatorStrategyValidator } from '../../src/validation/locator-validator';
import { ImportExportValidator } from '../../src/validation/import-export-validator';
import * as fs from 'fs-extra';
import * as path from 'path';

// Mock fs-extra
jest.mock('fs-extra');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Syntax Validation Test Suite', () => {
  let syntaxValidator: SyntaxValidator;
  let configValidator: PlaywrightConfigValidator;
  let locatorValidator: LocatorStrategyValidator;
  let importValidator: ImportExportValidator;

  beforeEach(() => {
    syntaxValidator = new SyntaxValidator();
    configValidator = new PlaywrightConfigValidator();
    locatorValidator = new LocatorStrategyValidator();
    importValidator = new ImportExportValidator();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic Syntax Validation for Converted Tests', () => {
    test('should validate syntactically correct Playwright test', async () => {
      const validTestContent = `
import { test, expect } from '@playwright/test';

test('example test', async ({ page }) => {
  await page.goto('https://example.com');
  await page.locator('[data-testid="button"]').click();
  await expect(page.locator('.result')).toBeVisible();
});
`;

      mockFs.readFile.mockResolvedValue(validTestContent);

      const result = await syntaxValidator.validateTestFile('/path/to/test.spec.ts');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should detect syntax errors in malformed test', async () => {
      const invalidTestContent = `
import { test, expect } from '@playwright/test';

test('malformed test', async ({ page }) => {
  await page.goto('https://example.com');
  await page.locator('[data-testid="button"]').click(;
  // Missing closing parenthesis
});
`;

      mockFs.readFile.mockResolvedValue(invalidTestContent);

      const result = await syntaxValidator.validateTestFile('/path/to/test.spec.ts');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('syntax_error');
    });

    test('should detect missing imports', async () => {
      const testWithMissingImports = `
test('test without imports', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('.result')).toBeVisible();
});
`;

      mockFs.readFile.mockResolvedValue(testWithMissingImports);

      const result = await syntaxValidator.validateTestFile('/path/to/test.spec.ts');

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.type === 'missing_import')).toBe(true);
    });

    test('should validate async/await patterns', async () => {
      const testWithoutAwait = `
import { test, expect } from '@playwright/test';

test('test without proper await', async ({ page }) => {
  page.goto('https://example.com'); // Missing await
  page.locator('[data-testid="button"]').click(); // Missing await
  expect(page.locator('.result')).toBeVisible(); // Missing await
});
`;

      mockFs.readFile.mockResolvedValue(testWithoutAwait);

      const result = await syntaxValidator.validateTestFile('/path/to/test.spec.ts');

      expect(result.warnings.some(w => w.type === 'missing_await')).toBe(true);
    });

    test('should detect conversion artifacts', async () => {
      const testWithCypressArtifacts = `
import { test, expect } from '@playwright/test';

test('test with cypress artifacts', async ({ page }) => {
  await page.goto('https://example.com');
  cy.get('[data-testid="button"]').click(); // Cypress command not converted
  await page.locator('.result').should('be.visible'); // Cypress assertion style
});
`;

      mockFs.readFile.mockResolvedValue(testWithCypressArtifacts);

      const result = await syntaxValidator.validateTestFile('/path/to/test.spec.ts');

      expect(result.errors.some(e => e.type === 'conversion_artifact')).toBe(true);
    });

    test('should validate TypeScript specific syntax', async () => {
      const tsTestContent = `
import { test, expect, Page } from '@playwright/test';

interface UserData {
  name: string;
  email: string;
}

test('typescript test', async ({ page }: { page: Page }) => {
  const userData: UserData = { name: 'John', email: 'john@example.com' };
  await page.goto('https://example.com');
  await page.locator('[data-testid="name"]').fill(userData.name);
});
`;

      mockFs.readFile.mockResolvedValue(tsTestContent);

      const result = await syntaxValidator.validateTestFile('/path/to/test.spec.ts');

      expect(result.isValid).toBe(true);
      expect(result.typeScriptFeatures).toContain('interfaces');
      expect(result.typeScriptFeatures).toContain('type_annotations');
    });
  });

  describe('Playwright Configuration Validation', () => {
    test('should validate correct playwright.config.ts', async () => {
      const validConfig = `
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
`;

      mockFs.readFile.mockResolvedValue(validConfig);

      const result = await configValidator.validateConfig('/path/to/playwright.config.ts');

      expect(result.isValid).toBe(true);
      expect(result.configType).toBe('typescript');
      expect(result.features).toContain('projects');
      expect(result.features).toContain('webServer');
    });

    test('should detect invalid configuration structure', async () => {
      const invalidConfig = `
export default {
  // Missing required fields
  projects: [
    {
      name: 'chromium',
      use: { browser: 'invalid-browser' }, // Invalid browser
    },
  ],
  invalidField: 'value', // Unknown field
};
`;

      mockFs.readFile.mockResolvedValue(invalidConfig);

      const result = await configValidator.validateConfig('/path/to/playwright.config.ts');

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.type === 'invalid_field')).toBe(true);
      expect(result.warnings.some(w => w.type === 'unknown_field')).toBe(true);
    });

    test('should validate browser configurations', async () => {
      const configWithMultipleBrowsers = `
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
});
`;

      mockFs.readFile.mockResolvedValue(configWithMultipleBrowsers);

      const result = await configValidator.validateConfig('/path/to/playwright.config.ts');

      expect(result.isValid).toBe(true);
      expect(result.browserSupport).toEqual(['chromium', 'firefox', 'webkit']);
      expect(result.mobileSupport).toBe(true);
    });

    test('should validate converted Cypress configuration mapping', async () => {
      const convertedConfig = `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Converted from cypress.config.js
  testDir: './cypress/e2e', // Mapped from Cypress e2e folder
  use: {
    baseURL: 'http://localhost:8080', // Mapped from Cypress baseUrl
    viewport: { width: 1280, height: 720 }, // Mapped from Cypress viewport
    actionTimeout: 30000, // Mapped from Cypress defaultCommandTimeout
  },
});
`;

      mockFs.readFile.mockResolvedValue(convertedConfig);

      const result = await configValidator.validateConfig('/path/to/playwright.config.ts');

      expect(result.isValid).toBe(true);
      expect(result.conversionComments).toBe(true);
      expect(result.cypressMappings).toContain('baseURL');
      expect(result.cypressMappings).toContain('viewport');
    });
  });

  describe('Locator Strategy Validation', () => {
    test('should validate modern Playwright locators', async () => {
      const testWithModernLocators = `
import { test, expect } from '@playwright/test';

test('modern locators', async ({ page }) => {
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByTestId('user-profile').click();
  await page.getByLabel('Email address').fill('test@example.com');
  await page.getByText('Welcome back!').isVisible();
  await page.getByPlaceholder('Enter your name').fill('John');
});
`;

      const result = await locatorValidator.validateLocators(testWithModernLocators);

      expect(result.isValid).toBe(true);
      expect(result.modernLocators).toContain('getByRole');
      expect(result.modernLocators).toContain('getByTestId');
      expect(result.modernLocators).toContain('getByLabel');
      expect(result.locatorScore).toBeGreaterThan(80); // High score for modern locators
    });

    test('should detect legacy CSS selectors', async () => {
      const testWithLegacySelectors = `
import { test, expect } from '@playwright/test';

test('legacy selectors', async ({ page }) => {
  await page.locator('#submit-button').click();
  await page.locator('.user-profile > .details').click();
  await page.locator('input[type="email"]').fill('test@example.com');
  await page.locator('body > div:nth-child(3) > span').isVisible();
});
`;

      const result = await locatorValidator.validateLocators(testWithLegacySelectors);

      expect(result.warnings.some(w => w.type === 'legacy_selector')).toBe(true);
      expect(result.suggestions).toContain('Use getByRole for semantic elements');
      expect(result.locatorScore).toBeLessThan(50); // Low score for legacy selectors
    });

    test('should detect potentially brittle selectors', async () => {
      const testWithBrittleSelectors = `
import { test, expect } from '@playwright/test';

test('brittle selectors', async ({ page }) => {
  await page.locator('div:nth-child(5) > span:nth-child(2)').click();
  await page.locator('.MuiButton-root-123').click(); // Auto-generated class
  await page.locator('xpath=//div[@class="complex-xpath"]//span[text()="Submit"]').click();
});
`;

      const result = await locatorValidator.validateLocators(testWithBrittleSelectors);

      expect(result.warnings.some(w => w.type === 'brittle_selector')).toBe(true);
      expect(result.brittleSelectors.length).toBeGreaterThan(0);
    });

    test('should validate data-testid usage patterns', async () => {
      const testWithTestIds = `
import { test, expect } from '@playwright/test';

test('test-id patterns', async ({ page }) => {
  await page.getByTestId('submit-btn').click(); // Good: semantic name
  await page.getByTestId('btn1').click(); // Warning: non-semantic name
  await page.locator('[data-testid="user-profile"]').click(); // Suggestion: use getByTestId
});
`;

      const result = await locatorValidator.validateLocators(testWithTestIds);

      expect(result.testIdUsage.good).toContain('submit-btn');
      expect(result.testIdUsage.needsImprovement).toContain('btn1');
      expect(result.suggestions).toContain('Use getByTestId instead of locator with data-testid');
    });
  });

  describe('Import/Export Statement Validation', () => {
    test('should validate correct Playwright imports', async () => {
      const testWithCorrectImports = `
import { test, expect, Page, BrowserContext } from '@playwright/test';
import { chromium, firefox, webkit } from 'playwright';
import type { PlaywrightTestConfig } from '@playwright/test';
`;

      const result = await importValidator.validateImports(testWithCorrectImports, '/path/to/test.spec.ts');

      expect(result.isValid).toBe(true);
      expect(result.playwrightImports).toContain('test');
      expect(result.playwrightImports).toContain('expect');
      expect(result.typeImports).toContain('PlaywrightTestConfig');
    });

    test('should detect missing essential imports', async () => {
      const testWithMissingImports = `
// Missing test and expect imports
import { Page } from '@playwright/test';

test('test without proper imports', async ({ page }) => {
  await expect(page.locator('.result')).toBeVisible();
});
`;

      const result = await importValidator.validateImports(testWithMissingImports, '/path/to/test.spec.ts');

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.type === 'missing_import')).toBe(true);
      expect(result.missingImports).toContain('test');
      expect(result.missingImports).toContain('expect');
    });

    test('should detect unused imports', async () => {
      const testWithUnusedImports = `
import { test, expect, Page, BrowserContext, chromium } from '@playwright/test';

test('simple test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('.result')).toBeVisible();
});
`;

      const result = await importValidator.validateImports(testWithUnusedImports, '/path/to/test.spec.ts');

      expect(result.warnings.some(w => w.type === 'unused_import')).toBe(true);
      expect(result.unusedImports).toContain('BrowserContext');
      expect(result.unusedImports).toContain('chromium');
    });

    test('should validate relative import paths', async () => {
      const testWithRelativeImports = `
import { test, expect } from '@playwright/test';
import { UserHelpers } from '../helpers/user-helpers';
import { PageObjects } from '../../page-objects/index';
import { TestData } from './test-data';
`;

      mockFs.pathExists.mockImplementation((filePath: string) => {
        return Promise.resolve(
          filePath.includes('helpers/user-helpers') ||
          filePath.includes('page-objects/index') ||
          filePath.includes('test-data')
        );
      });

      const result = await importValidator.validateImports(testWithRelativeImports, '/path/to/tests/test.spec.ts');

      expect(result.isValid).toBe(true);
      expect(result.relativeImports.length).toBe(3);
    });

    test('should detect invalid import paths', async () => {
      const testWithInvalidImports = `
import { test, expect } from '@playwright/test';
import { NonExistentHelper } from '../helpers/non-existent';
import { MissingModule } from './missing-module';
`;

      mockFs.pathExists.mockResolvedValue(false);

      const result = await importValidator.validateImports(testWithInvalidImports, '/path/to/tests/test.spec.ts');

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.type === 'invalid_import_path')).toBe(true);
    });

    test('should validate export statements in support files', async () => {
      const supportFileContent = `
export class PageHelpers {
  static async loginUser(page: Page, email: string, password: string) {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Login' }).click();
  }
}

export const TEST_DATA = {
  validEmail: 'test@example.com',
  validPassword: 'password123'
};

export default PageHelpers;
`;

      const result = await importValidator.validateExports(supportFileContent, '/path/to/helpers.ts');

      expect(result.isValid).toBe(true);
      expect(result.namedExports).toContain('PageHelpers');
      expect(result.namedExports).toContain('TEST_DATA');
      expect(result.hasDefaultExport).toBe(true);
    });
  });

  describe('Batch Validation', () => {
    test('should validate entire project directory', async () => {
      const projectStructure = [
        'tests/example.spec.ts',
        'tests/user-flow.spec.ts',
        'tests/helpers/page-helpers.ts',
        'playwright.config.ts'
      ];

      mockFs.readdir.mockImplementation((dirPath: string) => {
        if (dirPath.includes('tests')) {
          return Promise.resolve(['example.spec.ts', 'user-flow.spec.ts', 'helpers'] as any);
        }
        if (dirPath.includes('helpers')) {
          return Promise.resolve(['page-helpers.ts'] as any);
        }
        return Promise.resolve([]);
      });

      mockFs.stat.mockImplementation((filePath: string) => {
        return Promise.resolve({
          isDirectory: () => filePath.includes('helpers'),
          isFile: () => !filePath.includes('helpers')
        } as any);
      });

      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('example.spec.ts')) {
          return Promise.resolve(`
import { test, expect } from '@playwright/test';
test('example', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('.title')).toBeVisible();
});
`);
        }
        return Promise.resolve('// Mock file content');
      });

      const result = await syntaxValidator.validateProject('/path/to/project');

      expect(result.totalFiles).toBe(4);
      expect(result.validFiles).toBeGreaterThan(0);
      expect(result.overallScore).toBeGreaterThan(0);
    });

    test('should provide detailed validation summary', async () => {
      const validationResults = {
        syntaxValidation: { valid: 8, invalid: 2, warnings: 3 },
        configValidation: { valid: 1, invalid: 0, warnings: 1 },
        locatorValidation: { good: 15, needsImprovement: 5, brittle: 2 },
        importValidation: { valid: 10, invalid: 1, warnings: 2 }
      };

      const summary = syntaxValidator.generateValidationSummary(validationResults);

      expect(summary.overallScore).toBeDefined();
      expect(summary.recommendations).toBeInstanceOf(Array);
      expect(summary.summary.totalFiles).toBe(10);
      expect(summary.summary.passRate).toBeGreaterThan(0);
    });
  });
});