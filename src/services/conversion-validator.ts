import * as fs from 'fs-extra';
import * as path from 'path';
import * as ts from 'typescript';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../utils/logger';

const execAsync = promisify(exec);

export interface SyntaxValidationResult {
  filePath: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  importValidation?: {
    resolvedImports: string[];
    unresolvedImports: string[];
  };
}

export interface CompilationValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  duration: number;
}

export interface ExecutionValidationResult {
  canExecute: boolean;
  errors: string[];
  warnings: string[];
  testResults?: {
    passed: number;
    failed: number;
    skipped: number;
  };
}

export interface ConversionQualityMetrics {
  totalFiles: number;
  successfullyValidated: number;
  conversionRate: number;
  errorRate: number;
  totalErrors: number;
  totalWarnings: number;
  meetsQualityThreshold: boolean;
  errorCategories: Record<string, number>;
}

export interface ProjectValidationResult {
  overallSuccess: boolean;
  qualityMetrics: ConversionQualityMetrics;
  validationSummary: {
    syntaxValidation: {
      passed: number;
      failed: number;
      warnings: number;
    };
    compilationValidation: CompilationValidationResult;
    executionValidation: ExecutionValidationResult;
  };
  fileValidationResults: SyntaxValidationResult[];
  performanceMetrics: {
    validationTime: number;
    filesPerSecond: number;
  };
}

export class ConversionValidator {
  private logger: Logger;
  private readonly QUALITY_THRESHOLD = 0.85; // 85% success rate

  constructor() {
    this.logger = new Logger('ConversionValidator');
  }

  async validateSyntax(filePath: string): Promise<SyntaxValidationResult> {
    try {
      if (!await fs.pathExists(filePath)) {
        return {
          filePath,
          isValid: false,
          errors: [`File does not exist: ${filePath}`],
          warnings: []
        };
      }

      const content = await fs.readFile(filePath, 'utf-8');
      return this.validateTypeScriptSyntax(filePath, content);
    } catch (error) {
      this.logger.error(`Error validating syntax for ${filePath}:`, error);
      return {
        filePath,
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        warnings: []
      };
    }
  }

  private validateTypeScriptSyntax(filePath: string, content: string): SyntaxValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isValid = true;

    try {
      // Create TypeScript source file
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );

      // Check for syntax errors
      const syntaxDiagnostics = (sourceFile as any).parseDiagnostics || [];
      for (const diagnostic of syntaxDiagnostics) {
        isValid = false;
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        errors.push(`Syntax error: ${message}`);
      }

      // Validate imports
      const importValidation = this.validateImports(sourceFile, path.dirname(filePath));

      // Basic semantic checks
      const semanticIssues = this.performBasicSemanticChecks(sourceFile);
      errors.push(...semanticIssues.errors);
      warnings.push(...semanticIssues.warnings);

      if (semanticIssues.errors.length > 0) {
        isValid = false;
      }

