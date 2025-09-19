import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ExecutionValidator, ExecutionValidationResult } from '../../src/validation/execution-validator';
import { EnvironmentValidator } from '../../src/validation/environment-validator';
import { DependencyValidator } from '../../src/validation/dependency-validator';
import { BrowserCompatibilityValidator } from '../../src/validation/browser-compatibility-validator';
import * as fs from 'fs-extra';
import * as childProcess from 'child_process';

// Mock external dependencies
jest.mock('fs-extra');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockChildProcess = childProcess as jest.Mocked<typeof childProcess>;

describe('Execution Validation Test Suite', () => {
  let executionValidator: ExecutionValidator;
  let environmentValidator: EnvironmentValidator;
  let dependencyValidator: DependencyValidator;
  let browserValidator: BrowserCompatibilityValidator;

  beforeEach(() => {
    executionValidator = new ExecutionValidator();
    environmentValidator = new EnvironmentValidator();
    dependencyValidator = new DependencyValidator();
    browserValidator = new BrowserCompatibilityValidator();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Optional Converted Test Execution', () => {
    test('should execute converted tests successfully', async () => {
      const projectPath = '/path/to/converted/project';
      const mockPackageJson = {
        name: 'converted-project',
        scripts: {
          test: 'playwright test'
        },
        devDependencies: {
          '@playwright/test': '^1.40.0'
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue(mockPackageJson);

      // Mock successful test execution
      mockChildProcess.spawn = jest.fn().mockImplementation(() => ({
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('Running 5 tests\nAll tests passed\n'));
            }
          })
        },
        stderr: {
          on: jest.fn()
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0); // Success exit code
          }
        })
      })) as any;

      const result = await executionValidator.executeTests(projectPath);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.testsRun).toBe(5);
      expect(result.testsPassed).toBe(5);
      expect(result.testsFailed).toBe(0);
    });

    test('should handle test execution failures', async () => {
      const projectPath = '/path/to/project/with/failing/tests';

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue({
        scripts: { test: 'playwright test' },
        devDependencies: { '@playwright/test': '^1.40.0' }
      });

      // Mock failing test execution
      mockChildProcess.spawn = jest.fn().mockImplementation(() => ({
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('Running 10 tests\n3 tests failed\n'));
            }
          })
        },
        stderr: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('Error: Test timeout\n'));
            }
          })
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(1); // Failure exit code
          }
        })
      })) as any;

      const result = await executionValidator.executeTests(projectPath);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.testsRun).toBe(10);
      expect(result.testsPassed).toBe(7);
      expect(result.testsFailed).toBe(3);
      expect(result.errors).toContain('Error: Test timeout');
    });

    test('should handle missing test command', async () => {
      const projectPath = '/path/to/project/without/test/script';

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue({
        name: 'project',
        scripts: {
          build: 'tsc'
        }
      });

      const result = await executionValidator.executeTests(projectPath);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No test script found in package.json');
    });

    test('should validate test execution with different configurations', async () => {
      const projectPath = '/path/to/project';
      const configurations = [
        { name: 'chromium', browser: 'chromium' },
        { name: 'firefox', browser: 'firefox' },
        { name: 'webkit', browser: 'webkit' }
      ];

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue({
        scripts: { test: 'playwright test' },
        devDependencies: { '@playwright/test': '^1.40.0' }
      });

      for (const config of configurations) {
        mockChildProcess.spawn = jest.fn().mockImplementation(() => ({
          stdout: { on: jest.fn((event, cb) => event === 'data' && cb(Buffer.from('5 passed'))) },
          stderr: { on: jest.fn() },
          on: jest.fn((event, cb) => event === 'close' && cb(0))
        })) as any;

        const result = await executionValidator.executeTestsWithConfig(projectPath, config);

        expect(result.success).toBe(true);
        expect(result.configuration).toEqual(config);
      }
    });

    test('should handle timeout during test execution', async () => {
      const projectPath = '/path/to/slow/project';

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue({
        scripts: { test: 'playwright test' },
        devDependencies: { '@playwright/test': '^1.40.0' }
      });

      // Mock long-running process that times out
      mockChildProcess.spawn = jest.fn().mockImplementation(() => ({
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      })) as any;

      const result = await executionValidator.executeTests(projectPath, { timeout: 1000 });

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.errors).toContain('Test execution timed out');
    });
  });

  describe('Environment Setup Validation', () => {
    test('should validate Node.js version compatibility', async () => {
      mockChildProcess.exec = jest.fn().mockImplementation((cmd, callback) => {
        if (cmd.includes('node --version')) {
          callback(null, { stdout: 'v18.17.0\n' });
        }
      }) as any;

      const result = await environmentValidator.validateNodeVersion();

      expect(result.isValid).toBe(true);
      expect(result.version).toBe('18.17.0');
      expect(result.isSupported).toBe(true);
    });

    test('should detect unsupported Node.js version', async () => {
      mockChildProcess.exec = jest.fn().mockImplementation((cmd, callback) => {
        if (cmd.includes('node --version')) {
          callback(null, { stdout: 'v12.22.0\n' });
        }
      }) as any;

      const result = await environmentValidator.validateNodeVersion();

      expect(result.isValid).toBe(false);
      expect(result.version).toBe('12.22.0');
      expect(result.isSupported).toBe(false);
      expect(result.recommendation).toContain('upgrade to Node.js 16 or higher');
    });

    test('should validate npm/yarn installation', async () => {
      mockChildProcess.exec = jest.fn().mockImplementation((cmd, callback) => {
        if (cmd.includes('npm --version')) {
          callback(null, { stdout: '9.8.1\n' });
        } else if (cmd.includes('yarn --version')) {
          callback(null, { stdout: '1.22.19\n' });
        }
      }) as any;

      const npmResult = await environmentValidator.validatePackageManager('npm');
      const yarnResult = await environmentValidator.validatePackageManager('yarn');

      expect(npmResult.isAvailable).toBe(true);
      expect(npmResult.version).toBe('9.8.1');
      expect(yarnResult.isAvailable).toBe(true);
      expect(yarnResult.version).toBe('1.22.19');
    });

    test('should validate system dependencies', async () => {
      const dependencies = ['git', 'python3', 'make'];

      for (const dep of dependencies) {
        mockChildProcess.exec = jest.fn().mockImplementation((cmd, callback) => {
          if (cmd.includes(`${dep} --version`)) {
            callback(null, { stdout: '2.40.0\n' });
          }
        }) as any;
      }

      const result = await environmentValidator.validateSystemDependencies(dependencies);

      expect(result.allAvailable).toBe(true);
      expect(result.availableDependencies).toEqual(dependencies);
      expect(result.missingDependencies).toHaveLength(0);
    });

    test('should detect missing system dependencies', async () => {
      const dependencies = ['git', 'python3', 'nonexistent'];

      mockChildProcess.exec = jest.fn().mockImplementation((cmd, callback) => {
        if (cmd.includes('nonexistent')) {
          callback(new Error('Command not found'), null);
        } else {
          callback(null, { stdout: '2.40.0\n' });
        }
      }) as any;

      const result = await environmentValidator.validateSystemDependencies(dependencies);

      expect(result.allAvailable).toBe(false);
      expect(result.availableDependencies).toEqual(['git', 'python3']);
      expect(result.missingDependencies).toEqual(['nonexistent']);
    });

    test('should validate environment variables', async () => {
      const requiredEnvVars = ['NODE_ENV', 'CI'];

      // Mock process.env
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        CI: 'true'
      };

      const result = await environmentValidator.validateEnvironmentVariables(requiredEnvVars);

      expect(result.allPresent).toBe(true);
      expect(result.presentVariables).toEqual(requiredEnvVars);
      expect(result.missingVariables).toHaveLength(0);

      // Restore original env
      process.env = originalEnv;
    });
  });

  describe('Dependency Resolution Validation', () => {
    test('should validate Playwright installation', async () => {
      const packageJson = {
        devDependencies: {
          '@playwright/test': '^1.40.0',
          'playwright': '^1.40.0'
        }
      };

      mockFs.readJson.mockResolvedValue(packageJson);
      mockFs.pathExists.mockImplementation((path: string) => {
        return Promise.resolve(path.includes('node_modules/@playwright/test'));
      });

      const result = await dependencyValidator.validatePlaywrightInstallation('/path/to/project');

      expect(result.isInstalled).toBe(true);
      expect(result.version).toBe('^1.40.0');
      expect(result.hasTestRunner).toBe(true);
      expect(result.hasBrowsers).toBe(true);
    });

    test('should detect missing Playwright dependencies', async () => {
      const packageJson = {
        devDependencies: {
          'jest': '^29.0.0'
        }
      };

      mockFs.readJson.mockResolvedValue(packageJson);
      mockFs.pathExists.mockResolvedValue(false);

      const result = await dependencyValidator.validatePlaywrightInstallation('/path/to/project');

      expect(result.isInstalled).toBe(false);
      expect(result.missingPackages).toContain('@playwright/test');
      expect(result.installCommand).toBe('npm install -D @playwright/test');
    });

    test('should validate dependency versions compatibility', async () => {
      const packageJson = {
        devDependencies: {
          '@playwright/test': '^1.40.0',
          'typescript': '^5.0.0',
          '@types/node': '^18.0.0'
        }
      };

      mockFs.readJson.mockResolvedValue(packageJson);

      const result = await dependencyValidator.validateDependencyCompatibility('/path/to/project');

      expect(result.isCompatible).toBe(true);
      expect(result.compatiblePackages).toContain('@playwright/test');
      expect(result.compatiblePackages).toContain('typescript');
    });

    test('should detect version conflicts', async () => {
      const packageJson = {
        dependencies: {
          'playwright': '^1.35.0'
        },
        devDependencies: {
          '@playwright/test': '^1.40.0'
        }
      };

      mockFs.readJson.mockResolvedValue(packageJson);

      const result = await dependencyValidator.validateDependencyCompatibility('/path/to/project');

      expect(result.isCompatible).toBe(false);
      expect(result.conflicts).toContainEqual({
        package1: 'playwright',
        version1: '^1.35.0',
        package2: '@playwright/test',
        version2: '^1.40.0',
        issue: 'Version mismatch between playwright packages'
      });
    });

    test('should validate TypeScript configuration', async () => {
      const tsConfig = {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          lib: ['ES2020'],
          esModuleInterop: true,
          types: ['@playwright/test']
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue(tsConfig);

      const result = await dependencyValidator.validateTypeScriptConfig('/path/to/project');

      expect(result.hasConfig).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.hasPlaywrightTypes).toBe(true);
      expect(result.recommendations).toHaveLength(0);
    });

    test('should provide TypeScript configuration recommendations', async () => {
      const tsConfig = {
        compilerOptions: {
          target: 'ES5', // Outdated target
          module: 'commonjs',
          strict: false // Should be true
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue(tsConfig);

      const result = await dependencyValidator.validateTypeScriptConfig('/path/to/project');

      expect(result.hasConfig).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.hasPlaywrightTypes).toBe(false);
      expect(result.recommendations).toContain('Consider upgrading target to ES2020 or higher');
      expect(result.recommendations).toContain('Enable strict mode for better type safety');
      expect(result.recommendations).toContain('Add @playwright/test to types array');
    });
  });

  describe('Browser Compatibility Validation', () => {
    test('should validate browser installations', async () => {
      mockChildProcess.exec = jest.fn().mockImplementation((cmd, callback) => {
        if (cmd.includes('playwright install --dry-run')) {
          callback(null, { stdout: 'chromium: already installed\nfirefox: already installed\nwebkit: already installed\n' });
        }
      }) as any;

      const result = await browserValidator.validateBrowserInstallations();

      expect(result.allInstalled).toBe(true);
      expect(result.installedBrowsers).toEqual(['chromium', 'firefox', 'webkit']);
      expect(result.missingBrowsers).toHaveLength(0);
    });

    test('should detect missing browsers', async () => {
      mockChildProcess.exec = jest.fn().mockImplementation((cmd, callback) => {
        if (cmd.includes('playwright install --dry-run')) {
          callback(null, { stdout: 'chromium: already installed\nfirefox: not installed\nwebkit: not installed\n' });
        }
      }) as any;

      const result = await browserValidator.validateBrowserInstallations();

      expect(result.allInstalled).toBe(false);
      expect(result.installedBrowsers).toEqual(['chromium']);
      expect(result.missingBrowsers).toEqual(['firefox', 'webkit']);
      expect(result.installCommand).toBe('npx playwright install');
    });

    test('should validate browser version compatibility', async () => {
      const browserVersions = {
        chromium: '119.0.6045.105',
        firefox: '119.0',
        webkit: '17.4'
      };

      mockChildProcess.exec = jest.fn().mockImplementation((cmd, callback) => {
        if (cmd.includes('playwright --version')) {
          callback(null, { stdout: 'Version 1.40.0\n' });
        }
      }) as any;

      const result = await browserValidator.validateBrowserVersions(browserVersions);

      expect(result.compatibleBrowsers).toEqual(['chromium', 'firefox', 'webkit']);
      expect(result.incompatibleBrowsers).toHaveLength(0);
      expect(result.overallCompatibility).toBe(true);
    });

    test('should validate system requirements for browsers', async () => {
      const systemInfo = {
        platform: 'linux',
        arch: 'x64',
        availableMemory: 8000000000, // 8GB
        diskSpace: 50000000000 // 50GB
      };

      const result = await browserValidator.validateSystemRequirements(systemInfo);

      expect(result.meetsRequirements).toBe(true);
      expect(result.supportedBrowsers).toEqual(['chromium', 'firefox', 'webkit']);
      expect(result.warnings).toHaveLength(0);
    });

    test('should detect insufficient system requirements', async () => {
      const systemInfo = {
        platform: 'linux',
        arch: 'x64',
        availableMemory: 2000000000, // 2GB - insufficient
        diskSpace: 1000000000 // 1GB - insufficient
      };

      const result = await browserValidator.validateSystemRequirements(systemInfo);

      expect(result.meetsRequirements).toBe(false);
      expect(result.warnings).toContain('Low available memory may affect browser performance');
      expect(result.warnings).toContain('Insufficient disk space for browser installations');
    });

    test('should validate headless vs headed mode compatibility', async () => {
      const testConfigs = [
        { name: 'headless', headless: true },
        { name: 'headed', headless: false }
      ];

      for (const config of testConfigs) {
        const result = await browserValidator.validateDisplayMode(config);

        if (config.headless) {
          expect(result.isSupported).toBe(true);
          expect(result.requirements).toHaveLength(0);
        } else {
          expect(result.requirements).toContain('Display server required for headed mode');
        }
      }
    });
  });

  describe('Integration Testing', () => {
    test('should perform comprehensive execution validation', async () => {
      const projectPath = '/path/to/comprehensive/project';

      // Mock successful validations
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue({
        scripts: { test: 'playwright test' },
        devDependencies: { '@playwright/test': '^1.40.0' }
      });

      mockChildProcess.exec = jest.fn().mockImplementation((cmd, callback) => {
        if (cmd.includes('node --version')) {
          callback(null, { stdout: 'v18.17.0\n' });
        } else if (cmd.includes('playwright install --dry-run')) {
          callback(null, { stdout: 'All browsers installed\n' });
        }
      }) as any;

      mockChildProcess.spawn = jest.fn().mockImplementation(() => ({
        stdout: { on: jest.fn((event, cb) => event === 'data' && cb(Buffer.from('10 passed'))) },
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => event === 'close' && cb(0))
      })) as any;

      const result = await executionValidator.validateProject(projectPath);

      expect(result.overallScore).toBeGreaterThan(80);
      expect(result.canExecute).toBe(true);
      expect(result.environmentValid).toBe(true);
      expect(result.dependenciesValid).toBe(true);
      expect(result.browsersValid).toBe(true);
    });

    test('should generate actionable recommendations', async () => {
      const projectPath = '/path/to/project/with/issues';

      // Mock various issues
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue({
        name: 'project'
        // Missing test script
      });

      mockChildProcess.exec = jest.fn().mockImplementation((cmd, callback) => {
        if (cmd.includes('node --version')) {
          callback(null, { stdout: 'v12.22.0\n' }); // Old Node version
        }
      }) as any;

      const result = await executionValidator.validateProject(projectPath);

      expect(result.canExecute).toBe(false);
      expect(result.recommendations).toContain('Upgrade Node.js to version 16 or higher');
      expect(result.recommendations).toContain('Add test script to package.json');
      expect(result.blockers).toContain('Node.js version too old');
    });
  });
});