import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { MixedProjectConversionOrchestrator } from '../src/services/mixed-project-conversion-orchestrator';

// Mock file system and child_process
jest.mock('fs-extra');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Mixed Project System Integration', () => {
  let orchestrator: MixedProjectConversionOrchestrator;
  const testProjectPath = '/test/dla-project';
  const outputPath = '/test/output';

  beforeEach(() => {
    orchestrator = new MixedProjectConversionOrchestrator();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete System Integration', () => {
    test('should demonstrate >85% conversion success rate on DLA project', async () => {
      // Mock a comprehensive DLA project structure
      const dlaProjectStructure = {
        // Angular unit tests (should be preserved)
        'src/app/auth/login.component.spec.ts': `
          import { ComponentFixture, TestBed } from '@angular/core/testing';
          import { LoginComponent } from './login.component';

          describe('LoginComponent', () => {
            let component: LoginComponent;
            let fixture: ComponentFixture<LoginComponent>;

            beforeEach(() => {
              TestBed.configureTestingModule({
                declarations: [LoginComponent]
              });
            });
          });
        `,

        'src/app/dashboard/dashboard.component.spec.ts': `
          import { ComponentFixture, TestBed } from '@angular/core/testing';
          import { DashboardComponent } from './dashboard.component';

          describe('DashboardComponent', () => {
            it('should create', () => {
              expect(true).toBe(true);
            });
          });
        `,

        // Cypress e2e tests (should be converted)
        'e2e/cypress/e2e/auth/login.cy.ts': `
          import { CyLoginPage } from '../../pages/cy-login-page';

          describe('User Authentication', () => {
            const loginPage = new CyLoginPage();

            beforeEach(() => {
              cy.visit('/login');
            });

            it('should login with valid credentials', () => {
              loginPage.fillEmail('user@example.com');
              loginPage.fillPassword('password123');
              loginPage.clickLoginButton();
              cy.url().should('include', '/dashboard');
              cy.get('[data-cy="welcome-message"]').should('be.visible');
            });

            it('should show error for invalid credentials', () => {
              loginPage.fillEmail('invalid@example.com');
              loginPage.fillPassword('wrongpassword');
              loginPage.clickLoginButton();
              cy.get('[data-cy="error-message"]').should('contain', 'Invalid credentials');
            });
          });
        `,

        'e2e/cypress/e2e/navigation/dashboard.cy.ts': `
          describe('Dashboard Navigation', () => {
            beforeEach(() => {
              cy.login('user@example.com', 'password123');
              cy.visit('/dashboard');
            });

            it('should display main navigation', () => {
              cy.get('[data-cy="nav-menu"]').should('be.visible');
              cy.get('[data-cy="profile-link"]').should('be.visible');
              cy.get('[data-cy="settings-link"]').should('be.visible');
            });

            it('should navigate to profile page', () => {
              cy.get('[data-cy="profile-link"]').click();
              cy.url().should('include', '/profile');
            });
          });
        `,

        'e2e/cypress/e2e/api/data-management.cy.ts': `
          describe('Data Management API', () => {
            beforeEach(() => {
              cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('getUsers');
              cy.intercept('POST', '/api/users', { statusCode: 201 }).as('createUser');
            });

            it('should load user data via API', () => {
              cy.visit('/users');
              cy.wait('@getUsers').then((interception) => {
                expect(interception.response.statusCode).to.eq(200);
              });
              cy.get('[data-cy="user-list"]').should('be.visible');
            });

            it('should create new user via API', () => {
              cy.visit('/users/new');
              cy.get('[data-cy="name-input"]').type('New User');
              cy.get('[data-cy="email-input"]').type('newuser@example.com');
              cy.get('[data-cy="submit-button"]').click();
              cy.wait('@createUser');
              cy.get('[data-cy="success-message"]').should('be.visible');
            });
          });
        `,

        // Page object (should be converted)
        'e2e/cypress/pages/cy-login-page.ts': `
          export class CyLoginPage {
            fillEmail(email: string) {
              cy.get('[data-cy="email-input"]').clear().type(email);
            }

            fillPassword(password: string) {
              cy.get('[data-cy="password-input"]').clear().type(password);
            }

            clickLoginButton() {
              cy.get('[data-cy="login-button"]').click();
            }

            fillLoginForm(email: string, password: string) {
              this.fillEmail(email);
              this.fillPassword(password);
              this.clickLoginButton();
            }
          }
        `,

        // Existing Playwright test (should be preserved)
        'tests/existing-api.spec.ts': `
          import { test, expect } from '@playwright/test';

          test('existing API test', async ({ page }) => {
            await page.goto('/api-docs');
            await expect(page).toHaveTitle('API Documentation');
          });
        `,

        // Complex patterns test (challenging conversion)
        'e2e/cypress/e2e/complex/advanced-patterns.cy.ts': `
          describe('Advanced Cypress Patterns', () => {
            it('should handle complex cy.then and cy.wait patterns', () => {
              cy.intercept('GET', '/api/data', { fixture: 'data.json' }).as('getData');
              cy.intercept('POST', '/api/process', { statusCode: 200 }).as('processData');

              cy.visit('/complex-page');

              cy.wait('@getData').then((interception) => {
                const data = interception.response.body;
                expect(data).to.have.property('items');

                cy.get('[data-cy="process-button"]').click();

                cy.wait('@processData').then((processInterception) => {
                  expect(processInterception.response.statusCode).to.eq(200);
                  cy.url().should('include', '/success');
                });
              });
            });
          });
        `
      };

      // Setup comprehensive file system mocking
      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        const pathStr = dirPath.toString();

        if (pathStr === testProjectPath) {
          return ['src', 'e2e', 'tests'];
        }

        if (pathStr.includes('src/app/auth')) return ['login.component.spec.ts'];
        if (pathStr.includes('src/app/dashboard')) return ['dashboard.component.spec.ts'];
        if (pathStr.includes('src/app')) return ['auth', 'dashboard'];
        if (pathStr.includes('src')) return ['app'];

        if (pathStr.includes('e2e/cypress/e2e/auth')) return ['login.cy.ts'];
        if (pathStr.includes('e2e/cypress/e2e/navigation')) return ['dashboard.cy.ts'];
        if (pathStr.includes('e2e/cypress/e2e/api')) return ['data-management.cy.ts'];
        if (pathStr.includes('e2e/cypress/e2e/complex')) return ['advanced-patterns.cy.ts'];
        if (pathStr.includes('e2e/cypress/e2e')) return ['auth', 'navigation', 'api', 'complex'];
        if (pathStr.includes('e2e/cypress/pages')) return ['cy-login-page.ts'];
        if (pathStr.includes('e2e/cypress')) return ['e2e', 'pages'];
        if (pathStr.includes('e2e')) return ['cypress'];

        if (pathStr.includes('tests')) return ['existing-api.spec.ts'];

        return [];
      });

      mockFs.stat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true
      } as any);

      mockFs.pathExists.mockResolvedValue(true);

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        const pathStr = filePath.toString();
        for (const [mockPath, content] of Object.entries(dlaProjectStructure)) {
          if (pathStr.includes(path.basename(mockPath))) {
            return content;
          }
        }
        return '';
      });

      mockFs.ensureDir.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();
      mockFs.copy.mockResolvedValue();

      // Mock successful TypeScript compilation and test execution
      const mockExec = require('child_process').exec;
      mockExec.mockImplementation((command: string, callback: Function) => {
        // Simulate small delays for realistic timing
        setTimeout(() => {
          if (command.includes('tsc')) {
            callback(null, 'TypeScript compilation successful', '');
          } else if (command.includes('playwright test')) {
            callback(null, 'Playwright tests passed', '');
          } else {
            callback(null, 'Success', '');
          }
        }, 50);
      });

      // Execute complete conversion workflow
      const result = await orchestrator.convertMixedProject(testProjectPath, outputPath, {
        preserveStructure: true,
        validateQuality: true,
        generateReport: true,
        qualityThreshold: 0.85
      });

      // Validate system requirements
      const systemValidation = await orchestrator.validateSystemRequirements(result);

      // Assertions for >85% success rate requirement
      expect(result.qualityScore).toBeGreaterThan(0.85);
      expect(result.meetsRequirements).toBe(true);
      expect(result.overallSuccess).toBe(true);

      // Verify project analysis correctly identified file types
      expect(result.summary.originalFiles.cypress).toBe(4); // 4 .cy.ts files
      expect(result.summary.originalFiles.angular).toBe(2); // 2 Angular component tests
      expect(result.summary.originalFiles.playwright).toBe(1); // 1 existing Playwright test

      // Verify selective conversion preserved correct files
      expect(result.summary.conversionOutcome.converted).toBe(4); // All Cypress files converted
      expect(result.summary.conversionOutcome.preserved).toBe(3); // Angular + Playwright preserved

      // Verify validation passed
      expect(result.validationResult?.overallSuccess).toBe(true);
      expect(result.validationResult?.qualityMetrics.meetsQualityThreshold).toBe(true);

      // Verify system meets all criteria
      expect(systemValidation.meetsQualityCriteria).toBe(true);
      expect(systemValidation.meetsPerformanceCriteria).toBe(true);
      expect(systemValidation.issues).toHaveLength(0);

      // Verify comprehensive report was generated
      expect(result.reportPath).toBeDefined();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        result.reportPath,
        expect.stringContaining('"overallSuccess": true')
      );
    });

    test('should handle large-scale project (1000+ files) within performance criteria', async () => {
      // Generate large project structure
      const largeProjectFiles = new Map<string, string>();

      // 300 Angular component tests
      for (let i = 0; i < 300; i++) {
        largeProjectFiles.set(
          `src/app/feature${i}/component${i}.spec.ts`,
          `import { ComponentFixture, TestBed } from '@angular/core/testing';`
        );
      }

      // 600 Cypress e2e tests
      for (let i = 0; i < 600; i++) {
        largeProjectFiles.set(
          `e2e/feature${i}.cy.ts`,
          `describe('Feature ${i}', () => { it('works', () => { cy.visit('/'); }); });`
        );
      }

      // 100 existing Playwright tests
      for (let i = 0; i < 100; i++) {
        largeProjectFiles.set(
          `tests/existing${i}.spec.ts`,
          `import { test } from '@playwright/test'; test('test ${i}', async () => {});`
        );
      }

      // Mock large-scale file operations
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

      // Mock fast operations for performance testing
      const mockExec = require('child_process').exec;
      mockExec.mockImplementation((command: string, callback: Function) => {
        setTimeout(() => callback(null, 'Success', ''), 5); // Very fast responses
      });

      const startTime = Date.now();

      // Execute large-scale conversion
      const result = await orchestrator.convertMixedProject(testProjectPath, outputPath, {
        batchSize: 50,
        parallel: true,
        validateQuality: true
      });

      const totalDuration = Date.now() - startTime;

      // Validate large-scale performance
      expect(result.summary.originalFiles.total).toBe(1000);
      expect(totalDuration).toBeLessThan(120000); // Under 2 minutes
      expect(result.performanceMetrics.totalTime).toBeLessThan(120000);

      // Validate system handles large scale
      const systemValidation = await orchestrator.validateSystemRequirements(result);
      expect(systemValidation.meetsScalabilityCriteria).toBe(true);
      expect(systemValidation.meetsPerformanceCriteria).toBe(true);

      // Verify conversion quality maintained at scale
      expect(result.qualityScore).toBeGreaterThan(0.85);
      expect(result.summary.conversionOutcome.converted).toBe(600); // All Cypress files
      expect(result.summary.conversionOutcome.preserved).toBe(400); // Angular + Playwright
    });

    test('should provide comprehensive error reporting and recovery guidance', async () => {
      // Mock project with various error scenarios
      const problematicProject = {
        'broken-syntax.cy.ts': `
          describe('Broken Test', () => {
            it('has syntax errors', () => {
              cy.visit('/');
              invalid syntax here!!!
            });
          });
        `,
        'missing-imports.cy.ts': `
          describe('Missing Imports', () => {
            it('uses undefined functions', () => {
              undefinedFunction();
              cy.visit('/');
            });
          });
        `,
        'complex-conversion.cy.ts': `
          describe('Complex Patterns', () => {
            it('has very complex patterns', () => {
              cy.then(() => {
                cy.then(() => {
                  cy.wait('@alias').then(() => {
                    // Deeply nested patterns
                  });
                });
              });
            });
          });
        `,
        'valid-test.cy.ts': `
          describe('Valid Test', () => {
            it('should work fine', () => {
              cy.visit('/');
              cy.get('.button').click();
            });
          });
        `
      };

      mockFs.readdir.mockResolvedValue(Object.keys(problematicProject));
      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        const fileName = path.basename(filePath.toString());
        return problematicProject[fileName as keyof typeof problematicProject] || '';
      });

      mockFs.ensureDir.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      // Mock compilation errors for problematic files
      const mockExec = require('child_process').exec;
      mockExec.mockImplementation((command: string, callback: Function) => {
        if (command.includes('tsc')) {
          const errors = `
            broken-syntax.spec.ts(4,15): error TS1005: ';' expected.
            missing-imports.spec.ts(3,7): error TS2304: Cannot find name 'undefinedFunction'.
          `;
          callback(new Error('Compilation failed'), '', errors);
        } else {
          callback(null, 'Success', '');
        }
      });

      const result = await orchestrator.convertMixedProject(testProjectPath, outputPath, {
        validateQuality: true,
        generateReport: true
      });

      // Verify error reporting
      expect(result.overallSuccess).toBe(false); // Should fail due to errors
      expect(result.conversionResult.failedConversions).toBeGreaterThan(0);
      expect(result.validationResult?.overallSuccess).toBe(false);

      // Verify comprehensive error analysis
      expect(result.recommendations).toContain(
        expect.stringMatching(/Review failed conversions/)
      );
      expect(result.recommendations).toContain(
        expect.stringMatching(/Validation failures detected/)
      );

      // Verify detailed error categorization in validation
      expect(result.validationResult?.qualityMetrics.errorCategories).toBeDefined();
      expect(result.validationResult?.qualityMetrics.totalErrors).toBeGreaterThan(0);

      // Verify report includes error details
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('conversion-report.json'),
        expect.stringMatching(/"errors":\s*\[/)
      );
    });

    test('should demonstrate all major conversion features working together', async () => {
      // Comprehensive project testing all conversion engines
      const comprehensiveProject = {
        // Import deduplication test
        'import-issues.cy.ts': `
          import { test, expect } from '@playwright/test';
          import { test, expect } from '@playwright/test'; // Duplicate import
          import { ComponentFixture } from '@angular/core/testing'; // Should be removed

          describe('Import Issues', () => {
            it('tests import deduplication', () => {
              cy.visit('/');
            });
          });
        `,

        // Page object conversion test
        'page-object-test.cy.ts': `
          import { LoginPage } from '../pages/login-page';

          describe('Page Object Test', () => {
            const loginPage = new LoginPage();

            it('uses page objects', () => {
              loginPage.visit();
              loginPage.fillEmail('test@example.com');
              loginPage.clickSubmit();
            });
          });
        `,

        // Complex pattern conversion test
        'complex-patterns.cy.ts': `
          describe('Complex Patterns', () => {
            it('uses cy.then and cy.wait', () => {
              cy.intercept('GET', '/api/data').as('getData');
              cy.visit('/page');
              cy.wait('@getData').then((interception) => {
                expect(interception.response.statusCode).to.eq(200);
                cy.get('.result').should('be.visible');
              });
            });
          });
        `,

        // API mocking test
        'api-mocking.cy.ts': `
          describe('API Mocking', () => {
            beforeEach(() => {
              cy.intercept('POST', '/api/submit', { statusCode: 201 }).as('submit');
            });

            it('mocks API calls', () => {
              cy.visit('/form');
              cy.get('#submit').click();
              cy.wait('@submit');
            });
          });
        `,

        // Page object file
        'pages/login-page.ts': `
          export class LoginPage {
            visit() {
              cy.visit('/login');
            }

            fillEmail(email) {
              cy.get('#email').type(email);
            }

            clickSubmit() {
              cy.get('#submit').click();
            }
          }
        `,

        // Angular component (should be preserved)
        'component.spec.ts': `
          import { ComponentFixture, TestBed } from '@angular/core/testing';
          describe('Component', () => {
            it('should work', () => expect(true).toBe(true));
          });
        `
      };

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        if (dirPath.toString().includes('pages')) {
          return ['login-page.ts'];
        }
        return Object.keys(comprehensiveProject);
      });

      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        const fileName = path.basename(filePath.toString());
        return comprehensiveProject[fileName as keyof typeof comprehensiveProject] || '';
      });

      mockFs.ensureDir.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();
      mockFs.copy.mockResolvedValue();

      const mockExec = require('child_process').exec;
      mockExec.mockImplementation((command: string, callback: Function) => {
        callback(null, 'Success', '');
      });

      const result = await orchestrator.convertMixedProject(testProjectPath, outputPath, {
        validateQuality: true,
        generateReport: true
      });

      // Verify all conversion engines worked
      expect(result.overallSuccess).toBe(true);
      expect(result.qualityScore).toBeGreaterThan(0.85);

      // Verify import deduplication
      expect(result.conversionResult.successfulConversions).toBeGreaterThan(0);

      // Verify page object conversion
      expect(result.projectAnalysis.conversionCandidates).toContain(
        expect.stringMatching(/page-object-test\.cy\.ts/)
      );

      // Verify validation passed
      expect(result.validationResult?.overallSuccess).toBe(true);

      // Verify comprehensive report
      expect(result.reportPath).toBeDefined();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        result.reportPath,
        expect.stringContaining('"conversion_results"')
      );
    });
  });
});