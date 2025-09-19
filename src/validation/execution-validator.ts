import { Logger } from '../utils/logger';
import { EnvironmentValidator } from './environment-validator';
import { DependencyValidator } from './dependency-validator';
import { BrowserCompatibilityValidator } from './browser-compatibility-validator';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as childProcess from 'child_process';

export interface ExecutionValidationResult {
  success: boolean;
  exitCode: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
  duration: number;
  output: string;
  errors: string[];
  warnings: string[];
  timedOut: boolean;
  configuration?: any;
}

export interface ProjectValidationResult {
  canExecute: boolean;
  overallScore: number;
  environmentValid: boolean;
  dependenciesValid: boolean;
  browsersValid: boolean;
  recommendations: string[];
  blockers: string[];
  executionResults?: ExecutionValidationResult[];
}

export interface ExecutionOptions {
  timeout?: number;
  browser?: string;
  project?: string;
  headed?: boolean;
  workers?: number;
  reporter?: string;
}

export class ExecutionValidator {
  private logger = new Logger('ExecutionValidator');
  private environmentValidator = new EnvironmentValidator();
  private dependencyValidator = new DependencyValidator();
  private browserValidator = new BrowserCompatibilityValidator();

  async executeTests(projectPath: string, options: ExecutionOptions = {}): Promise<ExecutionValidationResult> {
    this.logger.info(`Executing tests in: ${projectPath}`);

    const result: ExecutionValidationResult = {
      success: false,
      exitCode: -1,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      testsSkipped: 0,
      duration: 0,
      output: '',
      errors: [],
      warnings: [],
      timedOut: false
    };

    try {
      // Validate project structure
      await this.validateProjectStructure(projectPath, result);
      if (!result.success && result.errors.length > 0) {
        return result;
      }

      // Build test command
      const command = await this.buildTestCommand(projectPath, options);

      // Execute tests
      const startTime = Date.now();
      await this.runTestCommand(command, projectPath, options, result);
      result.duration = Date.now() - startTime;

      // Parse test results
      this.parseTestResults(result);

    } catch (error) {
      this.logger.error('Test execution failed:', error);
      result.success = false;
      result.errors.push(`Execution failed: ${error.message}`);
    }

    return result;
  }

  async executeTestsWithConfig(projectPath: string, configuration: any): Promise<ExecutionValidationResult> {
    this.logger.info(`Executing tests with configuration: ${configuration.name}`);

    const options: ExecutionOptions = {
      browser: configuration.browser,
      project: configuration.name,
      timeout: configuration.timeout || 30000
    };

    const result = await this.executeTests(projectPath, options);
    result.configuration = configuration;

    return result;
  }

  async validateProject(projectPath: string): Promise<ProjectValidationResult> {
    this.logger.info(`Validating project for execution: ${projectPath}`);

    const result: ProjectValidationResult = {
      canExecute: false,
      overallScore: 0,
      environmentValid: false,
      dependenciesValid: false,
      browsersValid: false,
      recommendations: [],
      blockers: [],
      executionResults: []
    };

    try {
      // Validate environment
      const envValidation = await this.validateEnvironment();
      result.environmentValid = envValidation.isValid;

      if (!envValidation.isValid) {
        result.blockers.push(...envValidation.blockers);
        result.recommendations.push(...envValidation.recommendations);
      }

      // Validate dependencies
      const depValidation = await this.validateDependencies(projectPath);
      result.dependenciesValid = depValidation.isValid;

      if (!depValidation.isValid) {
        result.blockers.push(...depValidation.blockers);
        result.recommendations.push(...depValidation.recommendations);
      }

      // Validate browsers
      const browserValidation = await this.validateBrowsers();
      result.browsersValid = browserValidation.isValid;

      if (!browserValidation.isValid) {
        result.blockers.push(...browserValidation.blockers);
        result.recommendations.push(...browserValidation.recommendations);
      }

      // Determine if execution is possible
      result.canExecute = result.environmentValid && result.dependenciesValid && result.browsersValid;

      // Calculate overall score
      result.overallScore = this.calculateOverallScore(result);

      // Add general recommendations
      this.addGeneralRecommendations(result);

    } catch (error) {
      this.logger.error('Project validation failed:', error);
      result.blockers.push(`Validation failed: ${error.message}`);
    }

    return result;
  }

