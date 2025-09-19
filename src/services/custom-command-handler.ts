import { Logger } from '../utils/logger';

export interface CustomCommandConversionResult {
  isValid: boolean;
  playwrightEquivalent: string;
  conversionSuccess: boolean;
  transformationMetadata: {
    strategy: 'direct' | 'utility' | 'pageobject';
    complexity: 'low' | 'medium' | 'high';
    notes?: string[];
  };
  warnings?: string[];
  errors?: string[];
}

export class CustomCommandHandler {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('CustomCommandHandler');
  }

  /**
   * Convert Cypress custom command to Playwright equivalent
   */
  convertCustomCommand(cypressCode: string): CustomCommandConversionResult {
    this.logger.info('Converting custom commands to Playwright equivalents');

    try {
      // Extract command name and parameters
      const commandMatch = cypressCode.match(/cy\.(\w+)\((.*)\)/s);
      if (!commandMatch) {
        return this.createErrorResult('Invalid Cypress command format');
      }

      const [, commandName, argsString] = commandMatch;
      const args = this.parseArguments(argsString);

      let result: CustomCommandConversionResult;

      // Handle different custom command patterns
      switch (commandName) {
        case 'login':
          result = this.convertLoginCommand(args);
          break;
        case 'selectDropdown':
          result = this.convertSelectDropdownCommand(args);
          break;
        case 'uploadFile':
          result = this.convertUploadFileCommand(args);
          break;
        case 'customThen':
          result = this.convertCustomThenCommand(cypressCode);
          break;
        case 'customLog':
          result = this.convertCustomLogCommand(args);
          break;
        case 'navigateToSection':
          result = this.convertNavigateToSectionCommand(args);
          break;
        default:
          result = this.convertGenericCustomCommand(commandName, args);
          break;
      }

      this.logger.info('Custom command conversion completed: SUCCESS');
      return result;

    } catch (error) {
      this.logger.error('Custom command conversion failed:', error);
      return this.createErrorResult(`Conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private convertLoginCommand(args: string[]): CustomCommandConversionResult {
    const playwrightEquivalent = `// TODO: Convert custom command cy.login() to Playwright equivalent
async function login(page: Page, username: string, password: string) {
  await page.getByRole('textbox', { name: /username|email/i }).fill(username);
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await page.getByRole('button', { name: /login|sign in/i }).click();
}`;

    return {
      isValid: true,
      playwrightEquivalent,
      conversionSuccess: true,
      transformationMetadata: {
        strategy: 'utility',
        complexity: 'medium',
        notes: ['Login function requires implementation based on specific UI elements']
      }
    };
  }

  private convertSelectDropdownCommand(args: string[]): CustomCommandConversionResult {
    const [selector, value] = args;
    const cleanSelector = this.cleanQuotes(selector);
    const cleanValue = this.cleanQuotes(value);

    const playwrightEquivalent = `await page.locator('${cleanSelector}').selectOption('${cleanValue}');`;

    return {
      isValid: true,
      playwrightEquivalent,
      conversionSuccess: true,
      transformationMetadata: {
        strategy: 'direct',
        complexity: 'low'
      }
    };
  }

  private convertUploadFileCommand(args: string[]): CustomCommandConversionResult {
    const [selector, fileName] = args;
    const cleanSelector = this.cleanQuotes(selector);
    const cleanFileName = this.cleanQuotes(fileName);

    const playwrightEquivalent = `await page.locator('${cleanSelector}').setInputFiles('${cleanFileName}');`;

    return {
      isValid: true,
      playwrightEquivalent,
      conversionSuccess: true,
      transformationMetadata: {
        strategy: 'direct',
        complexity: 'low'
      }
    };
  }

  private convertCustomThenCommand(cypressCode: string): CustomCommandConversionResult {
    // Extract the callback function content
    const callbackMatch = cypressCode.match(/cy\.customThen\(\(\) => \{([\s\S]*?)\}\)/);
    if (!callbackMatch) {
      return this.createErrorResult('Unable to parse customThen callback');
    }

    const callbackContent = callbackMatch[1];
    let playwrightCode = '// Custom then logic converted to async function\n';

    // Convert Cypress commands in the callback to Playwright
    const lines = callbackContent.trim().split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.includes("cy.get") && trimmedLine.includes("should('be.visible')")) {
        const selectorMatch = trimmedLine.match(/cy\.get\(['"](.*?)['"]\)\.should\('be\.visible'\)/);
        if (selectorMatch) {
          playwrightCode += `await expect(page.locator('${selectorMatch[1]}')).toBeVisible();\n`;
        }
      } else if (trimmedLine.includes("cy.get") && trimmedLine.includes(".click()")) {
        const selectorMatch = trimmedLine.match(/cy\.get\(['"](.*?)['"]\)\.click\(\)/);
        if (selectorMatch) {
          playwrightCode += `await page.locator('${selectorMatch[1]}').click();\n`;
        }
      }
    }

    return {
      isValid: true,
      playwrightEquivalent: playwrightCode,
      conversionSuccess: true,
      transformationMetadata: {
        strategy: 'utility',
        complexity: 'medium',
        notes: ['CustomThen converted to async function with Playwright commands']
      }
    };
  }

  private convertCustomLogCommand(args: string[]): CustomCommandConversionResult {
    const formattedArgs = args.map(arg => {
      // Handle object literals
      if (arg.trim().startsWith('{') && arg.trim().endsWith('}')) {
        return arg;
      }
      return `'${this.cleanQuotes(arg)}'`;
    }).join(', ');

    const playwrightEquivalent = `console.log(${formattedArgs});`;

    return {
      isValid: true,
      playwrightEquivalent,
      conversionSuccess: true,
      transformationMetadata: {
        strategy: 'direct',
        complexity: 'low'
      }
    };
  }

  private convertNavigateToSectionCommand(args: string[]): CustomCommandConversionResult {
    const [section, subsection] = args.map(arg => this.cleanQuotes(arg));

    const playwrightEquivalent = `// TODO: Convert custom navigation command
await page.getByRole('navigation').getByText('${section}').click();
await page.getByRole('link', { name: '${subsection}' }).click();`;

    return {
      isValid: true,
      playwrightEquivalent,
      conversionSuccess: true,
      transformationMetadata: {
        strategy: 'utility',
        complexity: 'medium',
        notes: ['Navigation implementation may need adjustment based on actual UI structure']
      }
    };
  }

  private convertGenericCustomCommand(commandName: string, args: string[]): CustomCommandConversionResult {
    const playwrightEquivalent = `// TODO: Convert custom command cy.${commandName}() to Playwright equivalent
// Parameters: ${args.join(', ')}
// This custom command requires manual implementation`;

    return {
      isValid: true,
      playwrightEquivalent,
      conversionSuccess: true,
      transformationMetadata: {
        strategy: 'utility',
        complexity: 'high',
        notes: [`Generic custom command ${commandName} requires manual implementation`]
      },
      warnings: [`Custom command ${commandName} needs manual conversion`]
    };
  }

  private parseArguments(argsString: string): string[] {
    if (!argsString.trim()) {
      return [];
    }

    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let braceDepth = 0;
    let parenDepth = 0;

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];

      if (!inQuotes) {
        if (char === '"' || char === "'") {
          inQuotes = true;
          quoteChar = char;
        } else if (char === '{') {
          braceDepth++;
        } else if (char === '}') {
          braceDepth--;
        } else if (char === '(') {
          parenDepth++;
        } else if (char === ')') {
          parenDepth--;
        } else if (char === ',' && braceDepth === 0 && parenDepth === 0) {
          args.push(current.trim());
          current = '';
          continue;
        }
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      }

      current += char;
    }

    if (current.trim()) {
      args.push(current.trim());
    }

    return args;
  }

  private cleanQuotes(str: string): string {
    return str.replace(/^['"]|['"]$/g, '');
  }

  private createErrorResult(message: string): CustomCommandConversionResult {
    return {
      isValid: false,
      playwrightEquivalent: `// Error: ${message}`,
      conversionSuccess: false,
      transformationMetadata: {
        strategy: 'utility',
        complexity: 'high'
      },
      errors: [message]
    };
  }
}