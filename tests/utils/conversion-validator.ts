import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ConversionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    playwrightTestFiles: number;
    originalCypressFiles: number;
    configFilesGenerated: number;
    pageObjectFiles: number;
    syntaxErrors: number;
    conversionRate: number;
  };
}

export interface ProjectValidationOptions {
  validateSyntax?: boolean;
  validateImports?: boolean;
  validateStructure?: boolean;
  checkRequiredFiles?: boolean;
}

export class ConversionValidator {
  async validateConvertedProject(
    projectPath: string,
    originalCypressPath: string,
    options: ProjectValidationOptions = {}
  ): Promise<ConversionValidationResult> {
    const result: ConversionValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      metrics: {
        playwrightTestFiles: 0,
        originalCypressFiles: 0,
        configFilesGenerated: 0,
        pageObjectFiles: 0,
        syntaxErrors: 0,
        conversionRate: 0
      }
    };

    try {
      // Count original Cypress files
      result.metrics.originalCypressFiles = this.countCypressTestFiles(originalCypressPath);

      // Validate project structure
      if (options.validateStructure !== false) {
        this.validateProjectStructure(projectPath, result);
      }

      // Count generated files
      this.countGeneratedFiles(projectPath, result);

      // Validate syntax if requested
      if (options.validateSyntax !== false) {
        await this.validateTestFileSyntax(projectPath, result);
      }

      // Validate imports and dependencies
      if (options.validateImports !== false) {
        await this.validateImportsAndDependencies(projectPath, result);
      }

      // Check for required files
      if (options.checkRequiredFiles !== false) {
        this.validateRequiredFiles(projectPath, result);
      }

      // Calculate conversion rate
      result.metrics.conversionRate = result.metrics.originalCypressFiles > 0
        ? (result.metrics.playwrightTestFiles / result.metrics.originalCypressFiles) * 100
        : 0;

      // Determine overall validity
      result.isValid = result.errors.length === 0 && result.metrics.playwrightTestFiles > 0;

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  private countCypressTestFiles(cypressPath: string): number {
    if (!fs.existsSync(cypressPath)) return 0;

    const testExtensions = ['.cy.js', '.cy.ts', '.spec.js', '.spec.ts'];
    let count = 0;

    const countFiles = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          countFiles(fullPath);
        } else if (stat.isFile()) {
          if (testExtensions.some(ext => entry.endsWith(ext))) {
            count++;
          }
        }
      }
    };

    countFiles(cypressPath);
    return count;
  }

  private validateProjectStructure(projectPath: string, result: ConversionValidationResult): void {
    const expectedDirectories = ['tests', 'playwright-project'];
    const expectedFiles = ['playwright.config.ts', 'package.json'];

    // Check for Playwright project directory or tests directory
    const playwrightDir = path.join(projectPath, 'playwright-project');
    const testsDir = path.join(projectPath, 'tests');

    if (!fs.existsSync(playwrightDir) && !fs.existsSync(testsDir)) {
      result.errors.push('No Playwright project directory or tests directory found');
      return;
    }

    const workingDir = fs.existsSync(playwrightDir) ? playwrightDir : projectPath;

    // Check for required files
    const configFiles = [
      'playwright.config.ts',
      'playwright.config.js'
    ];

    const hasConfig = configFiles.some(file => fs.existsSync(path.join(workingDir, file)));
    if (!hasConfig) {
      result.warnings.push('No Playwright configuration file found');
    }

    const packageJsonPath = path.join(workingDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      result.warnings.push('No package.json found in converted project');
    } else {
      // Validate package.json contains Playwright dependencies
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        if (!deps['@playwright/test']) {
          result.errors.push('package.json missing @playwright/test dependency');
        }
      } catch (error) {
        result.warnings.push('Could not parse package.json');
      }
    }
  }

  private countGeneratedFiles(projectPath: string, result: ConversionValidationResult): void {
    const playwrightDir = path.join(projectPath, 'playwright-project');
    const testsDir = fs.existsSync(playwrightDir)
      ? path.join(playwrightDir, 'tests')
      : path.join(projectPath, 'tests');

    if (!fs.existsSync(testsDir)) {
      return;
    }

    const countFiles = (dir: string, patterns: string[]) => {
      let count = 0;
      if (!fs.existsSync(dir)) return count;

      const traverse = (currentDir: string) => {
        const entries = fs.readdirSync(currentDir);
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            traverse(fullPath);
          } else if (stat.isFile()) {
            if (patterns.some(pattern => entry.includes(pattern))) {
              count++;
            }
          }
        }
      };

      traverse(dir);
      return count;
    };

    // Count Playwright test files
    result.metrics.playwrightTestFiles = countFiles(testsDir, ['.spec.ts', '.spec.js', '.test.ts', '.test.js']);

    // Count page object files
    const pageObjectsDir = path.join(testsDir, 'page-objects');
    result.metrics.pageObjectFiles = countFiles(pageObjectsDir, ['.ts', '.js']);

    // Count config files
    const workingDir = fs.existsSync(playwrightDir) ? playwrightDir : projectPath;
    const configFiles = ['playwright.config.ts', 'playwright.config.js'];
    result.metrics.configFilesGenerated = configFiles.filter(file =>
      fs.existsSync(path.join(workingDir, file))
    ).length;
  }

  private async validateTestFileSyntax(projectPath: string, result: ConversionValidationResult): Promise<void> {
    const playwrightDir = path.join(projectPath, 'playwright-project');
    const testsDir = fs.existsSync(playwrightDir)
      ? path.join(playwrightDir, 'tests')
      : path.join(projectPath, 'tests');

    if (!fs.existsSync(testsDir)) {
      return;
    }

    const testFiles: string[] = [];
    const findTestFiles = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          findTestFiles(fullPath);
        } else if (stat.isFile() && (entry.endsWith('.spec.ts') || entry.endsWith('.test.ts'))) {
          testFiles.push(fullPath);
        }
      }
    };

    findTestFiles(testsDir);

    // Validate each test file syntax
    for (const testFile of testFiles) {
      try {
        const content = fs.readFileSync(testFile, 'utf8');

        // Basic syntax checks
        const hasPlaywrightImport = content.includes("import { test, expect } from '@playwright/test'") ||
                                  content.includes('from "@playwright/test"');

        if (!hasPlaywrightImport) {
          result.warnings.push(`${path.basename(testFile)}: Missing Playwright imports`);
        }

        const hasTestBlocks = /test\s*\(/g.test(content);
        if (!hasTestBlocks) {
          result.warnings.push(`${path.basename(testFile)}: No test blocks found`);
        }

        const hasAwaitPage = /await\s+page\./g.test(content);
        const hasPageDot = /page\./g.test(content);

        if (hasPageDot && !hasAwaitPage) {
          result.warnings.push(`${path.basename(testFile)}: Page actions may be missing await`);
        }

        // Check for common Cypress patterns that might not have been converted
        const cypressPatterns = [
          { pattern: /cy\./g, warning: 'Contains Cypress cy. commands' },
          { pattern: /\.should\(/g, warning: 'Contains Cypress .should() assertions' },
          { pattern: /\.get\(/g, warning: 'May contain unconverted .get() calls' }
        ];

        for (const { pattern, warning } of cypressPatterns) {
          if (pattern.test(content)) {
            result.warnings.push(`${path.basename(testFile)}: ${warning}`);
          }
        }

      } catch (error) {
        result.errors.push(`Failed to validate syntax for ${path.basename(testFile)}: ${error}`);
        result.metrics.syntaxErrors++;
      }
    }
  }

  private async validateImportsAndDependencies(projectPath: string, result: ConversionValidationResult): Promise<void> {
    const playwrightDir = path.join(projectPath, 'playwright-project');
    const workingDir = fs.existsSync(playwrightDir) ? playwrightDir : projectPath;

    const packageJsonPath = path.join(workingDir, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      result.warnings.push('No package.json found for dependency validation');
      return;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Check required Playwright dependencies
      const requiredDeps = ['@playwright/test'];
      const recommendedDeps = ['@types/node'];

      for (const dep of requiredDeps) {
        if (!allDeps[dep]) {
          result.errors.push(`Missing required dependency: ${dep}`);
        }
      }

      for (const dep of recommendedDeps) {
        if (!allDeps[dep]) {
          result.warnings.push(`Missing recommended dependency: ${dep}`);
        }
      }

      // Check for leftover Cypress dependencies
      const cypressDeps = ['cypress'];
      for (const dep of cypressDeps) {
        if (allDeps[dep]) {
          result.warnings.push(`Leftover Cypress dependency found: ${dep}`);
        }
      }

    } catch (error) {
      result.warnings.push('Could not validate dependencies in package.json');
    }
  }

  private validateRequiredFiles(projectPath: string, result: ConversionValidationResult): void {
    const playwrightDir = path.join(projectPath, 'playwright-project');
    const workingDir = fs.existsSync(playwrightDir) ? playwrightDir : projectPath;

    const requiredFiles = [
      { path: 'package.json', required: true },
      { path: 'playwright.config.ts', required: false, alternative: 'playwright.config.js' },
      { path: 'tests', required: true, isDirectory: true }
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(workingDir, file.path);
      const exists = fs.existsSync(filePath);

      if (!exists) {
        if (file.alternative) {
          const altPath = path.join(workingDir, file.alternative);
          if (!fs.existsSync(altPath)) {
            if (file.required) {
              result.errors.push(`Missing required file: ${file.path} (or ${file.alternative})`);
            } else {
              result.warnings.push(`Missing recommended file: ${file.path} (or ${file.alternative})`);
            }
          }
        } else {
          if (file.required) {
            result.errors.push(`Missing required ${file.isDirectory ? 'directory' : 'file'}: ${file.path}`);
          } else {
            result.warnings.push(`Missing recommended ${file.isDirectory ? 'directory' : 'file'}: ${file.path}`);
          }
        }
      } else {
        // Additional validation for directories
        if (file.isDirectory && file.path === 'tests') {
          const testFiles = fs.readdirSync(filePath)
            .filter(f => f.endsWith('.spec.ts') || f.endsWith('.test.ts') || f.endsWith('.spec.js') || f.endsWith('.test.js'));

          if (testFiles.length === 0) {
            result.warnings.push('Tests directory exists but contains no test files');
          }
        }
      }
    }
  }

  async checkTypeScriptCompilation(projectPath: string): Promise<{ success: boolean; errors: string[] }> {
    const playwrightDir = path.join(projectPath, 'playwright-project');
    const workingDir = fs.existsSync(playwrightDir) ? playwrightDir : projectPath;

    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit --skipLibCheck', {
        cwd: workingDir,
        timeout: 30000
      });

      return { success: true, errors: [] };
    } catch (error: any) {
      const errorOutput = error.stdout || error.stderr || error.message;
      return {
        success: false,
        errors: errorOutput.split('\n').filter((line: string) => line.trim())
      };
    }
  }

  generateValidationReport(result: ConversionValidationResult): string {
    const report = [
      '# Conversion Validation Report',
      '',
      `**Overall Status:** ${result.isValid ? '✅ PASSED' : '❌ FAILED'}`,
      '',
      '## Metrics',
      `- Original Cypress test files: ${result.metrics.originalCypressFiles}`,
      `- Generated Playwright test files: ${result.metrics.playwrightTestFiles}`,
      `- Page object files: ${result.metrics.pageObjectFiles}`,
      `- Configuration files: ${result.metrics.configFilesGenerated}`,
      `- Conversion rate: ${result.metrics.conversionRate.toFixed(1)}%`,
      `- Syntax errors: ${result.metrics.syntaxErrors}`,
      ''
    ];

    if (result.errors.length > 0) {
      report.push('## Errors');
      result.errors.forEach(error => report.push(`- ❌ ${error}`));
      report.push('');
    }

    if (result.warnings.length > 0) {
      report.push('## Warnings');
      result.warnings.forEach(warning => report.push(`- ⚠️ ${warning}`));
      report.push('');
    }

    return report.join('\n');
  }
}