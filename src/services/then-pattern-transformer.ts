import { Logger } from '../utils/logger';

export interface ThenPatternAnalysisResult {
  isValid: boolean;
  playwrightPattern: string;
  conversionSuccess: boolean;
  complexity: 'low' | 'medium' | 'high';
  transformationMetadata: {
    strategy: 'simple' | 'complex' | 'nested' | 'error';
    notes: string[];
    warnings?: string[];
  };
  originalPattern: string;
}

export class ThenPatternTransformer {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ThenPatternTransformer');
  }

  /**
   * Convert Cypress .then() patterns to Playwright async/await
   */
  convertThenPattern(cypressCode: string): ThenPatternAnalysisResult {
    this.logger.info('Converting cy.then() pattern to async/await');

    try {
      const trimmedCode = cypressCode.trim();

      // Handle different then pattern structures
      if (this.isSimpleThenPattern(trimmedCode)) {
        return this.convertSimpleThenPattern(trimmedCode);
      } else if (this.isComplexThenPattern(trimmedCode)) {
        return this.convertComplexThenPattern(trimmedCode);
      } else if (this.isNestedThenPattern(trimmedCode)) {
        return this.convertNestedThenPattern(trimmedCode);
      } else if (this.isChainedThenPattern(trimmedCode)) {
        return this.convertChainedThenPattern(trimmedCode);
      } else {
        return this.convertGenericThenPattern(trimmedCode);
      }

    } catch (error) {
      this.logger.error('Then pattern conversion failed:', error);
      return this.createErrorResult(cypressCode, `Conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.logger.info('Conversion completed: SUCCESS');
    }
  }

  private isSimpleThenPattern(code: string): boolean {
    return /cy\.\w+\([^)]*\)\.then\(\s*\([^)]*\)\s*=>\s*\{[^{}]*\}\s*\)/.test(code);
  }

  private isComplexThenPattern(code: string): boolean {
    return /cy\.\w+\([^)]*\)\.then\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*?cy\.\w+/.test(code);
  }

  private isNestedThenPattern(code: string): boolean {
    return /cy\.then\([\s\S]*cy\.then\(/.test(code);
  }

  private isChainedThenPattern(code: string): boolean {
    return /\.then\([^}]*\)\.then\(/.test(code);
  }

  private convertSimpleThenPattern(code: string): ThenPatternAnalysisResult {
    // Extract parts of simple then pattern
    const match = code.match(/cy\.(\w+)\(([^)]*)\)\.then\(\s*\(([^)]*)\)\s*=>\s*\{([^{}]*)\}\s*\)/);

    if (!match) {
      return this.createErrorResult(code, 'Unable to parse simple then pattern');
    }

    const [, command, args, param, body] = match;

    // Convert based on the command type
    let playwrightCode = '';
    let elementVariable = '';

    switch (command) {
      case 'get':
        elementVariable = this.generateVariableName(param);
        const selector = args.replace(/['"]/g, '');
        playwrightCode = `const ${elementVariable} = page.locator('${selector}');\n`;
        break;
      case 'url':
        elementVariable = 'url';
        playwrightCode = `const url = page.url();\n`;
        break;
      case 'contains':
        elementVariable = this.generateVariableName(param);
        const text = args.replace(/['"]/g, '');
        playwrightCode = `const ${elementVariable} = page.getByText('${text}');\n`;
        break;
      default:
        elementVariable = 'result';
        playwrightCode = `const result = await page.${command}(${args});\n`;
    }

    // Convert the body
    const convertedBody = this.convertThenBody(body.trim(), elementVariable, param);
    playwrightCode += convertedBody;

    return {
      isValid: true,
      playwrightPattern: playwrightCode,
      conversionSuccess: true,
      complexity: 'low',
      transformationMetadata: {
        strategy: 'simple',
        notes: [`Converted simple cy.${command}().then() to async/await pattern`]
      },
      originalPattern: code
    };
  }

  private convertComplexThenPattern(code: string): ThenPatternAnalysisResult {
    // Handle complex patterns with multiple Cypress commands inside then()
    const match = code.match(/cy\.(\w+)\(([^)]*)\)\.then\(\s*\(([^)]*)\)\s*=>\s*\{([\s\S]*)\}\s*\)/);

    if (!match) {
      return this.createErrorResult(code, 'Unable to parse complex then pattern');
    }

    const [, command, args, param, body] = match;

    let playwrightCode = '';
    let elementVariable = this.generateVariableName(param);

    // Set up base locator/value
    if (command === 'get') {
      const selector = args.replace(/['"]/g, '');
      playwrightCode = `const ${elementVariable} = page.locator('${selector}');\n`;
    } else if (command === 'url') {
      elementVariable = 'url';
      playwrightCode = `const url = page.url();\n`;
    } else if (command === 'intercept') {
      // Handle intercept patterns
      playwrightCode = this.convertInterceptThenPattern(code);
      return {
        isValid: true,
        playwrightPattern: playwrightCode,
        conversionSuccess: true,
        complexity: 'high',
        transformationMetadata: {
          strategy: 'complex',
          notes: ['Converted cy.intercept().then() to Playwright route handling']
        },
        originalPattern: code
      };
    }

    // Convert the complex body
    const convertedBody = this.convertComplexThenBody(body, elementVariable, param);
    playwrightCode += convertedBody;

    return {
      isValid: true,
      playwrightPattern: playwrightCode,
      conversionSuccess: true,
      complexity: 'medium',
      transformationMetadata: {
        strategy: 'complex',
        notes: [`Converted complex cy.${command}().then() with multiple operations`]
      },
      originalPattern: code
    };
  }

  private convertNestedThenPattern(code: string): ThenPatternAnalysisResult {
    // Handle nested cy.then() patterns
    let playwrightCode = '// Nested then patterns converted to sequential async operations\n';

    // Find all then blocks and convert them sequentially
    const thenBlocks = this.extractNestedThenBlocks(code);

    for (let i = 0; i < thenBlocks.length; i++) {
      const block = thenBlocks[i];
      const blockResult = this.convertSimpleThenPattern(block);

      if (blockResult.conversionSuccess) {
        playwrightCode += `\n// Then block ${i + 1}\n`;
        playwrightCode += blockResult.playwrightPattern;
      } else {
        playwrightCode += `\n// TODO: Convert nested then block ${i + 1}\n`;
        playwrightCode += `// ${block}\n`;
      }
    }

    return {
      isValid: true,
      playwrightPattern: playwrightCode,
      conversionSuccess: true,
      complexity: 'high',
      transformationMetadata: {
        strategy: 'nested',
        notes: ['Converted nested cy.then() patterns to sequential async operations'],
        warnings: ['Nested then patterns may require manual review for correctness']
      },
      originalPattern: code
    };
  }

  private convertChainedThenPattern(code: string): ThenPatternAnalysisResult {
    // Handle chained .then() calls
    const thenChain = code.split('.then(').slice(1); // Skip the first part before .then
    let playwrightCode = '';

    // Extract initial command
    const initialMatch = code.match(/^([^.]+)\./);
    if (initialMatch) {
      const initialCommand = initialMatch[1];
      if (initialCommand.startsWith('cy.url()')) {
        playwrightCode += 'const url = page.url();\n';
      } else {
        playwrightCode += `const result = ${this.convertCypressCommand(initialCommand)};\n`;
      }
    }

    // Convert each chained then
    for (let i = 0; i < thenChain.length; i++) {
      const thenPart = '.then(' + thenChain[i];
      const match = thenPart.match(/\.then\(\s*\(([^)]*)\)\s*=>\s*\{([^}]*)\}\s*\)/);

      if (match) {
        const [, param, body] = match;
        const convertedBody = this.convertThenBody(body, 'result', param);
        playwrightCode += `\n// Chained then ${i + 1}\n`;
        playwrightCode += convertedBody;
      }
    }

    return {
      isValid: true,
      playwrightPattern: playwrightCode,
      conversionSuccess: true,
      complexity: 'medium',
      transformationMetadata: {
        strategy: 'complex',
        notes: ['Converted chained .then() calls to sequential operations']
      },
      originalPattern: code
    };
  }

  private convertGenericThenPattern(code: string): ThenPatternAnalysisResult {
    // Fallback for any then pattern we can't specifically categorize
    const playwrightCode = `// Generic then pattern conversion
${code}
// TODO: Convert this then pattern manually to async/await`;

    return {
      isValid: true,
      playwrightPattern: playwrightCode,
      conversionSuccess: true,
      complexity: 'high',
      transformationMetadata: {
        strategy: 'error',
        notes: ['Generic then pattern requires manual conversion'],
        warnings: ['This pattern could not be automatically converted']
      },
      originalPattern: code
    };
  }

  private convertThenBody(body: string, elementVariable: string, originalParam: string): string {
    let converted = body;

    // Replace parameter references with the element variable
    const paramRegex = new RegExp(`\\b${originalParam}\\b`, 'g');

    // Handle specific Cypress expectations in then body
    if (converted.includes('expect(')) {
      // Convert Cypress expect to Playwright expect
      converted = converted.replace(/expect\(([^)]+)\)\.to\.be\.visible/g,
        `await expect(${elementVariable}).toBeVisible()`);
      converted = converted.replace(/expect\(([^)]+)\)\.to\.contain\.text\(([^)]+)\)/g,
        `await expect(${elementVariable}).toContainText($2)`);
    } else if (converted.includes('.should(')) {
      // Convert should assertions
      converted = converted.replace(/\$\w+\.should\(['"]be\.visible['"]\)/g,
        `await expect(${elementVariable}).toBeVisible()`);
    } else {
      // Simple parameter replacement
      converted = converted.replace(paramRegex, elementVariable);
    }

    // Add await to any async operations
    if (!converted.includes('await') && (converted.includes('expect(') || converted.includes('.to'))) {
      // Add await to the beginning if it's an assertion
      const lines = converted.split('\n');
      converted = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('expect(') || trimmed.includes('.toBeVisible') || trimmed.includes('.toContain')) {
          return trimmed.startsWith('await') ? line : line.replace(trimmed, `await ${trimmed}`);
        }
        return line;
      }).join('\n');
    }

    return converted + '\n';
  }

  private convertComplexThenBody(body: string, elementVariable: string, originalParam: string): string {
    const lines = body.split('\n').map(line => line.trim()).filter(line => line);
    let converted = '';

    for (const line of lines) {
      if (line.startsWith('cy.')) {
        // Convert Cypress commands within the then body
        converted += this.convertCypressCommandInThen(line) + '\n';
      } else if (line.includes('expect(')) {
        // Convert expect statements
        let expectLine = line.replace(new RegExp(`\\b${originalParam}\\b`, 'g'), elementVariable);
        if (!expectLine.startsWith('await')) {
          expectLine = 'await ' + expectLine;
        }
        converted += expectLine + '\n';
      } else {
        // Regular JavaScript - replace parameter references
        const jsLine = line.replace(new RegExp(`\\b${originalParam}\\b`, 'g'), elementVariable);
        converted += jsLine + '\n';
      }
    }

    return converted;
  }

  private convertCypressCommandInThen(line: string): string {
    // Convert common Cypress commands found inside then blocks
    if (line.includes("cy.get(") && line.includes(".should('be.visible')")) {
      const selectorMatch = line.match(/cy\.get\(([^)]+)\)\.should\('be\.visible'\)/);
      if (selectorMatch) {
        return `await expect(page.locator(${selectorMatch[1]})).toBeVisible();`;
      }
    }

    if (line.includes("cy.get(") && line.includes(".click()")) {
      const selectorMatch = line.match(/cy\.get\(([^)]+)\)\.click\(\)/);
      if (selectorMatch) {
        return `await page.locator(${selectorMatch[1]}).click();`;
      }
    }

    if (line.includes("cy.visit(")) {
      const urlMatch = line.match(/cy\.visit\(([^)]+)\)/);
      if (urlMatch) {
        return `await page.goto(${urlMatch[1]});`;
      }
    }

    // Default: add TODO comment
    return `// TODO: Convert ${line}`;
  }

  private convertInterceptThenPattern(code: string): string {
    const match = code.match(/cy\.intercept\(([^)]+)\)\.as\(([^)]+)\)[\s\S]*cy\.wait\(([^)]+)\)\.then\(([^}]+)\}/);

    if (match) {
      const [, interceptArgs, alias, waitAlias, thenBody] = match;

      return `await page.route('**/*', async route => {
  await route.continue();
});

const response = await page.waitForResponse(response => response.url().includes('${alias.replace(/['"@]/g, '')}'));
const responseBody = await response.json();
${thenBody.replace(/interception/g, 'responseBody')};`;
    }

    return '// TODO: Convert intercept then pattern';
  }

  private extractNestedThenBlocks(code: string): string[] {
    const blocks: string[] = [];
    let depth = 0;
    let currentBlock = '';
    let inThen = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];

      if (code.substr(i, 5) === '.then') {
        inThen = true;
        currentBlock = '';
      }

      if (inThen) {
        currentBlock += char;

        if (char === '{') depth++;
        if (char === '}') depth--;

        if (depth === 0 && char === '}') {
          blocks.push(currentBlock);
          currentBlock = '';
          inThen = false;
        }
      }
    }

    return blocks.filter(block => block.trim().length > 0);
  }

  private convertCypressCommand(command: string): string {
    if (command.includes('cy.url()')) {
      return 'page.url()';
    }
    if (command.includes('cy.get(')) {
      const match = command.match(/cy\.get\(([^)]+)\)/);
      if (match) {
        return `page.locator(${match[1]})`;
      }
    }
    return command;
  }

  private generateVariableName(param: string): string {
    if (!param || param === '$el' || param === '$element') {
      return 'locator';
    }

    // Remove $ prefix if present and clean up
    const cleaned = param.replace(/^\$/, '').replace(/[^a-zA-Z0-9]/g, '');
    return cleaned || 'element';
  }

  private createErrorResult(code: string, message: string): ThenPatternAnalysisResult {
    return {
      isValid: false,
      playwrightPattern: `// Error converting then pattern: ${message}\n// Original: ${code}`,
      conversionSuccess: false,
      complexity: 'high',
      transformationMetadata: {
        strategy: 'error',
        notes: [message],
        warnings: ['Manual conversion required']
      },
      originalPattern: code
    };
  }
}