import { Logger } from '../utils/logger';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface CIMigrationAnalysisResults {
  currentCIConfig: {
    detected: boolean;
    platform: string;
    configFile: string;
  };
  migrationRequirements: {
    newDependencies: string[];
    configChanges: string[];
    scriptUpdates: string[];
  };
  estimatedMigrationTime: string;
  recommendations: string[];
  risksAndChallenges: string[];
}

export interface CIPlatformConfig {
  name: string;
  configFiles: string[];
  detector: (content: string) => boolean;
  migrationSteps: string[];
  dependencies: string[];
  risks: string[];
}

export class CIMigrationAnalyzer {
  private logger = new Logger('CIMigrationAnalyzer');

  // Supported CI platforms and their configurations
  private readonly ciPlatforms: CIPlatformConfig[] = [
    {
      name: 'GitHub Actions',
      configFiles: ['.github/workflows/*.yml', '.github/workflows/*.yaml'],
      detector: (content: string) => content.includes('cypress') || content.includes('cy:'),
      migrationSteps: [
        'Update workflow file to use Playwright actions',
        'Replace cypress/github-action with playwright-github-action',
        'Update test commands from npm run cy: to npx playwright test',
        'Configure browser installation step',
        'Update artifact collection paths'
      ],
      dependencies: ['playwright', '@playwright/test'],
      risks: [
        'Workflow execution time changes',
        'Different artifact structure',
        'Browser installation requirements'
      ]
    },
    {
      name: 'GitLab CI',
      configFiles: ['.gitlab-ci.yml'],
      detector: (content: string) => content.includes('cypress') || content.includes('cy:'),
      migrationSteps: [
        'Update .gitlab-ci.yml test job configuration',
        'Replace Cypress Docker image with Playwright image',
        'Update test execution commands',
        'Configure browser dependencies',
        'Update artifact and cache configurations'
      ],
      dependencies: ['playwright', '@playwright/test'],
      risks: [
        'Docker image size differences',
        'Pipeline execution time variations',
        'Different caching strategies required'
      ]
    },
    {
      name: 'Jenkins',
      configFiles: ['Jenkinsfile', 'jenkins.yml'],
      detector: (content: string) => content.includes('cypress') || content.includes('cy:'),
      migrationSteps: [
        'Update Jenkinsfile test stage',
        'Configure Node.js and browser dependencies',
        'Update test execution commands',
        'Configure test result publishing',
        'Update artifact archiving'
      ],
      dependencies: ['playwright', '@playwright/test'],
      risks: [
        'Node environment setup changes',
        'Browser installation on Jenkins agents',
        'Different test result formats'
      ]
    },
    {
      name: 'Azure DevOps',
      configFiles: ['azure-pipelines.yml', '.azure-pipelines.yml'],
      detector: (content: string) => content.includes('cypress') || content.includes('cy:'),
      migrationSteps: [
        'Update azure-pipelines.yml configuration',
        'Replace Cypress-specific tasks with Playwright tasks',
        'Update test execution commands',
        'Configure browser installation',
        'Update test result publishing'
      ],
      dependencies: ['playwright', '@playwright/test'],
      risks: [
        'Agent capability requirements',
        'Task marketplace dependencies',
        'Test result format differences'
      ]
    },
    {
      name: 'CircleCI',
      configFiles: ['.circleci/config.yml'],
      detector: (content: string) => content.includes('cypress') || content.includes('cy:'),
      migrationSteps: [
        'Update .circleci/config.yml job configuration',
        'Replace Cypress orb with custom Playwright setup',
        'Update test execution commands',
        'Configure browser dependencies',
        'Update artifact storage'
      ],
      dependencies: ['playwright', '@playwright/test'],
      risks: [
        'Orb availability and maintenance',
        'Executor environment differences',
        'Credit usage variations'
      ]
    }
  ];

  async analyzeMigration(projectPath: string): Promise<CIMigrationAnalysisResults> {
    this.logger.debug(`Analyzing CI migration requirements for: ${projectPath}`);

    const currentConfig = await this.detectCurrentCIConfig(projectPath);
    const migrationRequirements = await this.analyzeMigrationRequirements(projectPath, currentConfig);
    const estimatedTime = this.estimateMigrationTime(currentConfig, migrationRequirements);
    const recommendations = this.generateRecommendations(currentConfig, migrationRequirements);
    const risks = this.assessRisksAndChallenges(currentConfig);

    return {
      currentCIConfig: currentConfig,
      migrationRequirements,
      estimatedMigrationTime: estimatedTime,
      recommendations,
      risksAndChallenges: risks
    };
  }

