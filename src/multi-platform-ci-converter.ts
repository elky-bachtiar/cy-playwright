import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface MultiPlatformConversionOptions {
  addPlaywrightEnvVars?: boolean;
  preserveOriginalStructure?: boolean;
  generateSharding?: boolean;
  shardCount?: number;
}

export interface PlatformConversionResult {
  platform: string;
  originalFile: string;
  convertedFile: string;
  conversionSummary: {
    jobsConverted: number;
    stepsModified: number;
    browsersConverted: string[];
    environmentVariablesModified: string[];
  };
  warnings: string[];
  errors: string[];
}

export interface MultiPlatformConversionResult {
  success: boolean;
  convertedConfigurations: PlatformConversionResult[];
  summary: {
    totalPlatformsDetected: number;
    platformsConverted: number;
    platformsSkipped: number;
    conversionTimeMs: number;
  };
  warnings: string[];
  errors: string[];
}

// Type definitions for different CI platforms
interface CircleCIConfig {
  version: string;
  orbs?: { [key: string]: string };
  jobs?: { [key: string]: any };
  workflows?: { [key: string]: any };
  commands?: { [key: string]: any };
  executors?: { [key: string]: any };
}

interface AppVeyorConfig {
  version?: string;
  image?: string | string[];
  environment?: {
    matrix?: any[];
    [key: string]: any;
  };
  install?: string[];
  before_build?: string[];
  build_script?: string[];
  test_script?: string[];
  after_test?: string[];
  artifacts?: Array<{
    path: string;
    name?: string;
    type?: string;
  }>;
  [key: string]: any;
}

interface AzurePipelinesConfig {
  trigger?: string | string[] | { [key: string]: any };
  pool?: {
    vmImage?: string;
    name?: string;
    demands?: string[];
  };
  strategy?: {
    matrix?: { [key: string]: any };
    maxParallel?: number;
  };
  variables?: { [key: string]: any };
  stages?: any[];
  jobs?: any[];
  steps?: Array<{
    task?: string;
    script?: string;
    displayName?: string;
    inputs?: { [key: string]: any };
    env?: { [key: string]: any };
    condition?: string;
    continueOnError?: boolean;
  }>;
  [key: string]: any;
}

interface TravisCIConfig {
  language?: string;
  node_js?: string | string[];
  addons?: {
    chrome?: string;
    firefox?: string;
    apt?: {
      packages?: string[];
    };
  };
  cache?: {
    directories?: string[];
    npm?: boolean;
  };
  script?: string | string[];
  before_script?: string | string[];
  after_script?: string | string[];
  env?: {
    matrix?: string[];
    global?: string[];
  };
  matrix?: {
    include?: Array<{
      env?: string;
      script?: string;
      [key: string]: any;
    }>;
  };
  [key: string]: any;
}

export class MultiPlatformCIConverter {
  private readonly browserMapping: { [key: string]: string } = {
    chrome: 'chromium',
    firefox: 'firefox',
    edge: 'webkit',
    webkit: 'webkit',
    chromium: 'chromium',
    electron: 'chromium',
    safari: 'webkit'
  };

  private readonly cypressCommandPatterns = [
    'cypress run',
    'npm run cy:run',
    'yarn cy:run',
    'npx cypress run',
    'pnpm cy:run'
  ];

  /**
   * Detect all CI platforms in the project
   */
  async detectCIPlatforms(projectPath: string): Promise<string[]> {
    const platforms: string[] = [];

    // CircleCI
    if (fs.existsSync(path.join(projectPath, '.circleci/config.yml'))) {
      platforms.push('circleci');
    }

    // AppVeyor
    if (fs.existsSync(path.join(projectPath, 'appveyor.yml')) ||
        fs.existsSync(path.join(projectPath, '.appveyor.yml'))) {
      platforms.push('appveyor');
    }

    // Azure Pipelines
    if (fs.existsSync(path.join(projectPath, 'azure-pipelines.yml')) ||
        fs.existsSync(path.join(projectPath, 'azure-pipelines.yaml')) ||
        fs.existsSync(path.join(projectPath, '.azure-pipelines.yml'))) {
      platforms.push('azure-pipelines');
    }

    // Travis CI
    if (fs.existsSync(path.join(projectPath, '.travis.yml'))) {
      platforms.push('travis');
    }

    // Jenkins
    if (fs.existsSync(path.join(projectPath, 'Jenkinsfile')) ||
        fs.existsSync(path.join(projectPath, 'jenkins/Jenkinsfile'))) {
      platforms.push('jenkins');
    }

    // GitLab CI
    if (fs.existsSync(path.join(projectPath, '.gitlab-ci.yml'))) {
      platforms.push('gitlab');
    }

    return platforms;
  }

