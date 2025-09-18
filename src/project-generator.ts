import * as fs from 'fs-extra';
import * as path from 'path';
import {
  ProjectGenerationOptions,
  ProjectGenerationResult,
  PlaywrightProjectStructure,
  ConvertedTestFile,
  PageObjectFile,
  ConversionSummary,
  CypressTestFile,
  CustomCommand,
  TestFileGenerationOptions,
  PageObjectGenerationOptions,
  FileWriteOptions,
  PlaywrightConfig
} from './types';
import { CommandConverter } from './command-converter';
import { ConfigMigrator } from './config-migrator';

export class ProjectGenerator {
  private commandConverter: CommandConverter;
  private configMigrator: ConfigMigrator;

  constructor() {
    this.commandConverter = new CommandConverter();
    this.configMigrator = new ConfigMigrator();
  }

  async createPlaywrightProjectStructure(options: ProjectGenerationOptions): Promise<ProjectGenerationResult> {
    try {
      const structure: PlaywrightProjectStructure = {
        testDir: options.testDir,
        pageObjectDir: options.pageObjectDir || (options.includePageObjects ? path.join(options.testDir, 'page-objects') : undefined),
        fixturesDir: options.fixturesDir || (options.includeFixtures ? path.join(options.testDir, 'fixtures') : undefined),
        resultsDir: options.resultsDir || 'test-results',
        reportDir: options.reportDir || 'playwright-report'
      };

      const directoriesToCreate = [
        path.join(options.outputDir, structure.testDir),
        path.join(options.outputDir, structure.resultsDir!),
        path.join(options.outputDir, structure.reportDir!)
      ];

      if (structure.pageObjectDir) {
        directoriesToCreate.push(path.join(options.outputDir, structure.pageObjectDir));
      }

      if (structure.fixturesDir) {
        directoriesToCreate.push(path.join(options.outputDir, structure.fixturesDir));
      }

      for (const dir of directoriesToCreate) {
        await fs.ensureDir(dir);
      }

      return {
        success: true,
        structure,
        warnings: [],
        errors: []
      };
    } catch (error) {
      return {
        success: false,
        structure: undefined,
        warnings: [],
        errors: [`Failed to create directory structure: ${error}`]
      };
    }
  }

