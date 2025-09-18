import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ProjectGenerator } from '../src/project-generator';
import {
  ProjectGenerationOptions,
  ProjectGenerationResult,
  PlaywrightProjectStructure,
  ConvertedTestFile,
  ConversionSummary
} from '../src/types';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('ProjectGenerator', () => {
  let generator: ProjectGenerator;
  const testTempDir = path.join(__dirname, 'temp-project-test');
  const testSourceDir = path.join(testTempDir, 'cypress-source');
  const testOutputDir = path.join(testTempDir, 'playwright-output');

  beforeEach(async () => {
    generator = new ProjectGenerator();
    await fs.ensureDir(testTempDir);
    await fs.ensureDir(testSourceDir);
    await fs.ensureDir(testOutputDir);
  });

  afterEach(async () => {
    await fs.remove(testTempDir);
  });

  describe('createPlaywrightProjectStructure', () => {
    it('should create standard Playwright directory structure', async () => {
      const options: ProjectGenerationOptions = {
        outputDir: testOutputDir,
        testDir: 'tests',
        includePageObjects: true,
        includeFixtures: true
      };

      const result = await generator.createPlaywrightProjectStructure(options);

      expect(result.success).toBe(true);
      expect(result.structure).toBeDefined();

      // Check that directories were created
      expect(await fs.pathExists(path.join(testOutputDir, 'tests'))).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'tests', 'page-objects'))).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'tests', 'fixtures'))).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'test-results'))).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'playwright-report'))).toBe(true);

      // Verify structure object
      expect(result.structure?.testDir).toBe('tests');
      expect(result.structure?.pageObjectDir).toBe('tests/page-objects');
      expect(result.structure?.fixturesDir).toBe('tests/fixtures');
      expect(result.structure?.resultsDir).toBe('test-results');
      expect(result.structure?.reportDir).toBe('playwright-report');
    });

    it('should create custom directory structure when specified', async () => {
      const options: ProjectGenerationOptions = {
        outputDir: testOutputDir,
        testDir: 'e2e',
        pageObjectDir: 'src/page-objects',
        fixturesDir: 'test-data',
        includePageObjects: true,
        includeFixtures: true
      };

      const result = await generator.createPlaywrightProjectStructure(options);

      expect(result.success).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'e2e'))).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'src', 'page-objects'))).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'test-data'))).toBe(true);
    });

    it('should skip optional directories when not requested', async () => {
      const options: ProjectGenerationOptions = {
        outputDir: testOutputDir,
        testDir: 'tests',
        includePageObjects: false,
        includeFixtures: false
      };

      const result = await generator.createPlaywrightProjectStructure(options);

      expect(result.success).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'tests'))).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'tests', 'page-objects'))).toBe(false);
      expect(await fs.pathExists(path.join(testOutputDir, 'tests', 'fixtures'))).toBe(false);
    });

    it('should handle directory creation errors gracefully', async () => {
      const invalidOutputDir = path.join('/invalid/readonly/path');
      const options: ProjectGenerationOptions = {
        outputDir: invalidOutputDir,
        testDir: 'tests'
      };

      const result = await generator.createPlaywrightProjectStructure(options);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors[0]).toContain('Failed to create directory structure');
    });
  });

  describe('generateConvertedTestFile', () => {
    it('should convert Cypress test file to Playwright format', async () => {
      const cypressTestFile = {
        filePath: path.join(testSourceDir, 'login.cy.ts'),
        describes: [{
          name: 'Login Tests',
          tests: [{
            name: 'should login successfully',
            commands: [
              { command: 'visit', args: ['/login'] },
              { command: 'get', args: ['[data-testid="username"]'], chainedCalls: [{ method: 'type', args: ['admin'] }] },
              { command: 'get', args: ['[data-testid="password"]'], chainedCalls: [{ method: 'type', args: ['password'] }] },
              { command: 'get', args: ['[data-testid="submit"]'], chainedCalls: [{ method: 'click', args: [] }] }
            ]
          }]
        }],
        cypressCommands: [],
        imports: []
      };

      const result = await generator.generateConvertedTestFile(cypressTestFile, {
        outputDir: testOutputDir,
        usePageObjects: false
      });

      expect(result.success).toBe(true);
      expect(result.convertedFile).toBeDefined();
      expect(result.convertedFile?.filePath).toContain('login.spec.ts');
      expect(result.convertedFile?.content).toContain("import { test, expect } from '@playwright/test'");
      expect(result.convertedFile?.content).toContain("test.describe('Login Tests'");
      expect(result.convertedFile?.content).toContain("test('should login successfully'");
      expect(result.convertedFile?.content).toContain("await page.goto('/login')");
      expect(result.convertedFile?.content).toContain("await page.getByTestId('username').fill('admin')");
      expect(result.convertedFile?.content).toContain("await page.getByTestId('submit').click()");
    });

    it('should generate test file with page object imports when requested', async () => {
      const cypressTestFile = {
        filePath: path.join(testSourceDir, 'dashboard.cy.ts'),
        describes: [{
          name: 'Dashboard Tests',
          tests: [{
            name: 'should display dashboard',
            commands: [
              { command: 'visit', args: ['/dashboard'] },
              { command: 'customLogin', args: ['user@test.com', 'password'] }
            ]
          }]
        }],
        cypressCommands: [],
        imports: [],
        customCommands: [{
          name: 'customLogin',
          type: 'add' as const,
          parameters: ['email', 'password'],
          body: 'cy.get("[data-testid=email]").type(email); cy.get("[data-testid=password]").type(password);'
        }]
      };

      const result = await generator.generateConvertedTestFile(cypressTestFile, {
        outputDir: testOutputDir,
        usePageObjects: true
      });

      expect(result.success).toBe(true);
      expect(result.convertedFile?.content).toContain("import { LoginPage } from '../page-objects/LoginPage'");
      expect(result.convertedFile?.content).toContain("const loginPage = new LoginPage(page)");
      expect(result.convertedFile?.content).toContain("await loginPage.customLogin('user@test.com', 'password')");
    });

    it('should handle nested describe blocks correctly', async () => {
      const cypressTestFile = {
        filePath: path.join(testSourceDir, 'nested.cy.ts'),
        describes: [{
          name: 'Main Suite',
          tests: [],
          describes: [{
            name: 'Nested Suite',
            tests: [{
              name: 'nested test',
              commands: [{ command: 'visit', args: ['/'] }]
            }]
          }]
        }],
        cypressCommands: [],
        imports: []
      };

      const result = await generator.generateConvertedTestFile(cypressTestFile, {
        outputDir: testOutputDir,
        usePageObjects: false
      });

      expect(result.success).toBe(true);
      expect(result.convertedFile?.content).toContain("test.describe('Main Suite'");
      expect(result.convertedFile?.content).toContain("test.describe('Nested Suite'");
      expect(result.convertedFile?.content).toContain("test('nested test'");
    });

    it('should preserve imports and add required Playwright imports', async () => {
      const cypressTestFile = {
        filePath: path.join(testSourceDir, 'with-imports.cy.ts'),
        describes: [{
          name: 'Test with imports',
          tests: [{
            name: 'test',
            commands: [{ command: 'visit', args: ['/'] }]
          }]
        }],
        cypressCommands: [],
        imports: [
          { source: '../utils/helpers', namedImports: ['helper1', 'helper2'] },
          { source: '../constants', defaultImport: 'CONSTANTS' }
        ]
      };

      const result = await generator.generateConvertedTestFile(cypressTestFile, {
        outputDir: testOutputDir,
        usePageObjects: false
      });

      expect(result.success).toBe(true);
      expect(result.convertedFile?.content).toContain("import { test, expect } from '@playwright/test'");
      expect(result.convertedFile?.content).toContain("import { helper1, helper2 } from '../utils/helpers'");
      expect(result.convertedFile?.content).toContain("import CONSTANTS from '../constants'");
    });
  });

  describe('generatePageObjectFile', () => {
    it('should create page object class from custom commands', async () => {
      const customCommands = [{
        name: 'login',
        type: 'add' as const,
        parameters: ['username', 'password'],
        body: 'cy.get("[data-testid=username]").type(username); cy.get("[data-testid=password]").type(password); cy.get("[data-testid=submit]").click();'
      }, {
        name: 'logout',
        type: 'add' as const,
        parameters: [],
        body: 'cy.get("[data-testid=logout]").click();'
      }];

      const result = await generator.generatePageObjectFile(customCommands, 'AuthPage', {
        outputDir: testOutputDir,
        pageObjectDir: 'tests/page-objects'
      });

      expect(result.success).toBe(true);
      expect(result.pageObjectFile).toBeDefined();
      expect(result.pageObjectFile?.className).toBe('AuthPage');
      expect(result.pageObjectFile?.filePath).toContain('AuthPage.ts');
      expect(result.pageObjectFile?.content).toContain("export class AuthPage");
      expect(result.pageObjectFile?.content).toContain("constructor(private page: Page)");
      expect(result.pageObjectFile?.content).toContain("async login(username: any, password: any)");
      expect(result.pageObjectFile?.content).toContain("async logout()");
      expect(result.pageObjectFile?.content).toContain("await this.page.getByTestId('username').fill(username)");
      expect(result.pageObjectFile?.content).toContain("await this.page.getByTestId('submit').click()");
    });

    it('should handle commands with no parameters', async () => {
      const customCommands = [{
        name: 'acceptCookies',
        type: 'add' as const,
        parameters: [],
        body: 'cy.get(".cookie-banner button").click();'
      }];

      const result = await generator.generatePageObjectFile(customCommands, 'CookiePage', {
        outputDir: testOutputDir,
        pageObjectDir: 'tests/page-objects'
      });

      expect(result.success).toBe(true);
      expect(result.pageObjectFile?.content).toContain("async acceptCookies()");
    });

    it('should generate TypeScript-compatible method signatures', async () => {
      const customCommands = [{
        name: 'fillForm',
        type: 'add' as const,
        parameters: ['data', 'options'],
        body: 'cy.get("form").within(() => { /* complex form logic */ });'
      }];

      const result = await generator.generatePageObjectFile(customCommands, 'FormPage', {
        outputDir: testOutputDir,
        pageObjectDir: 'tests/page-objects'
      });

      expect(result.success).toBe(true);
      expect(result.pageObjectFile?.content).toContain("async fillForm(data: any, options: any)");
      expect(result.pageObjectFile?.content).toContain("import { Page } from '@playwright/test'");
    });
  });

  describe('writeProjectFiles', () => {
    it('should write all project files to output directory', async () => {
      const projectStructure: PlaywrightProjectStructure = {
        testDir: 'tests',
        pageObjectDir: 'tests/page-objects',
        fixturesDir: 'tests/fixtures',
        resultsDir: 'test-results',
        reportDir: 'playwright-report'
      };

      const convertedFiles: ConvertedTestFile[] = [{
        filePath: path.join(testOutputDir, 'tests', 'login.spec.ts'),
        content: 'test content',
        originalPath: path.join(testSourceDir, 'login.cy.ts')
      }];

      const pageObjectFiles = [{
        className: 'LoginPage',
        filePath: path.join(testOutputDir, 'tests', 'page-objects', 'LoginPage.ts'),
        content: 'page object content',
        methods: []
      }];

      const playwrightConfig = {
        testDir: 'tests',
        use: { baseURL: 'http://localhost:3000' }
      };

      const result = await generator.writeProjectFiles({
        outputDir: testOutputDir,
        projectStructure,
        convertedFiles,
        pageObjectFiles,
        playwrightConfig,
        configFormat: 'typescript'
      });

      expect(result.success).toBe(true);
      expect(result.writtenFiles).toBeDefined();
      expect(result.writtenFiles?.length).toBeGreaterThan(0);

      // Verify files were written
      expect(await fs.pathExists(path.join(testOutputDir, 'tests', 'login.spec.ts'))).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'tests', 'page-objects', 'LoginPage.ts'))).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'playwright.config.ts'))).toBe(true);

      // Verify content
      const testContent = await fs.readFile(path.join(testOutputDir, 'tests', 'login.spec.ts'), 'utf8');
      expect(testContent).toBe('test content');
    });

    it('should handle file write errors gracefully', async () => {
      const projectStructure: PlaywrightProjectStructure = {
        testDir: 'tests'
      };

      const convertedFiles: ConvertedTestFile[] = [{
        filePath: '/invalid/readonly/path/test.spec.ts',
        content: 'test content',
        originalPath: path.join(testSourceDir, 'test.cy.ts')
      }];

      const result = await generator.writeProjectFiles({
        outputDir: testOutputDir,
        projectStructure,
        convertedFiles,
        pageObjectFiles: [],
        playwrightConfig: {},
        configFormat: 'typescript'
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should generate package.json with Playwright dependencies', async () => {
      const result = await generator.writeProjectFiles({
        outputDir: testOutputDir,
        projectStructure: { testDir: 'tests' },
        convertedFiles: [],
        pageObjectFiles: [],
        playwrightConfig: {},
        configFormat: 'typescript',
        generatePackageJson: true
      });

      expect(result.success).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'package.json'))).toBe(true);

      const packageJson = await fs.readJson(path.join(testOutputDir, 'package.json'));
      expect(packageJson.devDependencies).toBeDefined();
      expect(packageJson.devDependencies['@playwright/test']).toBeDefined();
      expect(packageJson.scripts.test).toBeDefined();
    });
  });

  describe('generateConversionSummary', () => {
    it('should generate comprehensive conversion summary', async () => {
      const projectGenerationResult: ProjectGenerationResult = {
        success: true,
        structure: {
          testDir: 'tests',
          pageObjectDir: 'tests/page-objects'
        },
        convertedFiles: [
          { filePath: 'tests/login.spec.ts', content: '', originalPath: 'cypress/e2e/login.cy.ts' },
          { filePath: 'tests/dashboard.spec.ts', content: '', originalPath: 'cypress/e2e/dashboard.cy.ts' }
        ],
        pageObjectFiles: [
          { className: 'LoginPage', filePath: 'tests/page-objects/LoginPage.ts', content: '', methods: [] }
        ],
        configFile: { filePath: 'playwright.config.ts', content: '' },
        warnings: ['Custom command XYZ requires manual review'],
        errors: []
      };

      const summary = generator.generateConversionSummary(projectGenerationResult);

      expect(summary.totalFiles).toBe(2);
      expect(summary.convertedTestFiles).toBe(2);
      expect(summary.pageObjectFiles).toBe(1);
      expect(summary.configFiles).toBe(1);
      expect(summary.warningsCount).toBe(1);
      expect(summary.errorsCount).toBe(0);
      expect(summary.success).toBe(true);
      expect(summary.conversionRate).toBeCloseTo(100);
      expect(summary.recommendations).toBeDefined();
      expect(summary.nextSteps).toBeDefined();
    });

    it('should calculate conversion rate based on errors', async () => {
      const projectGenerationResult: ProjectGenerationResult = {
        success: true,
        structure: { testDir: 'tests' },
        convertedFiles: [
          { filePath: 'tests/test1.spec.ts', content: '', originalPath: 'cypress/e2e/test1.cy.ts' },
          { filePath: 'tests/test2.spec.ts', content: '', originalPath: 'cypress/e2e/test2.cy.ts' }
        ],
        pageObjectFiles: [],
        warnings: [],
        errors: ['Failed to convert test3.cy.ts']
      };

      const summary = generator.generateConversionSummary(projectGenerationResult);

      expect(summary.totalFiles).toBe(3); // 2 converted + 1 failed
      expect(summary.convertedTestFiles).toBe(2);
      expect(summary.errorsCount).toBe(1);
      expect(summary.conversionRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete project generation workflow', async () => {
      // Create mock Cypress project structure
      const cypressDir = path.join(testSourceDir, 'cypress');
      await fs.ensureDir(path.join(cypressDir, 'e2e'));
      await fs.ensureDir(path.join(cypressDir, 'support'));

      const testFile = `
        describe('Sample Test', () => {
          it('should work', () => {
            cy.visit('/');
            cy.get('[data-testid="button"]').click();
            cy.url().should('contain', '/dashboard');
          });
        });
      `;

      await fs.writeFile(path.join(cypressDir, 'e2e', 'sample.cy.ts'), testFile);

      const customCommand = `
        Cypress.Commands.add('customLogin', (username, password) => {
          cy.get('[data-testid="username"]').type(username);
          cy.get('[data-testid="password"]').type(password);
          cy.get('[data-testid="submit"]').click();
        });
      `;

      await fs.writeFile(path.join(cypressDir, 'support', 'commands.ts'), customCommand);

      // Test complete workflow
      const options: ProjectGenerationOptions = {
        outputDir: testOutputDir,
        testDir: 'tests',
        includePageObjects: true,
        includeFixtures: true
      };

      // Create structure
      const structureResult = await generator.createPlaywrightProjectStructure(options);
      expect(structureResult.success).toBe(true);

      // Verify all components work together
      expect(await fs.pathExists(path.join(testOutputDir, 'tests'))).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'tests', 'page-objects'))).toBe(true);
      expect(await fs.pathExists(path.join(testOutputDir, 'playwright-report'))).toBe(true);
    });
  });
});