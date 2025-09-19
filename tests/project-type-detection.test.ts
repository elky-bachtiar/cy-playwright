import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ProjectTypeAnalyzer } from '../src/services/project-type-analyzer';

// Mock file system operations
jest.mock('fs-extra', () => ({
  readdir: jest.fn(),
  stat: jest.fn(),
  readFile: jest.fn(),
  pathExists: jest.fn()
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ProjectTypeAnalyzer', () => {
  let analyzer: ProjectTypeAnalyzer;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    analyzer = new ProjectTypeAnalyzer();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detectProjectType', () => {
    test('should detect Angular component test files', async () => {
      const testFile = `
        import { ComponentFixture, TestBed } from '@angular/core/testing';
        import { Component } from '@angular/core';

        describe('MyComponent', () => {
          let component: MyComponent;
          let fixture: ComponentFixture<MyComponent>;

          beforeEach(() => {
            TestBed.configureTestingModule({
              declarations: [MyComponent]
            });
          });
        });
      `;

      mockFs.readFile.mockResolvedValue(testFile);
      mockFs.pathExists.mockResolvedValue(true);

      const result = await analyzer.detectProjectType('/test/component.spec.ts');

      expect(result.type).toBe('angular-unit');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.indicators).toContain('ComponentFixture');
      expect(result.indicators).toContain('TestBed');
    });

    test('should detect Cypress e2e test files', async () => {
      const testFile = `
        describe('User Login', () => {
          it('should login successfully', () => {
            cy.visit('/login');
            cy.get('[data-cy=username]').type('user@example.com');
            cy.get('[data-cy=password]').type('password123');
            cy.get('[data-cy=login-btn]').click();
            cy.url().should('include', '/dashboard');
          });
        });
      `;

      mockFs.readFile.mockResolvedValue(testFile);
      mockFs.pathExists.mockResolvedValue(true);

      const result = await analyzer.detectProjectType('/test/login.cy.ts');

      expect(result.type).toBe('cypress-e2e');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.indicators).toContain('cy.visit');
      expect(result.indicators).toContain('cy.get');
    });

    test('should detect existing Playwright test files', async () => {
      const testFile = `
        import { test, expect } from '@playwright/test';

        test('user login flow', async ({ page }) => {
          await page.goto('/login');
          await page.fill('#username', 'user@example.com');
          await page.fill('#password', 'password123');
          await page.click('button[type="submit"]');
          await expect(page).toHaveURL(/.*dashboard.*/);
        });
      `;

      mockFs.readFile.mockResolvedValue(testFile);
      mockFs.pathExists.mockResolvedValue(true);

      const result = await analyzer.detectProjectType('/test/login.spec.ts');

      expect(result.type).toBe('playwright');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.indicators).toContain('@playwright/test');
      expect(result.indicators).toContain('page.goto');
    });

    test('should detect mixed test files with both frameworks', async () => {
      const testFile = `
        import { test, expect } from '@playwright/test';

        describe('Legacy tests', () => {
          it('old cypress test', () => {
            cy.visit('/old-page');
          });
        });

        test('new playwright test', async ({ page }) => {
          await page.goto('/new-page');
        });
      `;

      mockFs.readFile.mockResolvedValue(testFile);
      mockFs.pathExists.mockResolvedValue(true);

      const result = await analyzer.detectProjectType('/test/mixed.spec.ts');

      expect(result.type).toBe('mixed');
      expect(result.indicators).toContain('@playwright/test');
      expect(result.indicators).toContain('cy.visit');
    });

    test('should handle files with imports but unclear test patterns', async () => {
      const testFile = `
        import { WireMockUtil } from '../utils/wiremock-util';
        import { DatabaseHelper } from '../helpers/database-helper';

        const mockData = {
          user: { id: 1, name: 'Test User' }
        };
      `;

      mockFs.readFile.mockResolvedValue(testFile);
      mockFs.pathExists.mockResolvedValue(true);

      const result = await analyzer.detectProjectType('/test/unclear.ts');

      expect(result.type).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });

    test('should handle TypeScript parsing errors gracefully', async () => {
      const invalidFile = `
        import { invalid syntax here
        describe('broken test', () => {
          // incomplete syntax
      `;

      mockFs.readFile.mockResolvedValue(invalidFile);
      mockFs.pathExists.mockResolvedValue(true);

      const result = await analyzer.detectProjectType('/test/broken.ts');

      expect(result.type).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.error).toBeDefined();
    });

    test('should handle non-existent files', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      const result = await analyzer.detectProjectType('/test/nonexistent.ts');

      expect(result.type).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.error).toBeDefined();
    });
  });

  describe('analyzeProject', () => {
    test('should analyze project structure and categorize all test files', async () => {
      const mockFiles = [
        'src/app/component.spec.ts',
        'e2e/login.cy.ts',
        'e2e/dashboard.cy.ts',
        'tests/api.spec.ts',
        'src/utils/helper.ts'
      ];

      const mockStats = {
        isDirectory: () => false,
        isFile: () => true
      };

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        if (dirPath === testProjectPath) return ['src', 'e2e', 'tests'];
        if (dirPath.includes('src')) return ['app', 'utils'];
        if (dirPath.includes('app')) return ['component.spec.ts'];
        if (dirPath.includes('utils')) return ['helper.ts'];
        if (dirPath.includes('e2e')) return ['login.cy.ts', 'dashboard.cy.ts'];
        if (dirPath.includes('tests')) return ['api.spec.ts'];
        return [];
      });

      mockFs.stat.mockResolvedValue(mockStats as any);
      mockFs.pathExists.mockResolvedValue(true);

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('component.spec.ts')) {
          return 'import { ComponentFixture, TestBed } from "@angular/core/testing";';
        }
        if (filePath.includes('.cy.ts')) {
          return 'describe("test", () => { it("should work", () => { cy.visit("/"); }); });';
        }
        if (filePath.includes('api.spec.ts')) {
          return 'import { test, expect } from "@playwright/test";';
        }
        return 'export const helper = {};';
      });

      const result = await analyzer.analyzeProject(testProjectPath);

      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.categorizedFiles['angular-unit']).toHaveLength(1);
      expect(result.categorizedFiles['cypress-e2e']).toHaveLength(2);
      expect(result.categorizedFiles['playwright']).toHaveLength(1);
      expect(result.conversionCandidates).toHaveLength(2); // Only Cypress e2e files
    });

    test('should identify conversion scope correctly', async () => {
      mockFs.readdir.mockResolvedValue(['test1.cy.ts', 'test2.spec.ts', 'component.spec.ts']);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.pathExists.mockResolvedValue(true);

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('test1.cy.ts')) {
          return 'cy.visit("/"); cy.get(".btn").click();';
        }
        if (filePath.includes('test2.spec.ts')) {
          return 'import { test } from "@playwright/test";';
        }
        if (filePath.includes('component.spec.ts')) {
          return 'import { ComponentFixture } from "@angular/core/testing";';
        }
        return '';
      });

      const result = await analyzer.analyzeProject(testProjectPath);

      expect(result.conversionScope).toEqual({
        shouldConvert: ['test1.cy.ts'],
        shouldPreserve: ['test2.spec.ts', 'component.spec.ts'],
        conflicts: []
      });
    });

    test('should detect file conflicts between frameworks', async () => {
      mockFs.readdir.mockResolvedValue(['login.cy.ts', 'login.spec.ts']);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.pathExists.mockResolvedValue(true);

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('.cy.ts')) {
          return 'cy.visit("/login");';
        }
        if (filePath.includes('.spec.ts')) {
          return 'import { test } from "@playwright/test";';
        }
        return '';
      });

      const result = await analyzer.analyzeProject(testProjectPath);

      expect(result.conversionScope.conflicts).toHaveLength(1);
      expect(result.conversionScope.conflicts[0]).toEqual({
        cypressFile: 'login.cy.ts',
        playwrightFile: 'login.spec.ts',
        recommendation: 'rename'
      });
    });

    test('should handle large projects efficiently', async () => {
      const manyFiles = Array.from({ length: 500 }, (_, i) => `test${i}.cy.ts`);

      mockFs.readdir.mockResolvedValue(manyFiles);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue('cy.visit("/");');

      const startTime = Date.now();
      const result = await analyzer.analyzeProject(testProjectPath);
      const duration = Date.now() - startTime;

      expect(result.totalFiles).toBe(500);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.performanceMetrics.analysisTime).toBeDefined();
    });
  });

  describe('getFileCategory', () => {
    test('should categorize files based on extensions and patterns', () => {
      expect(analyzer.getFileCategory('test.cy.ts')).toBe('potential-cypress');
      expect(analyzer.getFileCategory('test.spec.ts')).toBe('potential-test');
      expect(analyzer.getFileCategory('component.component.spec.ts')).toBe('potential-angular');
      expect(analyzer.getFileCategory('e2e/test.ts')).toBe('potential-e2e');
      expect(analyzer.getFileCategory('utils/helper.ts')).toBe('support');
    });
  });

  describe('detectFrameworkUsage', () => {
    test('should detect framework-specific patterns in code', () => {
      const cypressCode = 'cy.visit("/"); cy.get(".btn").should("be.visible");';
      const playwrightCode = 'await page.goto("/"); await expect(page.locator(".btn")).toBeVisible();';
      const angularCode = 'TestBed.configureTestingModule({ declarations: [Component] });';

      expect(analyzer.detectFrameworkUsage(cypressCode)).toEqual({
        cypress: true,
        playwright: false,
        angular: false
      });

      expect(analyzer.detectFrameworkUsage(playwrightCode)).toEqual({
        cypress: false,
        playwright: true,
        angular: false
      });

      expect(analyzer.detectFrameworkUsage(angularCode)).toEqual({
        cypress: false,
        playwright: false,
        angular: true
      });
    });
  });
});