import { Logger } from '../utils/logger';

export interface RepositoryInfo {
  id: string;
  name: string;
  fullName: string;
  url: string;
  cloneUrl: string;
  description?: string;
  language?: string;
  stars: number;
  forks: number;
  isPrivate: boolean;
  defaultBranch: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RepositorySearchOptions {
  query: string;
  sort?: 'stars' | 'forks' | 'updated';
  order?: 'asc' | 'desc';
  perPage?: number;
  page?: number;
}

export interface RepositorySearchResult {
  repositories: RepositoryInfo[];
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface RepositoryValidationResult {
  isValid: boolean;
  isCypressProject: boolean;
  isPlaywrightProject: boolean;
  hasValidStructure: boolean;
  issues: string[];
  recommendations: string[];
  projectInfo: {
    name: string;
    version: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  } | null;
}

export interface RepositoryAnalysisResult {
  projectType: 'cypress' | 'playwright' | 'unknown';
  language: 'javascript' | 'typescript';
  testFramework: string;
  testFiles: string[];
  configFiles: string[];
  customCommands: string[];
  dependencies: Record<string, string>;
  metrics: {
    totalFiles: number;
    testFiles: number;
    lineCount: number;
    complexity: 'low' | 'medium' | 'high';
  };
  structure: {
    hasTests: boolean;
    hasConfig: boolean;
    hasSupport: boolean;
    hasFixtures: boolean;
  };
  recommendations: string[];
}

export class RepositoryService {
  private logger = new Logger('RepositoryService');

  async searchRepositories(options: RepositorySearchOptions): Promise<RepositorySearchResult> {
    this.logger.info('Searching repositories', options);

    // Mock implementation for testing
    return {
      repositories: [
        {
          id: '1',
          name: 'cypress-example',
          fullName: 'user/cypress-example',
          url: 'https://github.com/user/cypress-example',
          cloneUrl: 'https://github.com/user/cypress-example.git',
          description: 'Example Cypress project',
          language: 'JavaScript',
          stars: 100,
          forks: 25,
          isPrivate: false,
          defaultBranch: 'main',
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2024-01-01')
        }
      ],
      totalCount: 1,
      hasNextPage: false,
      hasPreviousPage: false
    };
  }

  async getRepositoryInfo(owner: string, repo: string): Promise<RepositoryInfo | null> {
    this.logger.info(`Getting repository info for ${owner}/${repo}`);

    // Mock implementation for testing
    return {
      id: '1',
      name: repo,
      fullName: `${owner}/${repo}`,
      url: `https://github.com/${owner}/${repo}`,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      description: 'Repository description',
      language: 'JavaScript',
      stars: 50,
      forks: 10,
      isPrivate: false,
      defaultBranch: 'main',
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2024-01-01')
    };
  }

  async isRepositoryAccessible(owner: string, repo: string): Promise<boolean> {
    this.logger.info(`Checking accessibility for ${owner}/${repo}`);
    // Mock implementation - assume accessible for testing
    return true;
  }

  async getRepositoryBranches(owner: string, repo: string): Promise<string[]> {
    this.logger.info(`Getting branches for ${owner}/${repo}`);
    // Mock implementation
    return ['main', 'develop', 'feature/test'];
  }

  async getRepositoryFiles(owner: string, repo: string, branch: string = 'main'): Promise<string[]> {
    this.logger.info(`Getting files for ${owner}/${repo}@${branch}`);
    // Mock implementation
    return [
      'cypress.config.js',
      'package.json',
      'cypress/e2e/spec.cy.js',
      'cypress/support/commands.js'
    ];
  }

