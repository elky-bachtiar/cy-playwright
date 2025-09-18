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
      // Handle custom commands
      if (this.isCustomCommand(cypressCommand.command)) {
        return this.convertCustomCommand(cypressCommand, context);
      }

      // Handle advanced patterns first
      if (this.isAdvancedPattern(cypressCommand)) {
        return this.convertAdvancedPattern(cypressCommand, context);
      }

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
   * Check if a command is a custom command (not built-in Cypress)
   */
  private isCustomCommand(command: string): boolean {
    return !this.commandMappings.has(command) &&
           !['get', 'contains', 'visit', 'wait', 'intercept', 'url', 'window', 'viewport', 'setCookie', 'fixture'].includes(command);
  }

  /**
   * Check if a command uses advanced patterns requiring special handling
   */
  private isAdvancedPattern(cypressCommand: CypressCommand): boolean {
    if (!cypressCommand.chainedCalls || cypressCommand.chainedCalls.length === 0) {
      return false;
    }

    // Complex chaining with multiple assertions
    const hasMultipleAssertions = cypressCommand.chainedCalls.filter(call => call.method === 'should' || call.method === 'and').length > 1;

    // Complex locator patterns (within, find, first, etc.)
    const hasComplexLocators = cypressCommand.chainedCalls.some(call =>
      ['within', 'find', 'first', 'last', 'eq', 'filter', 'not'].includes(call.method)
    );

    // Advanced interaction patterns
    const hasAdvancedInteractions = cypressCommand.chainedCalls.some(call =>
      ['trigger', 'drag', 'selectFile', 'invoke', 'its', 'then'].includes(call.method)
    );

    // Storage and window operations
    const hasStorageOperations = cypressCommand.command === 'window' && cypressCommand.chainedCalls.some(call =>
      call.method === 'its' && (call.args[0] === 'localStorage' || call.args[0] === 'sessionStorage')
    );

    return hasMultipleAssertions || hasComplexLocators || hasAdvancedInteractions || hasStorageOperations;
  }

  /**
   * Convert custom commands with appropriate warnings
   */
  private convertCustomCommand(cypressCommand: CypressCommand, context: ConversionContext): ConvertedCommand {
    context.warnings.push(`Custom command "${cypressCommand.command}" requires manual conversion`);

    const args = cypressCommand.args.length > 0 ? this.formatArguments(cypressCommand.args) : '()';
    let playwrightCode = `// TODO: Convert custom command "${cypressCommand.command}"\nawait page.custom${cypressCommand.command.charAt(0).toUpperCase() + cypressCommand.command.slice(1)}${args}`;

    // Handle chained calls on custom commands
    if (cypressCommand.chainedCalls && cypressCommand.chainedCalls.length > 0) {
      for (const chainedCall of cypressCommand.chainedCalls) {
        playwrightCode += `\n// TODO: Handle chained call: ${chainedCall.method}`;
        if (this.isCustomCommand(chainedCall.method)) {
          context.warnings.push(`Custom command "${chainedCall.method}" requires manual conversion`);
        }
      }
    }

    return {
      playwrightCode,
      requiresAwait: true,
      imports: Array.from(context.imports),
      warnings: context.warnings
    };
  }

  /**
   * Convert advanced Cypress patterns to Playwright
   */
  private convertAdvancedPattern(cypressCommand: CypressCommand, context: ConversionContext): ConvertedCommand {
    // Handle complex chaining with multiple assertions
    if (this.hasMultipleAssertions(cypressCommand)) {
      return this.convertMultipleAssertionPattern(cypressCommand, context);
    }

    // Handle complex locator patterns
    if (this.hasComplexLocators(cypressCommand)) {
      return this.convertComplexLocatorPattern(cypressCommand, context);
    }

    // Handle advanced interaction patterns
    if (this.hasAdvancedInteractions(cypressCommand)) {
      return this.convertAdvancedInteractionPattern(cypressCommand, context);
    }

    // Handle storage operations
    if (this.hasStorageOperations(cypressCommand)) {
      return this.convertStorageOperationPattern(cypressCommand, context);
    }

    // Fallback to regular conversion
    return this.convertChainedCommand(cypressCommand, context);
  }

  /**
   * Convert multiple assertion patterns
   */
  private convertMultipleAssertionPattern(cypressCommand: CypressCommand, context: ConversionContext): ConvertedCommand {
    const baseLocator = this.getBaseLocator(cypressCommand, context);
    const statements: string[] = [];
    let currentElement = baseLocator;

    // If we have multiple assertions on the same element, create a const
    if (cypressCommand.chainedCalls!.filter(call => call.method === 'should' || call.method === 'and').length > 1) {
      const elementName = this.generateElementVariableName(cypressCommand);
      statements.push(`const ${elementName} = ${baseLocator}`);
      currentElement = elementName;
    }

    for (const chainedCall of cypressCommand.chainedCalls!) {
      if (chainedCall.method === 'should' || chainedCall.method === 'and') {
        const assertionKey = chainedCall.args[0] as string;
        const assertionMapping = this.assertionMappings.get(assertionKey);

        if (assertionMapping) {
          let assertion: string;
          if (assertionMapping.transformation) {
            assertion = assertionMapping.transformation([currentElement, ...chainedCall.args.slice(1)]);
          } else {
            const additionalArgs = chainedCall.args.slice(1);
            const formattedArgs = additionalArgs.length > 0 ? this.formatArguments(additionalArgs) : '()';
            assertion = `await expect(${currentElement}).${assertionMapping.playwrightAssertion}${formattedArgs}`;
          }
          statements.push(assertion);
        } else {
          context.warnings.push(`Unknown assertion: ${assertionKey}`);
          statements.push(`// TODO: Convert unknown assertion: ${assertionKey}`);
        }
      } else {
        // Handle non-assertion methods
        const converted = this.convertChainedCall(currentElement, chainedCall, context);
        if (converted.code.trim()) {
          let statement = converted.code;
          if (converted.requiresAwait) {
            statement = `await ${statement}`;
          }
          statements.push(statement);
        }
      }
    }

    return {
      playwrightCode: statements.join('\n'),
      requiresAwait: true,
      imports: Array.from(context.imports),
      warnings: context.warnings.length > 0 ? context.warnings : undefined
    };
  }

  /**
   * Convert complex locator patterns (within, find, first, etc.)
   */
  private convertComplexLocatorPattern(cypressCommand: CypressCommand, context: ConversionContext): ConvertedCommand {
    let currentLocator = this.getBaseLocator(cypressCommand, context);
    const statements: string[] = [];
    let requiresAwait = false;

    for (const chainedCall of cypressCommand.chainedCalls!) {
      switch (chainedCall.method) {
        case 'within':
          // within() in Cypress becomes a scoped locator in Playwright
          break; // Current locator stays the same
        case 'find':
          const selector = chainedCall.args[0] as string;
          currentLocator = `${currentLocator}.locator(${this.formatValue(selector)})`;
          break;
        case 'first':
          currentLocator = `${currentLocator}.first()`;
          break;
        case 'last':
          currentLocator = `${currentLocator}.last()`;
          break;
        case 'eq':
          const index = chainedCall.args[0] as number;
          currentLocator = `${currentLocator}.nth(${index})`;
          break;
        case 'filter':
          const filterSelector = chainedCall.args[0] as string;
          if (typeof filterSelector === 'string' && filterSelector.startsWith(':contains(')) {
            const text = filterSelector.match(/:contains\(["']?([^"')]+)["']?\)/)?.[1];
            if (text) {
              currentLocator = `${currentLocator}.filter({ hasText: ${this.formatValue(text)} })`;
            }
          } else {
            currentLocator = `${currentLocator}.filter({ has: page.locator(${this.formatValue(filterSelector)}) })`;
          }
          break;
        case 'not':
          const notSelector = chainedCall.args[0] as string;
          currentLocator = `${currentLocator}.locator(':not(${notSelector})')`;
          break;
        case 'contains':
          const text = chainedCall.args[0] as string;
          currentLocator = `${currentLocator}.filter({ hasText: ${this.formatValue(text)} })`;
          break;
        case 'should':
          // Handle assertion
          const assertionKey = chainedCall.args[0] as string;
          const assertionMapping = this.assertionMappings.get(assertionKey);
          if (assertionMapping) {
            let assertion: string;
            if (assertionMapping.transformation) {
              assertion = assertionMapping.transformation([currentLocator, ...chainedCall.args.slice(1)]);
            } else {
              const additionalArgs = chainedCall.args.slice(1);
              const formattedArgs = additionalArgs.length > 0 ? this.formatArguments(additionalArgs) : '()';
              assertion = `await expect(${currentLocator}).${assertionMapping.playwrightAssertion}${formattedArgs}`;
            }
            statements.push(assertion);
            requiresAwait = true;
          }
          break;
        default:
          // Handle other chained calls
          const converted = this.convertChainedCall(currentLocator, chainedCall, context);
          if (converted.code.trim()) {
            let statement = converted.code;
            if (converted.requiresAwait) {
              statement = `await ${statement}`;
              requiresAwait = true;
            }
            statements.push(statement);
          }
      }
    }

    return {
      playwrightCode: statements.join('\n'),
      requiresAwait,
      imports: Array.from(context.imports),
      warnings: context.warnings.length > 0 ? context.warnings : undefined
    };
  }

  /**
   * Convert advanced interaction patterns
   */
  private convertAdvancedInteractionPattern(cypressCommand: CypressCommand, context: ConversionContext): ConvertedCommand {
    const baseLocator = this.getBaseLocator(cypressCommand, context);
    const statements: string[] = [];
    let requiresAwait = false;

    for (const chainedCall of cypressCommand.chainedCalls!) {
      switch (chainedCall.method) {
        case 'trigger':
          const event = chainedCall.args[0] as string;
          statements.push(`await ${baseLocator}.dispatchEvent('${event}')`);
          requiresAwait = true;
          break;
        case 'drag':
          const target = chainedCall.args[0] as string;
          const targetLocator = this.optimizeSelector(target);
          statements.push(`await ${baseLocator}.dragTo(${targetLocator})`);
          requiresAwait = true;
          break;
        case 'selectFile':
          const filePath = chainedCall.args[0] as string;
          context.imports.add('path');
          statements.push(`await ${baseLocator}.setInputFiles(path.join(__dirname, '${filePath}'))`);
          requiresAwait = true;
          break;
        case 'invoke':
          const method = chainedCall.args[0] as string;
          const args = chainedCall.args.slice(1);
          if (method === 'focus') {
            statements.push(`await ${baseLocator}.focus()`);
          } else if (method === 'click') {
            statements.push(`await ${baseLocator}.click()`);
          } else {
            context.warnings.push(`invoke('${method}') may require manual conversion`);
            statements.push(`// TODO: Handle invoke('${method}') - may need page.evaluate()`);
          }
          requiresAwait = true;
          break;
        case 'its':
          const property = chainedCall.args[0] as string;
          if (property === 'value') {
            statements.push(`const value = await ${baseLocator}.inputValue()`);
          } else if (property === 'text') {
            statements.push(`const text = await ${baseLocator}.textContent()`);
          } else {
            context.warnings.push(`its('${property}') may require manual conversion`);
            statements.push(`// TODO: Handle its('${property}') - may need page.evaluate()`);
          }
          requiresAwait = true;
          break;
        case 'then':
          context.warnings.push('then() callback requires manual conversion to standard JavaScript');
          statements.push('// TODO: Convert then() callback to standard JavaScript/TypeScript');
          break;
        default:
          // Handle regular chained calls
          const converted = this.convertChainedCall(baseLocator, chainedCall, context);
          if (converted.code.trim()) {
            let statement = converted.code;
            if (converted.requiresAwait) {
              statement = `await ${statement}`;
              requiresAwait = true;
            }
            statements.push(statement);
          }
      }
    }

    return {
      playwrightCode: statements.join('\n'),
      requiresAwait,
      imports: Array.from(context.imports),
      warnings: context.warnings.length > 0 ? context.warnings : undefined
    };
  }

  /**
   * Convert storage operation patterns
   */
  private convertStorageOperationPattern(cypressCommand: CypressCommand, context: ConversionContext): ConvertedCommand {
    const statements: string[] = [];
    let requiresAwait = true;

    for (const chainedCall of cypressCommand.chainedCalls!) {
      if (chainedCall.method === 'its') {
        const storageType = chainedCall.args[0] as string;

        if (storageType === 'localStorage' || storageType === 'sessionStorage') {
          // Look for subsequent invoke calls
          const nextCall = cypressCommand.chainedCalls![cypressCommand.chainedCalls!.indexOf(chainedCall) + 1];
          if (nextCall && nextCall.method === 'invoke') {
            const operation = nextCall.args[0] as string;
            const key = nextCall.args[1] as string;
            const value = nextCall.args[2];

            switch (operation) {
              case 'setItem':
                statements.push(`await page.evaluate(() => {`);
                statements.push(`  ${storageType}.setItem(${this.formatValue(key)}, ${this.formatValue(value)})`);
                statements.push(`})`);
                break;
              case 'getItem':
                statements.push(`const value = await page.evaluate(() => {`);
                statements.push(`  return ${storageType}.getItem(${this.formatValue(key)})`);
                statements.push(`})`);
                break;
              case 'removeItem':
                statements.push(`await page.evaluate(() => {`);
                statements.push(`  ${storageType}.removeItem(${this.formatValue(key)})`);
                statements.push(`})`);
                break;
              case 'clear':
                statements.push(`await page.evaluate(() => {`);
                statements.push(`  ${storageType}.clear()`);
                statements.push(`})`);
                break;
              default:
                context.warnings.push(`${storageType}.${operation}() may require manual conversion`);
                statements.push(`// TODO: Handle ${storageType}.${operation}()`);
            }
          }
        }
      }
    }

    if (statements.length === 0) {
      statements.push('// TODO: Convert window operation');
    }

    return {
      playwrightCode: statements.join('\n'),
      requiresAwait,
      imports: Array.from(context.imports),
      warnings: context.warnings.length > 0 ? context.warnings : undefined
    };
  }

  // Helper methods for pattern detection
  private hasMultipleAssertions(cypressCommand: CypressCommand): boolean {
    return cypressCommand.chainedCalls!.filter(call => call.method === 'should' || call.method === 'and').length > 1;
  }

  private hasComplexLocators(cypressCommand: CypressCommand): boolean {
    return cypressCommand.chainedCalls!.some(call =>
      ['within', 'find', 'first', 'last', 'eq', 'filter', 'not', 'contains'].includes(call.method)
    );
  }

  private hasAdvancedInteractions(cypressCommand: CypressCommand): boolean {
    return cypressCommand.chainedCalls!.some(call =>
      ['trigger', 'drag', 'selectFile', 'invoke', 'its', 'then'].includes(call.method)
    );
  }

  private hasStorageOperations(cypressCommand: CypressCommand): boolean {
    return cypressCommand.command === 'window' && cypressCommand.chainedCalls!.some(call =>
      call.method === 'its' && (call.args[0] === 'localStorage' || call.args[0] === 'sessionStorage')
    );
  }

  /**
   * Generate a descriptive variable name for elements
   */
  private generateElementVariableName(cypressCommand: CypressCommand): string {
    const selector = cypressCommand.args[0] as string;

    // Extract testid
    const testIdMatch = selector.match(/\[data-testid=["']([^"']+)["']\]/);
    if (testIdMatch) {
      return testIdMatch[1].replace(/-/g, '').toLowerCase() + 'Element';
    }

    // Extract role
    const roleMatch = selector.match(/\[role=["']([^"']+)["']\]/);
    if (roleMatch) {
      return roleMatch[1].toLowerCase() + 'Element';
    }

    // Generic element name
    return 'element';
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
      case 'find':
        const selector = chainedCall.args[0] as string;
        return { code: `${baseLocator}.locator(${this.formatValue(selector)})`, requiresAwait: false };
      case 'first':
        return { code: `${baseLocator}.first()`, requiresAwait: false };
      case 'last':
        return { code: `${baseLocator}.last()`, requiresAwait: false };
      case 'eq':
        const index = chainedCall.args[0] as number;
        return { code: `${baseLocator}.nth(${index})`, requiresAwait: false };

      // ✅ Added DOM traversal methods
      case 'parent':
        if (chainedCall.args.length > 0 && chainedCall.args[0]) {
          const parentSelector = chainedCall.args[0] as string;
          return { code: `${baseLocator}.locator('..').locator(${this.formatValue(parentSelector)})`, requiresAwait: false };
        }
        return { code: `${baseLocator}.locator('..')`, requiresAwait: false };

      case 'parents':
        if (chainedCall.args.length > 0 && chainedCall.args[0]) {
          const ancestorSelector = chainedCall.args[0] as string;
          context.warnings.push(`cy.parents('${ancestorSelector}') converted to closest() - verify ancestor relationship`);
          return { code: `${baseLocator}.locator('xpath=ancestor::*').filter({ has: page.locator(${this.formatValue(ancestorSelector)}) })`, requiresAwait: false };
        }
        return { code: `${baseLocator}.locator('xpath=ancestor::*')`, requiresAwait: false };

      case 'closest':
        if (chainedCall.args.length > 0) {
          const closestSelector = chainedCall.args[0] as string;
          return { code: `${baseLocator}.locator('xpath=ancestor-or-self::*').filter({ has: page.locator(${this.formatValue(closestSelector)}) }).first()`, requiresAwait: false };
        }
        return { code: `${baseLocator}.locator('xpath=ancestor-or-self::*')`, requiresAwait: false };

      case 'children':
        if (chainedCall.args.length > 0 && chainedCall.args[0]) {
          const childSelector = chainedCall.args[0] as string;
          return { code: `${baseLocator}.locator('> *').locator(${this.formatValue(childSelector)})`, requiresAwait: false };
        }
        return { code: `${baseLocator}.locator('> *')`, requiresAwait: false };

      case 'siblings':
        if (chainedCall.args.length > 0 && chainedCall.args[0]) {
          const siblingSelector = chainedCall.args[0] as string;
          context.warnings.push(`cy.siblings() converted - verify sibling relationship works as expected`);
          return { code: `${baseLocator}.locator('xpath=following-sibling::* | preceding-sibling::*').locator(${this.formatValue(siblingSelector)})`, requiresAwait: false };
        }
        return { code: `${baseLocator}.locator('xpath=following-sibling::* | preceding-sibling::*')`, requiresAwait: false };

      case 'next':
        if (chainedCall.args.length > 0 && chainedCall.args[0]) {
          const nextSelector = chainedCall.args[0] as string;
          return { code: `${baseLocator}.locator('xpath=following-sibling::*').locator(${this.formatValue(nextSelector)}).first()`, requiresAwait: false };
        }
        return { code: `${baseLocator}.locator('xpath=following-sibling::*').first()`, requiresAwait: false };

      case 'prev':
        if (chainedCall.args.length > 0 && chainedCall.args[0]) {
          const prevSelector = chainedCall.args[0] as string;
          return { code: `${baseLocator}.locator('xpath=preceding-sibling::*').locator(${this.formatValue(prevSelector)}).first()`, requiresAwait: false };
        }
        return { code: `${baseLocator}.locator('xpath=preceding-sibling::*').first()`, requiresAwait: false };

      // ✅ Enhanced interaction methods
      case 'dblclick':
        return { code: `${baseLocator}.dblclick()`, requiresAwait: true };

      case 'rightclick':
        return { code: `${baseLocator}.click({ button: 'right' })`, requiresAwait: true };

      case 'trigger':
        const eventType = chainedCall.args[0] as string;
        context.warnings.push(`cy.trigger('${eventType}') converted - verify event behavior matches expected`);
        if (eventType === 'mouseover' || eventType === 'mouseenter') {
          return { code: `${baseLocator}.hover()`, requiresAwait: true };
        } else if (eventType === 'mousedown') {
          return { code: `${baseLocator}.dispatchEvent('mousedown')`, requiresAwait: true };
        } else if (eventType === 'mouseup') {
          return { code: `${baseLocator}.dispatchEvent('mouseup')`, requiresAwait: true };
        }
        return { code: `${baseLocator}.dispatchEvent('${eventType}')`, requiresAwait: true };

      case 'scrollIntoView':
        return { code: `${baseLocator}.scrollIntoViewIfNeeded()`, requiresAwait: true };

      case 'submit':
        return { code: `${baseLocator}.press('Enter')`, requiresAwait: true };

      // ✅ Enhanced filtering and traversal
      case 'filter':
        if (chainedCall.args.length > 0) {
          const filterArg = chainedCall.args[0] as string;
          if (filterArg.includes(':contains(')) {
            const textMatch = filterArg.match(/:contains\(["']?([^"')]+)["']?\)/);
            if (textMatch) {
              return { code: `${baseLocator}.filter({ hasText: ${this.formatValue(textMatch[1])} })`, requiresAwait: false };
            }
          }
          return { code: `${baseLocator}.filter({ has: page.locator(${this.formatValue(filterArg)}) })`, requiresAwait: false };
        }
        return { code: baseLocator, requiresAwait: false };

      case 'not':
        if (chainedCall.args.length > 0) {
          const notSelector = chainedCall.args[0] as string;
          return { code: `${baseLocator}.locator(':not(${notSelector})')`, requiresAwait: false };
        }
        return { code: baseLocator, requiresAwait: false };

      // ✅ Existing methods with improvements
      case 'as':
        // Cypress aliases are not needed in Playwright in the same way
        context.warnings.push(`Cypress alias '${chainedCall.args[0]}' converted - consider storing in variable instead`);
        return { code: '', requiresAwait: false };

      case 'tab':
        return { code: `${baseLocator}.press('Tab')`, requiresAwait: true };

      case 'wait':
        if (chainedCall.args.length > 0 && typeof chainedCall.args[0] === 'number') {
          return { code: `page.waitForTimeout(${chainedCall.args[0]})`, requiresAwait: true };
        } else if (chainedCall.args.length > 0 && typeof chainedCall.args[0] === 'string' && chainedCall.args[0].startsWith('@')) {
          const alias = chainedCall.args[0].substring(1);
          context.warnings.push(`cy.wait('@${alias}') converted to generic API wait - may need manual adjustment`);
          return { code: `page.waitForResponse('**/*')`, requiresAwait: true };
        }
        return { code: `${baseLocator}./* TODO: wait */`, requiresAwait: false };

      default:
        context.warnings.push(`Unknown chained method: ${chainedCall.method} - consider manual conversion`);
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
   * Optimize CSS selectors to use Playwright's semantic selectors with enhanced complex pattern support
   */
  private optimizeSelector(selector: string): string {
    // ✅ Handle data-testid with complex expressions
    const testIdMatch = selector.match(/\[data-testid=["']([^"']+)["']\]/) ||
                       selector.match(/\[data-testid=([^[\]]+)\]/);
    if (testIdMatch) {
      const value = testIdMatch[1].replace(/['"]/g, '');
      return `page.getByTestId('${value}')`;
    }

    // ✅ Handle data-cy (Cypress convention) with template literal support
    const cyMatch = selector.match(/\[data-cy=["']([^"']+)["']\]/) ||
                   selector.match(/\[data-cy=([^[\]]+)\]/);
    if (cyMatch) {
      const value = cyMatch[1].replace(/['"]/g, '');
      return `page.getByTestId(${this.formatValue(value)})`;
    }

    // ✅ Handle role with options
    const roleMatch = selector.match(/\[role=["']([^"']+)["']\]/) ||
                     selector.match(/\[role=([^[\]]+)\]/);
    if (roleMatch) {
      const value = roleMatch[1].replace(/['"]/g, '');
      return `page.getByRole('${value}')`;
    }

    // ✅ Handle aria-label with complex patterns
    const labelMatch = selector.match(/\[aria-label=["']([^"']+)["']\]/) ||
                      selector.match(/\[aria-label=([^[\]]+)\]/);
    if (labelMatch) {
      const value = labelMatch[1].replace(/['"]/g, '');
      return `page.getByLabel(${this.formatValue(value)})`;
    }

    // ✅ Handle placeholder with variables
    const placeholderMatch = selector.match(/\[placeholder=["']([^"']+)["']\]/);
    if (placeholderMatch) {
      return `page.getByPlaceholder(${this.formatValue(placeholderMatch[1])})`;
    }

    // ✅ Handle title attribute
    const titleMatch = selector.match(/\[title=["']([^"']+)["']\]/);
    if (titleMatch) {
      return `page.getByTitle(${this.formatValue(titleMatch[1])})`;
    }

    // ✅ Handle alt attribute for images
    const altMatch = selector.match(/\[alt=["']([^"']+)["']\]/);
    if (altMatch) {
      return `page.getByAltText(${this.formatValue(altMatch[1])})`;
    }

    // ✅ Handle text content patterns
    const textMatch = selector.match(/:contains\(["']([^"']+)["']\)/);
    if (textMatch) {
      return `page.getByText(${this.formatValue(textMatch[1])})`;
    }

    // ✅ Handle complex descendant combinator patterns
    if (selector.includes(' > ')) {
      const parts = selector.split(' > ').map(part => part.trim());
      if (parts.length === 2) {
        const parent = this.optimizeSelector(parts[0]);
        const child = this.optimizeSelector(parts[1]);
        return `${parent}.locator('> ${parts[1]}')`;
      }
    }

    // ✅ Handle adjacent sibling combinator (+)
    if (selector.includes(' + ')) {
      const parts = selector.split(' + ').map(part => part.trim());
      if (parts.length === 2) {
        const base = this.optimizeSelector(parts[0]);
        return `${base}.locator('+ ${parts[1]}')`;
      }
    }

    // ✅ Handle general sibling combinator (~)
    if (selector.includes(' ~ ')) {
      const parts = selector.split(' ~ ').map(part => part.trim());
      if (parts.length === 2) {
        const base = this.optimizeSelector(parts[0]);
        return `${base}.locator('~ ${parts[1]}')`;
      }
    }

    // ✅ Handle pseudo-selectors common in Cypress
    if (selector.includes(':first')) {
      const baseSelector = selector.replace(':first', '');
      return `${this.optimizeSelector(baseSelector)}.first()`;
    }

    if (selector.includes(':last')) {
      const baseSelector = selector.replace(':last', '');
      return `${this.optimizeSelector(baseSelector)}.last()`;
    }

    if (selector.includes(':eq(')) {
      const eqMatch = selector.match(/(.+):eq\((\d+)\)/);
      if (eqMatch) {
        const baseSelector = eqMatch[1];
        const index = parseInt(eqMatch[2]);
        return `${this.optimizeSelector(baseSelector)}.nth(${index})`;
      }
    }

    // ✅ Handle nth-child patterns
    const nthChildMatch = selector.match(/(.+):nth-child\((\d+)\)/);
    if (nthChildMatch) {
      const baseSelector = nthChildMatch[1];
      const index = parseInt(nthChildMatch[2]) - 1; // Convert to 0-based index
      return `${this.optimizeSelector(baseSelector)}.nth(${index})`;
    }

    // ✅ Handle visibility pseudo-selectors
    if (selector.includes(':visible')) {
      const baseSelector = selector.replace(':visible', '');
      return `${this.optimizeSelector(baseSelector)}.locator(':visible')`;
    }

    if (selector.includes(':hidden')) {
      const baseSelector = selector.replace(':hidden', '');
      return `${this.optimizeSelector(baseSelector)}.locator(':hidden')`;
    }

    // ✅ Handle attribute selectors with operators
    const attrOperatorMatch = selector.match(/\[([^=\]]+)([\*\^$|~]?)=["']([^"']+)["']\]/);
    if (attrOperatorMatch) {
      const [, attr, operator, value] = attrOperatorMatch;
      const formattedValue = this.formatValue(value);

      switch (operator) {
        case '*': // contains
          return `page.locator(\`[${attr}*=\${${formattedValue}}]\`)`;
        case '^': // starts with
          return `page.locator(\`[${attr}^=\${${formattedValue}}]\`)`;
        case '$': // ends with
          return `page.locator(\`[${attr}$=\${${formattedValue}}]\`)`;
        case '|': // language attribute
          return `page.locator(\`[${attr}|=\${${formattedValue}}]\`)`;
        case '~': // word in list
          return `page.locator(\`[${attr}~=\${${formattedValue}}]\`)`;
        default:
          return `page.locator(\`[${attr}=\${${formattedValue}}]\`)`;
      }
    }

    // Fall back to generic locator with enhanced formatting
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

          // Handle data-cy (Cypress convention)
          const cyMatch = selector.match(/\[data-cy=["']([^"']+)["']\]/) ||
                         selector.match(/\[data-cy=([^[\]]+)\]/);
          if (cyMatch) {
            const value = cyMatch[1].replace(/['"]/g, '');
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
          const response = args[2];

          if (response && typeof response === 'object' && response.fixture) {
            return `page.route('**${url}', async route => {
  const json = JSON.parse(await fs.readFile(path.join(__dirname, '../fixtures/${response.fixture}'), 'utf-8'));
  await route.fulfill({ json });
})`;
          }

          return `page.route('**${url}', route => route.continue())`;
        }
      }],
      ['viewport', {
        cypressCommand: 'viewport',
        playwrightEquivalent: 'page.setViewportSize',
        requiresAwait: true,
        transformation: (args: any[]) => {
          const width = args[0];
          const height = args[1];
          return `page.setViewportSize({ width: ${width}, height: ${height} })`;
        }
      }],
      ['setCookie', {
        cypressCommand: 'setCookie',
        playwrightEquivalent: 'page.context().addCookies',
        requiresAwait: true,
        transformation: (args: any[]) => {
          const name = args[0];
          const value = args[1];
          return `page.context().addCookies([{ name: '${name}', value: '${value}', url: page.url() }])`;
        }
      }],
      ['fixture', {
        cypressCommand: 'fixture',
        playwrightEquivalent: 'fs.readFile',
        requiresAwait: true,
        transformation: (args: any[]) => {
          const filename = args[0];
          return `const ${filename.replace(/\./g, '').replace(/\//g, '')} = JSON.parse(await fs.readFile(path.join(__dirname, '../fixtures/${filename}'), 'utf-8'))`;
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
      }],
      ['contain', {
        cypressAssertion: 'contain',
        playwrightAssertion: 'toContainText'
      }],
      ['have.class', {
        cypressAssertion: 'have.class',
        playwrightAssertion: 'toHaveClass',
        transformation: (args: any[]) => {
          const baseLocator = args[0];
          const className = args[1];
          return `await expect(${baseLocator}).toHaveClass(/${className}/)`;
        }
      }],
      ['not.have.class', {
        cypressAssertion: 'not.have.class',
        playwrightAssertion: 'not.toHaveClass',
        transformation: (args: any[]) => {
          const baseLocator = args[0];
          const className = args[1];
          return `await expect(${baseLocator}).not.toHaveClass(/${className}/)`;
        }
      }],
      ['have.attr', {
        cypressAssertion: 'have.attr',
        playwrightAssertion: 'toHaveAttribute'
      }],
      ['have.property', {
        cypressAssertion: 'have.property',
        playwrightAssertion: 'toHaveProperty',
        transformation: (args: any[]) => {
          const baseLocator = args[0];
          const property = args[1];
          const value = args[2];
          if (value !== undefined) {
            return `expect(${baseLocator}).toHaveProperty('${property}', ${typeof value === 'string' ? `'${value}'` : value})`;
          }
          return `expect(${baseLocator}).toHaveProperty('${property}')`;
        }
      }],
      ['not.exist', {
        cypressAssertion: 'not.exist',
        playwrightAssertion: 'not.toBeVisible'
      }],
      ['exist', {
        cypressAssertion: 'exist',
        playwrightAssertion: 'toBeVisible'
      }],
      ['equal', {
        cypressAssertion: 'equal',
        playwrightAssertion: 'toBe'
      }],
      ['eq', {
        cypressAssertion: 'eq',
        playwrightAssertion: 'toBe'
      }],
      ['have.focus', {
        cypressAssertion: 'have.focus',
        playwrightAssertion: 'toBeFocused'
      }],
      ['not.have.focus', {
        cypressAssertion: 'not.have.focus',
        playwrightAssertion: 'not.toBeFocused'
      }],
      ['not.be.visible', {
        cypressAssertion: 'not.be.visible',
        playwrightAssertion: 'not.toBeVisible'
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
   * Format a single value for code generation with enhanced template literal support
   */
  private formatValue(value: any): string {
    if (typeof value === 'string') {
      // ✅ Enhanced template literal and variable interpolation handling

      // Check if it's a template literal (contains ${})
      if (value.includes('${')) {
        // Convert to template literal format
        return `\`${value.replace(/`/g, '\\`')}\``;
      }

      // Check if it contains variable references (common patterns)
      if (this.isVariableReference(value)) {
        return value; // Return as-is for variables
      }

      // Check for dynamic selector patterns like [data-testid="${variable}"]
      if (this.containsDynamicPattern(value)) {
        return `\`${value}\``;
      }

      // Regular string literal
      return `'${value.replace(/'/g, "\\'")}'`;
    }

    if (typeof value === 'boolean' || typeof value === 'number') {
      return String(value);
    }

    // Handle other types (arrays, objects, etc.)
    if (Array.isArray(value)) {
      return `[${value.map(v => this.formatValue(v)).join(', ')}]`;
    }

    if (typeof value === 'object' && value !== null) {
      const entries = Object.entries(value).map(([k, v]) => `${k}: ${this.formatValue(v)}`);
      return `{ ${entries.join(', ')} }`;
    }

    return String(value);
  }

  /**
   * Check if a string is likely a variable reference
   */
  private isVariableReference(value: string): boolean {
    // Common variable patterns
    const variablePatterns = [
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/, // Simple variable name
      /^[a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*/, // Object property access
      /^[a-zA-Z_$][a-zA-Z0-9_$]*\[[^\]]+\]/, // Array or object bracket notation
      /^this\.[a-zA-Z_$][a-zA-Z0-9_$]*/, // this references
      /^\w+\(\)$/, // Function calls without arguments
      /^\w+\([^)]*\)$/ // Function calls with arguments
    ];

    return variablePatterns.some(pattern => pattern.test(value));
  }

  /**
   * Check if a string contains dynamic patterns that should be template literals
   */
  private containsDynamicPattern(value: string): boolean {
    const dynamicPatterns = [
      /\$\{[^}]+\}/, // Template literal expressions
      /\[[^\]]*\$[^\]]*\]/, // Dynamic attribute selectors
      /["'][^"']*\$[^"']*["']/, // String with variable interpolation
      /#\{[^}]+\}/ // Alternative interpolation syntax
    ];

    return dynamicPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  }
}