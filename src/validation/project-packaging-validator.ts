import { Logger } from '../utils/logger';
import { SyntaxValidator } from './syntax-validator';
import { DependencyValidator } from './dependency-validator';
import { TemplateGenerator } from '../services/template-generator';
import { DependencyManager } from '../services/dependency-manager';
import { ConfigurationMigrator } from '../services/configuration-migrator';
import * as fs from 'fs-extra';
import * as path from 'path';
import archiver from 'archiver';

export interface PackagingOptions {
  outputPath: string;
  includeSourceTests: boolean;
  generateDocumentation: boolean;
  createGitIgnore: boolean;
}

export interface PackagingResult {
  success: boolean;
  outputPath?: string;
  errors: string[];
  warnings: string[];
  packagedFiles: string[];
}

export interface ProjectStructureValidationResult {
  isValid: boolean;
  requiredFiles: Array<{
    path: string;
    exists: boolean;
    description: string;
  }>;
  optionalFiles: Array<{
    path: string;
    exists: boolean;
    description: string;
  }>;
  issues: string[];
  recommendations: string[];
}

export interface TemplateGenerationOptions {
  projectName: string;
  includeExamples: boolean;
  browserTargets: string[];
  testDirectory: string;
  useTypeScript: boolean;
}

export interface TemplateGenerationResult {
  success: boolean;
  generatedFiles: string[];
  errors: string[];
  warnings: string[];
}

export interface DependencyValidationResult {
  allInstalled: boolean;
  missingDependencies: string[];
  versionConflicts: string[];
  recommendations: string[];
  installCommand?: string;
}

export interface ConfigurationGenerationOptions {
  browsers: string[];
  testDir: string;
  baseURL?: string;
  headless: boolean;
  screenshot?: 'on' | 'off' | 'only-on-failure';
  video?: 'on' | 'off' | 'retain-on-failure';
  migrateCypressConfig?: boolean;
}

export interface ConfigurationGenerationResult {
  success: boolean;
  configPath?: string;
  migratedSettings: string[];
  errors: string[];
  warnings: string[];
}

export interface TestFilesValidationResult {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  conversionIssues: Array<{
    file: string;
    issue: string;
    severity: 'error' | 'warning' | 'info';
    line?: number;
  }>;
  recommendations: string[];
}

export interface DeploymentPackageOptions {
  outputPath: string;
  includeReports: boolean;
  includeDocumentation: boolean;
  excludeDependencies: boolean;
}

export interface DeploymentPackageResult {
  success: boolean;
  packagePath?: string;
  includedFiles: string[];
  excludedFiles: string[];
  packageSize?: number;
  errors: string[];
}

export class ProjectPackagingValidator {
  private logger = new Logger('ProjectPackagingValidator');
  private syntaxValidator = new SyntaxValidator();
  private dependencyValidator = new DependencyValidator();
  private templateGenerator = new TemplateGenerator();
  private dependencyManager = new DependencyManager();
  private configurationMigrator = new ConfigurationMigrator();

