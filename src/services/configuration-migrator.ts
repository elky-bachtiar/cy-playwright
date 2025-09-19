import { Logger } from '../utils/logger';
import { ConfigurationGenerationOptions } from '../validation/project-packaging-validator';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface CypressConfig {
  e2e?: {
    baseUrl?: string;
    viewportWidth?: number;
    viewportHeight?: number;
    video?: boolean;
    screenshotOnRunFailure?: boolean;
    defaultCommandTimeout?: number;
    requestTimeout?: number;
    responseTimeout?: number;
    pageLoadTimeout?: number;
    specPattern?: string | string[];
    supportFile?: string;
    fixturesFolder?: string;
    downloadsFolder?: string;
    screenshotsFolder?: string;
    videosFolder?: string;
  };
  component?: any;
  retries?: number;
  watchForFileChanges?: boolean;
  chromeWebSecurity?: boolean;
  modifyObstructiveCode?: boolean;
  blockHosts?: string[];
  experimentalStudio?: boolean;
  experimentalSourceRewriting?: boolean;
}

export interface MigrationResult {
  configContent: string;
  configFileName: string;
  migratedSettings: string[];
}

export interface GenerationResult {
  configContent: string;
  configFileName: string;
}

export class ConfigurationMigrator {
  private logger = new Logger('ConfigurationMigrator');

  async migrateCypressConfig(projectPath: string, options: ConfigurationGenerationOptions): Promise<MigrationResult> {
    this.logger.debug(`Migrating Cypress configuration from: ${projectPath}`);

    const cypressConfig = await this.readCypressConfig(projectPath);
    const migratedSettings: string[] = [];

    // Generate Playwright configuration based on Cypress settings
    let baseURL: string | undefined;
    let viewport: { width: number; height: number } | undefined;
    let timeouts: { actionTimeout?: number; navigationTimeout?: number } = {};
    let retries: number | undefined;
    let testDir = options.testDir;

    // Migrate base URL
    if (cypressConfig.e2e?.baseUrl) {
      baseURL = cypressConfig.e2e.baseUrl;
      migratedSettings.push('baseUrl');
    }

    // Migrate viewport settings
    if (cypressConfig.e2e?.viewportWidth || cypressConfig.e2e?.viewportHeight) {
      viewport = {
        width: cypressConfig.e2e.viewportWidth || 1280,
        height: cypressConfig.e2e.viewportHeight || 720
      };
      migratedSettings.push('viewport');
    }

    // Migrate timeout settings
    if (cypressConfig.e2e?.defaultCommandTimeout) {
      timeouts.actionTimeout = cypressConfig.e2e.defaultCommandTimeout;
      migratedSettings.push('actionTimeout');
    }

    if (cypressConfig.e2e?.pageLoadTimeout) {
      timeouts.navigationTimeout = cypressConfig.e2e.pageLoadTimeout;
      migratedSettings.push('navigationTimeout');
    }

    // Migrate retry settings
    if (cypressConfig.retries !== undefined) {
      retries = cypressConfig.retries;
      migratedSettings.push('retries');
    }

    // Migrate test directory pattern
    if (cypressConfig.e2e?.specPattern) {
      const pattern = Array.isArray(cypressConfig.e2e.specPattern)
        ? cypressConfig.e2e.specPattern[0]
        : cypressConfig.e2e.specPattern;

      // Extract directory from pattern (e.g., "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}" -> "tests")
      if (pattern.includes('cypress/e2e')) {
        testDir = 'tests'; // Default migration path
        migratedSettings.push('testDir');
      }
    }

    const configContent = this.generatePlaywrightConfigContent({
      ...options,
      baseURL,
      viewport,
      timeouts,
      retries,
      testDir,
      video: cypressConfig.e2e?.video ? 'retain-on-failure' : 'off',
      screenshot: cypressConfig.e2e?.screenshotOnRunFailure !== false ? 'only-on-failure' : 'off'
    });

    return {
      configContent,
      configFileName: 'playwright.config.ts',
      migratedSettings
    };
  }

  async generateNewConfig(options: ConfigurationGenerationOptions): Promise<GenerationResult> {
    this.logger.debug('Generating new Playwright configuration');

    const configContent = this.generatePlaywrightConfigContent(options);

    return {
      configContent,
      configFileName: 'playwright.config.ts'
    };
  }

