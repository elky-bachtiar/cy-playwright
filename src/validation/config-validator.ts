import { Logger } from '../utils/logger';
import * as ts from 'typescript';
import * as fs from 'fs-extra';

export interface ConfigValidationResult {
  isValid: boolean;
  configType: 'typescript' | 'javascript';
  errors: ConfigValidationError[];
  warnings: ConfigValidationWarning[];
  features: string[];
  browserSupport: string[];
  mobileSupport: boolean;
  conversionComments: boolean;
  cypressMappings: string[];
}

export interface ConfigValidationError {
  type: 'invalid_field' | 'missing_required' | 'invalid_value' | 'syntax_error';
  message: string;
  field?: string;
  suggestion?: string;
}

export interface ConfigValidationWarning {
  type: 'unknown_field' | 'deprecated_field' | 'suboptimal_value';
  message: string;
  field?: string;
  suggestion?: string;
}

export class PlaywrightConfigValidator {
  private logger = new Logger('PlaywrightConfigValidator');

  // Required fields for a valid Playwright config
  private requiredFields = new Set(['projects']);

  // Valid Playwright configuration fields
  private validFields = new Set([
    'testDir', 'testMatch', 'testIgnore', 'timeout', 'expect', 'fullyParallel',
    'forbidOnly', 'retries', 'maxFailures', 'workers', 'reporter', 'reportSlowTests',
    'globalSetup', 'globalTeardown', 'use', 'projects', 'webServer', 'metadata',
    'outputDir', 'snapshotDir', 'snapshotPathTemplate', 'updateSnapshots'
  ]);

  // Valid browser engines
  private validBrowsers = new Set(['chromium', 'firefox', 'webkit']);

  async validateConfig(configPath: string): Promise<ConfigValidationResult> {
    this.logger.info(`Validating Playwright configuration: ${configPath}`);

    const result: ConfigValidationResult = {
      isValid: true,
      configType: configPath.endsWith('.ts') ? 'typescript' : 'javascript',
      errors: [],
      warnings: [],
      features: [],
      browserSupport: [],
      mobileSupport: false,
      conversionComments: false,
      cypressMappings: []
    };

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      await this.validateConfigContent(content, result);
    } catch (error) {
      result.isValid = false;
      result.errors.push({
        type: 'syntax_error',
        message: `Failed to read config file: ${error.message}`
      });
    }

