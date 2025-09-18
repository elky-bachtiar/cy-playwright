import * as fs from 'fs-extra';
import * as path from 'path';

export interface BuildConversionOptions {
  preserveComments?: boolean;
  updateDependencies?: boolean;
  addPlaywrightScripts?: boolean;
}

export interface ConvertedFile {
  type: 'package.json' | 'makefile' | 'build-script' | 'shell-script';
  originalPath: string;
  convertedPath: string;
  conversionSummary: {
    scriptsConverted?: number;
    commandsConverted?: number;
    dependenciesUpdated?: number;
  };
}

export interface BuildAutomationConversionResult {
  success: boolean;
  convertedFiles: ConvertedFile[];
  summary: {
    scriptsConverted: number;
    commandsConverted: number;
    dependenciesUpdated: number;
    conversionTimeMs: number;
  };
  warnings: string[];
  errors: string[];
}

export class BuildScriptConverter {
  private readonly cypressCommandPatterns = [
    'cypress run',
    'cypress open',
    'npm run cy:run',
    'npm run cy:open',
    'yarn cy:run',
    'yarn cy:open',
    'npx cypress run',
    'npx cypress open'
  ];

  private readonly browserMapping: { [key: string]: string } = {
    chrome: 'chromium',
    firefox: 'firefox',
    edge: 'webkit',
    webkit: 'webkit',
    chromium: 'chromium',
    electron: 'chromium'
  };

  /**
   * Detect Cypress scripts in package.json
   */
  async detectCypressScripts(packagePath: string): Promise<string[]> {
    try {
      const packageData = await this.parsePackageJson(packagePath);
      const cypressScripts: string[] = [];

      if (packageData.scripts) {
        for (const [scriptName, scriptCommand] of Object.entries(packageData.scripts)) {
          if (this.hasCypressCommands(scriptCommand)) {
            cypressScripts.push(scriptName);
          }
        }
      }

      return cypressScripts;
    } catch (error) {
      throw new Error(`Failed to detect Cypress scripts: ${error}`);
    }
  }

