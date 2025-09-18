import {
  CypressCommand,
  ConvertedCommand,
  CustomCommand,
  PageObjectMethod,
  CommandMapping,
  AssertionMapping,
  ConversionContext,
  ChainedCall
} from './types';

export class CommandConverter {
  private commandMappings: Map<string, CommandMapping> = new Map();
  private assertionMappings: Map<string, AssertionMapping> = new Map();

  constructor() {
    this.initializeCommandMappings();
    this.initializeAssertionMappings();
  }

  /**
   * Convert a Cypress command to Playwright equivalent
   */
  convertCommand(cypressCommand: CypressCommand): ConvertedCommand {
    const context: ConversionContext = {
      usesPageObject: false,
      imports: new Set(['@playwright/test']),
      warnings: []
    };

    try {
      // Handle commands without chained calls first
      if (!cypressCommand.chainedCalls || cypressCommand.chainedCalls.length === 0) {
        return this.convertSingleCommand(cypressCommand, context);
      }

      // Handle commands with chained calls
      return this.convertChainedCommand(cypressCommand, context);
    } catch (error) {
      return {
        playwrightCode: `// TODO: Error converting command: ${cypressCommand.command}`,
        requiresAwait: false,
        warnings: [`Error converting command: ${error}`]
      };
    }
  }

  /**
   * Convert a single Cypress command without chained calls
   */
  private convertSingleCommand(command: CypressCommand, context: ConversionContext): ConvertedCommand {
    const mapping = this.commandMappings.get(command.command);

    if (!mapping) {
      context.warnings.push(`Unknown Cypress command: ${command.command}`);
      return {
        playwrightCode: `// TODO: Convert unknown Cypress command: ${command.command}`,
        requiresAwait: false,
        warnings: Array.from(context.warnings),
        imports: Array.from(context.imports)
      };
    }

    let playwrightCode: string;

    if (mapping.transformation) {
      playwrightCode = mapping.transformation(command.args);
      // Add warning for wait with alias
      if (command.command === 'wait' && typeof command.args[0] === 'string' && command.args[0].startsWith('@')) {
        context.warnings.push('cy.wait(@alias) converted to generic API wait - may need manual adjustment');
      }
    } else {
      const args = this.formatArguments(command.args);
      playwrightCode = `${mapping.playwrightEquivalent}${args}`;
    }

    if (mapping.requiresAwait) {
      playwrightCode = `await ${playwrightCode}`;
    }

    return {
      playwrightCode,
      requiresAwait: mapping.requiresAwait,
      imports: Array.from(context.imports),
      warnings: context.warnings.length > 0 ? context.warnings : undefined
    };
  }

  /**
   * Convert a Cypress command with chained calls
   */
  private convertChainedCommand(command: CypressCommand, context: ConversionContext): ConvertedCommand {
    const parts: string[] = [];
    let requiresAwait = false;

    // Start with the base command
    const baseLocator = this.getBaseLocator(command, context);

    // Handle multiple chained calls (including those with assertions)
    if (command.chainedCalls!.length > 1) {
      return this.convertMultipleChainedCalls(command, context);
    }

    // Handle special case for action commands with single chained calls
    if (['intercept', 'wait', 'visit'].includes(command.command)) {
      return this.convertMultipleChainedCalls(command, context);
    }

    // Check if single chained call is an assertion
    const hasAssertion = command.chainedCalls!.some(call => call.method === 'should');

    if (hasAssertion) {
      return this.convertCommandWithAssertion(command, context);
    }

    // Handle single chained call
    const chainedCall = command.chainedCalls![0];
    const convertedChain = this.convertChainedCall(baseLocator, chainedCall, context);

    if (convertedChain.requiresAwait) {
      requiresAwait = true;
    }

    let playwrightCode = convertedChain.code;
    if (requiresAwait) {
      playwrightCode = `await ${playwrightCode}`;
    }

    return {
      playwrightCode,
      requiresAwait,
      imports: Array.from(context.imports),
      warnings: context.warnings.length > 0 ? context.warnings : undefined
    };
  }

