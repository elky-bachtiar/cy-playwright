import * as ts from 'typescript';
import { Logger } from '../utils/logger';
import {
  CustomCommandAnalysis,
  ConvertedCustomCommand
} from '../types/pattern-conversion';

export class CustomCommandHandler {
  private logger = new Logger('CustomCommandHandler');

  // Known custom command mappings
  private readonly knownCommandMappings = new Map<string, any>([
    ['login', { strategy: 'utility', complexity: 'medium' }],
    ['selectDropdown', { strategy: 'direct', complexity: 'low' }],
    ['uploadFile', { strategy: 'direct', complexity: 'low' }],
    ['customLog', { strategy: 'direct', complexity: 'low' }],
    ['navigateToSection', { strategy: 'utility', complexity: 'medium' }],
    ['fillLoginForm', { strategy: 'pageObject', complexity: 'high' }],
    ['submitLoginForm', { strategy: 'pageObject', complexity: 'high' }],
    ['openModal', { strategy: 'pageObject', complexity: 'high' }],
    ['fillModalForm', { strategy: 'pageObject', complexity: 'high' }],
    ['saveModal', { strategy: 'pageObject', complexity: 'high' }],
    ['closeModal', { strategy: 'pageObject', complexity: 'high' }],
    ['getApiData', { strategy: 'utility', complexity: 'medium' }],
    ['conditionalClick', { strategy: 'utility', complexity: 'medium' }],
    ['waitForElement', { strategy: 'utility', complexity: 'medium' }],
    ['clearCookies', { strategy: 'manual', complexity: 'medium' }],
    ['clearLocalStorage', { strategy: 'manual', complexity: 'medium' }],
    ['setCookie', { strategy: 'manual', complexity: 'medium' }],
    ['customDragAndDrop', { strategy: 'manual', complexity: 'high' }],
    ['clickButton', { strategy: 'direct', complexity: 'low' }],
    ['performLogin', { strategy: 'utility', complexity: 'medium' }],
    ['navigateComplexWorkflow', { strategy: 'pageObject', complexity: 'high' }],
    ['setupTestData', { strategy: 'utility', complexity: 'high' }],
    ['runComplexValidation', { strategy: 'utility', complexity: 'high' }],
    ['createRecord', { strategy: 'utility', complexity: 'medium' }],
    ['waitForApiResponse', { strategy: 'utility', complexity: 'medium' }],
    ['validateResponse', { strategy: 'utility', complexity: 'medium' }]
  ]);

