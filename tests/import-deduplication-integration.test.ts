import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ImportDeduplicationService } from '../src/services/import-deduplication-service';

// Mock file system operations
jest.mock('fs-extra', () => ({
  readdir: jest.fn(),
  stat: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  ensureDir: jest.fn(),
  pathExists: jest.fn()
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ImportDeduplicationService Integration', () => {
  let service: ImportDeduplicationService;
  const testProjectPath = '/test/project';
  const dlaTestPath = '/Users/in615bac/Documents/cy-playwright/tests/e2e/dla/dla-playwright/tests';

  beforeEach(() => {
    service = new ImportDeduplicationService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('DLA Project Integration Tests', () => {
    test('should handle DLA login test duplicate imports', async () => {
      // Arrange - Real DLA problem case
      const dlaLoginContent = `import { test, expect } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { Inloggegevens } from '../../../wiremock/generated/dtos/model/inloggegevens';
import { StubMapping } from 'wiremock-rest-client/dist/model/stub-mapping.model';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WireMockMappingClient } from '../../../wiremock/generated/mappings/WiremockServerConfig';

test.describe('Login en mock', () => {
  test('Should process the login correctly', async ({ page }) => {
    // Test implementation
  });
});`;

      const expectedCleanedContent = `import { test, expect } from '@playwright/test';
import { Inloggegevens } from '../wiremock/generated/dtos/model/inloggegevens';
import { StubMapping } from 'wiremock-rest-client/dist/model/stub-mapping.model';
import { WireMockMappingClient } from '../wiremock/generated/mappings/WiremockServerConfig';

test.describe('Login en mock', () => {
  test('Should process the login correctly', async ({ page }) => {
    // Test implementation
  });
});`;

      mockFs.readFile.mockResolvedValue(dlaLoginContent);

      // Act
      const result = await service.deduplicateFile(
        `${dlaTestPath}/cy-login.spec.ts`,
        { projectRoot: testProjectPath }
      );

      // Assert
      expect(result.duplicatesResolved).toBe(1); // Playwright duplicates
      expect(result.removedImports).toContain('@angular/core/testing'); // Angular imports removed
      expect(result.syntaxValid).toBe(true);
      expect(result.pathMappings).toHaveProperty('../../../wiremock/generated/dtos/model/inloggegevens');
    });

    test('should handle DLA filter-sorteer-boeken duplicate imports', async () => {
      // Arrange - Another real DLA problem case
      const dlaFilterContent = `import { test, expect } from '@playwright/test';
import { expect, Request, test } from '@playwright/test';
import { BoekenPage } from '../pages/boeken-page';

test('Filteren op categorie levert de juiste call naar de backend', async ({ page }) => {
  // Test implementation
});`;

      mockFs.readFile.mockResolvedValue(dlaFilterContent);

      // Act
      const result = await service.deduplicateFile(
        `${dlaTestPath}/filter-sorteer-boeken.spec.ts`,
        { projectRoot: testProjectPath }
      );

      // Assert
      expect(result.duplicatesResolved).toBe(1); // Playwright duplicates
      expect(result.removedImports).toHaveLength(0); // No Angular imports to remove
      expect(result.syntaxValid).toBe(true);

      // Verify the cleaned content has merged imports
      expect(result.cleanedContent).toContain('import { test, expect, Request } from \'@playwright/test\'');
    });

    test('should handle complex DLA project with multiple issues', async () => {
      // Arrange - Complex scenario with multiple files
      const testFiles = [
        `${dlaTestPath}/cy-login.spec.ts`,
        `${dlaTestPath}/cy-boeken.spec.ts`,
        `${dlaTestPath}/filter-sorteer-boeken.spec.ts`
      ];

      const fileContents = [
        // cy-login.spec.ts with duplicates and Angular imports
        `import { test, expect } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { ComponentFixture } from '@angular/core/testing';
import { WireMockMappingClient } from '../../../wiremock/mappings/WiremockServerConfig';`,

        // cy-boeken.spec.ts with custom commands
        `import { test, expect } from '@playwright/test';
import CyBoekenPage from '../pages/cy-boeken-page';`,

        // filter-sorteer-boeken.spec.ts with Request duplicate
        `import { test, expect } from '@playwright/test';
import { expect, Request, test } from '@playwright/test';
import { BoekenPage } from '../pages/boeken-page';`
      ];

      // Mock directory scanning
      mockFs.readdir.mockImplementation(async (dir: string) => {
        if (dir === testProjectPath) {
          return ['cy-login.spec.ts', 'cy-boeken.spec.ts', 'filter-sorteer-boeken.spec.ts'] as any;
        }
        return [] as any;
      });

      mockFs.stat.mockImplementation(async (filePath: string) => {
        return { isDirectory: () => false, isFile: () => true } as any;
      });

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        const fileName = path.basename(filePath as string);
        const index = testFiles.findIndex(f => f.endsWith(fileName));
        return fileContents[index] || '';
      });

      // Act
      const results = await service.deduplicateProject(testProjectPath, {
        projectRoot: testProjectPath,
        generateReport: true
      });

      // Assert
      expect(results).toHaveLength(3);

      // Check individual file results
      const loginResult = results.find(r => r.originalFile.includes('cy-login'));
      expect(loginResult?.duplicatesResolved).toBe(1);
      expect(loginResult?.removedImports).toContain('@angular/core/testing');

      const filterResult = results.find(r => r.originalFile.includes('filter-sorteer'));
      expect(filterResult?.duplicatesResolved).toBe(1);

      // Verify overall success
      const successfulFiles = results.filter(r => r.syntaxValid).length;
      const successRate = (successfulFiles / results.length) * 100;
      expect(successRate).toBeGreaterThanOrEqual(85); // Meet our success criteria
    });
  });

  describe('DLA Validation Tests', () => {
    test('should validate DLA conversion meets 85% success rate', async () => {
      // Arrange - Mock successful conversion scenario
      const mockSuccessfulResults = Array.from({ length: 10 }, (_, i) => ({
        originalFile: `/test/file${i}.spec.ts`,
        cleanedContent: 'cleaned content',
        analysis: { duplicates: [{ source: '@playwright/test', imports: [] }], cypressImports: [], legitImports: [], totalImports: 1 },
        pathMappings: {},
        removedImports: [],
        duplicatesResolved: 1,
        syntaxValid: true,
        errors: []
      }));

      // Mock file system for project scanning
      mockFs.readdir.mockResolvedValue(['file0.spec.ts'] as any);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.readFile.mockResolvedValue('import { test } from "@playwright/test";');

      // Mock the deduplicateProject to return our mock results
      jest.spyOn(service, 'deduplicateProject').mockResolvedValue(mockSuccessfulResults);

      // Act
      const isValid = await service.validateDlaConversion(dlaTestPath);

      // Assert
      expect(isValid).toBe(true);
    });

    test('should fail validation when success rate is below 85%', async () => {
      // Arrange - Mock scenario with many failures
      const mockResults = [
        ...Array.from({ length: 5 }, (_, i) => ({
          originalFile: `/test/success${i}.spec.ts`,
          cleanedContent: 'cleaned content',
          analysis: { duplicates: [], cypressImports: [], legitImports: [], totalImports: 0 },
          pathMappings: {},
          removedImports: [],
          duplicatesResolved: 0,
          syntaxValid: true,
          errors: []
        })),
        ...Array.from({ length: 7 }, (_, i) => ({
          originalFile: `/test/failure${i}.spec.ts`,
          cleanedContent: '',
          analysis: { duplicates: [], cypressImports: [], legitImports: [], totalImports: 0 },
          pathMappings: {},
          removedImports: [],
          duplicatesResolved: 0,
          syntaxValid: false,
          errors: ['Syntax error']
        }))
      ];

      // Mock file system
      mockFs.readdir.mockResolvedValue(['test.spec.ts'] as any);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
      mockFs.readFile.mockResolvedValue('invalid syntax');

      // Mock the deduplicateProject to return our mock results (58% success rate)
      jest.spyOn(service, 'deduplicateProject').mockResolvedValue(mockResults);

      // Act
      const isValid = await service.validateDlaConversion(dlaTestPath);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle file read errors gracefully', async () => {
      // Arrange
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      // Act & Assert
      await expect(service.deduplicateFile('/non/existent/file.ts', {
        projectRoot: testProjectPath
      })).rejects.toThrow('File not found');
    });

    test('should continue processing other files when one file fails', async () => {
      // Arrange
      mockFs.readdir.mockResolvedValue(['good.spec.ts', 'bad.spec.ts'] as any);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if ((filePath as string).includes('bad.spec.ts')) {
          throw new Error('Bad file');
        }
        return 'import { test } from "@playwright/test";';
      });

      // Act
      const results = await service.deduplicateProject(testProjectPath, {
        projectRoot: testProjectPath
      });

      // Assert
      expect(results).toHaveLength(2);
      expect(results.find(r => r.originalFile.includes('good'))?.syntaxValid).toBe(true);
      expect(results.find(r => r.originalFile.includes('bad'))?.errors).toContain('Bad file');
    });
  });
});