    return result;
  }

  private async validateConfigContent(content: string, result: ConfigValidationResult): Promise<void> {
    try {
      // Parse the configuration file
      const config = this.parseConfigFile(content, result);

      if (!config) {
        result.isValid = false;
        return;
      }

      // Validate structure and fields
      this.validateConfigStructure(config, result);

      // Validate projects configuration
      this.validateProjectsConfig(config.projects, result);

      // Check for features
      this.detectConfigFeatures(config, result);

      // Check for conversion comments and Cypress mappings
      this.analyzeConversionArtifacts(content, result);

      // Determine overall validity
      result.isValid = result.errors.length === 0;

    } catch (error) {
      result.isValid = false;
      result.errors.push({
        type: 'syntax_error',
        message: `Configuration validation error: ${error.message}`
      });
    }
  }

  private parseConfigFile(content: string, result: ConfigValidationResult): any {
    try {
      if (result.configType === 'typescript') {
        return this.parseTypeScriptConfig(content, result);
      } else {
        return this.parseJavaScriptConfig(content, result);
      }
    } catch (error) {
      result.errors.push({
        type: 'syntax_error',
        message: `Failed to parse configuration: ${error.message}`
      });
      return null;
    }
  }

  private parseTypeScriptConfig(content: string, result: ConfigValidationResult): any {
    try {
      // Create a TypeScript source file
      const sourceFile = ts.createSourceFile(
        'playwright.config.ts',
        content,
        ts.ScriptTarget.Latest,
        true
      );

      // Extract the configuration object
      const config = this.extractConfigFromAST(sourceFile);

      // Check for syntax errors
      const diagnostics = ts.getPreEmitDiagnostics(
        ts.createProgram([sourceFile.fileName], {}, {
          getSourceFile: () => sourceFile,
          writeFile: () => {},
          getCurrentDirectory: () => '',
          getDirectories: () => [],
          fileExists: () => true,
          readFile: () => '',
          getCanonicalFileName: (fileName) => fileName,
          useCaseSensitiveFileNames: () => true,
          getNewLine: () => '\n'
        })
      );

      if (diagnostics.length > 0) {
        for (const diagnostic of diagnostics) {
          const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
          result.errors.push({
            type: 'syntax_error',
            message: `TypeScript error: ${message}`
          });
        }
      }

      return config;
    } catch (error) {
      throw new Error(`TypeScript parsing failed: ${error.message}`);
    }
  }

  private parseJavaScriptConfig(content: string, result: ConfigValidationResult): any {
    try {
      // For JavaScript, we'll do a simplified parsing
      // In a real implementation, you might use Babel or similar

      // Remove TypeScript-specific syntax for basic parsing
      const jsContent = content
        .replace(/import\s+.*?from\s+['"].*?['"];?/g, '')
        .replace(/export\s+default\s+defineConfig\(/g, 'module.exports = ')
        .replace(/\);?\s*$/, '');

      // Create a function to safely evaluate the config
      const configFunction = new Function('module', 'exports', 'require', jsContent + '; return module.exports;');
      const mockModule = { exports: {} };
      const mockRequire = () => ({ defineConfig: (config: any) => config });

      return configFunction(mockModule, mockModule.exports, mockRequire);
    } catch (error) {
      throw new Error(`JavaScript parsing failed: ${error.message}`);
    }
  }

  private extractConfigFromAST(sourceFile: ts.SourceFile): any {
    let configObject: any = {};

    function visit(node: ts.Node): any {
      if (ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'defineConfig') {

        if (node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0])) {
          return this.extractObjectLiteral(node.arguments[0]);
        }
      }

      if (ts.isExportAssignment(node) && ts.isObjectLiteralExpression(node.expression)) {
        return this.extractObjectLiteral(node.expression);
      }

      return ts.forEachChild(node, visit);
    }

    const result = visit(sourceFile);
    return result || configObject;
  }

  private extractObjectLiteral(objectLiteral: ts.ObjectLiteralExpression): any {
    const obj: any = {};

    for (const property of objectLiteral.properties) {
      if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
        const key = property.name.text;
        obj[key] = this.extractValue(property.initializer);
      }
    }

    return obj;
  }

  private extractValue(node: ts.Expression): any {
    if (ts.isStringLiteral(node)) {
      return node.text;
    }
    if (ts.isNumericLiteral(node)) {
      return parseFloat(node.text);
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) {
      return true;
    }
    if (node.kind === ts.SyntaxKind.FalseKeyword) {
      return false;
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.map(element => this.extractValue(element));
    }
    if (ts.isObjectLiteralExpression(node)) {
      return this.extractObjectLiteral(node);
    }

    // For complex expressions, return a placeholder
    return '<complex_expression>';
  }

  private validateConfigStructure(config: any, result: ConfigValidationResult): void {
    // Check for unknown fields at the top level
    for (const field of Object.keys(config)) {
      if (!this.validFields.has(field)) {
        result.warnings.push({
          type: 'unknown_field',
          message: `Unknown configuration field: ${field}`,
          field,
          suggestion: 'Remove unknown field or check Playwright documentation'
        });
      }
    }

    // Validate specific field types
    this.validateFieldTypes(config, result);
  }

  private validateFieldTypes(config: any, result: ConfigValidationResult): void {
    // Validate testDir
    if (config.testDir && typeof config.testDir !== 'string') {
      result.errors.push({
        type: 'invalid_value',
        message: 'testDir must be a string',
        field: 'testDir'
      });
    }

    // Validate timeout
    if (config.timeout && typeof config.timeout !== 'number') {
      result.errors.push({
        type: 'invalid_value',
        message: 'timeout must be a number',
        field: 'timeout'
      });
    }

    // Validate workers
    if (config.workers && typeof config.workers !== 'number' && config.workers !== undefined) {
      result.errors.push({
        type: 'invalid_value',
        message: 'workers must be a number or undefined',
        field: 'workers'
      });
    }

    // Validate retries
    if (config.retries && typeof config.retries !== 'number') {
      result.errors.push({
        type: 'invalid_value',
        message: 'retries must be a number',
        field: 'retries'
      });
    }
  }

  private validateProjectsConfig(projects: any[], result: ConfigValidationResult): void {
    if (!projects || !Array.isArray(projects)) {
      result.errors.push({
        type: 'missing_required',
        message: 'projects configuration is required and must be an array',
        field: 'projects'
      });
      return;
    }

    if (projects.length === 0) {
      result.warnings.push({
        type: 'suboptimal_value',
        message: 'projects array is empty',
        field: 'projects',
        suggestion: 'Add at least one project configuration'
      });
      return;
    }

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      this.validateSingleProject(project, i, result);
    }
  }

  private validateSingleProject(project: any, index: number, result: ConfigValidationResult): void {
    if (!project.name) {
      result.errors.push({
        type: 'missing_required',
        message: `Project at index ${index} is missing required 'name' field`,
        field: `projects[${index}].name`
      });
    }

    // Check for browser configuration
    if (project.use && project.use.browserName) {
      const browserName = project.use.browserName;
      if (this.validBrowsers.has(browserName)) {
        if (!result.browserSupport.includes(browserName)) {
          result.browserSupport.push(browserName);
        }
      } else {
        result.errors.push({
          type: 'invalid_value',
          message: `Invalid browser: ${browserName}`,
          field: `projects[${index}].use.browserName`,
          suggestion: 'Use chromium, firefox, or webkit'
        });
      }
    }

    // Check for mobile device emulation
    if (project.use && (project.use.isMobile || project.use.hasTouch)) {
      result.mobileSupport = true;
    }

    // Detect device configurations
    if (project.name && (
      project.name.toLowerCase().includes('mobile') ||
      project.name.toLowerCase().includes('pixel') ||
      project.name.toLowerCase().includes('iphone')
    )) {
      result.mobileSupport = true;
    }
  }

  private detectConfigFeatures(config: any, result: ConfigValidationResult): void {
    // Detect various Playwright features
    if (config.projects && config.projects.length > 1) {
      result.features.push('projects');
    }

    if (config.webServer) {
      result.features.push('webServer');
    }

    if (config.globalSetup) {
      result.features.push('globalSetup');
    }

    if (config.globalTeardown) {
      result.features.push('globalTeardown');
    }

    if (config.use && config.use.trace) {
      result.features.push('tracing');
    }

    if (config.use && config.use.video) {
      result.features.push('video');
    }

    if (config.use && config.use.screenshot) {
      result.features.push('screenshots');
    }

    if (config.reporter) {
      result.features.push('customReporter');
    }

    if (config.fullyParallel) {
      result.features.push('parallelExecution');
    }
  }

  private analyzeConversionArtifacts(content: string, result: ConfigValidationResult): void {
    // Check for conversion comments
    if (content.includes('Converted from') ||
        content.includes('Mapped from') ||
        content.includes('cypress.config.js')) {
      result.conversionComments = true;
    }

    // Detect Cypress mappings
    const cypressMappings = [
      { pattern: /baseURL.*baseUrl/, mapping: 'baseURL' },
      { pattern: /viewport.*viewportWidth/, mapping: 'viewport' },
      { pattern: /actionTimeout.*defaultCommandTimeout/, mapping: 'actionTimeout' },
      { pattern: /testDir.*e2e/, mapping: 'testDir' },
      { pattern: /timeout.*responseTimeout/, mapping: 'timeout' }
    ];

    for (const { pattern, mapping } of cypressMappings) {
      if (pattern.test(content)) {
        result.cypressMappings.push(mapping);
      }
    }
  }
}