  async validateRepository(repositoryPath: string, accessToken?: string): Promise<RepositoryValidationResult> {
    this.logger.info(`Validating repository at: ${repositoryPath}`);

    try {
      const fs = await import('fs-extra');
      const path = await import('path');

      const validation: RepositoryValidationResult = {
        isValid: true,
        isCypressProject: false,
        isPlaywrightProject: false,
        hasValidStructure: false,
        issues: [],
        recommendations: [],
        projectInfo: null
      };

      // Check if directory exists
      if (!(await fs.pathExists(repositoryPath))) {
        validation.isValid = false;
        validation.issues.push(`Repository path does not exist: ${repositoryPath}`);
        return validation;
      }

      // Check for package.json
      const packageJsonPath = path.join(repositoryPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        try {
          const packageJson = await fs.readJson(packageJsonPath);
          validation.projectInfo = {
            name: packageJson.name || 'unknown',
            version: packageJson.version || '0.0.0',
            dependencies: packageJson.dependencies || {},
            devDependencies: packageJson.devDependencies || {}
          };

          // Check for Cypress
          if (packageJson.dependencies?.cypress || packageJson.devDependencies?.cypress) {
            validation.isCypressProject = true;
          }

          // Check for Playwright
          if (packageJson.dependencies?.['@playwright/test'] || packageJson.devDependencies?.['@playwright/test']) {
            validation.isPlaywrightProject = true;
          }
        } catch (error) {
          validation.issues.push('Invalid package.json file');
        }
      } else {
        validation.issues.push('No package.json found');
      }

      // Check for Cypress configuration
      const cypressConfigs = ['cypress.config.js', 'cypress.config.ts', 'cypress.json'];
      for (const config of cypressConfigs) {
        if (await fs.pathExists(path.join(repositoryPath, config))) {
          validation.isCypressProject = true;
          break;
        }
      }

      // Check for Playwright configuration
      const playwrightConfigs = ['playwright.config.js', 'playwright.config.ts'];
      for (const config of playwrightConfigs) {
        if (await fs.pathExists(path.join(repositoryPath, config))) {
          validation.isPlaywrightProject = true;
          break;
        }
      }

      // Check for test directories
      const testDirectories = ['cypress/e2e', 'cypress/integration', 'tests', 'test', 'e2e'];
      for (const dir of testDirectories) {
        if (await fs.pathExists(path.join(repositoryPath, dir))) {
          validation.hasValidStructure = true;
          break;
        }
      }

      // Generate recommendations
      if (validation.isCypressProject && !validation.isPlaywrightProject) {
        validation.recommendations.push('This Cypress project can be converted to Playwright');
      }

      if (!validation.hasValidStructure) {
        validation.issues.push('No test directories found');
        validation.recommendations.push('Ensure test files are organized in standard directories');
      }

      // Overall validation
      validation.isValid = validation.issues.length === 0;

      this.logger.info(`Repository validation completed for: ${repositoryPath}`, {
        isValid: validation.isValid,
        isCypressProject: validation.isCypressProject,
        issues: validation.issues.length
      });

      return validation;

    } catch (error) {
      this.logger.error(`Repository validation failed for ${repositoryPath}:`, error);
      return {
        isValid: false,
        isCypressProject: false,
        isPlaywrightProject: false,
        hasValidStructure: false,
        issues: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
        recommendations: [],
        projectInfo: null
      };
    }
  }

