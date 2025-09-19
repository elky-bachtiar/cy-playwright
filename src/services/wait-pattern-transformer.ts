import * as ts from 'typescript';
import { Logger } from '../utils/logger';
import {
  WaitPatternAnalysis,
  ConvertedWaitPattern
} from '../types/pattern-conversion';

export class WaitPatternTransformer {
  private logger = new Logger('WaitPatternTransformer');
  private aliasToUrlMap = new Map<string, string>();

  public convertWaitPattern(cypressCode: string): ConvertedWaitPattern {
    this.logger.info('Converting cy.wait() and cy.intercept() patterns to Playwright');

    try {
      // First analyze the pattern
      const analysis = this.analyzeWaitPattern(cypressCode);

      // Convert the pattern
      const playwrightCode = this.transformToPlaywright(cypressCode, analysis);

      // Validate the generated code
      const isValid = this.validateGeneratedCode(playwrightCode);

      const result: ConvertedWaitPattern = {
        originalPattern: cypressCode,
        playwrightPattern: playwrightCode,
        isValid,
        conversionSuccess: isValid,
        conversionNotes: this.generateConversionNotes(analysis),
        transformationMetadata: {
          complexity: analysis.complexity,
          requiresManualReview: this.requiresManualReview(analysis),
          usesRequestInterception: analysis.waitType === 'intercept' || analysis.waitType === 'alias'
        }
      };

      this.logger.info(`Wait pattern conversion completed: ${result.conversionSuccess ? 'SUCCESS' : 'FAILED'}`);
      return result;

    } catch (error) {
      this.logger.error('Error converting wait pattern:', error);
      return this.createFailureResult(cypressCode, `Conversion error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private analyzeWaitPattern(code: string): WaitPatternAnalysis {
    // Extract intercept definitions to build alias map
    this.extractInterceptDefinitions(code);

    // Check for wait commands
    const hasWaitCommand = /cy\.wait\(/.test(code);

    // Determine wait type
    let waitType: 'alias' | 'time' | 'intercept' | 'unknown' = 'unknown';
    let aliasName: string | undefined;

    if (/cy\.wait\(['"`]@([^'"`]+)['"`]\)/.test(code)) {
      waitType = 'alias';
      const aliasMatch = code.match(/cy\.wait\(['"`]@([^'"`]+)['"`]\)/);
      aliasName = aliasMatch ? aliasMatch[1] : undefined;
    } else if (/cy\.wait\(\d+\)/.test(code)) {
      waitType = 'time';
    } else if (/cy\.intercept\(/.test(code)) {
      waitType = 'intercept';
    }

    // Check for chained .then()
    const hasChainedThen = /cy\.wait\([^)]+\)\.then\s*\(/.test(code);

    // Check if extracts request data
    const extractsRequestData = hasChainedThen && (
      /interception\.request/.test(code) ||
      /interception\.response/.test(code)
    );

    // Determine complexity
    let complexity: 'low' | 'medium' | 'high' = 'low';
    if (hasChainedThen && extractsRequestData) {
      complexity = 'high';
    } else if (waitType === 'intercept' || waitType === 'alias') {
      complexity = 'medium';
    }

    return {
      hasWaitCommand,
      aliasName,
      waitType,
      hasChainedThen,
      extractsRequestData,
      complexity
    };
  }

  private extractInterceptDefinitions(code: string): void {
    // Extract all cy.intercept().as() patterns
    const interceptPattern = /cy\.intercept\([^)]+\)\.as\(['"`]([^'"`]+)['"`]\)/g;
    let match;

    while ((match = interceptPattern.exec(code)) !== null) {
      const aliasName = match[1];
      // Extract URL from the intercept call
      const interceptCall = match[0];
      const urlMatch = interceptCall.match(/cy\.intercept\([^,]*,\s*['"`]([^'"`]+)['"`]/);
      if (urlMatch) {
        this.aliasToUrlMap.set(aliasName, urlMatch[1]);
      }
    }
  }

  private transformToPlaywright(code: string, analysis: WaitPatternAnalysis): string {
    let convertedCode = code;

    // Convert cy.intercept() patterns first
    convertedCode = this.convertInterceptPatterns(convertedCode);

    // Convert cy.wait() patterns
    convertedCode = this.convertWaitPatterns(convertedCode, analysis);

    // Convert chained .then() patterns if present
    if (analysis.hasChainedThen) {
      convertedCode = this.convertWaitThenPatterns(convertedCode);
    }

    return convertedCode.trim();
  }

  private convertInterceptPatterns(code: string): string {
    let result = code;

    // Convert basic cy.intercept() with response mocking
    result = result.replace(
      /cy\.intercept\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`],\s*\{([^}]+)\}\)\.as\(['"`]([^'"`]+)['"`]\);?/g,
      (match, method, url, responseObj, alias) => {
        return `await page.route('${url}', route => {
  if (route.request().method() === '${method}') {
    route.fulfill({
      ${this.convertResponseObject(responseObj)}
    });
  } else {
    route.continue();
  }
});`;
      }
    );

    // Convert cy.intercept() with fixture
    result = result.replace(
      /cy\.intercept\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`],\s*\{\s*fixture:\s*['"`]([^'"`]+)['"`]\s*\}\)\.as\(['"`]([^'"`]+)['"`]\);?/g,
      (match, method, url, fixture, alias) => {
        return `await page.route('${url}', route => {
  // TODO: Load fixture file ${fixture}
  route.fulfill({
    status: 200,
    body: JSON.stringify({}) // Replace with fixture data
  });
});`;
      }
    );

    // Convert cy.intercept() with regex patterns
    result = result.replace(
      /cy\.intercept\(['"`]([^'"`]+)['"`],\s*(\/[^\/]+\/[gimuy]*),\s*\{([^}]+)\}\)\.as\(['"`]([^'"`]+)['"`]\);?/g,
      (match, method, regexPattern, responseObj, alias) => {
        return `await page.route(${regexPattern}, route => {
  if (route.request().method() === '${method}') {
    route.fulfill({
      ${this.convertResponseObject(responseObj)}
    });
  } else {
    route.continue();
  }
});`;
      }
    );

    // Convert basic cy.intercept() without response (just monitoring)
    result = result.replace(
      /cy\.intercept\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)\.as\(['"`]([^'"`]+)['"`]\);?/g,
      (match, method, url, alias) => {
        return `await page.route('${url}', route => route.continue());`;
      }
    );

    return result;
  }

  private convertWaitPatterns(code: string, analysis: WaitPatternAnalysis): string {
    let result = code;

    // Convert cy.wait() with alias
    result = result.replace(
      /cy\.wait\(['"`]@([^'"`]+)['"`]\);?/g,
      (match, aliasName) => {
        const url = this.aliasToUrlMap.get(aliasName);
        if (url) {
          return `await page.waitForResponse(response => response.url().includes('${url}'));`;
        } else {
          return `// TODO: Could not resolve alias @${aliasName} - check cy.intercept() definition
await page.waitForResponse(response => response.url().includes('${aliasName}'));`;
        }
      }
    );

    // Convert cy.wait() with timeout
    result = result.replace(
      /cy\.wait\((\d+)\);?/g,
      'await page.waitForTimeout($1);'
    );

    // Convert cy.wait() with multiple aliases
    result = result.replace(
      /cy\.wait\(\[([^\]]+)\]\);?/g,
      (match, aliasesStr) => {
        const aliases = aliasesStr.split(',').map((alias: string) => alias.trim().replace(/['"`@]/g, ''));
        const waitPromises = aliases.map((alias: string) => {
          const url = this.aliasToUrlMap.get(alias);
          return `page.waitForResponse(response => response.url().includes('${url || alias}'))`;
        });

        return `await Promise.all([
  ${waitPromises.join(',\n  ')}
]);`;
      }
    );

    return result;
  }

  private convertWaitThenPatterns(code: string): string {
    let result = code;

    // Convert cy.wait().then() patterns
    result = result.replace(
      /cy\.wait\(['"`]@([^'"`]+)['"`]\)\.then\s*\(\s*\(([^)]+)\)\s*=>\s*\{([\s\S]*?)\}\s*\);?/g,
      (match, aliasName, param, body) => {
        const url = this.aliasToUrlMap.get(aliasName);
        let convertedBody = this.convertInterceptionBody(body, param);

        return `const ${param} = await page.waitForResponse(response => response.url().includes('${url || aliasName}'));
${convertedBody}`;
      }
    );

    return result;
  }

  private convertInterceptionBody(body: string, paramName: string): string {
    let convertedBody = body.trim();

    // Convert response status code checks
    convertedBody = convertedBody.replace(
      new RegExp(`${paramName}\\.response\\.statusCode`, 'g'),
      `${paramName}.status()`
    );

    // Convert response body access
    convertedBody = convertedBody.replace(
      new RegExp(`${paramName}\\.response\\.body`, 'g'),
      'responseBody'
    );

    // Add response body extraction if needed
    if (convertedBody.includes('responseBody')) {
      convertedBody = `const responseBody = await ${paramName}.json();\n${convertedBody}`;
    }

    // Convert request URL access
    convertedBody = convertedBody.replace(
      new RegExp(`${paramName}\\.request\\.url`, 'g'),
      `${paramName}.request().url()`
    );

    // Convert request body access
    convertedBody = convertedBody.replace(
      new RegExp(`${paramName}\\.request\\.body`, 'g'),
      'requestBody'
    );

    // Add request body extraction if needed
    if (convertedBody.includes('requestBody')) {
      convertedBody = `const requestBody = await ${paramName}.request().postDataJSON();\n${convertedBody}`;
    }

    // Convert request headers access
    convertedBody = convertedBody.replace(
      new RegExp(`${paramName}\\.request\\.headers`, 'g'),
      'requestHeaders'
    );

    // Add request headers extraction if needed
    if (convertedBody.includes('requestHeaders')) {
      convertedBody = `const requestHeaders = ${paramName}.request().headers();\n${convertedBody}`;
    }

    // Convert assertions
    convertedBody = this.convertAssertions(convertedBody);

    // Convert cy.log to console.log
    convertedBody = convertedBody.replace(/cy\.log\(/g, 'console.log(');

    // Convert Cypress commands to Playwright
    convertedBody = this.convertCypressCommands(convertedBody);

    return convertedBody;
  }

  private convertResponseObject(responseObjStr: string): string {
    let converted = responseObjStr.trim();

    // Convert statusCode to status
    converted = converted.replace(/statusCode:\s*(\d+)/, 'status: $1');

    // Convert body object to JSON string
    converted = converted.replace(/body:\s*(\{[^}]+\})/, (match, bodyObj) => {
      return `body: JSON.stringify(${bodyObj})`;
    });

    return converted;
  }

  private convertAssertions(code: string): string {
    let result = code;

    // Convert expect().to.equal() to expect().toBe()
    result = result.replace(/expect\(([^)]+)\)\.to\.equal\(([^)]+)\)/g, 'expect($1).toBe($2)');

    // Convert expect().to.deep.equal() to expect().toEqual()
    result = result.replace(/expect\(([^)]+)\)\.to\.deep\.equal\(([^)]+)\)/g, 'expect($1).toEqual($2)');

    // Convert expect().to.have.property() to expect().toHaveProperty()
    result = result.replace(/expect\(([^)]+)\)\.to\.have\.property\(['"`]([^'"`]+)['"`]\)/g, 'expect($1).toHaveProperty(\'$2\')');

    // Convert expect().to.include() to expect().toContain()
    result = result.replace(/expect\(([^)]+)\)\.to\.include\(([^)]+)\)/g, 'expect($1).toContain($2)');

    // Convert expect().to.match() to expect().toMatch()
    result = result.replace(/expect\(([^)]+)\)\.to\.match\(([^)]+)\)/g, 'expect($1).toMatch($2)');

    // Convert expect().to.be.lessThan() to expect().toBeLessThan()
    result = result.replace(/expect\(([^)]+)\)\.to\.be\.lessThan\(([^)]+)\)/g, 'expect($1).toBeLessThan($2)');

    return result;
  }

  private convertCypressCommands(code: string): string {
    let result = code;

    // Convert cy.get().click() to page.locator().click()
    result = result.replace(/cy\.get\(['"`]([^'"`]+)['"`]\)\.click\(\)/g, 'await page.locator(\'$1\').click()');

    // Convert cy.reload() to page.reload()
    result = result.replace(/cy\.reload\(\)/g, 'await page.reload()');

    // Convert cy.wait() with timeout
    result = result.replace(/cy\.wait\((\d+)\)/g, 'await page.waitForTimeout($1)');

    return result;
  }

  private requiresManualReview(analysis: WaitPatternAnalysis): boolean {
    return analysis.complexity === 'high' ||
           analysis.extractsRequestData ||
           (analysis.waitType === 'unknown');
  }

  private generateConversionNotes(analysis: WaitPatternAnalysis): string[] {
    const notes: string[] = [];

    if (analysis.waitType === 'intercept') {
      notes.push('Converted cy.intercept() to page.route()');
    }

    if (analysis.waitType === 'alias') {
      notes.push('Converted cy.wait() to page.waitForResponse()');
    }

    if (analysis.waitType === 'time') {
      notes.push('Converted cy.wait() with timeout to page.waitForTimeout()');
    }

    if (analysis.hasChainedThen) {
      notes.push('Converted chained .then() callback to async/await pattern');
    }

    if (analysis.extractsRequestData) {
      notes.push('Converted request/response data extraction to Playwright API calls');
    }

    if (analysis.complexity === 'high') {
      notes.push('Complex pattern detected - manual review recommended');
    }

    // Check for fixture usage
    if (/fixture:/.test(this.logger.toString())) {
      notes.push('Fixture file integration requires manual setup');
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

  private createFailureResult(originalCode: string, errorMessage: string): ConvertedWaitPattern {
    return {
      originalPattern: originalCode,
      playwrightPattern: `// CONVERSION FAILED: ${errorMessage}\n${originalCode}`,
      isValid: false,
      conversionSuccess: false,
      conversionNotes: [errorMessage],
      transformationMetadata: {
        complexity: 'high',
        requiresManualReview: true,
        usesRequestInterception: false
      }
    };
  }
}