  /**
   * Convert command with assertion (should)
   */
  private convertCommandWithAssertion(command: CypressCommand, context: ConversionContext): ConvertedCommand {
    const baseLocator = this.getBaseLocator(command, context);
    const shouldCall = command.chainedCalls!.find(call => call.method === 'should');

    if (!shouldCall) {
      throw new Error('Expected should call not found');
    }

    // Handle special cases like cy.url().should(...)
    if (command.command === 'url') {
      return this.convertUrlAssertion(shouldCall, context);
    }

    const assertionKey = shouldCall.args[0] as string;
    const assertionMapping = this.assertionMappings.get(assertionKey);

    if (!assertionMapping) {
      context.warnings.push(`Unknown assertion: ${assertionKey}`);
      return {
        playwrightCode: `// TODO: Convert unknown assertion: ${assertionKey}`,
        requiresAwait: true,
        warnings: Array.from(context.warnings),
        imports: Array.from(context.imports)
      };
    }

    let playwrightCode: string;
    if (assertionMapping.transformation) {
      playwrightCode = assertionMapping.transformation([baseLocator, ...shouldCall.args.slice(1)]);
    } else {
      const additionalArgs = shouldCall.args.slice(1);
      const formattedArgs = additionalArgs.length > 0 ? this.formatArguments(additionalArgs) : '()';
      playwrightCode = `await expect(${baseLocator}).${assertionMapping.playwrightAssertion}${formattedArgs}`;
    }

    return {
      playwrightCode,
      requiresAwait: true,
      imports: Array.from(context.imports),
      warnings: context.warnings.length > 0 ? context.warnings : undefined
    };
  }

  /**
   * Convert multiple chained calls into separate statements
   */
  private convertMultipleChainedCalls(command: CypressCommand, context: ConversionContext): ConvertedCommand {
    const statements: string[] = [];
    let requiresAwait = false;

    // For certain commands like intercept, we need to execute the base command
    if (['intercept', 'wait', 'visit'].includes(command.command)) {
      const mapping = this.commandMappings.get(command.command);
      if (mapping) {
        let baseStatement: string;
        if (mapping.transformation) {
          baseStatement = mapping.transformation(command.args);
          // Add warning for wait with alias in this context too
          if (command.command === 'wait' && typeof command.args[0] === 'string' && command.args[0].startsWith('@')) {
            context.warnings.push('cy.wait(@alias) converted to generic API wait - may need manual adjustment');
          }
        } else {
          const args = this.formatArguments(command.args);
          baseStatement = `${mapping.playwrightEquivalent}${args}`;
        }

        if (mapping.requiresAwait) {
          baseStatement = `await ${baseStatement}`;
          requiresAwait = true;
        }
        statements.push(baseStatement);
      }
    }

    const baseLocator = this.getBaseLocator(command, context);

    for (const chainedCall of command.chainedCalls!) {
      if (chainedCall.method === 'should') {
        // Handle assertion
        const assertionKey = chainedCall.args[0] as string;
        const assertionMapping = this.assertionMappings.get(assertionKey);

        if (assertionMapping) {
          let assertion: string;
          if (assertionMapping.transformation) {
            assertion = assertionMapping.transformation([baseLocator, ...chainedCall.args.slice(1)]);
          } else {
            const additionalArgs = chainedCall.args.slice(1);
            const formattedArgs = additionalArgs.length > 0 ? this.formatArguments(additionalArgs) : '()';
            assertion = `await expect(${baseLocator}).${assertionMapping.playwrightAssertion}${formattedArgs}`;
          }
          statements.push(assertion);
          requiresAwait = true;
        }
      } else {
        // Handle action
        const converted = this.convertChainedCall(baseLocator, chainedCall, context);
        let statement = converted.code;
        if (statement.trim()) { // Only add non-empty statements
          if (converted.requiresAwait) {
            statement = `await ${statement}`;
            requiresAwait = true;
          }
          statements.push(statement);
        }
      }
    }

    return {
      playwrightCode: statements.join(';\n'),
      requiresAwait,
      imports: Array.from(context.imports),
      warnings: context.warnings.length > 0 ? context.warnings : undefined
    };
  }