  async analyzeRepository(repositoryPath: string): Promise<RepositoryAnalysisResult> {
    this.logger.info(`Analyzing repository at: ${repositoryPath}`);

    try {
      const fs = await import('fs-extra');
      const path = await import('path');

      const analysis: RepositoryAnalysisResult = {
        projectType: 'unknown',
        language: 'javascript',
        testFramework: 'none',
        testFiles: [],
        configFiles: [],
        customCommands: [],
        dependencies: {},
        metrics: {
          totalFiles: 0,
          testFiles: 0,
          lineCount: 0,
          complexity: 'low'
        },
        structure: {
          hasTests: false,
          hasConfig: false,
          hasSupport: false,
          hasFixtures: false
        },
        recommendations: []
      };

      // Check if directory exists
      if (!(await fs.pathExists(repositoryPath))) {
        throw new Error(`Repository path does not exist: ${repositoryPath}`);
      }

      // Analyze package.json
      const packageJsonPath = path.join(repositoryPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        analysis.dependencies = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies
        };

        // Determine project type
        if (analysis.dependencies.cypress) {
          analysis.projectType = 'cypress';
          analysis.testFramework = 'cypress';
        } else if (analysis.dependencies['@playwright/test']) {
          analysis.projectType = 'playwright';
          analysis.testFramework = 'playwright';
        }
      }

      // Determine language
      const hasTypeScript = await fs.pathExists(path.join(repositoryPath, 'tsconfig.json')) ||
                           analysis.dependencies.typescript;
      analysis.language = hasTypeScript ? 'typescript' : 'javascript';

      // Find test files
      const testExtensions = ['.js', '.ts', '.spec.js', '.spec.ts', '.cy.js', '.cy.ts'];
      const testDirs = ['cypress/e2e', 'cypress/integration', 'tests', 'test', 'e2e'];

      for (const dir of testDirs) {
        const testDirPath = path.join(repositoryPath, dir);
        if (await fs.pathExists(testDirPath)) {
          analysis.structure.hasTests = true;
          const files = await this.findFilesRecursively(testDirPath, testExtensions);
          analysis.testFiles.push(...files.map(f => path.relative(repositoryPath, f)));
        }
      }

      // Find configuration files
      const configFiles = [
        'cypress.config.js', 'cypress.config.ts', 'cypress.json',
        'playwright.config.js', 'playwright.config.ts'
      ];

      for (const configFile of configFiles) {
        const configPath = path.join(repositoryPath, configFile);
        if (await fs.pathExists(configPath)) {
          analysis.configFiles.push(configFile);
          analysis.structure.hasConfig = true;
        }
      }

      // Check for support files
      const supportDir = path.join(repositoryPath, 'cypress/support');
      if (await fs.pathExists(supportDir)) {
        analysis.structure.hasSupport = true;
      }

      // Check for fixtures
      const fixturesDir = path.join(repositoryPath, 'cypress/fixtures');
      if (await fs.pathExists(fixturesDir)) {
        analysis.structure.hasFixtures = true;
      }

      // Calculate metrics
      analysis.metrics.testFiles = analysis.testFiles.length;
      analysis.metrics.totalFiles = await this.countFiles(repositoryPath);

      // Determine complexity
      if (analysis.testFiles.length > 50 || Object.keys(analysis.dependencies).length > 20) {
        analysis.metrics.complexity = 'high';
      } else if (analysis.testFiles.length > 20 || Object.keys(analysis.dependencies).length > 10) {
        analysis.metrics.complexity = 'medium';
      }

      // Generate recommendations
      if (analysis.projectType === 'cypress') {
        analysis.recommendations.push('This Cypress project can be converted to Playwright for better performance and features');
      }

      if (analysis.testFiles.length === 0) {
        analysis.recommendations.push('No test files found - verify test directory structure');
      }

      if (!analysis.structure.hasConfig) {
        analysis.recommendations.push('Add a configuration file for better test management');
      }

      this.logger.info(`Repository analysis completed for: ${repositoryPath}`, {
        projectType: analysis.projectType,
        testFiles: analysis.testFiles.length,
        complexity: analysis.metrics.complexity
      });

      return analysis;

    } catch (error) {
      this.logger.error(`Repository analysis failed for ${repositoryPath}:`, error);
      throw error;
    }
  }

  private async findFilesRecursively(dir: string, extensions: string[]): Promise<string[]> {
    const fs = await import('fs-extra');
    const path = await import('path');
    const files: string[] = [];

    async function scan(currentDir: string): Promise<void> {
      try {
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
      } catch (error) {
        // Directory might not be accessible
      }
    }

    await scan(dir);
    return files;
  }

  private async countFiles(dir: string): Promise<number> {
    const fs = await import('fs-extra');
    const path = await import('path');
    let count = 0;

    async function scan(currentDir: string): Promise<void> {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scan(fullPath);
          } else if (entry.isFile()) {
            count++;
          }
        }
      } catch (error) {
        // Directory might not be accessible
      }
    }

    await scan(dir);
    return count;
  }

  async validateAccess(repositoryUrl: string, accessToken?: string): Promise<any> {
    this.logger.info('Validating repository access', { repositoryUrl });

    // Mock implementation for testing
    return {
      hasAccess: true,
      permissions: ['read', 'write'],
      repositoryInfo: {
        name: 'test-repo',
        owner: 'test-owner',
        isPrivate: false
      }
    };
  }

  async getBranches(owner: string, repo: string): Promise<any[]> {
    this.logger.info(`Getting branches for ${owner}/${repo}`);

    // Mock implementation for testing
    return [
      { name: 'main', commit: { sha: 'abc123' } },
      { name: 'develop', commit: { sha: 'def456' } },
      { name: 'feature/test', commit: { sha: 'ghi789' } }
    ];
  }

  async isHealthy(): Promise<boolean> {
    return true; // Repository service is stateless and always healthy
  }

  getStats(): Record<string, any> {
    return {
      service: 'RepositoryService',
      status: 'healthy'
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down repository service');
  }
}