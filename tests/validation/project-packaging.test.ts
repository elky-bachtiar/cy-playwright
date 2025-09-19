import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ProjectPackagingValidator } from '../../src/validation/project-packaging-validator';
import { TemplateGenerator } from '../../src/services/template-generator';
import { DependencyManager } from '../../src/services/dependency-manager';
import { ConfigurationMigrator } from '../../src/services/configuration-migrator';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('ProjectPackagingValidator', () => {
  let validator: ProjectPackagingValidator;
  let tempDir: string;
  let testProjectDir: string;

  beforeEach(async () => {
    validator = new ProjectPackagingValidator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-packaging-test-'));
    testProjectDir = path.join(tempDir, 'test-project');
    await fs.ensureDir(testProjectDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('packageProject', () => {
    it('should create a complete Playwright project structure', async () => {
      // Setup basic Cypress project
      await createBasicCypressProject(testProjectDir);

      const result = await validator.packageProject(testProjectDir, {
        outputPath: path.join(tempDir, 'packaged-project'),
        includeSourceTests: true,
        generateDocumentation: true,
        createGitIgnore: true
      });

      expect(result.success).toBe(true);
      expect(result.outputPath).toBeTruthy();

      // Verify essential files are created
      const outputDir = result.outputPath!;
      expect(await fs.pathExists(path.join(outputDir, 'package.json'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'playwright.config.ts'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'tests'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, '.gitignore'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'README.md'))).toBe(true);
    });

    it('should handle packaging errors gracefully', async () => {
      // Create invalid project structure
      await fs.writeFile(path.join(testProjectDir, 'invalid.json'), '{ invalid json');

      const result = await validator.packageProject(testProjectDir, {
        outputPath: path.join(tempDir, 'packaged-project'),
        includeSourceTests: false,
        generateDocumentation: false,
        createGitIgnore: false
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('packaging failed');
    });

    it('should respect packaging options', async () => {
      await createBasicCypressProject(testProjectDir);

      const result = await validator.packageProject(testProjectDir, {
        outputPath: path.join(tempDir, 'minimal-project'),
        includeSourceTests: false,
        generateDocumentation: false,
        createGitIgnore: false
      });

      expect(result.success).toBe(true);

      const outputDir = result.outputPath!;
      expect(await fs.pathExists(path.join(outputDir, 'README.md'))).toBe(false);
      expect(await fs.pathExists(path.join(outputDir, '.gitignore'))).toBe(false);
      expect(await fs.pathExists(path.join(outputDir, 'cypress'))).toBe(false);
    });
  });

  describe('validateProjectStructure', () => {
    it('should validate complete project structure', async () => {
      await createCompletePlaywrightProject(testProjectDir);

      const result = await validator.validateProjectStructure(testProjectDir);

      expect(result.isValid).toBe(true);
      expect(result.requiredFiles.every(f => f.exists)).toBe(true);
      expect(result.optionalFiles.some(f => f.exists)).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should identify missing required files', async () => {
      // Create incomplete project
      await fs.writeFile(path.join(testProjectDir, 'package.json'), '{}');

      const result = await validator.validateProjectStructure(testProjectDir);

      expect(result.isValid).toBe(false);
      expect(result.requiredFiles.some(f => !f.exists)).toBe(true);
      expect(result.issues.some(issue => issue.includes('playwright.config'))).toBe(true);
    });

    it('should detect invalid file contents', async () => {
      await fs.writeFile(path.join(testProjectDir, 'package.json'), '{ invalid json }');
      await fs.writeFile(path.join(testProjectDir, 'playwright.config.ts'), 'invalid typescript');

      const result = await validator.validateProjectStructure(testProjectDir);

      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('package.json'))).toBe(true);
      expect(result.issues.some(issue => issue.includes('playwright.config'))).toBe(true);
    });
  });

  describe('generateProjectTemplate', () => {
    it('should generate complete project template', async () => {
      const result = await validator.generateProjectTemplate(testProjectDir, {
        projectName: 'test-project',
        includeExamples: true,
        browserTargets: ['chromium', 'firefox', 'webkit'],
        testDirectory: 'tests',
        useTypeScript: true
      });

      expect(result.success).toBe(true);
      expect(result.generatedFiles).toContain('package.json');
      expect(result.generatedFiles).toContain('playwright.config.ts');
      expect(result.generatedFiles).toContain('tests/example.spec.ts');

      // Verify package.json content
      const packageJson = await fs.readJson(path.join(testProjectDir, 'package.json'));
      expect(packageJson.name).toBe('test-project');
      expect(packageJson.devDependencies).toHaveProperty('@playwright/test');
    });

    it('should generate JavaScript template when TypeScript is disabled', async () => {
      const result = await validator.generateProjectTemplate(testProjectDir, {
        projectName: 'js-project',
        includeExamples: false,
        browserTargets: ['chromium'],
        testDirectory: 'e2e',
        useTypeScript: false
      });

      expect(result.success).toBe(true);
      expect(result.generatedFiles).toContain('playwright.config.js');
      expect(result.generatedFiles).not.toContain('playwright.config.ts');
    });

    it('should handle template generation errors', async () => {
      // Create read-only directory to trigger permission error
      await fs.chmod(testProjectDir, 0o444);

      const result = await validator.generateProjectTemplate(testProjectDir, {
        projectName: 'test-project',
        includeExamples: true,
        browserTargets: ['chromium'],
        testDirectory: 'tests',
        useTypeScript: true
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);

      // Restore permissions for cleanup
      await fs.chmod(testProjectDir, 0o755);
    });
  });

  describe('validateDependencies', () => {
    it('should validate Playwright dependencies', async () => {
      await createPackageJsonWithDependencies(testProjectDir, {
        '@playwright/test': '^1.40.0',
        'playwright': '^1.40.0'
      });

      const result = await validator.validateDependencies(testProjectDir);

      expect(result.allInstalled).toBe(true);
      expect(result.missingDependencies).toHaveLength(0);
      expect(result.versionConflicts).toHaveLength(0);
    });

    it('should detect missing dependencies', async () => {
      await createPackageJsonWithDependencies(testProjectDir, {
        'lodash': '^4.17.21'
      });

      const result = await validator.validateDependencies(testProjectDir);

      expect(result.allInstalled).toBe(false);
      expect(result.missingDependencies).toContain('@playwright/test');
      expect(result.recommendations).toContain('npm install -D @playwright/test');
    });

    it('should detect version conflicts', async () => {
      await createPackageJsonWithDependencies(testProjectDir, {
        '@playwright/test': '^1.30.0',
        'playwright': '^1.40.0'
      });

      const result = await validator.validateDependencies(testProjectDir);

      expect(result.versionConflicts).toHaveLength(1);
      expect(result.versionConflicts[0]).toContain('version mismatch');
    });
  });

  describe('generateConfiguration', () => {
    it('should generate basic Playwright configuration', async () => {
      const result = await validator.generateConfiguration(testProjectDir, {
        browsers: ['chromium', 'firefox'],
        testDir: 'tests',
        baseURL: 'http://localhost:3000',
        headless: true,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
      });

      expect(result.success).toBe(true);
      expect(result.configPath).toBeTruthy();

      const configContent = await fs.readFile(result.configPath!, 'utf8');
      expect(configContent).toContain('chromium');
      expect(configContent).toContain('firefox');
      expect(configContent).toContain('http://localhost:3000');
    });

    it('should generate configuration from Cypress config', async () => {
      await createCypressConfig(testProjectDir);

      const result = await validator.generateConfiguration(testProjectDir, {
        migrateCypressConfig: true,
        browsers: ['chromium'],
        testDir: 'tests',
        headless: true
      });

      expect(result.success).toBe(true);
      expect(result.configPath).toBeTruthy();
      expect(result.migratedSettings).toContain('baseUrl');
    });

    it('should handle configuration generation errors', async () => {
      // Create read-only directory
      await fs.chmod(testProjectDir, 0o444);

      const result = await validator.generateConfiguration(testProjectDir, {
        browsers: ['chromium'],
        testDir: 'tests',
        headless: true
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);

      // Restore permissions
      await fs.chmod(testProjectDir, 0o755);
    });
  });

  describe('validateTestFiles', () => {
    it('should validate converted test files', async () => {
      await createValidPlaywrightTests(testProjectDir);

      const result = await validator.validateTestFiles(testProjectDir);

      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.validFiles).toBe(result.totalFiles);
      expect(result.invalidFiles).toBe(0);
      expect(result.conversionIssues).toHaveLength(0);
    });

    it('should detect test file issues', async () => {
      await createInvalidPlaywrightTests(testProjectDir);

      const result = await validator.validateTestFiles(testProjectDir);

      expect(result.invalidFiles).toBeGreaterThan(0);
      expect(result.conversionIssues.length).toBeGreaterThan(0);
      expect(result.conversionIssues.some(issue => issue.severity === 'error')).toBe(true);
    });

    it('should handle empty test directory', async () => {
      await fs.ensureDir(path.join(testProjectDir, 'tests'));

      const result = await validator.validateTestFiles(testProjectDir);

      expect(result.totalFiles).toBe(0);
      expect(result.validFiles).toBe(0);
      expect(result.recommendations).toContain('No test files found');
    });
  });

  describe('createDeploymentPackage', () => {
    it('should create deployment-ready package', async () => {
      await createCompletePlaywrightProject(testProjectDir);

      const result = await validator.createDeploymentPackage(testProjectDir, {
        outputPath: path.join(tempDir, 'deployment.zip'),
        includeReports: true,
        includeDocumentation: true,
        excludeDependencies: false
      });

      expect(result.success).toBe(true);
      expect(result.packagePath).toBeTruthy();
      expect(await fs.pathExists(result.packagePath!)).toBe(true);
      expect(result.includedFiles).toContain('package.json');
      expect(result.includedFiles).toContain('playwright.config.ts');
    });

    it('should exclude specified files and directories', async () => {
      await createCompletePlaywrightProject(testProjectDir);
      await fs.ensureDir(path.join(testProjectDir, 'node_modules'));
      await fs.writeFile(path.join(testProjectDir, 'node_modules', 'test.js'), 'test');

      const result = await validator.createDeploymentPackage(testProjectDir, {
        outputPath: path.join(tempDir, 'deployment.zip'),
        includeReports: false,
        includeDocumentation: false,
        excludeDependencies: true
      });

      expect(result.success).toBe(true);
      expect(result.excludedFiles).toContain('node_modules');
    });

    it('should handle packaging errors', async () => {
      const result = await validator.createDeploymentPackage('/non-existent-path', {
        outputPath: path.join(tempDir, 'deployment.zip'),
        includeReports: true,
        includeDocumentation: true,
        excludeDependencies: false
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });
});

// Helper functions for test setup
async function createBasicCypressProject(projectDir: string): Promise<void> {
  await fs.writeJson(path.join(projectDir, 'package.json'), {
    name: 'cypress-project',
    version: '1.0.0',
    devDependencies: {
      cypress: '^13.0.0'
    }
  });

  await fs.ensureDir(path.join(projectDir, 'cypress', 'e2e'));
  await fs.writeFile(
    path.join(projectDir, 'cypress', 'e2e', 'example.cy.js'),
    'cy.visit("/"); cy.get("h1").should("be.visible");'
  );

  await fs.writeJson(path.join(projectDir, 'cypress.config.js'), {
    e2e: {
      baseUrl: 'http://localhost:3000',
      viewportWidth: 1280,
      viewportHeight: 720
    }
  });
}

async function createCompletePlaywrightProject(projectDir: string): Promise<void> {
  await fs.writeJson(path.join(projectDir, 'package.json'), {
    name: 'playwright-project',
    version: '1.0.0',
    scripts: {
      test: 'playwright test'
    },
    devDependencies: {
      '@playwright/test': '^1.40.0',
      playwright: '^1.40.0'
    }
  });

  await fs.writeFile(
    path.join(projectDir, 'playwright.config.ts'),
    `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:3000' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});`
  );

  await fs.ensureDir(path.join(projectDir, 'tests'));
  await fs.writeFile(
    path.join(projectDir, 'tests', 'example.spec.ts'),
    `import { test, expect } from '@playwright/test';
test('example test', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});`
  );
}

async function createPackageJsonWithDependencies(projectDir: string, dependencies: Record<string, string>): Promise<void> {
  await fs.writeJson(path.join(projectDir, 'package.json'), {
    name: 'test-project',
    version: '1.0.0',
    devDependencies: dependencies
  });
}

async function createCypressConfig(projectDir: string): Promise<void> {
  await fs.writeJson(path.join(projectDir, 'cypress.config.js'), {
    e2e: {
      baseUrl: 'http://localhost:4000',
      viewportWidth: 1920,
      viewportHeight: 1080,
      video: true,
      screenshotOnRunFailure: true
    }
  });
}

async function createValidPlaywrightTests(projectDir: string): Promise<void> {
  await fs.ensureDir(path.join(projectDir, 'tests'));

  await fs.writeFile(
    path.join(projectDir, 'tests', 'valid.spec.ts'),
    `import { test, expect } from '@playwright/test';
test('valid test', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});`
  );

  await fs.writeFile(
    path.join(projectDir, 'tests', 'another.spec.ts'),
    `import { test, expect } from '@playwright/test';
test('another valid test', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('heading')).toBeVisible();
});`
  );
}

async function createInvalidPlaywrightTests(projectDir: string): Promise<void> {
  await fs.ensureDir(path.join(projectDir, 'tests'));

  await fs.writeFile(
    path.join(projectDir, 'tests', 'invalid.spec.ts'),
    `import { test, expect } from '@playwright/test';
test('invalid test', async ({ page }) => {
  cy.visit('/'); // Cypress command not converted
  await expect(page.locator('h1')).toBeVisible();
});`
  );

  await fs.writeFile(
    path.join(projectDir, 'tests', 'syntax-error.spec.ts'),
    `import { test, expect } from '@playwright/test';
test('syntax error', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible(
  // Missing closing parenthesis
});`
  );
}