  /**
   * Check if package.json uses start-server-and-test
   */
  async hasStartServerAndTest(packagePath: string): Promise<boolean> {
    try {
      const packageData = await this.parsePackageJson(packagePath);

      // Check in dependencies
      if (packageData.dependencies?.['start-server-and-test'] ||
          packageData.devDependencies?.['start-server-and-test']) {
        return true;
      }

      // Check in scripts
      if (packageData.scripts) {
        for (const scriptCommand of Object.values(packageData.scripts)) {
          if (scriptCommand.includes('start-server-and-test')) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Parse package.json file
   */
  async parsePackageJson(packagePath: string): Promise<any> {
    try {
      const content = fs.readFileSync(packagePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse package.json: ${error}`);
    }
  }

  /**
   * Convert package.json scripts from Cypress to Playwright
   */
  async convertPackageJsonScripts(
    packagePath: string,
    options: BuildConversionOptions = {}
  ): Promise<any> {
    const packageData = await this.parsePackageJson(packagePath);
    const convertedPackage = { ...packageData };

    // Convert scripts
    if (packageData.scripts) {
      convertedPackage.scripts = {};

      for (const [scriptName, scriptCommand] of Object.entries(packageData.scripts)) {
        const convertedScriptName = this.convertScriptName(scriptName);
        const convertedScriptCommand = this.convertScriptCommand(scriptCommand);

        convertedPackage.scripts[convertedScriptName] = convertedScriptCommand;
      }

      // Add additional Playwright scripts if requested
      if (options.addPlaywrightScripts) {
        convertedPackage.scripts['test:headed'] = 'playwright test --headed';
        convertedPackage.scripts['test:debug'] = 'playwright test --debug';
        convertedPackage.scripts['test:ui'] = 'playwright test --ui';
        convertedPackage.scripts['test:report'] = 'playwright show-report';
      }
    }

    // Update dependencies
    if (options.updateDependencies !== false) {
      convertedPackage.devDependencies = this.updateDependencies(
        packageData.devDependencies || {},
        packageData.dependencies || {}
      );

      // Clean up dependencies field if Cypress was in main dependencies
      if (convertedPackage.dependencies?.cypress) {
        delete convertedPackage.dependencies.cypress;
      }
    }

    return convertedPackage;
  }

  /**
   * Convert script name from Cypress to Playwright convention
   */
  private convertScriptName(scriptName: string): string {
    if (scriptName.startsWith('cy:')) {
      return scriptName.replace('cy:', 'pw:');
    }
    return scriptName;
  }

  /**
   * Convert script command from Cypress to Playwright
   */
  private convertScriptCommand(command: string): string {
    let convertedCommand = command;

    // Convert basic Cypress commands
    convertedCommand = convertedCommand.replace(/cypress run/g, 'playwright test');
    convertedCommand = convertedCommand.replace(/cypress open/g, 'playwright test --ui');
    convertedCommand = convertedCommand.replace(/npm run cy:run/g, 'npm run pw:run');
    convertedCommand = convertedCommand.replace(/npm run cy:open/g, 'npm run pw:open');
    convertedCommand = convertedCommand.replace(/yarn cy:run/g, 'yarn pw:run');
    convertedCommand = convertedCommand.replace(/yarn cy:open/g, 'yarn pw:open');

    // Convert browser-specific commands
    convertedCommand = convertedCommand.replace(/--browser chrome/g, '--project chromium');
    convertedCommand = convertedCommand.replace(/--browser firefox/g, '--project firefox');
    convertedCommand = convertedCommand.replace(/--browser edge/g, '--project webkit');

    // Convert Cypress-specific flags
    convertedCommand = convertedCommand.replace(/--headless/g, '');
    convertedCommand = convertedCommand.replace(/--record/g, '');
    convertedCommand = convertedCommand.replace(/--parallel/g, '');

    // Convert start-server-and-test patterns
    convertedCommand = this.convertStartServerAndTestCommand(convertedCommand);

    return convertedCommand.trim();
  }

  /**
   * Update package.json dependencies
   */
  private updateDependencies(devDependencies: any, dependencies: any): any {
    const updatedDevDeps = { ...devDependencies };

    // Remove Cypress
    delete updatedDevDeps.cypress;

    // Add Playwright
    if (!updatedDevDeps['@playwright/test']) {
      updatedDevDeps['@playwright/test'] = '^1.40.0';
    }

    // Keep start-server-and-test if it was present
    if (devDependencies['start-server-and-test'] || dependencies['start-server-and-test']) {
      updatedDevDeps['start-server-and-test'] = devDependencies['start-server-and-test'] ||
                                               dependencies['start-server-and-test'];
    }

    return updatedDevDeps;
  }

  /**
   * Check if content has Cypress commands
   */
  hasCypressCommands(content: string): boolean {
    return this.cypressCommandPatterns.some(pattern =>
      content.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Convert build script from Cypress to Playwright
   */
  async convertBuildScript(
    content: string,
    options: BuildConversionOptions = {}
  ): Promise<string> {
    let convertedContent = content;

    // Convert Cypress commands to Playwright
    convertedContent = convertedContent.replace(/cypress run/g, 'playwright test');
    convertedContent = convertedContent.replace(/cypress open/g, 'playwright test --ui');

    // Convert browser flags
    convertedContent = convertedContent.replace(/--browser chrome/g, '--project chromium');
    convertedContent = convertedContent.replace(/--browser firefox/g, '--project firefox');
    convertedContent = convertedContent.replace(/--browser edge/g, '--project webkit');

    // Convert Cypress-specific flags
    convertedContent = convertedContent.replace(/--record/g, '');
    convertedContent = convertedContent.replace(/--parallel/g, '');
    convertedContent = convertedContent.replace(/--headless/g, '');

    // Convert start-server-and-test commands
    convertedContent = this.convertStartServerAndTestInScript(convertedContent);

    // Update comments if preserve comments is enabled
    if (options.preserveComments !== false) {
      convertedContent = convertedContent.replace(/# Running Cypress tests/g, '# Running Playwright tests');
      convertedContent = convertedContent.replace(/echo "Running Cypress tests..."/g, 'echo "Running Playwright tests..."');
      convertedContent = convertedContent.replace(/# Cypress/g, '# Playwright');
    }

    return convertedContent;
  }

  /**
   * Convert Makefile from Cypress to Playwright
   */
  async convertMakefile(
    content: string,
    options: BuildConversionOptions = {}
  ): Promise<string> {
    let convertedContent = content;

    // Convert Cypress commands to Playwright
    convertedContent = convertedContent.replace(/cypress run/g, 'playwright test');
    convertedContent = convertedContent.replace(/cypress open/g, 'playwright test --ui');

    // Convert browser-specific targets
    convertedContent = convertedContent.replace(/--browser chrome/g, '--project chromium');
    convertedContent = convertedContent.replace(/--browser firefox/g, '--project firefox');
    convertedContent = convertedContent.replace(/--browser edge/g, '--project webkit');

    // Convert clean targets
    convertedContent = convertedContent.replace(
      /cypress\/videos cypress\/screenshots/g,
      'test-results playwright-report'
    );

    // Convert start-server-and-test commands
    convertedContent = this.convertStartServerAndTestInScript(convertedContent);

    return convertedContent;
  }

  /**
   * Check if content has start-server-and-test pattern
   */
  hasStartServerAndTestPattern(content: string): boolean {
    return content.includes('start-server-and-test');
  }

  /**
   * Convert start-server-and-test command
   */
  convertStartServerAndTestCommand(command: string): string {
    if (!command.includes('start-server-and-test')) {
      return command;
    }

    // Convert Cypress commands within start-server-and-test
    let convertedCommand = command;

    // Match and convert the test command part
    const startServerPattern = /start-server-and-test\s+([^"'\s]+|\s*"[^"]*"|\s*'[^']*')\s+([^"'\s]+|\s*"[^"]*"|\s*'[^']*')\s+(".*?"|'.*?'|\S+)/g;

    convertedCommand = convertedCommand.replace(startServerPattern, (match, server, url, testCommand) => {
      let convertedTestCommand = testCommand;

      // Remove quotes to process the command
      const isQuoted = (testCommand.startsWith('"') && testCommand.endsWith('"')) ||
                      (testCommand.startsWith("'") && testCommand.endsWith("'"));

      if (isQuoted) {
        const quote = testCommand[0];
        const innerCommand = testCommand.slice(1, -1);
        const convertedInner = this.convertScriptCommand(innerCommand);
        convertedTestCommand = `${quote}${convertedInner}${quote}`;
      } else {
        convertedTestCommand = this.convertScriptCommand(testCommand);
      }

      return `start-server-and-test ${server} ${url} ${convertedTestCommand}`;
    });

    return convertedCommand;
  }

  /**
   * Convert start-server-and-test commands in scripts
   */
  private convertStartServerAndTestInScript(content: string): string {
    const lines = content.split('\n');
    const convertedLines = lines.map(line => {
      if (line.includes('start-server-and-test')) {
        return this.convertStartServerAndTestCommand(line);
      }
      return line;
    });

    return convertedLines.join('\n');
  }

  /**
   * Detect build automation files
   */
  async detectBuildFiles(projectPath: string): Promise<string[]> {
    const buildFiles: string[] = [];

    // Check for package.json
    const packagePath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packagePath)) {
      buildFiles.push(packagePath);
    }

    // Check for Makefile
    const makefilePaths = [
      path.join(projectPath, 'Makefile'),
      path.join(projectPath, 'makefile')
    ];

    for (const makefilePath of makefilePaths) {
      if (fs.existsSync(makefilePath)) {
        buildFiles.push(makefilePath);
        break;
      }
    }

    // Check for build scripts
    const scriptPaths = [
      path.join(projectPath, 'build.sh'),
      path.join(projectPath, 'scripts/build.sh'),
      path.join(projectPath, 'scripts/test.sh'),
      path.join(projectPath, 'test.sh'),
      path.join(projectPath, 'e2e.sh')
    ];

    for (const scriptPath of scriptPaths) {
      if (fs.existsSync(scriptPath)) {
        buildFiles.push(scriptPath);
      }
    }

    return buildFiles;
  }

  /**
   * Convert all build automation files
   */
  async convertBuildAutomation(
    projectPath: string,
    outputPath: string,
    options: BuildConversionOptions = {}
  ): Promise<BuildAutomationConversionResult> {
    const startTime = Date.now();
    const result: BuildAutomationConversionResult = {
      success: true,
      convertedFiles: [],
      summary: {
        scriptsConverted: 0,
        commandsConverted: 0,
        dependenciesUpdated: 0,
        conversionTimeMs: 0
      },
      warnings: [],
      errors: []
    };

    try {
      const buildFiles = await this.detectBuildFiles(projectPath);

      if (buildFiles.length === 0) {
        result.warnings.push('No build automation files found');
        return result;
      }

      for (const buildFile of buildFiles) {
        try {
          const relativePath = path.relative(projectPath, buildFile);
          const outputFile = path.join(outputPath, relativePath);

          if (buildFile.endsWith('package.json')) {
            await this.convertPackageJsonFile(buildFile, outputFile, options, result);
          } else if (buildFile.includes('Makefile') || buildFile.includes('makefile')) {
            await this.convertMakefileFile(buildFile, outputFile, options, result);
          } else if (buildFile.endsWith('.sh')) {
            await this.convertBuildScriptFile(buildFile, outputFile, options, result);
          }
        } catch (error) {
          result.errors.push(`Failed to convert ${buildFile}: ${error}`);
          result.success = false;
        }
      }

      result.summary.conversionTimeMs = Date.now() - startTime;

    } catch (error) {
      result.errors.push(`Failed to convert build automation: ${error}`);
      result.success = false;
    }

    return result;
  }

  private async convertPackageJsonFile(
    inputFile: string,
    outputFile: string,
    options: BuildConversionOptions,
    result: BuildAutomationConversionResult
  ): Promise<void> {
    const originalPackage = await this.parsePackageJson(inputFile);

    // Check if package.json has Cypress scripts
    const cypressScripts = await this.detectCypressScripts(inputFile);
    if (cypressScripts.length === 0) {
      result.warnings.push(`${inputFile} does not contain Cypress scripts`);
      return;
    }

    const convertedPackage = await this.convertPackageJsonScripts(inputFile, options);

    await fs.ensureDir(path.dirname(outputFile));
    fs.writeFileSync(outputFile, JSON.stringify(convertedPackage, null, 2), 'utf8');

    result.convertedFiles.push({
      type: 'package.json',
      originalPath: inputFile,
      convertedPath: outputFile,
      conversionSummary: {
        scriptsConverted: cypressScripts.length,
        dependenciesUpdated: originalPackage.devDependencies?.cypress ? 1 : 0
      }
    });

    result.summary.scriptsConverted += cypressScripts.length;
    if (originalPackage.devDependencies?.cypress) {
      result.summary.dependenciesUpdated++;
    }
  }

  private async convertMakefileFile(
    inputFile: string,
    outputFile: string,
    options: BuildConversionOptions,
    result: BuildAutomationConversionResult
  ): Promise<void> {
    const content = fs.readFileSync(inputFile, 'utf8');

    if (!this.hasCypressCommands(content)) {
      result.warnings.push(`${inputFile} does not contain Cypress commands`);
      return;
    }

    const convertedContent = await this.convertMakefile(content, options);

    await fs.ensureDir(path.dirname(outputFile));
    fs.writeFileSync(outputFile, convertedContent, 'utf8');

    const commandsConverted = this.countCypressCommands(content);

    result.convertedFiles.push({
      type: 'makefile',
      originalPath: inputFile,
      convertedPath: outputFile,
      conversionSummary: {
        commandsConverted
      }
    });

    result.summary.commandsConverted += commandsConverted;
  }

  private async convertBuildScriptFile(
    inputFile: string,
    outputFile: string,
    options: BuildConversionOptions,
    result: BuildAutomationConversionResult
  ): Promise<void> {
    const content = fs.readFileSync(inputFile, 'utf8');

    if (!this.hasCypressCommands(content)) {
      result.warnings.push(`${inputFile} does not contain Cypress commands`);
      return;
    }

    const convertedContent = await this.convertBuildScript(content, options);

    await fs.ensureDir(path.dirname(outputFile));
    fs.writeFileSync(outputFile, convertedContent, 'utf8');

    const commandsConverted = this.countCypressCommands(content);

    result.convertedFiles.push({
      type: 'build-script',
      originalPath: inputFile,
      convertedPath: outputFile,
      conversionSummary: {
        commandsConverted
      }
    });

    result.summary.commandsConverted += commandsConverted;
  }

  /**
   * Count Cypress commands in content
   */
  private countCypressCommands(content: string): number {
    let count = 0;
    for (const pattern of this.cypressCommandPatterns) {
      const matches = content.match(new RegExp(pattern, 'gi'));
      if (matches) {
        count += matches.length;
      }
    }
    return count;
  }
}