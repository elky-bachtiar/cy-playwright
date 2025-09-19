#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import {
  CliArguments,
  ValidationResult,
  CypressProjectValidation,
  DirectoryValidation,
  TestFileScanResult,
  ConversionOptions,
  ProjectGenerationOptions,
  CypressTestFile
} from './types';
import { ASTParser } from './ast-parser';
import { ConfigMigrator } from './config-migrator';
import { ProjectGenerator } from './project-generator';
import { GitHubRepository } from './github-repository';
import { GitLabRepository } from './gitlab-repository';
import { RepositoryDetector } from './repository-detector';
import { EnhancedConversionService } from './services/enhanced-conversion-service';

export class CLI {
  private program: Command;
  private astParser: ASTParser;
  private configMigrator: ConfigMigrator;
  private projectGenerator: ProjectGenerator;
  private githubRepo: GitHubRepository;
  private gitlabRepo: GitLabRepository;
  private repoDetector: RepositoryDetector;
  private enhancedConversionService: EnhancedConversionService;

  constructor() {
    this.program = new Command();
    this.astParser = new ASTParser();
    this.configMigrator = new ConfigMigrator();
    this.projectGenerator = new ProjectGenerator();
    this.githubRepo = new GitHubRepository();
    this.gitlabRepo = new GitLabRepository();
    this.repoDetector = new RepositoryDetector();
    this.enhancedConversionService = new EnhancedConversionService();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.program
      .name('cy2pw')
      .description('Convert Cypress test projects to Playwright')
      .version('1.0.0');

    this.program
      .command('convert')
      .description('Convert Cypress project to Playwright')
      .requiredOption('-s, --source <path>', 'Source Cypress project directory')
      .requiredOption('-o, --output <path>', 'Output directory for Playwright project')
      .option('--preserve-structure', 'Preserve original directory structure', false)
      .option('--generate-page-objects', 'Generate page object models from custom commands', true)
      .option('--preserve-method-chaining', 'Preserve method chaining in page objects', true)
      .option('--deduplicate-imports', 'Remove duplicate imports and clean up dependencies', true)
      .option('--transform-import-paths', 'Transform import paths for Playwright structure', true)
      .option('--convert-test-structure', 'Convert describe/context blocks to Playwright test.describe', true)
      .option('-v, --verbose', 'Enable verbose logging', false)
      .action(async (options) => {
        await this.handleConversionEnhanced({
          sourceDir: options.source,
          outputDir: options.output,
          preserveStructure: options.preserveStructure,
          generatePageObjects: options.generatePageObjects,
          preserveMethodChaining: options.preserveMethodChaining,
          deduplicateImports: options.deduplicateImports,
          transformImportPaths: options.transformImportPaths,
          convertTestStructure: options.convertTestStructure,
          verbose: options.verbose
        });
      });

    this.program
      .command('convert-github')
      .description('Clone and convert Cypress project from GitHub repository')
      .requiredOption('--github-url <url>', 'GitHub repository URL to clone and convert')
      .option('-o, --output <path>', 'Output directory for converted Playwright project', './playwright-project')
      .option('--preserve-structure', 'Preserve original directory structure', false)
      .option('--generate-page-objects', 'Generate page object models from custom commands', true)
      .option('--auto-select', 'Automatically select the first valid Cypress project (non-interactive)', false)
      .option('-v, --verbose', 'Enable verbose logging', false)
      .action(async (options) => {
        await this.handleGitHubConversion({
          githubUrl: options.githubUrl,
          outputDir: options.output,
          preserveStructure: options.preserveStructure,
          generatePageObjects: options.generatePageObjects,
          autoSelect: options.autoSelect,
          verbose: options.verbose
        });
      });

    this.program
      .command('convert-gitlab')
      .description('Clone and convert Cypress project from GitLab repository')
      .requiredOption('--gitlab-url <url>', 'GitLab repository URL to clone and convert')
      .option('-o, --output <path>', 'Output directory for converted Playwright project', './playwright-project')
      .option('--preserve-structure', 'Preserve original directory structure', false)
      .option('--generate-page-objects', 'Generate page object models from custom commands', true)
      .option('--auto-select', 'Automatically select the first valid Cypress project (non-interactive)', false)
      .option('-v, --verbose', 'Enable verbose logging', false)
      .action(async (options) => {
        await this.handleGitLabConversion({
          gitlabUrl: options.gitlabUrl,
          outputDir: options.output,
          preserveStructure: options.preserveStructure,
          generatePageObjects: options.generatePageObjects,
          autoSelect: options.autoSelect,
          verbose: options.verbose
        });
      });

    this.program
      .command('convert-repo')
      .description('Auto-detect and convert Cypress project from GitHub or GitLab repository')
      .requiredOption('--repo-url <url>', 'Repository URL (GitHub or GitLab) to clone and convert')
      .option('-o, --output <path>', 'Output directory for converted Playwright project', './playwright-project')
      .option('--preserve-structure', 'Preserve original directory structure', false)
      .option('--generate-page-objects', 'Generate page object models from custom commands', true)
      .option('-v, --verbose', 'Enable verbose logging', false)
      .action(async (options) => {
        await this.handleRepositoryConversion({
          repoUrl: options.repoUrl,
          outputDir: options.output,
          preserveStructure: options.preserveStructure,
          generatePageObjects: options.generatePageObjects,
          verbose: options.verbose
        });
      });
  }