  private async readCypressConfig(projectPath: string): Promise<CypressConfig> {
    const configPaths = [
      'cypress.config.ts',
      'cypress.config.js',
      'cypress.json'
    ];

    for (const configPath of configPaths) {
      const fullPath = path.join(projectPath, configPath);

      if (await fs.pathExists(fullPath)) {
        try {
          if (configPath.endsWith('.json')) {
            return await fs.readJson(fullPath);
          } else {
            // For .js/.ts files, we'll do basic parsing
            const content = await fs.readFile(fullPath, 'utf8');
            return this.parseCypressConfigFile(content);
          }
        } catch (error) {
          this.logger.warn(`Failed to read Cypress config: ${configPath}`, error);
        }
      }
    }

    this.logger.info('No Cypress configuration found, using defaults');
    return {};
  }

  private parseCypressConfigFile(content: string): CypressConfig {
    // Simplified parsing - in production, use proper AST parsing
    const config: CypressConfig = {};

    // Extract e2e configuration
    const e2eMatch = content.match(/e2e\s*:\s*{([^}]+)}/s);
    if (e2eMatch) {
      config.e2e = {};

      // Extract baseUrl
      const baseUrlMatch = e2eMatch[1].match(/baseUrl\s*:\s*['"`]([^'"`]+)['"`]/);
      if (baseUrlMatch) {
        config.e2e.baseUrl = baseUrlMatch[1];
      }

      // Extract viewport dimensions
      const viewportWidthMatch = e2eMatch[1].match(/viewportWidth\s*:\s*(\d+)/);
      const viewportHeightMatch = e2eMatch[1].match(/viewportHeight\s*:\s*(\d+)/);
      if (viewportWidthMatch) {
        config.e2e.viewportWidth = parseInt(viewportWidthMatch[1], 10);
      }
      if (viewportHeightMatch) {
        config.e2e.viewportHeight = parseInt(viewportHeightMatch[1], 10);
      }

      // Extract timeout settings
      const commandTimeoutMatch = e2eMatch[1].match(/defaultCommandTimeout\s*:\s*(\d+)/);
      if (commandTimeoutMatch) {
        config.e2e.defaultCommandTimeout = parseInt(commandTimeoutMatch[1], 10);
      }

      // Extract boolean settings
      const videoMatch = e2eMatch[1].match(/video\s*:\s*(true|false)/);
      if (videoMatch) {
        config.e2e.video = videoMatch[1] === 'true';
      }

      const screenshotMatch = e2eMatch[1].match(/screenshotOnRunFailure\s*:\s*(true|false)/);
      if (screenshotMatch) {
        config.e2e.screenshotOnRunFailure = screenshotMatch[1] === 'true';
      }
    }

    // Extract retry configuration
    const retriesMatch = content.match(/retries\s*:\s*(\d+)/);
    if (retriesMatch) {
      config.retries = parseInt(retriesMatch[1], 10);
    }

    return config;
  }

  private generatePlaywrightConfigContent(options: ConfigurationGenerationOptions & {
    baseURL?: string;
    viewport?: { width: number; height: number };
    timeouts?: { actionTimeout?: number; navigationTimeout?: number };
    retries?: number;
  }): string {
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

    let useSection = '';
    const useOptions: string[] = [];

    // Add base URL if specified
    if (options.baseURL) {
      useOptions.push(`baseURL: '${options.baseURL}'`);
    }

    // Add viewport if specified
    if (options.viewport) {
      useOptions.push(`viewport: { width: ${options.viewport.width}, height: ${options.viewport.height} }`);
    }

    // Add timeout settings
    if (options.timeouts?.actionTimeout) {
      useOptions.push(`actionTimeout: ${options.timeouts.actionTimeout}`);
    }

    if (options.timeouts?.navigationTimeout) {
      useOptions.push(`navigationTimeout: ${options.timeouts.navigationTimeout}`);
    }

    // Add screenshot setting
    if (options.screenshot) {
      useOptions.push(`screenshot: '${options.screenshot}'`);
    }

    // Add video setting
    if (options.video) {
      useOptions.push(`video: '${options.video}'`);
    }

    // Add headless setting
    useOptions.push(`headless: ${options.headless}`);

    // Add trace setting
    useOptions.push(`trace: 'on-first-retry'`);

    if (useOptions.length > 0) {
      useSection = `\n  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    ${useOptions.join(',\n    ')},
  },`;
    }

    return `import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './${options.testDir}',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? ${options.retries || 2} : ${options.retries || 0},

  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',${useSection}

  /* Configure projects for major browsers */
  projects: [
    ${browsers}
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: '${options.baseURL || 'http://127.0.0.1:3000'}',
  //   reuseExistingServer: !process.env.CI,
  // },
});
`;
  }
}