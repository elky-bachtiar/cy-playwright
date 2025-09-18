import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ConfigMigrator } from '../src/config-migrator';
import { CypressConfig, PlaywrightConfig, ConfigMigrationResult, ConfigParseResult } from '../src/types';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('ConfigMigrator', () => {
  let migrator: ConfigMigrator;
  const testTempDir = path.join(__dirname, 'temp-config-test');

  beforeEach(() => {
    migrator = new ConfigMigrator();
    fs.ensureDirSync(testTempDir);
  });

  afterEach(() => {
    fs.removeSync(testTempDir);
  });

  describe('parseConfigFile', () => {
    it('should parse basic cypress.config.js file', async () => {
      const configContent = `
        module.exports = {
          baseUrl: 'http://localhost:3000',
          viewportWidth: 1280,
          viewportHeight: 720,
          defaultCommandTimeout: 10000,
          e2e: {
            supportFile: 'cypress/support/e2e.js',
            specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}'
          }
        };
      `;

      const configPath = path.join(testTempDir, 'cypress.config.js');
      await fs.writeFile(configPath, configContent);

      const result: ConfigParseResult = await migrator.parseConfigFile(configPath);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config!.baseUrl).toBe('http://localhost:3000');
      expect(result.config!.viewportWidth).toBe(1280);
      expect(result.config!.viewportHeight).toBe(720);
      expect(result.config!.defaultCommandTimeout).toBe(10000);
      expect(result.config!.e2e?.supportFile).toBe('cypress/support/e2e.js');
      expect(result.config!.e2e?.specPattern).toBe('cypress/e2e/**/*.cy.{js,jsx,ts,tsx}');
    });

    it('should parse cypress.config.ts file with TypeScript export', async () => {
      const configContent = `
        import { defineConfig } from 'cypress';

        export default defineConfig({
          baseUrl: 'https://example.com',
          viewportWidth: 1920,
          viewportHeight: 1080,
          video: false,
          screenshotOnRunFailure: true,
          env: {
            apiUrl: 'https://api.example.com',
            authToken: 'test-token'
          },
          e2e: {
            baseUrl: 'https://e2e.example.com',
            setupNodeEvents(on, config) {
              // implement node event listeners here
            }
          }
        });
      `;

      const configPath = path.join(testTempDir, 'cypress.config.ts');
      await fs.writeFile(configPath, configContent);

      const result: ConfigParseResult = await migrator.parseConfigFile(configPath);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config!.baseUrl).toBe('https://example.com');
      expect(result.config!.viewportWidth).toBe(1920);
      expect(result.config!.video).toBe(false);
      expect(result.config!.env?.apiUrl).toBe('https://api.example.com');
      expect(result.config!.e2e?.baseUrl).toBe('https://e2e.example.com');
    });

    it('should handle legacy cypress.json configuration', async () => {
      const configContent = `{
        "baseUrl": "http://legacy.example.com",
        "viewportWidth": 1024,
        "viewportHeight": 768,
        "defaultCommandTimeout": 8000,
        "requestTimeout": 15000,
        "integrationFolder": "cypress/integration",
        "supportFile": "cypress/support/index.js",
        "pluginsFile": "cypress/plugins/index.js"
      }`;

      const configPath = path.join(testTempDir, 'cypress.json');
      await fs.writeFile(configPath, configContent);

      const result: ConfigParseResult = await migrator.parseConfigFile(configPath);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config!.baseUrl).toBe('http://legacy.example.com');
      expect(result.config!.viewportWidth).toBe(1024);
      expect(result.config!.defaultCommandTimeout).toBe(8000);
      expect(result.config!.requestTimeout).toBe(15000);
    });

    it('should handle config file with environment variables', async () => {
      const configContent = `
        module.exports = {
          baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
          env: {
            environment: process.env.NODE_ENV || 'development',
            apiKey: process.env.API_KEY,
            featureFlags: {
              newDesign: true,
              betaFeatures: false
            }
          }
        };
      `;

      const configPath = path.join(testTempDir, 'cypress.config.js');
      await fs.writeFile(configPath, configContent);

      const result: ConfigParseResult = await migrator.parseConfigFile(configPath);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config!.env).toBeDefined();
    });

    it('should return error for invalid config file', async () => {
      const configContent = `
        this is not valid JavaScript at all
        { broken syntax without proper structure
        baseUrl: 'http://localhost:3000' (missing object wrapper)
      `;

      const configPath = path.join(testTempDir, 'invalid-cypress.config.js');
      await fs.writeFile(configPath, configContent);

      const result: ConfigParseResult = await migrator.parseConfigFile(configPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.config).toBeUndefined();
    });

    it('should handle missing config file', async () => {
      const nonExistentPath = path.join(testTempDir, 'nonexistent.config.js');

      const result: ConfigParseResult = await migrator.parseConfigFile(nonExistentPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not found');
    });
  });

  describe('migrateConfig', () => {
    it('should migrate basic Cypress config to Playwright config', () => {
      const cypressConfig: CypressConfig = {
        baseUrl: 'http://localhost:3000',
        viewportWidth: 1280,
        viewportHeight: 720,
        defaultCommandTimeout: 10000,
        video: true,
        screenshotOnRunFailure: true
      };

      const result: ConfigMigrationResult = migrator.migrateConfig(cypressConfig);

      expect(result.success).toBe(true);
      expect(result.playwrightConfig.use?.baseURL).toBe('http://localhost:3000');
      expect(result.playwrightConfig.use?.viewport).toEqual({ width: 1280, height: 720 });
      expect(result.playwrightConfig.use?.actionTimeout).toBe(10000);
      expect(result.playwrightConfig.use?.video).toBe('on');
      expect(result.playwrightConfig.use?.screenshot).toBe('only-on-failure');
    });

    it('should create multi-browser projects configuration', () => {
      const cypressConfig: CypressConfig = {
        baseUrl: 'http://localhost:3000',
        e2e: {
          specPattern: 'cypress/e2e/**/*.cy.{js,ts}'
        }
      };

      const result: ConfigMigrationResult = migrator.migrateConfig(cypressConfig);

      expect(result.success).toBe(true);
      expect(result.playwrightConfig.projects).toBeDefined();
      expect(result.playwrightConfig.projects!.length).toBeGreaterThan(1);

      const projectNames = result.playwrightConfig.projects!.map(p => p.name);
      expect(projectNames).toContain('chromium');
      expect(projectNames).toContain('firefox');
      expect(projectNames).toContain('webkit');
    });

    it('should handle environment variables mapping', () => {
      const cypressConfig: CypressConfig = {
        env: {
          apiUrl: 'https://api.example.com',
          timeout: 30000,
          enableLogging: true,
          testUser: {
            username: 'testuser',
            password: 'testpass'
          }
        }
      };

      const result: ConfigMigrationResult = migrator.migrateConfig(cypressConfig);

      expect(result.success).toBe(true);
      expect(result.playwrightConfig.use).toBeDefined();
      // Environment variables should be preserved as process.env references
      expect(result.warnings).toContain('Environment variables need manual setup in process.env or .env file');
    });

    it('should map test directory patterns correctly', () => {
      const cypressConfig: CypressConfig = {
        e2e: {
          specPattern: [
            'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
            'cypress/integration/**/*.spec.{js,ts}'
          ],
          excludeSpecPattern: [
            'cypress/e2e/**/*.skip.cy.js'
          ]
        }
      };

      const result: ConfigMigrationResult = migrator.migrateConfig(cypressConfig);

      expect(result.success).toBe(true);
      expect(result.playwrightConfig.testDir).toBe('tests');
      expect(result.playwrightConfig.testMatch).toBeDefined();
      expect(result.playwrightConfig.testIgnore).toBeDefined();
    });

    it('should handle timeout configurations', () => {
      const cypressConfig: CypressConfig = {
        defaultCommandTimeout: 8000,
        requestTimeout: 15000,
        responseTimeout: 20000,
        pageLoadTimeout: 30000
      };

      const result: ConfigMigrationResult = migrator.migrateConfig(cypressConfig);

      expect(result.success).toBe(true);
      expect(result.playwrightConfig.use?.actionTimeout).toBe(8000);
      expect(result.playwrightConfig.use?.navigationTimeout).toBe(30000);
      expect(result.playwrightConfig.timeout).toBe(30000);
    });

    it('should identify unmapped settings', () => {
      const cypressConfig: CypressConfig = {
        baseUrl: 'http://localhost:3000',
        trashAssetsBeforeRuns: true,
        // @ts-ignore - Testing unmapped property
        customProperty: 'unmapped-value',
        // @ts-ignore - Testing unmapped property
        experimentalSettings: {
          newFeature: true
        }
      };

      const result: ConfigMigrationResult = migrator.migrateConfig(cypressConfig);

      expect(result.success).toBe(true);
      expect(result.unmappedSettings).toContain('trashAssetsBeforeRuns');
      expect(result.warnings).toContain('Some Cypress settings could not be automatically mapped to Playwright');
    });

    it('should handle component testing configuration', () => {
      const cypressConfig: CypressConfig = {
        component: {
          specPattern: 'src/**/*.cy.{js,jsx,ts,tsx}',
          devServer: {
            framework: 'react',
            bundler: 'webpack'
          }
        }
      };

      const result: ConfigMigrationResult = migrator.migrateConfig(cypressConfig);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Component testing configuration detected - manual setup required for Playwright');
    });
  });

  describe('generatePlaywrightConfig', () => {
    it('should generate valid playwright.config.js content', () => {
      const playwrightConfig: PlaywrightConfig = {
        testDir: 'tests',
        timeout: 30000,
        use: {
          baseURL: 'http://localhost:3000',
          viewport: { width: 1280, height: 720 },
          actionTimeout: 10000
        },
        projects: [
          { name: 'chromium', use: { channel: 'chromium' } },
          { name: 'firefox', use: { channel: 'firefox' } },
          { name: 'webkit', use: { channel: 'webkit' } }
        ]
      };

      const configString = migrator.generatePlaywrightConfig(playwrightConfig);

      expect(configString).toContain("import { defineConfig, devices } from '@playwright/test'");
      expect(configString).toContain("export default defineConfig(");
      expect(configString).toContain("testDir: 'tests'");
      expect(configString).toContain("timeout: 30000");
      expect(configString).toContain("baseURL: 'http://localhost:3000'");
      expect(configString).toContain("viewport: { width: 1280, height: 720 }");
      expect(configString).toContain("projects: [");
    });

    it('should generate TypeScript-compatible config', () => {
      const playwrightConfig: PlaywrightConfig = {
        testDir: 'tests',
        use: {
          baseURL: 'http://localhost:3000'
        }
      };

      const configString = migrator.generatePlaywrightConfig(playwrightConfig, true);

      expect(configString).toContain("import { defineConfig, devices } from '@playwright/test';");
      expect(configString).toContain("export default defineConfig({");
    });

    it('should handle complex configuration with all options', () => {
      const playwrightConfig: PlaywrightConfig = {
        testDir: 'tests',
        testMatch: '**/*.spec.{js,ts}',
        testIgnore: '**/*.skip.spec.js',
        timeout: 60000,
        fullyParallel: true,
        retries: 2,
        workers: 4,
        reporter: [['html'], ['json', { outputFile: 'test-results.json' }]],
        use: {
          baseURL: 'http://localhost:3000',
          trace: 'on-first-retry',
          screenshot: 'only-on-failure',
          video: 'retain-on-failure',
          actionTimeout: 10000,
          navigationTimeout: 30000
        },
        outputDir: 'test-results',
        projects: [
          {
            name: 'Desktop Chrome',
            use: { channel: 'chrome' }
          },
          {
            name: 'Mobile Safari',
            use: {
              userAgent: 'iPhone',
              viewport: { width: 375, height: 667 }
            }
          }
        ]
      };

      const configString = migrator.generatePlaywrightConfig(playwrightConfig);

      expect(configString).toContain('testDir: \'tests\'');
      expect(configString).toContain('fullyParallel: true');
      expect(configString).toContain('retries: 2');
      expect(configString).toContain('workers: 4');
      expect(configString).toContain('reporter: [');
      expect(configString).toContain('trace: \'on-first-retry\'');
      expect(configString).toContain('Desktop Chrome');
      expect(configString).toContain('Mobile Safari');
    });
  });

  describe('integration scenarios', () => {
    it('should handle end-to-end config migration workflow', async () => {
      const cypressConfigContent = `
        module.exports = {
          baseUrl: 'http://localhost:3000',
          viewportWidth: 1920,
          viewportHeight: 1080,
          defaultCommandTimeout: 12000,
          requestTimeout: 8000,
          video: true,
          screenshotOnRunFailure: false,
          env: {
            apiUrl: 'https://api.example.com'
          },
          e2e: {
            supportFile: 'cypress/support/e2e.js',
            specPattern: 'cypress/e2e/**/*.cy.{js,ts}',
            setupNodeEvents(on, config) {
              return config;
            }
          }
        };
      `;

      const configPath = path.join(testTempDir, 'cypress.config.js');
      await fs.writeFile(configPath, cypressConfigContent);

      // Parse config file
      const parseResult = await migrator.parseConfigFile(configPath);
      expect(parseResult.success).toBe(true);

      // Migrate config
      const migrationResult = migrator.migrateConfig(parseResult.config!);
      expect(migrationResult.success).toBe(true);

      // Generate output
      const configString = migrator.generatePlaywrightConfig(migrationResult.playwrightConfig);
      expect(configString).toContain('baseURL: \'http://localhost:3000\'');
      expect(configString).toContain('viewport: { width: 1920, height: 1080 }');
      expect(configString).toContain('actionTimeout: 12000');

      // Verify migration quality
      expect(migrationResult.warnings.length).toBeGreaterThanOrEqual(0);
      expect(migrationResult.errors.length).toBe(0);
    });

    it('should preserve project structure when migrating', () => {
      const cypressConfig: CypressConfig = {
        e2e: {
          supportFile: 'cypress/support/e2e.js',
          specPattern: 'cypress/e2e/**/*.cy.{js,ts}',
          excludeSpecPattern: '**/*.skip.cy.js'
        }
      };

      const result = migrator.migrateConfig(cypressConfig);

      expect(result.success).toBe(true);
      expect(result.playwrightConfig.testDir).toBe('tests');
      expect(result.warnings).toContain('Support file will need manual migration to Playwright fixtures/setup');
    });
  });
});