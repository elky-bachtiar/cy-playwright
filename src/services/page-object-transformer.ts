import { Logger } from '../utils/logger';
import { MethodInfo, PropertyInfo, PageObjectAnalysisResult, MethodParameter } from './page-object-analyzer';

export interface ConvertedMethod {
  name: string;
  signature: string;
  body: string;
  isAsync: boolean;
  requiresPage: boolean;
  originalComplexity: 'low' | 'medium' | 'high';
  conversionSuccess: boolean;
  conversionNotes: string[];
}

export interface ConvertedPageObject {
  originalClassName: string;
  playwrightClassName: string;
  generatedCode: string;
  imports: string[];
  hasPageParameter: boolean;
  methods: ConvertedMethod[];
  properties: PropertyInfo[];
  isValid: boolean;
  conversionSummary: {
    totalMethods: number;
    convertedMethods: number;
    failedMethods: number;
    preservedMockingMethods: number;
  };
}

export interface PageObjectTransformOptions {
  preserveClassName?: boolean;
  addPlaywrightImports?: boolean;
  generateConstructor?: boolean;
  preserveComments?: boolean;
  convertMockingMethods?: boolean;
}

export class PageObjectTransformer {
  private logger = new Logger('PageObjectTransformer');

  // Cypress to Playwright command mappings
  private readonly commandMappings = {
    'cy.visit': 'page.goto',
    'cy.get': 'page.locator',
    'cy.contains': 'page.getByText',
    '.type': '.fill',
    '.click': '.click',
    '.clear': '.clear',
    '.select': '.selectOption',
    '.check': '.check',
    '.uncheck': '.uncheck',
    '.should': 'expect',
    '.dblclick': '.dblclick'
  };