  private async validateProjectStructure(projectPath: string, result: ExecutionValidationResult): Promise<void> {
    // Check if project directory exists
    if (!(await fs.pathExists(projectPath))) {
      result.errors.push(`Project directory does not exist: ${projectPath}`);
      return;
    }

    // Check for package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!(await fs.pathExists(packageJsonPath))) {
      result.errors.push('No package.json found in project directory');
      return;
    }

    // Check for test script
    try {
      const packageJson = await fs.readJson(packageJsonPath);

      if (!packageJson.scripts || !packageJson.scripts.test) {
        result.errors.push('No test script found in package.json');
        return;
      }

      if (!packageJson.scripts.test.includes('playwright')) {
        result.warnings.push('Test script does not appear to use Playwright');
      }

      result.success = true;
    } catch (error) {
      result.errors.push(`Failed to read package.json: ${error.message}`);
    }
  }

  private async buildTestCommand(projectPath: string, options: ExecutionOptions): Promise<string> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);

    let command = packageJson.scripts.test;

    // Add browser-specific options
    if (options.browser) {
      command += ` --project=${options.browser}`;
    }

    // Add headed/headless mode
    if (options.headed !== undefined) {
      command += options.headed ? ' --headed' : ' --headless';
    }

    // Add workers
    if (options.workers) {
      command += ` --workers=${options.workers}`;
    }

    // Add reporter
    if (options.reporter) {
      command += ` --reporter=${options.reporter}`;
    }

    return command;
  }

  private async runTestCommand(
    command: string,
    projectPath: string,
    options: ExecutionOptions,
    result: ExecutionValidationResult
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 120000; // 2 minutes default

      this.logger.info(`Running command: ${command}`);

      const childProc = childProcess.spawn('npm', ['test'], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      let stdout = '';
      let stderr = '';

      childProc.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        result.output += output;
      });

      childProc.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        result.errors.push(output.trim());
      });

      const timeoutId = setTimeout(() => {
        childProc.kill('SIGTERM');
        result.timedOut = true;
        result.errors.push('Test execution timed out');
        resolve();
      }, timeout);

      childProc.on('close', (code: number | null) => {
        clearTimeout(timeoutId);
        result.exitCode = code || 0;
        result.success = code === 0;

        if (stderr) {
          result.errors.push(stderr.trim());
        }

        resolve();
      });

      childProc.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        result.errors.push(`Process error: ${error.message}`);
        reject(error);
      });
    });
  }

  private parseTestResults(result: ExecutionValidationResult): void {
    const output = result.output;

    // Parse Playwright test output patterns
    const patterns = {
      testsRun: /Running (\d+) test/i,
      testsPassed: /(\d+) passed/i,
      testsFailed: /(\d+) failed/i,
      testsSkipped: /(\d+) skipped/i,
      allPassed: /All tests passed/i
    };

    // Extract test counts
    const runMatch = output.match(patterns.testsRun);
    if (runMatch) {
      result.testsRun = parseInt(runMatch[1], 10);
    }

    const passedMatch = output.match(patterns.testsPassed);
    if (passedMatch) {
      result.testsPassed = parseInt(passedMatch[1], 10);
    }

    const failedMatch = output.match(patterns.testsFailed);
    if (failedMatch) {
      result.testsFailed = parseInt(failedMatch[1], 10);
    }

    const skippedMatch = output.match(patterns.testsSkipped);
    if (skippedMatch) {
      result.testsSkipped = parseInt(skippedMatch[1], 10);
    }

    // Handle "All tests passed" case
    if (patterns.allPassed.test(output) && result.testsRun > 0) {
      result.testsPassed = result.testsRun;
      result.testsFailed = 0;
    }

    // Calculate missing values
    if (result.testsRun > 0) {
      const accounted = result.testsPassed + result.testsFailed + result.testsSkipped;
      if (accounted < result.testsRun) {
        // Assume remaining are passed if no failures detected
        if (result.testsFailed === 0) {
          result.testsPassed = result.testsRun - result.testsSkipped;
        }
      }
    }

    // Extract warnings from output
    const warningPatterns = [
      /Warning: (.+)/gi,
      /Deprecated: (.+)/gi,
      /Notice: (.+)/gi
    ];

    for (const pattern of warningPatterns) {
      const matches = output.match(pattern);
      if (matches) {
        result.warnings.push(...matches);
      }
    }
  }

  private async validateEnvironment(): Promise<any> {
    const nodeValidation = await this.environmentValidator.validateNodeVersion();
    const packageManagerValidation = await this.environmentValidator.validatePackageManager('npm');

    return {
      isValid: nodeValidation.isSupported && packageManagerValidation.isAvailable,
      blockers: [
        ...(nodeValidation.isSupported ? [] : ['Node.js version too old']),
        ...(packageManagerValidation.isAvailable ? [] : ['npm not available'])
      ],
      recommendations: [
        ...(nodeValidation.isSupported ? [] : [nodeValidation.recommendation || 'Upgrade Node.js to version 16 or higher']),
        ...(packageManagerValidation.isAvailable ? [] : ['Install npm'])
      ]
    };
  }

  private async validateDependencies(projectPath: string): Promise<any> {
    const playwrightValidation = await this.dependencyValidator.validatePlaywrightInstallation(projectPath);
    const compatibilityValidation = await this.dependencyValidator.validateDependencyCompatibility(projectPath);

    return {
      isValid: playwrightValidation.isInstalled && compatibilityValidation.isCompatible,
      blockers: [
        ...(playwrightValidation.isInstalled ? [] : ['Playwright not installed']),
        ...(compatibilityValidation.isCompatible ? [] : ['Dependency conflicts detected'])
      ],
      recommendations: [
        ...(playwrightValidation.isInstalled ? [] : [playwrightValidation.installCommand || 'Install Playwright']),
        ...(compatibilityValidation.isCompatible ? [] : ['Resolve dependency conflicts'])
      ]
    };
  }

  private async validateBrowsers(): Promise<any> {
    const browserValidation = await this.browserValidator.validateBrowserInstallations();

    return {
      isValid: browserValidation.allInstalled,
      blockers: [
        ...(browserValidation.allInstalled ? [] : ['Some browsers not installed'])
      ],
      recommendations: [
        ...(browserValidation.allInstalled ? [] : [browserValidation.installCommand || 'Install missing browsers'])
      ]
    };
  }

  private calculateOverallScore(result: ProjectValidationResult): number {
    const weights = {
      environment: 0.3,
      dependencies: 0.4,
      browsers: 0.3
    };

    const envScore = result.environmentValid ? 100 : 0;
    const depScore = result.dependenciesValid ? 100 : 0;
    const browserScore = result.browsersValid ? 100 : 0;

    return (envScore * weights.environment) +
           (depScore * weights.dependencies) +
           (browserScore * weights.browsers);
  }

  private addGeneralRecommendations(result: ProjectValidationResult): void {
    if (!result.canExecute) {
      result.recommendations.push('Fix blocking issues before attempting test execution');
    }

    if (result.overallScore < 70) {
      result.recommendations.push('Address validation issues to improve execution reliability');
    }

    if (result.blockers.length === 0 && result.canExecute) {
      result.recommendations.push('Project is ready for test execution');
    }
  }
}