  async packageProject(projectPath: string, options: PackagingOptions): Promise<PackagingResult> {
    this.logger.info(`Packaging project: ${projectPath}`);

    const result: PackagingResult = {
      success: false,
      errors: [],
      warnings: [],
      packagedFiles: []
    };

    try {
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(options.outputPath));
      await fs.ensureDir(options.outputPath);

      // Copy essential Playwright files
      await this.copyEssentialFiles(projectPath, options.outputPath, result);

      // Copy converted test files
      await this.copyTestFiles(projectPath, options.outputPath, result);

      // Include source tests if requested
      if (options.includeSourceTests) {
        await this.copySourceTests(projectPath, options.outputPath, result);
      }

      // Generate documentation if requested
      if (options.generateDocumentation) {
        await this.generateDocumentation(projectPath, options.outputPath, result);
      }

      // Create .gitignore if requested
      if (options.createGitIgnore) {
        await this.createGitIgnore(options.outputPath, result);
      }

      result.success = true;
      result.outputPath = options.outputPath;

    } catch (error) {
      const errorMessage = `Project packaging failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMessage, error);
      result.errors.push(errorMessage);
    }

    return result;
  }

  async validateProjectStructure(projectPath: string): Promise<ProjectStructureValidationResult> {
    this.logger.debug(`Validating project structure: ${projectPath}`);

    const result: ProjectStructureValidationResult = {
      isValid: true,
      requiredFiles: [],
      optionalFiles: [],
      issues: [],
      recommendations: []
    };

    // Define required and optional files
    const requiredFiles = [
      { path: 'package.json', description: 'Node.js package configuration' },
      { path: 'playwright.config.ts', description: 'Playwright configuration (TypeScript)' },
      { path: 'playwright.config.js', description: 'Playwright configuration (JavaScript)' }
    ];

    const optionalFiles = [
      { path: 'tsconfig.json', description: 'TypeScript configuration' },
      { path: '.gitignore', description: 'Git ignore patterns' },
      { path: 'README.md', description: 'Project documentation' },
      { path: 'tests', description: 'Test directory' },
      { path: 'e2e', description: 'E2E test directory' },
      { path: 'test-results', description: 'Test results directory' },
      { path: 'playwright-report', description: 'Test report directory' }
    ];

    // Check required files
    for (const file of requiredFiles) {
      const filePath = path.join(projectPath, file.path);
      const exists = await fs.pathExists(filePath);

      result.requiredFiles.push({
        path: file.path,
        exists,
        description: file.description
      });

      if (!exists) {
        // Special case: either .ts or .js config is acceptable
        if (file.path.startsWith('playwright.config')) {
          const altPath = file.path.endsWith('.ts') ? 'playwright.config.js' : 'playwright.config.ts';
          const altExists = await fs.pathExists(path.join(projectPath, altPath));
          if (!altExists) {
            result.issues.push(`Missing Playwright configuration file (${file.path} or ${altPath})`);
            result.isValid = false;
          }
        } else {
          result.issues.push(`Missing required file: ${file.path}`);
          result.isValid = false;
        }
      }
    }

    // Check optional files
    for (const file of optionalFiles) {
      const filePath = path.join(projectPath, file.path);
      const exists = await fs.pathExists(filePath);

      result.optionalFiles.push({
        path: file.path,
        exists,
        description: file.description
      });
    }

    // Validate file contents
    await this.validateFileContents(projectPath, result);

    // Generate recommendations
    this.generateStructureRecommendations(result);

    return result;
  }

  async generateProjectTemplate(projectPath: string, options: TemplateGenerationOptions): Promise<TemplateGenerationResult> {
    this.logger.debug(`Generating project template: ${projectPath}`);

    const result: TemplateGenerationResult = {
      success: false,
      generatedFiles: [],
      errors: [],
      warnings: []
    };

    try {
      // Generate package.json
      await this.templateGenerator.generatePackageJson(projectPath, {
        name: options.projectName,
        useTypeScript: options.useTypeScript
      });
      result.generatedFiles.push('package.json');

      // Generate Playwright configuration
      const configFile = options.useTypeScript ? 'playwright.config.ts' : 'playwright.config.js';
      await this.templateGenerator.generatePlaywrightConfig(projectPath, {
        browsers: options.browserTargets,
        testDirectory: options.testDirectory,
        useTypeScript: options.useTypeScript
      });
      result.generatedFiles.push(configFile);

      // Generate TypeScript configuration if needed
      if (options.useTypeScript) {
        await this.templateGenerator.generateTsConfig(projectPath);
        result.generatedFiles.push('tsconfig.json');
      }

      // Create test directory
      await fs.ensureDir(path.join(projectPath, options.testDirectory));

      // Generate example tests if requested
      if (options.includeExamples) {
        const exampleFile = options.useTypeScript ? 'example.spec.ts' : 'example.spec.js';
        await this.templateGenerator.generateExampleTest(
          path.join(projectPath, options.testDirectory, exampleFile),
          options.useTypeScript
        );
        result.generatedFiles.push(path.join(options.testDirectory, exampleFile));
      }

      // Generate .gitignore
      await this.templateGenerator.generateGitIgnore(projectPath);
      result.generatedFiles.push('.gitignore');

      // Generate README
      await this.templateGenerator.generateReadme(projectPath, options.projectName);
      result.generatedFiles.push('README.md');

      result.success = true;

    } catch (error) {
      const errorMessage = `Template generation failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMessage, error);
      result.errors.push(errorMessage);
    }

    return result;
  }

  async validateDependencies(projectPath: string): Promise<DependencyValidationResult> {
    this.logger.debug(`Validating dependencies: ${projectPath}`);

    const result: DependencyValidationResult = {
      allInstalled: false,
      missingDependencies: [],
      versionConflicts: [],
      recommendations: []
    };

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!(await fs.pathExists(packageJsonPath))) {
        result.missingDependencies.push('package.json');
        result.recommendations.push('Create package.json file');
        return result;
      }

      const packageJson = await fs.readJson(packageJsonPath);
      const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Check for required Playwright dependencies
      const requiredDeps = ['@playwright/test'];
      const recommendedDeps = ['playwright'];

      for (const dep of requiredDeps) {
        if (!allDependencies[dep]) {
          result.missingDependencies.push(dep);
        }
      }

      for (const dep of recommendedDeps) {
        if (!allDependencies[dep]) {
          result.missingDependencies.push(dep);
        }
      }

      // Check for version conflicts
      result.versionConflicts = this.dependencyManager.detectVersionConflicts(allDependencies);

      // Generate recommendations
      if (result.missingDependencies.length > 0) {
        result.recommendations.push(`npm install -D ${result.missingDependencies.join(' ')}`);
      }

      if (result.versionConflicts.length > 0) {
        result.recommendations.push('Resolve version conflicts between Playwright packages');
      }

      result.allInstalled = result.missingDependencies.length === 0 && result.versionConflicts.length === 0;

    } catch (error) {
      this.logger.error('Dependency validation failed:', error);
      result.recommendations.push('Fix package.json parsing errors');
    }

    return result;
  }

  async generateConfiguration(projectPath: string, options: ConfigurationGenerationOptions): Promise<ConfigurationGenerationResult> {
    this.logger.debug(`Generating configuration: ${projectPath}`);

    const result: ConfigurationGenerationResult = {
      success: false,
      migratedSettings: [],
      errors: [],
      warnings: []
    };

    try {
      let configContent: string;
      let configFileName: string;

      if (options.migrateCypressConfig) {
        // Migrate from existing Cypress configuration
        const migrationResult = await this.configurationMigrator.migrateCypressConfig(projectPath, options);
        configContent = migrationResult.configContent;
        configFileName = migrationResult.configFileName;
        result.migratedSettings = migrationResult.migratedSettings;
      } else {
        // Generate new configuration
        const generationResult = await this.configurationMigrator.generateNewConfig(options);
        configContent = generationResult.configContent;
        configFileName = generationResult.configFileName;
      }

      // Write configuration file
      const configPath = path.join(projectPath, configFileName);
      await fs.writeFile(configPath, configContent, 'utf8');

      result.success = true;
      result.configPath = configPath;

    } catch (error) {
      const errorMessage = `Configuration generation failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMessage, error);
      result.errors.push(errorMessage);
    }

    return result;
  }

  async validateTestFiles(projectPath: string): Promise<TestFilesValidationResult> {
    this.logger.debug(`Validating test files: ${projectPath}`);

    const result: TestFilesValidationResult = {
      totalFiles: 0,
      validFiles: 0,
      invalidFiles: 0,
      conversionIssues: [],
      recommendations: []
    };

    try {
      const testFiles = await this.findTestFiles(projectPath);
      result.totalFiles = testFiles.length;

      if (testFiles.length === 0) {
        result.recommendations.push('No test files found. Consider adding test files to tests/ directory.');
        return result;
      }

      // Validate each test file
      for (const testFile of testFiles) {
        const validationResult = await this.syntaxValidator.validateTestFile(testFile);

        if (validationResult.isValid) {
          result.validFiles++;
        } else {
          result.invalidFiles++;

          // Add issues to the result
          validationResult.errors.forEach(error => {
            result.conversionIssues.push({
              file: path.relative(projectPath, testFile),
              issue: error.message,
              severity: error.severity === 'error' ? 'error' : 'warning',
              line: error.line
            });
          });
        }
      }

      // Generate recommendations
      if (result.invalidFiles > 0) {
        result.recommendations.push(`Fix ${result.invalidFiles} test files with conversion issues`);
      }

      if (result.conversionIssues.some(issue => issue.issue.includes('cy.'))) {
        result.recommendations.push('Complete Cypress to Playwright command conversion');
      }

    } catch (error) {
      this.logger.error('Test file validation failed:', error);
      result.recommendations.push('Fix test file validation errors');
    }

    return result;
  }

  async createDeploymentPackage(projectPath: string, options: DeploymentPackageOptions): Promise<DeploymentPackageResult> {
    this.logger.debug(`Creating deployment package: ${projectPath}`);

    const result: DeploymentPackageResult = {
      success: false,
      includedFiles: [],
      excludedFiles: [],
      errors: []
    };

    try {
      // Ensure source directory exists
      if (!(await fs.pathExists(projectPath))) {
        throw new Error(`Source directory does not exist: ${projectPath}`);
      }

      // Create archive
      const archive = archiver('zip', { zlib: { level: 9 } });
      const output = fs.createWriteStream(options.outputPath);

      archive.pipe(output);

      // Define exclusion patterns
      const excludePatterns = [
        'node_modules/**',
        '.git/**',
        '*.log',
        'test-results/**',
        'playwright-report/**'
      ];

      if (options.excludeDependencies) {
        excludePatterns.push('node_modules/**');
      }

      if (!options.includeReports) {
        excludePatterns.push('test-results/**', 'playwright-report/**');
      }

      if (!options.includeDocumentation) {
        excludePatterns.push('README.md', 'docs/**');
      }

      // Add files to archive
      await this.addFilesToArchive(archive, projectPath, excludePatterns, result);

      // Finalize archive
      await archive.finalize();

      // Wait for output stream to complete
      await new Promise((resolve, reject) => {
        output.on('close', () => resolve(undefined));
        output.on('error', reject);
      });

      result.success = true;
      result.packagePath = options.outputPath;
      result.packageSize = archive.pointer();

    } catch (error) {
      const errorMessage = `Deployment package creation failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMessage, error);
      result.errors.push(errorMessage);
    }

    return result;
  }

  private async copyEssentialFiles(sourcePath: string, outputPath: string, result: PackagingResult): Promise<void> {
    const essentialFiles = ['package.json', 'playwright.config.ts', 'playwright.config.js', 'tsconfig.json'];

    for (const file of essentialFiles) {
      const sourcefile = path.join(sourcePath, file);
      const destFile = path.join(outputPath, file);

      if (await fs.pathExists(sourcefile)) {
        await fs.copy(sourcefile, destFile);
        result.packagedFiles.push(file);
      }
    }
  }

  private async copyTestFiles(sourcePath: string, outputPath: string, result: PackagingResult): Promise<void> {
    const testDirs = ['tests', 'e2e', 'test'];

    for (const dir of testDirs) {
      const sourceDir = path.join(sourcePath, dir);
      const destDir = path.join(outputPath, dir);

      if (await fs.pathExists(sourceDir)) {
        await fs.copy(sourceDir, destDir);
        result.packagedFiles.push(`${dir}/`);
      }
    }
  }

  private async copySourceTests(sourcePath: string, outputPath: string, result: PackagingResult): Promise<void> {
    const cypressDir = path.join(sourcePath, 'cypress');
    const destDir = path.join(outputPath, 'cypress-original');

    if (await fs.pathExists(cypressDir)) {
      await fs.copy(cypressDir, destDir);
      result.packagedFiles.push('cypress-original/');
      result.warnings.push('Original Cypress tests included for reference');
    }
  }

  private async generateDocumentation(sourcePath: string, outputPath: string, result: PackagingResult): Promise<void> {
    const readmePath = path.join(outputPath, 'README.md');

    if (!(await fs.pathExists(readmePath))) {
      await this.templateGenerator.generateReadme(outputPath, path.basename(sourcePath));
      result.packagedFiles.push('README.md');
    }

    // Generate conversion summary
    const summaryPath = path.join(outputPath, 'CONVERSION_SUMMARY.md');
    await this.generateConversionSummary(sourcePath, summaryPath);
    result.packagedFiles.push('CONVERSION_SUMMARY.md');
  }

  private async createGitIgnore(outputPath: string, result: PackagingResult): Promise<void> {
    const gitIgnorePath = path.join(outputPath, '.gitignore');

    if (!(await fs.pathExists(gitIgnorePath))) {
      await this.templateGenerator.generateGitIgnore(outputPath);
      result.packagedFiles.push('.gitignore');
    }
  }

  private async generateConversionSummary(sourcePath: string, outputPath: string): Promise<void> {
    const summary = `# Conversion Summary

This project was converted from Cypress to Playwright.

## Original Structure
- Cypress tests were located in \`cypress/\` directory
- Configuration was in \`cypress.config.js\` or \`cypress.json\`

## New Structure
- Playwright tests are in \`tests/\` directory
- Configuration is in \`playwright.config.ts\`
- Test reports are generated in \`playwright-report/\`

## Key Changes
- Test syntax updated from Cypress commands to Playwright actions
- Assertions converted to Playwright expect patterns
- Configuration migrated to Playwright format
- Multi-browser support enabled

## Next Steps
1. Run \`npm install\` to install dependencies
2. Run \`npx playwright install\` to install browsers
3. Run \`npx playwright test\` to execute tests
4. Review and customize configuration as needed

Generated on: ${new Date().toISOString()}
`;

    await fs.writeFile(outputPath, summary, 'utf8');
  }

  private async validateFileContents(projectPath: string, result: ProjectStructureValidationResult): Promise<void> {
    // Validate package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      try {
        await fs.readJson(packageJsonPath);
      } catch (error) {
        result.issues.push('package.json contains invalid JSON');
        result.isValid = false;
      }
    }

    // Validate Playwright configuration
    const configPaths = ['playwright.config.ts', 'playwright.config.js'];
    for (const configPath of configPaths) {
      const fullPath = path.join(projectPath, configPath);
      if (await fs.pathExists(fullPath)) {
        try {
          const content = await fs.readFile(fullPath, 'utf8');
          if (!content.includes('defineConfig') && !content.includes('module.exports')) {
            result.issues.push(`${configPath} may not be a valid Playwright configuration`);
          }
        } catch (error) {
          result.issues.push(`Cannot read ${configPath}`);
        }
      }
    }
  }

  private generateStructureRecommendations(result: ProjectStructureValidationResult): void {
    // Recommend missing optional files
    const missingOptional = result.optionalFiles.filter(f => !f.exists);

    if (missingOptional.some(f => f.path === 'README.md')) {
      result.recommendations.push('Add README.md for project documentation');
    }

    if (missingOptional.some(f => f.path === '.gitignore')) {
      result.recommendations.push('Add .gitignore to exclude build artifacts');
    }

    if (missingOptional.some(f => f.path === 'tsconfig.json')) {
      result.recommendations.push('Add TypeScript configuration for better type safety');
    }

    // Recommend test directory structure
    const hasTestDir = result.optionalFiles.some(f => f.path === 'tests' && f.exists);
    const hasE2eDir = result.optionalFiles.some(f => f.path === 'e2e' && f.exists);

    if (!hasTestDir && !hasE2eDir) {
      result.recommendations.push('Create tests/ or e2e/ directory for test files');
    }
  }

  private async findTestFiles(projectPath: string): Promise<string[]> {
    const testFiles: string[] = [];
    const testDirs = ['tests', 'e2e', 'test'];

    for (const dir of testDirs) {
      const testDir = path.join(projectPath, dir);
      if (await fs.pathExists(testDir)) {
        const files = await this.getTestFilesFromDir(testDir);
        testFiles.push(...files);
      }
    }

    return testFiles;
  }

  private async getTestFilesFromDir(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.getTestFilesFromDir(fullPath);
        files.push(...subFiles);
      } else if (entry.name.match(/\.(test|spec)\.(js|ts)$/)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private async addFilesToArchive(
    archive: archiver.Archiver,
    sourcePath: string,
    excludePatterns: string[],
    result: DeploymentPackageResult
  ): Promise<void> {
    const files = await this.getAllFiles(sourcePath);

    for (const file of files) {
      const relativePath = path.relative(sourcePath, file);

      // Check if file should be excluded
      const shouldExclude = excludePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace('**', '.*').replace('*', '[^/]*'));
        return regex.test(relativePath);
      });

      if (shouldExclude) {
        result.excludedFiles.push(relativePath);
      } else {
        archive.file(file, { name: relativePath });
        result.includedFiles.push(relativePath);
      }
    }
  }

  private async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.getAllFiles(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }
}