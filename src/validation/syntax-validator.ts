import { Logger } from '../utils/logger';
import * as ts from 'typescript';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface ValidationError {
  type: 'syntax_error' | 'missing_import' | 'conversion_artifact' | 'invalid_import_path' | 'invalid_field';
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface ValidationWarning {
  type: 'missing_await' | 'legacy_selector' | 'brittle_selector' | 'unused_import' | 'unknown_field';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  typeScriptFeatures?: string[];
  conversionArtifacts?: string[];
  playwrightPatterns?: string[];
}

export interface ProjectValidationResult {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  overallScore: number;
  fileResults: Map<string, ValidationResult>;
  summary: ValidationSummary;
}

export interface ValidationSummary {
  totalFiles: number;
  passRate: number;
  commonIssues: string[];
  recommendations: string[];
  overallScore: number;
  breakdown: {
    syntaxErrors: number;
    missingImports: number;
    conversionArtifacts: number;
    warnings: number;
  };
}

export class SyntaxValidator {
  private logger = new Logger('SyntaxValidator');

  async validateTestFile(filePath: string): Promise<ValidationResult> {
    this.logger.info(`Validating test file: ${filePath}`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.validateContent(content, filePath);
    } catch (error) {
      this.logger.error(`Failed to read file ${filePath}:`, error);
      return {
        isValid: false,
        errors: [{
          type: 'syntax_error',
          message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error'
        }],
        warnings: [],
        suggestions: []
      };
    }
  }

  validateContent(content: string, filePath?: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      typeScriptFeatures: [],
      conversionArtifacts: [],
      playwrightPatterns: []
    };

    try {
      // Check for TypeScript syntax
      if (filePath?.endsWith('.ts') || this.containsTypeScriptFeatures(content)) {
        this.validateTypeScriptSyntax(content, result);
      } else {
        this.validateJavaScriptSyntax(content, result);
      }

      // Check for required imports
      this.validateImports(content, result);

      // Check for conversion artifacts
      this.validateConversionArtifacts(content, result);

      // Check for async/await patterns
      this.validateAsyncPatterns(content, result);

      // Check for Playwright patterns
      this.validatePlaywrightPatterns(content, result);

      // Determine overall validity
      result.isValid = result.errors.length === 0;

    } catch (error) {
      result.isValid = false;
      result.errors.push({
        type: 'syntax_error',
        message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
    }

    return result;
  }

  private validateTypeScriptSyntax(content: string, result: ValidationResult): void {
    try {
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        content,
        ts.ScriptTarget.Latest,
        true
      );

      // Check for TypeScript-specific features
      this.analyzeTypeScriptFeatures(sourceFile, result);

      // Check for syntax errors
      const diagnostics = this.getTypeScriptDiagnostics(sourceFile);
      for (const diagnostic of diagnostics) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        const position = diagnostic.start ? sourceFile.getLineAndCharacterOfPosition(diagnostic.start) : undefined;

        result.errors.push({
          type: 'syntax_error',
          message,
          line: position ? position.line + 1 : undefined,
          column: position ? position.character + 1 : undefined,
          severity: 'error'
        });
      }
    } catch (error) {
      result.errors.push({
        type: 'syntax_error',
        message: `TypeScript parsing error: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
    }
  }

  private validateJavaScriptSyntax(content: string, result: ValidationResult): void {
    try {
      // Use TypeScript parser with JavaScript target
      const sourceFile = ts.createSourceFile(
        'temp.js',
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS
      );

      const diagnostics = this.getTypeScriptDiagnostics(sourceFile);
      for (const diagnostic of diagnostics) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        const position = diagnostic.start ? sourceFile.getLineAndCharacterOfPosition(diagnostic.start) : undefined;

        result.errors.push({
          type: 'syntax_error',
          message,
          line: position ? position.line + 1 : undefined,
          column: position ? position.character + 1 : undefined,
          severity: 'error'
        });
      }
    } catch (error) {
      result.errors.push({
        type: 'syntax_error',
        message: `JavaScript parsing error: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
    }
  }

  private validateImports(content: string, result: ValidationResult): void {
    const lines = content.split('\n');
    let hasPlaywrightTestImport = false;
    let hasPlaywrightExpectImport = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('import') && line.includes('@playwright/test')) {
        if (line.includes('test')) hasPlaywrightTestImport = true;
        if (line.includes('expect')) hasPlaywrightExpectImport = true;
      }
    }

    // Check if test() is used without import
    if (content.includes('test(') && !hasPlaywrightTestImport) {
      result.errors.push({
        type: 'missing_import',
        message: 'Missing import for "test" from @playwright/test',
        severity: 'error',
        suggestion: 'Add: import { test } from \'@playwright/test\';'
      });
    }

    // Check if expect() is used without import
    if (content.includes('expect(') && !hasPlaywrightExpectImport) {
      result.errors.push({
        type: 'missing_import',
        message: 'Missing import for "expect" from @playwright/test',
        severity: 'error',
        suggestion: 'Add: import { expect } from \'@playwright/test\';'
      });
    }
  }

  private validateConversionArtifacts(content: string, result: ValidationResult): void {
    const cypressPatterns = [
      { pattern: /cy\./g, name: 'Cypress commands' },
      { pattern: /\.should\(/g, name: 'Cypress assertions' },
      { pattern: /\.and\(/g, name: 'Cypress chaining' },
      { pattern: /\.then\(/g, name: 'Cypress promises' },
      { pattern: /Cypress\./g, name: 'Cypress global' },
      { pattern: /beforeEach\(function\(\)/g, name: 'Cypress function syntax' }
    ];

    for (const { pattern, name } of cypressPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        result.errors.push({
          type: 'conversion_artifact',
          message: `Found unconverted ${name}: ${matches.length} occurrence(s)`,
          severity: 'error',
          suggestion: `Convert ${name} to Playwright equivalent`
        });
        result.conversionArtifacts?.push(name);
      }
    }
  }

  private validateAsyncPatterns(content: string, result: ValidationResult): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check for missing await on page operations
      const pageOperations = [
        'page.goto', 'page.click', 'page.fill', 'page.type', 'page.press',
        'page.locator', 'page.getBy', 'locator.click', 'locator.fill'
      ];

      for (const operation of pageOperations) {
        if (line.includes(operation) && !line.includes('await') && !line.includes('return')) {
          result.warnings.push({
            type: 'missing_await',
            message: `Potentially missing await for ${operation}`,
            line: i + 1,
            suggestion: `Add 'await' before ${operation}`
          });
        }
      }

      // Check for missing await on expect operations
      if (line.includes('expect(page.') && !line.includes('await')) {
        result.warnings.push({
          type: 'missing_await',
          message: 'Missing await for expect assertion',
          line: i + 1,
          suggestion: 'Add \'await\' before expect'
        });
      }
    }
  }

  private validatePlaywrightPatterns(content: string, result: ValidationResult): void {
    const playwrightPatterns = [
      'page.locator',
      'page.getByRole',
      'page.getByTestId',
      'page.getByLabel',
      'page.getByText',
      'page.getByPlaceholder',
      'expect().toBeVisible',
      'expect().toHaveText',
      'expect().toContainText'
    ];

    for (const pattern of playwrightPatterns) {
      if (content.includes(pattern)) {
        result.playwrightPatterns?.push(pattern);
      }
    }
  }

  private containsTypeScriptFeatures(content: string): boolean {
    const tsFeatures = [
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /:\s*\w+(\[\])?(\s*\||\s*&)/,
      /<\w+>/,
      /as\s+\w+/,
      /import\s+type/
    ];

    return tsFeatures.some(pattern => pattern.test(content));
  }

  private analyzeTypeScriptFeatures(sourceFile: ts.SourceFile, result: ValidationResult): void {
    const features = new Set<string>();

    function visit(node: ts.Node) {
      switch (node.kind) {
        case ts.SyntaxKind.InterfaceDeclaration:
          features.add('interfaces');
          break;
        case ts.SyntaxKind.TypeAliasDeclaration:
          features.add('type_aliases');
          break;
        case ts.SyntaxKind.TypeReference:
          features.add('type_references');
          break;
        case ts.SyntaxKind.TypeParameter:
          features.add('generics');
          break;
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    result.typeScriptFeatures = Array.from(features);
  }

  private getTypeScriptDiagnostics(sourceFile: ts.SourceFile): ts.Diagnostic[] {
    const program = ts.createProgram([sourceFile.fileName], {
      noEmit: true,
      strict: false, // Less strict for validation
      skipLibCheck: true
    }, {
      getSourceFile: (fileName) => fileName === sourceFile.fileName ? sourceFile : undefined,
      writeFile: () => {},
      getCurrentDirectory: () => '',
      getDirectories: () => [],
      fileExists: () => true,
      readFile: () => '',
      getCanonicalFileName: (fileName) => fileName,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      getDefaultLibFileName: () => 'lib.d.ts'
    });

    return [...ts.getPreEmitDiagnostics(program, sourceFile)];
  }

  async validateProject(projectPath: string): Promise<ProjectValidationResult> {
    this.logger.info(`Validating project: ${projectPath}`);

    const result: ProjectValidationResult = {
      totalFiles: 0,
      validFiles: 0,
      invalidFiles: 0,
      overallScore: 0,
      fileResults: new Map(),
      summary: {
        totalFiles: 0,
        passRate: 0,
        commonIssues: [],
        recommendations: [],
        overallScore: 0,
        breakdown: {
          syntaxErrors: 0,
          missingImports: 0,
          conversionArtifacts: 0,
          warnings: 0
        }
      }
    };

    try {
      const testFiles = await this.findTestFiles(projectPath);
      result.totalFiles = testFiles.length;

      for (const filePath of testFiles) {
        const validationResult = await this.validateTestFile(filePath);
        result.fileResults.set(filePath, validationResult);

        if (validationResult.isValid) {
          result.validFiles++;
        } else {
          result.invalidFiles++;
        }

        // Accumulate statistics
        result.summary.breakdown.syntaxErrors += validationResult.errors.filter(e => e.type === 'syntax_error').length;
        result.summary.breakdown.missingImports += validationResult.errors.filter(e => e.type === 'missing_import').length;
        result.summary.breakdown.conversionArtifacts += validationResult.errors.filter(e => e.type === 'conversion_artifact').length;
        result.summary.breakdown.warnings += validationResult.warnings.length;
      }

      // Calculate scores and recommendations
      result.summary = this.calculateProjectSummary(result);
      result.overallScore = result.summary.overallScore;

    } catch (error) {
      this.logger.error(`Project validation failed:`, error);
    }

    return result;
  }

  private async findTestFiles(projectPath: string): Promise<string[]> {
    const testFiles: string[] = [];
    const testExtensions = ['.spec.ts', '.spec.js', '.test.ts', '.test.js'];
    const testDirectories = ['tests', 'test', 'e2e', '__tests__'];

    async function scanDirectory(dirPath: string): Promise<void> {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            if (testExtensions.some(ext => entry.name.endsWith(ext))) {
              testFiles.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Directory might not be accessible
      }
    }

    // Check common test directories
    for (const testDir of testDirectories) {
      const testDirPath = path.join(projectPath, testDir);
      if (await fs.pathExists(testDirPath)) {
        await scanDirectory(testDirPath);
      }
    }

    // Also check for config files
    const configFiles = ['playwright.config.ts', 'playwright.config.js'];
    for (const configFile of configFiles) {
      const configPath = path.join(projectPath, configFile);
      if (await fs.pathExists(configPath)) {
        testFiles.push(configPath);
      }
    }

    return testFiles;
  }

  private calculateProjectSummary(result: ProjectValidationResult): ValidationSummary {
    const passRate = result.totalFiles > 0 ? (result.validFiles / result.totalFiles) * 100 : 0;
    const overallScore = this.calculateOverallScore(result);

    const commonIssues = this.identifyCommonIssues(result);
    const recommendations = this.generateRecommendations(result);

    return {
      totalFiles: result.totalFiles,
      passRate,
      commonIssues,
      recommendations,
      overallScore,
      breakdown: result.summary.breakdown
    };
  }

  private calculateOverallScore(result: ProjectValidationResult): number {
    if (result.totalFiles === 0) return 0;

    const weights = {
      passRate: 0.4,
      syntaxErrors: 0.3,
      missingImports: 0.2,
      conversionArtifacts: 0.1
    };

    const passRateScore = (result.validFiles / result.totalFiles) * 100;
    const syntaxErrorPenalty = Math.min(result.summary.breakdown.syntaxErrors * 5, 50);
    const importErrorPenalty = Math.min(result.summary.breakdown.missingImports * 3, 30);
    const artifactPenalty = Math.min(result.summary.breakdown.conversionArtifacts * 2, 20);

    const score = (passRateScore * weights.passRate) +
                  ((100 - syntaxErrorPenalty) * weights.syntaxErrors) +
                  ((100 - importErrorPenalty) * weights.missingImports) +
                  ((100 - artifactPenalty) * weights.conversionArtifacts);

    return Math.max(0, Math.min(100, score));
  }

  private identifyCommonIssues(result: ProjectValidationResult): string[] {
    const issues: string[] = [];

    if (result.summary.breakdown.syntaxErrors > 0) {
      issues.push(`Syntax errors found in ${result.summary.breakdown.syntaxErrors} locations`);
    }

    if (result.summary.breakdown.missingImports > 0) {
      issues.push(`Missing imports detected in ${result.summary.breakdown.missingImports} files`);
    }

    if (result.summary.breakdown.conversionArtifacts > 0) {
      issues.push(`Cypress conversion artifacts found in ${result.summary.breakdown.conversionArtifacts} places`);
    }

    if (result.summary.breakdown.warnings > result.totalFiles * 2) {
      issues.push('High number of warnings detected');
    }

    return issues;
  }

  private generateRecommendations(result: ProjectValidationResult): string[] {
    const recommendations: string[] = [];

    if (result.summary.breakdown.syntaxErrors > 0) {
      recommendations.push('Fix syntax errors to ensure proper TypeScript/JavaScript compilation');
    }

    if (result.summary.breakdown.missingImports > 0) {
      recommendations.push('Add missing Playwright imports to enable test execution');
    }

    if (result.summary.breakdown.conversionArtifacts > 0) {
      recommendations.push('Complete the conversion of remaining Cypress patterns to Playwright');
    }

    if (result.summary.passRate < 80) {
      recommendations.push('Review and fix validation issues to improve overall code quality');
    }

    if (result.summary.breakdown.warnings > result.totalFiles * 3) {
      recommendations.push('Address warnings to improve code quality and maintainability');
    }

    return recommendations;
  }

  generateValidationSummary(validationResults: any): ValidationSummary {
    // This method generates a summary from aggregated validation results
    const totalFiles = validationResults.syntaxValidation.valid + validationResults.syntaxValidation.invalid;
    const passRate = totalFiles > 0 ? (validationResults.syntaxValidation.valid / totalFiles) * 100 : 0;

    return {
      totalFiles,
      passRate,
      commonIssues: ['Sample issue'],
      recommendations: ['Sample recommendation'],
      overallScore: passRate,
      breakdown: {
        syntaxErrors: validationResults.syntaxValidation.invalid,
        missingImports: validationResults.importValidation.invalid,
        conversionArtifacts: 0,
        warnings: validationResults.syntaxValidation.warnings + validationResults.importValidation.warnings
      }
    };
  }
}