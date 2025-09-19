import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ThenPatternTransformer } from '../src/services/then-pattern-transformer';

describe('ThenPatternTransformer', () => {
  let transformer: ThenPatternTransformer;

  beforeEach(() => {
    transformer = new ThenPatternTransformer();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Simple cy.then() Pattern Conversion', () => {
    test('should convert basic cy.then() callback to async/await', () => {
      // Arrange
      const cypressPattern = `cy.get('[data-testid="submit"]').then(($btn) => {
  expect($btn).to.be.visible;
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Debug output
      console.log('Input:', cypressPattern);
      console.log('Output:', result.playwrightPattern);
      console.log('Valid:', result.isValid);
      console.log('Success:', result.conversionSuccess);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const btn = page.locator(\'[data-testid="submit"]\');');
      expect(result.playwrightPattern).toContain('await expect(btn).toBeVisible();');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert cy.then() with return values and chaining', () => {
      // Arrange
      const cypressPattern = `cy.url().then((url) => {
  return url.split('/').pop();
}).then((id) => {
  cy.log('User ID:', id);
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const url = page.url();');
      expect(result.playwrightPattern).toContain('const id = url.split(\'/\').pop();');
      expect(result.playwrightPattern).toContain('console.log(\'User ID:\', id);');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert cy.then() with simple element interaction', () => {
      // Arrange
      const cypressPattern = `cy.get('#username').then(($input) => {
  $input.val('testuser');
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const input = page.locator(\'#username\');');
      expect(result.playwrightPattern).toContain('await input.fill(\'testuser\');');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Complex cy.then() Pattern Conversion', () => {
    test('should handle nested cy.then() patterns from DLA examples', () => {
      // Arrange - Based on DLA project patterns
      const cypressPattern = `cy.wait('@loginRequest').then((interception) => {
  const userId = interception.response.body.userId;
  cy.url().then((url) => {
    expect(url).to.include(\`/dashboard/\${userId}\`);
  });
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const interception = await page.waitForResponse');
      expect(result.playwrightPattern).toContain('const responseBody = await interception.json();');
      expect(result.playwrightPattern).toContain('const userId = responseBody.userId;');
      expect(result.playwrightPattern).toContain('const url = page.url();');
      expect(result.playwrightPattern).toContain('await expect(page).toHaveURL');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert cy.then() with complex logic and mock setup', () => {
      // Arrange
      const cypressPattern = `cy.intercept('GET', '/api/user').as('userRequest');
cy.visit('/profile');
cy.wait('@userRequest').then((interception) => {
  const userData = interception.response.body;
  cy.get('[data-testid="user-name"]').should('contain.text', userData.name);
  cy.get('[data-testid="user-email"]').should('contain.text', userData.email);
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('await page.route(\'/api/user\'');
      expect(result.playwrightPattern).toContain('await page.goto(\'/profile\');');
      expect(result.playwrightPattern).toContain('const interception = await page.waitForResponse');
      expect(result.playwrightPattern).toContain('const userData = await interception.json();');
      expect(result.playwrightPattern).toContain('await expect(page.locator(\'[data-testid="user-name"]\')).toContainText(userData.name);');
      expect(result.playwrightPattern).toContain('await expect(page.locator(\'[data-testid="user-email"]\')).toContainText(userData.email);');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle URL parameter extraction patterns', () => {
      // Arrange - Common DLA pattern for extracting IDs from URLs
      const cypressPattern = `cy.url().then((url) => {
  const bookId = url.match(/\\/books\\/([0-9]+)/)[1];
  cy.log('Extracted book ID:', bookId);
  cy.get('[data-testid="book-details"]').should('be.visible');
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const url = page.url();');
      expect(result.playwrightPattern).toContain('const bookId = url.match(/\\/books\\/([0-9]+)/)[1];');
      expect(result.playwrightPattern).toContain('console.log(\'Extracted book ID:\', bookId);');
      expect(result.playwrightPattern).toContain('await expect(page.locator(\'[data-testid="book-details"]\')).toBeVisible();');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle conditional logic within cy.then()', () => {
      // Arrange
      const cypressPattern = `cy.get('[data-testid="modal"]').then(($modal) => {
  if ($modal.is(':visible')) {
    cy.get('[data-testid="close-modal"]').click();
  } else {
    cy.get('[data-testid="open-modal"]').click();
  }
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const modal = page.locator(\'[data-testid="modal"]\');');
      expect(result.playwrightPattern).toContain('if (await modal.isVisible()) {');
      expect(result.playwrightPattern).toContain('await page.locator(\'[data-testid="close-modal"]\').click();');
      expect(result.playwrightPattern).toContain('} else {');
      expect(result.playwrightPattern).toContain('await page.locator(\'[data-testid="open-modal"]\').click();');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed cy.then() patterns gracefully', () => {
      // Arrange
      const cypressPattern = `cy.get('[data-testid="invalid').then(($el) => {
  // Missing closing bracket in selector
  $el.click();
}`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.conversionSuccess).toBe(false);
      expect(result.conversionNotes).toContain('Malformed selector or syntax error detected');
    });

    test('should mark unsupported jQuery methods for manual review', () => {
      // Arrange
      const cypressPattern = `cy.get('.slider').then(($slider) => {
  $slider.slider('value', 50);
  $slider.trigger('slidechange');
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.requiresManualReview).toBe(true);
      expect(result.conversionNotes).toContain('jQuery method "slider" requires manual conversion');
      expect(result.playwrightPattern).toContain('// TODO: Convert jQuery slider() method to Playwright equivalent');
    });

    test('should handle deeply nested cy.then() patterns', () => {
      // Arrange
      const cypressPattern = `cy.get('#form').then(($form) => {
  cy.get('#input1').then(($input1) => {
    cy.get('#input2').then(($input2) => {
      $input1.val('value1');
      $input2.val('value2');
      $form.submit();
    });
  });
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.complexity).toBe('high');
      expect(result.playwrightPattern).toContain('const form = page.locator(\'#form\');');
      expect(result.playwrightPattern).toContain('const input1 = page.locator(\'#input1\');');
      expect(result.playwrightPattern).toContain('const input2 = page.locator(\'#input2\');');
      expect(result.playwrightPattern).toContain('await input1.fill(\'value1\');');
      expect(result.playwrightPattern).toContain('await input2.fill(\'value2\');');
      expect(result.playwrightPattern).toContain('await form.submit();');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Pattern Analysis and Metadata', () => {
    test('should categorize simple patterns as low complexity', () => {
      // Arrange
      const cypressPattern = `cy.get('#button').then(($btn) => {
  $btn.click();
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.transformationMetadata.complexity).toBe('low');
      expect(result.transformationMetadata.requiresManualReview).toBe(false);
    });

    test('should categorize nested patterns as high complexity', () => {
      // Arrange
      const cypressPattern = `cy.wait('@api').then((interception) => {
  cy.url().then((url) => {
    cy.get('.result').then(($result) => {
      // Complex nested logic
    });
  });
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.transformationMetadata.complexity).toBe('high');
    });

    test('should provide detailed conversion notes for complex transformations', () => {
      // Arrange
      const cypressPattern = `cy.window().then((win) => {
  win.localStorage.setItem('token', 'abc123');
  cy.reload();
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.conversionNotes.length).toBeGreaterThan(0);
      expect(result.conversionNotes).toContain('Converted window.localStorage to page.evaluate with localStorage');
      expect(result.playwrightPattern).toContain('await page.evaluate(() => localStorage.setItem(\'token\', \'abc123\'));');
      expect(result.playwrightPattern).toContain('await page.reload();');
    });
  });

  describe('Integration with Other Patterns', () => {
    test('should handle cy.then() combined with custom commands', () => {
      // Arrange
      const cypressPattern = `cy.login('user', 'pass').then(() => {
  cy.get('[data-testid="dashboard"]').should('be.visible');
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.conversionNotes).toContain('Custom command "login" detected - may require additional conversion');
      expect(result.playwrightPattern).toContain('// TODO: Convert custom command cy.login() to Playwright equivalent');
      expect(result.playwrightPattern).toContain('await expect(page.locator(\'[data-testid="dashboard"]\')).toBeVisible();');
    });

    test('should preserve variable scope across async/await conversion', () => {
      // Arrange
      const cypressPattern = `let userId;
cy.request('/api/user').then((response) => {
  userId = response.body.id;
}).then(() => {
  cy.visit(\`/profile/\${userId}\`);
});`;

      // Act
      const result = transformer.convertThenPattern(cypressPattern);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('let userId;');
      expect(result.playwrightPattern).toContain('const response = await page.request.get(\'/api/user\');');
      expect(result.playwrightPattern).toContain('const responseBody = await response.json();');
      expect(result.playwrightPattern).toContain('userId = responseBody.id;');
      expect(result.playwrightPattern).toContain('await page.goto(`/profile/${userId}`);');
      expect(result.conversionSuccess).toBe(true);
    });
  });
});