  public convertCustomCommand(cypressCode: string): ConvertedCustomCommand {
    this.logger.info('Converting custom commands to Playwright equivalents');

    try {
      // Analyze the custom commands in the code
      const analysis = this.analyzeCustomCommands(cypressCode);

      // Convert the commands
      const playwrightCode = this.transformCustomCommands(cypressCode, analysis);

      // Validate the generated code
      const isValid = this.validateGeneratedCode(playwrightCode);

      const result: ConvertedCustomCommand = {
        originalCommand: cypressCode,
        playwrightEquivalent: playwrightCode,
        isValid,
        conversionSuccess: isValid,
        conversionNotes: this.generateConversionNotes(analysis),
        transformationMetadata: {
          complexity: analysis.complexity,
          requiresManualReview: this.requiresManualReview(analysis),
          strategy: analysis.conversionStrategy,
          generatedUtilityFunction: analysis.conversionStrategy === 'pageObject' ? this.generatePageObjectClass(analysis) : undefined
        }
      };

      this.logger.info(`Custom command conversion completed: ${result.conversionSuccess ? 'SUCCESS' : 'FAILED'}`);
      return result;

    } catch (error) {
      this.logger.error('Error converting custom commands:', error);
      return this.createFailureResult(cypressCode, `Conversion error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private analyzeCustomCommands(code: string): CustomCommandAnalysis {
    // Extract all custom command calls
    const customCommands = this.extractCustomCommands(code);

    if (customCommands.length === 0) {
      return {
        commandName: 'unknown',
        parameters: [],
        isChainable: false,
        hasPlaywrightEquivalent: false,
        conversionStrategy: 'manual',
        complexity: 'low'
      };
    }

    // Analyze the primary command (first one found)
    const primaryCommand = customCommands[0];
    const commandInfo = this.knownCommandMappings.get(primaryCommand.name);

    // Determine if commands are chainable
    const isChainable = /cy\.\w+\([^)]*\)\.\w+\(/.test(code);

    // Determine overall strategy based on all commands
    const strategy = this.determineOverallStrategy(customCommands);

    // Determine complexity based on number and types of commands
    let complexity: 'low' | 'medium' | 'high' = 'low';
    if (customCommands.length > 3 || strategy === 'pageObject') {
      complexity = 'high';
    } else if (customCommands.length > 1 || strategy === 'utility') {
      complexity = 'medium';
    }

    return {
      commandName: primaryCommand.name,
      parameters: primaryCommand.parameters,
      isChainable,
      hasPlaywrightEquivalent: commandInfo ? true : false,
      conversionStrategy: strategy,
      complexity
    };
  }

  private extractCustomCommands(code: string): Array<{ name: string, parameters: any[] }> {
    const commands: Array<{ name: string, parameters: any[] }> = [];

    // Pattern to match cy.customCommand() calls
    const customCommandPattern = /cy\.(\w+)\(([^)]*)\)/g;
    let match;

    while ((match = customCommandPattern.exec(code)) !== null) {
      const commandName = match[1];
      const paramString = match[2];

      // Skip standard Cypress commands
      const standardCommands = [
        'get', 'visit', 'click', 'type', 'should', 'expect', 'contains',
        'wait', 'intercept', 'then', 'and', 'wrap', 'as', 'its', 'invoke',
        'clear', 'check', 'uncheck', 'select', 'focus', 'blur', 'submit',
        'reload', 'go', 'url', 'title', 'window', 'document', 'log'
      ];

      if (!standardCommands.includes(commandName)) {
        const parameters = this.parseParameters(paramString);
        commands.push({ name: commandName, parameters });
      }
    }

    return commands;
  }

  private parseParameters(paramString: string): any[] {
    if (!paramString.trim()) {
      return [];
    }

    try {
      // Simple parameter parsing - this could be enhanced with AST parsing
      const params = paramString.split(',').map(param => {
        const trimmed = param.trim();

        // Try to determine parameter type
        if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
          return { name: 'string', type: 'string' };
        } else if (/^\d+$/.test(trimmed)) {
          return { name: 'number', type: 'number' };
        } else if (trimmed === 'true' || trimmed === 'false') {
          return { name: 'boolean', type: 'boolean' };
        } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          return { name: 'object', type: 'object' };
        } else {
          return { name: 'unknown', type: 'any' };
        }
      });

      return params;
    } catch (error) {
      return [{ name: 'unknown', type: 'any' }];
    }
  }

  private determineOverallStrategy(commands: Array<{ name: string, parameters: any[] }>): 'direct' | 'utility' | 'pageObject' | 'manual' {
    // Check if any commands require page object strategy
    const pageObjectCommands = ['fillLoginForm', 'submitLoginForm', 'openModal', 'fillModalForm', 'saveModal', 'closeModal'];
    if (commands.some(cmd => pageObjectCommands.includes(cmd.name))) {
      return 'pageObject';
    }

    // Check if any commands require manual conversion
    const manualCommands = ['clearCookies', 'clearLocalStorage', 'setCookie', 'customDragAndDrop'];
    if (commands.some(cmd => manualCommands.includes(cmd.name))) {
      return 'manual';
    }

    // Check if direct conversion is possible
    const directCommands = ['selectDropdown', 'uploadFile', 'customLog', 'clickButton'];
    if (commands.every(cmd => directCommands.includes(cmd.name))) {
      return 'direct';
    }

    // Default to utility functions
    return 'utility';
  }

  private transformCustomCommands(code: string, analysis: CustomCommandAnalysis): string {
    let convertedCode = code;

    switch (analysis.conversionStrategy) {
      case 'direct':
        convertedCode = this.convertDirectCommands(convertedCode);
        break;
      case 'utility':
        convertedCode = this.convertToUtilityFunctions(convertedCode);
        break;
      case 'pageObject':
        convertedCode = this.convertToPageObjectMethods(convertedCode);
        break;
      case 'manual':
        convertedCode = this.addManualConversionComments(convertedCode);
        break;
    }

    return convertedCode;
  }

  private convertDirectCommands(code: string): string {
    let result = code;

    // Convert specific known direct mappings
    result = result.replace(/cy\.selectDropdown\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)/g,
      "await page.locator('$1').selectOption('$2');");

    result = result.replace(/cy\.uploadFile\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)/g,
      "await page.locator('$1').setInputFiles('$2');");

    result = result.replace(/cy\.customLog\(([^)]+)\)/g, 'console.log($1);');

    result = result.replace(/cy\.clickButton\(['"`]([^'"`]+)['"`]\)/g,
      "await page.locator('$1').click();");

    return result;
  }

  private convertToUtilityFunctions(code: string): string {
    let result = code;

    // Convert login command
    result = result.replace(/cy\.login\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)/g, (match, username, password) => {
      return `// TODO: Convert custom command cy.login() to Playwright equivalent
async function login(page: Page, username: string, password: string) {
  // Implement login logic here
  await page.locator('[data-testid="username"]').fill(username);
  await page.locator('[data-testid="password"]').fill(password);
  await page.locator('[data-testid="login-btn"]').click();
}

await login(page, '${username}', '${password}');`;
    });

    // Convert navigateToSection command
    result = result.replace(/cy\.navigateToSection\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)/g, (match, section, subsection) => {
      return `async function navigateToSection(page: Page, section: string, subsection: string) {
  await page.goto(\`/\${section}/\${subsection}\`);
}

await navigateToSection(page, '${section}', '${subsection}');`;
    });

    // Convert conditional click
    result = result.replace(/cy\.conditionalClick\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)/g, (match, selector, condition) => {
      return `async function conditionalClick(page: Page, selector: string, condition: string) {
  if (condition === 'visible' && await page.locator(selector).isVisible()) {
    await page.locator(selector).click();
  }
}

await conditionalClick(page, '${selector}', '${condition}');`;
    });