  parseArguments(argv: string[]): CliArguments {
    // For testing, parse the convert command specifically
    const convertCommand = this.program.commands.find(cmd => cmd.name() === 'convert');
    if (!convertCommand) {
      throw new Error('Convert command not found');
    }

    // Extract arguments after 'convert'
    const convertIndex = argv.indexOf('convert');
    const convertArgs = convertIndex >= 0 ? argv.slice(convertIndex + 1) : argv.slice(2);

    // Set up error handling for testing
    convertCommand.exitOverride((err) => {
      throw err;
    });

    // Parse the convert command
    convertCommand.parse(convertArgs, { from: 'user' });
    const options = convertCommand.opts();

    if (!options.source || !options.output) {
      throw new Error('Both source and output directories are required');
    }

    return {
      source: options.source,
      output: options.output
    };
  }

  async validateArguments(args: CliArguments): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check if source directory exists
    if (!await fs.pathExists(args.source)) {
      errors.push('Source directory does not exist');
    }

    // Validate source is readable
    try {
      await fs.access(args.source, fs.constants.R_OK);
    } catch {
      errors.push('Source directory is not readable');
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  async validateCypressProject(projectPath: string): Promise<CypressProjectValidation> {
    const errors: string[] = [];
    let configPath: string | undefined;

    // Check for cypress.config.js
    const possibleConfigs = [
      path.join(projectPath, 'cypress.config.js'),
      path.join(projectPath, 'cypress.config.ts'),
      path.join(projectPath, 'cypress.json') // Legacy config
    ];

    for (const configFile of possibleConfigs) {
      if (await fs.pathExists(configFile)) {
        configPath = configFile;
        break;
      }
    }

    if (!configPath) {
      errors.push('No cypress.config.js found');
    }

    // Check for cypress directory or test files
    const cypressDir = path.join(projectPath, 'cypress');
    const hasTestFiles = await this.hasAnyTestFiles(projectPath);

    if (!await fs.pathExists(cypressDir) && !hasTestFiles) {
      errors.push('No cypress directory or test files found');
    }

    return {
      isValid: errors.length === 0,
      configPath,
      projectRoot: projectPath,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  async scanForTestFiles(projectPath: string): Promise<TestFileScanResult> {
    const testFiles: string[] = [];
    const configFiles: string[] = [];
    const supportFiles: string[] = [];
    const customCommandFiles: string[] = [];

    const testPatterns = [
      '**/*.cy.js',
      '**/*.cy.ts',
      '**/*.spec.js',
      '**/*.spec.ts',
      '**/e2e/**/*.js',
      '**/e2e/**/*.ts',
      '**/integration/**/*.js',
      '**/integration/**/*.ts'
    ];

    const { glob } = require('glob');

    for (const pattern of testPatterns) {
      const files = await glob(pattern, { cwd: projectPath });

      for (const file of files) {
        const fullPath = path.join(projectPath, file);

        if (file.includes('commands') || file.includes('support')) {
          if (file.includes('commands')) {
            customCommandFiles.push(fullPath);
          } else {
            supportFiles.push(fullPath);
          }
        } else {
          testFiles.push(fullPath);
        }
      }
    }

    // Find config files
    const configPatterns = ['cypress.config.*', 'cypress.json'];
    for (const pattern of configPatterns) {
      const files = await glob(pattern, { cwd: projectPath });
      configFiles.push(...files.map((f: string) => path.join(projectPath, f)));
    }

    return {
      testFiles: [...new Set(testFiles)],
      configFiles: [...new Set(configFiles)],
      supportFiles: [...new Set(supportFiles)],
      customCommandFiles: [...new Set(customCommandFiles)]
    };
  }

  async ensureOutputDirectory(outputPath: string): Promise<void> {
    await fs.ensureDir(outputPath);
  }

  async validateOutputDirectory(outputPath: string): Promise<DirectoryValidation> {
    let isWritable = false;

    try {
      await fs.ensureDir(outputPath);
      await fs.access(outputPath, fs.constants.W_OK);
      isWritable = true;
    } catch (error) {
      return {
        isValid: false,
        isWritable: false,
        errors: [`Output directory is not writable: ${error}`]
      };
    }

    return {
      isValid: true,
      isWritable,
      path: outputPath
    };
  }

  private async hasAnyTestFiles(projectPath: string): Promise<boolean> {
    const result = await this.scanForTestFiles(projectPath);
    return result.testFiles.length > 0;
  }

  /**
   * Scan for potential Cypress projects in subdirectories
   */
  async scanForCypressProjects(rootPath: string, maxDepth: number = 3): Promise<{
    projects: Array<{
      path: string;
      relativePath: string;
      configFile?: string;
      testCount: number;
      confidence: 'high' | 'medium' | 'low';
    }>;
  }> {
    const projects: Array<{
      path: string;
      relativePath: string;
      configFile?: string;
      testCount: number;
      confidence: 'high' | 'medium' | 'low';
    }> = [];

    async function scanDirectory(dirPath: string, currentDepth: number): Promise<void> {
      if (currentDepth > maxDepth) return;

      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        // Check if current directory is a Cypress project
        const configFiles = [
          'cypress.config.js',
          'cypress.config.ts',
          'cypress.json'
        ];

        let configFile: string | undefined;
        for (const configFileName of configFiles) {
          const configPath = path.join(dirPath, configFileName);
          if (await fs.pathExists(configPath)) {
            configFile = configPath;
            break;
          }
        }

        // Check for test files
        const testPatterns = [
          '**/*.cy.js',
          '**/*.cy.ts',
          '**/*.spec.js',
          '**/*.spec.ts'
        ];

        let testCount = 0;
        const { glob } = require('glob');

        for (const pattern of testPatterns) {
          try {
            const files = await glob(pattern, { cwd: dirPath });
            testCount += files.length;
          } catch {
            // Ignore glob errors
          }
        }

        // Check for cypress directory
        const cypressDir = path.join(dirPath, 'cypress');
        const hasCypressDir = await fs.pathExists(cypressDir);

        // Determine confidence level
        let confidence: 'high' | 'medium' | 'low' = 'low';
        if (configFile && testCount > 0) {
          confidence = 'high';
        } else if (configFile || (hasCypressDir && testCount > 0)) {
          confidence = 'medium';
        } else if (testCount > 0 || hasCypressDir) {
          confidence = 'low';
        }

        // Add project if it has any Cypress indicators
        if (configFile || testCount > 0 || hasCypressDir) {
          projects.push({
            path: dirPath,
            relativePath: path.relative(rootPath, dirPath) || '.',
            configFile,
            testCount,
            confidence
          });
        }

        // Recursively scan subdirectories
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            const subDirPath = path.join(dirPath, entry.name);
            await scanDirectory(subDirPath, currentDepth + 1);
          }
        }
      } catch (error) {
        // Ignore permission errors and continue scanning
      }
    }

    await scanDirectory(rootPath, 0);

    // Sort by confidence and test count
    projects.sort((a, b) => {
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      const confidenceDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
      if (confidenceDiff !== 0) return confidenceDiff;
      return b.testCount - a.testCount;
    });

    return { projects };
  }

