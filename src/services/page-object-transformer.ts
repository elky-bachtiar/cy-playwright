import { PageObjectClass, PageObjectProperty, PageObjectMethod, SelectorDecorator } from './page-object-analyzer';

export interface ConvertedPageObject {
  className: string;
  filePath: string;
  content: string;
  warnings: string[];
}

export interface PageObjectTransformationOptions {
  preserveMethodChaining?: boolean;
  generateStaticMethods?: boolean;
  usePageObjectPattern?: boolean;
}

export class PageObjectTransformer {

  /**
   * Transform a page object class from Cypress to Playwright
   */
  transformPageObject(
    pageObjectClass: PageObjectClass,
    options: PageObjectTransformationOptions = {}
  ): ConvertedPageObject {
    const warnings: string[] = [];
    const {
      preserveMethodChaining = true,
      generateStaticMethods = false,
      usePageObjectPattern = true
    } = options;

    // Generate Playwright imports
    const imports = this.generateImports(pageObjectClass, warnings);

    // Convert selectors from decorators to Playwright locators
    const selectors = this.convertSelectorsToPlaywright(pageObjectClass.properties, warnings);

    // Convert methods to Playwright syntax
    const methods = this.convertMethodsToPlaywright(
      pageObjectClass.methods,
      pageObjectClass.properties,
      { preserveMethodChaining },
      warnings
    );

    // Generate class content
    const classContent = this.generatePlaywrightPageObjectClass(
      pageObjectClass.name,
      selectors,
      methods,
      { usePageObjectPattern },
      warnings
    );

    const content = `${imports}\n\n${classContent}`;

    return {
      className: pageObjectClass.name,
      filePath: pageObjectClass.filePath.replace(/\.ts$/, '.ts').replace(/cypress[\/\\]pages/, 'tests/pages'),
      content,
      warnings
    };
  }

  /**
   * Generate appropriate imports for Playwright page object
   */
  private generateImports(pageObjectClass: PageObjectClass, warnings: string[]): string {
    const imports = new Set<string>();

    // Always include Playwright imports
    imports.add("import { Page, Locator } from '@playwright/test';");

    // Check for any cross-page object dependencies
    for (const method of pageObjectClass.methods) {
      if (method.returnType && method.returnType.endsWith('Page')) {
        const importPath = method.returnType.replace('Page', '');
        imports.add(`import { ${method.returnType} } from './${importPath}Page';`);
      }

      // Look for new instances in method body
      const newInstanceMatches = method.body.match(/new\s+(\w+Page)/g);
      if (newInstanceMatches) {
        for (const match of newInstanceMatches) {
          const className = match.replace('new ', '');
          const importPath = className.replace('Page', '');
          imports.add(`import { ${className} } from './${importPath}Page';`);
        }
      }
    }

    return Array.from(imports).join('\n');
  }

  /**
   * Convert selector decorators to Playwright locators
   */
  private convertSelectorsToPlaywright(
    properties: PageObjectProperty[],
    warnings: string[]
  ): string[] {
    const selectors: string[] = [];

    for (const property of properties) {
      const playwrightSelector = this.convertDecoratorToLocator(property.decorator, property.name, warnings);
      selectors.push(`  static ${property.name} = (page: Page): Locator => ${playwrightSelector};`);
    }

    return selectors;
  }

  /**
   * Convert decorator to Playwright locator
   */
  private convertDecoratorToLocator(
    decorator: SelectorDecorator,
    propertyName: string,
    warnings: string[]
  ): string {
    switch (decorator.type) {
      case 'By.Text.Exact':
        return `page.getByText('${decorator.value}', { exact: true })`;

      case 'By.Text.Partial':
        return `page.getByText('${decorator.value}')`;

      case 'By.Class':
        if (decorator.options?.eq !== undefined) {
          const index = decorator.options.eq;
          return `page.locator('.${decorator.value}').nth(${index})`;
        }
        return `page.locator('.${decorator.value}')`;

      case 'By.Type':
        if (decorator.options?.parent) {
          warnings.push(`${propertyName}: By.Type with parent selector converted - verify nested locator behavior`);
          return `page.locator('${decorator.value}')`;
        }
        return `page.locator('${decorator.value}')`;

      case 'By.Attribute':
        if (decorator.options?.attribute) {
          const attrName = decorator.options.attribute;
          if (decorator.options?.eq !== undefined) {
            const index = decorator.options.eq;
            return `page.locator('[${attrName}="${decorator.value}"]').nth(${index})`;
          }
          return `page.locator('[${attrName}="${decorator.value}"]')`;
        }
        warnings.push(`${propertyName}: By.Attribute without attribute option - using generic locator`);
        return `page.locator('[${decorator.value}]')`;

      case 'By.TestId':
        return `page.getByTestId('${decorator.value}')`;

      default:
        warnings.push(`${propertyName}: Unknown decorator type ${decorator.type} - using generic locator`);
        return `page.locator('${decorator.value}')`;
    }
  }

