import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { WaitPatternTransformer } from '../src/services/wait-pattern-transformer';

describe('WaitPatternTransformer', () => {
  let transformer: WaitPatternTransformer;

  beforeEach(() => {
    transformer = new WaitPatternTransformer();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Simple cy.wait() Pattern Conversion', () => {
    test('should convert cy.wait() with alias to page.waitForResponse()', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', '/api/users').as('getUsers');
cy.wait('@getUsers');`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('await page.route(\'/api/users\'');
      expect(result.playwrightPattern).toContain('await page.waitForResponse(response => response.url().includes(\'/api/users\'))');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert cy.wait() with timeout to page.waitForTimeout()', () => {
      // Arrange
      const cypressPattern = `cy.wait(2000);`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toBe('await page.waitForTimeout(2000);');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert multiple cy.wait() calls correctly', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', '/api/users').as('getUsers');
cy.intercept('POST', '/api/login').as('login');
cy.wait('@getUsers');
cy.wait('@login');`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('await page.route(\'/api/users\'');
      expect(result.playwrightPattern).toContain('await page.route(\'/api/login\'');
      expect(result.playwrightPattern).toContain('await page.waitForResponse(response => response.url().includes(\'/api/users\'))');
      expect(result.playwrightPattern).toContain('await page.waitForResponse(response => response.url().includes(\'/api/login\'))');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('cy.wait() with .then() Chain Conversion', () => {
    test('should convert cy.wait().then() with request inspection', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', '/api/user').as('getUserRequest');
cy.wait('@getUserRequest').then((interception) => {
  expect(interception.response.statusCode).to.equal(200);
  expect(interception.response.body.name).to.equal('John Doe');
});`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('await page.route(\'/api/user\'');
      expect(result.playwrightPattern).toContain('const interception = await page.waitForResponse(response => response.url().includes(\'/api/user\'));');
      expect(result.playwrightPattern).toContain('expect(interception.status()).toBe(200);');
      expect(result.playwrightPattern).toContain('const responseBody = await interception.json();');
      expect(result.playwrightPattern).toContain('expect(responseBody.name).toBe(\'John Doe\');');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle URL parameter extraction from intercepted requests', () => {
      // Arrange - DLA project pattern
      const cypressPattern = `cy.intercept('GET', '/api/books/*').as('getBookRequest');
cy.wait('@getBookRequest').then((interception) => {
  const bookId = interception.request.url.split('/').pop();
  cy.log('Book ID from request:', bookId);
  expect(bookId).to.match(/^[0-9]+$/);
});`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('await page.route(\'/api/books/*\'');
      expect(result.playwrightPattern).toContain('const interception = await page.waitForResponse(response => response.url().includes(\'/api/books\'));');
      expect(result.playwrightPattern).toContain('const bookId = interception.url().split(\'/\').pop();');
      expect(result.playwrightPattern).toContain('console.log(\'Book ID from request:\', bookId);');
      expect(result.playwrightPattern).toContain('expect(bookId).toMatch(/^[0-9]+$/);');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert nested cy.wait().then() with complex logic', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', '/api/status').as('getStatus');
cy.wait('@getStatus').then((interception) => {
  if (interception.response.body.status === 'ready') {
    cy.get('[data-testid="continue-btn"]').click();
  } else {
    cy.wait(1000);
    cy.reload();
  }
});`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const interception = await page.waitForResponse(response => response.url().includes(\'/api/status\'));');
      expect(result.playwrightPattern).toContain('const responseBody = await interception.json();');
      expect(result.playwrightPattern).toContain('if (responseBody.status === \'ready\') {');
      expect(result.playwrightPattern).toContain('await page.locator(\'[data-testid="continue-btn"]\').click();');
      expect(result.playwrightPattern).toContain('} else {');
      expect(result.playwrightPattern).toContain('await page.waitForTimeout(1000);');
      expect(result.playwrightPattern).toContain('await page.reload();');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Complex cy.intercept() Pattern Conversion', () => {
    test('should convert cy.intercept() with method and URL patterns', () => {
      // Arrange
      const cypressPattern = `cy.intercept('POST', '/api/submit', { statusCode: 201, body: { success: true } }).as('submitRequest');`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('await page.route(\'/api/submit\', route => {');
      expect(result.playwrightPattern).toContain('if (route.request().method() === \'POST\') {');
      expect(result.playwrightPattern).toContain('route.fulfill({');
      expect(result.playwrightPattern).toContain('status: 201,');
      expect(result.playwrightPattern).toContain('body: JSON.stringify({ success: true })');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert cy.intercept() with regex URL patterns from DLA examples', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', /\\/api\\/books\\/\\d+/, { fixture: 'book-details.json' }).as('getBookDetails');`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('await page.route(/\\/api\\/books\\/\\d+/, route => {');
      expect(result.playwrightPattern).toContain('route.fulfill({');
      expect(result.playwrightPattern).toContain('// TODO: Load fixture file book-details.json');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert cy.intercept() with dynamic response generation', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', '/api/user/*', (req) => {
  const userId = req.url.split('/').pop();
  req.reply({
    statusCode: 200,
    body: { id: userId, name: \`User \${userId}\` }
  });
}).as('getUserDynamic');`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('await page.route(\'/api/user/*\', route => {');
      expect(result.playwrightPattern).toContain('const userId = route.request().url().split(\'/\').pop();');
      expect(result.playwrightPattern).toContain('route.fulfill({');
      expect(result.playwrightPattern).toContain('status: 200,');
      expect(result.playwrightPattern).toContain('body: JSON.stringify({ id: userId, name: `User ${userId}` })');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed cy.wait() patterns gracefully', () => {
      // Arrange
      const cypressPattern = `cy.wait('@nonexistentAlias');`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.conversionSuccess).toBe(false);
      expect(result.conversionNotes).toContain('Alias @nonexistentAlias referenced without corresponding cy.intercept()');
    });

    test('should handle cy.wait() with unsupported options', () => {
      // Arrange
      const cypressPattern = `cy.wait('@apiCall', { timeout: 30000, requestTimeout: 5000 });`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.requiresManualReview).toBe(true);
      expect(result.conversionNotes).toContain('Custom timeout options detected - may require manual adjustment');
      expect(result.playwrightPattern).toContain('// TODO: Configure custom timeout (30000ms)');
    });

    test('should convert cy.wait() with multiple aliases', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', '/api/users').as('getUsers');
cy.intercept('GET', '/api/roles').as('getRoles');
cy.wait(['@getUsers', '@getRoles']);`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('Promise.all([');
      expect(result.playwrightPattern).toContain('page.waitForResponse(response => response.url().includes(\'/api/users\'))');
      expect(result.playwrightPattern).toContain('page.waitForResponse(response => response.url().includes(\'/api/roles\'))');
      expect(result.playwrightPattern).toContain(']);');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Pattern Analysis and Metadata', () => {
    test('should categorize simple wait patterns as low complexity', () => {
      // Arrange
      const cypressPattern = `cy.wait(1000);`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.transformationMetadata.complexity).toBe('low');
      expect(result.transformationMetadata.requiresManualReview).toBe(false);
    });

    test('should categorize intercept patterns as medium complexity', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', '/api/data').as('getData');
cy.wait('@getData');`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.transformationMetadata.complexity).toBe('medium');
      expect(result.transformationMetadata.usesRequestInterception).toBe(true);
    });

    test('should categorize complex patterns as high complexity', () => {
      // Arrange
      const cypressPattern = `cy.intercept('POST', '/api/**', (req) => {
  req.reply((res) => {
    res.setDelay(100);
    res.send({ fixture: 'response.json' });
  });
}).as('complexIntercept');
cy.wait('@complexIntercept').then((interception) => {
  // Complex logic here
});`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.transformationMetadata.complexity).toBe('high');
      expect(result.transformationMetadata.requiresManualReview).toBe(true);
    });

    test('should provide detailed conversion notes', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', '/api/data', { fixture: 'data.json' }).as('getData');
cy.wait('@getData').then((interception) => {
  expect(interception.response.statusCode).to.equal(200);
});`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.conversionNotes.length).toBeGreaterThan(0);
      expect(result.conversionNotes).toContain('Converted cy.intercept() to page.route()');
      expect(result.conversionNotes).toContain('Converted cy.wait() to page.waitForResponse()');
      expect(result.conversionNotes).toContain('Fixture file integration requires manual setup');
    });
  });

  describe('Integration with Request Handling', () => {
    test('should preserve request body validation in conversion', () => {
      // Arrange
      const cypressPattern = `cy.intercept('POST', '/api/submit').as('submitData');
cy.wait('@submitData').then((interception) => {
  expect(interception.request.body).to.deep.equal({
    name: 'John',
    email: 'john@example.com'
  });
});`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const requestBody = await interception.request().postDataJSON();');
      expect(result.playwrightPattern).toContain('expect(requestBody).toEqual({');
      expect(result.playwrightPattern).toContain('name: \'John\',');
      expect(result.playwrightPattern).toContain('email: \'john@example.com\'');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle request header validation', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', '/api/data').as('getData');
cy.wait('@getData').then((interception) => {
  expect(interception.request.headers).to.have.property('authorization');
  expect(interception.request.headers['content-type']).to.include('application/json');
});`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const requestHeaders = interception.request().headers();');
      expect(result.playwrightPattern).toContain('expect(requestHeaders).toHaveProperty(\'authorization\');');
      expect(result.playwrightPattern).toContain('expect(requestHeaders[\'content-type\']).toContain(\'application/json\');');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert response time validation', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', '/api/fast').as('fastApi');
cy.wait('@fastApi').then((interception) => {
  expect(interception.response.duration).to.be.lessThan(1000);
});`;

      // Act
      const result = transformer.convertWaitPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('// TODO: Response timing validation requires custom implementation');
      expect(result.transformationMetadata.requiresManualReview).toBe(true);
      expect(result.conversionNotes).toContain('Response duration validation not directly supported in Playwright');
      expect(result.conversionSuccess).toBe(true);
    });
  });
});