import { describe, test, expect, beforeEach } from '@jest/globals';
import { ThenPatternTransformer } from '../src/services/then-pattern-transformer';

describe('ThenPatternTransformer', () => {
  let transformer: ThenPatternTransformer;

  beforeEach(() => {
    transformer = new ThenPatternTransformer();
  });

  describe('Simple cy.then() Pattern Conversion', () => {
    test('should convert basic cy.then() callback to async/await', () => {
      // Arrange
      const cypressCode = `cy.get('[data-testid="submit"]').then(($btn) => {
  expect($btn).to.be.visible;
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const btn = page.locator(\'[data-testid="submit"]\');');
      expect(result.playwrightPattern).toContain('await expect(btn).toBeVisible();');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert cy.then() with return values and chaining', () => {
      // Arrange
      const cypressCode = `cy.url().then((url) => {
  return url.split('/').pop();
}).then((id) => {
  console.log('User ID:', id);
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const url = page.url();');
      expect(result.playwrightPattern).toContain('const id = url.split(\'/\').pop();');
      expect(result.playwrightPattern).toContain('console.log(\'User ID:\', id);');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert cy.then() with simple element interaction', () => {
      // Arrange
      const cypressCode = `cy.get('#username').then(($input) => {
  $input.val('testuser');
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const input = page.locator(\'#username\');');
      expect(result.playwrightPattern).toContain('await input.fill(\'testuser\');');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Complex cy.then() Pattern Conversion', () => {
    test('should handle nested cy.then() patterns from DLA examples', () => {
      // Arrange
      const cypressCode = `cy.then(() => {
  cy.get('[data-testid="complex-form"]').then(($form) => {
    expect($form).to.be.visible;
    cy.get('[data-testid="submit"]').click();
  });
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.complexity).toBe('high');
      expect(result.transformationMetadata.strategy).toBe('nested');
      expect(result.playwrightPattern).toContain('// Nested then patterns converted to sequential async operations');
    });

    test('should convert cy.then() with complex logic and mock setup', () => {
      // Arrange
      const cypressCode = `cy.intercept('GET', '/api/user').as('userRequest');
cy.visit('/profile');
cy.wait('@userRequest').then((interception) => {
  const userData = interception.response.body;
  cy.get('[data-testid="user-name"]').should('contain.text', userData.name);
  cy.get('[data-testid="user-email"]').should('contain.text', userData.email);
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('await page.route(\'/api/user\'');
      expect(result.playwrightPattern).toContain('await page.goto(\'/profile\')');
      expect(result.playwrightPattern).toContain('const responseBody = await');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle URL parameter extraction patterns', () => {
      // Arrange
      const cypressCode = `cy.url().then((currentUrl) => {
  const params = new URLSearchParams(currentUrl.split('?')[1]);
  const userId = params.get('id');
  cy.wrap(userId).as('currentUserId');
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const url = page.url();');
      expect(result.playwrightPattern).toContain('const params = new URLSearchParams');
      expect(result.playwrightPattern).toContain('const userId = params.get(\'id\');');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle conditional logic within cy.then()', () => {
      // Arrange
      const cypressCode = `cy.get('[data-testid="status"]').then(($status) => {
  if ($status.text().includes('Active')) {
    cy.get('[data-testid="deactivate"]').click();
  } else {
    cy.get('[data-testid="activate"]').click();
  }
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const status = page.locator(\'[data-testid="status"]\');');
      expect(result.playwrightPattern).toContain('if (status.text().includes(\'Active\'))');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed cy.then() patterns gracefully', () => {
      // Arrange
      const cypressCode = `cy.get('[data-testid="broken').then((malformed`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true); // Should handle gracefully
      expect(result.transformationMetadata.strategy).toBe('error');
      expect(result.transformationMetadata.warnings).toContain('This pattern could not be automatically converted');
    });

    test('should mark unsupported jQuery methods for manual review', () => {
      // Arrange
      const cypressCode = `cy.get('.element').then(($el) => {
  $el.addClass('active');
  $el.data('custom', 'value');
  $el.trigger('customEvent');
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('element.addClass(\'active\')');
      expect(result.transformationMetadata.notes).toContain('Converted simple cy.get().then() to async/await pattern');
    });

    test('should handle deeply nested cy.then() patterns', () => {
      // Arrange
      const cypressCode = `cy.get('[data-testid="outer"]').then(($outer) => {
  $outer.find('[data-testid="inner"]').then(($inner) => {
    $inner.find('[data-testid="deepest"]').then(($deepest) => {
      expect($deepest).to.be.visible;
    });
  });
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.complexity).toBe('high');
      expect(result.transformationMetadata.strategy).toBe('nested');
      expect(result.transformationMetadata.warnings).toContain('Nested then patterns may require manual review for correctness');
    });
  });

  describe('Pattern Analysis and Metadata', () => {
    test('should categorize simple patterns as low complexity', () => {
      // Arrange
      const cypressCode = `cy.get('[data-testid="simple"]').then(($el) => {
  expect($el).to.be.visible;
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.complexity).toBe('low');
      expect(result.transformationMetadata.strategy).toBe('simple');
    });

    test('should categorize nested patterns as high complexity', () => {
      // Arrange
      const cypressCode = `cy.then(() => {
  cy.get('[data-testid="first"]').then(() => {
    cy.get('[data-testid="second"]').then(() => {
      // deeply nested
    });
  });
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.complexity).toBe('high');
      expect(result.transformationMetadata.strategy).toBe('nested');
    });

    test('should provide detailed conversion notes for complex transformations', () => {
      // Arrange
      const cypressCode = `cy.intercept('/api/data').as('apiCall');
cy.wait('@apiCall').then((interception) => {
  // complex interception handling
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.transformationMetadata.notes).toBeDefined();
      expect(result.transformationMetadata.notes.length).toBeGreaterThan(0);
      expect(result.transformationMetadata.notes[0]).toContain('Converted');
    });
  });

  describe('Integration with Other Patterns', () => {
    test('should handle cy.then() combined with custom commands', () => {
      // Arrange
      const cypressCode = `cy.customCommand().then((result) => {
  cy.anotherCustomCommand(result);
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('// TODO: Convert');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should preserve variable scope across async/await conversion', () => {
      // Arrange
      const cypressCode = `cy.get('[data-testid="input"]').then(($input) => {
  const originalValue = $input.val();
  $input.clear();
  $input.type(originalValue + '_modified');
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightPattern).toContain('const input = page.locator(\'[data-testid="input"]\');');
      expect(result.playwrightPattern).toContain('const originalValue = input.val();');
      expect(result.playwrightPattern).toContain('input.clear();');
      expect(result.playwrightPattern).toContain('input.type(originalValue + \'_modified\');');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle custom commands with async operations', () => {
      // Arrange
      const cypressCode = `cy.asyncCustomCommand().then((response) => {
  expect(response.status).to.equal(200);
});`;

      // Act
      const result = transformer.convertThenPattern(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('error'); // Generic pattern
      expect(result.conversionSuccess).toBe(true);
    });
  });
});