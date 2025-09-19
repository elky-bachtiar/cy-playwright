import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ProjectTypeAnalyzer } from '../../src/services/project-type-analyzer';
import { SelectiveConverter } from '../../src/services/selective-converter';
import { ConversionValidator } from '../../src/services/conversion-validator';

// Mock file system operations for isolated testing
jest.mock('fs-extra');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Mixed Project Conversion Workflow E2E', () => {
  let projectAnalyzer: ProjectTypeAnalyzer;
  let selectiveConverter: SelectiveConverter;
  let conversionValidator: ConversionValidator;

  const testProjectPath = '/test/dla-project';
  const outputPath = '/test/output';

  beforeEach(() => {
    projectAnalyzer = new ProjectTypeAnalyzer();
    selectiveConverter = new SelectiveConverter(projectAnalyzer);
    conversionValidator = new ConversionValidator();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete DLA Project Conversion from Start to Finish', () => {
    test('should successfully convert mixed DLA project with >85% success rate', async () => {
      // Mock DLA project structure with mixed test types
      const mockProjectStructure = {
        'src/app/login/login.component.spec.ts': `
          import { ComponentFixture, TestBed } from '@angular/core/testing';
          import { LoginComponent } from './login.component';

          describe('LoginComponent', () => {
            let component: LoginComponent;
            let fixture: ComponentFixture<LoginComponent>;

            beforeEach(() => {
              TestBed.configureTestingModule({
                declarations: [LoginComponent]
              });
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
            });

            it('should create', () => {
              expect(component).toBeTruthy();
            });
          });
        `,
        'e2e/cypress/e2e/login.cy.ts': `
          import { CyLoginPage } from '../pages/cy-login-page';

          describe('User Login', () => {
            const loginPage = new CyLoginPage();

            it('should login successfully with valid credentials', () => {
              cy.visit('/login');
              loginPage.fillEmail('user@example.com');
              loginPage.fillPassword('password123');
              loginPage.clickLoginButton();
              cy.url().should('include', '/dashboard');
              cy.get('[data-cy="welcome-message"]').should('be.visible');
            });

            it('should show error for invalid credentials', () => {
              cy.visit('/login');
              loginPage.fillEmail('invalid@example.com');
              loginPage.fillPassword('wrongpassword');
              loginPage.clickLoginButton();
              cy.get('[data-cy="error-message"]').should('contain', 'Invalid credentials');
            });
          });
        `,
        'e2e/cypress/e2e/dashboard.cy.ts': `
          describe('Dashboard Functionality', () => {
            beforeEach(() => {
              cy.login('user@example.com', 'password123');
              cy.visit('/dashboard');
            });

            it('should display user profile information', () => {
              cy.get('[data-cy="user-profile"]').should('be.visible');
              cy.get('[data-cy="user-name"]').should('contain', 'Test User');
            });

            it('should allow navigation to settings', () => {
              cy.get('[data-cy="settings-link"]').click();
              cy.url().should('include', '/settings');
            });
          });
        `,
        'e2e/cypress/pages/cy-login-page.ts': `
          export class CyLoginPage {
            fillEmail(email: string) {
              cy.get('[data-cy="email-input"]').type(email);
            }

            fillPassword(password: string) {
              cy.get('[data-cy="password-input"]').type(password);
            }

            clickLoginButton() {
              cy.get('[data-cy="login-button"]').click();
            }

            fillLoginForm(email: string, password: string) {
              this.fillEmail(email);
              this.fillPassword(password);
            }
          }
        `,
        'tests/existing-playwright.spec.ts': `
          import { test, expect } from '@playwright/test';

          test('existing Playwright test', async ({ page }) => {
            await page.goto('/');
            await expect(page).toHaveTitle('DLA Application');
          });
        `
      };

      // Mock file system to simulate project structure
      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        const pathStr = dirPath.toString();
        if (pathStr === testProjectPath) {
          return ['src', 'e2e', 'tests'];
        }
        if (pathStr.includes('src')) {
          return ['app'];
        }
        if (pathStr.includes('app')) {
          return ['login'];
        }
        if (pathStr.includes('login')) {
          return ['login.component.spec.ts'];
        }
        if (pathStr.includes('e2e')) {
          return ['cypress'];
        }
        if (pathStr.includes('cypress/e2e')) {
          return ['login.cy.ts', 'dashboard.cy.ts'];
        }
        if (pathStr.includes('cypress/pages')) {
          return ['cy-login-page.ts'];
        }
        if (pathStr.includes('cypress') && !pathStr.includes('/')) {
          return ['e2e', 'pages'];
        }
        if (pathStr.includes('tests')) {
          return ['existing-playwright.spec.ts'];
        }
        return [];
      });

      mockFs.stat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true
      } as any);

      mockFs.pathExists.mockResolvedValue(true);

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        const pathStr = filePath.toString();
        for (const [mockPath, content] of Object.entries(mockProjectStructure)) {
          if (pathStr.includes(mockPath.split('/').pop()!)) {
            return content;
          }
        }
        return '';
      });

      mockFs.ensureDir.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();
      mockFs.copy.mockResolvedValue();

      // Mock successful TypeScript compilation
      const mockExec = require('child_process').exec;
      mockExec.mockImplementation((command: string, callback: Function) => {
        if (command.includes('tsc')) {
          callback(null, 'Compilation successful', '');
        } else if (command.includes('playwright test')) {
          callback(null, 'Tests passed', '');
        } else {
          callback(null, '', '');
        }
      });

      // Step 1: Analyze project structure
      const projectAnalysis = await projectAnalyzer.analyzeProject(testProjectPath);

      expect(projectAnalysis.totalFiles).toBe(5);
      expect(projectAnalysis.summary.cypressFiles).toBe(2); // login.cy.ts, dashboard.cy.ts
      expect(projectAnalysis.summary.angularFiles).toBe(1); // login.component.spec.ts
      expect(projectAnalysis.summary.playwrightFiles).toBe(1); // existing-playwright.spec.ts
      expect(projectAnalysis.conversionCandidates).toHaveLength(2);

      // Step 2: Perform selective conversion
      const conversionResult = await selectiveConverter.convertProject(
        testProjectPath,
        outputPath,
        {
          preserveStructure: true,
          skipExisting: false
        }
      );

      expect(conversionResult.successfulConversions).toBe(2);
      expect(conversionResult.preservedFiles).toHaveLength(2); // Angular + existing Playwright
      expect(conversionResult.totalFilesProcessed).toBe(4); // 2 converted + 2 preserved

      // Step 3: Validate conversion quality
      const validationResult = await conversionValidator.validateConvertedProject(outputPath);

      expect(validationResult.overallSuccess).toBe(true);
      expect(validationResult.qualityMetrics.conversionRate).toBeGreaterThan(0.85);
      expect(validationResult.qualityMetrics.meetsQualityThreshold).toBe(true);
      expect(validationResult.validationSummary.compilationValidation.success).toBe(true);

      // Verify conversion rate meets specification
      const actualConversionRate = conversionResult.successfulConversions /
                                 projectAnalysis.conversionCandidates.length;
      expect(actualConversionRate).toBeGreaterThan(0.85);
    });

    test('should handle large DLA project with 100+ files efficiently', async () => {
      // Generate a large project structure
      const largeProjectFiles = new Map<string, string>();

      // Add 50 Angular component tests
      for (let i = 0; i < 50; i++) {
        largeProjectFiles.set(`src/app/feature${i}/component${i}.spec.ts`, `
          import { ComponentFixture, TestBed } from '@angular/core/testing';
          describe('Component${i}', () => {
            it('should work', () => expect(true).toBe(true));
          });
        `);
      }

      // Add 60 Cypress e2e tests
      for (let i = 0; i < 60; i++) {
        largeProjectFiles.set(`e2e/feature${i}.cy.ts`, `
          describe('Feature ${i}', () => {
            it('should test feature ${i}', () => {
              cy.visit('/feature${i}');
              cy.get('[data-cy="content"]').should('be.visible');
            });
          });
        `);
      }

      // Add 10 existing Playwright tests
      for (let i = 0; i < 10; i++) {
        largeProjectFiles.set(`tests/existing${i}.spec.ts`, `
          import { test, expect } from '@playwright/test';
          test('existing test ${i}', async ({ page }) => {
            await page.goto('/test${i}');
          });
        `);
      }

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        const files = Array.from(largeProjectFiles.keys())
          .filter(f => f.startsWith(path.relative(testProjectPath, dirPath.toString())))
          .map(f => path.basename(f));
        return files.length > 0 ? files : ['src', 'e2e', 'tests'];
      });

      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        for (const [mockPath, content] of largeProjectFiles) {
          if (filePath.toString().includes(path.basename(mockPath))) {
            return content;
          }
        }
        return '';
      });

      mockFs.ensureDir.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();
      mockFs.copy.mockResolvedValue();

      // Mock successful operations
      const mockExec = require('child_process').exec;
      mockExec.mockImplementation((command: string, callback: Function) => {
        setTimeout(() => callback(null, 'Success', ''), 10); // Quick response
      });

      const startTime = Date.now();

      // Analyze large project
      const projectAnalysis = await projectAnalyzer.analyzeProject(testProjectPath);
      expect(projectAnalysis.totalFiles).toBe(120);

      // Convert large project
      const conversionResult = await selectiveConverter.convertProject(
        testProjectPath,
        outputPath,
        { batchSize: 20, parallel: true }
      );

      // Validate large project
      const validationResult = await conversionValidator.validateConvertedProject(outputPath);

      const totalTime = Date.now() - startTime;

      // Performance criteria validation
      expect(totalTime).toBeLessThan(120000); // Under 2 minutes
      expect(conversionResult.performanceMetrics.filesPerSecond).toBeGreaterThan(5);
      expect(validationResult.performanceMetrics.filesPerSecond).toBeGreaterThan(10);

      // Quality criteria validation
      expect(conversionResult.successfulConversions).toBe(60); // All Cypress files
      expect(validationResult.qualityMetrics.meetsQualityThreshold).toBe(true);
    });

    test('should generate accurate conversion quality metrics and reporting', async () => {
      // Mock project with known conversion outcomes
      const testScenarios = {
        'perfect-file.cy.ts': {
          content: 'describe("test", () => { it("works", () => { cy.visit("/"); }); });',
          expectedValid: true
        },
        'syntax-error.cy.ts': {
          content: 'describe("test", () => { it("broken", () => { cy.visit("/" }); });', // Missing closing paren
          expectedValid: false
        },
        'complex-patterns.cy.ts': {
          content: `
            describe('Complex Test', () => {
              it('uses advanced patterns', () => {
                cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('getUsers');
                cy.visit('/users');
                cy.wait('@getUsers').then((interception) => {
                  expect(interception.response.statusCode).to.eq(200);
                });
              });
            });
          `,
          expectedValid: true
        }
      };

      mockFs.readdir.mockResolvedValue(Object.keys(testScenarios));
      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        const fileName = path.basename(filePath.toString());
        return testScenarios[fileName as keyof typeof testScenarios]?.content || '';
      });
      mockFs.ensureDir.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      // Mock compilation to simulate one file with errors
      const mockExec = require('child_process').exec;
      mockExec.mockImplementation((command: string, callback: Function) => {
        if (command.includes('tsc')) {
          callback(new Error('Compilation failed'), '', 'syntax-error.spec.ts(1,50): error TS1005');
        } else {
          callback(null, 'Success', '');
        }
      });

      // Run full conversion workflow
      const projectAnalysis = await projectAnalyzer.analyzeProject(testProjectPath);
      const conversionResult = await selectiveConverter.convertProject(testProjectPath, outputPath);
      const validationResult = await conversionValidator.validateConvertedProject(outputPath);

      // Verify quality metrics
      const qualityMetrics = validationResult.qualityMetrics;
      expect(qualityMetrics.totalFiles).toBe(3);
      expect(qualityMetrics.conversionRate).toBeGreaterThan(0.66); // At least 2/3 should succeed
      expect(qualityMetrics.errorCategories).toBeDefined();
      expect(qualityMetrics.errorCategories['syntax']).toBeGreaterThan(0);

      // Generate and verify validation report
      const reportPath = path.join(outputPath, 'validation-report.json');
      await conversionValidator.generateValidationReport(validationResult, reportPath);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        reportPath,
        expect.stringContaining('"totalFiles": 3')
      );
    });

    test('should handle conversion conflicts and provide appropriate recommendations', async () => {
      // Mock project with naming conflicts
      const conflictingProject = {
        'cypress/e2e/login.cy.ts': 'describe("cypress login", () => {});',
        'tests/login.spec.ts': 'import { test } from "@playwright/test";' // Conflict!
      };

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        if (dirPath.toString().includes('cypress')) {
          return ['login.cy.ts'];
        }
        if (dirPath.toString().includes('tests')) {
          return ['login.spec.ts'];
        }
        return ['cypress', 'tests'];
      });

      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        for (const [mockPath, content] of Object.entries(conflictingProject)) {
          if (filePath.toString().includes(path.basename(mockPath))) {
            return content;
          }
        }
        return '';
      });

      mockFs.ensureDir.mockResolvedValue();
      mockFs.copy.mockResolvedValue();

      // Analyze project and detect conflicts
      const projectAnalysis = await projectAnalyzer.analyzeProject(testProjectPath);
      expect(projectAnalysis.conversionScope.conflicts).toHaveLength(1);
      expect(projectAnalysis.conversionScope.conflicts[0].recommendation).toBe('rename');

      // Convert with conflict handling
      const conversionResult = await selectiveConverter.convertProject(testProjectPath, outputPath);
      expect(conversionResult.warnings.some(w => w.includes('conflict'))).toBe(true);
    });

    test('should verify all major conversion features work together', async () => {
      // Mock comprehensive project testing all conversion engines
      const comprehensiveProject = {
        // Import deduplication scenarios
        'tests/duplicate-imports.cy.ts': `
          import { test, expect } from '@playwright/test';
          import { test, expect } from '@playwright/test'; // Duplicate
          import { ComponentFixture } from '@angular/core/testing'; // Should be removed
          describe('test', () => {});
        `,

        // Page object conversion scenarios
        'pages/login-page.ts': `
          export class LoginPage {
            visit() {
              cy.visit('/login');
            }

            fillEmail(email) {
              cy.get('[data-cy="email"]').type(email);
            }
          }
        `,

        // Complex pattern conversion scenarios
        'tests/complex-patterns.cy.ts': `
          describe('Complex Patterns', () => {
            it('uses cy.then and cy.wait', () => {
              cy.intercept('GET', '/api/data').as('getData');
              cy.visit('/page');
              cy.wait('@getData').then((interception) => {
                expect(interception.response.statusCode).to.eq(200);
              });
            });
          });
        `,

        // API mocking scenarios
        'tests/api-mocking.cy.ts': `
          describe('API Tests', () => {
            beforeEach(() => {
              cy.intercept('POST', '/api/login', { statusCode: 200 }).as('login');
            });

            it('mocks API responses', () => {
              cy.visit('/login');
              cy.get('#submit').click();
              cy.wait('@login');
            });
          });
        `
      };

      // Setup mocks for comprehensive testing
      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        return Object.keys(comprehensiveProject).map(f => path.basename(f));
      });

      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        for (const [mockPath, content] of Object.entries(comprehensiveProject)) {
          if (filePath.toString().includes(path.basename(mockPath))) {
            return content;
          }
        }
        return '';
      });

      mockFs.ensureDir.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      // Mock successful compilation and execution
      const mockExec = require('child_process').exec;
      mockExec.mockImplementation((command: string, callback: Function) => {
        callback(null, 'Success', '');
      });

      // Run complete conversion workflow
      const projectAnalysis = await projectAnalyzer.analyzeProject(testProjectPath);
      const conversionResult = await selectiveConverter.convertProject(testProjectPath, outputPath);
      const validationResult = await conversionValidator.validateConvertedProject(outputPath);

      // Verify all conversion engines are working
      expect(projectAnalysis.conversionCandidates.length).toBeGreaterThan(0);
      expect(conversionResult.successfulConversions).toBeGreaterThan(0);
      expect(validationResult.overallSuccess).toBe(true);

      // Verify conversion system is production-ready
      expect(validationResult.qualityMetrics.meetsQualityThreshold).toBe(true);
      expect(validationResult.validationSummary.compilationValidation.success).toBe(true);
      expect(validationResult.validationSummary.executionValidation.canExecute).toBe(true);
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('should handle memory constraints during large project conversion', async () => {
      // This test would normally be more complex in a real scenario
      // Here we simulate memory pressure by processing many files
      const manyFiles = Array.from({ length: 1000 }, (_, i) => `test${i}.cy.ts`);

      mockFs.readdir.mockResolvedValue(manyFiles);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue('cy.visit("/");');
      mockFs.ensureDir.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      const mockExec = require('child_process').exec;
      mockExec.mockImplementation((command: string, callback: Function) => {
        callback(null, 'Success', '');
      });

      // Should handle large number of files without memory issues
      const projectAnalysis = await projectAnalyzer.analyzeProject(testProjectPath);
      expect(projectAnalysis.totalFiles).toBe(1000);

      // Use batch processing to handle memory constraints
      const conversionResult = await selectiveConverter.convertProject(
        testProjectPath,
        outputPath,
        { batchSize: 50 } // Process in smaller batches
      );

      expect(conversionResult.successfulConversions).toBe(1000);
    });
  });
});