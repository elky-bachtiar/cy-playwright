import * as fs from 'fs-extra';
import * as path from 'path';
import * as vm from 'vm';
import {
  CypressConfig,
  PlaywrightConfig,
  ConfigMigrationResult,
  ConfigParseResult
} from './types';

export class ConfigMigrator {

  /**
   * Parse a Cypress configuration file and extract settings
   */
  async parseConfigFile(configPath: string): Promise<ConfigParseResult> {
    try {
      if (!await fs.pathExists(configPath)) {
        return {
          success: false,
          error: `Configuration file not found: ${configPath}`
        };
      }

      const fileExtension = path.extname(configPath);
      const fileContent = await fs.readFile(configPath, 'utf8');

      let config: CypressConfig;

      if (fileExtension === '.json') {
        // Handle legacy cypress.json files
        config = await this.parseJsonConfig(fileContent);
      } else if (fileExtension === '.js' || fileExtension === '.ts') {
        // Handle cypress.config.js/ts files
        config = await this.parseJsConfig(fileContent, configPath);
      } else {
        return {
          success: false,
          error: `Unsupported configuration file type: ${fileExtension}`
        };
      }

      return {
        success: true,
        config,
        filePath: configPath
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to parse configuration file: ${error}`
      };
    }
  }

  /**
   * Parse legacy cypress.json configuration
   */
  private async parseJsonConfig(content: string): Promise<CypressConfig> {
    const jsonConfig = JSON.parse(content);

    // Convert legacy properties to new format
    const config: CypressConfig = {
      ...jsonConfig,
      e2e: {
        ...jsonConfig.e2e,
        supportFile: jsonConfig.supportFile,
        specPattern: jsonConfig.integrationFolder ?
          `${jsonConfig.integrationFolder}/**/*.spec.{js,jsx,ts,tsx}` :
          jsonConfig.testFiles
      }
    };

    // Remove legacy properties
    delete (config as any).supportFile;
    delete (config as any).integrationFolder;
    delete (config as any).testFiles;
    delete (config as any).pluginsFile;

    return config;
  }

  /**
   * Parse JavaScript/TypeScript configuration files
   */
  private async parseJsConfig(content: string, configPath: string): Promise<CypressConfig> {
    // Clean up the content for evaluation
    let cleanContent = content
      // Remove TypeScript import statements
      .replace(/import\s+.*?from\s+['"][^'"]*['"];?\s*/g, '')
      // Remove export default
      .replace(/export\s+default\s+/, '')
      // Handle defineConfig wrapper
      .replace(/defineConfig\s*\(\s*({[\s\S]*})\s*\)/g, '$1')
      // Convert module.exports to return statement
      .replace(/module\.exports\s*=\s*/, 'return ')
      // Handle function expressions in setupNodeEvents (but preserve simple functions)
      .replace(/setupNodeEvents\s*\([^)]*\)\s*\{[^}]*\}/g, 'function() { return {}; }');

    // Create a sandbox environment for safe evaluation
    const sandbox = {
      process: {
        env: process.env
      },
      require: (moduleName: string) => {
        // Mock common cypress modules
        if (moduleName === 'cypress') {
          return { defineConfig: (config: any) => config };
        }
        return {};
      },
      console: { log: () => {} },
      module: { exports: {} },
      exports: {}
    };

    try {
      // Wrap content in a function for safe evaluation
      const wrappedContent = `
        (function() {
          ${cleanContent}
        })()
      `;

      const context = vm.createContext(sandbox);
      const config = vm.runInContext(wrappedContent, context, {
        filename: configPath,
        timeout: 5000
      });

      // Handle case where config might be undefined or null
      if (!config || typeof config !== 'object') {
        throw new Error('Invalid configuration object returned');
      }

      return config as CypressConfig;

    } catch (error) {
      // For TypeScript files or complex configs, try regex parsing as fallback
      if (configPath.endsWith('.ts') || content.includes('defineConfig')) {
        const regexConfig = this.parseConfigWithRegex(content);

        // If regex parsing finds some config, use it
        if (Object.keys(regexConfig).length > 0) {
          return regexConfig;
        }
      }

      // If VM execution fails and no fallback works, it's a parsing error
      throw new Error(`Failed to parse JavaScript config: ${error}`);
    }
  }

  /**
   * Fallback method to parse config using regex patterns
   */
  private parseConfigWithRegex(content: string): CypressConfig {
    const config: CypressConfig = {};

    // Extract common configuration properties
    const patterns = {
      baseUrl: /baseUrl\s*:\s*['"]([^'"]+)['"]/,
      viewportWidth: /viewportWidth\s*:\s*(\d+)/,
      viewportHeight: /viewportHeight\s*:\s*(\d+)/,
      defaultCommandTimeout: /defaultCommandTimeout\s*:\s*(\d+)/,
      requestTimeout: /requestTimeout\s*:\s*(\d+)/,
      responseTimeout: /responseTimeout\s*:\s*(\d+)/,
      pageLoadTimeout: /pageLoadTimeout\s*:\s*(\d+)/,
      video: /video\s*:\s*(true|false)/,
      screenshotOnRunFailure: /screenshotOnRunFailure\s*:\s*(true|false)/
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = content.match(pattern);
      if (match) {
        if (key === 'video' || key === 'screenshotOnRunFailure') {
          (config as any)[key] = match[1] === 'true';
        } else if (key === 'baseUrl') {
          (config as any)[key] = match[1];
        } else {
          (config as any)[key] = parseInt(match[1], 10);
        }
      }
    }

    // Extract environment variables
    const envMatch = content.match(/env\s*:\s*\{([^}]+)\}/s);
    if (envMatch) {
      config.env = {};
      const envContent = envMatch[1];

      // Extract simple key-value pairs
      const envPairs = envContent.match(/(\w+)\s*:\s*['"]([^'"]+)['"]/g);
      if (envPairs) {
        for (const pair of envPairs) {
          const match = pair.match(/(\w+)\s*:\s*['"]([^'"]+)['"]/);
          if (match) {
            config.env[match[1]] = match[2];
          }
        }
      }

      // Extract boolean and number values
      const envBooleans = envContent.match(/(\w+)\s*:\s*(true|false)/g);
      if (envBooleans) {
        for (const pair of envBooleans) {
          const match = pair.match(/(\w+)\s*:\s*(true|false)/);
          if (match) {
            config.env[match[1]] = match[2] === 'true';
          }
        }
      }

      const envNumbers = envContent.match(/(\w+)\s*:\s*(\d+)/g);
      if (envNumbers) {
        for (const pair of envNumbers) {
          const match = pair.match(/(\w+)\s*:\s*(\d+)/);
          if (match) {
            config.env[match[1]] = parseInt(match[2], 10);
          }
        }
      }
    }

    // Extract e2e configuration
    const e2eMatch = content.match(/e2e\s*:\s*\{([^}]+)\}/s);
    if (e2eMatch) {
      config.e2e = {};
      const e2eContent = e2eMatch[1];

      const supportFileMatch = e2eContent.match(/supportFile\s*:\s*['"]([^'"]+)['"]/);
      if (supportFileMatch) {
        config.e2e.supportFile = supportFileMatch[1];
      }

      const specPatternMatch = e2eContent.match(/specPattern\s*:\s*['"]([^'"]+)['"]/);
      if (specPatternMatch) {
        config.e2e.specPattern = specPatternMatch[1];
      }

      const baseUrlMatch = e2eContent.match(/baseUrl\s*:\s*['"]([^'"]+)['"]/);
      if (baseUrlMatch) {
        config.e2e.baseUrl = baseUrlMatch[1];
      }
    }

    return config;
  }

  /**
   * Migrate Cypress configuration to Playwright configuration
   */
  migrateConfig(cypressConfig: CypressConfig): ConfigMigrationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const unmappedSettings: string[] = [];

    try {
      const playwrightConfig: PlaywrightConfig = {
        testDir: 'tests',
        timeout: 30000,
        fullyParallel: true,
        forbidOnly: !!process.env.CI,
        retries: process.env.CI ? 2 : 0,
        workers: process.env.CI ? 1 : undefined,
        reporter: 'html',
        use: {
          actionTimeout: 0,
          baseURL: undefined,
          trace: 'on-first-retry',
          screenshot: 'only-on-failure',
          video: 'retain-on-failure'
        },
        projects: []
      };

      // Map basic settings
      if (cypressConfig.baseUrl) {
        playwrightConfig.use!.baseURL = cypressConfig.baseUrl;
      }

      // Override with e2e baseUrl if present
      if (cypressConfig.e2e?.baseUrl) {
        playwrightConfig.use!.baseURL = cypressConfig.e2e.baseUrl;
      }

      // Map viewport settings
      if (cypressConfig.viewportWidth && cypressConfig.viewportHeight) {
        playwrightConfig.use!.viewport = {
          width: cypressConfig.viewportWidth,
          height: cypressConfig.viewportHeight
        };
      }

      // Map timeout settings
      if (cypressConfig.defaultCommandTimeout) {
        playwrightConfig.use!.actionTimeout = cypressConfig.defaultCommandTimeout;
      }

      if (cypressConfig.pageLoadTimeout) {
        playwrightConfig.use!.navigationTimeout = cypressConfig.pageLoadTimeout;
        playwrightConfig.timeout = Math.max(
          playwrightConfig.timeout || 30000,
          cypressConfig.pageLoadTimeout
        );
      }

      // Map video settings
      if (cypressConfig.video !== undefined) {
        playwrightConfig.use!.video = cypressConfig.video ? 'on' : 'off';
      }

      // Map screenshot settings
      if (cypressConfig.screenshotOnRunFailure !== undefined) {
        playwrightConfig.use!.screenshot = cypressConfig.screenshotOnRunFailure ? 'only-on-failure' : 'off';
      }

      // Map test patterns
      if (cypressConfig.e2e?.specPattern) {
        const patterns = Array.isArray(cypressConfig.e2e.specPattern)
          ? cypressConfig.e2e.specPattern
          : [cypressConfig.e2e.specPattern];

        playwrightConfig.testMatch = patterns.map(pattern =>
          pattern.replace(/cypress\/(e2e|integration)/, 'tests')
                 .replace(/\.cy\./, '.spec.')
        );
      } else {
        playwrightConfig.testMatch = ['**/*.spec.{js,ts}'];
      }

      // Map exclude patterns
      if (cypressConfig.e2e?.excludeSpecPattern) {
        const excludePatterns = Array.isArray(cypressConfig.e2e.excludeSpecPattern)
          ? cypressConfig.e2e.excludeSpecPattern
          : [cypressConfig.e2e.excludeSpecPattern];

        playwrightConfig.testIgnore = excludePatterns.map(pattern =>
          pattern.replace(/cypress\/(e2e|integration)/, 'tests')
        );
      }

      // Create browser projects
      playwrightConfig.projects = [
        {
          name: 'chromium',
          use: { ...playwrightConfig.use }
        },
        {
          name: 'firefox',
          use: { ...playwrightConfig.use }
        },
        {
          name: 'webkit',
          use: { ...playwrightConfig.use }
        }
      ];

      // Handle environment variables
      if (cypressConfig.env && Object.keys(cypressConfig.env).length > 0) {
        warnings.push('Environment variables need manual setup in process.env or .env file');
        warnings.push(`Found env variables: ${Object.keys(cypressConfig.env).join(', ')}`);
      }

      // Handle support file
      if (cypressConfig.e2e?.supportFile) {
        warnings.push('Support file will need manual migration to Playwright fixtures/setup');
        warnings.push(`Support file: ${cypressConfig.e2e.supportFile}`);
      }

      // Handle component testing
      if (cypressConfig.component) {
        warnings.push('Component testing configuration detected - manual setup required for Playwright');
      }

      // Identify unmapped settings
      const mappedKeys = new Set([
        'baseUrl', 'viewportWidth', 'viewportHeight', 'defaultCommandTimeout',
        'requestTimeout', 'responseTimeout', 'pageLoadTimeout', 'video',
        'screenshotOnRunFailure', 'env', 'e2e', 'component'
      ]);

      for (const key of Object.keys(cypressConfig)) {
        if (!mappedKeys.has(key)) {
          unmappedSettings.push(key);
        }
      }

      if (unmappedSettings.length > 0) {
        warnings.push('Some Cypress settings could not be automatically mapped to Playwright');
        warnings.push(`Unmapped settings: ${unmappedSettings.join(', ')}`);
      }

      return {
        success: true,
        playwrightConfig,
        warnings,
        errors,
        unmappedSettings
      };

    } catch (error) {
      errors.push(`Configuration migration failed: ${error}`);

      return {
        success: false,
        playwrightConfig: { testDir: 'tests' },
        warnings,
        errors,
        unmappedSettings
      };
    }
  }

  /**
   * Generate Playwright configuration file content
   */
  generatePlaywrightConfig(config: PlaywrightConfig, isTypeScript: boolean = false): string {
    const imports = isTypeScript
      ? "import { defineConfig, devices } from '@playwright/test';"
      : "import { defineConfig, devices } from '@playwright/test';";

    const exportStatement = "export default defineConfig({";

    let configContent = '';

    // Add basic configuration
    if (config.testDir) {
      configContent += `  testDir: '${config.testDir}',\n`;
    }

    if (config.testMatch) {
      if (Array.isArray(config.testMatch)) {
        configContent += `  testMatch: ${JSON.stringify(config.testMatch)},\n`;
      } else {
        configContent += `  testMatch: '${config.testMatch}',\n`;
      }
    }

    if (config.testIgnore) {
      if (Array.isArray(config.testIgnore)) {
        configContent += `  testIgnore: ${JSON.stringify(config.testIgnore)},\n`;
      } else {
        configContent += `  testIgnore: '${config.testIgnore}',\n`;
      }
    }

    if (config.timeout) {
      configContent += `  timeout: ${config.timeout},\n`;
    }

    if (config.fullyParallel !== undefined) {
      configContent += `  fullyParallel: ${config.fullyParallel},\n`;
    }

    if (config.forbidOnly !== undefined) {
      configContent += `  forbidOnly: ${config.forbidOnly},\n`;
    }

    if (config.retries !== undefined) {
      configContent += `  retries: ${config.retries},\n`;
    }

    if (config.workers !== undefined) {
      configContent += `  workers: ${config.workers},\n`;
    }

    if (config.reporter) {
      if (Array.isArray(config.reporter)) {
        configContent += `  reporter: ${JSON.stringify(config.reporter, null, 2).replace(/\n/g, '\n  ')},\n`;
      } else {
        configContent += `  reporter: '${config.reporter}',\n`;
      }
    }

    // Add use configuration
    if (config.use) {
      configContent += '  use: {\n';

      if (config.use.baseURL) {
        configContent += `    baseURL: '${config.use.baseURL}',\n`;
      }

      if (config.use.trace) {
        configContent += `    trace: '${config.use.trace}',\n`;
      }

      if (config.use.screenshot) {
        configContent += `    screenshot: '${config.use.screenshot}',\n`;
      }

      if (config.use.video) {
        configContent += `    video: '${config.use.video}',\n`;
      }

      if (config.use.actionTimeout) {
        configContent += `    actionTimeout: ${config.use.actionTimeout},\n`;
      }

      if (config.use.navigationTimeout) {
        configContent += `    navigationTimeout: ${config.use.navigationTimeout},\n`;
      }

      if (config.use.viewport) {
        configContent += `    viewport: { width: ${config.use.viewport.width}, height: ${config.use.viewport.height} },\n`;
      }

      if (config.use.ignoreHTTPSErrors !== undefined) {
        configContent += `    ignoreHTTPSErrors: ${config.use.ignoreHTTPSErrors},\n`;
      }

      configContent += '  },\n';
    }

    // Add output directory
    if (config.outputDir) {
      configContent += `  outputDir: '${config.outputDir}',\n`;
    }

    // Add projects
    if (config.projects && config.projects.length > 0) {
      configContent += '  projects: [\n';

      for (const project of config.projects) {
        configContent += '    {\n';
        configContent += `      name: '${project.name}',\n`;

        if (project.use) {
          configContent += '      use: {\n';

          // Use devices if available for common browser names
          if (['chromium', 'firefox', 'webkit'].includes(project.name)) {
            configContent += `        ...devices['Desktop ${project.name.charAt(0).toUpperCase() + project.name.slice(1)}'],\n`;
          }

          // Add custom use properties
          for (const [key, value] of Object.entries(project.use)) {
            if (key !== 'baseURL' && key !== 'trace' && key !== 'screenshot' && key !== 'video') {
              if (typeof value === 'string') {
                configContent += `        ${key}: '${value}',\n`;
              } else if (typeof value === 'object') {
                configContent += `        ${key}: ${JSON.stringify(value)},\n`;
              } else {
                configContent += `        ${key}: ${value},\n`;
              }
            }
          }

          configContent += '      },\n';
        }

        configContent += '    },\n';
      }

      configContent += '  ],\n';
    }

    // Add web server configuration
    if (config.webServer) {
      configContent += '  webServer: {\n';
      configContent += `    command: '${config.webServer.command}',\n`;
      configContent += `    port: ${config.webServer.port},\n`;
      if (config.webServer.reuseExistingServer !== undefined) {
        configContent += `    reuseExistingServer: ${config.webServer.reuseExistingServer},\n`;
      }
      configContent += '  },\n';
    }

    // Remove trailing comma and close configuration
    configContent = configContent.replace(/,\n$/, '\n');

    return `${imports}\n\n${exportStatement}\n${configContent}});\n`;
  }

  /**
   * Write Playwright configuration to file
   */
  async writePlaywrightConfig(
    config: PlaywrightConfig,
    outputPath: string,
    isTypeScript: boolean = false
  ): Promise<void> {
    const configContent = this.generatePlaywrightConfig(config, isTypeScript);
    const fileName = isTypeScript ? 'playwright.config.ts' : 'playwright.config.js';
    const fullPath = path.join(outputPath, fileName);

    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, configContent, 'utf8');
  }
}