  convertVisitMethod(method: any): ConvertedMethod {
    try {
      this.logger.debug(`Converting visit method: ${method.name}`);

      let convertedBody = method.body;

      // Convert cy.visit() to page.goto()
      convertedBody = convertedBody.replace(
        /cy\.visit\(([^)]+)\)/g,
        'await page.goto($1)'
      );

      // Handle additional cy.get() calls in visit methods
      convertedBody = this.convertCyGetCalls(convertedBody);

      // Handle .should() assertions
      convertedBody = this.convertAssertions(convertedBody);

      return {
        name: method.name,
        signature: `async ${method.name}(${this.getParametersString(method.parameters || [])})`,
        body: convertedBody,
        isAsync: true,
        requiresPage: true,
        originalComplexity: method.conversionComplexity || 'low',
        conversionSuccess: true,
        conversionNotes: ['Converted cy.visit() to page.goto()']
      };
    } catch (error) {
      this.logger.warn(`Failed to convert visit method ${method.name}:`, error);
      return this.createFailedConversion(method, `Visit method conversion failed: ${error}`);
    }
  }

  convertInputMethod(method: any): ConvertedMethod {
    try {
      this.logger.debug(`Converting input method: ${method.name}`);

      let convertedBody = method.body;

      // Convert cy.get().type() to page.locator().fill()
      convertedBody = convertedBody.replace(
        /cy\.get\(([^)]+)\)\.type\(([^)]+)\)/g,
        'await page.locator($1).fill($2)'
      );

      // Convert cy.get().clear() to page.locator().clear()
      convertedBody = convertedBody.replace(
        /cy\.get\(([^)]+)\)\.clear\(\)/g,
        'await page.locator($1).clear()'
      );

      // Convert cy.get().select() to page.locator().selectOption()
      convertedBody = convertedBody.replace(
        /cy\.get\(([^)]+)\)\.select\(([^)]+)\)/g,
        'await page.locator($1).selectOption($2)'
      );

      // Handle chained operations
      convertedBody = this.convertChainedOperations(convertedBody);

      return {
        name: method.name,
        signature: `async ${method.name}(${this.getParametersString(method.parameters || [])})`,
        body: convertedBody,
        isAsync: true,
        requiresPage: true,
        originalComplexity: method.conversionComplexity || 'medium',
        conversionSuccess: true,
        conversionNotes: ['Converted input operations to Playwright locator methods']
      };
    } catch (error) {
      this.logger.warn(`Failed to convert input method ${method.name}:`, error);
      return this.createFailedConversion(method, `Input method conversion failed: ${error}`);
    }
  }

  convertClickMethod(method: any): ConvertedMethod {
    try {
      this.logger.debug(`Converting click method: ${method.name}`);

      let convertedBody = method.body;

      // Convert cy.get().click() to page.locator().click()
      convertedBody = convertedBody.replace(
        /cy\.get\(([^)]+)\)\.click\(([^)]*)\)/g,
        (match: string, selector: string, options: string) => {
          if (options && options.trim()) {
            return `await page.locator(${selector}).click(${options})`;
          }
          return `await page.locator(${selector}).click()`;
        }
      );

      // Convert cy.contains().click() to page.getByText().click()
      convertedBody = convertedBody.replace(
        /cy\.contains\(([^)]+)\)\.click\(([^)]*)\)/g,
        (match: string, text: string, options: string) => {
          if (options && options.trim()) {
            return `await page.getByText(${text}).click(${options})`;
          }
          return `await page.getByText(${text}).click()`;
        }
      );

      // Convert double click
      convertedBody = convertedBody.replace(
        /cy\.get\(([^)]+)\)\.dblclick\(\)/g,
        'await page.locator($1).dblclick()'
      );

      // Convert form submission
      convertedBody = convertedBody.replace(
        /cy\.get\(([^)]+)\)\.submit\(\)/g,
        'await page.locator($1).click()'
      );

      return {
        name: method.name,
        signature: `async ${method.name}(${this.getParametersString(method.parameters || [])})`,
        body: convertedBody,
        isAsync: true,
        requiresPage: true,
        originalComplexity: method.conversionComplexity || 'low',
        conversionSuccess: true,
        conversionNotes: ['Converted click operations to Playwright locator methods']
      };
    } catch (error) {
      this.logger.warn(`Failed to convert click method ${method.name}:`, error);
      return this.createFailedConversion(method, `Click method conversion failed: ${error}`);
    }
  }

  convertCompositeMethod(method: any): ConvertedMethod {
    try {
      this.logger.debug(`Converting composite method: ${method.name}`);

      let convertedBody = method.body;

      // Add await to method calls
      if (method.calledMethods && method.calledMethods.length > 0) {
        method.calledMethods.forEach((methodName: string) => {
          const regex = new RegExp(`this\\.${methodName}\\(([^)]*)\\)`, 'g');
          convertedBody = convertedBody.replace(regex, `await this.${methodName}($1)`);
        });
      }

      return {
        name: method.name,
        signature: `async ${method.name}(${this.getParametersString(method.parameters || [])})`,
        body: convertedBody,
        isAsync: true,
        requiresPage: true,
        originalComplexity: method.conversionComplexity || 'medium',
        conversionSuccess: true,
        conversionNotes: ['Added await to method calls', 'Preserved method composition']
      };
    } catch (error) {
      this.logger.warn(`Failed to convert composite method ${method.name}:`, error);
      return this.createFailedConversion(method, `Composite method conversion failed: ${error}`);
    }
  }

  injectPageParameter(pageObjectInfo: any): { modifiedClass: string; hasPageParameter: boolean; needsPlaywrightImport: boolean } {
    try {
      const className = pageObjectInfo.className;

      // Generate constructor with page parameter
      const constructor = `  constructor(private page: Page) {
    // Page parameter injected for Playwright compatibility
  }`;

      return {
        modifiedClass: constructor,
        hasPageParameter: true,
        needsPlaywrightImport: true
      };
    } catch (error) {
      this.logger.warn('Failed to inject page parameter:', error);
      return {
        modifiedClass: '',
        hasPageParameter: false,
        needsPlaywrightImport: false
      };
    }
  }

  convertToAsyncMethods(pageObjectInfo: any): { methods: any[]; allMethodsAsync: boolean } {
    try {
      const convertedMethods = pageObjectInfo.methods.map((method: any) => ({
        ...method,
        signature: `async ${method.name}(${this.getParametersString(method.parameters || [])})`
      }));

      return {
        methods: convertedMethods,
        allMethodsAsync: true
      };
    } catch (error) {
      this.logger.warn('Failed to convert methods to async:', error);
      return {
        methods: pageObjectInfo.methods || [],
        allMethodsAsync: false
      };
    }
  }

  generatePlaywrightPageObject(
    analysis: PageObjectAnalysisResult,
    options: PageObjectTransformOptions = {}
  ): ConvertedPageObject {
    try {
      this.logger.info(`Generating Playwright page object for: ${analysis.className}`);

      const opts = {
        preserveClassName: true,
        addPlaywrightImports: true,
        generateConstructor: true,
        preserveComments: false,
        convertMockingMethods: true,
        ...options
      };

      // Convert all methods
      const convertedMethods: ConvertedMethod[] = [];
      const conversionSummary = {
        totalMethods: analysis.methods.length,
        convertedMethods: 0,
        failedMethods: 0,
        preservedMockingMethods: 0
      };

      analysis.methods.forEach(method => {
        let convertedMethod: ConvertedMethod;

        if (method.isVisitMethod) {
          convertedMethod = this.convertVisitMethod(method);
        } else if (method.isInputMethod) {
          convertedMethod = this.convertInputMethod(method);
        } else if (method.isClickMethod) {
          convertedMethod = this.convertClickMethod(method);
        } else if (method.isCompositeMethod) {
          convertedMethod = this.convertCompositeMethod(method);
        } else if (this.isMockingMethod(method)) {
          convertedMethod = this.convertMockingMethod(method, opts.convertMockingMethods);
          if (convertedMethod.conversionSuccess) {
            conversionSummary.preservedMockingMethods++;
          }
        } else {
          convertedMethod = this.convertGenericMethod(method);
        }

        if (convertedMethod.conversionSuccess) {
          conversionSummary.convertedMethods++;
        } else {
          conversionSummary.failedMethods++;
        }

        convertedMethods.push(convertedMethod);
      });

      // Generate the complete class code
      const generatedCode = this.generateClassCode(analysis, convertedMethods, opts);

      const result: ConvertedPageObject = {
        originalClassName: analysis.className,
        playwrightClassName: opts.preserveClassName ? analysis.className : `${analysis.className}Playwright`,
        generatedCode,
        imports: this.generateImports(analysis, opts),
        hasPageParameter: true,
        methods: convertedMethods,
        properties: analysis.properties,
        isValid: conversionSummary.failedMethods === 0,
        conversionSummary
      };

      this.logger.info(`Page object conversion complete: ${conversionSummary.convertedMethods}/${conversionSummary.totalMethods} methods converted`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to generate Playwright page object for ${analysis.className}:`, error);
      throw error;
    }
  }

  private convertCyGetCalls(body: string): string {
    // Convert simple cy.get() calls that aren't already handled
    return body.replace(
      /cy\.get\(([^)]+)\)(?!\.(?:type|click|clear|select|check|uncheck))/g,
      'page.locator($1)'
    );
  }

  private convertAssertions(body: string): string {
    // Convert .should() assertions to expect() calls
    body = body.replace(
      /\.should\(([^)]+)\)/g,
      // Note: This is a simplified conversion - full assertion conversion would be more complex
      '// TODO: Convert assertion to expect()'
    );

    return body;
  }

  private convertChainedOperations(body: string): string {
    // Handle complex chained operations like .clear().type()
    body = body.replace(
      /cy\.get\(([^)]+)\)\.clear\(\)\.type\(([^)]+)\)/g,
      'await page.locator($1).clear(); await page.locator($1).fill($2)'
    );

    return body;
  }

  private isMockingMethod(method: MethodInfo): boolean {
    return method.name.includes('mock') ||
           method.name.includes('Mock') ||
           method.body.includes('MockUtil') ||
           method.body.includes('WireMock');
  }

  private convertMockingMethod(method: MethodInfo, shouldConvert: boolean): ConvertedMethod {
    if (!shouldConvert) {
      // Preserve the mocking method as-is
      return {
        name: method.name,
        signature: method.signature,
        body: method.body,
        isAsync: method.isAsync,
        requiresPage: false,
        originalComplexity: method.conversionComplexity,
        conversionSuccess: true,
        conversionNotes: ['Preserved mocking method without conversion']
      };
    }

    // For now, preserve mocking methods with minimal changes
    const convertedBody = method.body.replace(/cy\.log\(/g, '// cy.log(');

    return {
      name: method.name,
      signature: method.isAsync ? method.signature : `async ${method.signature}`,
      body: convertedBody,
      isAsync: true,
      requiresPage: false,
      originalComplexity: method.conversionComplexity,
      conversionSuccess: true,
      conversionNotes: ['Preserved mocking method', 'Commented out cy.log calls']
    };
  }

  private convertGenericMethod(method: MethodInfo): ConvertedMethod {
    try {
      let convertedBody = method.body;

      // Apply basic Cypress to Playwright conversions
      Object.entries(this.commandMappings).forEach(([cypress, playwright]) => {
        const regex = new RegExp(cypress.replace('.', '\\.'), 'g');
        convertedBody = convertedBody.replace(regex, playwright);
      });

      // Add await to page operations
      convertedBody = convertedBody.replace(
        /page\.(goto|locator|getByText)\(/g,
        'await page.$1('
      );

      return {
        name: method.name,
        signature: `async ${method.name}(${this.getParametersString(method.parameters)})`,
        body: convertedBody,
        isAsync: true,
        requiresPage: method.requiresPage,
        originalComplexity: method.conversionComplexity,
        conversionSuccess: true,
        conversionNotes: ['Applied generic Cypress to Playwright conversions']
      };
    } catch (error) {
      return this.createFailedConversion(method, `Generic method conversion failed: ${error}`);
    }
  }

  private createFailedConversion(method: MethodInfo, reason: string): ConvertedMethod {
    return {
      name: method.name,
      signature: method.signature,
      body: `// TODO: Manual conversion required\n${method.body}`,
      isAsync: method.isAsync,
      requiresPage: method.requiresPage,
      originalComplexity: method.conversionComplexity,
      conversionSuccess: false,
      conversionNotes: [reason]
    };
  }

  private getParametersString(parameters: MethodParameter[]): string {
    return parameters.map(p => `${p.name}: ${p.type}`).join(', ');
  }

  private generateImports(analysis: PageObjectAnalysisResult, options: PageObjectTransformOptions): string[] {
    const imports: string[] = [];

    if (options.addPlaywrightImports) {
      imports.push("import { Page } from '@playwright/test';");
    }

    // Preserve WireMock and other legitimate imports
    analysis.imports.forEach(imp => {
      if (imp.source.includes('wiremock') || imp.source.includes('@sta/')) {
        let importStatement = 'import ';

        if (imp.defaultImport) {
          importStatement += imp.defaultImport;
          if (imp.namedImports || imp.namespaceImport) {
            importStatement += ', ';
          }
        }

        if (imp.namespaceImport) {
          importStatement += `* as ${imp.namespaceImport}`;
        } else if (imp.namedImports) {
          importStatement += `{ ${imp.namedImports.join(', ')} }`;
        }

        importStatement += ` from '${imp.source}';`;
        imports.push(importStatement);
      }
    });

    return imports;
  }

  private generateClassCode(
    analysis: PageObjectAnalysisResult,
    methods: ConvertedMethod[],
    options: PageObjectTransformOptions
  ): string {
    const className = options.preserveClassName ? analysis.className : `${analysis.className}Playwright`;

    let classCode = '';

    // Add imports
    const imports = this.generateImports(analysis, options);
    classCode += imports.join('\n') + '\n\n';

    // Start class declaration
    classCode += `class ${className} {\n`;

    // Add properties
    analysis.properties.forEach(prop => {
      classCode += `  ${prop.name}: ${prop.type}`;
      if (prop.initialValue) {
        classCode += ` = ${prop.initialValue}`;
      }
      classCode += ';\n';
    });

    if (analysis.properties.length > 0) {
      classCode += '\n';
    }

    // Add constructor
    if (options.generateConstructor) {
      classCode += `  constructor(private page: Page) {\n`;
      classCode += `    // Page parameter injected for Playwright compatibility\n`;
      classCode += `  }\n\n`;
    }

    // Add methods
    methods.forEach(method => {
      if (method.conversionNotes.length > 0) {
        classCode += `  // ${method.conversionNotes.join(', ')}\n`;
      }
      classCode += `  ${method.signature} {\n`;
      classCode += `    ${method.body.split('\n').join('\n    ')}\n`;
      classCode += `  }\n\n`;
    });

    classCode += '}\n\n';

    // Add export
    if (analysis.exportType === 'default') {
      classCode += `export default ${className};\n`;
    } else if (analysis.exportType === 'named') {
      classCode += `export { ${className} };\n`;
    }

    return classCode;
  }
}