  /**
   * Interactive directory selection
   */
  async selectCypressProject(projects: Array<{
    path: string;
    relativePath: string;
    configFile?: string;
    testCount: number;
    confidence: 'high' | 'medium' | 'low';
  }>, autoSelect = false): Promise<string | null> {
    if (projects.length === 0) {
      console.log('❌ No Cypress projects found in the repository.');
      return null;
    }

    if (projects.length === 1) {
      const project = projects[0];
      console.log(`✅ Found single Cypress project: ${project.relativePath}`);
      console.log(`   Config: ${project.configFile ? '✅' : '❌'} | Tests: ${project.testCount} | Confidence: ${project.confidence}`);
      return project.path;
    }

    // Auto-select the first valid project if autoSelect is enabled
    if (autoSelect) {
      // Sort projects by confidence and test count to pick the best candidate
      const sortedProjects = projects.sort((a, b) => {
        const confidenceOrder = { high: 3, medium: 2, low: 1 };
        const scoreA = confidenceOrder[a.confidence] * 100 + a.testCount;
        const scoreB = confidenceOrder[b.confidence] * 100 + b.testCount;
        return scoreB - scoreA;
      });

      const selectedProject = sortedProjects[0];
      console.log(`🤖 Auto-selecting best Cypress project: ${selectedProject.relativePath}`);
      console.log(`   Config: ${selectedProject.configFile ? '✅' : '❌'} | Tests: ${selectedProject.testCount} | Confidence: ${selectedProject.confidence}`);
      return selectedProject.path;
    }

    console.log(`\n🔍 Found ${projects.length} potential Cypress projects:`);

    const choices: Array<{name: string; value: string | null; short: string}> = projects.map((project, index) => {
      const configIndicator = project.configFile ? '📄' : '❌';
      const confidenceIndicator = {
        high: '🟢',
        medium: '🟡',
        low: '🔴'
      }[project.confidence];

      return {
        name: `${confidenceIndicator} ${project.relativePath || '.'} ${configIndicator} (${project.testCount} tests)`,
        value: project.path,
        short: project.relativePath || '.'
      };
    });

    choices.push({
      name: '❌ Cancel conversion',
      value: '__CANCEL__',
      short: 'Cancel'
    });

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedProject',
        message: 'Select a Cypress project to convert:',
        choices,
        pageSize: 10
      }
    ]);

    return answer.selectedProject === '__CANCEL__' ? null : answer.selectedProject;
  }

  private async selectBranch(repositoryPath: string): Promise<string | null> {
    const simpleGit = require('simple-git');
    const git = simpleGit(repositoryPath);

    try {
      // Get all branches (local and remote)
      const branchSummary = await git.branch(['-a']);

      // Filter and format branch names
      const branches = Object.keys(branchSummary.branches)
        .filter(branch =>
          !branch.includes('HEAD') &&
          branch !== branchSummary.current
        )
        .map(branch => {
          // Clean up remote branch names
          const cleanName = branch.replace('remotes/origin/', '');
          return {
            name: cleanName,
            isCurrent: branch === branchSummary.current,
            isRemote: branch.includes('remotes/')
          };
        })
        .filter((branch, index, self) =>
          // Remove duplicates (local and remote versions of same branch)
          self.findIndex(b => b.name === branch.name) === index
        )
        .sort((a, b) => {
          // Sort with current branch first, then alphabetically
          if (a.isCurrent) return -1;
          if (b.isCurrent) return 1;
          return a.name.localeCompare(b.name);
        });

      // Add current branch to the list if not already there
      const currentBranch = branchSummary.current;
      if (currentBranch && !branches.find(b => b.name === currentBranch)) {
        branches.unshift({
          name: currentBranch,
          isCurrent: true,
          isRemote: false
        });
      }

      if (branches.length <= 1) {
        console.log(`📍 Using branch: ${currentBranch || 'main'}`);
        return currentBranch || 'main';
      }

      console.log(`\n🌿 Found ${branches.length} available branches:`);

      const choices = branches.map(branch => ({
        name: `${branch.isCurrent ? '➤ ' : '  '}${branch.name}${branch.isCurrent ? ' (current)' : ''}`,
        value: branch.name,
        short: branch.name
      }));

      choices.push({
        name: '❌ Cancel conversion',
        value: '__CANCEL__',
        short: 'Cancel'
      });

      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedBranch',
          message: 'Select a branch to work with:',
          choices,
          pageSize: 10
        }
      ]);

      if (answer.selectedBranch === '__CANCEL__') {
        return null;
      }

      // Switch to selected branch if it's different from current
      if (answer.selectedBranch !== currentBranch) {
        console.log(`🔄 Switching to branch: ${answer.selectedBranch}`);
        await git.checkout(answer.selectedBranch);
        console.log(`✅ Switched to branch: ${answer.selectedBranch}`);
      }

      return answer.selectedBranch;

    } catch (error) {
      console.error('❌ Error fetching branches:', error instanceof Error ? error.message : String(error));
      // Fallback to current branch
      try {
        const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
        return currentBranch.trim();
      } catch {
        return 'main'; // Ultimate fallback
      }
    }
  }

  private async handleConversionEnhanced(options: ConversionOptions): Promise<void> {
    console.log('🚀 Starting Enhanced Cypress to Playwright conversion...');
    console.log(`Source: ${options.sourceDir}`);
    console.log(`Output: ${options.outputDir}`);

    try {
      const result = await this.enhancedConversionService.convertProject({
        sourceDir: options.sourceDir,
        outputDir: options.outputDir,
        preserveMethodChaining: options.preserveMethodChaining,
        convertPageObjects: options.generatePageObjects,
        deduplicateImports: options.deduplicateImports,
        transformImportPaths: options.transformImportPaths,
        convertTestStructure: options.convertTestStructure,
        verbose: options.verbose
      });

      console.log('\n🎉 Conversion completed successfully!');
      console.log('📊 Conversion Summary:');
      console.log(`  - Total test files: ${result.summary.totalFiles}`);
      console.log(`  - Successfully converted: ${result.summary.convertedFiles}`);
      console.log(`  - Page objects generated: ${result.summary.pageObjectFiles}`);
      console.log(`  - Configuration files: 0`);
      console.log(`  - Conversion rate: ${result.summary.conversionRate.toFixed(1)}%`);

      if (result.summary.warnings.length > 0) {
        console.log('\n⚠️  Conversion warnings:');
        result.summary.warnings.forEach(warning => console.log(`  - ${warning}`));
      }

      if (result.summary.errors.length > 0) {
        console.log('\n❌ Conversion errors:');
        result.summary.errors.forEach(error => console.log(`  - ${error}`));
      }

      console.log('\n📋 Next steps:');
      console.log('  - Run `npm install` to install Playwright dependencies');
      console.log('  - Run `npx playwright test` to execute converted tests');
      console.log('  - Update any remaining test-specific configurations');

      console.log(`\n📁 Generated files in ${options.outputDir}:`);
      for (const file of result.convertedFiles) {
        const relativeOutputPath = file.convertedPath.replace(options.outputDir + '/', '');
        console.log(`  - ${relativeOutputPath}`);
      }

    } catch (error) {
      console.error('❌ Enhanced conversion failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async handleConversion(options: ConversionOptions): Promise<void> {
    console.log('🚀 Starting Cypress to Playwright conversion...');
    console.log(`Source: ${options.sourceDir}`);
    console.log(`Output: ${options.outputDir}`);

    // Validate source project
    const projectValidation = await this.validateCypressProject(options.sourceDir);
    if (!projectValidation.isValid) {
      console.error('❌ Invalid Cypress project:');
      projectValidation.errors?.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    // Ensure output directory
    await this.ensureOutputDirectory(options.outputDir);

    // Scan for files
    const scanResult = await this.scanForTestFiles(options.sourceDir);
    console.log(`📁 Found ${scanResult.testFiles.length} test files`);
    console.log(`📁 Found ${scanResult.configFiles.length} config files`);
    console.log(`📁 Found ${scanResult.customCommandFiles.length} custom command files`);

    if (options.verbose) {
      console.log('\nTest files:');
      scanResult.testFiles.forEach(file => console.log(`  - ${file}`));
    }

    console.log('\n✅ Project validation complete. Starting conversion...');

    try {
      // Parse and convert configuration
      let playwrightConfig = {};
      if (scanResult.configFiles.length > 0) {
        console.log('📄 Converting configuration file...');
        const configParseResult = await this.configMigrator.parseConfigFile(scanResult.configFiles[0]);
        if (configParseResult.success && configParseResult.config) {
          const configMigrationResult = this.configMigrator.migrateConfig(configParseResult.config);
          if (configMigrationResult.success) {
            playwrightConfig = configMigrationResult.playwrightConfig;
            console.log('✅ Configuration converted successfully');
            if (configMigrationResult.warnings.length > 0) {
              console.log('⚠️  Configuration warnings:');
              configMigrationResult.warnings.forEach(warning => console.log(`  - ${warning}`));
            }
          }
        }
      }

      // Create Playwright project structure
      console.log('📁 Creating Playwright project structure...');
      const projectOptions: ProjectGenerationOptions = {
        outputDir: options.outputDir,
        testDir: 'tests',
        includePageObjects: options.generatePageObjects,
        includeFixtures: true
      };

      const structureResult = await this.projectGenerator.createPlaywrightProjectStructure(projectOptions);
      if (!structureResult.success) {
        console.error('❌ Failed to create project structure');
        structureResult.errors.forEach(error => console.error(`  - ${error}`));
        return;
      }

      // Parse and convert test files
      const convertedFiles = [];
      const pageObjectFiles = [];
      const allCustomCommands = [];

      console.log('🔄 Converting test files...');
      for (const testFile of scanResult.testFiles) {
        try {
          const cypressTestFile = await this.astParser.parseTestFile(testFile);

          // Convert test file
          const testConversionResult = await this.projectGenerator.generateConvertedTestFile(
            cypressTestFile,
            {
              outputDir: options.outputDir,
              usePageObjects: options.generatePageObjects || false
            }
          );

          if (testConversionResult.success && testConversionResult.convertedFile) {
            convertedFiles.push(testConversionResult.convertedFile);
            if (cypressTestFile.customCommands) {
              allCustomCommands.push(...cypressTestFile.customCommands);
            }
          }
        } catch (error) {
          console.warn(`⚠️  Failed to parse test file ${testFile}: ${error}`);
        }
      }

      // Parse custom command files
      for (const commandFile of scanResult.customCommandFiles) {
        try {
          const customCommands = await this.astParser.parseCustomCommands(commandFile);
          allCustomCommands.push(...customCommands);
        } catch (error) {
          console.warn(`⚠️  Failed to parse custom commands file ${commandFile}: ${error}`);
        }
      }

      // Generate page objects from custom commands
      if (options.generatePageObjects && allCustomCommands.length > 0) {
        console.log('📝 Generating page objects from custom commands...');
        const pageObjectResult = await this.projectGenerator.generatePageObjectFile(
          allCustomCommands,
          'CustomCommandsPage',
          {
            outputDir: options.outputDir,
            pageObjectDir: path.join(projectOptions.testDir, 'page-objects')
          }
        );

        if (pageObjectResult.success && pageObjectResult.pageObjectFile) {
          pageObjectFiles.push(pageObjectResult.pageObjectFile);
        }
      }

      // Write all files to output directory
      console.log('💾 Writing converted files...');
      const writeResult = await this.projectGenerator.writeProjectFiles({
        outputDir: options.outputDir,
        projectStructure: structureResult.structure!,
        convertedFiles,
        pageObjectFiles,
        playwrightConfig,
        configFormat: 'typescript',
        generatePackageJson: true
      });

      if (!writeResult.success) {
        console.error('❌ Failed to write project files');
        writeResult.errors.forEach(error => console.error(`  - ${error}`));
        return;
      }

      // Generate and display summary
      const summary = this.projectGenerator.generateConversionSummary(writeResult);

      console.log('\n🎉 Conversion completed successfully!');
      console.log(`📊 Conversion Summary:`);
      console.log(`  - Total test files: ${summary.totalFiles}`);
      console.log(`  - Successfully converted: ${summary.convertedTestFiles}`);
      console.log(`  - Page objects generated: ${summary.pageObjectFiles}`);
      console.log(`  - Configuration files: ${summary.configFiles}`);
      console.log(`  - Conversion rate: ${summary.conversionRate.toFixed(1)}%`);

      if (summary.warningsCount > 0) {
        console.log(`  - Warnings: ${summary.warningsCount}`);
      }

      if (summary.errorsCount > 0) {
        console.log(`  - Errors: ${summary.errorsCount}`);
      }

      console.log('\n📋 Next steps:');
      summary.nextSteps.forEach(step => console.log(`  - ${step}`));

      if (writeResult.writtenFiles && writeResult.writtenFiles.length > 0) {
        console.log(`\n📁 Generated files in ${options.outputDir}:`);
        writeResult.writtenFiles.forEach(file => {
          const relativePath = path.relative(options.outputDir, file);
          console.log(`  - ${relativePath}`);
        });
      }

    } catch (error) {
      console.error('❌ Conversion failed:', error);
      process.exit(1);
    }
  }

  private async handleGitHubConversion(options: {
    githubUrl: string;
    outputDir: string;
    preserveStructure: boolean;
    generatePageObjects: boolean;
    autoSelect: boolean;
    verbose: boolean;
  }): Promise<void> {
    console.log('🚀 Starting GitHub repository conversion...');
    console.log(`Repository: ${options.githubUrl}`);
    console.log(`Output: ${options.outputDir}`);

    let clonedPath: string | undefined;

    try {
      // Step 1: Parse and validate GitHub URL
      const repoInfo = this.githubRepo.parseRepositoryUrl(options.githubUrl);
      console.log(`📋 Repository: ${repoInfo.owner}/${repoInfo.repo} (${repoInfo.branch})`);

      // Step 2: Validate repository accessibility
      const validation = await this.githubRepo.validateAccess(options.githubUrl);
      if (!validation.accessible) {
        console.error('❌ Repository validation failed:');
        console.error(`  - ${validation.error}`);
        process.exit(1);
      }

      // Step 3: Clone repository to .conversion directory
      const conversionDir = path.join(process.cwd(), '.conversion');
      await fs.ensureDir(conversionDir);

      clonedPath = path.join(conversionDir, `${repoInfo.owner}-${repoInfo.repo}`);

      // Detect the actual default branch before cloning
      console.log('🔍 Detecting default branch...');
      const actualBranch = await this.githubRepo.detectDefaultBranch(options.githubUrl);
      console.log(`📋 Using branch: ${actualBranch}`);

      console.log(`📥 Cloning repository to: ${clonedPath}`);

      const cloneResult = await this.githubRepo.cloneRepository(options.githubUrl, clonedPath, {
        branch: actualBranch,
        clean: true,
        depth: 0, // Full clone to get all examples and branches
        retries: 2
      });

      if (!cloneResult.success) {
        console.error('❌ Failed to clone repository:');
        console.error(`  - ${cloneResult.error}`);
        process.exit(1);
      }

      console.log('✅ Repository cloned successfully');

      // Step 4: Branch selection
      console.log('🌿 Fetching available branches...');
      const selectedBranch = await this.selectBranch(clonedPath);
      if (!selectedBranch) {
        console.log('❌ No branch selected. Conversion cancelled.');
        process.exit(1);
      }

      // Step 5: Scan for Cypress projects in the repository
      console.log('🔍 Scanning for Cypress projects...');
      const scanResult = await this.scanForCypressProjects(clonedPath);

      // Step 5: Select project directory (interactive if multiple found)
      const selectedProjectPath = await this.selectCypressProject(scanResult.projects, options.autoSelect);
      if (!selectedProjectPath) {
        console.log('❌ Conversion cancelled or no valid project selected.');
        process.exit(1);
      }

      // Step 6: Validate selected project
      const projectValidation = await this.validateCypressProject(selectedProjectPath);
      if (!projectValidation.isValid) {
        console.error('❌ Invalid Cypress project:');
        projectValidation.errors?.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }

      // Step 7: Run conversion within the selected project directory
      console.log('🔄 Starting conversion within selected project...');
      console.log(`📁 Converting: ${path.relative(clonedPath, selectedProjectPath) || '.'}`);;

      // Convert in-place - place Playwright files alongside Cypress files
      await this.handleConversion({
        sourceDir: selectedProjectPath,
        outputDir: selectedProjectPath, // Use same directory as source
        preserveStructure: options.preserveStructure,
        generatePageObjects: options.generatePageObjects,
        verbose: options.verbose
      });

      console.log(`\n🎉 GitHub repository conversion completed!`);
      console.log(`📁 Cloned repository: ${clonedPath}`);
      console.log(`📁 Converted project: ${selectedProjectPath}`);

    } catch (error) {
      console.error('❌ GitHub conversion failed:', error);

      // Cleanup on error
      if (clonedPath && await fs.pathExists(clonedPath)) {
        try {
          console.log('🧹 Cleaning up failed conversion...');
          await fs.remove(clonedPath);
        } catch (cleanupError) {
          console.warn(`⚠️ Failed to cleanup ${clonedPath}:`, cleanupError);
        }
      }

      process.exit(1);
    }
  }

  private async handleGitLabConversion(options: {
    gitlabUrl: string;
    outputDir: string;
    preserveStructure: boolean;
    generatePageObjects: boolean;
    autoSelect: boolean;
    verbose: boolean;
  }): Promise<void> {
    console.log('🚀 Starting GitLab repository conversion...');
    console.log(`Repository: ${options.gitlabUrl}`);
    console.log(`Output: ${options.outputDir}`);

    let clonedPath: string | undefined;

    try {
      // Step 1: Parse and validate GitLab URL
      const repoInfo = this.gitlabRepo.parseRepositoryUrl(options.gitlabUrl);
      console.log(`📋 Repository: ${repoInfo.owner}/${repoInfo.repo} (${repoInfo.branch})`);

      // Step 2: Validate repository accessibility
      const validation = await this.gitlabRepo.validateAccess(options.gitlabUrl);
      if (!validation.accessible) {
        console.error('❌ Repository validation failed:');
        console.error(`  - ${validation.error}`);
        process.exit(1);
      }

      // Step 3: Clone repository to .conversion directory
      const conversionDir = path.join(process.cwd(), '.conversion');
      await fs.ensureDir(conversionDir);

      clonedPath = path.join(conversionDir, `${repoInfo.owner}-${repoInfo.repo}`);

      // Detect the actual default branch before cloning
      console.log('🔍 Detecting default branch...');
      const actualBranch = await this.gitlabRepo.detectDefaultBranch(options.gitlabUrl);
      console.log(`📋 Using branch: ${actualBranch}`);

      console.log(`📥 Cloning repository to: ${clonedPath}`);

      const cloneResult = await this.gitlabRepo.cloneRepository(options.gitlabUrl, clonedPath, {
        branch: actualBranch,
        clean: true,
        depth: 0, // Full clone to get all examples and branches
        retries: 2
      });

      if (!cloneResult.success) {
        console.error('❌ Failed to clone repository:');
        console.error(`  - ${cloneResult.error}`);
        process.exit(1);
      }

      console.log('✅ Repository cloned successfully');

      // Step 4: Branch selection
      console.log('🌿 Fetching available branches...');
      const selectedBranch = await this.selectBranch(clonedPath);
      if (!selectedBranch) {
        console.log('❌ No branch selected. Conversion cancelled.');
        process.exit(1);
      }

      // Step 5: Scan for Cypress projects in the repository
      console.log('🔍 Scanning for Cypress projects...');
      const scanResult = await this.scanForCypressProjects(clonedPath);

      // Step 6: Select project directory (interactive if multiple found)
      const selectedProjectPath = await this.selectCypressProject(scanResult.projects, options.autoSelect);
      if (!selectedProjectPath) {
        console.log('❌ Conversion cancelled or no valid project selected.');
        process.exit(1);
      }

      // Step 7: Validate selected project
      const projectValidation = await this.validateCypressProject(selectedProjectPath);
      if (!projectValidation.isValid) {
        console.error('❌ Invalid Cypress project:');
        projectValidation.errors?.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }

      // Step 8: Run conversion within the selected project directory
      console.log('🔄 Starting conversion within selected project...');
      console.log(`📁 Converting: ${path.relative(clonedPath, selectedProjectPath) || '.'}`);

      // Convert in-place - place Playwright files alongside Cypress files
      await this.handleConversion({
        sourceDir: selectedProjectPath,
        outputDir: selectedProjectPath, // Use same directory as source
        preserveStructure: options.preserveStructure,
        generatePageObjects: options.generatePageObjects,
        verbose: options.verbose
      });

      console.log(`\n🎉 GitLab repository conversion completed!`);
      console.log(`📁 Cloned repository: ${clonedPath}`);
      console.log(`📁 Converted project: ${selectedProjectPath}`);

    } catch (error) {
      console.error('❌ GitLab conversion failed:', error);

      // Cleanup on error
      if (clonedPath && await fs.pathExists(clonedPath)) {
        try {
          console.log('🧹 Cleaning up failed conversion...');
          await fs.remove(clonedPath);
        } catch (cleanupError) {
          console.warn(`⚠️ Failed to cleanup ${clonedPath}:`, cleanupError);
        }
      }

      process.exit(1);
    }
  }

  private async handleRepositoryConversion(options: {
    repoUrl: string;
    outputDir: string;
    preserveStructure: boolean;
    generatePageObjects: boolean;
    verbose: boolean;
  }): Promise<void> {
    console.log('🚀 Starting repository conversion...');
    console.log(`Repository: ${options.repoUrl}`);

    // Step 1: Auto-detect platform
    const detection = this.repoDetector.detectPlatform(options.repoUrl);

    if (!detection.isValid) {
      console.error('❌ Repository URL validation failed:');
      console.error(`  - ${detection.error}`);
      process.exit(1);
    }

    console.log(`🔍 Detected platform: ${detection.platform.toUpperCase()}`);

    // Step 2: Route to appropriate handler
    switch (detection.platform) {
      case 'github':
        await this.handleGitHubConversion({
          githubUrl: options.repoUrl,
          outputDir: options.outputDir,
          preserveStructure: options.preserveStructure,
          generatePageObjects: options.generatePageObjects,
          autoSelect: false, // Default to false for convert-repo command
          verbose: options.verbose
        });
        break;

      case 'gitlab':
        await this.handleGitLabConversion({
          gitlabUrl: options.repoUrl,
          outputDir: options.outputDir,
          preserveStructure: options.preserveStructure,
          generatePageObjects: options.generatePageObjects,
          autoSelect: false, // Default to false for convert-repo command
          verbose: options.verbose
        });
        break;

      default:
        console.error('❌ Unsupported repository platform');
        console.error(`  - Supported platforms: GitHub, GitLab`);
        process.exit(1);
    }
  }

  run(argv: string[] = process.argv): void {
    this.program.parse(argv);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  const cli = new CLI();
  cli.run();
}