  /**
   * Parse CircleCI configuration
   */
  async parseCircleCIConfig(filePath: string): Promise<CircleCIConfig> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = yaml.load(content) as CircleCIConfig;

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid CircleCI configuration structure');
      }

      return parsed;
    } catch (error) {
      throw new Error(`Failed to parse CircleCI config: ${error}`);
    }
  }

  /**
   * Check if CircleCI config uses Cypress
   */
  isCypressCircleCIConfig(config: CircleCIConfig): boolean {
    // Check for Cypress orb
    if (config.orbs && Object.values(config.orbs).some(orb =>
      orb.includes('cypress')
    )) {
      return true;
    }

    // Check for Cypress jobs
    if (config.jobs) {
      for (const job of Object.values(config.jobs)) {
        if (job.steps && Array.isArray(job.steps)) {
          for (const step of job.steps) {
            if (step.run && this.cypressCommandPatterns.some(pattern =>
              step.run.includes(pattern)
            )) {
              return true;
            }
          }
        }
      }
    }

    // Check workflows for Cypress jobs
    if (config.workflows) {
      for (const workflow of Object.values(config.workflows)) {
        if (workflow.jobs && Array.isArray(workflow.jobs)) {
          for (const job of workflow.jobs) {
            if (typeof job === 'object' && Object.keys(job).some(key =>
              key.includes('cypress')
            )) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Convert CircleCI configuration
   */
  async convertCircleCIConfig(
    config: CircleCIConfig,
    options: MultiPlatformConversionOptions = {}
  ): Promise<CircleCIConfig> {
    const convertedConfig: CircleCIConfig = {
      version: config.version,
      jobs: {},
      workflows: config.workflows ? { ...config.workflows } : undefined,
      commands: config.commands,
      executors: config.executors
    };

    // Remove Cypress orbs
    if (config.orbs) {
      convertedConfig.orbs = {};
      for (const [name, orb] of Object.entries(config.orbs)) {
        if (!orb.includes('cypress')) {
          convertedConfig.orbs[name] = orb;
        }
      }
    }

    // Convert jobs
    if (config.jobs) {
      for (const [jobName, job] of Object.entries(config.jobs)) {
        const convertedJobName = jobName.replace(/cypress/gi, 'playwright');
        convertedConfig.jobs![convertedJobName] = await this.convertCircleCIJob(job, options);
      }
    }

    // Convert workflow orb jobs to actual job definitions and update workflows
    if (convertedConfig.workflows) {
      for (const workflow of Object.values(convertedConfig.workflows)) {
        if (workflow.jobs && Array.isArray(workflow.jobs)) {
          const newWorkflowJobs: any[] = [];

          for (const job of workflow.jobs) {
            if (typeof job === 'string') {
              newWorkflowJobs.push(job.replace(/cypress/gi, 'playwright'));
            } else if (typeof job === 'object') {
              // Handle orb-based jobs like 'cypress/run'
              for (const [orbJob, jobConfig] of Object.entries(job)) {
                if (orbJob.startsWith('cypress/')) {
                  // Convert orb job to actual job definition
                  const config = jobConfig as any;
                  const jobName = config.name ? config.name.replace(/cypress/gi, 'playwright') : 'playwright-test';
                  convertedConfig.jobs![jobName] = await this.convertOrbJobToJobDefinition(orbJob, config, options);
                  newWorkflowJobs.push(jobName);
                } else {
                  // Regular job reference
                  const newJob: any = {};
                  const newKey = orbJob.includes('cypress') ? orbJob.replace(/cypress/gi, 'playwright') : orbJob;
                  newJob[newKey] = jobConfig;
                  newWorkflowJobs.push(newJob);
                }
              }
            } else {
              newWorkflowJobs.push(job);
            }
          }

          workflow.jobs = newWorkflowJobs;
        }
      }
    }

    return convertedConfig;
  }

  /**
   * Convert orb-based job to actual job definition
   */
  private async convertOrbJobToJobDefinition(orbJob: string, jobConfig: any, options: MultiPlatformConversionOptions): Promise<any> {
    const convertedJob: any = {
      docker: [{ image: 'mcr.microsoft.com/playwright:v1.40.0-focal' }],
      steps: []
    };

    // Add checkout step
    convertedJob.steps.push('checkout');

    // Install dependencies
    convertedJob.steps.push({
      name: 'Install dependencies',
      run: 'npm ci'
    });

    // Install Playwright browsers
    convertedJob.steps.push({
      name: 'Install Playwright browsers',
      run: 'npx playwright install --with-deps'
    });

    // Convert browser configuration
    let browserProject = 'chromium';
    if (jobConfig.browser) {
      browserProject = jobConfig.browser === 'chrome' ? 'chromium' : jobConfig.browser;
    }

    // Add test execution step
    convertedJob.steps.push({
      name: 'Run Playwright tests',
      run: `npx playwright test --project ${browserProject}`
    });

    // Add artifact storage if record is enabled (CircleCI style)
    if (jobConfig.record) {
      convertedJob.steps.push({
        name: 'Store test results',
        'store_artifacts': {
          path: 'test-results/',
          destination: `playwright-results-${browserProject}`
        }
      });
    }

    // Copy over any environment variables
    if (jobConfig.environment) {
      convertedJob.environment = this.convertEnvironmentVariables(jobConfig.environment, options);
    }

    return convertedJob;
  }

  /**
   * Convert CircleCI job
   */
  private async convertCircleCIJob(job: any, options: MultiPlatformConversionOptions): Promise<any> {
    const convertedJob = { ...job };

    // Convert steps
    if (job.steps && Array.isArray(job.steps)) {
      convertedJob.steps = [];

      for (const step of job.steps) {
        if (typeof step === 'object' && step.run) {
          // Convert Cypress commands
          if (this.cypressCommandPatterns.some(pattern => step.run.includes(pattern))) {
            convertedJob.steps.push(...this.convertCypressStepsToPlaywright(step, options));
          } else {
            convertedJob.steps.push(step);
          }
        } else {
          convertedJob.steps.push(step);
        }
      }
    }

    // Convert environment variables
    if (job.environment) {
      convertedJob.environment = this.convertEnvironmentVariables(job.environment, options);
    }

    return convertedJob;
  }

  /**
   * Parse AppVeyor configuration
   */
  async parseAppVeyorConfig(filePath: string): Promise<AppVeyorConfig> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = yaml.load(content) as AppVeyorConfig;

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid AppVeyor configuration structure');
      }

      return parsed;
    } catch (error) {
      throw new Error(`Failed to parse AppVeyor config: ${error}`);
    }
  }

  /**
   * Check if AppVeyor config uses Cypress
   */
  isCypressAppVeyorConfig(config: AppVeyorConfig): boolean {
    const scripts = [
      ...(config.test_script || []),
      ...(config.build_script || []),
      ...(config.before_build || [])
    ];

    return scripts.some(script =>
      this.cypressCommandPatterns.some(pattern => script.includes(pattern))
    );
  }

  /**
   * Convert AppVeyor configuration
   */
  async convertAppVeyorConfig(
    config: AppVeyorConfig,
    options: MultiPlatformConversionOptions = {}
  ): Promise<AppVeyorConfig> {
    const convertedConfig: AppVeyorConfig = { ...config };

    // Convert test scripts
    if (config.test_script) {
      convertedConfig.test_script = config.test_script.map(script =>
        this.convertScriptCommand(script, options)
      );

      // Add Playwright installation
      if (!convertedConfig.before_build) {
        convertedConfig.before_build = [];
      }
      convertedConfig.before_build.push('npx playwright install --with-deps');
    }

    // Convert environment matrix
    if (config.environment?.matrix) {
      convertedConfig.environment = { ...config.environment };
      convertedConfig.environment.matrix = config.environment.matrix.map(env => {
        const convertedEnv = { ...env };
        if (env.browser) {
          convertedEnv.browser = this.browserMapping[env.browser.toLowerCase()] || env.browser;
        }
        return this.convertEnvironmentVariables(convertedEnv, options);
      });
    }

    // Convert artifacts
    if (config.artifacts) {
      convertedConfig.artifacts = config.artifacts.map(artifact => {
        const convertedArtifact = { ...artifact };

        if (artifact.path.includes('cypress/screenshots')) {
          convertedArtifact.path = 'test-results';
          convertedArtifact.name = artifact.name?.replace(/screenshot/gi, 'traces') || 'traces';
        } else if (artifact.path.includes('cypress/videos')) {
          convertedArtifact.path = 'playwright-report';
          convertedArtifact.name = artifact.name?.replace(/video/gi, 'report') || 'report';
        }

        return convertedArtifact;
      });
    }

    return convertedConfig;
  }

  /**
   * Parse Azure Pipelines configuration
   */
  async parseAzurePipelinesConfig(filePath: string): Promise<AzurePipelinesConfig> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = yaml.load(content) as AzurePipelinesConfig;

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid Azure Pipelines configuration structure');
      }

      return parsed;
    } catch (error) {
      throw new Error(`Failed to parse Azure Pipelines config: ${error}`);
    }
  }

  /**
   * Check if Azure Pipelines config uses Cypress
   */
  isCypressAzurePipelinesConfig(config: AzurePipelinesConfig): boolean {
    if (config.steps) {
      return config.steps.some(step =>
        step.script && this.cypressCommandPatterns.some(pattern =>
          step.script!.includes(pattern)
        )
      );
    }

    if (config.jobs) {
      return config.jobs.some(job =>
        job.steps && job.steps.some((step: any) =>
          step.script && this.cypressCommandPatterns.some((pattern: string) =>
            step.script.includes(pattern)
          )
        )
      );
    }

    return false;
  }

  /**
   * Convert Azure Pipelines configuration
   */
  async convertAzurePipelinesConfig(
    config: AzurePipelinesConfig,
    options: MultiPlatformConversionOptions = {}
  ): Promise<AzurePipelinesConfig> {
    const convertedConfig: AzurePipelinesConfig = { ...config };

    // Convert strategy matrix
    if (config.strategy?.matrix) {
      convertedConfig.strategy = { ...config.strategy };
      convertedConfig.strategy.matrix = {};

      for (const [key, value] of Object.entries(config.strategy.matrix)) {
        const newKey = key.replace(/chrome/gi, 'chromium');
        const convertedValue = { ...value };

        if (convertedValue.browser) {
          convertedValue.browser = this.browserMapping[convertedValue.browser.toLowerCase()] ||
            convertedValue.browser;
        }

        convertedConfig.strategy.matrix[newKey] = this.convertEnvironmentVariables(
          convertedValue,
          options
        );
      }
    }

    // Convert steps
    if (config.steps) {
      convertedConfig.steps = [];

      // Add Playwright installation step first
      const installStep = {
        script: 'npx playwright install --with-deps',
        displayName: 'Install Playwright'
      };
      convertedConfig.steps.push(installStep);

      for (const step of config.steps) {
        if (step.script && this.cypressCommandPatterns.some(pattern =>
          step.script!.includes(pattern)
        )) {
          const convertedStep = {
            ...step,
            script: this.convertScriptCommand(step.script, options),
            displayName: step.displayName?.replace(/cypress/gi, 'Playwright') || 'Run Playwright tests'
          };

          if (options.addPlaywrightEnvVars) {
            convertedStep.env = {
              ...step.env,
              PLAYWRIGHT_HTML_REPORT: 'playwright-report',
              PLAYWRIGHT_JUNIT_OUTPUT_NAME: 'results.xml'
            };
          }

          convertedConfig.steps.push(convertedStep);
        } else if (step.task === 'PublishTestResults@2') {
          // Convert test result publishing
          const convertedStep = {
            ...step,
            inputs: {
              ...step.inputs,
              testResultsFiles: 'test-results/results.xml'
            }
          };
          convertedConfig.steps.push(convertedStep);
        } else {
          convertedConfig.steps.push(step);
        }
      }
    }

    return convertedConfig;
  }

  /**
   * Convert script command from Cypress to Playwright
   */
  private convertScriptCommand(
    script: string,
    options: MultiPlatformConversionOptions
  ): string {
    let convertedScript = script;

    // Convert Cypress commands to Playwright
    convertedScript = convertedScript.replace(/cypress run/g, 'playwright test');
    convertedScript = convertedScript.replace(/npm run cy:run/g, 'npx playwright test');
    convertedScript = convertedScript.replace(/yarn cy:run/g, 'npx playwright test');
    convertedScript = convertedScript.replace(/npx cypress run/g, 'npx playwright test');

    // Convert browser flags
    convertedScript = convertedScript.replace(/--browser chrome/g, '--project chromium');
    convertedScript = convertedScript.replace(/--browser firefox/g, '--project firefox');
    convertedScript = convertedScript.replace(/--browser edge/g, '--project webkit');

    // Handle environment variable browser references
    convertedScript = convertedScript.replace(/--browser \$\{browser\}/g, '--project ${browser}');
    convertedScript = convertedScript.replace(/--browser %browser%/g, '--project %browser%');
    convertedScript = convertedScript.replace(/--browser \$\(browser\)/g, '--project $(browser)');

    return convertedScript;
  }

  /**
   * Convert Cypress steps to Playwright steps
   */
  private convertCypressStepsToPlaywright(
    step: any,
    options: MultiPlatformConversionOptions
  ): any[] {
    const steps = [];

    // Add Playwright installation if not already present
    steps.push({
      run: 'npx playwright install --with-deps',
      name: 'Install Playwright'
    });

    // Convert the main test step
    const convertedStep = {
      ...step,
      run: this.convertScriptCommand(step.run, options),
      name: step.name?.replace(/cypress/gi, 'Playwright') || 'Run Playwright tests'
    };

    if (step.environment) {
      convertedStep.environment = this.convertEnvironmentVariables(step.environment, options);
    }

    steps.push(convertedStep);

    return steps;
  }

  /**
   * Convert environment variables
   */
  private convertEnvironmentVariables(
    env: { [key: string]: any },
    options: MultiPlatformConversionOptions
  ): { [key: string]: any } {
    const convertedEnv: { [key: string]: any } = {};

    for (const [key, value] of Object.entries(env)) {
      // Skip Cypress-specific environment variables
      if (key.startsWith('CYPRESS_')) {
        continue;
      }

      // Convert browser values
      if (key.toLowerCase() === 'browser' && typeof value === 'string') {
        convertedEnv[key] = this.browserMapping[value.toLowerCase()] || value;
      } else {
        convertedEnv[key] = value;
      }
    }

    // Add Playwright-specific environment variables
    if (options.addPlaywrightEnvVars) {
      convertedEnv.PLAYWRIGHT_HTML_REPORT = 'playwright-report';
      convertedEnv.PLAYWRIGHT_JUNIT_OUTPUT_NAME = 'results.xml';
    }

    return convertedEnv;
  }

  /**
   * Convert all CI platforms in a project
   */
  async convertAllCIPlatforms(
    projectPath: string,
    outputPath: string,
    options: MultiPlatformConversionOptions = {}
  ): Promise<MultiPlatformConversionResult> {
    const startTime = Date.now();
    const result: MultiPlatformConversionResult = {
      success: true,
      convertedConfigurations: [],
      summary: {
        totalPlatformsDetected: 0,
        platformsConverted: 0,
        platformsSkipped: 0,
        conversionTimeMs: 0
      },
      warnings: [],
      errors: []
    };

    try {
      // Detect CI platforms
      const platforms = await this.detectCIPlatforms(projectPath);
      result.summary.totalPlatformsDetected = platforms.length;

      if (platforms.length === 0) {
        result.warnings.push('No CI platform configurations found');
        return result;
      }

      // Convert each platform
      for (const platform of platforms) {
        try {
          const platformResult = await this.convertPlatform(
            platform,
            projectPath,
            outputPath,
            options
          );

          result.convertedConfigurations.push(platformResult);
          result.summary.platformsConverted++;

        } catch (error) {
          result.errors.push(`Failed to convert ${platform}: ${error}`);
          result.summary.platformsSkipped++;
          result.success = false;
        }
      }

      result.summary.conversionTimeMs = Date.now() - startTime;

    } catch (error) {
      result.errors.push(`Failed to convert CI platforms: ${error}`);
      result.success = false;
    }

    return result;
  }

  /**
   * Convert a specific platform
   */
  private async convertPlatform(
    platform: string,
    projectPath: string,
    outputPath: string,
    options: MultiPlatformConversionOptions
  ): Promise<PlatformConversionResult> {
    const result: PlatformConversionResult = {
      platform,
      originalFile: '',
      convertedFile: '',
      conversionSummary: {
        jobsConverted: 0,
        stepsModified: 0,
        browsersConverted: [],
        environmentVariablesModified: []
      },
      warnings: [],
      errors: []
    };

    switch (platform) {
      case 'circleci':
        return await this.convertCircleCIPlatform(projectPath, outputPath, options, result);
      case 'appveyor':
        return await this.convertAppVeyorPlatform(projectPath, outputPath, options, result);
      case 'azure-pipelines':
        return await this.convertAzurePipelinesPlatform(projectPath, outputPath, options, result);
      case 'travis':
        return await this.convertTravisCIPlatform(projectPath, outputPath, options, result);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Convert CircleCI platform
   */
  private async convertCircleCIPlatform(
    projectPath: string,
    outputPath: string,
    options: MultiPlatformConversionOptions,
    result: PlatformConversionResult
  ): Promise<PlatformConversionResult> {
    const configPath = path.join(projectPath, '.circleci/config.yml');
    result.originalFile = configPath;

    const config = await this.parseCircleCIConfig(configPath);

    if (!this.isCypressCircleCIConfig(config)) {
      result.warnings.push('CircleCI configuration does not use Cypress');
      return result;
    }

    const convertedConfig = await this.convertCircleCIConfig(config, options);
    const yamlContent = yaml.dump(convertedConfig, { indent: 2 });

    const outputFile = path.join(outputPath, '.circleci/config.yml');
    await fs.ensureDir(path.dirname(outputFile));
    fs.writeFileSync(outputFile, yamlContent, 'utf8');

    result.convertedFile = outputFile;
    result.conversionSummary.jobsConverted = Object.keys(convertedConfig.jobs || {}).length;

    return result;
  }

  /**
   * Convert AppVeyor platform
   */
  private async convertAppVeyorPlatform(
    projectPath: string,
    outputPath: string,
    options: MultiPlatformConversionOptions,
    result: PlatformConversionResult
  ): Promise<PlatformConversionResult> {
    const configPath = path.join(projectPath, 'appveyor.yml');
    result.originalFile = configPath;

    if (!fs.existsSync(configPath)) {
      const altPath = path.join(projectPath, '.appveyor.yml');
      if (fs.existsSync(altPath)) {
        result.originalFile = altPath;
      }
    }

    const config = await this.parseAppVeyorConfig(result.originalFile);

    if (!this.isCypressAppVeyorConfig(config)) {
      result.warnings.push('AppVeyor configuration does not use Cypress');
      return result;
    }

    const convertedConfig = await this.convertAppVeyorConfig(config, options);
    const yamlContent = yaml.dump(convertedConfig, { indent: 2 });

    const outputFile = path.join(outputPath, 'appveyor.yml');
    fs.writeFileSync(outputFile, yamlContent, 'utf8');

    result.convertedFile = outputFile;
    result.conversionSummary.jobsConverted = 1; // AppVeyor typically has one job

    return result;
  }

  /**
   * Convert Azure Pipelines platform
   */
  private async convertAzurePipelinesPlatform(
    projectPath: string,
    outputPath: string,
    options: MultiPlatformConversionOptions,
    result: PlatformConversionResult
  ): Promise<PlatformConversionResult> {
    const possiblePaths = [
      'azure-pipelines.yml',
      'azure-pipelines.yaml',
      '.azure-pipelines.yml'
    ];

    let configPath = '';
    for (const possiblePath of possiblePaths) {
      const fullPath = path.join(projectPath, possiblePath);
      if (fs.existsSync(fullPath)) {
        configPath = fullPath;
        break;
      }
    }

    if (!configPath) {
      throw new Error('Azure Pipelines configuration file not found');
    }

    result.originalFile = configPath;

    const config = await this.parseAzurePipelinesConfig(configPath);

    if (!this.isCypressAzurePipelinesConfig(config)) {
      result.warnings.push('Azure Pipelines configuration does not use Cypress');
      return result;
    }

    const convertedConfig = await this.convertAzurePipelinesConfig(config, options);
    const yamlContent = yaml.dump(convertedConfig, { indent: 2 });

    const outputFile = path.join(outputPath, 'azure-pipelines.yml');
    fs.writeFileSync(outputFile, yamlContent, 'utf8');

    result.convertedFile = outputFile;
    result.conversionSummary.jobsConverted = config.jobs?.length || 1;

    return result;
  }

  /**
   * Convert Travis CI platform (basic implementation)
   */
  private async convertTravisCIPlatform(
    projectPath: string,
    outputPath: string,
    options: MultiPlatformConversionOptions,
    result: PlatformConversionResult
  ): Promise<PlatformConversionResult> {
    const configPath = path.join(projectPath, '.travis.yml');
    result.originalFile = configPath;

    // Travis CI conversion is more complex and platform-specific
    // This is a simplified implementation
    result.warnings.push('Travis CI conversion requires manual review');
    result.conversionSummary.jobsConverted = 0;

    return result;
  }
}