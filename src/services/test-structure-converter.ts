import { CypressTestFile, CypressDescribe, CypressTest, CypressHook } from '../types';

export interface ConvertedTestStructure {
  content: string;
  warnings: string[];
}

export interface TestConversionOptions {
  preserveHooks?: boolean;
  convertAssertions?: boolean;
  usePageObjects?: boolean;
}

export class TestStructureConverter {

  /**
   * Convert complete Cypress test file structure to Playwright
   */
  convertTestFile(
    cypressFile: CypressTestFile,
    options: TestConversionOptions = {}
  ): ConvertedTestStructure {
    const warnings: string[] = [];
    const {
      preserveHooks = true,
      convertAssertions = true,
      usePageObjects = false
    } = options;

    // Generate imports
    const imports = this.generatePlaywrightImports(cypressFile, usePageObjects);

    // Convert describe blocks
    const describeBlocks = cypressFile.describes
      .map(describe => this.convertDescribeBlock(describe, options, warnings))
      .join('\n\n');

    const content = `${imports}\n\n${describeBlocks}`;

    return {
      content,
      warnings
    };
  }

  /**
   * Generate Playwright imports
   */
  private generatePlaywrightImports(cypressFile: CypressTestFile, usePageObjects: boolean): string {
    const imports = ["import { test, expect } from '@playwright/test';"];

    if (usePageObjects) {
      // Extract page object imports from original file
      const pageObjectImports = cypressFile.imports?.filter(imp =>
        imp.source.includes('./pages/') || imp.source.includes('../pages/')
      ) || [];

      for (const imp of pageObjectImports) {
        if (imp.namedImports) {
          imports.push(`import { ${imp.namedImports.join(', ')} } from '${imp.source}';`);
        }
        if (imp.defaultImport) {
          imports.push(`import ${imp.defaultImport} from '${imp.source}';`);
        }
      }
    }

    // Add other necessary imports
    const hasFixtures = cypressFile.cypressCommands.some(cmd => cmd.command === 'fixture');
    if (hasFixtures) {
      imports.push("import * as fs from 'fs-extra';");
      imports.push("import * as path from 'path';");
    }

    return imports.join('\n');
  }

  /**
   * Convert Cypress describe block to Playwright test.describe
   */
  private convertDescribeBlock(
    describe: CypressDescribe,
    options: TestConversionOptions,
    warnings: string[]
  ): string {
    const { preserveHooks = true } = options;
    const parts: string[] = [];

    // Convert hooks if present
    let hooks = '';
    if (preserveHooks && describe.hooks) {
      hooks = describe.hooks
        .map(hook => this.convertHook(hook, warnings))
        .join('\n\n');
    }

    // Convert tests
    const tests = describe.tests
      .map(test => this.convertTest(test, options, warnings))
      .join('\n\n');

    // Handle nested describes
    let nestedDescribes = '';
    if (describe.describes) {
      nestedDescribes = describe.describes
        .map(nestedDescribe => this.convertDescribeBlock(nestedDescribe, options, warnings))
        .join('\n\n');
    }

    const content = [hooks, tests, nestedDescribes].filter(Boolean).join('\n\n');

    return `test.describe('${describe.name}', () => {
${this.indentContent(content, 2)}
});`;
  }

  /**
   * Convert Cypress test to Playwright test
   */
  private convertTest(
    cypressTest: CypressTest,
    options: TestConversionOptions,
    warnings: string[]
  ): string {
    const { convertAssertions = true } = options;

    // Convert commands to Playwright syntax
    const convertedCommands = cypressTest.commands
      .map(command => this.convertCommandToPlaywright(command, convertAssertions, warnings))
      .filter(Boolean)
      .join('\n');

    return `  test('${cypressTest.name}', async ({ page }) => {
${this.indentContent(convertedCommands, 4)}
  });`;
  }

