import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommandConverter } from '../src/command-converter';
import { CypressCommand, ConvertedCommand, PlaywrightCode } from '../src/types';

describe('CommandConverter', () => {
  let converter: CommandConverter;

  beforeEach(() => {
    converter = new CommandConverter();
  });

  describe('basic command mapping', () => {
    it('should convert cy.visit to page.goto', () => {
      const cypressCommand: CypressCommand = {
        command: 'visit',
        args: ['/login']
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe("await page.goto('/login')");
      expect(result.requiresAwait).toBe(true);
      expect(result.imports).toContain('@playwright/test');
    });

    it('should convert cy.get to page.locator', () => {
      const cypressCommand: CypressCommand = {
        command: 'get',
        args: ['[data-testid="username"]']
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('page.getByTestId(\'username\')');
      expect(result.requiresAwait).toBe(false);
    });

    it('should convert cy.get with chained click', () => {
      const cypressCommand: CypressCommand = {
        command: 'get',
        args: ['[data-testid="submit"]'],
        chainedCalls: [
          { method: 'click', args: [] }
        ]
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('await page.getByTestId(\'submit\').click()');
      expect(result.requiresAwait).toBe(true);
    });

    it('should convert cy.get with chained type', () => {
      const cypressCommand: CypressCommand = {
        command: 'get',
        args: ['[data-testid="password"]'],
        chainedCalls: [
          { method: 'type', args: ['mypassword'] }
        ]
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('await page.getByTestId(\'password\').fill(\'mypassword\')');
      expect(result.requiresAwait).toBe(true);
    });

    it('should convert cy.contains', () => {
      const cypressCommand: CypressCommand = {
        command: 'contains',
        args: ['Welcome']
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('page.getByText(\'Welcome\')');
      expect(result.requiresAwait).toBe(false);
    });

    it('should convert cy.url', () => {
      const cypressCommand: CypressCommand = {
        command: 'url',
        args: []
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('page.url()');
      expect(result.requiresAwait).toBe(false);
    });
  });

  describe('assertion conversion', () => {
    it('should convert should be.visible to toBeVisible', () => {
      const cypressCommand: CypressCommand = {
        command: 'get',
        args: ['.message'],
        chainedCalls: [
          { method: 'should', args: ['be.visible'] }
        ]
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('await expect(page.locator(\'.message\')).toBeVisible()');
      expect(result.requiresAwait).toBe(true);
    });

    it('should convert should contain.text to toContainText', () => {
      const cypressCommand: CypressCommand = {
        command: 'get',
        args: ['.title'],
        chainedCalls: [
          { method: 'should', args: ['contain.text', 'Dashboard'] }
        ]
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('await expect(page.locator(\'.title\')).toContainText(\'Dashboard\')');
      expect(result.requiresAwait).toBe(true);
    });

    it('should convert should have.length to toHaveCount', () => {
      const cypressCommand: CypressCommand = {
        command: 'get',
        args: ['.item'],
        chainedCalls: [
          { method: 'should', args: ['have.length', 5] }
        ]
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('await expect(page.locator(\'.item\')).toHaveCount(5)');
      expect(result.requiresAwait).toBe(true);
    });

    it('should convert cy.url should include', () => {
      const cypressCommand: CypressCommand = {
        command: 'url',
        args: [],
        chainedCalls: [
          { method: 'should', args: ['include', '/dashboard'] }
        ]
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('await expect(page).toHaveURL(/.*\\/dashboard.*/)');
      expect(result.requiresAwait).toBe(true);
    });
  });

  describe('multiple chained calls', () => {
    it('should handle multiple chained methods', () => {
      const cypressCommand: CypressCommand = {
        command: 'get',
        args: ['[data-testid="input"]'],
        chainedCalls: [
          { method: 'clear', args: [] },
          { method: 'type', args: ['new value'] },
          { method: 'should', args: ['have.value', 'new value'] }
        ]
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toContain('await page.getByTestId(\'input\').clear()');
      expect(result.playwrightCode).toContain('await page.getByTestId(\'input\').fill(\'new value\')');
      expect(result.playwrightCode).toContain('await expect(page.getByTestId(\'input\')).toHaveValue(\'new value\')');
      expect(result.requiresAwait).toBe(true);
    });
  });

  describe('special commands', () => {
    it('should convert cy.wait with alias', () => {
      const cypressCommand: CypressCommand = {
        command: 'wait',
        args: ['@apiCall']
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('await page.waitForResponse(resp => resp.url().includes(\'/api/\') && resp.status() === 200)');
      expect(result.requiresAwait).toBe(true);
      expect(result.warnings).toContain('cy.wait(@alias) converted to generic API wait - may need manual adjustment');
    });

    it('should convert cy.wait with timeout', () => {
      const cypressCommand: CypressCommand = {
        command: 'wait',
        args: [2000]
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('await page.waitForTimeout(2000)');
      expect(result.requiresAwait).toBe(true);
    });

    it('should convert cy.intercept', () => {
      const cypressCommand: CypressCommand = {
        command: 'intercept',
        args: ['GET', '/api/users'],
        chainedCalls: [
          { method: 'as', args: ['getUsers'] }
        ]
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toContain('await page.route(\'/api/users\'');
      expect(result.requiresAwait).toBe(true);
    });
  });

  describe('custom selector strategies', () => {
    it('should handle data-testid selectors optimally', () => {
      const cypressCommand: CypressCommand = {
        command: 'get',
        args: ['[data-testid="login-button"]']
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('page.getByTestId(\'login-button\')');
      expect(result.requiresAwait).toBe(false);
    });

    it('should handle role-based selectors', () => {
      const cypressCommand: CypressCommand = {
        command: 'get',
        args: ['[role="button"]']
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('page.getByRole(\'button\')');
      expect(result.requiresAwait).toBe(false);
    });

    it('should handle label selectors', () => {
      const cypressCommand: CypressCommand = {
        command: 'get',
        args: ['[aria-label="Close dialog"]']
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('page.getByLabel(\'Close dialog\')');
      expect(result.requiresAwait).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle unknown commands gracefully', () => {
      const cypressCommand: CypressCommand = {
        command: 'unknownCommand',
        args: ['arg1']
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe('// TODO: Convert unknown Cypress command: unknownCommand');
      expect(result.warnings).toContain('Unknown Cypress command: unknownCommand');
    });

    it('should handle complex chained methods with warnings', () => {
      const cypressCommand: CypressCommand = {
        command: 'get',
        args: ['.element'],
        chainedCalls: [
          { method: 'its', args: ['length'] },
          { method: 'should', args: ['eq', 3] }
        ]
      };

      const result = converter.convertCommand(cypressCommand);

      expect(result.warnings?.length).toBeGreaterThan(0);
    });
  });

  describe('page object conversion', () => {
    it('should convert custom commands to page object method calls', () => {
      const customCommand = {
        name: 'login',
        type: 'add' as const,
        parameters: ['username', 'password'],
        body: 'cy.get("[data-testid=username]").type(username); cy.get("[data-testid=password]").type(password);'
      };

      const result = converter.convertCustomCommandToPageObject(customCommand);

      expect(result.className).toBe('LoginPage');
      expect(result.methodName).toBe('login');
      expect(result.parameters).toEqual(['username', 'password']);
      expect(result.playwrightCode).toContain('async login(username, password)');
      expect(result.playwrightCode).toContain('await this.page.getByTestId(\'username\').fill(username)');
      expect(result.playwrightCode).toContain('await this.page.getByTestId(\'password\').fill(password)');
    });

    it('should handle custom commands with no parameters', () => {
      const customCommand = {
        name: 'logout',
        type: 'add' as const,
        parameters: [],
        body: 'cy.get("[data-testid=logout]").click();'
      };

      const result = converter.convertCustomCommandToPageObject(customCommand);

      expect(result.methodName).toBe('logout');
      expect(result.parameters).toEqual([]);
      expect(result.playwrightCode).toContain('async logout()');
    });
  });
});