      return {
        filePath,
        isValid,
        errors,
        warnings,
        importValidation
      };
    } catch (error) {
      return {
        filePath,
        isValid: false,
        errors: [`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: []
      };
    }
  }

  private validateImports(sourceFile: ts.SourceFile, baseDir: string): {
    resolvedImports: string[];
    unresolvedImports: string[];
  } {
    const resolvedImports: string[] = [];
    const unresolvedImports: string[] = [];

    const visitNode = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const moduleName = node.moduleSpecifier.text;

        // Skip validation for npm packages (they start without ./ or ../)
        if (!moduleName.startsWith('.')) {
          resolvedImports.push(moduleName);
          return;
        }

        // Check relative imports
        try {
          const possibleExtensions = ['.ts', '.js', '.tsx', '.jsx'];
          const resolvedPath = path.resolve(baseDir, moduleName);

          let found = false;
          for (const ext of possibleExtensions) {
            if (fs.pathExistsSync(resolvedPath + ext)) {
              resolvedImports.push(moduleName);
              found = true;
              break;
            }
          }

          if (!found && fs.pathExistsSync(resolvedPath + '/index.ts')) {
            resolvedImports.push(moduleName);
            found = true;
          }

          if (!found) {
            unresolvedImports.push(moduleName);
          }
        } catch (error) {
          unresolvedImports.push(moduleName);
        }
      }

      ts.forEachChild(node, visitNode);
    };

    visitNode(sourceFile);

    return { resolvedImports, unresolvedImports };
  }

  private performBasicSemanticChecks(sourceFile: ts.SourceFile): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const visitNode = (node: ts.Node) => {
      // Check for common Playwright patterns
      if (ts.isCallExpression(node)) {
        const text = node.getText();

        // Check for unconverted Cypress patterns
        if (text.includes('cy.')) {
          errors.push('Unconverted Cypress pattern detected: ' + text.substring(0, 50));
        }

        // Check for missing await keywords
        if (text.includes('page.goto') && !this.isAwaitedCall(node)) {
          warnings.push('Potentially missing await keyword for: ' + text.substring(0, 30));
        }
      }

      // Check for proper test structure
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
        const params = node.parameters;
        if (params.length > 0 && params[0].getText().includes('page')) {
          if (!node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
            warnings.push('Test function with page parameter should be async');
          }
        }
      }

      ts.forEachChild(node, visitNode);
    };

    visitNode(sourceFile);

    return { errors, warnings };
  }

  private isAwaitedCall(node: ts.CallExpression): boolean {
    let parent = node.parent;
    while (parent) {
      if (ts.isAwaitExpression(parent)) {
        return true;
      }
      if (ts.isStatement(parent)) {
        break;
      }
      parent = parent.parent;
    }
    return false;
  }

  async validateCompilation(projectPath: string): Promise<CompilationValidationResult> {
    const startTime = Date.now();

    try {
      // Check if tsconfig.json exists
      const tsconfigPath = path.join(projectPath, 'tsconfig.json');
      if (!await fs.pathExists(tsconfigPath)) {
        // Create a basic tsconfig.json for validation
        const basicTsConfig = {
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            lib: ['ES2020', 'DOM'],
            outDir: './dist',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true
          },
          include: ['**/*.ts', '**/*.tsx'],
          exclude: ['node_modules', 'dist']
        };

        await fs.writeFile(tsconfigPath, JSON.stringify(basicTsConfig, null, 2));
      }

      // Run TypeScript compilation
      const { stdout, stderr } = await execAsync('npx tsc --noEmit', {
        cwd: projectPath,
        timeout: 30000 // 30 second timeout
      });

      const duration = Date.now() - startTime;

      // Parse compilation output
      const errors = this.parseCompilationErrors(stderr);
      const warnings = this.parseCompilationWarnings(stdout + stderr);

      return {
        success: errors.length === 0,
        errors,
        warnings,
        duration
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const compilationErrors = this.parseCompilationErrors(error.stderr || error.message || '');

      return {
        success: false,
        errors: compilationErrors.length > 0 ? compilationErrors : ['TypeScript compilation failed'],
        warnings: [],
        duration
      };
    }
  }

  private parseCompilationErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes(': error TS')) {
        errors.push(line.trim());
      }
    }

    return errors;
  }

  private parseCompilationWarnings(output: string): string[] {
    const warnings: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes(': warning TS')) {
        warnings.push(line.trim());
      }
    }

    return warnings;
  }

  async validateBasicTestExecution(testFiles: string[]): Promise<ExecutionValidationResult> {
    try {
      // Create a minimal test runner script
      const tempDir = path.join(process.cwd(), '.temp-validation');
      await fs.ensureDir(tempDir);

      const testRunnerScript = `
        const { test } = require('@playwright/test');

        // Basic validation test
        test('validation check', async () => {
          // This test just validates that the test framework loads correctly
          console.log('Validation test executed successfully');
        });
      `;

      const tempTestFile = path.join(tempDir, 'validation.spec.js');
      await fs.writeFile(tempTestFile, testRunnerScript);

      try {
        // Run a basic validation test
        await execAsync('npx playwright test validation.spec.js --reporter=line', {
          cwd: tempDir,
          timeout: 60000 // 1 minute timeout
        });

        // Clean up
        await fs.remove(tempDir);

        return {
          canExecute: true,
          errors: [],
          warnings: []
        };
      } catch (error: any) {
        // Clean up
        await fs.remove(tempDir);

        return {
          canExecute: false,
          errors: [error.message || 'Test execution failed'],
          warnings: []
        };
      }
    } catch (error) {
      return {
        canExecute: false,
        errors: [error instanceof Error ? error.message : 'Unknown execution validation error'],
        warnings: []
      };
    }
  }

  async calculateConversionQuality(validationResults: SyntaxValidationResult[]): Promise<ConversionQualityMetrics> {
    const totalFiles = validationResults.length;
    const successfullyValidated = validationResults.filter(r => r.isValid).length;
    const conversionRate = totalFiles > 0 ? successfullyValidated / totalFiles : 0;
    const errorRate = 1 - conversionRate;

    const totalErrors = validationResults.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = validationResults.reduce((sum, r) => sum + r.warnings.length, 0);

    // Categorize errors
    const errorCategories: Record<string, number> = {};
    for (const result of validationResults) {
      for (const error of result.errors) {
        const category = this.categorizeError(error);
        errorCategories[category] = (errorCategories[category] || 0) + 1;
      }
    }

    return {
      totalFiles,
      successfullyValidated,
      conversionRate,
      errorRate,
      totalErrors,
      totalWarnings,
      meetsQualityThreshold: conversionRate >= this.QUALITY_THRESHOLD,
      errorCategories
    };
  }

  private categorizeError(error: string): string {
    if (error.toLowerCase().includes('syntax')) return 'syntax';
    if (error.toLowerCase().includes('import')) return 'import';
    if (error.toLowerCase().includes('type')) return 'type';
    if (error.toLowerCase().includes('cypress')) return 'conversion';
    if (error.toLowerCase().includes('missing')) return 'missing';
    return 'other';
  }

  async validateConvertedProject(projectPath: string): Promise<ProjectValidationResult> {
    const startTime = Date.now();

    try {
      // Find all test files
      const testFiles = await this.findTestFiles(projectPath);
      this.logger.info(`Found ${testFiles.length} test files for validation`);

      // Validate syntax for all files
      const syntaxValidationPromises = testFiles.map(file => this.validateSyntax(file));
      const fileValidationResults = await Promise.all(syntaxValidationPromises);

      // Calculate quality metrics
      const qualityMetrics = await this.calculateConversionQuality(fileValidationResults);

      // Validate compilation
      const compilationValidation = await this.validateCompilation(projectPath);

      // Validate basic execution capability
      const executionValidation = await this.validateBasicTestExecution(testFiles);

      const endTime = Date.now();
      const validationTime = endTime - startTime;

      // Create summary
      const syntaxValidation = {
        passed: fileValidationResults.filter(r => r.isValid).length,
        failed: fileValidationResults.filter(r => !r.isValid).length,
        warnings: fileValidationResults.reduce((sum, r) => sum + r.warnings.length, 0)
      };

      const overallSuccess = qualityMetrics.meetsQualityThreshold &&
                           compilationValidation.success &&
                           executionValidation.canExecute;

      return {
        overallSuccess,
        qualityMetrics,
        validationSummary: {
          syntaxValidation,
          compilationValidation,
          executionValidation
        },
        fileValidationResults,
        performanceMetrics: {
          validationTime,
          filesPerSecond: testFiles.length / (validationTime / 1000)
        }
      };
    } catch (error) {
      this.logger.error('Error during project validation:', error);
      throw error;
    }
  }

  private async findTestFiles(projectPath: string): Promise<string[]> {
    const testFiles: string[] = [];

    const scanDirectory = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dirPath);

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry);
          const stats = await fs.stat(fullPath);

          if (stats.isDirectory()) {
            if (!['node_modules', '.git', 'dist', 'build'].includes(entry)) {
              await scanDirectory(fullPath);
            }
          } else if (stats.isFile() && this.isTestFile(entry)) {
            testFiles.push(fullPath);
          }
        }
      } catch (error) {
        this.logger.warn(`Error scanning directory ${dirPath}:`, error);
      }
    };

    await scanDirectory(projectPath);
    return testFiles;
  }

  private isTestFile(fileName: string): boolean {
    const testExtensions = ['.ts', '.js'];
    const testPatterns = [
      /\.spec\./,
      /\.test\./,
      /\.e2e\./
    ];

    const hasTestExtension = testExtensions.some(ext => fileName.endsWith(ext));
    const hasTestPattern = testPatterns.some(pattern => pattern.test(fileName));

    return hasTestExtension && hasTestPattern;
  }

  async generateValidationReport(
    validationResult: ProjectValidationResult,
    reportPath: string
  ): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      validationSummary: {
        overallSuccess: validationResult.overallSuccess,
        qualityThresholdMet: validationResult.qualityMetrics.meetsQualityThreshold,
        conversionRate: validationResult.qualityMetrics.conversionRate,
        totalFiles: validationResult.qualityMetrics.totalFiles
      },
      detailedMetrics: validationResult.qualityMetrics,
      validationResults: {
        syntax: validationResult.validationSummary.syntaxValidation,
        compilation: validationResult.validationSummary.compilationValidation,
        execution: validationResult.validationSummary.executionValidation
      },
      performanceMetrics: validationResult.performanceMetrics,
      fileDetails: validationResult.fileValidationResults.map(result => ({
        filePath: result.filePath,
        isValid: result.isValid,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        errors: result.errors,
        warnings: result.warnings
      })),
      recommendations: this.generateRecommendations(validationResult)
    };

    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    this.logger.info(`Validation report generated: ${reportPath}`);
  }

  private generateRecommendations(validationResult: ProjectValidationResult): string[] {
    const recommendations: string[] = [];

    if (validationResult.qualityMetrics.conversionRate < this.QUALITY_THRESHOLD) {
      recommendations.push(
        `Conversion rate (${(validationResult.qualityMetrics.conversionRate * 100).toFixed(1)}%) is below the 85% threshold. ` +
        'Review failed conversions and improve conversion logic.'
      );
    }

    if (validationResult.validationSummary.syntaxValidation.failed > 0) {
      recommendations.push(
        `${validationResult.validationSummary.syntaxValidation.failed} files have syntax errors. ` +
        'Run syntax validation on individual files for detailed error information.'
      );
    }

    if (!validationResult.validationSummary.compilationValidation.success) {
      recommendations.push(
        'TypeScript compilation failed. Review compilation errors and fix type issues.'
      );
    }

    if (!validationResult.validationSummary.executionValidation.canExecute) {
      recommendations.push(
        'Basic test execution validation failed. Check Playwright configuration and dependencies.'
      );
    }

    const topErrorCategory = Object.entries(validationResult.qualityMetrics.errorCategories)
      .sort(([,a], [,b]) => b - a)[0];

    if (topErrorCategory && topErrorCategory[1] > 0) {
      recommendations.push(
        `Most common error type: ${topErrorCategory[0]} (${topErrorCategory[1]} occurrences). ` +
        `Focus on improving ${topErrorCategory[0]} handling in the conversion process.`
      );
    }

    return recommendations;
  }
}