  /**
   * Convert Cypress hook to Playwright hook
   */
  private convertHook(hook: CypressHook, warnings: string[]): string {
    const playwrightHook = this.mapCypressHookToPlaywright(hook.type);

    if (!playwrightHook) {
      warnings.push(`Hook type '${hook.type}' has no direct Playwright equivalent`);
      return `  // TODO: Convert ${hook.type} hook manually`;
    }

    const convertedCommands = hook.commands
      .map(command => this.convertCommandToPlaywright(command, true, warnings))
      .filter(Boolean)
      .join('\n');

    return `  ${playwrightHook}(async ({ page }) => {
${this.indentContent(convertedCommands, 4)}
  });`;
  }

  /**
   * Map Cypress hook types to Playwright equivalents
   */
  private mapCypressHookToPlaywright(hookType: CypressHook['type']): string | null {
    const mapping: Record<CypressHook['type'], string> = {
      'before': 'test.beforeAll',
      'beforeEach': 'test.beforeEach',
      'after': 'test.afterAll',
      'afterEach': 'test.afterEach'
    };

    return mapping[hookType] || null;
  }

  /**
   * Convert individual Cypress command to Playwright
   */
  private convertCommandToPlaywright(
    command: any,
    convertAssertions: boolean,
    warnings: string[]
  ): string {
    const { command: cmdName, args, chainedCalls } = command;

    // Handle context blocks (should not appear as commands, but just in case)
    if (cmdName === 'context') {
      warnings.push('Cypress context() found as command - should be handled as describe block');
      return `// TODO: Convert context block: ${args[0]}`;
    }

    // Convert basic commands
    switch (cmdName) {
      case 'visit':
        return `    await page.goto('${args[0]}');`;

      case 'get':
        return this.convertGetCommand(args[0], chainedCalls, convertAssertions, warnings);

      case 'contains':
        return this.convertContainsCommand(args[0], chainedCalls, convertAssertions, warnings);

      case 'wait':
        if (typeof args[0] === 'number') {
          return `    await page.waitForTimeout(${args[0]});`;
        } else if (typeof args[0] === 'string' && args[0].startsWith('@')) {
          warnings.push(`cy.wait('${args[0]}') converted to generic API wait - may need adjustment`);
          return `    await page.waitForResponse(resp => resp.url().includes('/api/'));`;
        }
        return `    // TODO: Convert wait command: ${args[0]}`;

      case 'intercept':
        const method = args[0];
        const url = args[1];
        return `    await page.route('**${url}', route => route.continue());`;

      case 'fixture':
        const filename = args[0];
        const varName = filename.replace(/[./]/g, '');
        return `    const ${varName} = JSON.parse(await fs.readFile(path.join(__dirname, '../fixtures/${filename}'), 'utf-8'));`;

      default:
        warnings.push(`Unknown command: ${cmdName}`);
        return `    // TODO: Convert command: ${cmdName}`;
    }
  }

  /**
   * Convert cy.get() command with chained calls
   */
  private convertGetCommand(
    selector: string,
    chainedCalls: any[] = [],
    convertAssertions: boolean,
    warnings: string[]
  ): string {
    const locator = this.optimizeSelector(selector);

    if (chainedCalls.length === 0) {
      return `    const element = ${locator};`;
    }

    const statements: string[] = [];
    let currentLocator = locator;

    for (const chainedCall of chainedCalls) {
      switch (chainedCall.method) {
        case 'click':
          statements.push(`    await ${currentLocator}.click();`);
          break;

        case 'type':
          const text = chainedCall.args[0];
          statements.push(`    await ${currentLocator}.fill('${text}');`);
          break;

        case 'clear':
          statements.push(`    await ${currentLocator}.clear();`);
          break;

        case 'should':
          if (convertAssertions) {
            const assertion = this.convertAssertion(currentLocator, chainedCall.args, warnings);
            statements.push(`    ${assertion}`);
          } else {
            statements.push(`    // TODO: Convert assertion: ${chainedCall.args[0]}`);
          }
          break;

        case 'find':
          currentLocator = `${currentLocator}.locator('${chainedCall.args[0]}')`;
          break;

        case 'first':
          currentLocator = `${currentLocator}.first()`;
          break;

        case 'last':
          currentLocator = `${currentLocator}.last()`;
          break;

        case 'eq':
          currentLocator = `${currentLocator}.nth(${chainedCall.args[0]})`;
          break;

        default:
          warnings.push(`Unknown chained method: ${chainedCall.method}`);
          statements.push(`    // TODO: Convert chained call: ${chainedCall.method}`);
      }
    }

    return statements.join('\n');
  }

