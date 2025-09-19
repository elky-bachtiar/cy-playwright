import { BuildScriptConverter } from '../src/build-script-converter';
import { CypressProjectDetector } from '../src/cypress-project-detector';
import * as fs from 'fs-extra';
import * as path from 'path';

// Mock fs-extra
jest.mock('fs-extra');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Build Scripts and Automation Conversion', () => {
  let buildConverter: BuildScriptConverter;
  let projectDetector: CypressProjectDetector;
  let mockProjectPath: string;
  let mockOutputPath: string;

  beforeEach(() => {
    buildConverter = new BuildScriptConverter();
    projectDetector = new CypressProjectDetector();
    mockProjectPath = '/mock/cypress/project';
    mockOutputPath = '/mock/playwright/project';

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default fs.existsSync behavior
    mockFs.existsSync.mockImplementation((filePath: string) => {
      const pathStr = filePath.toString();
      return pathStr.includes('package.json') ||
             pathStr.includes('Makefile') ||
             pathStr.includes('build.sh');
    });

    // Setup default fs.readFileSync behavior
    mockFs.readFileSync.mockImplementation((filePath: string) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('package.json')) {
        return JSON.stringify(mockPackageJson);
      } else if (pathStr.includes('Makefile')) {
        return mockMakefile;
      } else if (pathStr.includes('build.sh')) {
        return mockBuildScript;
      }
      return '{}';
    });
  });

  const mockPackageJson = {
    name: 'cypress-project',
    version: '1.0.0',
    scripts: {
      'test': 'cypress run',
      'test:headless': 'cypress run --headless',
      'test:chrome': 'cypress run --browser chrome',
      'test:firefox': 'cypress run --browser firefox',
      'cy:open': 'cypress open',
      'cy:run': 'cypress run',
      'cy:run:chrome': 'cypress run --browser chrome --record',
      'cy:run:firefox': 'cypress run --browser firefox',
      'cy:run:parallel': 'cypress run --record --parallel',
      'e2e': 'start-server-and-test start http://localhost:3000 cy:run',
      'e2e:chrome': 'start-server-and-test start http://localhost:3000 cy:run:chrome',
      'build': 'npm run build:assets && npm run test',
      'build:assets': 'webpack --mode production',
      'start': 'node server.js',
      'dev': 'nodemon server.js',
      'lint': 'eslint src/**/*.js',
      'deploy': 'npm run build && npm run test && deploy.sh'
    },
    devDependencies: {
      'cypress': '^13.6.0',
      'start-server-and-test': '^2.0.0',
      'webpack': '^5.0.0',
      'eslint': '^8.0.0'
    }
  };

  const mockMakefile = `
.PHONY: test install build deploy

install:
\tnpm install

build:
\tnpm run build:assets

test:
\tcypress run

test-chrome:
\tcypress run --browser chrome

test-firefox:
\tcypress run --browser firefox

e2e:
\tstart-server-and-test start http://localhost:3000 "cypress run"

ci:
\tnpm ci && npm run build && cypress run --record

deploy:
\tnpm run build && npm run test && ./deploy.sh

clean:
\trm -rf cypress/videos cypress/screenshots node_modules dist
  `;

  const mockBuildScript = `#!/bin/bash

set -e

echo "Starting build process..."

# Install dependencies
npm ci

# Build assets
npm run build:assets

# Run linting
npm run lint

# Run tests
echo "Running Cypress tests..."
cypress run --browser chrome --record

# Run E2E tests
echo "Running E2E tests..."
start-server-and-test start http://localhost:3000 "cypress run"

# Deploy if all tests pass
if [ "$1" = "deploy" ]; then
    echo "Deploying application..."
    ./deploy.sh
fi

echo "Build process completed successfully!"
  `;

  describe('Package.json Script Detection', () => {
    it('should detect Cypress scripts in package.json', async () => {
      const packagePath = path.join(mockProjectPath, 'package.json');
      const scripts = await buildConverter.detectCypressScripts(packagePath);

      expect(scripts).toEqual(
        expect.arrayContaining([
          'test',
          'test:headless',
          'test:chrome',
          'test:firefox',
          'cy:open',
          'cy:run',
          'cy:run:chrome',
          'cy:run:firefox',
          'cy:run:parallel',
          'e2e',
          'e2e:chrome'
        ])
      );
    });

    it('should identify start-server-and-test usage', async () => {
      const packagePath = path.join(mockProjectPath, 'package.json');
      const hasStartServerAndTest = await buildConverter.hasStartServerAndTest(packagePath);

      expect(hasStartServerAndTest).toBe(true);
    });

    it('should parse package.json correctly', async () => {
      const packagePath = path.join(mockProjectPath, 'package.json');
      const packageData = await buildConverter.parsePackageJson(packagePath);

      expect(packageData).toEqual(mockPackageJson);
    });
  });

  describe('Package.json Script Migration', () => {
    it('should convert Cypress scripts to Playwright', async () => {
      const packagePath = path.join(mockProjectPath, 'package.json');
      const convertedPackage = await buildConverter.convertPackageJsonScripts(packagePath);

      expect(convertedPackage.scripts).toEqual(
        expect.objectContaining({
          'test': 'playwright test',
          'test:headless': 'playwright test',
          'test:chrome': 'playwright test --project chromium',
          'test:firefox': 'playwright test --project firefox'
        })
      );
    });

    it('should convert cy: prefixed scripts', async () => {
      const packagePath = path.join(mockProjectPath, 'package.json');
      const convertedPackage = await buildConverter.convertPackageJsonScripts(packagePath);

      expect(convertedPackage.scripts).toEqual(
        expect.objectContaining({
          'pw:open': 'playwright test --ui',
          'pw:run': 'playwright test',
          'pw:run:chrome': 'playwright test --project chromium',
          'pw:run:firefox': 'playwright test --project firefox'
        })
      );
    });

    it('should convert start-server-and-test patterns', async () => {
      const packagePath = path.join(mockProjectPath, 'package.json');
      const convertedPackage = await buildConverter.convertPackageJsonScripts(packagePath);

      expect(convertedPackage.scripts.e2e).toBe('start-server-and-test start http://localhost:3000 "playwright test"');
      expect(convertedPackage.scripts['e2e:chrome']).toBe('start-server-and-test start http://localhost:3000 "playwright test --project chromium"');
    });

    it('should preserve non-Cypress scripts unchanged', async () => {
      const packagePath = path.join(mockProjectPath, 'package.json');
      const convertedPackage = await buildConverter.convertPackageJsonScripts(packagePath);

      expect(convertedPackage.scripts).toEqual(
        expect.objectContaining({
          'build:assets': 'webpack --mode production',
          'start': 'node server.js',
          'dev': 'nodemon server.js',
          'lint': 'eslint src/**/*.js'
        })
      );
    });

    it('should update dependencies to include Playwright', async () => {
      const packagePath = path.join(mockProjectPath, 'package.json');
      const convertedPackage = await buildConverter.convertPackageJsonScripts(packagePath);

      expect(convertedPackage.devDependencies).toEqual(
        expect.objectContaining({
          '@playwright/test': expect.any(String)
        })
      );
      expect(convertedPackage.devDependencies).not.toHaveProperty('cypress');
    });

    it('should handle build scripts that include tests', async () => {
      const packagePath = path.join(mockProjectPath, 'package.json');
      const convertedPackage = await buildConverter.convertPackageJsonScripts(packagePath);

      expect(convertedPackage.scripts.build).toBe('npm run build:assets && npm run test');
      expect(convertedPackage.scripts.deploy).toBe('npm run build && npm run test && deploy.sh');
    });
  });

  describe('Custom Build Script Conversion', () => {
    it('should detect build scripts with Cypress commands', () => {
      const hasCypress = buildConverter.hasCypressCommands(mockBuildScript);

      expect(hasCypress).toBe(true);
    });

    it('should convert Cypress commands in shell scripts', async () => {
      const convertedScript = await buildConverter.convertBuildScript(mockBuildScript);

      expect(convertedScript).toContain('playwright test --project chromium');
      expect(convertedScript).toContain('start-server-and-test start http://localhost:3000 "playwright test"');
      expect(convertedScript).not.toContain('cypress run');
    });

    it('should preserve non-Cypress commands in shell scripts', async () => {
      const convertedScript = await buildConverter.convertBuildScript(mockBuildScript);

      expect(convertedScript).toContain('npm ci');
      expect(convertedScript).toContain('npm run build:assets');
      expect(convertedScript).toContain('npm run lint');
      expect(convertedScript).toContain('./deploy.sh');
    });

    it('should update script comments appropriately', async () => {
      const convertedScript = await buildConverter.convertBuildScript(mockBuildScript);

      expect(convertedScript).toContain('Running Playwright tests...');
      expect(convertedScript).not.toContain('Running Cypress tests...');
    });
  });

  describe('Makefile Conversion', () => {
    it('should detect Cypress commands in Makefile', () => {
      const hasCypress = buildConverter.hasCypressCommands(mockMakefile);

      expect(hasCypress).toBe(true);
    });

    it('should convert Cypress targets in Makefile', async () => {
      const convertedMakefile = await buildConverter.convertMakefile(mockMakefile);

      expect(convertedMakefile).toContain('playwright test');
      expect(convertedMakefile).toContain('playwright test --project chromium');
      expect(convertedMakefile).toContain('playwright test --project firefox');
      expect(convertedMakefile).not.toContain('cypress run');
    });

    it('should preserve Makefile structure and formatting', async () => {
      const convertedMakefile = await buildConverter.convertMakefile(mockMakefile);

      expect(convertedMakefile).toContain('.PHONY: test install build deploy');
      expect(convertedMakefile).toContain('install:\n\tnpm install');
      expect(convertedMakefile).toContain('build:\n\tnpm run build:assets');
    });

    it('should update clean targets for Playwright', async () => {
      const convertedMakefile = await buildConverter.convertMakefile(mockMakefile);

      expect(convertedMakefile).toContain('rm -rf test-results playwright-report');
      expect(convertedMakefile).not.toContain('cypress/videos cypress/screenshots');
    });
  });

  describe('Start-Server-and-Test Pattern Migration', () => {
    it('should detect start-server-and-test usage', () => {
      const hasPattern = buildConverter.hasStartServerAndTestPattern(mockBuildScript);

      expect(hasPattern).toBe(true);
    });

    it('should convert start-server-and-test commands', async () => {
      const command = 'start-server-and-test start http://localhost:3000 "cypress run --browser chrome"';
      const convertedCommand = await buildConverter.convertStartServerAndTestCommand(command);

      expect(convertedCommand).toBe('start-server-and-test start http://localhost:3000 "playwright test --project chromium"');
    });

    it('should handle complex start-server-and-test patterns', async () => {
      const command = 'start-server-and-test "npm run dev" http://localhost:3000 "cypress run --record --parallel"';
      const convertedCommand = await buildConverter.convertStartServerAndTestCommand(command);

      expect(convertedCommand).toBe('start-server-and-test "npm run dev" http://localhost:3000 "playwright test"');
    });

    it('should preserve start-server-and-test dependency', async () => {
      const packagePath = path.join(mockProjectPath, 'package.json');
      const convertedPackage = await buildConverter.convertPackageJsonScripts(packagePath);

      expect(convertedPackage.devDependencies).toHaveProperty('start-server-and-test');
    });
  });

  describe('Deployment Script Updates', () => {
    it('should update deployment scripts with Playwright commands', async () => {
      const deployScript = `#!/bin/bash
npm run build
cypress run --record
if [ $? -eq 0 ]; then
    echo "Tests passed, deploying..."
    ./deploy.sh
fi`;

      const convertedScript = await buildConverter.convertBuildScript(deployScript);

      expect(convertedScript).toContain('playwright test');
      expect(convertedScript).not.toContain('cypress run');
    });

    it('should handle conditional deployment based on test results', async () => {
      const convertedScript = await buildConverter.convertBuildScript(mockBuildScript);

      expect(convertedScript).toContain('if [ "$1" = "deploy" ]; then');
      expect(convertedScript).toContain('./deploy.sh');
    });

    it('should preserve deployment environment checks', async () => {
      const deployScriptWithEnv = `#!/bin/bash
if [ "$NODE_ENV" = "production" ]; then
    cypress run --record
    ./deploy.sh
fi`;

      const convertedScript = await buildConverter.convertBuildScript(deployScriptWithEnv);

      expect(convertedScript).toContain('if [ "$NODE_ENV" = "production" ]; then');
      expect(convertedScript).toContain('playwright test');
    });
  });

  describe('Build Pipeline Integration', () => {
    it('should convert complete build pipeline', async () => {
      const result = await buildConverter.convertBuildAutomation(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.success).toBe(true);
      expect(result.convertedFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'package.json' }),
          expect.objectContaining({ type: 'makefile' }),
          expect.objectContaining({ type: 'build-script' })
        ])
      );
    });

    it('should provide detailed conversion summary', async () => {
      const result = await buildConverter.convertBuildAutomation(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.summary).toMatchObject({
        scriptsConverted: expect.any(Number),
        commandsConverted: expect.any(Number),
        dependenciesUpdated: expect.any(Number),
        conversionTimeMs: expect.any(Number)
      });
    });

    it('should handle missing build files gracefully', async () => {
      mockFs.existsSync.mockImplementation(() => false);

      const result = await buildConverter.convertBuildAutomation(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('No build automation files found')
        ])
      );
    });

    it('should write converted files to correct output paths', async () => {
      await buildConverter.convertBuildAutomation(mockProjectPath, mockOutputPath);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockOutputPath, 'package.json'),
        expect.any(String),
        'utf8'
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed package.json gracefully', async () => {
      mockFs.readFileSync.mockImplementation(() => 'invalid json');

      await expect(
        buildConverter.parsePackageJson(path.join(mockProjectPath, 'package.json'))
      ).rejects.toThrow();
    });

    it('should handle scripts without Cypress commands', async () => {
      const noCypressPackage = {
        name: 'generic-project',
        scripts: {
          'build': 'webpack',
          'start': 'node server.js',
          'lint': 'eslint src'
        }
      };

      mockFs.readFileSync.mockImplementation(() => JSON.stringify(noCypressPackage));

      const convertedPackage = await buildConverter.convertPackageJsonScripts(
        path.join(mockProjectPath, 'package.json')
      );

      expect(convertedPackage.scripts).toEqual(noCypressPackage.scripts);
    });

    it('should preserve script execution order in complex builds', async () => {
      const complexScript = 'npm run lint && npm run build && cypress run && npm run deploy';
      const convertedScript = await buildConverter.convertBuildScript(complexScript);

      expect(convertedScript).toBe('npm run lint && npm run build && playwright test && npm run deploy');
    });
  });
});