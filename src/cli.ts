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
  ConversionOptions
} from './types';

export class CLI {
  private program: Command;

  constructor() {
    this.program = new Command();
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

    console.log('\n✅ Project validation complete. Ready for conversion.');
    console.log('Note: Actual conversion logic will be implemented in subsequent tasks.');
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