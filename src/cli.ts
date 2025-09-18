#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
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

export class CLI {
  private program: Command;
  private astParser: ASTParser;
  private configMigrator: ConfigMigrator;
  private projectGenerator: ProjectGenerator;
  private githubRepo: GitHubRepository;

  constructor() {
    this.program = new Command();
    this.astParser = new ASTParser();
    this.configMigrator = new ConfigMigrator();
    this.projectGenerator = new ProjectGenerator();
    this.githubRepo = new GitHubRepository();
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
      .option('-v, --verbose', 'Enable verbose logging', false)
      .action(async (options) => {
        await this.handleConversion({
          sourceDir: options.source,
          outputDir: options.output,
          preserveStructure: options.preserveStructure,
          generatePageObjects: options.generatePageObjects,
          verbose: options.verbose
        });
      });

    this.program
      .option('--github-url <url>', 'GitHub repository URL to clone and convert')
      .option('-o, --output <path>', 'Output directory for converted Playwright project', './playwright-project')
      .option('--preserve-structure', 'Preserve original directory structure', false)
      .option('--generate-page-objects', 'Generate page object models from custom commands', true)
      .option('-v, --verbose', 'Enable verbose logging', false)
      .action(async (options) => {
        if (options.githubUrl) {
          await this.handleGitHubConversion({
            githubUrl: options.githubUrl,
            outputDir: options.output,
            preserveStructure: options.preserveStructure,
            generatePageObjects: options.generatePageObjects,
            verbose: options.verbose
          });
        }
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

      console.log(`📥 Cloning repository to: ${clonedPath}`);

      const cloneResult = await this.githubRepo.cloneRepository(options.githubUrl, clonedPath, {
        branch: repoInfo.branch,
        clean: true,
        depth: 1,
        retries: 2
      });

      if (!cloneResult.success) {
        console.error('❌ Failed to clone repository:');
        console.error(`  - ${cloneResult.error}`);
        process.exit(1);
      }

      console.log('✅ Repository cloned successfully');

      // Step 4: Validate as Cypress project
      const projectValidation = await this.validateCypressProject(clonedPath);
      if (!projectValidation.isValid) {
        console.error('❌ Invalid Cypress project:');
        projectValidation.errors?.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }

      // Step 5: Run conversion within the cloned project directory
      console.log('🔄 Starting conversion within cloned project...');

      // Create output directory within the cloned project
      const projectOutputDir = path.join(clonedPath, options.outputDir);

      await this.handleConversion({
        sourceDir: clonedPath,
        outputDir: projectOutputDir,
        preserveStructure: options.preserveStructure,
        generatePageObjects: options.generatePageObjects,
        verbose: options.verbose
      });

      console.log(`\n🎉 GitHub repository conversion completed!`);
      console.log(`📁 Cloned repository: ${clonedPath}`);
      console.log(`📁 Converted project: ${projectOutputDir}`);

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

  run(argv: string[] = process.argv): void {
    this.program.parse(argv);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  const cli = new CLI();
  cli.run();
}