  /**
   * Convert cy.contains() command
   */
  private convertContainsCommand(
    text: string,
    chainedCalls: any[] = [],
    convertAssertions: boolean,
    warnings: string[]
  ): string {
    let locator = `page.getByText('${text}')`;

    if (chainedCalls.length === 0) {
      return `    const element = ${locator};`;
    }

    const statements: string[] = [];

    for (const chainedCall of chainedCalls) {
      switch (chainedCall.method) {
        case 'click':
          statements.push(`    await ${locator}.click();`);
          break;

        case 'should':
          if (convertAssertions) {
            const assertion = this.convertAssertion(locator, chainedCall.args, warnings);
            statements.push(`    ${assertion}`);
          } else {
            statements.push(`    // TODO: Convert assertion: ${chainedCall.args[0]}`);
          }
          break;

        default:
          warnings.push(`Unknown chained method on contains: ${chainedCall.method}`);
          statements.push(`    // TODO: Convert chained call: ${chainedCall.method}`);
      }
    }

    return statements.join('\n');
  }

  /**
   * Convert Cypress assertion to Playwright expect
   */
  private convertAssertion(locator: string, args: any[], warnings: string[]): string {
    const assertionType = args[0];
    const expectedValue = args[1];

    switch (assertionType) {
      case 'be.visible':
        return `await expect(${locator}).toBeVisible();`;

      case 'be.hidden':
        return `await expect(${locator}).toBeHidden();`;

      case 'contain.text':
      case 'contain':
        return `await expect(${locator}).toContainText('${expectedValue}');`;

      case 'have.text':
        return `await expect(${locator}).toHaveText('${expectedValue}');`;

      case 'have.value':
        return `await expect(${locator}).toHaveValue('${expectedValue}');`;

      case 'have.length':
        return `await expect(${locator}).toHaveCount(${expectedValue});`;

      case 'have.class':
        return `await expect(${locator}).toHaveClass(/${expectedValue}/);`;

      case 'be.enabled':
        return `await expect(${locator}).toBeEnabled();`;

      case 'be.disabled':
        return `await expect(${locator}).toBeDisabled();`;

      case 'exist':
        return `await expect(${locator}).toBeVisible();`;

      case 'not.exist':
        return `await expect(${locator}).not.toBeVisible();`;

      default:
        warnings.push(`Unknown assertion type: ${assertionType}`);
        return `// TODO: Convert assertion: ${assertionType}`;
    }
  }

  /**
   * Optimize selector for Playwright
   */
  private optimizeSelector(selector: string): string {
    // Handle data-testid
    const testIdMatch = selector.match(/\[data-testid=["']([^"']+)["']\]/);
    if (testIdMatch) {
      return `page.getByTestId('${testIdMatch[1]}')`;
    }

    // Handle data-cy
    const cyMatch = selector.match(/\[data-cy=["']([^"']+)["']\]/);
    if (cyMatch) {
      return `page.getByTestId('${cyMatch[1]}')`;
    }

    // Handle role
    const roleMatch = selector.match(/\[role=["']([^"']+)["']\]/);
    if (roleMatch) {
      return `page.getByRole('${roleMatch[1]}')`;
    }

    // Handle aria-label
    const labelMatch = selector.match(/\[aria-label=["']([^"']+)["']\]/);
    if (labelMatch) {
      return `page.getByLabel('${labelMatch[1]}')`;
    }

    // Handle placeholder
    const placeholderMatch = selector.match(/\[placeholder=["']([^"']+)["']\]/);
    if (placeholderMatch) {
      return `page.getByPlaceholder('${placeholderMatch[1]}')`;
    }

    // Fall back to generic locator
    return `page.locator('${selector}')`;
  }

  /**
   * Add indentation to content
   */
  private indentContent(content: string, spaces: number): string {
    const indent = ' '.repeat(spaces);
    return content
      .split('\n')
      .map(line => line.trim() ? `${indent}${line}` : line)
      .join('\n');
  }
}