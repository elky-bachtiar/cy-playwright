import { Logger } from '../utils/logger';
import * as path from 'path';

export interface ProjectAnalysis {
  projectInfo: ProjectInfo;
  testFiles: TestFileAnalysis[];
  customCommands: CustomCommandAnalysis[];
  configurations: ConfigurationAnalysis;
  dependencies: DependencyAnalysis;
  ciConfiguration: CIConfigurationAnalysis;
  selectors: SelectorAnalysis;
  complexity: ComplexityAnalysis;
  recommendations: string[];
  warnings: string[];
}

export interface ProjectInfo {
  type: 'cypress' | 'playwright' | 'unknown';
  version: string;
  testFramework: string;
  packageManager: 'npm' | 'yarn' | 'pnpm';
  language: 'javascript' | 'typescript';
  rootDirectory: string;
  testDirectory: string;
  configFile: string;
}

export interface TestFileAnalysis {
  filePath: string;
  relativeFilePath: string;
  type: 'e2e' | 'component' | 'integration' | 'unit';
  language: 'javascript' | 'typescript';
  testCount: number;
  lineCount: number;
  cypressCommands: string[];
  assertions: string[];
  customCommands: string[];
  complexity: 'low' | 'medium' | 'high';
  conversionDifficulty: 'easy' | 'medium' | 'hard';
  issues: string[];
}

export interface CustomCommandAnalysis {
  name: string;
  filePath: string;
  implementation: string;
  usage: string[];
  complexity: 'low' | 'medium' | 'high';
  conversionSuggestion: string;
}

export interface ConfigurationAnalysis {
  cypressConfig?: any;
  playwrightConfig?: any;
  baseUrl?: string;
  viewportSize?: { width: number; height: number };
  browsers: string[];
  supportFiles: string[];
  fixtures: string[];
  plugins: string[];
}

export interface DependencyAnalysis {
  cypress: {
    version: string;
    plugins: string[];
  };
  playwright?: {
    version: string;
    plugins: string[];
  };
  testingLibraries: string[];
  devDependencies: string[];
  conflicts: string[];
  missing: string[];
}

export interface CIConfigurationAnalysis {
  detected: boolean;
  type: 'github-actions' | 'circleci' | 'jenkins' | 'azure-pipelines' | 'unknown';
  files: string[];
  parallelization: boolean;
  browsers: string[];
  artifacts: string[];
  complexity: 'low' | 'medium' | 'high';
}

export interface SelectorAnalysis {
  centralized: boolean;
  selectorFiles: string[];
  selectorTypes: Record<string, number>;
  recommendations: string[];
}

export interface ComplexityAnalysis {
  overall: 'low' | 'medium' | 'high';
  factors: {
    testCount: number;
    customCommands: number;
    fileSize: number;
    dependencies: number;
    configurations: number;
  };
  estimatedConversionTime: number; // in hours
  riskFactors: string[];
}

export class AnalysisService {
  private logger = new Logger('AnalysisService');

  async analyzeProject(projectPath: string, projectInfo?: any): Promise<ProjectAnalysis> {
    this.logger.info(`Starting project analysis for: ${projectPath}`);

    try {
      const fs = await import('fs-extra');

      // Ensure project path exists
      if (!(await fs.pathExists(projectPath))) {
        throw new Error(`Project path does not exist: ${projectPath}`);
      }

      // Basic project info
      const basicProjectInfo = await this.analyzeProjectInfo(projectPath);

      // Test files analysis
      const testFiles = await this.analyzeTestFiles(projectPath, basicProjectInfo);

      // Custom commands analysis
      const customCommands = await this.analyzeCustomCommands(projectPath);

      // Configuration analysis
      const configurations = await this.analyzeConfigurations(projectPath);

      // Dependencies analysis
      const dependencies = await this.analyzeDependencies(projectPath);

      // CI configuration analysis
      const ciConfiguration = await this.analyzeCIConfiguration(projectPath);

      // Selectors analysis
      const selectors = await this.analyzeSelectors(projectPath);

      // Complexity analysis
      const complexity = await this.analyzeComplexity(testFiles, customCommands, dependencies);

      // Generate recommendations and warnings
      const recommendations = this.generateRecommendations(testFiles, customCommands, configurations, dependencies);
      const warnings = this.generateWarnings(testFiles, customCommands, dependencies);

      const analysis: ProjectAnalysis = {
        projectInfo: basicProjectInfo,
        testFiles,
        customCommands,
        configurations,
        dependencies,
        ciConfiguration,
        selectors,
        complexity,
        recommendations,
        warnings
      };

      this.logger.info(`Project analysis completed for: ${projectPath}`);
      return analysis;

    } catch (error) {
      this.logger.error(`Project analysis failed for ${projectPath}:`, error);
      throw error;
    }
  }

