import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface WorkflowConversionOptions {
  enableSharding?: boolean;
  shardCount?: number;
  addPlaywrightEnvVars?: boolean;
  preserveOriginalStructure?: boolean;
}

export interface ConversionSummary {
  originalJobs: number;
  convertedJobs: number;
  stepsConverted: number;
  browsersConverted: string[];
  environmentVariablesModified: string[];
}

export interface WorkflowConversionResult {
  originalFile: string;
  convertedFile: string;
  conversionSummary: ConversionSummary;
  warnings: string[];
  errors: string[];
}

export interface GitHubActionsConversionResult {
  success: boolean;
  convertedWorkflows: WorkflowConversionResult[];
  summary: {
    totalWorkflowsFound: number;
    workflowsConverted: number;
    workflowsSkipped: number;
    conversionTimeMs: number;
  };
  warnings: string[];
  errors: string[];
}

interface WorkflowFile {
  name: string;
  on?: any;
  jobs: { [key: string]: Job };
  env?: { [key: string]: string };
}

interface Job {
  'runs-on': string;
  strategy?: {
    matrix?: { [key: string]: any };
    'fail-fast'?: boolean;
  };
  steps: Step[];
  env?: { [key: string]: string };
}

interface Step {
  name: string;
  uses?: string;
  run?: string;
  with?: { [key: string]: any };
  env?: { [key: string]: string };
  if?: string;
  continue?: boolean;
}

export class GitHubActionsConverter {
  private readonly cypressActionPatterns = [
    'cypress-io/github-action',
    'cypress-io/cypress-github-action'
  ];

  private readonly cypressCommandPatterns = [
    'cypress run',
    'npm run cy:run',
    'yarn cy:run',
    'npx cypress run'
  ];

  private readonly browserMapping: { [key: string]: string } = {
    chrome: 'chromium',
    firefox: 'firefox',
    edge: 'webkit',
    webkit: 'webkit',
    chromium: 'chromium',
    electron: 'chromium'
  };

  /**
   * Detect GitHub Actions workflow files in the project
   */
  async detectWorkflowFiles(projectPath: string): Promise<string[]> {
    const workflowDir = path.join(projectPath, '.github/workflows');

    if (!fs.existsSync(workflowDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(workflowDir);
      return files
        .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
        .map(file => path.join(workflowDir, file));
    } catch (error) {
      console.warn(`Failed to read workflow directory: ${error}`);
      return [];
    }
  }

  /**
   * Parse a workflow YAML file
   */
  async parseWorkflowFile(filePath: string): Promise<WorkflowFile> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = yaml.load(content) as WorkflowFile;

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid workflow file structure');
      }

