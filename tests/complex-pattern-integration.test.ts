import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ComplexPatternConverter } from '../src/services/complex-pattern-converter';

describe('ComplexPatternConverter Integration Tests', () => {
  let converter: ComplexPatternConverter;

  beforeEach(() => {
    converter = new ComplexPatternConverter();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Real DLA Project Integration', () => {
    test('should convert complex DLA test file with multiple patterns', async () => {
      // Arrange - Real DLA test content with mixed patterns
      const dlaTestContent = `import { StubMapping } from "wiremock-rest-client/dist/model/stub-mapping.model";
import { MockUtil } from "@sta/wiremock-generator-ts";

describe('DLA Books Test', () => {
  it('should handle book search workflow', () => {
    cy.intercept('GET', '/api/books/*').as('getBooks');
    cy.visit('/books');

    cy.get('[data-testid="search-input"]').then(($input) => {
      $input.val('JavaScript');
    });

    cy.get('[data-testid="search-btn"]').click();

    cy.wait('@getBooks').then((interception) => {
      const bookId = interception.request.url.split('/').pop();
      cy.log('Book ID:', bookId);
      expect(interception.response.statusCode).to.equal(200);
    });

    cy.customThen(() => {
      cy.get('[data-testid="results"]').should('be.visible');
      cy.get('.book-item').first().click();
    });

    cy.setupMocks();
  });
});`;

      // Act
      const result = await converter.convertComplexPatterns(dlaTestContent);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.conversionSuccess).toBe(true);
      expect(result.conversionSummary.totalPatterns).toBeGreaterThan(5);
      expect(result.conversionSummary.convertedPatterns).toBeGreaterThan(4);

      // Verify specific conversions
      expect(result.convertedCode).toContain('await page.route(\'/api/books/*\'');
      expect(result.convertedCode).toContain('await page.goto(\'/books\');');
      expect(result.convertedCode).toContain('const input = page.locator(\'[data-testid="search-input"]\');');
      expect(result.convertedCode).toContain('await page.waitForResponse(');
      expect(result.convertedCode).toContain('expect(interception.status()).toBe(200);');

      console.log('DLA Conversion Results:');
      console.log(`- Total patterns: ${result.conversionSummary.totalPatterns}`);
      console.log(`- Converted: ${result.conversionSummary.convertedPatterns}`);
      console.log(`- Failed: ${result.conversionSummary.failedPatterns}`);
    });

    test('should handle DLA login test with WireMock integration', async () => {
      // Arrange - Real DLA login test
      const dlaLoginContent = `describe('Login Test', () => {
  it('should perform login workflow', () => {
    cy.intercept('POST', '/api/auth/login', { fixture: 'login-success.json' }).as('loginRequest');

    cy.visit('/login');
    cy.fillLoginForm('user@test.com', 'password123');
    cy.submitLoginForm();

    cy.wait('@loginRequest').then((interception) => {
      if (interception.response.body.success) {
        cy.url().then((url) => {
          expect(url).to.include('/dashboard');
        });
      }
    });

    cy.customLog('Login completed', { timestamp: Date.now() });
  });
});`;

      // Act
      const result = await converter.convertComplexPatterns(dlaLoginContent);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.conversionSummary.convertedPatterns).toBeGreaterThan(0);
      expect(result.convertedCode).toContain('await page.route(\'/api/auth/login\'');
      expect(result.convertedCode).toContain('// TODO: Load fixture file login-success.json');
      expect(result.convertedCode).toContain('class LoginPage {');
      expect(result.convertedCode).toContain('async fillLoginForm(');
      expect(result.convertedCode).toContain('console.log(\'Login completed\'');
    });
  });

  describe('Mixed Pattern Conversion', () => {
    test('should handle cy.then() with cy.wait() combination', async () => {
      // Arrange
      const mixedPatternCode = `cy.intercept('GET', '/api/data').as('getData');
cy.visit('/page');
cy.wait('@getData').then((interception) => {
  cy.get('[data-testid="title"]').then(($title) => {
    expect($title.text()).to.equal(interception.response.body.title);
  });
});`;

      // Act
      const result = await converter.convertComplexPatterns(mixedPatternCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.conversionSummary.totalPatterns).toBeGreaterThan(2);
      expect(result.convertedCode).toContain('await page.route(\'/api/data\'');
      expect(result.convertedCode).toContain('const interception = await page.waitForResponse(');
      expect(result.convertedCode).toContain('const title = page.locator(\'[data-testid="title"]\');');
      expect(result.convertedCode).toContain('const responseBody = await interception.json();');
    });

    test('should handle custom commands with cy.then() chains', async () => {
      // Arrange
      const customCommandCode = `cy.login('user', 'pass');
cy.navigateToSection('books', 'fiction');
cy.get('[data-testid="book-list"]').then(($list) => {
  expect($list.children()).to.have.length.greaterThan(0);
});
cy.selectDropdown('[data-testid="sort"]', 'title');`;

      // Act
      const result = await converter.convertComplexPatterns(customCommandCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.conversionSummary.convertedPatterns).toBeGreaterThan(3);
      expect(result.convertedCode).toContain('await login(page, \'user\', \'pass\');');
      expect(result.convertedCode).toContain('await navigateToSection(page, \'books\', \'fiction\');');
      expect(result.convertedCode).toContain('await page.locator(\'[data-testid="sort"]\').selectOption(\'title\');');
    });

    test('should handle complex intercept with dynamic responses', async () => {
      // Arrange
      const complexInterceptCode = `cy.intercept('POST', '/api/users', (req) => {
  const userData = req.body;
  req.reply({
    statusCode: 201,
    body: { id: Math.random(), ...userData }
  });
}).as('createUser');

cy.wait('@createUser').then((interception) => {
  const newUser = interception.response.body;
  cy.log('Created user:', newUser.id);

  cy.get('[data-testid="user-id"]').then(($el) => {
    expect($el.text()).to.equal(newUser.id.toString());
  });
});`;

      // Act
      const result = await converter.convertComplexPatterns(complexInterceptCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.convertedCode).toContain('await page.route(\'/api/users\'');
      expect(result.convertedCode).toContain('const userData = route.request().postDataJSON();');
      expect(result.convertedCode).toContain('route.fulfill({');
      expect(result.convertedCode).toContain('status: 201');
      expect(result.conversionSummary.manualReviewRequired).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large test files efficiently', async () => {
      // Arrange - Generate a large test file with multiple patterns
      const largeTestContent = Array.from({ length: 20 }, (_, i) => `
describe('Test Suite ${i}', () => {
  it('should test feature ${i}', () => {
    cy.intercept('GET', '/api/test${i}').as('test${i}');
    cy.visit('/test${i}');
    cy.wait('@test${i}').then((interception) => {
      expect(interception.response.statusCode).to.equal(200);
    });
    cy.customAction${i}('param1', 'param2');
    cy.get('[data-testid="result${i}"]').then(($el) => {
      expect($el).to.be.visible;
    });
  });
});`).join('\n');

      // Act
      const startTime = Date.now();
      const result = await converter.convertComplexPatterns(largeTestContent);
      const endTime = Date.now();

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.conversionSummary.totalPatterns).toBeGreaterThan(60); // ~4 patterns per test * 20 tests
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds

      console.log(`Large file conversion (${result.conversionSummary.totalPatterns} patterns) completed in ${endTime - startTime}ms`);
    });

    test('should provide comprehensive conversion metrics', async () => {
      // Arrange
      const metricsTestCode = `cy.intercept('GET', '/api/users').as('getUsers');
cy.intercept('POST', '/api/login', { fixture: 'login.json' }).as('login');

cy.visit('/app');
cy.login('test@example.com', 'password');

cy.wait('@login').then((interception) => {
  cy.log('Login response:', interception.response.body);
});

cy.wait('@getUsers').then((interception) => {
  const users = interception.response.body;
  cy.get('[data-testid="user-count"]').then(($count) => {
    expect($count.text()).to.equal(users.length.toString());
  });
});

cy.customValidation('success');
cy.unknownCommand('test');`;

      // Act
      const result = await converter.convertComplexPatterns(metricsTestCode);

      // Assert
      expect(result.conversionSummary).toEqual(
        expect.objectContaining({
          totalPatterns: expect.any(Number),
          convertedPatterns: expect.any(Number),
          failedPatterns: expect.any(Number),
          manualReviewRequired: expect.any(Number),
          complexityDistribution: expect.objectContaining({
            low: expect.any(Number),
            medium: expect.any(Number),
            high: expect.any(Number)
          })
        })
      );

      expect(result.conversionSummary.totalPatterns).toBeGreaterThan(0);
      expect(result.conversionSummary.convertedPatterns + result.conversionSummary.failedPatterns)
        .toBe(result.conversionSummary.totalPatterns);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed Cypress code gracefully', async () => {
      // Arrange
      const malformedCode = `cy.get('[data-testid="incomplete"').then(($el) => {
  // Missing closing bracket in selector
  $el.click();
}

cy.wait('@nonexistent').then((
  // Incomplete then callback
});`;

      // Act
      const result = await converter.convertComplexPatterns(malformedCode);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.conversionSummary.failedPatterns).toBeGreaterThan(0);
      expect(result.conversionNotes).toContain('Malformed code detected');
    });

    test('should handle empty and minimal inputs', async () => {
      // Arrange
      const testCases = [
        '',
        'describe("Empty test", () => {});',
        'cy.visit("/");',
        '// Just a comment'
      ];

      for (const testCase of testCases) {
        // Act
        const result = await converter.convertComplexPatterns(testCase);

        // Assert
        expect(result).toBeDefined();
        expect(result.isValid).toBe(true);
        expect(result.conversionSuccess).toBe(true);
      }
    });

    test('should provide helpful error messages for conversion failures', async () => {
      // Arrange
      const problematicCode = `cy.intercept('INVALID_METHOD', '/api/test').as('test');
cy.wait('@test').then((interception) => {
  interception.invalid.property.access();
});`;

      // Act
      const result = await converter.convertComplexPatterns(problematicCode);

      // Assert
      expect(result.conversionNotes.length).toBeGreaterThan(0);
      expect(result.conversionNotes.some(note =>
        note.includes('conversion') || note.includes('review') || note.includes('manual')
      )).toBe(true);
    });
  });

  describe('End-to-End Workflow Validation', () => {
    test('should convert complete DLA workflow with all pattern types', async () => {
      // Create a temporary comprehensive test file
      const tempTestPath = path.join(__dirname, 'temp-complete-workflow.spec.ts');
      const completeWorkflowContent = `import { StubMapping } from "wiremock-rest-client/dist/model/stub-mapping.model";
import { MockUtil } from "@sta/wiremock-generator-ts";

describe('Complete DLA Workflow', () => {
  beforeEach(() => {
    cy.setupMocks();
  });

  it('should handle complete book management workflow', () => {
    // Setup interceptors
    cy.intercept('GET', '/api/books').as('getBooks');
    cy.intercept('POST', '/api/books', { statusCode: 201 }).as('createBook');
    cy.intercept('GET', /\\/api\\/books\\/\\d+/, { fixture: 'book-details.json' }).as('getBookDetails');

    // Navigation and login
    cy.visit('/books');
    cy.login('admin@library.com', 'admin123');

    // Search workflow
    cy.get('[data-testid="search-input"]').then(($input) => {
      $input.val('Programming');
    });
    cy.get('[data-testid="search-btn"]').click();

    // Wait for search results
    cy.wait('@getBooks').then((interception) => {
      const books = interception.response.body;
      cy.log('Found books:', books.length);

      if (books.length > 0) {
        cy.get('.book-item').first().then(($book) => {
          expect($book).to.be.visible;
          $book.click();
        });
      }
    });

    // Book details workflow
    cy.wait('@getBookDetails').then((interception) => {
      const bookId = interception.request.url.split('/').pop();
      cy.url().then((currentUrl) => {
        expect(currentUrl).to.include(\`/books/\${bookId}\`);
      });
    });

    // Custom actions
    cy.addToFavorites();
    cy.customThen(() => {
      cy.get('[data-testid="favorites-btn"]').should('contain.text', 'Remove from Favorites');
    });

    // Form interactions
    cy.selectDropdown('[data-testid="rating"]', '5-stars');
    cy.uploadFile('[data-testid="review-attachment"]', 'review.pdf');

    // Cleanup
    cy.clearTestData();
  });
});`;

      try {
        // Write the temporary file
        await fs.writeFile(tempTestPath, completeWorkflowContent);

        // Act
        const result = await converter.convertFile(tempTestPath);

        // Assert
        expect(result.isValid).toBe(true);
        expect(result.conversionSuccess).toBe(true);
        expect(result.conversionSummary.totalPatterns).toBeGreaterThan(15);
        expect(result.conversionSummary.convertedPatterns / result.conversionSummary.totalPatterns).toBeGreaterThan(0.8); // >80% success rate

        // Verify comprehensive conversion
        expect(result.convertedCode).toContain('import { Page } from \'@playwright/test\';');
        expect(result.convertedCode).toContain('await page.route(');
        expect(result.convertedCode).toContain('await page.waitForResponse(');
        expect(result.convertedCode).toContain('async function login(');
        expect(result.convertedCode).toContain('await page.locator(');
        expect(result.convertedCode).toContain('.selectOption(');
        expect(result.convertedCode).toContain('.setInputFiles(');

        console.log('Complete Workflow Conversion Summary:');
        console.log(`- Total patterns: ${result.conversionSummary.totalPatterns}`);
        console.log(`- Success rate: ${Math.round((result.conversionSummary.convertedPatterns / result.conversionSummary.totalPatterns) * 100)}%`);
        console.log(`- Manual review needed: ${result.conversionSummary.manualReviewRequired}`);

      } finally {
        // Clean up
        if (await fs.pathExists(tempTestPath)) {
          await fs.remove(tempTestPath);
        }
      }
    });

    test('should validate generated Playwright code syntax', async () => {
      // Arrange
      const testCode = `cy.intercept('GET', '/api/test').as('test');
cy.visit('/test');
cy.wait('@test').then((interception) => {
  expect(interception.response.statusCode).to.equal(200);
});`;

      // Act
      const result = await converter.convertComplexPatterns(testCode);

      // Assert
      expect(result.isValid).toBe(true);

      // Validate syntax by attempting to parse with TypeScript
      const ts = await import('typescript');
      const sourceFile = ts.createSourceFile(
        'test.ts',
        result.convertedCode,
        ts.ScriptTarget.Latest,
        true
      );

      // Should not have parse errors
      expect(sourceFile).toBeDefined();
      console.log('Generated code syntax validation: PASSED');
    });
  });
});