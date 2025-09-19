import { Logger } from '../utils/logger';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface PackageJsonOptions {
  name: string;
  useTypeScript: boolean;
}

export interface PlaywrightConfigOptions {
  browsers: string[];
  testDirectory: string;
  useTypeScript: boolean;
}

export class TemplateGenerator {
  private logger = new Logger('TemplateGenerator');

  async generatePackageJson(projectPath: string, options: PackageJsonOptions): Promise<void> {
    this.logger.debug(`Generating package.json for: ${options.name}`);

    const packageJson = {
      name: options.name,
      version: '1.0.0',
      description: 'Playwright test suite converted from Cypress',
      main: 'index.js',
      scripts: {
        test: 'playwright test',
        'test:headed': 'playwright test --headed',
        'test:ui': 'playwright test --ui',
        'test:debug': 'playwright test --debug',
        'test:codegen': 'playwright codegen',
        'test:report': 'playwright show-report'
      },
      keywords: ['playwright', 'testing', 'e2e'],
      author: '',
      license: 'ISC',
      devDependencies: {
        '@playwright/test': '^1.40.0',
        'playwright': '^1.40.0'
      },
      ...(options.useTypeScript && {
        devDependencies: {
          '@playwright/test': '^1.40.0',
          'playwright': '^1.40.0',
          'typescript': '^5.0.0',
          '@types/node': '^20.0.0'
        }
      })
    };

    const packageJsonPath = path.join(projectPath, 'package.json');
    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
  }

  async generatePlaywrightConfig(projectPath: string, options: PlaywrightConfigOptions): Promise<void> {
    this.logger.debug(`Generating Playwright config for: ${projectPath}`);

    const configFileName = options.useTypeScript ? 'playwright.config.ts' : 'playwright.config.js';
    const configPath = path.join(projectPath, configFileName);

    let configContent: string;

    if (options.useTypeScript) {
      configContent = this.generateTypeScriptConfig(options);
    } else {
      configContent = this.generateJavaScriptConfig(options);
    }

    await fs.writeFile(configPath, configContent, 'utf8');
  }