      return parsed;
    } catch (error) {
      throw new Error(`Failed to parse workflow file ${filePath}: ${error}`);
    }
  }

  /**
   * Check if a workflow is Cypress-related
   */
  isCypressWorkflow(workflow: WorkflowFile): boolean {
    if (!workflow.jobs) return false;

    for (const job of Object.values(workflow.jobs)) {
      if (!job.steps) continue;

      for (const step of job.steps) {
        // Check for Cypress GitHub actions
        if (step.uses && this.cypressActionPatterns.some(pattern =>
          step.uses!.includes(pattern)
        )) {
          return true;
        }

        // Check for Cypress commands
        if (step.run && this.cypressCommandPatterns.some(pattern =>
          step.run!.includes(pattern)
        )) {
          return true;
        }

        // Check for Cypress-specific paths
        if (step.with && (
          JSON.stringify(step.with).includes('cypress/') ||
          JSON.stringify(step.with).includes('cypress-')
        )) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Convert a Cypress workflow to Playwright
   */
  async convertWorkflow(
    workflow: WorkflowFile,
    options: WorkflowConversionOptions = {}
  ): Promise<WorkflowFile> {
    const convertedWorkflow: WorkflowFile = {
      name: workflow.name?.replace(/cypress/gi, 'Playwright') || 'Playwright Tests',
      on: workflow.on,
      jobs: {},
      env: workflow.env
    };

    let totalStepsConverted = 0;
    const browsersConverted: string[] = [];
    const environmentVariablesModified: string[] = [];

    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      const convertedJobName = jobName.replace(/cypress/gi, 'playwright');
      const convertedJob = await this.convertJob(job, options);

      convertedWorkflow.jobs[convertedJobName] = convertedJob;
      totalStepsConverted += convertedJob.steps.length;

      // Track converted browsers
      if (convertedJob.strategy?.matrix?.browser) {
        browsersConverted.push(...convertedJob.strategy.matrix.browser);
      }
    }

    return convertedWorkflow;
  }

  /**
   * Convert a single job from Cypress to Playwright
   */
  private async convertJob(
    job: Job,
    options: WorkflowConversionOptions
  ): Promise<Job> {
    const convertedJob: Job = {
      'runs-on': job['runs-on'],
      steps: []
    };

    // Convert strategy and matrix
    if (job.strategy) {
      convertedJob.strategy = { ...job.strategy };

      if (job.strategy.matrix) {
        convertedJob.strategy.matrix = { ...job.strategy.matrix };

        // Convert browser matrix
        if (job.strategy.matrix.browser) {
          convertedJob.strategy.matrix.browser = job.strategy.matrix.browser.map(
            (browser: string) => this.browserMapping[browser.toLowerCase()] || 'chromium'
          );

          // Remove duplicates
          convertedJob.strategy.matrix.browser = [
            ...new Set(convertedJob.strategy.matrix.browser)
          ];
        }

        // Add sharding if enabled
        if (options.enableSharding && options.shardCount) {
          convertedJob.strategy.matrix.shard = Array.from(
            { length: options.shardCount },
            (_, i) => i + 1
          );
        }
      }
    }

    // Convert environment variables
    if (job.env) {
      convertedJob.env = this.convertEnvironmentVariables(job.env, options);
    }

    // Convert steps
    for (const step of job.steps) {
      const convertedSteps = await this.convertStep(step, options);
      convertedJob.steps.push(...convertedSteps);
    }

    return convertedJob;
  }

  /**
   * Convert environment variables
   */
  private convertEnvironmentVariables(
    env: { [key: string]: string },
    options: WorkflowConversionOptions
  ): { [key: string]: string } {
    const convertedEnv: { [key: string]: string } = {};

    for (const [key, value] of Object.entries(env)) {
      // Skip Cypress-specific environment variables
      if (key.startsWith('CYPRESS_')) {
        continue;
      }

      convertedEnv[key] = value;
    }

    // Add Playwright-specific environment variables
    if (options.addPlaywrightEnvVars) {
      convertedEnv.PLAYWRIGHT_HTML_REPORT = 'playwright-report';
      convertedEnv.PLAYWRIGHT_JUNIT_OUTPUT_NAME = 'results.xml';
    }

    return convertedEnv;
  }

  /**
   * Convert a single step from Cypress to Playwright
   */
  private async convertStep(
    step: Step,
    options: WorkflowConversionOptions
  ): Promise<Step[]> {
    // If this is a Cypress GitHub action, replace with Playwright steps
    if (step.uses && this.cypressActionPatterns.some(pattern =>
      step.uses!.includes(pattern)
    )) {
      return this.convertCypressActionStep(step, options);
    }

    // If this is a Cypress command, convert to Playwright command
    if (step.run && this.cypressCommandPatterns.some(pattern =>
      step.run!.includes(pattern)
    )) {
      return [this.convertCypressCommandStep(step, options)];
    }

    // If this is an artifact upload step, convert paths
    if (step.uses?.includes('upload-artifact') && step.with) {
      return [this.convertArtifactStep(step)];
    }

    // Return step as-is if no conversion needed
    return [step];
  }

  /**
   * Convert Cypress GitHub action to Playwright steps
   */
  private convertCypressActionStep(
    step: Step,
    options: WorkflowConversionOptions
  ): Step[] {
    const steps: Step[] = [];

    // Add Playwright installation step
    steps.push({
      name: 'Install Playwright',
      run: 'npx playwright install --with-deps'
    });

    // Create Playwright test command
    let playwrightCommand = 'npx playwright test';

    // Add browser project if matrix is used
    if (step.with?.browser || options.enableSharding) {
      playwrightCommand += ' --project=${{ matrix.browser }}';
    }

    // Add sharding if enabled
    if (options.enableSharding) {
      playwrightCommand += ' --shard=${{ matrix.shard }}/${{ strategy.job-total }}';
    }

    // Convert environment variables
    const convertedEnv = step.env ?
      this.convertEnvironmentVariables(step.env, options) : undefined;

    steps.push({
      name: 'Run Playwright tests',
      run: playwrightCommand,
      env: convertedEnv
    });

    return steps;
  }

  /**
   * Convert Cypress command step to Playwright
   */
  private convertCypressCommandStep(
    step: Step,
    options: WorkflowConversionOptions
  ): Step {
    let command = step.run!;

    // Replace Cypress commands with Playwright equivalents
    command = command.replace(/cypress run/g, 'playwright test');
    command = command.replace(/npm run cy:run/g, 'npm run test:playwright');
    command = command.replace(/yarn cy:run/g, 'yarn test:playwright');
    command = command.replace(/npx cypress run/g, 'npx playwright test');

    // Convert browser flags
    command = command.replace(/--browser chrome/g, '--project chromium');
    command = command.replace(/--browser firefox/g, '--project firefox');
    command = command.replace(/--browser edge/g, '--project webkit');

    return {
      ...step,
      name: step.name.replace(/cypress/gi, 'Playwright'),
      run: command
    };
  }

  /**
   * Convert artifact upload step for Playwright
   */
  private convertArtifactStep(step: Step): Step {
    const convertedStep: Step = { ...step };

    if (step.with) {
      convertedStep.with = { ...step.with };

      // Convert Cypress paths to Playwright paths
      if (step.with.path) {
        let path = step.with.path;

        if (path.includes('cypress/screenshots')) {
          convertedStep.with.path = 'test-results/';
          convertedStep.name = step.name.replace(/screenshot/gi, 'trace');
          if (step.with.name) {
            convertedStep.with.name = step.with.name.toString().replace(/screenshot/gi, 'traces');
          }
        } else if (path.includes('cypress/videos')) {
          convertedStep.with.path = 'playwright-report/';
          convertedStep.name = step.name.replace(/video/gi, 'test results');
          if (step.with.name) {
            convertedStep.with.name = step.with.name.toString().replace(/video/gi, 'report');
          }
        }
      }
    }

    return convertedStep;
  }

  /**
   * Generate YAML content for converted workflow
   */
  generateWorkflowYaml(workflow: WorkflowFile): string {
    return yaml.dump(workflow, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false
    });
  }

  /**
   * Write converted workflow to file
   */
  async writeConvertedWorkflow(
    workflowContent: string,
    outputPath: string,
    fileName: string
  ): Promise<void> {
    const outputDir = path.join(outputPath, '.github/workflows');
    await fs.ensureDir(outputDir);

    const outputFile = path.join(outputDir, fileName);
    fs.writeFileSync(outputFile, workflowContent, 'utf8');
  }

  /**
   * Convert all GitHub Actions workflows in a project
   */
  async convertGitHubActionsWorkflows(
    projectPath: string,
    outputPath: string,
    options: WorkflowConversionOptions = {}
  ): Promise<GitHubActionsConversionResult> {
    const startTime = Date.now();
    const result: GitHubActionsConversionResult = {
      success: true,
      convertedWorkflows: [],
      summary: {
        totalWorkflowsFound: 0,
        workflowsConverted: 0,
        workflowsSkipped: 0,
        conversionTimeMs: 0
      },
      warnings: [],
      errors: []
    };

    try {
      // Detect workflow files
      const workflowFiles = await this.detectWorkflowFiles(projectPath);
      result.summary.totalWorkflowsFound = workflowFiles.length;

      if (workflowFiles.length === 0) {
        result.warnings.push('No GitHub Actions workflow files found');
        return result;
      }

      // Convert each workflow file
      for (const workflowFile of workflowFiles) {
        try {
          const workflow = await this.parseWorkflowFile(workflowFile);

          // Skip non-Cypress workflows
          if (!this.isCypressWorkflow(workflow)) {
            result.summary.workflowsSkipped++;
            result.warnings.push(
              `Skipped ${path.basename(workflowFile)} - not a Cypress workflow`
            );
            continue;
          }

          // Convert workflow
          const convertedWorkflow = await this.convertWorkflow(workflow, options);
          const workflowYaml = this.generateWorkflowYaml(convertedWorkflow);

          // Generate output filename
          const originalName = path.basename(workflowFile);
          const outputName = originalName.replace(/cypress/gi, 'playwright');

          // Write converted workflow
          await this.writeConvertedWorkflow(workflowYaml, outputPath, outputName);

          // Create conversion summary
          const conversionSummary: ConversionSummary = {
            originalJobs: Object.keys(workflow.jobs).length,
            convertedJobs: Object.keys(convertedWorkflow.jobs).length,
            stepsConverted: Object.values(convertedWorkflow.jobs)
              .reduce((total, job) => total + job.steps.length, 0),
            browsersConverted: this.extractBrowsersFromWorkflow(convertedWorkflow),
            environmentVariablesModified: this.extractModifiedEnvVars(workflow, convertedWorkflow)
          };

          result.convertedWorkflows.push({
            originalFile: workflowFile,
            convertedFile: path.join(outputPath, '.github/workflows', outputName),
            conversionSummary,
            warnings: [],
            errors: []
          });

          result.summary.workflowsConverted++;

        } catch (error) {
          result.errors.push(
            `Failed to convert ${path.basename(workflowFile)}: ${error}`
          );
          result.success = false;
        }
      }

      result.summary.conversionTimeMs = Date.now() - startTime;

    } catch (error) {
      result.errors.push(`Failed to convert workflows: ${error}`);
      result.success = false;
    }

    return result;
  }

  /**
   * Extract browsers from converted workflow
   */
  private extractBrowsersFromWorkflow(workflow: WorkflowFile): string[] {
    const browsers: string[] = [];

    for (const job of Object.values(workflow.jobs)) {
      if (job.strategy?.matrix?.browser) {
        browsers.push(...job.strategy.matrix.browser);
      }
    }

    return [...new Set(browsers)];
  }

  /**
   * Extract modified environment variables
   */
  private extractModifiedEnvVars(
    original: WorkflowFile,
    converted: WorkflowFile
  ): string[] {
    const modifiedVars: string[] = [];

    // Check global env
    const originalGlobalEnv = original.env || {};
    const convertedGlobalEnv = converted.env || {};

    for (const key of Object.keys(originalGlobalEnv)) {
      if (!convertedGlobalEnv[key]) {
        modifiedVars.push(`Removed global: ${key}`);
      }
    }

    for (const key of Object.keys(convertedGlobalEnv)) {
      if (!originalGlobalEnv[key]) {
        modifiedVars.push(`Added global: ${key}`);
      }
    }

    // Check job-level env (simplified for brevity)
    // In practice, you'd want to check each job's environment variables too

    return modifiedVars;
  }
}