  private async analyzeProjectInfo(projectPath: string): Promise<ProjectInfo> {
    const fs = await import('fs-extra');

    let packageJson: any = {};
    const packageJsonPath = path.join(projectPath, 'package.json');

    if (await fs.pathExists(packageJsonPath)) {
      packageJson = await fs.readJson(packageJsonPath);
    }

    // Determine project type
    let type: 'cypress' | 'playwright' | 'unknown' = 'unknown';
    let version = '0.0.0';
    let testFramework = 'unknown';

    if (packageJson.devDependencies?.cypress || packageJson.dependencies?.cypress) {
      type = 'cypress';
      version = packageJson.devDependencies?.cypress || packageJson.dependencies?.cypress;
      testFramework = 'cypress';
    } else if (packageJson.devDependencies?.['@playwright/test'] || packageJson.dependencies?.['@playwright/test']) {
      type = 'playwright';
      version = packageJson.devDependencies?.['@playwright/test'] || packageJson.dependencies?.['@playwright/test'];
      testFramework = 'playwright';
    }

    // Determine package manager
    let packageManager: 'npm' | 'yarn' | 'pnpm' = 'npm';
    if (await fs.pathExists(path.join(projectPath, 'yarn.lock'))) {
      packageManager = 'yarn';
    } else if (await fs.pathExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    }

    // Determine language
    const hasTypeScript = await fs.pathExists(path.join(projectPath, 'tsconfig.json')) ||
                         packageJson.devDependencies?.typescript ||
                         packageJson.dependencies?.typescript;
    const language: 'javascript' | 'typescript' = hasTypeScript ? 'typescript' : 'javascript';

    // Find test directory
    let testDirectory = '';
    const possibleTestDirs = ['cypress/e2e', 'cypress/integration', 'tests', 'test', 'e2e'];
    for (const dir of possibleTestDirs) {
      if (await fs.pathExists(path.join(projectPath, dir))) {
        testDirectory = dir;
        break;
      }
    }

    // Find config file
    let configFile = '';
    const possibleConfigs = ['cypress.config.js', 'cypress.config.ts', 'playwright.config.js', 'playwright.config.ts'];
    for (const config of possibleConfigs) {
      if (await fs.pathExists(path.join(projectPath, config))) {
        configFile = config;
        break;
      }
    }

    return {
      type,
      version,
      testFramework,
      packageManager,
      language,
      rootDirectory: projectPath,
      testDirectory,
      configFile
    };
  }

  private async analyzeTestFiles(projectPath: string, projectInfo: ProjectInfo): Promise<TestFileAnalysis[]> {
    const fs = await import('fs-extra');
    const testFiles: TestFileAnalysis[] = [];

    if (!projectInfo.testDirectory) {
      return testFiles;
    }

    const testDirPath = path.join(projectPath, projectInfo.testDirectory);
    if (!(await fs.pathExists(testDirPath))) {
      return testFiles;
    }

    // Find all test files
    const testFileExtensions = ['.js', '.ts', '.spec.js', '.spec.ts', '.cy.js', '.cy.ts'];
    const files = await this.findFilesRecursively(testDirPath, testFileExtensions);

    for (const filePath of files) {
      try {
        const analysis = await this.analyzeTestFile(filePath, projectPath);
        testFiles.push(analysis);
      } catch (error) {
        this.logger.warn(`Failed to analyze test file ${filePath}:`, error);
      }
    }

    return testFiles;
  }

