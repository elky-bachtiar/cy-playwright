import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { ASTParser } from '../src/ast-parser';
import { CypressCommand, CypressTestFile, CustomCommand } from '../src/types';

describe('ASTParser', () => {
  let parser: ASTParser;
  let testDir: string;

  beforeEach(async () => {
    parser = new ASTParser();
    testDir = path.join(__dirname, 'temp-ast');
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('file detection', () => {
    it('should detect JavaScript Cypress test files', () => {
      const files = [
        'test.cy.js',
        'spec.spec.js',
        'integration.test.js',
        'e2e/login.cy.js',
        'pages/home.js' // should not match
      ];

      const cypressFiles = parser.detectCypressTestFiles(files);

      expect(cypressFiles).toHaveLength(4);
      expect(cypressFiles).toContain('test.cy.js');
      expect(cypressFiles).toContain('spec.spec.js');
      expect(cypressFiles).toContain('integration.test.js');
      expect(cypressFiles).toContain('e2e/login.cy.js');
      expect(cypressFiles).not.toContain('pages/home.js');
    });

    it('should detect TypeScript Cypress test files', () => {
      const files = [
        'test.cy.ts',
        'spec.spec.ts',
        'integration.test.ts',
        'components/button.cy.tsx',
        'utils.ts' // should not match
      ];

      const cypressFiles = parser.detectCypressTestFiles(files);

      expect(cypressFiles).toHaveLength(4);
      expect(cypressFiles).toContain('test.cy.ts');
      expect(cypressFiles).toContain('spec.spec.ts');
      expect(cypressFiles).toContain('integration.test.ts');
      expect(cypressFiles).toContain('components/button.cy.tsx');
      expect(cypressFiles).not.toContain('utils.ts');
    });

    it('should detect custom command files', () => {
      const files = [
        'cypress/support/commands.js',
        'cypress/support/commands.ts',
        'support/custom-commands.js',
        'commands/login.js',
        'regular.js' // should not match
      ];

      const commandFiles = parser.detectCustomCommandFiles(files);

      expect(commandFiles).toHaveLength(4);
      expect(commandFiles).toContain('cypress/support/commands.js');
      expect(commandFiles).toContain('cypress/support/commands.ts');
      expect(commandFiles).toContain('support/custom-commands.js');
      expect(commandFiles).toContain('commands/login.js');
      expect(commandFiles).not.toContain('regular.js');
    });
  });

  describe('AST parsing', () => {
    it('should parse simple Cypress test file', async () => {
      const testContent = `
        describe('Sample Test', () => {
          it('should login', () => {
            cy.visit('/login');
            cy.get('[data-testid="username"]').type('user');
            cy.get('[data-testid="password"]').type('pass');
            cy.get('[data-testid="submit"]').click();
            cy.url().should('include', '/dashboard');
          });
        });
      `;

      const testFile = path.join(testDir, 'sample.cy.js');
      await fs.writeFile(testFile, testContent);

      const result = await parser.parseTestFile(testFile);

      expect(result.filePath).toBe(testFile);
      expect(result.describes).toHaveLength(1);
      expect(result.describes[0].name).toBe('Sample Test');
      expect(result.describes[0].tests).toHaveLength(1);
      expect(result.describes[0].tests[0].name).toBe('should login');
      expect(result.cypressCommands).toHaveLength(5);
    });

    it('should extract Cypress commands from test file', async () => {
      const testContent = `
        it('test commands', () => {
          cy.visit('/page');
          cy.get('.element').click();
          cy.contains('text').should('be.visible');
          cy.intercept('GET', '/api/data').as('getData');
          cy.wait('@getData');
        });
      `;

      const testFile = path.join(testDir, 'commands.cy.js');
      await fs.writeFile(testFile, testContent);

      const result = await parser.parseTestFile(testFile);

      expect(result.cypressCommands).toHaveLength(5);

      const commands = result.cypressCommands;
      expect(commands[0].command).toBe('visit');
      expect(commands[0].args).toEqual(['/page']);

      expect(commands[1].command).toBe('get');
      expect(commands[1].args).toEqual(['.element']);
      expect(commands[1].chainedCalls).toHaveLength(1);
      expect(commands[1].chainedCalls![0].method).toBe('click');

      expect(commands[2].command).toBe('contains');
      expect(commands[2].args).toEqual(['text']);
      expect(commands[2].chainedCalls).toHaveLength(1);
      expect(commands[2].chainedCalls![0].method).toBe('should');
      expect(commands[2].chainedCalls![0].args).toEqual(['be.visible']);

      expect(commands[3].command).toBe('intercept');
      expect(commands[3].args).toEqual(['GET', '/api/data']);
      expect(commands[3].chainedCalls).toHaveLength(1);
      expect(commands[3].chainedCalls![0].method).toBe('as');
      expect(commands[3].chainedCalls![0].args).toEqual(['getData']);

      expect(commands[4].command).toBe('wait');
      expect(commands[4].args).toEqual(['@getData']);
    });

    it('should handle nested describes and multiple tests', async () => {
      const testContent = `
        describe('Main Suite', () => {
          describe('Nested Suite', () => {
            it('test 1', () => {
              cy.visit('/test1');
            });

            it('test 2', () => {
              cy.visit('/test2');
            });
          });

          it('root test', () => {
            cy.visit('/root');
          });
        });
      `;

      const testFile = path.join(testDir, 'nested.cy.js');
      await fs.writeFile(testFile, testContent);

      const result = await parser.parseTestFile(testFile);

      expect(result.describes).toHaveLength(1);
      expect(result.describes[0].name).toBe('Main Suite');
      expect(result.describes[0].describes).toHaveLength(1);
      expect(result.describes[0].describes![0].name).toBe('Nested Suite');
      expect(result.describes[0].describes![0].tests).toHaveLength(2);
      expect(result.describes[0].tests).toHaveLength(1);
      expect(result.describes[0].tests[0].name).toBe('root test');
      expect(result.cypressCommands).toHaveLength(3);
    });

    it('should parse custom commands file', async () => {
      const commandsContent = `
        Cypress.Commands.add('login', (username, password) => {
          cy.visit('/login');
          cy.get('[data-testid="username"]').type(username);
          cy.get('[data-testid="password"]').type(password);
          cy.get('[data-testid="submit"]').click();
        });

        Cypress.Commands.add('logout', () => {
          cy.get('[data-testid="logout"]').click();
        });

        Cypress.Commands.overwrite('visit', (originalFn, url, options) => {
          return originalFn(url, { ...options, failOnStatusCode: false });
        });
      `;

      const commandsFile = path.join(testDir, 'commands.js');
      await fs.writeFile(commandsFile, commandsContent);

      const result = await parser.parseCustomCommands(commandsFile);

      expect(result).toHaveLength(3);

      expect(result[0].name).toBe('login');
      expect(result[0].type).toBe('add');
      expect(result[0].parameters).toEqual(['username', 'password']);
      expect(result[0].body).toContain('cy.visit(\'/login\')');

      expect(result[1].name).toBe('logout');
      expect(result[1].type).toBe('add');
      expect(result[1].parameters).toEqual([]);

      expect(result[2].name).toBe('visit');
      expect(result[2].type).toBe('overwrite');
      expect(result[2].parameters).toEqual(['originalFn', 'url', 'options']);
    });

    it('should handle TypeScript syntax', async () => {
      const testContent = `
        describe('TypeScript Test', () => {
          it('should handle types', () => {
            const user: string = 'testuser';
            cy.visit('/login');
            cy.get<HTMLInputElement>('[data-testid="username"]').type(user);
          });
        });
      `;

      const testFile = path.join(testDir, 'typescript.cy.ts');
      await fs.writeFile(testFile, testContent);

      const result = await parser.parseTestFile(testFile);

      expect(result.filePath).toBe(testFile);
      expect(result.describes[0].name).toBe('TypeScript Test');
      expect(result.cypressCommands).toHaveLength(2);
      expect(result.cypressCommands[0].command).toBe('visit');
      expect(result.cypressCommands[1].command).toBe('get');
    });

    it('should extract imports and dependencies', async () => {
      const testContent = `
        import { fixture } from '../support/fixtures';
        import { users } from '../data/users';

        describe('Import Test', () => {
          it('should detect imports', () => {
            cy.visit('/test');
          });
        });
      `;

      const testFile = path.join(testDir, 'imports.cy.ts');
      await fs.writeFile(testFile, testContent);

      const result = await parser.parseTestFile(testFile);

      expect(result.imports).toHaveLength(2);
      expect(result.imports![0]).toEqual({
        namedImports: ['fixture'],
        source: '../support/fixtures'
      });
      expect(result.imports![1]).toEqual({
        namedImports: ['users'],
        source: '../data/users'
      });
    });
  });

  describe('error handling', () => {
    it('should handle invalid JavaScript syntax', async () => {
      const invalidContent = `
        describe('Invalid Test' () => { // missing comma
          it('test', () => {
            cy.visit('/test');
          });
      `;

      const testFile = path.join(testDir, 'invalid.cy.js');
      await fs.writeFile(testFile, invalidContent);

      await expect(parser.parseTestFile(testFile)).rejects.toThrow();
    });

    it('should handle missing files', async () => {
      const nonExistentFile = path.join(testDir, 'missing.cy.js');

      await expect(parser.parseTestFile(nonExistentFile)).rejects.toThrow();
    });
  });
});