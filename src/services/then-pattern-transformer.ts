import * as ts from 'typescript';
import { Logger } from '../utils/logger';
import {
  ThenPatternAnalysis,
  ConvertedThenPattern
} from '../types/pattern-conversion';

export class ThenPatternTransformer {
  private logger = new Logger('ThenPatternTransformer');

  private readonly cypressToPlaywrightMappings = {
    'cy.get': 'page.locator',
    'cy.visit': 'page.goto',
    'cy.url': 'page.url',
    'cy.reload': 'page.reload',
    'cy.wait': 'page.waitForResponse',
    'cy.request': 'page.request.get',
    'cy.intercept': 'page.route',
    'cy.window': 'page.evaluate',
    'cy.log': 'console.log'
  };

  private readonly jqueryMethods = [
    'val', 'text', 'html', 'attr', 'prop', 'addClass', 'removeClass',
    'hasClass', 'show', 'hide', 'toggle', 'focus', 'blur', 'submit',
    'trigger', 'on', 'off', 'slider', 'datepicker', 'autocomplete'
  ];

  public convertThenPattern(cypressCode: string): ConvertedThenPattern {
    this.logger.info('Converting cy.then() pattern to async/await');

    try {
      // Analyze the pattern first
      const analysis = this.analyzeThenPattern(cypressCode);

      if (!analysis.hasThenCallback) {
        return this.createFailureResult(cypressCode, 'No cy.then() pattern detected');
      }

      // Convert the pattern
      const playwrightCode = this.transformToAsyncAwait(cypressCode, analysis);
      this.logger.debug('Original code:', cypressCode);
      this.logger.debug('Converted code:', playwrightCode);

      // Validate the generated code
      const isValid = this.validateGeneratedCode(playwrightCode);

      const result: ConvertedThenPattern = {
        originalPattern: cypressCode,
        playwrightPattern: playwrightCode,
        isValid,
        conversionSuccess: isValid,
        conversionNotes: this.generateConversionNotes(analysis),
        transformationMetadata: {
          complexity: analysis.complexity,
          requiresManualReview: analysis.usesJQueryMethods || analysis.usesCustomCommands,
          nestingLevel: this.calculateNestingLevel(cypressCode),
          estimatedConversionTime: this.estimateConversionTime(analysis)
        }
      };

      this.logger.info(`Conversion completed: ${result.conversionSuccess ? 'SUCCESS' : 'FAILED'}`);
      return result;

    } catch (error) {
      this.logger.error('Error converting cy.then() pattern:', error);
      return this.createFailureResult(cypressCode, `Conversion error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private analyzeThenPattern(code: string): ThenPatternAnalysis {
    const hasThenCallback = /\.then\s*\(\s*\([^)]*\)\s*=>\s*\{/.test(code);
    const isNested = (code.match(/\.then\(/g) || []).length > 1;

    // Extract callback parameter and body
    const thenMatch = code.match(/\.then\s*\(\s*\(([^)]*)\)\s*=>\s*\{([\s\S]*)\}\s*\)/);
    const callbackParameter = thenMatch ? thenMatch[1].trim() : '';
    const callbackBody = thenMatch ? thenMatch[2] : '';

    // Detect chained operations
    const chainedOperations = this.extractChainedOperations(code);

    // Check for jQuery methods
    const usesJQueryMethods = this.jqueryMethods.some(method =>
      new RegExp(`\\$\\w+\\.${method}\\(`).test(code)
    );

    // Check for custom commands
    const usesCustomCommands = /cy\.\w+\(.*\)(?!\.(?:get|visit|url|wait|request|intercept|window|then|should|and|contains|click|type|clear|check|uncheck|select))/.test(code);

    // Check for conditional logic
    const hasConditionalLogic = /\b(if|else|switch|case|for|while)\s*\(/.test(callbackBody);

    // Determine complexity
    let complexity: 'low' | 'medium' | 'high' = 'low';
    if (isNested || hasConditionalLogic || usesJQueryMethods) {
      complexity = 'high';
    } else if (usesCustomCommands || chainedOperations.length > 2) {
      complexity = 'medium';
    }

    return {
      hasThenCallback,
      isNested,
      callbackParameter,
      callbackBody,
      chainedOperations,
      complexity,
      usesJQueryMethods,
      usesCustomCommands,
      hasConditionalLogic
    };
  }

  private extractChainedOperations(code: string): string[] {
    const operations: string[] = [];
    const chainPattern = /cy\.[a-zA-Z]+\([^)]*\)/g;
    let match;

    while ((match = chainPattern.exec(code)) !== null) {
      operations.push(match[0]);
    }

    return operations;
  }

  private transformToAsyncAwait(code: string, analysis: ThenPatternAnalysis): string {
    let convertedCode = code;

    // Convert assertions first
    convertedCode = this.convertAssertions(convertedCode);

    // Convert simple cy.get().then() patterns
    convertedCode = convertedCode.replace(
      /cy\.get\(['"`]([^'"`]+)['"`]\)\.then\s*\(\s*\(([^)]+)\)\s*=>\s*\{([\s\S]*?)\}\s*\);?/g,
      (match, selector, param, body) => {
        const locatorName = this.generateLocatorVariableName(param);
        let convertedBody = body.trim();

        // Replace parameter references in the body
        convertedBody = convertedBody.replace(new RegExp(`\\b${param}\\b`, 'g'), locatorName);

        return `const ${locatorName} = page.locator('${selector}');\n${convertedBody}`;
      }
    );

    // Convert other patterns if needed
    convertedCode = this.convertCypressCommands(convertedCode);

    if (analysis.usesJQueryMethods) {
      convertedCode = this.convertJQueryMethods(convertedCode);
    }

    if (analysis.usesCustomCommands) {
      convertedCode = this.handleCustomCommands(convertedCode);
    }

    return convertedCode;
  }

  private handleSimpleThenPattern(code: string): string {
    // Handle cy.get().then() pattern specifically
    const getPattern = /cy\.get\(['"`]([^'"`]+)['"`]\)\.then\s*\(\s*\(([^)]+)\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g;

    let result = code.replace(getPattern, (match, selector, param, body) => {
      const locatorName = this.generateLocatorVariableName(param);
      const convertedBody = this.convertCallbackBody(body.trim(), param, locatorName);

      return `const ${locatorName} = page.locator('${selector}');\n${convertedBody}`;
    });

    return result;
  }

  private handleNestedThenPatterns(code: string): string {
    // Handle nested .then() patterns by flattening them
    let result = code;
    let nestingLevel = 0;
    const locatorDeclarations: string[] = [];

    // Extract all cy.get() calls and create locator variables
    const getCallPattern = /cy\.get\(['"`]([^'"`]+)['"`]\)/g;
    let match;
    const selectors: string[] = [];

    while ((match = getCallPattern.exec(code)) !== null) {
      selectors.push(match[1]);
    }

    // Generate locator declarations
    selectors.forEach((selector, index) => {
      const locatorName = `element${index + 1}`;
      locatorDeclarations.push(`const ${locatorName} = page.locator('${selector}');`);
    });

    // Extract and flatten all .then() callback bodies
    const thenBodies: string[] = [];
    const thenPattern = /\.then\s*\(\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g;

    while ((match = thenPattern.exec(code)) !== null) {
      const body = match[1].trim();
      if (body) {
        thenBodies.push(this.convertCallbackBody(body, `$el${nestingLevel}`, `element${nestingLevel + 1}`));
        nestingLevel++;
      }
    }

    // Combine locator declarations with flattened bodies
    result = locatorDeclarations.join('\n') + '\n\n' + thenBodies.join('\n');

    return result;
  }

  private convertCallbackBody(body: string, originalParam: string, locatorName: string): string {
    let convertedBody = body.trim();

    // Replace parameter references with locator variable
    const paramPattern = new RegExp(`\\b${originalParam}\\b`, 'g');
    convertedBody = convertedBody.replace(paramPattern, locatorName);

    // Convert common jQuery methods
    convertedBody = convertedBody.replace(/\.val\(['"`]([^'"`]*)['"`]\)/g, '.fill(\'$1\')');
    convertedBody = convertedBody.replace(/\.click\(\)/g, '.click()');
    convertedBody = convertedBody.replace(/\.text\(\)/g, '.textContent()');
    convertedBody = convertedBody.replace(/\.is\(['"`]:visible['"`]\)/g, '.isVisible()');

    // Convert expect statements - handle the substituted parameter
    convertedBody = convertedBody.replace(/expect\(([^)]+)\)\.to\.be\.visible/g, `await expect(${locatorName}).toBeVisible()`);

    // Add await keywords where needed
    convertedBody = this.addAwaitKeywords(convertedBody);

    return convertedBody;
  }

  private convertCypressCommands(code: string): string {
    let result = code;

    // Convert cy.url() patterns
    result = result.replace(/cy\.url\(\)\.then\s*\(\s*\(([^)]+)\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g, (match, param, body) => {
      const convertedBody = body.replace(new RegExp(`\\b${param}\\b`, 'g'), 'url');
      return `const url = page.url();\n${convertedBody}`;
    });

    // Convert cy.wait() patterns
    result = result.replace(/cy\.wait\(['"`]@([^'"`]+)['"`]\)\.then\s*\(\s*\(([^)]+)\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g, (match, alias, param, body) => {
      const convertedBody = body
        .replace(new RegExp(`${param}\\.response\\.body`, 'g'), 'responseBody')
        .replace(new RegExp(`${param}`, 'g'), 'interception');

      return `const interception = await page.waitForResponse(response => response.url().includes('${alias}'));\nconst responseBody = await interception.json();\n${convertedBody}`;
    });

    // Convert cy.request() patterns
    result = result.replace(/cy\.request\(['"`]([^'"`]+)['"`]\)\.then\s*\(\s*\(([^)]+)\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g, (match, url, param, body) => {
      const convertedBody = body.replace(new RegExp(`${param}\\.body`, 'g'), 'responseBody');
      return `const response = await page.request.get('${url}');\nconst responseBody = await response.json();\n${convertedBody}`;
    });

    // Convert cy.window() patterns
    result = result.replace(/cy\.window\(\)\.then\s*\(\s*\(([^)]+)\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g, (match, param, body) => {
      const convertedBody = body.replace(new RegExp(`${param}\\.localStorage`, 'g'), 'localStorage');
      return `await page.evaluate(() => {\n${convertedBody}\n});`;
    });

    return result;
  }

  private convertJQueryMethods(code: string): string {
    let result = code;

    // Convert jQuery method calls to Playwright equivalents
    this.jqueryMethods.forEach(method => {
      switch (method) {
        case 'val':
          result = result.replace(/\$\w+\.val\(['"`]([^'"`]*)['"`]\)/g, 'await locator.fill(\'$1\')');
          break;
        case 'click':
          result = result.replace(/\$\w+\.click\(\)/g, 'await locator.click()');
          break;
        case 'text':
          result = result.replace(/\$\w+\.text\(\)/g, 'await locator.textContent()');
          break;
        case 'trigger':
          result = result.replace(/\$\w+\.trigger\(['"`]([^'"`]+)['"`]\)/g, 'await locator.dispatchEvent(\'$1\')');
          break;
        case 'submit':
          result = result.replace(/\$\w+\.submit\(\)/g, 'await locator.submit()');
          break;
        default:
          // For unsupported jQuery methods, add TODO comment
          const unsupportedPattern = new RegExp('\\$\\w+\\.' + method + '\\([^)]*\\)', 'g');
          result = result.replace(unsupportedPattern, (match) => {
            return `// TODO: Convert jQuery ${method}() method to Playwright equivalent\n${match}`;
          });
      }
    });

    return result;
  }

  private handleCustomCommands(code: string): string {
    // Detect custom commands and add TODO comments
    const customCommandPattern = /cy\.(\w+)\(/g;
    const standardCommands = ['get', 'visit', 'url', 'wait', 'request', 'intercept', 'window', 'then', 'should', 'and', 'contains', 'click', 'type', 'clear', 'check', 'uncheck', 'select', 'log'];

    return code.replace(customCommandPattern, (match, commandName) => {
      if (!standardCommands.includes(commandName)) {
        return `// TODO: Convert custom command cy.${commandName}() to Playwright equivalent\n${match}`;
      }
      return match;
    });
  }

  private convertAssertions(code: string): string {
    let result = code;

    // Convert Cypress assertions to Playwright expect
    result = result.replace(/\.should\(['"`]be\.visible['"`]\)/g, 'await expect(locator).toBeVisible()');
    result = result.replace(/\.should\(['"`]contain\.text['"`],\s*['"`]([^'"`]+)['"`]\)/g, 'await expect(locator).toContainText(\'$1\')');
    result = result.replace(/\.should\(['"`]have\.value['"`],\s*['"`]([^'"`]+)['"`]\)/g, 'await expect(locator).toHaveValue(\'$1\')');
    result = result.replace(/expect\(([^)]+)\)\.to\.be\.visible/g, 'await expect($1).toBeVisible()');
    result = result.replace(/expect\(([^)]+)\)\.to\.include\(['"`]([^'"`]+)['"`]\)/g, 'await expect(page).toHaveURL(/.*$2.*/);');

    // Convert cy.log to console.log
    result = result.replace(/cy\.log\(/g, 'console.log(');

    return result;
  }

  private addAwaitKeywords(code: string): string {
    let result = code;

    // Add await to Playwright method calls that need it
    const awaitPatterns = [
      /(\b(?:page|locator)\.[a-zA-Z]+\([^)]*\))/g,
      /(\bexpect\([^)]+\)\.[a-zA-Z]+\([^)]*\))/g
    ];

    awaitPatterns.forEach(pattern => {
      result = result.replace(pattern, (match) => {
        if (!match.includes('await ')) {
          return `await ${match}`;
        }
        return match;
      });
    });

    return result;
  }

  private generateLocatorVariableName(parameter: string): string {
    // Generate meaningful variable names based on the callback parameter
    const cleaned = parameter.replace(/\$/, '').toLowerCase();

    const nameMap: { [key: string]: string } = {
      'btn': 'button',
      'el': 'element',
      'input': 'input',
      'form': 'form',
      'modal': 'modal',
      'link': 'link'
    };

    return nameMap[cleaned] || 'element';
  }

  private calculateNestingLevel(code: string): number {
    const thenMatches = code.match(/\.then\(/g);
    return thenMatches ? thenMatches.length : 0;
  }

  private estimateConversionTime(analysis: ThenPatternAnalysis): number {
    let baseTime = 5; // 5 seconds for simple patterns

    if (analysis.isNested) baseTime += 10;
    if (analysis.usesJQueryMethods) baseTime += 15;
    if (analysis.usesCustomCommands) baseTime += 20;
    if (analysis.hasConditionalLogic) baseTime += 10;

    return baseTime;
  }

  private generateConversionNotes(analysis: ThenPatternAnalysis): string[] {
    const notes: string[] = [];

    if (analysis.isNested) {
      notes.push('Converted nested cy.then() patterns to sequential async/await operations');
    }

    if (analysis.usesJQueryMethods) {
      notes.push('jQuery methods detected - some may require manual conversion');
    }

    if (analysis.usesCustomCommands) {
      notes.push('Custom commands detected - may require additional conversion');
    }

    if (analysis.hasConditionalLogic) {
      notes.push('Conditional logic preserved in async/await conversion');
    }

    notes.push(`Converted ${analysis.chainedOperations.length} chained operations to Playwright syntax`);

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

  private createFailureResult(originalCode: string, errorMessage: string): ConvertedThenPattern {
    return {
      originalPattern: originalCode,
      playwrightPattern: `// CONVERSION FAILED: ${errorMessage}\n${originalCode}`,
      isValid: false,
      conversionSuccess: false,
      conversionNotes: [errorMessage],
      transformationMetadata: {
        complexity: 'high',
        requiresManualReview: true,
        nestingLevel: 0,
        estimatedConversionTime: 0
      }
    };
  }
}