  async detectCurrentCIConfig(projectPath: string): Promise<{
    detected: boolean;
    platform: string;
    configFile: string;
  }> {
    this.logger.debug('Detecting current CI configuration');

    for (const platform of this.ciPlatforms) {
      for (const configPattern of platform.configFiles) {
        const configFiles = await this.findConfigFiles(projectPath, configPattern);

        for (const configFile of configFiles) {
          try {
            const content = await fs.readFile(configFile, 'utf8');
            if (platform.detector(content)) {
              return {
                detected: true,
                platform: platform.name,
                configFile: path.relative(projectPath, configFile)
              };
            }
          } catch (error) {
            this.logger.warn(`Could not read config file: ${configFile}`, error);
          }
        }
      }
    }

    return {
      detected: false,
      platform: 'unknown',
      configFile: ''
    };
  }

  async generateMigrationPlan(projectPath: string, targetPlatform?: string): Promise<{
    steps: string[];
    configTemplate: string;
    estimatedTime: string;
  }> {
    this.logger.debug(`Generating migration plan for target platform: ${targetPlatform || 'auto-detected'}`);

    const currentConfig = await this.detectCurrentCIConfig(projectPath);
    const platform = targetPlatform || currentConfig.platform;

    const platformConfig = this.ciPlatforms.find(p => p.name === platform);
    if (!platformConfig) {
      throw new Error(`Unsupported CI platform: ${platform}`);
    }

    const configTemplate = await this.generateConfigTemplate(platform, projectPath);
    const estimatedTime = this.estimateMigrationTime(currentConfig, {
      newDependencies: platformConfig.dependencies,
      configChanges: platformConfig.migrationSteps,
      scriptUpdates: []
    });

    return {
      steps: platformConfig.migrationSteps,
      configTemplate,
      estimatedTime
    };
  }

  private async analyzeMigrationRequirements(
    projectPath: string,
    currentConfig: { platform: string; configFile: string }
  ): Promise<{
    newDependencies: string[];
    configChanges: string[];
    scriptUpdates: string[];
  }> {
    const platform = this.ciPlatforms.find(p => p.name === currentConfig.platform);
    const packageJsonPath = path.join(projectPath, 'package.json');

    let scriptUpdates: string[] = [];

    // Analyze package.json scripts
    if (await fs.pathExists(packageJsonPath)) {
      try {
        const packageJson = await fs.readJson(packageJsonPath);
        if (packageJson.scripts) {
          Object.entries(packageJson.scripts).forEach(([scriptName, scriptCommand]) => {
            if (typeof scriptCommand === 'string' && scriptCommand.includes('cypress')) {
              scriptUpdates.push(`Update "${scriptName}" script to use Playwright commands`);
            }
          });
        }
      } catch (error) {
        this.logger.warn('Could not analyze package.json scripts', error);
      }
    }

    return {
      newDependencies: platform?.dependencies || ['playwright', '@playwright/test'],
      configChanges: platform?.migrationSteps || [
        'Update CI configuration to use Playwright',
        'Configure browser installation',
        'Update test execution commands'
      ],
      scriptUpdates
    };
  }

  private estimateMigrationTime(
    currentConfig: { platform: string },
    requirements: { configChanges: string[]; scriptUpdates: string[] }
  ): string {
    let baseHours = 2; // Minimum time for basic migration

    // Add time based on platform complexity
    const platformComplexity: { [key: string]: number } = {
      'GitHub Actions': 1,
      'GitLab CI': 1.5,
      'Jenkins': 2,
      'Azure DevOps': 1.5,
      'CircleCI': 1.5,
      'unknown': 3
    };

    baseHours += platformComplexity[currentConfig.platform] || 3;

    // Add time for configuration changes
    baseHours += requirements.configChanges.length * 0.5;

    // Add time for script updates
    baseHours += requirements.scriptUpdates.length * 0.25;

    if (baseHours < 1) return 'Less than 1 hour';
    if (baseHours < 4) return `${Math.ceil(baseHours)} hours`;
    if (baseHours < 8) return 'Half day';
    if (baseHours < 16) return '1 day';
    return `${Math.ceil(baseHours / 8)} days`;
  }

  private generateRecommendations(
    currentConfig: { platform: string; detected: boolean },
    requirements: { newDependencies: string[]; configChanges: string[] }
  ): string[] {
    const recommendations: string[] = [];

    if (!currentConfig.detected) {
      recommendations.push('Set up CI/CD pipeline before migrating to Playwright');
      recommendations.push('Consider using GitHub Actions for new projects');
      return recommendations;
    }

    // Platform-specific recommendations
    switch (currentConfig.platform) {
      case 'GitHub Actions':
        recommendations.push('Use microsoft/playwright-github-action for easy setup');
        recommendations.push('Configure matrix strategy for multi-browser testing');
        recommendations.push('Use upload-artifact action for test reports and videos');
        break;

      case 'GitLab CI':
        recommendations.push('Use official Playwright Docker image');
        recommendations.push('Configure job artifacts for test reports');
        recommendations.push('Consider using GitLab Pages for test report hosting');
        break;

      case 'Jenkins':
        recommendations.push('Ensure Jenkins agents have Node.js and browser dependencies');
        recommendations.push('Use Jenkins Pipeline for complex workflows');
        recommendations.push('Configure post-build actions for test reports');
        break;

      case 'Azure DevOps':
        recommendations.push('Use Azure DevOps extension for Playwright');
        recommendations.push('Configure test result publishing task');
        recommendations.push('Use Azure Artifacts for dependency caching');
        break;

      case 'CircleCI':
        recommendations.push('Create custom Docker image with Playwright pre-installed');
        recommendations.push('Use CircleCI parallelism for faster test execution');
        recommendations.push('Configure artifact storage for test outputs');
        break;
    }

    // General recommendations
    recommendations.push('Test the migration in a separate branch first');
    recommendations.push('Set up monitoring for test execution times');
    recommendations.push('Document the migration process for team reference');

    return recommendations;
  }

