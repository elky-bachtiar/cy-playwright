import { MultiPlatformCIConverter } from '../src/multi-platform-ci-converter';
import { CypressProjectDetector } from '../src/cypress-project-detector';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Mock fs-extra
jest.mock('fs-extra');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock js-yaml
jest.mock('js-yaml');
const mockYaml = yaml as jest.Mocked<typeof yaml>;

describe('Multi-Platform CI Conversion', () => {
  let ciConverter: MultiPlatformCIConverter;
  let projectDetector: CypressProjectDetector;
  let mockProjectPath: string;
  let mockOutputPath: string;

  beforeEach(() => {
    ciConverter = new MultiPlatformCIConverter();
    projectDetector = new CypressProjectDetector();
    mockProjectPath = '/mock/cypress/project';
    mockOutputPath = '/mock/playwright/project';

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default fs.existsSync behavior
    mockFs.existsSync.mockImplementation((filePath) => {
      const pathStr = filePath.toString();
      return pathStr.includes('.circleci') ||
             pathStr.includes('appveyor') ||
             pathStr.includes('azure-pipelines') ||
             pathStr.includes('.travis.yml');
    });

    // Setup default fs.readFileSync behavior
    mockFs.readFileSync.mockImplementation((filePath) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('.circleci/config.yml')) {
        return mockCircleCIConfig;
      } else if (pathStr.includes('appveyor.yml')) {
        return mockAppVeyorConfig;
      } else if (pathStr.includes('azure-pipelines.yml')) {
        return mockAzurePipelinesConfig;
      }
      return '{}';
    });

    // Setup default yaml.load behavior
    mockYaml.load.mockImplementation((content: string) => {
      if (content.includes('cypress-io/cypress@3') || content.includes('cypress/run')) return mockParsedCircleCIConfig;
      if (content.includes('version: 1.0.{build}') || content.includes('appveyor')) return mockParsedAppVeyorConfig;
      if (content.includes('azure-pipelines') || content.includes('- task:')) return mockParsedAzurePipelinesConfig;
      return {};
    });

    // Setup default yaml.dump behavior
    mockYaml.dump.mockReturnValue('converted-yaml-content');
  });

  const mockCircleCIConfig = `
version: 2.1

orbs:
  cypress: cypress-io/cypress@3

workflows:
  build:
    jobs:
      - cypress/run:
          name: cypress-chrome
          browser: chrome
          record: true
      - cypress/run:
          name: cypress-firefox
          browser: firefox
          record: true
  `;

  const mockParsedCircleCIConfig = {
    version: '2.1',
    orbs: {
      cypress: 'cypress-io/cypress@3'
    },
    workflows: {
      build: {
        jobs: [
          {
            'cypress/run': {
              name: 'cypress-chrome',
              browser: 'chrome',
              record: true
            }
          },
          {
            'cypress/run': {
              name: 'cypress-firefox',
              browser: 'firefox',
              record: true
            }
          }
        ]
      }
    }
  };

  const mockAppVeyorConfig = `
version: 1.0.{build}

environment:
  matrix:
    - nodejs_version: "16"
      browser: chrome
    - nodejs_version: "18"
      browser: firefox

install:
  - npm install

test_script:
  - npm run cy:run -- --browser %browser%

artifacts:
  - path: cypress/screenshots
    name: screenshots
  - path: cypress/videos
    name: videos
  `;

  const mockParsedAppVeyorConfig = {
    version: '1.0.{build}',
    environment: {
      matrix: [
        { nodejs_version: '16', browser: 'chrome' },
        { nodejs_version: '18', browser: 'firefox' }
      ]
    },
    install: ['npm install'],
    test_script: ['npm run cy:run -- --browser %browser%'],
    artifacts: [
      { path: 'cypress/screenshots', name: 'screenshots' },
      { path: 'cypress/videos', name: 'videos' }
    ]
  };

  const mockAzurePipelinesConfig = `
trigger:
- main

pool:
  vmImage: ubuntu-latest

strategy:
  matrix:
    chrome:
      browser: chrome
    firefox:
      browser: firefox

steps:
- task: NodeTool@0
  displayName: 'Install Node.js'
  inputs:
    versionSpec: '18.x'

- script: npm ci
  displayName: 'Install dependencies'

- script: npm run cy:run -- --browser $(browser)
  displayName: 'Run Cypress tests'

- task: PublishTestResults@2
  condition: always()
  inputs:
    testResultsFiles: 'cypress/results/*.xml'
  `;

  const mockParsedAzurePipelinesConfig = {
    trigger: ['main'],
    pool: { vmImage: 'ubuntu-latest' },
    strategy: {
      matrix: {
        chrome: { browser: 'chrome' },
        firefox: { browser: 'firefox' }
      }
    },
    steps: [
      {
        task: 'NodeTool@0',
        displayName: 'Install Node.js',
        inputs: { versionSpec: '18.x' }
      },
      {
        script: 'npm ci',
        displayName: 'Install dependencies'
      },
      {
        script: 'npm run cy:run -- --browser $(browser)',
        displayName: 'Run Cypress tests'
      },
      {
        task: 'PublishTestResults@2',
        condition: 'always()',
        inputs: { testResultsFiles: 'cypress/results/*.xml' }
      }
    ]
  };

  describe('CI Platform Detection', () => {
    it('should detect CircleCI configuration files', async () => {
      const platforms = await ciConverter.detectCIPlatforms(mockProjectPath);

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        path.join(mockProjectPath, '.circleci/config.yml')
      );
      expect(platforms).toContain('circleci');
    });

    it('should detect AppVeyor configuration files', async () => {
      const platforms = await ciConverter.detectCIPlatforms(mockProjectPath);

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        path.join(mockProjectPath, 'appveyor.yml')
      );
      expect(platforms).toContain('appveyor');
    });

    it('should detect Azure Pipelines configuration files', async () => {
      const platforms = await ciConverter.detectCIPlatforms(mockProjectPath);

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        path.join(mockProjectPath, 'azure-pipelines.yml')
      );
      expect(platforms).toContain('azure-pipelines');
    });

    it('should detect Travis CI configuration files', async () => {
      const platforms = await ciConverter.detectCIPlatforms(mockProjectPath);

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        path.join(mockProjectPath, '.travis.yml')
      );
      expect(platforms).toContain('travis');
    });

    it('should return empty array when no CI configurations exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const platforms = await ciConverter.detectCIPlatforms(mockProjectPath);

      expect(platforms).toEqual([]);
    });
  });

  describe('CircleCI Configuration Conversion', () => {
    it('should parse CircleCI configuration correctly', async () => {
      const config = await ciConverter.parseCircleCIConfig(
        path.join(mockProjectPath, '.circleci/config.yml')
      );

      expect(mockFs.readFileSync).toHaveBeenCalled();
      expect(mockYaml.load).toHaveBeenCalled();
      expect(config).toEqual(mockParsedCircleCIConfig);
    });

    it('should detect Cypress orb usage', () => {
      const isCypressConfig = ciConverter.isCypressCircleCIConfig(mockParsedCircleCIConfig);

      expect(isCypressConfig).toBe(true);
    });

    it('should convert Cypress orb to Playwright steps', async () => {
      const convertedConfig = await ciConverter.convertCircleCIConfig(
        mockParsedCircleCIConfig
      );

      expect(convertedConfig.orbs).not.toHaveProperty('cypress');
      expect(convertedConfig.jobs).toHaveProperty('playwright-chrome');
      expect(convertedConfig.jobs).toHaveProperty('playwright-firefox');
    });

    it('should convert browser matrix for CircleCI', async () => {
      const convertedConfig = await ciConverter.convertCircleCIConfig(
        mockParsedCircleCIConfig
      );

      const chromeJob = convertedConfig.jobs!['playwright-chrome'];
      const firefoxJob = convertedConfig.jobs!['playwright-firefox'];

      expect(chromeJob.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            run: expect.stringContaining('--project chromium')
          })
        ])
      );

      expect(firefoxJob.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            run: expect.stringContaining('--project firefox')
          })
        ])
      );
    });

    it('should preserve CircleCI workflow structure', async () => {
      const convertedConfig = await ciConverter.convertCircleCIConfig(
        mockParsedCircleCIConfig
      );

      expect(convertedConfig.workflows!.build.jobs).toEqual(
        expect.arrayContaining([
          'playwright-chrome',
          'playwright-firefox'
        ])
      );
    });
  });

  describe('AppVeyor Configuration Conversion', () => {
    it('should parse AppVeyor configuration correctly', async () => {
      const config = await ciConverter.parseAppVeyorConfig(
        path.join(mockProjectPath, 'appveyor.yml')
      );

      expect(mockFs.readFileSync).toHaveBeenCalled();
      expect(mockYaml.load).toHaveBeenCalled();
      expect(config).toEqual(mockParsedAppVeyorConfig);
    });

    it('should detect Cypress test scripts', () => {
      const isCypressConfig = ciConverter.isCypressAppVeyorConfig(mockParsedAppVeyorConfig);

      expect(isCypressConfig).toBe(true);
    });

    it('should convert Cypress commands to Playwright', async () => {
      const convertedConfig = await ciConverter.convertAppVeyorConfig(
        mockParsedAppVeyorConfig
      );

      expect(convertedConfig.test_script).toEqual(
        expect.arrayContaining([
          expect.stringContaining('npx playwright test')
        ])
      );
    });

    it('should convert environment matrix for AppVeyor', async () => {
      const convertedConfig = await ciConverter.convertAppVeyorConfig(
        mockParsedAppVeyorConfig
      );

      expect(convertedConfig.environment!.matrix).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ browser: 'chromium' }),
          expect.objectContaining({ browser: 'firefox' })
        ])
      );
    });

    it('should convert artifact paths for AppVeyor', async () => {
      const convertedConfig = await ciConverter.convertAppVeyorConfig(
        mockParsedAppVeyorConfig
      );

      expect(convertedConfig.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'playwright-report' }),
          expect.objectContaining({ path: 'test-results' })
        ])
      );
    });
  });

  describe('Azure Pipelines Configuration Conversion', () => {
    it('should parse Azure Pipelines configuration correctly', async () => {
      const config = await ciConverter.parseAzurePipelinesConfig(
        path.join(mockProjectPath, 'azure-pipelines.yml')
      );

      expect(mockFs.readFileSync).toHaveBeenCalled();
      expect(mockYaml.load).toHaveBeenCalled();
      expect(config).toEqual(mockParsedAzurePipelinesConfig);
    });

    it('should detect Cypress test steps', () => {
      const isCypressConfig = ciConverter.isCypressAzurePipelinesConfig(
        mockParsedAzurePipelinesConfig
      );

      expect(isCypressConfig).toBe(true);
    });

    it('should convert Cypress scripts to Playwright', async () => {
      const convertedConfig = await ciConverter.convertAzurePipelinesConfig(
        mockParsedAzurePipelinesConfig
      );

      const playwrightStep = convertedConfig.steps!.find(step =>
        step.script?.includes('npx playwright test')
      );

      expect(playwrightStep).toBeDefined();
      expect(playwrightStep!.displayName).toBe('Run Playwright tests');
    });

    it('should convert strategy matrix for Azure Pipelines', async () => {
      const convertedConfig = await ciConverter.convertAzurePipelinesConfig(
        mockParsedAzurePipelinesConfig
      );

      expect(convertedConfig.strategy!.matrix).toEqual({
        chromium: { browser: 'chromium' },
        firefox: { browser: 'firefox' }
      });
    });

    it('should add Playwright installation step for Azure Pipelines', async () => {
      const convertedConfig = await ciConverter.convertAzurePipelinesConfig(
        mockParsedAzurePipelinesConfig
      );

      const installStep = convertedConfig.steps!.find(step =>
        step.script?.includes('npx playwright install')
      );

      expect(installStep).toBeDefined();
      expect(installStep!.displayName).toBe('Install Playwright');
    });

    it('should convert test result publishing for Azure Pipelines', async () => {
      const convertedConfig = await ciConverter.convertAzurePipelinesConfig(
        mockParsedAzurePipelinesConfig
      );

      const publishStep = convertedConfig.steps!.find(step =>
        step.task === 'PublishTestResults@2'
      );

      expect(publishStep).toBeDefined();
      expect(publishStep!.inputs!.testResultsFiles).toBe('test-results/results.xml');
    });
  });

  describe('Multi-Browser Configuration Matrices', () => {
    it('should convert Chrome to Chromium across all platforms', async () => {
      const circleCIResult = await ciConverter.convertCircleCIConfig(mockParsedCircleCIConfig);
      const appVeyorResult = await ciConverter.convertAppVeyorConfig(mockParsedAppVeyorConfig);
      const azureResult = await ciConverter.convertAzurePipelinesConfig(mockParsedAzurePipelinesConfig);

      // Check ChromeJ → Chromium conversion
      expect(JSON.stringify(circleCIResult)).toContain('chromium');
      expect(JSON.stringify(appVeyorResult)).toContain('chromium');
      expect(JSON.stringify(azureResult)).toContain('chromium');
    });

    it('should preserve Firefox browser configuration', async () => {
      const circleCIResult = await ciConverter.convertCircleCIConfig(mockParsedCircleCIConfig);
      const appVeyorResult = await ciConverter.convertAppVeyorConfig(mockParsedAppVeyorConfig);
      const azureResult = await ciConverter.convertAzurePipelinesConfig(mockParsedAzurePipelinesConfig);

      expect(JSON.stringify(circleCIResult)).toContain('firefox');
      expect(JSON.stringify(appVeyorResult)).toContain('firefox');
      expect(JSON.stringify(azureResult)).toContain('firefox');
    });

    it('should handle missing browser configurations gracefully', async () => {
      const noBrowserConfig = {
        version: '2.1',
        jobs: {
          test: {
            steps: [{ run: 'npm run cy:run' }]
          }
        }
      };

      const convertedConfig = await ciConverter.convertCircleCIConfig(noBrowserConfig);

      expect(convertedConfig.jobs).toHaveProperty('playwright-test');
    });
  });

  describe('Environment-Specific Configurations', () => {
    it('should preserve environment variables across platforms', async () => {
      const configWithEnv = {
        ...mockParsedCircleCIConfig,
        jobs: {
          'cypress/run': {
            name: 'test',
            environment: {
              NODE_ENV: 'test',
              API_URL: 'https://api.example.com'
            }
          }
        }
      };

      const convertedConfig = await ciConverter.convertCircleCIConfig(configWithEnv);

      expect(convertedConfig.jobs!['playwright-test'].environment).toEqual({
        NODE_ENV: 'test',
        API_URL: 'https://api.example.com'
      });
    });

    it('should remove Cypress-specific environment variables', async () => {
      const configWithCypressEnv = {
        ...mockParsedAppVeyorConfig,
        environment: {
          ...mockParsedAppVeyorConfig.environment,
          CYPRESS_RECORD_KEY: 'secret-key',
          CYPRESS_PROJECT_ID: 'project-id',
          NODE_ENV: 'test'
        }
      };

      const convertedConfig = await ciConverter.convertAppVeyorConfig(configWithCypressEnv);

      expect(convertedConfig.environment).not.toHaveProperty('CYPRESS_RECORD_KEY');
      expect(convertedConfig.environment).not.toHaveProperty('CYPRESS_PROJECT_ID');
      expect(convertedConfig.environment).toHaveProperty('NODE_ENV');
    });

    it('should add Playwright-specific environment variables', async () => {
      const convertedConfig = await ciConverter.convertAzurePipelinesConfig(
        mockParsedAzurePipelinesConfig,
        { addPlaywrightEnvVars: true }
      );

      const playwrightStep = convertedConfig.steps!.find(step =>
        step.script?.includes('npx playwright test')
      );

      expect(playwrightStep!.env).toEqual(
        expect.objectContaining({
          PLAYWRIGHT_HTML_REPORT: 'playwright-report',
          PLAYWRIGHT_JUNIT_OUTPUT_NAME: 'results.xml'
        })
      );
    });
  });

  describe('End-to-End Multi-Platform Conversion', () => {
    it('should convert all detected CI platforms', async () => {
      const result = await ciConverter.convertAllCIPlatforms(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.success).toBe(true);
      expect(result.convertedConfigurations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ platform: 'circleci' }),
          expect.objectContaining({ platform: 'appveyor' }),
          expect.objectContaining({ platform: 'azure-pipelines' }),
          expect.objectContaining({ platform: 'travis' })
        ])
      );
    });

    it('should provide detailed conversion summary for all platforms', async () => {
      const result = await ciConverter.convertAllCIPlatforms(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.summary).toMatchObject({
        totalPlatformsDetected: 4,
        platformsConverted: expect.any(Number),
        platformsSkipped: expect.any(Number),
        conversionTimeMs: expect.any(Number)
      });
    });

    it('should handle platform-specific conversion errors gracefully', async () => {
      mockYaml.load.mockImplementation((content: string) => {
        if (content.includes('circleci')) {
          throw new Error('Invalid CircleCI YAML');
        }
        return mockParsedAppVeyorConfig;
      });

      const result = await ciConverter.convertAllCIPlatforms(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('CircleCI')
        ])
      );
      expect(result.convertedConfigurations.length).toBeGreaterThan(0);
    });

    it('should write converted configurations to correct output paths', async () => {
      await ciConverter.convertAllCIPlatforms(mockProjectPath, mockOutputPath);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockOutputPath, '.circleci/config.yml'),
        expect.any(String),
        'utf8'
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockOutputPath, 'appveyor.yml'),
        expect.any(String),
        'utf8'
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockOutputPath, 'azure-pipelines.yml'),
        expect.any(String),
        'utf8'
      );
    });
  });
});