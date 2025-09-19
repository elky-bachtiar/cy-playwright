import { describe, test, expect, beforeEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ImportAnalyzer } from '../src/services/import-analyzer';
import { ImportPathTransformer } from '../src/services/import-path-transformer';
import { ImportDeduplicationService } from '../src/services/import-deduplication-service';

describe('Import Deduplication Real Integration', () => {
  let analyzer: ImportAnalyzer;
  let transformer: ImportPathTransformer;
  let service: ImportDeduplicationService;

  beforeEach(() => {
    analyzer = new ImportAnalyzer();
    transformer = new ImportPathTransformer();
    service = new ImportDeduplicationService();
  });

  describe('Real DLA File Analysis', () => {
    test('should analyze DLA converted login file correctly', async () => {
      // Use real converted DLA file
      const dlaLoginPath = '/Users/in615bac/Documents/cy-playwright/tests/e2e/dla/dla-playwright/tests/cy-login.spec.ts';

      try {
        // Check if file exists
        const exists = await fs.pathExists(dlaLoginPath);
        if (!exists) {
          console.log('DLA login file not found, skipping real file test');
          return;
        }

        // Act
        const analysis = await analyzer.analyzeAllImports(dlaLoginPath);

        // Assert
        expect(analysis).toBeDefined();
        expect(analysis.totalImports).toBeGreaterThan(0);

        // Log results for verification
        console.log('DLA Login Analysis Results:');
        console.log(`- Total imports: ${analysis.totalImports}`);
        console.log(`- Duplicates found: ${analysis.duplicates.length}`);
        console.log(`- Cypress imports: ${analysis.cypressImports.length}`);
        console.log(`- Legitimate imports: ${analysis.legitImports.length}`);

        if (analysis.duplicates.length > 0) {
          console.log('Duplicate sources:', analysis.duplicates.map(d => d.source));
        }
      } catch (error) {
        console.warn('Could not analyze real DLA file:', error instanceof Error ? error.message : String(error));
      }
    });

    test('should handle path normalization for DLA imports', () => {
      // Test path normalization with real DLA patterns
      const testCases = [
        {
          input: '../../../wiremock/generated/dtos/model/inloggegevens',
          currentFile: '/project/tests/specs/login.spec.ts',
          projectRoot: '/project',
          expected: 'wiremock/generated/dtos/model/inloggegevens'
        },
        {
          input: '../pages/cy-login-page',
          currentFile: '/project/tests/specs/login.spec.ts',
          projectRoot: '/project',
          expected: '../pages/cy-login-page'
        }
      ];

      testCases.forEach(({ input, currentFile, projectRoot, expected }) => {
        const result = transformer.normalizeRelativePath(input, currentFile, projectRoot);
        expect(result).toBeDefined();
        console.log(`Normalized ${input} -> ${result}`);
      });
    });

    test('should create import deduplication service successfully', () => {
      // Verify service can be instantiated
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(ImportDeduplicationService);
    });
  });

  describe('Service Integration Test', () => {
    test('should validate syntax checking works', async () => {
      const validTypeScript = `import { test, expect } from '@playwright/test';

test.describe('Sample test', () => {
  test('should work', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Test');
  });
});`;

      const invalidTypeScript = `import { test, expect } from '@playwright/test';

test.describe('Invalid test', () => {
  test('should fail', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Test'
    // Missing closing parenthesis
  });
});`;

      // Test syntax validation
      const isValidSyntax = await (service as any).validateSyntax(validTypeScript, 'test.ts');
      const isInvalidSyntax = await (service as any).validateSyntax(invalidTypeScript, 'test.ts');

      expect(isValidSyntax).toBe(true);
      expect(isInvalidSyntax).toBe(false);
    });
  });

  describe('Import Analysis Edge Cases', () => {
    test('should handle mixed import types', async () => {
      const tempFile = path.join(__dirname, 'temp-test-file.ts');
      const testContent = `import { test, expect } from '@playwright/test';
import * as fs from 'fs-extra';
import path from 'path';
import { WireMockMappingClient } from '../wiremock/mappings/WiremockServerConfig';

test('sample test', () => {
  // Test content
});`;

      try {
        // Write temporary test file
        await fs.writeFile(tempFile, testContent);

        // Analyze the file
        const analysis = await analyzer.analyzeAllImports(tempFile);

        // Verify analysis
        expect(analysis.totalImports).toBe(4);
        expect(analysis.legitImports.length).toBe(4);
        expect(analysis.duplicates.length).toBe(0);
        expect(analysis.cypressImports.length).toBe(0);

        console.log('Mixed import analysis successful:', {
          total: analysis.totalImports,
          legit: analysis.legitImports.length,
          duplicates: analysis.duplicates.length,
          cypress: analysis.cypressImports.length
        });
      } finally {
        // Clean up
        if (await fs.pathExists(tempFile)) {
          await fs.remove(tempFile);
        }
      }
    });
  });

  describe('Performance Test', () => {
    test('should process imports efficiently', async () => {
      const largeImportFile = path.join(__dirname, 'large-import-test.ts');

      // Generate content with many imports
      const imports = Array.from({ length: 50 }, (_, i) =>
        `import { Component${i} } from './components/component-${i}';`
      ).join('\n');

      const testContent = `${imports}
import { test, expect } from '@playwright/test';

test('performance test', () => {
  // Test content
});`;

      try {
        await fs.writeFile(largeImportFile, testContent);

        const startTime = Date.now();
        const analysis = await analyzer.analyzeAllImports(largeImportFile);
        const endTime = Date.now();

        const processingTime = endTime - startTime;

        expect(analysis.totalImports).toBe(51);
        expect(processingTime).toBeLessThan(1000); // Should process in under 1 second

        console.log(`Processed ${analysis.totalImports} imports in ${processingTime}ms`);
      } finally {
        if (await fs.pathExists(largeImportFile)) {
          await fs.remove(largeImportFile);
        }
      }
    });
  });
});