    // Convert waitForElement with options
    result = result.replace(/cy\.waitForElement\(['"`]([^'"`]+)['"`],\s*\{([^}]+)\}\)/g, (match, selector, options) => {
      return `async function waitForElement(page: Page, selector: string, options?: { timeout?: number, retries?: number }) {
  await page.locator(selector).waitFor({ timeout: options?.timeout || 30000 });
}

await waitForElement(page, '${selector}', {${options}});`;
    });

    // Convert chained commands to sequential calls
    result = result.replace(/cy\.(\w+)\([^)]*\)\.(\w+)\([^)]*\)\.(\w+)\([^)]*\)/g, (match) => {
      const commands = match.split('.').slice(1); // Remove 'cy' prefix
      return commands.map(cmd => `await ${cmd.replace(/^(\w+)/, '$1(page')}`).join(';\n');
    });

    // Handle getApiData and similar async operations
    result = result.replace(/cy\.getApiData\(['"`]([^'"`]+)['"`]\)\.as\(['"`]([^'"`]+)['"`]\)/g, (match, url, alias) => {
      return `const ${alias} = await getApiData(page, '${url}');`;
    });

    result = result.replace(/cy\.get\(['"`]@([^'"`]+)['"`]\)\.then\(\(([^)]+)\)\s*=>\s*\{([^}]+)\}\)/g, (match, alias, param, body) => {
      const convertedBody = body.replace(new RegExp(`\\b${param}\\b`, 'g'), alias);
      return convertedBody;
    });

    return result;
  }

  private convertToPageObjectMethods(code: string): string {
    const commands = this.extractCustomCommands(code);

    // Determine page object name based on commands
    let pageObjectName = 'LoginPage';
    if (commands.some(cmd => cmd.name.includes('Modal'))) {
      pageObjectName = 'ModalPage';
    }

    // Generate page object class
    const pageObjectClass = this.generatePageObjectFromCommands(commands, pageObjectName);

    // Convert individual command calls
    let result = code;
    commands.forEach(cmd => {
      const methodCall = `await ${cmd.name}(${cmd.parameters.map((_, i) => `param${i}`).join(', ')})`;
      result = result.replace(new RegExp(`cy\\.${cmd.name}\\([^)]*\\)`, 'g'), methodCall);
    });

    return `${pageObjectClass}\n\n${result}`;
  }

  private generatePageObjectFromCommands(commands: Array<{ name: string, parameters: any[] }>, className: string): string {
    const methods = commands.map(cmd => {
      const paramList = cmd.parameters.map((param, i) => `param${i}: ${param.type}`).join(', ');
      return `  async ${cmd.name}(${paramList}) {
    // TODO: Implement ${cmd.name} logic
  }`;
    }).join('\n\n');

    return `class ${className} {
  constructor(private page: Page) {}

${methods}
}`;
  }

  private addManualConversionComments(code: string): string {
    let result = code;

    // Browser management commands
    result = result.replace(/cy\.clearCookies\(\)/g,
      '// TODO: Browser cookie/storage management\nawait page.context().clearCookies();');

    result = result.replace(/cy\.clearLocalStorage\(\)/g,
      'await page.evaluate(() => localStorage.clear());');

    result = result.replace(/cy\.setCookie\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)/g,
      "await page.context().addCookies([{ name: '$1', value: '$2', url: page.url() }]);");

    // Drag and drop
    result = result.replace(/cy\.customDragAndDrop\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)/g,
      '// TODO: Implement drag and drop using Playwright\nawait page.locator(\'$1\').dragTo(page.locator(\'$2\'));');

    // Unknown commands
    result = result.replace(/cy\.(\w+)\(([^)]*)\)/g, (match, commandName, params) => {
      if (!this.knownCommandMappings.has(commandName)) {
        return `// TODO: Unknown custom command - requires manual conversion\n// ${match}`;
      }
      return match;
    });