  async generateConvertedTestFile(
    cypressTestFile: CypressTestFile,
    options: TestFileGenerationOptions
  ): Promise<{
    success: boolean;
    convertedFile?: ConvertedTestFile;
    error?: string;
  }> {
    try {
      const outputFileName = this.getPlaywrightFileName(cypressTestFile.filePath);
      const outputPath = path.join(
        options.outputDir,
        'tests',
        path.basename(outputFileName)
      );

      let content = this.generateImports(cypressTestFile, options.usePageObjects);

      if (options.usePageObjects && cypressTestFile.customCommands?.length) {
        content += this.generatePageObjectImports(cypressTestFile.customCommands);
        content += this.generatePageObjectInstances();
      }

      content += '\n';
      content += this.generateTestContent(cypressTestFile, options.usePageObjects);

      return {
        success: true,
        convertedFile: {
          filePath: outputPath,
          content,
          originalPath: cypressTestFile.filePath
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate test file: ${error}`
      };
    }
  }

  async generatePageObjectFile(
    customCommands: CustomCommand[],
    className: string,
    options: PageObjectGenerationOptions
  ): Promise<{
    success: boolean;
    pageObjectFile?: PageObjectFile;
    error?: string;
  }> {
    try {
      const filePath = path.join(options.outputDir, options.pageObjectDir, `${className}.ts`);

      let content = "import { Page } from '@playwright/test';\n\n";
      content += `export class ${className} {\n`;
      content += "  constructor(private page: Page) {}\n\n";

      const methods = [];
      for (const command of customCommands) {
        const method = this.generatePageObjectMethod(command);
        content += `  ${method.code}\n\n`;
        methods.push({
          className,
          methodName: command.name,
          parameters: command.parameters,
          playwrightCode: method.code,
          imports: []
        });
      }

      content += "}\n";

      return {
        success: true,
        pageObjectFile: {
          className,
          filePath,
          content,
          methods
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate page object: ${error}`
      };
    }
  }

  async writeProjectFiles(options: FileWriteOptions): Promise<ProjectGenerationResult> {
    try {
      const writtenFiles: string[] = [];

      // Write test files
      for (const testFile of options.convertedFiles) {
        await fs.ensureDir(path.dirname(testFile.filePath));
        await fs.writeFile(testFile.filePath, testFile.content, 'utf8');
        writtenFiles.push(testFile.filePath);
      }

      // Write page object files
      for (const pageObjectFile of options.pageObjectFiles) {
        await fs.ensureDir(path.dirname(pageObjectFile.filePath));
        await fs.writeFile(pageObjectFile.filePath, pageObjectFile.content, 'utf8');
        writtenFiles.push(pageObjectFile.filePath);
      }

      // Write Playwright config
      const configFileName = options.configFormat === 'typescript' ? 'playwright.config.ts' : 'playwright.config.js';
      const configPath = path.join(options.outputDir, configFileName);
      const configContent = this.configMigrator.generatePlaywrightConfig(
        options.playwrightConfig,
        options.configFormat === 'typescript'
      );
      await fs.writeFile(configPath, configContent, 'utf8');
      writtenFiles.push(configPath);

      // Write package.json if requested
      if (options.generatePackageJson) {
        const packageJsonPath = path.join(options.outputDir, 'package.json');
        const packageJsonContent = this.generatePackageJson();
        await fs.writeFile(packageJsonPath, JSON.stringify(packageJsonContent, null, 2), 'utf8');
        writtenFiles.push(packageJsonPath);
      }

      return {
        success: true,
        structure: options.projectStructure,
        convertedFiles: options.convertedFiles,
        pageObjectFiles: options.pageObjectFiles,
        writtenFiles,
        warnings: [],
        errors: []
      };
    } catch (error) {
      return {
        success: false,
        structure: options.projectStructure,
        warnings: [],
        errors: [`Failed to write project files: ${error}`]
      };
    }
  }

  generateConversionSummary(result: ProjectGenerationResult): ConversionSummary {
    const totalTestFiles = (result.convertedFiles?.length || 0) + result.errors.length;
    const convertedTestFiles = result.convertedFiles?.length || 0;
    const pageObjectFiles = result.pageObjectFiles?.length || 0;
    const configFiles = result.configFile ? 1 : 0;
    const warningsCount = result.warnings.length;
    const errorsCount = result.errors.length;

    const conversionRate = totalTestFiles > 0 ? (convertedTestFiles / totalTestFiles) * 100 : 100;

    const recommendations: string[] = [];
    const nextSteps: string[] = [];

    if (errorsCount > 0) {
      recommendations.push('Review and manually fix failed conversions');
      nextSteps.push('Check error logs and manually convert failed test files');
    }

    if (warningsCount > 0) {
      recommendations.push('Review warning messages for manual adjustments needed');
      nextSteps.push('Update converted tests based on warning recommendations');
    }

    if (pageObjectFiles > 0) {
      nextSteps.push('Review generated page objects and optimize for your specific use case');
    }

    nextSteps.push('Run `npm install` to install Playwright dependencies');
    nextSteps.push('Run `npx playwright test` to execute converted tests');
    nextSteps.push('Update any remaining test-specific configurations');

    return {
      totalFiles: totalTestFiles,
      convertedTestFiles,
      pageObjectFiles,
      configFiles,
      warningsCount,
      errorsCount,
      success: result.success && errorsCount === 0,
      conversionRate,
      recommendations,
      nextSteps
    };
  }

  private getPlaywrightFileName(cypressFilePath: string): string {
    const fileName = path.basename(cypressFilePath);
    return fileName
      .replace(/\.cy\.(js|ts)$/, '.spec.$1')
      .replace(/\.spec\.(js|ts)$/, '.spec.$1'); // Already correct
  }

  private generateImports(cypressTestFile: CypressTestFile, usePageObjects: boolean): string {
    let imports = "import { test, expect } from '@playwright/test';\n";

    if (cypressTestFile.imports) {
      for (const importStmt of cypressTestFile.imports) {
        let importLine = 'import ';

        if (importStmt.defaultImport) {
          importLine += importStmt.defaultImport;
          if (importStmt.namedImports?.length) {
            importLine += ', ';
          }
        }

        if (importStmt.namedImports?.length) {
          importLine += `{ ${importStmt.namedImports.join(', ')} }`;
        }

        importLine += ` from '${importStmt.source}';\n`;
        imports += importLine;
      }
    }

    return imports;
  }

  private generatePageObjectImports(customCommands: CustomCommand[]): string {
    const uniqueClasses = [...new Set(customCommands.map(cmd => this.getPageObjectClassName(cmd.name)))];
    return uniqueClasses
      .map(className => `import { ${className} } from '../page-objects/${className}';`)
      .join('\n') + '\n';
  }

  private generatePageObjectInstances(): string {
    return '\ntest.beforeEach(async ({ page }) => {\n' +
           '  const loginPage = new LoginPage(page);\n' +
           '});\n';
  }

  private generateTestContent(cypressTestFile: CypressTestFile, usePageObjects: boolean): string {
    let content = '';

    for (const describe of cypressTestFile.describes) {
      content += this.generateDescribeBlock(describe, usePageObjects, 0, cypressTestFile);
    }

    return content;
  }

  private generateDescribeBlock(describe: any, usePageObjects: boolean, indent: number, cypressTestFile: CypressTestFile): string {
    const indentStr = '  '.repeat(indent);
    let content = `${indentStr}test.describe('${describe.name}', () => {\n`;

    // Generate nested describes
    if (describe.describes) {
      for (const nestedDescribe of describe.describes) {
        content += this.generateDescribeBlock(nestedDescribe, usePageObjects, indent + 1, cypressTestFile);
      }
    }

    // Generate tests
    for (const test of describe.tests) {
      content += `${indentStr}  test('${test.name}', async ({ page }) => {\n`;

      for (const command of test.commands) {
        // Check if this is a custom command and we're using page objects
        if (usePageObjects && cypressTestFile.customCommands?.some(cmd => cmd.name === command.command)) {
          const customCommand = cypressTestFile.customCommands.find(cmd => cmd.name === command.command);
          if (customCommand) {
            const pageObjectClass = this.getPageObjectClassName(customCommand.name);
            const pageObjectVar = pageObjectClass.charAt(0).toLowerCase() + pageObjectClass.slice(1);
            const args = command.args.map((arg: any) => typeof arg === 'string' ? `'${arg}'` : arg).join(', ');
            content += `${indentStr}    await ${pageObjectVar}.${command.command}(${args});\n`;
            continue;
          }
        }

        const converted = this.commandConverter.convertCommand(command);

        if (converted.playwrightCode) {
          content += `${indentStr}    ${converted.playwrightCode}\n`;
        }
      }

      content += `${indentStr}  });\n\n`;
    }

    content += `${indentStr}});\n\n`;
    return content;
  }

  private generatePageObjectMethod(command: CustomCommand): { code: string } {
    const paramList = command.parameters.length > 0
      ? command.parameters.map(param => `${param}: any`).join(', ')
      : '';

    let methodBody = '    // TODO: Convert Cypress command body to Playwright actions\n';

    // Simple conversion of common patterns
    if (command.body.includes('cy.get')) {
      const converted = this.convertCypressBodyToPlaywright(command.body);
      methodBody = `    ${converted}\n`;
    }

    return {
      code: `async ${command.name}(${paramList}) {\n${methodBody}  }`
    };
  }

  private convertCypressBodyToPlaywright(cypressBody: string): string {
    return cypressBody
      .replace(/cy\.get\(["']\[data-testid=["']?([^"'\]]+)["']?\]["']\)\.type\(([^)]+)\)/g, 'await this.page.getByTestId(\'$1\').fill($2)')
      .replace(/cy\.get\(["']\[data-testid=["']?([^"'\]]+)["']?\]["']\)\.click\(\)/g, 'await this.page.getByTestId(\'$1\').click()')
      .replace(/cy\.get\(["']([^"']+)["']\)\.type\(([^)]+)\)/g, 'await this.page.locator(\'$1\').fill($2)')
      .replace(/cy\.get\(["']([^"']+)["']\)\.click\(\)/g, 'await this.page.locator(\'$1\').click()')
      .replace(/cy\.get\(["']\[data-testid=["']?([^"'\]]+)["']?\]["']\)/g, 'this.page.getByTestId(\'$1\')')
      .replace(/;/g, ';\n    ');
  }

  private getPageObjectClassName(commandName: string): string {
    // Simple mapping - in real implementation this could be more sophisticated
    if (commandName.toLowerCase().includes('login')) return 'LoginPage';
    if (commandName.toLowerCase().includes('auth')) return 'AuthPage';
    return 'BasePage';
  }

  private generatePackageJson(): any {
    return {
      name: 'converted-playwright-tests',
      version: '1.0.0',
      description: 'Playwright tests converted from Cypress',
      scripts: {
        test: 'playwright test',
        'test:headed': 'playwright test --headed',
        'test:ui': 'playwright test --ui',
        'test:debug': 'playwright test --debug',
        report: 'playwright show-report'
      },
      devDependencies: {
        '@playwright/test': '^1.40.0',
        '@types/node': '^20.0.0'
      }
    };
  }
}