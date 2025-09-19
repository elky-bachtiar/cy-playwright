import { Logger } from '../utils/logger';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface BeforeAfterComparisonResults {
  testExecutionTime: {
    before: number;
    after: number;
    improvement: number;
  };
  testReliability: {
    before: number;
    after: number;
    improvement: number;
  };
  maintainabilityScore: {
    before: number;
    after: number;
    improvement: number;
  };
  browserCoverage: {
    before: string[];
    after: string[];
    added: string[];
    removed: string[];
  };
  featureComparison: {
    gained: string[];
    lost: string[];
    equivalent: string[];
  };
}

export interface TestMetrics {
  executionTime: number;
  reliability: number;
  maintainabilityScore: number;
  browserCoverage: string[];
  features: string[];
}

export class ComparisonAnalyzer {
  private logger = new Logger('ComparisonAnalyzer');

  async generateComparison(projectPath: string): Promise<BeforeAfterComparisonResults> {
    this.logger.debug(`Generating before/after comparison for: ${projectPath}`);

    const cypressMetrics = await this.analyzeCypressProject(projectPath);
    const playwrightMetrics = await this.analyzePlaywrightProject(projectPath);

    return {
      testExecutionTime: {
        before: cypressMetrics.executionTime,
        after: playwrightMetrics.executionTime,
        improvement: this.calculateImprovement(cypressMetrics.executionTime, playwrightMetrics.executionTime)
      },
      testReliability: {
        before: cypressMetrics.reliability,
        after: playwrightMetrics.reliability,
        improvement: this.calculateImprovement(cypressMetrics.reliability, playwrightMetrics.reliability)
      },
      maintainabilityScore: {
        before: cypressMetrics.maintainabilityScore,
        after: playwrightMetrics.maintainabilityScore,
        improvement: this.calculateImprovement(cypressMetrics.maintainabilityScore, playwrightMetrics.maintainabilityScore)
      },
      browserCoverage: {
        before: cypressMetrics.browserCoverage,
        after: playwrightMetrics.browserCoverage,
        added: playwrightMetrics.browserCoverage.filter(b => !cypressMetrics.browserCoverage.includes(b)),
        removed: cypressMetrics.browserCoverage.filter(b => !playwrightMetrics.browserCoverage.includes(b))
      },
      featureComparison: {
        gained: playwrightMetrics.features.filter(f => !cypressMetrics.features.includes(f)),
        lost: cypressMetrics.features.filter(f => !playwrightMetrics.features.includes(f)),
        equivalent: cypressMetrics.features.filter(f => playwrightMetrics.features.includes(f))
      }
    };
  }

  async analyzeCypressProject(projectPath: string): Promise<TestMetrics> {
    this.logger.debug('Analyzing Cypress project metrics');

    const cypressConfigPath = path.join(projectPath, 'cypress.config.js');
    const cypressConfigTsPath = path.join(projectPath, 'cypress.config.ts');
    const legacyCypressJsonPath = path.join(projectPath, 'cypress.json');

    let config: any = {};
    let configExists = false;

    // Try to read Cypress configuration
    if (await fs.pathExists(cypressConfigPath)) {
      config = await this.readJSConfig(cypressConfigPath);
      configExists = true;
    } else if (await fs.pathExists(cypressConfigTsPath)) {
      config = await this.readTSConfig(cypressConfigTsPath);
      configExists = true;
    } else if (await fs.pathExists(legacyCypressJsonPath)) {
      config = await fs.readJson(legacyCypressJsonPath);
      configExists = true;
    }

    const testFiles = await this.findCypressTestFiles(projectPath);
    const features = await this.analyzeCypressFeatures(testFiles, config);
    const browserCoverage = this.extractCypressBrowsers(config);

    return {
      executionTime: this.estimateCypressExecutionTime(testFiles, config),
      reliability: this.estimateCypressReliability(testFiles, config),
      maintainabilityScore: this.calculateCypressMaintainability(testFiles, config),
      browserCoverage,
      features
    };
  }

  async analyzePlaywrightProject(projectPath: string): Promise<TestMetrics> {
    this.logger.debug('Analyzing Playwright project metrics');

    const playwrightConfigPath = path.join(projectPath, 'playwright.config.js');
    const playwrightConfigTsPath = path.join(projectPath, 'playwright.config.ts');

    let config: any = {};
    let configExists = false;

    // Try to read Playwright configuration
    if (await fs.pathExists(playwrightConfigTsPath)) {
      config = await this.readTSConfig(playwrightConfigTsPath);
      configExists = true;
    } else if (await fs.pathExists(playwrightConfigPath)) {
      config = await this.readJSConfig(playwrightConfigPath);
      configExists = true;
    }

    const testFiles = await this.findPlaywrightTestFiles(projectPath);
    const features = await this.analyzePlaywrightFeatures(testFiles, config);
    const browserCoverage = this.extractPlaywrightBrowsers(config);

    return {
      executionTime: this.estimatePlaywrightExecutionTime(testFiles, config),
      reliability: this.estimatePlaywrightReliability(testFiles, config),
      maintainabilityScore: this.calculatePlaywrightMaintainability(testFiles, config),
      browserCoverage,
      features
    };
  }

