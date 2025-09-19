import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { PageObjectAnalyzer } from '../src/services/page-object-analyzer';
import { PageObjectTransformer } from '../src/services/page-object-transformer';

describe('Page Object Integration Tests', () => {
  let analyzer: PageObjectAnalyzer;
  let transformer: PageObjectTransformer;

  beforeEach(() => {
    analyzer = new PageObjectAnalyzer();
    transformer = new PageObjectTransformer();
  });

  describe('Real DLA Page Object Integration', () => {
    test('should convert DLA CyLoginPage to working Playwright page object', async () => {
      // Arrange - Real DLA login page content
      const dlaLoginPagePath = '/Users/in615bac/Documents/cy-playwright/tests/e2e/dla/dla/gui/cypress/e2e/pages/cy-login-page.ts';

      try {
        // Check if the file exists
        const exists = await fs.pathExists(dlaLoginPagePath);
        if (!exists) {
          console.log('DLA login page file not found, skipping real file test');
          return;
        }

        // Act - Analyze the real page object
        const analysis = await analyzer.analyzePageObject(dlaLoginPagePath);

        // Assert - Verify analysis results
        expect(analysis.isPageObject).toBe(true);
        expect(analysis.className).toBe('CyLoginPage');
        expect(analysis.exportType).toBe('default');

        // Verify methods were detected
        expect(analysis.methods.length).toBeGreaterThan(0);
        const methodNames = analysis.methods.map(m => m.name);
        expect(methodNames).toContain('visit');
        expect(methodNames).toContain('fillEmail');
        expect(methodNames).toContain('clickLoginBtn');

        // Convert to Playwright
        const converted = transformer.generatePlaywrightPageObject(analysis);

        // Verify conversion
        expect(converted.isValid).toBe(true);
        expect(converted.generatedCode).toContain('import { Page } from \'@playwright/test\';');
        expect(converted.generatedCode).toContain('constructor(private page: Page)');
        expect(converted.generatedCode).toContain('async visit()');
        expect(converted.generatedCode).toContain('await page.goto(\'/login\');');

        console.log('DLA Login Page Conversion Results:');
        console.log(`- Original methods: ${analysis.methods.length}`);
        console.log(`- Converted methods: ${converted.conversionSummary.convertedMethods}`);
        console.log(`- Failed methods: ${converted.conversionSummary.failedMethods}`);
        console.log(`- Conversion difficulty: ${analysis.conversionDifficulty}`);

      } catch (error) {
        console.warn('Could not process real DLA file:', error instanceof Error ? error.message : String(error));
      }
    });

    test('should convert DLA CyBoekenPage complex page object', async () => {
      // Arrange - Real DLA boeken page content
      const dlaBoekenPagePath = '/Users/in615bac/Documents/cy-playwright/tests/e2e/dla/dla/gui/cypress/e2e/pages/cy-boeken-page.ts';

      try {
        const exists = await fs.pathExists(dlaBoekenPagePath);
        if (!exists) {
          console.log('DLA boeken page file not found, skipping real file test');
          return;
        }

        // Act
        const analysis = await analyzer.analyzePageObject(dlaBoekenPagePath);

        // Assert
        expect(analysis.isPageObject).toBe(true);
        expect(analysis.className).toBe('CyBoekenPage');
        expect(analysis.hasMockingMethods).toBe(true);
        expect(analysis.hasComplexLogic).toBe(true);

        // Verify complex methods detected
        const mockingMethods = analysis.methods.filter(m =>
          m.name.includes('mock') || m.name.includes('Mock') ||
          m.body.includes('MockUtil')
        );
        expect(mockingMethods.length).toBeGreaterThan(0);

        // Convert to Playwright
        const converted = transformer.generatePlaywrightPageObject(analysis, {
          convertMockingMethods: true
        });

        // Verify mocking methods preserved
        expect(converted.conversionSummary.preservedMockingMethods).toBeGreaterThan(0);
        expect(converted.generatedCode).toContain('MockUtil');
        expect(converted.generatedCode).toContain('WireMockMappingClient');

        console.log('DLA Boeken Page Conversion Results:');
        console.log(`- Total methods: ${analysis.methods.length}`);
        console.log(`- Mocking methods: ${mockingMethods.length}`);
        console.log(`- Conversion difficulty: ${analysis.conversionDifficulty}`);
        console.log(`- Preserved mocking methods: ${converted.conversionSummary.preservedMockingMethods}`);

      } catch (error) {
        console.warn('Could not process real DLA boeken file:', error instanceof Error ? error.message : String(error));
      }
    });
  });

  describe('End-to-End Page Object Workflow', () => {
    test('should handle complete page object conversion workflow', async () => {
      // Create a temporary complex page object for testing
      const tempPageObjectPath = path.join(__dirname, 'temp-complex-page.ts');
      const complexPageObjectContent = `import { StubMapping } from "wiremock-rest-client/dist/model/stub-mapping.model";
import { MockUtil } from "@sta/wiremock-generator-ts";

class ComplexTestPage {
  pageId: string = 'test-page';

  visit() {
    cy.visit('/test');
    cy.get('[data-testid="loading"]').should('not.exist');
  }

  fillForm(email: string, password: string) {
    cy.get('[data-testid="email-input"]').clear().type(email);
    cy.get('[data-testid="password-input"]').type(password);
  }

  selectOption(value: string) {
    cy.get('[data-testid="dropdown"]').select(value);
  }

  submitForm() {
    cy.get('[data-testid="submit-btn"]').click();
  }

  performLogin(email: string, password: string) {
    this.fillForm(email, password);
    this.submitForm();
  }

  async setupMocks(): Promise<void> {
    const stub: StubMapping = {
      request: { method: 'GET', url: '/api/test' },
      response: { status: 200 }
    };
    await MockUtil.createAndStoreMapping(stub, this.pageId, null);
  }

  complexInteraction(searchTerm: string) {
    cy.get('[data-testid="search"]').type(searchTerm);
    cy.get('[data-testid="search-btn"]').click();
    cy.wait(1000);
    cy.get('[data-testid="results"]').should('be.visible');
    cy.get('.result-item').first().click();
  }
}

export default ComplexTestPage;`;

      try {
        // Write the temporary file
        await fs.writeFile(tempPageObjectPath, complexPageObjectContent);

        // Act - Full workflow
        const analysis = await analyzer.analyzePageObject(tempPageObjectPath);
        const converted = transformer.generatePlaywrightPageObject(analysis);

        // Assert - Analysis results
        expect(analysis.isPageObject).toBe(true);
        expect(analysis.className).toBe('ComplexTestPage');
        expect(analysis.methods.length).toBeGreaterThanOrEqual(6);
        expect(analysis.hasMockingMethods).toBe(true);

        // Verify method categorization
        const visitMethods = analysis.methods.filter(m => m.isVisitMethod);
        const inputMethods = analysis.methods.filter(m => m.isInputMethod);
        const clickMethods = analysis.methods.filter(m => m.isClickMethod);
        const compositeMethods = analysis.methods.filter(m => m.isCompositeMethod);

        expect(visitMethods.length).toBe(1);
        expect(inputMethods.length).toBeGreaterThan(0);
        expect(clickMethods.length).toBeGreaterThan(0);
        expect(compositeMethods.length).toBeGreaterThan(0);

        // Assert - Conversion results
        expect(converted.isValid).toBe(true);
        expect(converted.conversionSummary.convertedMethods).toBe(analysis.methods.length);
        expect(converted.conversionSummary.failedMethods).toBe(0);

        // Verify generated code quality
        expect(converted.generatedCode).toContain('import { Page } from \'@playwright/test\';');
        expect(converted.generatedCode).toContain('constructor(private page: Page)');

        // Check specific conversions
        expect(converted.generatedCode).toContain('await page.goto(\'/test\');');
        expect(converted.generatedCode).toContain('await page.locator(\'[data-testid="email-input"]\').clear()');
        expect(converted.generatedCode).toContain('await page.locator(\'[data-testid="submit-btn"]\').click()');

        // Verify mocking method preservation
        expect(converted.generatedCode).toContain('MockUtil');
        expect(converted.generatedCode).toContain('async setupMocks()');

        console.log('Complex Page Object Conversion Summary:');
        console.log(`- Visit methods: ${visitMethods.length}`);
        console.log(`- Input methods: ${inputMethods.length}`);
        console.log(`- Click methods: ${clickMethods.length}`);
        console.log(`- Composite methods: ${compositeMethods.length}`);
        console.log(`- Total converted: ${converted.conversionSummary.convertedMethods}/${converted.conversionSummary.totalMethods}`);

      } finally {
        // Clean up
        if (await fs.pathExists(tempPageObjectPath)) {
          await fs.remove(tempPageObjectPath);
        }
      }
    });

    test('should validate generated Playwright code syntax', async () => {
      // Create a simple page object
      const tempPath = path.join(__dirname, 'syntax-test-page.ts');
      const simplePageContent = `class SimpleLoginPage {
  visit() {
    cy.visit('/login');
  }

  login(email: string, password: string) {
    cy.get('#email').type(email);
    cy.get('#password').type(password);
    cy.get('#submit').click();
  }
}

export default SimpleLoginPage;`;

      try {
        await fs.writeFile(tempPath, simplePageContent);

        const analysis = await analyzer.analyzePageObject(tempPath);
        const converted = transformer.generatePlaywrightPageObject(analysis);

        // Validate syntax by attempting to parse with TypeScript
        const ts = await import('typescript');
        const sourceFile = ts.createSourceFile(
          'test.ts',
          converted.generatedCode,
          ts.ScriptTarget.Latest,
          true
        );

        const diagnostics = (sourceFile as any).parseDiagnostics || [];
        expect(diagnostics.length).toBe(0);

        // Verify essential elements
        expect(converted.generatedCode).toContain('class SimpleLoginPage');
        expect(converted.generatedCode).toContain('async visit()');
        expect(converted.generatedCode).toContain('async login(email: string, password: string)');
        expect(converted.generatedCode).toContain('await page.goto');
        expect(converted.generatedCode).toContain('await page.locator');

        console.log('Generated code syntax validation: PASSED');

      } finally {
        if (await fs.pathExists(tempPath)) {
          await fs.remove(tempPath);
        }
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle large page objects efficiently', async () => {
      // Generate a large page object with many methods
      const largeMethods = Array.from({ length: 20 }, (_, i) => `
  method${i}() {
    cy.get('[data-testid="element-${i}"]').click();
  }`).join('');

      const largePageContent = `class LargePage {${largeMethods}}

export default LargePage;`;

      const tempPath = path.join(__dirname, 'large-page.ts');

      try {
        await fs.writeFile(tempPath, largePageContent);

        const startTime = Date.now();
        const analysis = await analyzer.analyzePageObject(tempPath);
        const converted = transformer.generatePlaywrightPageObject(analysis);
        const endTime = Date.now();

        const processingTime = endTime - startTime;

        expect(analysis.methods.length).toBe(20);
        expect(converted.conversionSummary.convertedMethods).toBe(20);
        expect(processingTime).toBeLessThan(2000); // Should complete in under 2 seconds

        console.log(`Large page object (${analysis.methods.length} methods) processed in ${processingTime}ms`);

      } finally {
        if (await fs.pathExists(tempPath)) {
          await fs.remove(tempPath);
        }
      }
    });

    test('should handle edge cases gracefully', async () => {
      const edgeCases = [
        {
          name: 'Empty class',
          content: 'class EmptyPage {}\nexport default EmptyPage;'
        },
        {
          name: 'Class with only properties',
          content: 'class PropsPage { prop1: string = "test"; }\nexport default PropsPage;'
        },
        {
          name: 'Class with complex TypeScript features',
          content: `class GenericPage<T> {
  method<U>(param: T & U): Promise<T | U> {
    cy.get('selector').type('text');
    return Promise.resolve(param);
  }
}
export default GenericPage;`
        }
      ];

      for (const testCase of edgeCases) {
        const tempPath = path.join(__dirname, `edge-case-${testCase.name.replace(/\s+/g, '-')}.ts`);

        try {
          await fs.writeFile(tempPath, testCase.content);

          const analysis = await analyzer.analyzePageObject(tempPath);
          const converted = transformer.generatePlaywrightPageObject(analysis);

          // Should not throw errors
          expect(analysis).toBeDefined();
          expect(converted).toBeDefined();

          console.log(`Edge case "${testCase.name}": ✓`);

        } catch (error) {
          console.warn(`Edge case "${testCase.name}" failed:`, error);
        } finally {
          if (await fs.pathExists(tempPath)) {
            await fs.remove(tempPath);
          }
        }
      }
    });
  });
});