  /**
   * Convert methods to Playwright syntax
   */
  private convertMethodsToPlaywright(
    methods: PageObjectMethod[],
    properties: PageObjectProperty[],
    options: { preserveMethodChaining: boolean },
    warnings: string[]
  ): string[] {
    const convertedMethods: string[] = [];

    for (const method of methods) {
      const convertedMethod = this.convertSingleMethod(method, properties, options, warnings);
      convertedMethods.push(convertedMethod);
    }

    return convertedMethods;
  }

  /**
   * Convert a single method to Playwright syntax
   */
  private convertSingleMethod(
    method: PageObjectMethod,
    properties: PageObjectProperty[],
    options: { preserveMethodChaining: boolean },
    warnings: string[]
  ): string {
    let convertedBody = method.body;
    const isAsync = method.isAsync || convertedBody.includes('cy.') || convertedBody.includes('await');

    // Convert selector usage
    for (const property of properties) {
      const selectorRegex = new RegExp(`${property.name}\\.(click|type|should)`, 'g');
      convertedBody = convertedBody.replace(selectorRegex, (match, action) => {
        switch (action) {
          case 'click':
            return `await ${property.name}(this.page).click()`;
          case 'type':
            warnings.push(`${method.name}: type() converted to fill() - verify input handling`);
            return `await ${property.name}(this.page).fill`;
          case 'should':
            warnings.push(`${method.name}: should() assertion needs manual conversion to expect()`);
            return `/* TODO: Convert should() assertion */ ${property.name}(this.page)`;
          default:
            return `${property.name}(this.page).${action}`;
        }
      });
    }

    // Convert cy.visit to page.goto
    convertedBody = convertedBody.replace(/cy\.visit\(([^)]+)\)/g, 'await this.page.goto($1)');

    // Convert cy.get() patterns
    convertedBody = convertedBody.replace(/cy\.get\(([^)]+)\)/g, 'this.page.locator($1)');

    // Handle method chaining return values
    let returnStatement = '';
    if (options.preserveMethodChaining && method.returnType) {
      if (method.returnType === 'this' || method.returnType === method.name) {
        returnStatement = '\n    return this;';
      } else if (method.returnType.endsWith('Page')) {
        returnStatement = `\n    return new ${method.returnType}(this.page);`;
      }
    }

    const parameters = ['page: Page', ...method.parameters].join(', ');
    const asyncKeyword = isAsync ? 'async ' : '';
    const returnType = method.returnType ? `: ${method.returnType === 'this' ? method.name : method.returnType}` : '';

    // Clean up the method body
    const cleanedBody = this.cleanMethodBody(convertedBody);

    return `
  ${asyncKeyword}${method.name}(${parameters})${returnType} {${cleanedBody}${returnStatement}
  }`.trim();
  }

  /**
   * Clean up method body by removing unnecessary elements
   */
  private cleanMethodBody(body: string): string {
    return body
      .replace(/class\s+\w+\s*{|}$/g, '') // Remove class declaration
      .replace(/^\s*{\s*/, '') // Remove opening brace
      .replace(/\s*}\s*$/, '') // Remove closing brace
      .split('\n')
      .map(line => line.trim() ? `    ${line}` : '') // Add proper indentation
      .join('\n');
  }

  /**
   * Generate complete Playwright page object class
   */
  private generatePlaywrightPageObjectClass(
    className: string,
    selectors: string[],
    methods: string[],
    options: { usePageObjectPattern: boolean },
    warnings: string[]
  ): string {
    const pageObjectName = className.replace('PageSelectors', 'Page');

    if (options.usePageObjectPattern) {
      return `
export class ${pageObjectName}Selectors {
${selectors.join('\n')}
}

export class ${pageObjectName} {
  constructor(private page: Page) {}

${methods.join('\n\n')}
}

export { ${pageObjectName}, ${pageObjectName}Selectors };
      `.trim();
    } else {
      // Functional approach
      return `
${selectors.join('\n')}

export class ${pageObjectName} {
  constructor(private page: Page) {}

${methods.join('\n\n')}
}

export { ${pageObjectName} };
      `.trim();
    }
  }

  /**
   * Transform multiple page objects
   */
  transformMultiplePageObjects(
    pageObjectClasses: PageObjectClass[],
    options: PageObjectTransformationOptions = {}
  ): ConvertedPageObject[] {
    return pageObjectClasses.map(pageObjectClass =>
      this.transformPageObject(pageObjectClass, options)
    );
  }

  /**
   * Generate index file for page objects
   */
  generatePageObjectIndex(convertedPageObjects: ConvertedPageObject[]): string {
    const exports = convertedPageObjects
      .map(po => {
        const className = po.className.replace('PageSelectors', 'Page');
        const fileName = className.replace('Page', '');
        return `export { ${className}, ${className}Selectors } from './${fileName}Page';`;
      })
      .join('\n');

    return `// Auto-generated index file for page objects\n${exports}`;
  }
}