  private async findCypressTestFiles(projectPath: string): Promise<string[]> {
    const testFiles: string[] = [];
    const possibleDirs = ['cypress/e2e', 'cypress/integration', 'cypress/tests'];

    for (const dir of possibleDirs) {
      const testDir = path.join(projectPath, dir);
      if (await fs.pathExists(testDir)) {
        const files = await this.getTestFilesFromDir(testDir, /\.(cy|spec)\.(js|ts)$/);
        testFiles.push(...files);
      }
    }

    return testFiles;
  }

  private async findPlaywrightTestFiles(projectPath: string): Promise<string[]> {
    const testFiles: string[] = [];
    const possibleDirs = ['tests', 'e2e', 'test'];

    for (const dir of possibleDirs) {
      const testDir = path.join(projectPath, dir);
      if (await fs.pathExists(testDir)) {
        const files = await this.getTestFilesFromDir(testDir, /\.(test|spec)\.(js|ts)$/);
        testFiles.push(...files);
      }
    }

    return testFiles;
  }

  private async getTestFilesFromDir(dir: string, pattern: RegExp): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.getTestFilesFromDir(fullPath, pattern);
        files.push(...subFiles);
      } else if (pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private async analyzeCypressFeatures(testFiles: string[], config: any): Promise<string[]> {
    const features = new Set<string>();

    // Analyze configuration features
    if (config.video !== false) features.add('video-recording');
    if (config.screenshotOnRunFailure !== false) features.add('screenshot-on-failure');
    if (config.experimentalStudio) features.add('test-studio');
    if (config.component) features.add('component-testing');

    // Analyze test file features
    for (const file of testFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');

        if (content.includes('cy.intercept')) features.add('network-interception');
        if (content.includes('cy.fixture')) features.add('test-fixtures');
        if (content.includes('cy.task')) features.add('custom-tasks');
        if (content.includes('cy.viewport')) features.add('viewport-testing');
        if (content.includes('cy.visit')) features.add('navigation');
        if (content.includes('cy.get')) features.add('element-interaction');
        if (content.includes('.should(')) features.add('cypress-assertions');
        if (content.includes('cy.wait(')) features.add('explicit-waits');
        if (content.includes('beforeEach') || content.includes('before')) features.add('test-hooks');
        if (content.includes('describe')) features.add('test-organization');
      } catch (error) {
        this.logger.warn(`Could not read test file: ${file}`, error);
      }
    }

    return Array.from(features);
  }

  private async analyzePlaywrightFeatures(testFiles: string[], config: any): Promise<string[]> {
    const features = new Set<string>();

    // Analyze configuration features
    if (config.use?.video) features.add('video-recording');
    if (config.use?.screenshot) features.add('screenshot-on-failure');
    if (config.projects?.length > 1) features.add('multi-browser-testing');
    if (config.use?.trace) features.add('trace-recording');
    if (config.webServer) features.add('dev-server-integration');

    // Analyze test file features
    for (const file of testFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');

        if (content.includes('page.route')) features.add('network-interception');
        if (content.includes('test.beforeEach')) features.add('test-hooks');
        if (content.includes('page.goto')) features.add('navigation');
        if (content.includes('page.locator') || content.includes('page.getBy')) features.add('element-interaction');
        if (content.includes('expect(')) features.add('playwright-assertions');
        if (content.includes('page.waitFor')) features.add('explicit-waits');
        if (content.includes('page.setViewportSize')) features.add('viewport-testing');
        if (content.includes('test(')) features.add('test-organization');
        if (content.includes('page.screenshot')) features.add('visual-testing');
        if (content.includes('page.pdf')) features.add('pdf-generation');
        if (content.includes('context.')) features.add('browser-context');
        if (content.includes('test.describe')) features.add('test-grouping');
      } catch (error) {
        this.logger.warn(`Could not read test file: ${file}`, error);
      }
    }

    return Array.from(features);
  }

  private extractCypressBrowsers(config: any): string[] {
    const browsers = new Set<string>();

    // Default Cypress browsers
    browsers.add('chrome');

    // Check for explicitly configured browsers
    if (config.browsers) {
      config.browsers.forEach((browser: any) => {
        if (typeof browser === 'string') {
          browsers.add(browser);
        } else if (browser.name) {
          browsers.add(browser.name);
        }
      });
    }

    // Common Cypress browsers
    if (config.chromeWebSecurity === false) browsers.add('chrome');

    return Array.from(browsers);
  }

  private extractPlaywrightBrowsers(config: any): string[] {
    const browsers = new Set<string>();

    if (config.projects) {
      config.projects.forEach((project: any) => {
        if (project.use?.browserName) {
          browsers.add(project.use.browserName);
        } else if (project.name) {
          // Common project names that indicate browsers
          const browserMap: { [key: string]: string } = {
            'chromium': 'chromium',
            'firefox': 'firefox',
            'webkit': 'webkit',
            'chrome': 'chromium',
            'edge': 'chromium'
          };

          const browserName = browserMap[project.name.toLowerCase()];
          if (browserName) browsers.add(browserName);
        }
      });
    } else {
      // Default Playwright browsers if no projects configured
      browsers.add('chromium');
      browsers.add('firefox');
      browsers.add('webkit');
    }

    return Array.from(browsers);
  }

  private estimateCypressExecutionTime(testFiles: string[], config: any): number {
    // Base time per test file (in seconds)
    const baseTimePerFile = 15;

    // Adjust for configuration factors
    let multiplier = 1.0;

    if (config.video !== false) multiplier += 0.1; // Video recording overhead
    if (config.chromeWebSecurity === false) multiplier += 0.05; // Security overhead
    if (config.defaultCommandTimeout > 4000) multiplier += 0.1; // Longer timeouts

    return testFiles.length * baseTimePerFile * multiplier;
  }

  private estimatePlaywrightExecutionTime(testFiles: string[], config: any): number {
    // Base time per test file (in seconds) - Playwright is generally faster
    const baseTimePerFile = 10;

    // Adjust for configuration factors
    let multiplier = 1.0;

    if (config.use?.video) multiplier += 0.08; // Video recording overhead (less than Cypress)
    if (config.use?.trace) multiplier += 0.05; // Trace recording overhead
    if (config.projects?.length > 1) multiplier += 0.2; // Multi-browser overhead

    // Parallel execution benefit
    const workers = config.workers || 1;
    if (workers > 1) {
      multiplier /= Math.min(workers, testFiles.length) * 0.8; // Not perfect parallelization
    }

    return testFiles.length * baseTimePerFile * multiplier;
  }

  private estimateCypressReliability(testFiles: string[], config: any): number {
    // Base reliability score (0-100)
    let reliability = 85;

    // Factors that affect reliability
    if (config.chromeWebSecurity === false) reliability -= 5; // Security disabled
    if (config.retries) reliability += config.retries * 3; // Retry mechanism
    if (config.defaultCommandTimeout < 4000) reliability -= 5; // Too aggressive timeouts

    return Math.max(0, Math.min(100, reliability));
  }

  private estimatePlaywrightReliability(testFiles: string[], config: any): number {
    // Base reliability score (0-100) - Playwright generally more reliable
    let reliability = 92;

    // Factors that affect reliability
    if (config.use?.actionTimeout && config.use.actionTimeout < 5000) reliability -= 3; // Aggressive timeouts
    if (config.retries) reliability += config.retries * 2; // Retry mechanism
    if (config.use?.headless === false) reliability -= 2; // Headed mode can be less stable

    return Math.max(0, Math.min(100, reliability));
  }

  private calculateCypressMaintainability(testFiles: string[], config: any): number {
    // Base maintainability score (0-100)
    let score = 70;

    // Positive factors
    if (testFiles.some(f => f.includes('support'))) score += 5; // Custom commands
    if (config.experimentalStudio) score += 3; // Test studio

    // Negative factors - based on common Cypress pain points
    score -= Math.min(10, testFiles.length * 0.1); // Scale issues with large test suites

    return Math.max(0, Math.min(100, score));
  }

  private calculatePlaywrightMaintainability(testFiles: string[], config: any): number {
    // Base maintainability score (0-100) - Playwright has better patterns
    let score = 85;

    // Positive factors
    if (config.projects?.length > 1) score += 5; // Good organization
    if (config.use?.trace) score += 3; // Better debugging

    // Better scaling with test suite size
    score -= Math.min(5, testFiles.length * 0.05);

    return Math.max(0, Math.min(100, score));
  }

  private calculateImprovement(before: number, after: number): number {
    if (before === 0) return 0;
    return ((after - before) / before) * 100;
  }

  private async readJSConfig(configPath: string): Promise<any> {
    try {
      // Simple parsing for basic config files
      const content = await fs.readFile(configPath, 'utf8');

      // Remove module.exports wrapper and eval (unsafe but for analysis only)
      const configMatch = content.match(/module\.exports\s*=\s*({[\s\S]*})/);
      if (configMatch) {
        // This is a simplified approach - in production, use a proper JS parser
        return {};
      }

      return {};
    } catch (error) {
      this.logger.warn(`Could not read JS config: ${configPath}`, error);
      return {};
    }
  }

  private async readTSConfig(configPath: string): Promise<any> {
    try {
      // Simple parsing for basic config files
      const content = await fs.readFile(configPath, 'utf8');

      // This is a simplified approach - in production, use TypeScript compiler API
      return {};
    } catch (error) {
      this.logger.warn(`Could not read TS config: ${configPath}`, error);
      return {};
    }
  }
}