import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { CustomCommandHandler } from '../src/services/custom-command-handler';

describe('CustomCommandHandler', () => {
  let handler: CustomCommandHandler;

  beforeEach(() => {
    handler = new CustomCommandHandler();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Common Custom Command Detection', () => {
    test('should identify cy.login() custom command', () => {
      // Arrange
      const cypressCode = `cy.login('testuser', 'password123');`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('utility');
      expect(result.playwrightEquivalent).toContain('// TODO: Convert custom command cy.login() to Playwright equivalent');
      expect(result.playwrightEquivalent).toContain('async function login(page: Page, username: string, password: string)');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should identify cy.selectDropdown() custom command', () => {
      // Arrange
      const cypressCode = `cy.selectDropdown('[data-testid="country"]', 'Netherlands');`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('direct');
      expect(result.playwrightEquivalent).toContain('await page.locator(\'[data-testid="country"]\').selectOption(\'Netherlands\');');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle cy.uploadFile() custom command', () => {
      // Arrange
      const cypressCode = `cy.uploadFile('[data-testid="file-input"]', 'test-file.pdf');`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('direct');
      expect(result.playwrightEquivalent).toContain('await page.locator(\'[data-testid="file-input"]\').setInputFiles(\'test-file.pdf\');');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('DLA Project Custom Commands', () => {
    test('should convert cy.customThen() command from DLA examples', () => {
      // Arrange
      const cypressCode = `cy.customThen(() => {
  cy.get('[data-testid="modal"]').should('be.visible');
  cy.get('[data-testid="close-btn"]').click();
});`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('utility');
      expect(result.playwrightEquivalent).toContain('// Custom then logic converted to async function');
      expect(result.playwrightEquivalent).toContain('await expect(page.locator(\'[data-testid="modal"]\')).toBeVisible();');
      expect(result.playwrightEquivalent).toContain('await page.locator(\'[data-testid="close-btn"]\').click();');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle cy.customLog() command with parameters', () => {
      // Arrange
      const cypressCode = `cy.customLog('User action', { userId: 123, action: 'click' });`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('direct');
      expect(result.playwrightEquivalent).toContain('console.log(\'User action\', { userId: 123, action: \'click\' });');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert cy.navigateToSection() command', () => {
      // Arrange
      const cypressCode = `cy.navigateToSection('books', 'fiction');`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('utility');
      expect(result.playwrightEquivalent).toContain('async function navigateToSection(page: Page, section: string, subsection: string)');
      expect(result.playwrightEquivalent).toContain('await page.goto(`/${section}/${subsection}`);');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Page Object Model Commands', () => {
    test('should convert custom commands to page object methods', () => {
      // Arrange
      const cypressCode = `cy.fillLoginForm('user@example.com', 'password123');
cy.submitLoginForm();`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('pageObject');
      expect(result.playwrightEquivalent).toContain('class LoginPage {');
      expect(result.playwrightEquivalent).toContain('async fillLoginForm(email: string, password: string)');
      expect(result.playwrightEquivalent).toContain('async submitLoginForm()');
      expect(result.transformationMetadata.generatedUtilityFunction).toBeDefined();
      expect(result.conversionSuccess).toBe(true);
    });

    test('should group related custom commands into page objects', () => {
      // Arrange
      const cypressCode = `cy.openModal();
cy.fillModalForm({ title: 'Test', description: 'Test description' });
cy.saveModal();
cy.closeModal();`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('pageObject');
      expect(result.playwrightEquivalent).toContain('class ModalPage {');
      expect(result.playwrightEquivalent).toContain('async openModal()');
      expect(result.playwrightEquivalent).toContain('async fillModalForm(data: any)');
      expect(result.playwrightEquivalent).toContain('async saveModal()');
      expect(result.playwrightEquivalent).toContain('async closeModal()');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Complex Custom Command Patterns', () => {
    test('should handle custom commands with cy.wrap() and .as()', () => {
      // Arrange
      const cypressCode = `cy.getApiData('/api/users').as('usersData');
cy.get('@usersData').then((data) => {
  expect(data.length).to.be.greaterThan(0);
});`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('utility');
      expect(result.playwrightEquivalent).toContain('const usersData = await getApiData(page, \'/api/users\');');
      expect(result.playwrightEquivalent).toContain('expect(usersData.length).toBeGreaterThan(0);');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should convert custom commands with conditional logic', () => {
      // Arrange
      const cypressCode = `cy.conditionalClick('[data-testid="accept-btn"]', 'visible');`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('utility');
      expect(result.playwrightEquivalent).toContain('async function conditionalClick(page: Page, selector: string, condition: string)');
      expect(result.playwrightEquivalent).toContain('if (condition === \'visible\' && await page.locator(selector).isVisible()) {');
      expect(result.playwrightEquivalent).toContain('await page.locator(selector).click();');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle custom commands with retries and timeouts', () => {
      // Arrange
      const cypressCode = `cy.waitForElement('[data-testid="dynamic-content"]', { timeout: 10000, retries: 3 });`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('utility');
      expect(result.playwrightEquivalent).toContain('async function waitForElement(page: Page, selector: string, options?: { timeout?: number, retries?: number })');
      expect(result.playwrightEquivalent).toContain('await page.locator(selector).waitFor({ timeout: options?.timeout || 30000 });');
      expect(result.transformationMetadata.requiresManualReview).toBe(true);
      expect(result.conversionNotes).toContain('Custom retry logic requires manual implementation');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Unsupported Custom Commands', () => {
    test('should mark browser-specific commands for manual review', () => {
      // Arrange
      const cypressCode = `cy.clearCookies();
cy.clearLocalStorage();
cy.setCookie('sessionId', '123456');`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('manual');
      expect(result.transformationMetadata.requiresManualReview).toBe(true);
      expect(result.playwrightEquivalent).toContain('// TODO: Browser cookie/storage management');
      expect(result.playwrightEquivalent).toContain('await page.context().clearCookies();');
      expect(result.playwrightEquivalent).toContain('await page.evaluate(() => localStorage.clear());');
      expect(result.playwrightEquivalent).toContain('await page.context().addCookies([{ name: \'sessionId\', value: \'123456\', url: page.url() }]);');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle unknown custom commands gracefully', () => {
      // Arrange
      const cypressCode = `cy.unknownCustomCommand('param1', 'param2');`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('manual');
      expect(result.transformationMetadata.requiresManualReview).toBe(true);
      expect(result.playwrightEquivalent).toContain('// TODO: Unknown custom command - requires manual conversion');
      expect(result.playwrightEquivalent).toContain('// cy.unknownCustomCommand(\'param1\', \'param2\');');
      expect(result.conversionNotes).toContain('Unknown custom command detected: unknownCustomCommand');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle complex jQuery-based custom commands', () => {
      // Arrange
      const cypressCode = `cy.customDragAndDrop('[data-testid="item1"]', '[data-testid="dropzone"]');`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('manual');
      expect(result.transformationMetadata.requiresManualReview).toBe(true);
      expect(result.conversionNotes).toContain('Drag and drop operations require manual conversion to Playwright API');
      expect(result.playwrightEquivalent).toContain('// TODO: Implement drag and drop using Playwright');
      expect(result.playwrightEquivalent).toContain('await page.locator(\'[data-testid="item1"]\').dragTo(page.locator(\'[data-testid="dropzone"]\'));');
      expect(result.conversionSuccess).toBe(true);
    });
  });

  describe('Command Analysis and Metadata', () => {
    test('should categorize direct conversion commands as low complexity', () => {
      // Arrange
      const cypressCode = `cy.clickButton('[data-testid="submit"]');`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.transformationMetadata.complexity).toBe('low');
      expect(result.transformationMetadata.requiresManualReview).toBe(false);
    });

    test('should categorize utility function commands as medium complexity', () => {
      // Arrange
      const cypressCode = `cy.performLogin('user@test.com', 'password');`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.transformationMetadata.complexity).toBe('medium');
      expect(result.transformationMetadata.strategy).toBe('utility');
    });

    test('should categorize page object commands as high complexity', () => {
      // Arrange
      const cypressCode = `cy.navigateComplexWorkflow('step1', 'step2', 'step3');`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.transformationMetadata.complexity).toBe('high');
      expect(result.transformationMetadata.strategy).toBe('pageObject');
    });

    test('should provide detailed conversion notes for complex commands', () => {
      // Arrange
      const cypressCode = `cy.setupTestData({ users: 5, products: 10 });
cy.runComplexValidation();`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.conversionNotes.length).toBeGreaterThan(0);
      expect(result.conversionNotes).toContain('Multiple custom commands detected');
      expect(result.conversionNotes).toContain('Test data setup requires manual implementation');
      expect(result.conversionNotes).toContain('Complex validation logic should be converted to utility functions');
    });
  });

  describe('Integration and Chaining', () => {
    test('should handle chained custom commands', () => {
      // Arrange
      const cypressCode = `cy.login('user', 'pass').navigateTo('dashboard').verifyDashboard();`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.transformationMetadata.strategy).toBe('pageObject');
      expect(result.playwrightEquivalent).toContain('await login(page, \'user\', \'pass\');');
      expect(result.playwrightEquivalent).toContain('await navigateTo(page, \'dashboard\');');
      expect(result.playwrightEquivalent).toContain('await verifyDashboard(page);');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should preserve custom command parameters and types', () => {
      // Arrange
      const cypressCode = `cy.createRecord({
  name: 'Test User',
  email: 'test@example.com',
  age: 25,
  active: true
});`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightEquivalent).toContain('async function createRecord(page: Page, data: {');
      expect(result.playwrightEquivalent).toContain('name: string;');
      expect(result.playwrightEquivalent).toContain('email: string;');
      expect(result.playwrightEquivalent).toContain('age: number;');
      expect(result.playwrightEquivalent).toContain('active: boolean;');
      expect(result.conversionSuccess).toBe(true);
    });

    test('should handle custom commands with async operations', () => {
      // Arrange
      const cypressCode = `cy.waitForApiResponse('/api/data').then((response) => {
  cy.validateResponse(response);
});`;

      // Act
      const result = handler.convertCustomCommand(cypressCode);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.playwrightEquivalent).toContain('const response = await waitForApiResponse(page, \'/api/data\');');
      expect(result.playwrightEquivalent).toContain('await validateResponse(page, response);');
      expect(result.transformationMetadata.strategy).toBe('utility');
      expect(result.conversionSuccess).toBe(true);
    });
  });
});