  private assessRisksAndChallenges(currentConfig: { platform: string; detected: boolean }): string[] {
    const risks: string[] = [];

    if (!currentConfig.detected) {
      risks.push('No existing CI configuration detected - full setup required');
      return risks;
    }

    const platform = this.ciPlatforms.find(p => p.name === currentConfig.platform);
    if (platform) {
      risks.push(...platform.risks);
    }

    // Common risks
    risks.push(
      'Test execution time differences may affect pipeline duration',
      'Team training required for new testing framework',
      'Potential temporary reduction in test coverage during migration',
      'Different debugging and troubleshooting processes'
    );

    return risks;
  }

  private async findConfigFiles(projectPath: string, pattern: string): Promise<string[]> {
    const files: string[] = [];

    if (pattern.includes('*')) {
      // Handle glob patterns
      const [dir, filePattern] = pattern.split('/').reduce((acc, part, index, arr) => {
        if (part.includes('*')) {
          return [arr.slice(0, index).join('/'), part];
        }
        return acc;
      }, ['', '']);

      const searchDir = path.join(projectPath, dir);
      if (await fs.pathExists(searchDir)) {
        const entries = await fs.readdir(searchDir);
        const regex = new RegExp(filePattern.replace('*', '.*'));

        for (const entry of entries) {
          if (regex.test(entry)) {
            files.push(path.join(searchDir, entry));
          }
        }
      }
    } else {
      // Handle direct file paths
      const filePath = path.join(projectPath, pattern);
      if (await fs.pathExists(filePath)) {
        files.push(filePath);
      }
    }

    return files;
  }

  private async generateConfigTemplate(platform: string, projectPath: string): Promise<string> {
    const templates: { [key: string]: string } = {
      'GitHub Actions': `name: Playwright Tests
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: 18
    - name: Install dependencies
      run: npm ci
    - name: Install Playwright Browsers
      run: npx playwright install --with-deps
    - name: Run Playwright tests
      run: npx playwright test
    - uses: actions/upload-artifact@v3
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 30`,

      'GitLab CI': `stages:
  - test

playwright-tests:
  stage: test
  image: mcr.microsoft.com/playwright:v1.40.0-focal
  script:
    - npm ci
    - npx playwright test
  artifacts:
    when: always
    paths:
      - playwright-report/
    expire_in: 1 week
  cache:
    paths:
      - node_modules/`,

      'Jenkins': `pipeline {
    agent any
    stages {
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
                sh 'npx playwright install --with-deps'
            }
        }
        stage('Run Tests') {
            steps {
                sh 'npx playwright test'
            }
        }
    }
    post {
        always {
            publishHTML([
                allowMissing: false,
                alwaysLinkToLastBuild: false,
                keepAll: true,
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright Report'
            ])
        }
    }
}`,

      'Azure DevOps': `trigger:
- main

pool:
  vmImage: ubuntu-latest

steps:
- task: NodeTool@0
  inputs:
    versionSpec: '18'
  displayName: 'Install Node.js'

- script: |
    npm ci
    npx playwright install --with-deps
  displayName: 'Install dependencies'

- script: npx playwright test
  displayName: 'Run Playwright tests'

- task: PublishTestResults@2
  condition: succeededOrFailed()
  inputs:
    testResultsFormat: 'JUnit'
    testResultsFiles: 'test-results/junit.xml'`,

      'CircleCI': `version: 2.1
jobs:
  test:
    docker:
      - image: mcr.microsoft.com/playwright:v1.40.0-focal
    steps:
      - checkout
      - run:
          name: Install dependencies
          command: npm ci
      - run:
          name: Run Playwright tests
          command: npx playwright test
      - store_artifacts:
          path: playwright-report
      - store_test_results:
          path: test-results

workflows:
  test_workflow:
    jobs:
      - test`
    };

    return templates[platform] || `# ${platform} configuration template not available
# Please refer to ${platform} documentation for Playwright setup`;
  }
}