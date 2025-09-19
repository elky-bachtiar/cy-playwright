import { GitHubActionsConverter } from '../src/github-actions-converter';
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

describe('GitHub Actions Conversion', () => {
  let actionsConverter: GitHubActionsConverter;
  let projectDetector: CypressProjectDetector;
  let mockProjectPath: string;
  let mockOutputPath: string;

  beforeEach(() => {
    actionsConverter = new GitHubActionsConverter();
    projectDetector = new CypressProjectDetector();
    mockProjectPath = '/mock/cypress/project';
    mockOutputPath = '/mock/playwright/project';

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default fs.existsSync behavior
    mockFs.existsSync.mockImplementation((filePath: any) => {
      const pathStr = filePath.toString();
      return pathStr.includes('.github/workflows') || pathStr.includes('cypress.config.js');
    });

    // Setup default fs.readFileSync behavior
    mockFs.readFileSync.mockImplementation((filePath: any) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('.github/workflows')) {
        return mockCypressWorkflow;
      }
      return '{}';
    });

    // Setup default yaml.load behavior
    mockYaml.load.mockReturnValue(mockParsedWorkflow);

    // Setup default yaml.dump behavior
    mockYaml.dump.mockReturnValue(mockPlaywrightWorkflowYaml);
  });

  const mockCypressWorkflow = `
name: Cypress Tests
on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  cypress-run:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chrome, firefox, edge]
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run Cypress tests
        uses: cypress-io/github-action@v5
        with:
          browser: \${{ matrix.browser }}
          record: true
          parallel: true
        env:
          CYPRESS_RECORD_KEY: \${{ secrets.CYPRESS_RECORD_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Upload screenshots
        uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: cypress-screenshots-\${{ matrix.browser }}
          path: cypress/screenshots

      - name: Upload videos
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: cypress-videos-\${{ matrix.browser }}
          path: cypress/videos
  `;

  const mockParsedWorkflow = {
    name: 'Cypress Tests',
    on: {
      push: { branches: ['main', 'develop'] },
      pull_request: { branches: ['main'] }
    },
    jobs: {
      'cypress-run': {
        'runs-on': 'ubuntu-latest',
        strategy: {
          matrix: {
            browser: ['chrome', 'firefox', 'edge']
          }
        },
        steps: [
          { name: 'Checkout', uses: 'actions/checkout@v3' },
          {
            name: 'Setup Node.js',
            uses: 'actions/setup-node@v3',
            with: { 'node-version': 18, cache: 'npm' }
          },
          { name: 'Install dependencies', run: 'npm ci' },
          {
            name: 'Run Cypress tests',
            uses: 'cypress-io/github-action@v5',
            with: { browser: '${{ matrix.browser }}', record: true, parallel: true },
            env: {
              CYPRESS_RECORD_KEY: '${{ secrets.CYPRESS_RECORD_KEY }}',
              GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}'
            }
          },
          {
            name: 'Upload screenshots',
            uses: 'actions/upload-artifact@v3',
            if: 'failure()',
            with: {
              name: 'cypress-screenshots-${{ matrix.browser }}',
              path: 'cypress/screenshots'
            }
          },
          {
            name: 'Upload videos',
            uses: 'actions/upload-artifact@v3',
            if: 'always()',
            with: {
              name: 'cypress-videos-${{ matrix.browser }}',
              path: 'cypress/videos'
            }
          }
        ]
      }
    }
  };

  const mockPlaywrightWorkflowYaml = `
name: Playwright Tests
on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  playwright-run:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run Playwright tests
        run: npx playwright test --project=\${{ matrix.browser }}
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report-\${{ matrix.browser }}
          path: playwright-report/

      - name: Upload trace files
        uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-traces-\${{ matrix.browser }}
          path: test-results/
  `;

  describe('Workflow File Detection', () => {
    it('should detect GitHub Actions workflow files', async () => {
      const workflowFiles = await actionsConverter.detectWorkflowFiles(mockProjectPath);

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        path.join(mockProjectPath, '.github/workflows')
      );
      expect(workflowFiles).toEqual(
        expect.arrayContaining([
          expect.stringContaining('.github/workflows')
        ])
      );
    });

    it('should return empty array when no workflow directory exists', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const workflowFiles = await actionsConverter.detectWorkflowFiles(mockProjectPath);

      expect(workflowFiles).toEqual([]);
    });

    it('should filter for YAML workflow files only', async () => {
      mockFs.readdirSync.mockReturnValue([
        'test.yml' as any,
        'build.yaml' as any,
        'deploy.json' as any,
        'readme.md' as any
      ]);

      const workflowFiles = await actionsConverter.detectWorkflowFiles(mockProjectPath);

      expect(workflowFiles).toHaveLength(2);
      expect(workflowFiles).toEqual(
        expect.arrayContaining([
          expect.stringContaining('test.yml'),
          expect.stringContaining('build.yaml')
        ])
      );
    });
  });

  describe('Workflow File Parsing', () => {
    it('should parse Cypress workflow YAML correctly', async () => {
      const result = await actionsConverter.parseWorkflowFile(
        path.join(mockProjectPath, '.github/workflows/cypress.yml')
      );

      expect(mockFs.readFileSync).toHaveBeenCalled();
      expect(mockYaml.load).toHaveBeenCalled();
      expect(result).toEqual(mockParsedWorkflow);
    });

    it('should handle malformed YAML gracefully', async () => {
      mockYaml.load.mockImplementation(() => {
        throw new Error('Invalid YAML');
      });

      await expect(
        actionsConverter.parseWorkflowFile(
          path.join(mockProjectPath, '.github/workflows/invalid.yml')
        )
      ).rejects.toThrow('Invalid YAML');
    });

    it('should detect Cypress-specific workflow patterns', async () => {
      const isCypressWorkflow = actionsConverter.isCypressWorkflow(mockParsedWorkflow);

      expect(isCypressWorkflow).toBe(true);
    });

    it('should reject non-Cypress workflows', async () => {
      const nonCypressWorkflow = {
        name: 'Build',
        jobs: {
          build: {
            'runs-on': 'ubuntu-latest',
            steps: [{ name: 'Build', run: 'npm run build' }]
          }
        }
      };

      const isCypressWorkflow = actionsConverter.isCypressWorkflow(nonCypressWorkflow);

      expect(isCypressWorkflow).toBe(false);
    });
  });

  describe('Parallel Execution Pattern Migration', () => {
    it('should convert Cypress parallel execution to Playwright sharding', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(
        mockParsedWorkflow,
        { enableSharding: true, shardCount: 4 }
      );

      expect(convertedWorkflow.jobs['playwright-run'].strategy!.matrix).toHaveProperty('shard');
      expect(convertedWorkflow.jobs['playwright-run'].strategy!.matrix!.shard).toEqual([1, 2, 3, 4]);
    });

    it('should preserve browser matrix while adding sharding', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(
        mockParsedWorkflow,
        { enableSharding: true, shardCount: 2 }
      );

      const matrix = convertedWorkflow.jobs['playwright-run'].strategy!.matrix;
      expect(matrix!.browser).toEqual(['chromium', 'firefox', 'webkit']);
      expect(matrix!.shard).toEqual([1, 2]);
    });

    it('should generate Playwright test command with sharding', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(
        mockParsedWorkflow,
        { enableSharding: true, shardCount: 3 }
      );

      const testStep = convertedWorkflow.jobs['playwright-run'].steps.find(
        step => step.name === 'Run Playwright tests'
      );

      expect(testStep!.run).toContain('--shard=${{ matrix.shard }}/${{ strategy.job-total }}');
    });
  });

  describe('Artifact Collection and Reporting Conversion', () => {
    it('should convert Cypress screenshot artifacts to Playwright reports', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(mockParsedWorkflow);

      const reportStep = convertedWorkflow.jobs['playwright-run'].steps.find(
        step => step.name === 'Upload test results'
      );

      expect(reportStep).toBeDefined();
      expect(reportStep!.with!.name).toBe('playwright-report-${{ matrix.browser }}');
      expect(reportStep!.with!.path).toBe('playwright-report/');
    });

    it('should convert Cypress video artifacts to Playwright traces', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(mockParsedWorkflow);

      const traceStep = convertedWorkflow.jobs['playwright-run'].steps.find(
        step => step.name === 'Upload trace files'
      );

      expect(traceStep).toBeDefined();
      expect(traceStep!.with!.name).toBe('playwright-traces-${{ matrix.browser }}');
      expect(traceStep!.with!.path).toBe('test-results/');
    });

    it('should maintain conditional artifact upload behavior', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(mockParsedWorkflow);

      const reportStep = convertedWorkflow.jobs['playwright-run'].steps.find(
        step => step.name === 'Upload test results'
      );
      const traceStep = convertedWorkflow.jobs['playwright-run'].steps.find(
        step => step.name === 'Upload trace files'
      );

      expect(reportStep!.if).toBe('always()');
      expect(traceStep!.if).toBe('failure()');
    });
  });

  describe('Browser Matrix Configuration Conversion', () => {
    it('should convert Cypress browsers to Playwright projects', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(mockParsedWorkflow);

      const matrix = convertedWorkflow.jobs['playwright-run'].strategy!.matrix;
      expect(matrix!.browser).toEqual(['chromium', 'firefox', 'webkit']);
    });

    it('should handle custom browser configurations', async () => {
      const customWorkflow = {
        ...mockParsedWorkflow,
        jobs: {
          'cypress-run': {
            ...mockParsedWorkflow.jobs['cypress-run'],
            strategy: {
              matrix: {
                browser: ['chrome', 'firefox', 'edge', 'electron']
              }
            }
          }
        }
      };

      const convertedWorkflow = await actionsConverter.convertWorkflow(customWorkflow);

      const matrix = convertedWorkflow.jobs['playwright-run'].strategy!.matrix;
      expect(matrix!.browser).toEqual(['chromium', 'firefox', 'webkit']); // electron mapped to chromium
    });

    it('should preserve non-browser matrix dimensions', async () => {
      const multiDimensionWorkflow = {
        ...mockParsedWorkflow,
        jobs: {
          'cypress-run': {
            ...mockParsedWorkflow.jobs['cypress-run'],
            strategy: {
              matrix: {
                browser: ['chrome', 'firefox'],
                'node-version': [16, 18, 20],
                os: ['ubuntu-latest', 'windows-latest']
              }
            }
          }
        }
      };

      const convertedWorkflow = await actionsConverter.convertWorkflow(multiDimensionWorkflow);

      const matrix = convertedWorkflow.jobs['playwright-run'].strategy!.matrix;
      expect(matrix!['node-version']).toEqual([16, 18, 20]);
      expect(matrix!.os).toEqual(['ubuntu-latest', 'windows-latest']);
    });
  });

  describe('Environment Variable Migration', () => {
    it('should remove Cypress-specific environment variables', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(mockParsedWorkflow);

      const testStep = convertedWorkflow.jobs['playwright-run'].steps.find(
        step => step.name === 'Run Playwright tests'
      );

      expect(testStep!.env).not.toHaveProperty('CYPRESS_RECORD_KEY');
    });

    it('should preserve generic environment variables', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(mockParsedWorkflow);

      const testStep = convertedWorkflow.jobs['playwright-run'].steps.find(
        step => step.name === 'Run Playwright tests'
      );

      expect(testStep!.env).toHaveProperty('GITHUB_TOKEN');
    });

    it('should add Playwright-specific environment variables', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(
        mockParsedWorkflow,
        { addPlaywrightEnvVars: true }
      );

      const testStep = convertedWorkflow.jobs['playwright-run'].steps.find(
        step => step.name === 'Run Playwright tests'
      );

      expect(testStep!.env).toHaveProperty('PLAYWRIGHT_HTML_REPORT');
    });
  });

  describe('Action Step Conversion', () => {
    it('should replace Cypress GitHub Action with Playwright commands', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(mockParsedWorkflow);

      const steps = convertedWorkflow.jobs['playwright-run'].steps;
      const cypressStep = steps.find(step => step.uses?.includes('cypress-io/github-action'));
      const playwrightSteps = steps.filter(step =>
        step.name === 'Install Playwright' || step.name === 'Run Playwright tests'
      );

      expect(cypressStep).toBeUndefined();
      expect(playwrightSteps).toHaveLength(2);
    });

    it('should add Playwright browser installation step', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(mockParsedWorkflow);

      const installStep = convertedWorkflow.jobs['playwright-run'].steps.find(
        step => step.name === 'Install Playwright'
      );

      expect(installStep).toBeDefined();
      expect(installStep!.run).toBe('npx playwright install --with-deps');
    });

    it('should preserve non-Cypress action steps', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(mockParsedWorkflow);

      const checkoutStep = convertedWorkflow.jobs['playwright-run'].steps.find(
        step => step.name === 'Checkout'
      );
      const setupNodeStep = convertedWorkflow.jobs['playwright-run'].steps.find(
        step => step.name === 'Setup Node.js'
      );

      expect(checkoutStep).toBeDefined();
      expect(checkoutStep!.uses).toBe('actions/checkout@v3');
      expect(setupNodeStep).toBeDefined();
      expect(setupNodeStep!.uses).toBe('actions/setup-node@v3');
    });
  });

  describe('Workflow File Generation', () => {
    it('should generate valid YAML for converted workflow', async () => {
      const convertedWorkflow = await actionsConverter.convertWorkflow(mockParsedWorkflow);

      const yaml = actionsConverter.generateWorkflowYaml(convertedWorkflow);

      expect(mockYaml.dump).toHaveBeenCalledWith(convertedWorkflow, expect.any(Object));
      expect(yaml).toBe(mockPlaywrightWorkflowYaml);
    });

    it('should write converted workflow to output directory', async () => {
      await actionsConverter.writeConvertedWorkflow(
        mockPlaywrightWorkflowYaml,
        mockOutputPath,
        'playwright.yml'
      );

      expect(mockFs.ensureDir).toHaveBeenCalledWith(
        path.join(mockOutputPath, '.github/workflows')
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockOutputPath, '.github/workflows/playwright.yml'),
        mockPlaywrightWorkflowYaml,
        'utf8'
      );
    });
  });

  describe('End-to-End Workflow Conversion', () => {
    it('should convert complete Cypress workflow to Playwright', async () => {
      const result = await actionsConverter.convertGitHubActionsWorkflows(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.success).toBe(true);
      expect(result.convertedWorkflows).toHaveLength(1);
      expect(result.convertedWorkflows[0]).toMatchObject({
        originalFile: expect.stringContaining('.yml'),
        convertedFile: expect.stringContaining('.yml'),
        conversionSummary: expect.objectContaining({
          originalJobs: 1,
          convertedJobs: 1,
          stepsConverted: expect.any(Number),
          browsersConverted: expect.any(Array)
        })
      });
    });

    it('should handle multiple workflow files', async () => {
      mockFs.readdirSync.mockReturnValue([
        'cypress-e2e.yml' as any,
        'cypress-component.yml' as any
      ]);

      const result = await actionsConverter.convertGitHubActionsWorkflows(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.convertedWorkflows).toHaveLength(2);
    });

    it('should provide detailed conversion summary', async () => {
      const result = await actionsConverter.convertGitHubActionsWorkflows(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.summary).toMatchObject({
        totalWorkflowsFound: expect.any(Number),
        workflowsConverted: expect.any(Number),
        workflowsSkipped: expect.any(Number),
        conversionTimeMs: expect.any(Number)
      });
    });
  });
});