  /**
   * Get base locator for a Cypress command
   */
  private getBaseLocator(command: CypressCommand, context: ConversionContext): string {
    switch (command.command) {
      case 'get':
        return this.optimizeSelector(command.args[0] as string);
      case 'contains':
        return `page.getByText(${this.formatValue(command.args[0])})`;
      case 'url':
        return 'page.url()';
      default:
        const mapping = this.commandMappings.get(command.command);
        if (mapping && mapping.transformation) {
          const result = mapping.transformation(command.args);
          // Add warning for wait with alias
          if (command.command === 'wait' && typeof command.args[0] === 'string' && command.args[0].startsWith('@')) {
            context.warnings.push('cy.wait(@alias) converted to generic API wait - may need manual adjustment');
          }
          return result;
        }
        const args = this.formatArguments(command.args);
        return mapping ? `${mapping.playwrightEquivalent}${args}` : `// Unknown command: ${command.command}`;
    }
  }

  /**
   * Convert a chained call method
   */
  private convertChainedCall(baseLocator: string, chainedCall: ChainedCall, context: ConversionContext): { code: string; requiresAwait: boolean } {
    switch (chainedCall.method) {
      case 'click':
        return { code: `${baseLocator}.click()`, requiresAwait: true };
      case 'type':
        return { code: `${baseLocator}.fill(${this.formatValue(chainedCall.args[0])})`, requiresAwait: true };
      case 'clear':
        return { code: `${baseLocator}.clear()`, requiresAwait: true };
      case 'check':
        return { code: `${baseLocator}.check()`, requiresAwait: true };
      case 'uncheck':
        return { code: `${baseLocator}.uncheck()`, requiresAwait: true };
      case 'select':
        return { code: `${baseLocator}.selectOption(${this.formatValue(chainedCall.args[0])})`, requiresAwait: true };
      case 'focus':
        return { code: `${baseLocator}.focus()`, requiresAwait: true };
      case 'blur':
        return { code: `${baseLocator}.blur()`, requiresAwait: true };
      case 'as':
        // Cypress aliases are not needed in Playwright in the same way
        context.warnings.push(`Cypress alias '${chainedCall.args[0]}' converted - consider storing in variable instead`);
        return { code: '', requiresAwait: false };
      default:
        context.warnings.push(`Unknown chained method: ${chainedCall.method}`);
        return { code: `${baseLocator}./* TODO: ${chainedCall.method} */`, requiresAwait: false };
    }
  }

  /**
   * Convert URL-specific assertions
   */
  private convertUrlAssertion(shouldCall: ChainedCall, context: ConversionContext): ConvertedCommand {
    const assertionType = shouldCall.args[0] as string;
    const expectedValue = shouldCall.args[1];

    switch (assertionType) {
      case 'include':
        return {
          playwrightCode: `await expect(page).toHaveURL(/.*${this.escapeRegex(expectedValue as string)}.*/)`,
          requiresAwait: true,
          imports: Array.from(context.imports)
        };
      case 'eq':
        return {
          playwrightCode: `await expect(page).toHaveURL('${expectedValue}')`,
          requiresAwait: true,
          imports: Array.from(context.imports)
        };
      default:
        context.warnings.push(`Unknown URL assertion: ${assertionType}`);
        return {
          playwrightCode: `// TODO: Convert unknown URL assertion: ${assertionType}`,
          requiresAwait: true,
          warnings: Array.from(context.warnings),
          imports: Array.from(context.imports)
        };
    }
  }