  async generateTsConfig(projectPath: string): Promise<void> {
    this.logger.debug(`Generating tsconfig.json for: ${projectPath}`);

    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        lib: ['ES2020'],
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        types: ['node', '@playwright/test']
      },
      include: [
        'tests/**/*',
        'playwright.config.ts'
      ],
      exclude: [
        'node_modules',
        'test-results',
        'playwright-report'
      ]
    };

    const tsConfigPath = path.join(projectPath, 'tsconfig.json');
    await fs.writeJson(tsConfigPath, tsConfig, { spaces: 2 });
  }

  async generateExampleTest(filePath: string, useTypeScript: boolean): Promise<void> {
    this.logger.debug(`Generating example test: ${filePath}`);

    let testContent: string;

    if (useTypeScript) {
      testContent = `import { test, expect } from '@playwright/test';

test.describe('Example Test Suite', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Home/);
  });

  test('should navigate to about page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/about/);
  });

  test('should fill out contact form', async ({ page }) => {
    await page.goto('/contact');

    await page.getByLabel('Name').fill('John Doe');
    await page.getByLabel('Email').fill('john@example.com');
    await page.getByLabel('Message').fill('Hello, this is a test message.');

    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('Thank you for your message')).toBeVisible();
  });
});
`;
    } else {
      testContent = `const { test, expect } = require('@playwright/test');

test.describe('Example Test Suite', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Home/);
  });

  test('should navigate to about page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/about/);
  });

  test('should fill out contact form', async ({ page }) => {
    await page.goto('/contact');

    await page.getByLabel('Name').fill('John Doe');
    await page.getByLabel('Email').fill('john@example.com');
    await page.getByLabel('Message').fill('Hello, this is a test message.');

    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('Thank you for your message')).toBeVisible();
  });
});
`;
    }

    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, testContent, 'utf8');
  }

  async generateGitIgnore(projectPath: string): Promise<void> {
    this.logger.debug(`Generating .gitignore for: ${projectPath}`);

    const gitIgnoreContent = `# Playwright
test-results/
playwright-report/
playwright/.cache/

# Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# Logs
logs
*.log

# Dependency directories
node_modules/
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDEs
.vscode/
.idea/
*.swp
*.swo

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# TypeScript
*.tsbuildinfo

# Build outputs
dist/
build/
`;

    const gitIgnorePath = path.join(projectPath, '.gitignore');
    await fs.writeFile(gitIgnorePath, gitIgnoreContent, 'utf8');
  }

  async generateReadme(projectPath: string, projectName: string): Promise<void> {
    this.logger.debug(`Generating README.md for: ${projectName}`);

    const readmeContent = `# ${projectName}

This project contains Playwright tests converted from Cypress.

## Setup

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Install Playwright browsers:
   \`\`\`bash
   npx playwright install
   \`\`\`

## Running Tests

Run all tests:
\`\`\`bash
npm test
\`\`\`

Run tests in headed mode:
\`\`\`bash
npm run test:headed
\`\`\`

Run tests with UI mode:
\`\`\`bash
npm run test:ui
\`\`\`

Debug tests:
\`\`\`bash
npm run test:debug
\`\`\`

Generate test code:
\`\`\`bash
npm run test:codegen
\`\`\`

View test report:
\`\`\`bash
npm run test:report
\`\`\`

## Test Structure

- \`tests/\` - Contains all test files
- \`playwright.config.ts\` - Playwright configuration
- \`test-results/\` - Test execution results (auto-generated)
- \`playwright-report/\` - HTML test reports (auto-generated)

## Configuration

The \`playwright.config.ts\` file contains the main configuration including:

- Browser settings (Chromium, Firefox, WebKit)
- Test directory
- Base URL
- Timeouts
- Reporter settings

## Writing Tests

Playwright tests use a similar structure to other testing frameworks:

\`\`\`typescript
import { test, expect } from '@playwright/test';

test('example test', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});
\`\`\`

## Key Differences from Cypress

1. **Auto-waiting**: Playwright automatically waits for elements
2. **Multi-browser**: Native support for Chromium, Firefox, and WebKit
3. **Parallel execution**: Tests run in parallel by default
4. **Better debugging**: Built-in trace viewer and debugging tools

## Useful Resources

- [Playwright Documentation](https://playwright.dev)
- [API Reference](https://playwright.dev/docs/api/class-playwright)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Migration Guide](https://playwright.dev/docs/migrating-tests)

## Generated Files

This project was automatically converted from Cypress. Original test files may be available in the \`cypress-original/\` directory for reference.
`;

    const readmePath = path.join(projectPath, 'README.md');
    await fs.writeFile(readmePath, readmeContent, 'utf8');
  }

  private generateTypeScriptConfig(options: PlaywrightConfigOptions): string {
    const browsers = options.browsers.map(browser => {
      const browserConfigs = {
        chromium: `{
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }`,
        firefox: `{
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    }`,
        webkit: `{
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    }`
      };
      return browserConfigs[browser as keyof typeof browserConfigs] || '';
    }).filter(Boolean).join(',\n    ');

    return `import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './${options.testDirectory}',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like \`await page.goto('/')\`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Record video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    ${browsers}
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
`;
  }

  private generateJavaScriptConfig(options: PlaywrightConfigOptions): string {
    const browsers = options.browsers.map(browser => {
      const browserConfigs = {
        chromium: `{
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }`,
        firefox: `{
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    }`,
        webkit: `{
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    }`
      };
      return browserConfigs[browser as keyof typeof browserConfigs] || '';
    }).filter(Boolean).join(',\n    ');

    return `const { defineConfig, devices } = require('@playwright/test');

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './${options.testDirectory}',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like \`await page.goto('/')\`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Record video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    ${browsers}
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
`;
  }
}