  private async analyzeTestFile(filePath: string, projectPath: string): Promise<TestFileAnalysis> {
    const fs = await import('fs-extra');
    const content = await fs.readFile(filePath, 'utf-8');
    const relativeFilePath = path.relative(projectPath, filePath);

    // Basic file analysis
    const lines = content.split('\n');
    const lineCount = lines.length;
    const language = filePath.endsWith('.ts') ? 'typescript' : 'javascript';

    // Count tests
    const testCount = (content.match(/\b(it|test)\s*\(/g) || []).length;

    // Extract Cypress commands
    const cypressCommands = this.extractCypressCommands(content);

    // Extract assertions
    const assertions = this.extractAssertions(content);

    // Extract custom commands
    const customCommands = this.extractCustomCommands(content);

    // Determine test type
    let type: 'e2e' | 'component' | 'integration' | 'unit' = 'e2e';
    if (filePath.includes('component')) {
      type = 'component';
    } else if (filePath.includes('integration')) {
      type = 'integration';
    } else if (filePath.includes('unit')) {
      type = 'unit';
    }

    // Assess complexity
    const complexity = this.assessFileComplexity(content, cypressCommands.length, customCommands.length);

    // Assess conversion difficulty
    const conversionDifficulty = this.assessConversionDifficulty(cypressCommands, customCommands, content);

    // Identify issues
    const issues = this.identifyFileIssues(content, cypressCommands);

    return {
      filePath,
      relativeFilePath,
      type,
      language,
      testCount,
      lineCount,
      cypressCommands,
      assertions,
      customCommands,
      complexity,
      conversionDifficulty,
      issues
    };
  }

  private async analyzeCustomCommands(projectPath: string): Promise<CustomCommandAnalysis[]> {
    const fs = await import('fs-extra');
    const customCommands: CustomCommandAnalysis[] = [];

    // Look for custom commands in support files
    const supportDirs = ['cypress/support', 'cypress/commands'];
    const commandFiles = ['.cmd.js', '.cmd.ts', 'commands.js', 'commands.ts'];

    for (const supportDir of supportDirs) {
      const supportPath = path.join(projectPath, supportDir);
      if (await fs.pathExists(supportPath)) {
        const files = await this.findFilesRecursively(supportPath, commandFiles);

        for (const filePath of files) {
          try {
            const commands = await this.extractCustomCommandDefinitions(filePath);
            customCommands.push(...commands);
          } catch (error) {
            this.logger.warn(`Failed to analyze custom commands in ${filePath}:`, error);
          }
        }
      }
    }

    return customCommands;
  }

  private async analyzeConfigurations(projectPath: string): Promise<ConfigurationAnalysis> {
    const fs = await import('fs-extra');
    const configurations: ConfigurationAnalysis = {
      browsers: [],
      supportFiles: [],
      fixtures: [],
      plugins: []
    };

    // Analyze Cypress configuration
    const cypressConfigFiles = ['cypress.config.js', 'cypress.config.ts', 'cypress.json'];
    for (const configFile of cypressConfigFiles) {
      const configPath = path.join(projectPath, configFile);
      if (await fs.pathExists(configPath)) {
        try {
          // This would require proper parsing of JS/TS files
          // For now, return basic structure
          configurations.cypressConfig = {};
          break;
        } catch (error) {
          this.logger.warn(`Failed to parse Cypress config ${configFile}:`, error);
        }
      }
    }

    return configurations;
  }

  private async analyzeDependencies(projectPath: string): Promise<DependencyAnalysis> {
    const fs = await import('fs-extra');
    const packageJsonPath = path.join(projectPath, 'package.json');

    const analysis: DependencyAnalysis = {
      cypress: {
        version: '',
        plugins: []
      },
      testingLibraries: [],
      devDependencies: [],
      conflicts: [],
      missing: []
    };

    if (await fs.pathExists(packageJsonPath)) {
      try {
        const packageJson = await fs.readJson(packageJsonPath);
        const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        // Analyze Cypress dependencies
        if (allDeps.cypress) {
          analysis.cypress.version = allDeps.cypress;
        }

        // Find Cypress plugins
        analysis.cypress.plugins = Object.keys(allDeps).filter(dep =>
          dep.includes('cypress') && dep !== 'cypress'
        );

        // Find testing libraries
        analysis.testingLibraries = Object.keys(allDeps).filter(dep =>
          dep.includes('testing-library') ||
          dep.includes('jest') ||
          dep.includes('mocha') ||
          dep.includes('chai')
        );

        analysis.devDependencies = Object.keys(packageJson.devDependencies || {});

      } catch (error) {
        this.logger.warn(`Failed to analyze dependencies:`, error);
      }
    }

    return analysis;
  }

  private async analyzeCIConfiguration(projectPath: string): Promise<CIConfigurationAnalysis> {
    const fs = await import('fs-extra');
    const analysis: CIConfigurationAnalysis = {
      detected: false,
      type: 'unknown',
      files: [],
      parallelization: false,
      browsers: [],
      artifacts: [],
      complexity: 'low'
    };

    const ciFiles = [
      '.github/workflows',
      '.circleci/config.yml',
      'azure-pipelines.yml',
      'Jenkinsfile'
    ];

    for (const ciFile of ciFiles) {
      const ciPath = path.join(projectPath, ciFile);
      if (await fs.pathExists(ciPath)) {
        analysis.detected = true;
        analysis.files.push(ciFile);

        if (ciFile.includes('github')) {
          analysis.type = 'github-actions';
        } else if (ciFile.includes('circleci')) {
          analysis.type = 'circleci';
        } else if (ciFile.includes('azure')) {
          analysis.type = 'azure-pipelines';
        }
      }
    }

    return analysis;
  }

  private async analyzeSelectors(projectPath: string): Promise<SelectorAnalysis> {
    const fs = await import('fs-extra');
    const analysis: SelectorAnalysis = {
      centralized: false,
      selectorFiles: [],
      selectorTypes: {},
      recommendations: []
    };

    const selectorDir = path.join(projectPath, 'cypress/selectors');
    if (await fs.pathExists(selectorDir)) {
      analysis.centralized = true;
      const files = await this.findFilesRecursively(selectorDir, ['.js', '.ts']);
      analysis.selectorFiles = files.map(f => path.relative(projectPath, f));
    }

    return analysis;
  }

  private async analyzeComplexity(
    testFiles: TestFileAnalysis[],
    customCommands: CustomCommandAnalysis[],
    dependencies: DependencyAnalysis
  ): Promise<ComplexityAnalysis> {
    const factors = {
      testCount: testFiles.reduce((sum, file) => sum + file.testCount, 0),
      customCommands: customCommands.length,
      fileSize: testFiles.reduce((sum, file) => sum + file.lineCount, 0),
      dependencies: dependencies.devDependencies.length,
      configurations: 1 // Basic count for now
    };

    // Calculate complexity score
    let complexityScore = 0;
    complexityScore += factors.testCount * 0.5;
    complexityScore += factors.customCommands * 2;
    complexityScore += factors.fileSize * 0.01;
    complexityScore += factors.dependencies * 0.1;

    let overall: 'low' | 'medium' | 'high' = 'low';
    if (complexityScore > 100) {
      overall = 'high';
    } else if (complexityScore > 50) {
      overall = 'medium';
    }

    // Estimate conversion time (in hours)
    const estimatedConversionTime = Math.ceil(
      (factors.testCount * 0.25) +
      (factors.customCommands * 1) +
      (factors.fileSize * 0.001) +
      2 // Base setup time
    );

    const riskFactors = this.identifyRiskFactors(testFiles, customCommands, dependencies);

    return {
      overall,
      factors,
      estimatedConversionTime,
      riskFactors
    };
  }

  // Helper methods
  private async findFilesRecursively(dir: string, extensions: string[]): Promise<string[]> {
    const fs = await import('fs-extra');
    const files: string[] = [];

    async function scan(currentDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          if (extensions.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      }
    }

    try {
      await scan(dir);
    } catch (error) {
      // Directory might not exist or be accessible
    }

    return files;
  }

  private extractCypressCommands(content: string): string[] {
    const commandPattern = /cy\.(\w+)/g;
    const matches = content.match(commandPattern) || [];
    return [...new Set(matches)]; // Remove duplicates
  }

  private extractAssertions(content: string): string[] {
    const assertionPatterns = [
      /\.should\(['"`]([^'"`]+)['"`]\)/g,
      /expect\([^)]+\)\.to\.([^(]+)/g
    ];

    const assertions: string[] = [];

    for (const pattern of assertionPatterns) {
      const matches = content.match(pattern) || [];
      assertions.push(...matches);
    }

    return [...new Set(assertions)];
  }

  private extractCustomCommands(content: string): string[] {
    const customCommandPattern = /cy\.(\w+)\(/g;
    const standardCommands = ['visit', 'get', 'click', 'type', 'should', 'wait', 'contains'];

    const matches = content.match(customCommandPattern) || [];
    const commands = matches.map(match => match.replace('cy.', '').replace('(', ''));

    return [...new Set(commands.filter(cmd => !standardCommands.includes(cmd)))];
  }

  private async extractCustomCommandDefinitions(filePath: string): Promise<CustomCommandAnalysis[]> {
    const fs = await import('fs-extra');
    const content = await fs.readFile(filePath, 'utf-8');
    const commands: CustomCommandAnalysis[] = [];

    // Look for Cypress.Commands.add patterns
    const commandPattern = /Cypress\.Commands\.add\(['"`](\w+)['"`]/g;
    let match;

    while ((match = commandPattern.exec(content)) !== null) {
      const commandName = match[1];

      commands.push({
        name: commandName,
        filePath,
        implementation: '', // Would need more sophisticated parsing
        usage: [],
        complexity: 'medium',
        conversionSuggestion: `Convert ${commandName} to a Page Object method`
      });
    }

    return commands;
  }

  private assessFileComplexity(content: string, commandCount: number, customCommandCount: number): 'low' | 'medium' | 'high' {
    const lineCount = content.split('\n').length;

    if (lineCount > 200 || commandCount > 20 || customCommandCount > 5) {
      return 'high';
    } else if (lineCount > 100 || commandCount > 10 || customCommandCount > 2) {
      return 'medium';
    }

    return 'low';
  }

  private assessConversionDifficulty(cypressCommands: string[], customCommands: string[], content: string): 'easy' | 'medium' | 'hard' {
    const difficultPatterns = [
      'cy.intercept',
      'cy.window',
      'cy.document',
      'cy.fixture',
      'cy.wrap'
    ];

    const hasDifficultPatterns = difficultPatterns.some(pattern => content.includes(pattern));

    if (hasDifficultPatterns || customCommands.length > 5) {
      return 'hard';
    } else if (cypressCommands.length > 10 || customCommands.length > 2) {
      return 'medium';
    }

    return 'easy';
  }

  private identifyFileIssues(content: string, cypressCommands: string[]): string[] {
    const issues: string[] = [];

    if (content.includes('cy.wait(')) {
      issues.push('Uses hard waits (cy.wait) which should be replaced with smart waits');
    }

    if (content.includes('.invoke(')) {
      issues.push('Uses jQuery .invoke() which may need special handling');
    }

    if (content.includes('cy.window()')) {
      issues.push('Direct window access may need refactoring');
    }

    return issues;
  }

  private generateRecommendations(
    testFiles: TestFileAnalysis[],
    customCommands: CustomCommandAnalysis[],
    configurations: ConfigurationAnalysis,
    dependencies: DependencyAnalysis
  ): string[] {
    const recommendations: string[] = [];

    if (customCommands.length > 0) {
      recommendations.push('Convert custom commands to Page Object Models for better maintainability');
    }

    const hardTests = testFiles.filter(f => f.conversionDifficulty === 'hard');
    if (hardTests.length > 0) {
      recommendations.push(`Review ${hardTests.length} complex test files that may need manual adjustments`);
    }

    if (dependencies.cypress.plugins.length > 0) {
      recommendations.push('Review Cypress plugins for Playwright equivalents');
    }

    return recommendations;
  }

  private generateWarnings(
    testFiles: TestFileAnalysis[],
    customCommands: CustomCommandAnalysis[],
    dependencies: DependencyAnalysis
  ): string[] {
    const warnings: string[] = [];

    const issuesCount = testFiles.reduce((sum, file) => sum + file.issues.length, 0);
    if (issuesCount > 0) {
      warnings.push(`Found ${issuesCount} potential issues across test files`);
    }

    if (customCommands.some(cmd => cmd.complexity === 'high')) {
      warnings.push('Some custom commands are complex and may require manual conversion');
    }

    return warnings;
  }

  private identifyRiskFactors(
    testFiles: TestFileAnalysis[],
    customCommands: CustomCommandAnalysis[],
    dependencies: DependencyAnalysis
  ): string[] {
    const riskFactors: string[] = [];

    if (testFiles.length > 50) {
      riskFactors.push('Large number of test files may increase conversion time');
    }

    if (customCommands.length > 10) {
      riskFactors.push('High number of custom commands increases complexity');
    }

    if (dependencies.cypress.plugins.length > 5) {
      riskFactors.push('Many Cypress plugins may not have direct Playwright equivalents');
    }

    return riskFactors;
  }

  // Health check methods
  async isHealthy(): Promise<boolean> {
    return true; // Analysis service is stateless
  }

  getStats(): Record<string, any> {
    return {
      service: 'AnalysisService',
      status: 'healthy'
    };
  }
}