  /**
   * Optimize CSS selectors to use Playwright's semantic selectors
   */
  private optimizeSelector(selector: string): string {
    // Handle data-testid
    const testIdMatch = selector.match(/\[data-testid=["']([^"']+)["']\]/) ||
                       selector.match(/\[data-testid=([^[\]]+)\]/);
    if (testIdMatch) {
      const value = testIdMatch[1].replace(/['"]/g, '');
      return `page.getByTestId('${value}')`;
    }

    // Handle role
    const roleMatch = selector.match(/\[role=["']([^"']+)["']\]/) ||
                     selector.match(/\[role=([^[\]]+)\]/);
    if (roleMatch) {
      const value = roleMatch[1].replace(/['"]/g, '');
      return `page.getByRole('${value}')`;
    }

    // Handle aria-label
    const labelMatch = selector.match(/\[aria-label=["']([^"']+)["']\]/) ||
                      selector.match(/\[aria-label=([^[\]]+)\]/);
    if (labelMatch) {
      const value = labelMatch[1].replace(/['"]/g, '');
      return `page.getByLabel('${value}')`;
    }

    // Handle placeholder
    const placeholderMatch = selector.match(/\[placeholder=["']([^"']+)["']\]/);
    if (placeholderMatch) {
      return `page.getByPlaceholder('${placeholderMatch[1]}')`;
    }

    // Fall back to generic locator
    return `page.locator(${this.formatValue(selector)})`;
  }

  /**
   * Convert custom command to page object method
   */
  convertCustomCommandToPageObject(customCommand: CustomCommand): PageObjectMethod {
    const className = this.generatePageObjectClassName(customCommand.name);
    const methodCode = this.convertCustomCommandBody(customCommand);

    return {
      className,
      methodName: customCommand.name,
      parameters: customCommand.parameters,
      playwrightCode: methodCode,
      imports: ['@playwright/test']
    };
  }

  /**
   * Convert custom command body to Playwright code
   */
  private convertCustomCommandBody(customCommand: CustomCommand): string {
    const params = customCommand.parameters.join(', ');
    const lines: string[] = [
      `async ${customCommand.name}(${params}) {`
    ];

    // Simple conversion of common patterns in custom command body
    let body = customCommand.body;

    // Convert cy.get patterns
    body = body.replace(/cy\.get\(\s*["']([^"']+)["']\s*\)\.type\(\s*(\w+)\s*\)/g,
      (match, selector, param) => {
        const optimizedSelector = this.optimizeSelector(selector);
        return `await this.page.${optimizedSelector.replace('page.', '')}.fill(${param})`;
      });

    body = body.replace(/cy\.get\(\s*["']([^"']+)["']\s*\)\.click\(\s*\)/g,
      (match, selector) => {
        const optimizedSelector = this.optimizeSelector(selector);
        return `await this.page.${optimizedSelector.replace('page.', '')}.click()`;
      });

    // Convert cy.visit
    body = body.replace(/cy\.visit\(\s*["']([^"']+)["']\s*\)/g,
      'await this.page.goto(\'$1\')');

    // Split into statements and clean up
    const statements = body.split(';').filter(stmt => stmt.trim());

    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) {
        lines.push(`  ${trimmed};`);
      }
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Generate page object class name from command name
   */
  private generatePageObjectClassName(commandName: string): string {
    return commandName.charAt(0).toUpperCase() + commandName.slice(1) + 'Page';
  }

  /**
   * Initialize command mappings
   */
  private initializeCommandMappings(): void {
    this.commandMappings = new Map([
      ['visit', {
        cypressCommand: 'visit',
        playwrightEquivalent: 'page.goto',
        requiresAwait: true
      }],
      ['get', {
        cypressCommand: 'get',
        playwrightEquivalent: 'page.locator',
        requiresAwait: false,
        transformation: (args: any[]) => {
          const selector = args[0] as string;

          // Handle data-testid
          const testIdMatch = selector.match(/\[data-testid=["']([^"']+)["']\]/) ||
                             selector.match(/\[data-testid=([^[\]]+)\]/);
          if (testIdMatch) {
            const value = testIdMatch[1].replace(/['"]/g, '');
            return `page.getByTestId('${value}')`;
          }

          // Handle role
          const roleMatch = selector.match(/\[role=["']([^"']+)["']\]/) ||
                           selector.match(/\[role=([^[\]]+)\]/);
          if (roleMatch) {
            const value = roleMatch[1].replace(/['"]/g, '');
            return `page.getByRole('${value}')`;
          }

          // Handle aria-label
          const labelMatch = selector.match(/\[aria-label=["']([^"']+)["']\]/) ||
                            selector.match(/\[aria-label=([^[\]]+)\]/);
          if (labelMatch) {
            const value = labelMatch[1].replace(/['"]/g, '');
            return `page.getByLabel('${value}')`;
          }

          // Handle placeholder
          const placeholderMatch = selector.match(/\[placeholder=["']([^"']+)["']\]/);
          if (placeholderMatch) {
            return `page.getByPlaceholder('${placeholderMatch[1]}')`;
          }

          // Fall back to generic locator
          const formattedSelector = typeof selector === 'string' ? `'${selector.replace(/'/g, "\\'")}'` : String(selector);
          return `page.locator(${formattedSelector})`;
        }
      }],
      ['contains', {
        cypressCommand: 'contains',
        playwrightEquivalent: 'page.getByText',
        requiresAwait: false
      }],
      ['url', {
        cypressCommand: 'url',
        playwrightEquivalent: 'page.url',
        requiresAwait: false
      }],
      ['wait', {
        cypressCommand: 'wait',
        playwrightEquivalent: 'page.waitForTimeout',
        requiresAwait: true,
        transformation: (args: any[]) => {
          if (typeof args[0] === 'string' && args[0].startsWith('@')) {
            return 'page.waitForResponse(resp => resp.url().includes(\'/api/\') && resp.status() === 200)';
          }
          return `page.waitForTimeout(${args[0]})`;
        }
      }],
      ['intercept', {
        cypressCommand: 'intercept',
        playwrightEquivalent: 'page.route',
        requiresAwait: true,
        transformation: (args: any[]) => {
          const method = args[0];
          const url = args[1];
          return `page.route('${url}', route => route.continue())`;
        }
      }]
    ]);
  }

  /**
   * Initialize assertion mappings
   */
  private initializeAssertionMappings(): void {
    this.assertionMappings = new Map([
      ['be.visible', {
        cypressAssertion: 'be.visible',
        playwrightAssertion: 'toBeVisible'
      }],
      ['be.hidden', {
        cypressAssertion: 'be.hidden',
        playwrightAssertion: 'toBeHidden'
      }],
      ['be.enabled', {
        cypressAssertion: 'be.enabled',
        playwrightAssertion: 'toBeEnabled'
      }],
      ['be.disabled', {
        cypressAssertion: 'be.disabled',
        playwrightAssertion: 'toBeDisabled'
      }],
      ['contain.text', {
        cypressAssertion: 'contain.text',
        playwrightAssertion: 'toContainText'
      }],
      ['have.text', {
        cypressAssertion: 'have.text',
        playwrightAssertion: 'toHaveText'
      }],
      ['have.value', {
        cypressAssertion: 'have.value',
        playwrightAssertion: 'toHaveValue'
      }],
      ['have.length', {
        cypressAssertion: 'have.length',
        playwrightAssertion: 'toHaveCount'
      }],
      ['include', {
        cypressAssertion: 'include',
        playwrightAssertion: 'toContainText',
        transformation: (args: any[]) => {
          const baseLocator = args[0];
          const value = args[1];
          if (baseLocator.includes('page.url()')) {
            const escapedValue = value.replace(/\//g, '\\/');
            return `await expect(page).toHaveURL(/.*${escapedValue}.*/)`;
          }
          const formattedValue = typeof value === 'string' ? `'${value}'` : String(value);
          return `await expect(${baseLocator}).toContainText(${formattedValue})`;
        }
      }]
    ]);
  }

  /**
   * Format arguments for code generation
   */
  private formatArguments(args: (string | number | boolean)[]): string {
    if (args.length === 0) return '()';
    const formattedArgs = args.map(arg => this.formatValue(arg)).join(', ');
    return `(${formattedArgs})`;
  }

  /**
   * Format a single value for code generation
   */
  private formatValue(value: string | number | boolean): string {
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "\\'")}'`;
    }
    return String(value);
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  }
}