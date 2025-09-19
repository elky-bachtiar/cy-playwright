import * as fs from 'fs-extra';
import * as path from 'path';

export interface SelectorDecorator {
  type: 'By.Text.Exact' | 'By.Text.Partial' | 'By.Class' | 'By.Type' | 'By.Attribute' | 'By.TestId';
  value: string;
  options?: any;
}

export interface PageObjectProperty {
  name: string;
  decorator: SelectorDecorator;
  isStatic: boolean;
  lineNumber?: number;
}

export interface PageObjectMethod {
  name: string;
  parameters: string[];
  returnType?: string;
  body: string;
  isAsync: boolean;
  lineNumber?: number;
}

export interface PageObjectClass {
  name: string;
  filePath: string;
  properties: PageObjectProperty[];
  methods: PageObjectMethod[];
  imports: string[];
  exports: string[];
}

export interface PageObjectAnalysisResult {
  pageObjectClasses: PageObjectClass[];
  hasCustomSelectors: boolean;
  hasMethodChaining: boolean;
  complexityLevel: 'simple' | 'moderate' | 'complex';
  warnings: string[];
}

export class PageObjectAnalyzer {

  /**
   * Analyze page object files in a project
   */
  async analyzeProject(projectPath: string): Promise<PageObjectAnalysisResult> {
    const pageObjectFiles = await this.findPageObjectFiles(projectPath);
    const pageObjectClasses: PageObjectClass[] = [];
    const warnings: string[] = [];
    let hasCustomSelectors = false;
    let hasMethodChaining = false;

    for (const filePath of pageObjectFiles) {
      try {
        const pageObjectClass = await this.analyzePageObjectFile(filePath);
        pageObjectClasses.push(pageObjectClass);

        // Check for custom selectors
        if (pageObjectClass.properties.some(prop => this.isCustomSelectorDecorator(prop.decorator))) {
          hasCustomSelectors = true;
        }

        // Check for method chaining
        if (pageObjectClass.methods.some(method => this.hasMethodChaining(method))) {
          hasMethodChaining = true;
        }
      } catch (error) {
        warnings.push(`Failed to analyze page object file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const complexityLevel = this.determineComplexityLevel(pageObjectClasses);

    return {
      pageObjectClasses,
      hasCustomSelectors,
      hasMethodChaining,
      complexityLevel,
      warnings
    };
  }

  /**
   * Analyze a single page object file
   */
  async analyzePageObjectFile(filePath: string): Promise<PageObjectClass> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    const imports = this.extractImports(content);
    const exports = this.extractExports(content);
    const className = this.extractClassName(content, filePath);

    const properties = this.extractProperties(content, lines);
    const methods = this.extractMethods(content, lines);

    return {
      name: className,
      filePath,
      properties,
      methods,
      imports,
      exports
    };
  }

  /**
   * Find page object files in project
   */
  private async findPageObjectFiles(projectPath: string): Promise<string[]> {
    const pageObjectFiles: string[] = [];
    const possibleDirs = [
      path.join(projectPath, 'cypress', 'pages'),
      path.join(projectPath, 'cypress', 'page-objects'),
      path.join(projectPath, 'cypress', 'support', 'pages'),
      path.join(projectPath, 'cypress', 'support', 'page-objects')
    ];

    for (const dir of possibleDirs) {
      if (await fs.pathExists(dir)) {
        const files = await this.getFilesRecursively(dir);
        const pageObjectFiles_ = files.filter(file =>
          (file.endsWith('.ts') || file.endsWith('.js')) &&
          !file.includes('.spec.') &&
          !file.includes('.test.')
        );
        pageObjectFiles.push(...pageObjectFiles_);
      }
    }

    return pageObjectFiles;
  }

  /**
   * Extract imports from file content
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[0]);
    }

    return imports;
  }

  /**
   * Extract exports from file content
   */
  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g;
    let match;

    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    return exports;
  }

  /**
   * Extract class name from file content
   */
  private extractClassName(content: string, filePath: string): string {
    const classMatch = content.match(/class\s+(\w+)/);
    if (classMatch) {
      return classMatch[1];
    }

    // Fallback to filename
    const filename = path.basename(filePath, path.extname(filePath));
    return filename.replace(/Page$/, '') + 'Page';
  }

  /**
   * Extract properties with decorators
   */
  private extractProperties(content: string, lines: string[]): PageObjectProperty[] {
    const properties: PageObjectProperty[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Look for decorator patterns like @By.Text.Exact('Login')
      const decoratorMatch = line.match(/@(By\.(?:Text\.(?:Exact|Partial)|Class|Type|Attribute|TestId))\s*\(([^)]+)\)/);
      if (decoratorMatch && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const propertyMatch = nextLine.match(/(static\s+)?(\w+)\s*:\s*\w+/);

        if (propertyMatch) {
          const decorator = this.parseDecorator(decoratorMatch[1], decoratorMatch[2]);

          properties.push({
            name: propertyMatch[2],
            decorator,
            isStatic: !!propertyMatch[1],
            lineNumber: i + 1
          });
        }
      }
    }

    return properties;
  }

  /**
   * Extract methods from file content
   */
  private extractMethods(content: string, lines: string[]): PageObjectMethod[] {
    const methods: PageObjectMethod[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Look for method patterns
      const methodMatch = line.match(/(\w+)\s*\(([^)]*)\)\s*(?::\s*(\w+))?\s*\{/);
      if (methodMatch) {
        const methodName = methodMatch[1];
        const parameters = methodMatch[2] ? methodMatch[2].split(',').map(p => p.trim()) : [];
        const returnType = methodMatch[3];

        // Extract method body
        const body = this.extractMethodBody(content, i);
        const isAsync = line.includes('async ') || body.includes('await ');

        methods.push({
          name: methodName,
          parameters,
          returnType,
          body,
          isAsync,
          lineNumber: i + 1
        });
      }
    }

    return methods;
  }

  /**
   * Parse decorator string into structured format
   */
  private parseDecorator(decoratorType: string, argsString: string): SelectorDecorator {
    // Remove quotes and parse arguments
    const cleanArgs = argsString.replace(/['"]/g, '').trim();
    const args = cleanArgs.split(',').map(arg => arg.trim());

    let options: any = {};
    if (args.length > 1) {
      // Try to parse options object
      try {
        const optionsStr = args.slice(1).join(',');
        if (optionsStr.includes('{')) {
          options = eval('(' + optionsStr + ')');
        }
      } catch (error) {
        // Fallback to simple key-value
        options = { raw: args.slice(1) };
      }
    }

    return {
      type: decoratorType as SelectorDecorator['type'],
      value: args[0],
      options: Object.keys(options).length > 0 ? options : undefined
    };
  }

  /**
   * Extract method body
   */
  private extractMethodBody(content: string, startLine: number): string {
    const lines = content.split('\n');
    let braceCount = 0;
    let inMethod = false;
    const bodyLines: string[] = [];

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '{') {
          braceCount++;
          inMethod = true;
        } else if (char === '}') {
          braceCount--;
        }
      }

      if (inMethod) {
        bodyLines.push(line);
      }

      if (inMethod && braceCount === 0) {
        break;
      }
    }

    return bodyLines.join('\n');
  }

  /**
   * Check if decorator is a custom selector
   */
  private isCustomSelectorDecorator(decorator: SelectorDecorator): boolean {
    return ['By.Text.Exact', 'By.Text.Partial', 'By.Class', 'By.Type', 'By.Attribute'].includes(decorator.type);
  }

  /**
   * Check if method has chaining patterns
   */
  private hasMethodChaining(method: PageObjectMethod): boolean {
    // Look for return statements that return 'this' or new instances
    return method.body.includes('return this') ||
           method.body.includes('return new ') ||
           method.returnType !== undefined && method.returnType !== 'void';
  }

  /**
   * Determine complexity level of page objects
   */
  private determineComplexityLevel(pageObjectClasses: PageObjectClass[]): 'simple' | 'moderate' | 'complex' {
    let totalProperties = 0;
    let totalMethods = 0;
    let chainingMethods = 0;
    let customSelectors = 0;

    for (const pageObjectClass of pageObjectClasses) {
      totalProperties += pageObjectClass.properties.length;
      totalMethods += pageObjectClass.methods.length;

      chainingMethods += pageObjectClass.methods.filter(method => this.hasMethodChaining(method)).length;
      customSelectors += pageObjectClass.properties.filter(prop => this.isCustomSelectorDecorator(prop.decorator)).length;
    }

    const avgPropertiesPerClass = pageObjectClasses.length > 0 ? totalProperties / pageObjectClasses.length : 0;
    const avgMethodsPerClass = pageObjectClasses.length > 0 ? totalMethods / pageObjectClasses.length : 0;
    const chainingRatio = totalMethods > 0 ? chainingMethods / totalMethods : 0;
    const customSelectorRatio = totalProperties > 0 ? customSelectors / totalProperties : 0;

    if (customSelectorRatio > 0.5 || chainingRatio > 0.7 || avgPropertiesPerClass > 10 || avgMethodsPerClass > 8) {
      return 'complex';
    } else if (customSelectorRatio > 0.2 || chainingRatio > 0.3 || avgPropertiesPerClass > 5 || avgMethodsPerClass > 4) {
      return 'moderate';
    } else {
      return 'simple';
    }
  }

  /**
   * Get files recursively from directory
   */
  private async getFilesRecursively(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.getFilesRecursively(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }
}