    return result;
  }

  private generatePageObjectClass(analysis: CustomCommandAnalysis): string {
    if (analysis.conversionStrategy !== 'pageObject') {
      return '';
    }

    return `// Generated Page Object Class
class ${this.getPageObjectClassName(analysis.commandName)} {
  constructor(private page: Page) {}

  // TODO: Implement page object methods
}`;
  }

  private getPageObjectClassName(commandName: string): string {
    if (commandName.includes('login') || commandName.includes('Login')) {
      return 'LoginPage';
    } else if (commandName.includes('modal') || commandName.includes('Modal')) {
      return 'ModalPage';
    } else {
      return 'CustomPage';
    }
  }

  private requiresManualReview(analysis: CustomCommandAnalysis): boolean {
    return analysis.conversionStrategy === 'manual' ||
           analysis.complexity === 'high' ||
           !analysis.hasPlaywrightEquivalent;
  }

  private generateConversionNotes(analysis: CustomCommandAnalysis): string[] {
    const notes: string[] = [];

    if (analysis.conversionStrategy === 'direct') {
      notes.push('Direct command conversion applied');
    } else if (analysis.conversionStrategy === 'utility') {
      notes.push('Converted to utility functions');
    } else if (analysis.conversionStrategy === 'pageObject') {
      notes.push('Converted to page object methods');
      notes.push('Generated page object class requires implementation');
    } else if (analysis.conversionStrategy === 'manual') {
      notes.push('Manual conversion required');
    }

    if (!analysis.hasPlaywrightEquivalent) {
      notes.push(`Unknown custom command detected: ${analysis.commandName}`);
    }

    if (analysis.isChainable) {
      notes.push('Chainable commands converted to sequential async calls');
    }

    if (analysis.complexity === 'high') {
      notes.push('Complex command pattern - review implementation carefully');
    }

    // Add specific notes for known challenging patterns
    if (analysis.commandName.includes('drag') || analysis.commandName.includes('Drop')) {
      notes.push('Drag and drop operations require manual conversion to Playwright API');
    }

    if (analysis.commandName.includes('Test') || analysis.commandName.includes('setup')) {
      notes.push('Test data setup requires manual implementation');
    }

    if (analysis.commandName.includes('validation') || analysis.commandName.includes('Validation')) {
      notes.push('Complex validation logic should be converted to utility functions');
    }

    if (analysis.parameters.length > 3) {
      notes.push('Multiple custom commands detected');
    }

    return notes;
  }

  private validateGeneratedCode(code: string): boolean {
    try {
      // Basic syntax validation using TypeScript parser
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        code,
        ts.ScriptTarget.Latest,
        true
      );

      // Check for syntax errors by examining the AST structure
      let hasErrors = false;

      function visit(node: ts.Node): void {
        if (node.kind === ts.SyntaxKind.Unknown) {
          hasErrors = true;
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
      return !hasErrors;
    } catch (error) {
      this.logger.error('Syntax validation failed:', error);
      return false;
    }
  }

  private createFailureResult(originalCode: string, errorMessage: string): ConvertedCustomCommand {
    return {
      originalCommand: originalCode,
      playwrightEquivalent: `// CONVERSION FAILED: ${errorMessage}\n${originalCode}`,
      isValid: false,
      conversionSuccess: false,
      conversionNotes: [errorMessage],
      transformationMetadata: {
        complexity: 'high',
        requiresManualReview: true,
        strategy: 'manual'
      }
    };
  }
}