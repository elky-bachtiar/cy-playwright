import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface DockerConversionOptions {
  addPlaywrightEnvVars?: boolean;
  nodeVersion?: string;
  playwrightVersion?: string;
  minimizeLayerSize?: boolean;
  useMultiStage?: boolean;
}

export interface DockerfileGenerationOptions {
  nodeVersion: string;
  playwrightVersion: string;
  workingDirectory: string;
  includeDevDependencies: boolean;
}

export interface DockerComposeGenerationOptions {
  serviceName: string;
  baseUrl: string;
  parallelExecution?: boolean;
  workers?: number;
}

export interface MultiBrowserComposeOptions {
  browsers: string[];
  baseUrl: string;
}

export interface ParallelExecutionComposeOptions {
  shardCount: number;
  baseUrl: string;
}

export interface ConvertedFile {
  type: 'dockerfile' | 'docker-compose' | 'dockerignore';
  originalPath: string;
  convertedPath: string;
  conversionSummary: {
    instructionsModified?: number;
    servicesConverted?: number;
    environmentVariablesChanged?: number;
  };
}

export interface DockerConversionResult {
  success: boolean;
  convertedFiles: ConvertedFile[];
  summary: {
    dockerfilesConverted: number;
    composeFilesConverted: number;
    servicesConverted: number;
    conversionTimeMs: number;
  };
  warnings: string[];
  errors: string[];
}

interface DockerfileCommand {
  instruction: string;
  args: string;
  original: string;
}

interface ParsedDockerfile {
  baseImage: string;
  commands: DockerfileCommand[];
}

export class DockerConfigConverter {
  private readonly cypressImagePatterns = [
    'cypress/included',
    'cypress/base',
    'cypress/browsers'
  ];

  private readonly cypressEnvironmentPatterns = [
    'CYPRESS_',
    'CYPRESS_CACHE_FOLDER',
    'CYPRESS_VERIFY_TIMEOUT',
    'CYPRESS_RECORD_KEY'
  ];

  private readonly cypressCommandPatterns = [
    'cypress run',
    'npm run cy:run',
    'yarn cy:run',
    'npx cypress run',
    'pnpm cy:run'
  ];

  /**
   * Detect Docker files in the project
   */
  async detectDockerFiles(projectPath: string): Promise<string[]> {
    const dockerFiles: string[] = [];

    // Check for Dockerfile
    const dockerfilePaths = [
      path.join(projectPath, 'Dockerfile'),
      path.join(projectPath, 'dockerfile'),
      path.join(projectPath, 'Dockerfile.dev'),
      path.join(projectPath, 'Dockerfile.prod')
    ];

    for (const dockerfilePath of dockerfilePaths) {
      if (fs.existsSync(dockerfilePath)) {
        dockerFiles.push(dockerfilePath);
      }
    }

    // Check for docker-compose files
    const composePaths = [
      path.join(projectPath, 'docker-compose.yml'),
      path.join(projectPath, 'docker-compose.yaml'),
      path.join(projectPath, 'docker-compose.dev.yml'),
      path.join(projectPath, 'docker-compose.prod.yml'),
      path.join(projectPath, 'docker-compose.test.yml')
    ];

    for (const composePath of composePaths) {
      if (fs.existsSync(composePath)) {
        dockerFiles.push(composePath);
      }
    }

    // Check for .dockerignore
    const dockerignorePath = path.join(projectPath, '.dockerignore');
    if (fs.existsSync(dockerignorePath)) {
      dockerFiles.push(dockerignorePath);
    }

    return dockerFiles;
  }

  /**
   * Parse Dockerfile content
   */
  parseDockerfile(content: string): ParsedDockerfile {
    const lines = content.split('\n').filter(line =>
      line.trim() && !line.trim().startsWith('#')
    );

    const commands: DockerfileCommand[] = [];
    let baseImage = '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      const parts = trimmedLine.split(/\s+/);
      const instruction = parts[0].toUpperCase();
      const args = parts.slice(1).join(' ');

      if (instruction === 'FROM') {
        baseImage = args.split(' ')[0]; // Get image name, ignore AS alias
      }

      commands.push({
        instruction,
        args,
        original: trimmedLine
      });
    }

    return {
      baseImage,
      commands
    };
  }

  /**
   * Check if Dockerfile is Cypress-related
   */
  isCypressDockerfile(content: string): boolean {
    const lowerContent = content.toLowerCase();

    // Check for Cypress base images
    if (this.cypressImagePatterns.some(pattern =>
      lowerContent.includes(pattern.toLowerCase())
    )) {
      return true;
    }

    // Check for Cypress environment variables
    if (this.cypressEnvironmentPatterns.some(pattern =>
      lowerContent.includes(pattern.toLowerCase())
    )) {
      return true;
    }

    // Check for Cypress commands
    if (this.cypressCommandPatterns.some(pattern =>
      lowerContent.includes(pattern.toLowerCase())
    )) {
      return true;
    }

    return false;
  }

  /**
   * Convert Dockerfile from Cypress to Playwright
   */
  async convertDockerfile(
    content: string,
    options: DockerConversionOptions = {}
  ): Promise<string> {
    const parsed = this.parseDockerfile(content);
    const convertedCommands: string[] = [];

    // Convert base image
    if (this.cypressImagePatterns.some(pattern =>
      parsed.baseImage.includes(pattern)
    )) {
      const playwrightVersion = options.playwrightVersion || '1.40.0';
      convertedCommands.push(`FROM mcr.microsoft.com/playwright:v${playwrightVersion}-focal`);
    } else {
      // Keep original FROM command if not Cypress-specific
      const fromCommand = parsed.commands.find(cmd => cmd.instruction === 'FROM');
      if (fromCommand) {
        convertedCommands.push(fromCommand.original);
      }
    }

    // Process other commands
    for (const command of parsed.commands) {
      if (command.instruction === 'FROM') {
        continue; // Already handled above
      }

      let convertedCommand = command.original;

      // Convert RUN commands
      if (command.instruction === 'RUN') {
        convertedCommand = this.convertRunCommand(command.args, options);
      }

      // Convert ENV commands
      if (command.instruction === 'ENV') {
        const envResult = this.convertEnvCommand(command.args, options);
        if (envResult) {
          convertedCommand = `ENV ${envResult}`;
        } else {
          continue; // Skip Cypress-specific environment variables
        }
      }

      // Convert CMD commands
      if (command.instruction === 'CMD') {
        convertedCommand = this.convertCmdCommand(command.args);
      }

      // Convert COPY commands (update paths if needed)
      if (command.instruction === 'COPY') {
        convertedCommand = this.convertCopyCommand(command.args);
      }

      convertedCommands.push(convertedCommand);
    }

    // Add Playwright-specific setup if needed
    const needsPlaywrightSetup = content.includes('google-chrome-stable') ||
                                content.includes('cypress/included');

    if (needsPlaywrightSetup) {
      // Add Playwright dependencies installation
      const installIndex = convertedCommands.findIndex(cmd =>
        cmd.startsWith('RUN npm') || cmd.startsWith('RUN yarn')
      );

      if (installIndex !== -1) {
        convertedCommands.splice(installIndex + 1, 0, 'RUN npx playwright install-deps');
      }
    }

    // Add Playwright-specific environment variables
    if (options.addPlaywrightEnvVars) {
      convertedCommands.push('ENV PLAYWRIGHT_HTML_REPORT=playwright-report');
      convertedCommands.push('ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright');
      convertedCommands.push('ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1');
    }

    return convertedCommands.join('\n');
  }

  /**
   * Convert RUN command
   */
  private convertRunCommand(args: string, options: DockerConversionOptions): string {
    let convertedArgs = args;

    // Remove Chrome installation commands
    if (args.includes('google-chrome-stable')) {
      return 'RUN npx playwright install-deps';
    }

    // Convert Cypress commands to Playwright
    convertedArgs = convertedArgs.replace(/cypress run/g, 'playwright test');
    convertedArgs = convertedArgs.replace(/npm run cy:run/g, 'npx playwright test');
    convertedArgs = convertedArgs.replace(/yarn cy:run/g, 'npx playwright test');

    return `RUN ${convertedArgs}`;
  }

  /**
   * Convert ENV command
   */
  private convertEnvCommand(args: string, options: DockerConversionOptions): string | null {
    const [key, ...valueParts] = args.split('=');
    const value = valueParts.join('=');

    // Skip Cypress-specific environment variables
    if (this.cypressEnvironmentPatterns.some(pattern => key.includes(pattern))) {
      return null;
    }

    return args;
  }

  /**
   * Convert CMD command
   */
  private convertCmdCommand(args: string): string {
    let convertedArgs = args;

    // Convert Cypress commands to Playwright
    convertedArgs = convertedArgs.replace(/"npm", "run", "cy:run"/g, '"npx", "playwright", "test"');
    convertedArgs = convertedArgs.replace(/npm run cy:run/g, 'npx playwright test');
    convertedArgs = convertedArgs.replace(/cypress run/g, 'playwright test');

    return `CMD ${convertedArgs}`;
  }

  /**
   * Convert COPY command (update paths if needed)
   */
  private convertCopyCommand(args: string): string {
    // Most COPY commands can remain unchanged
    // Could add path conversions here if needed
    return `COPY ${args}`;
  }

  /**
   * Parse docker-compose file
   */
  async parseDockerCompose(filePath: string): Promise<any> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = yaml.load(content);

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid docker-compose file structure');
      }

      return parsed;
    } catch (error) {
      throw new Error(`Failed to parse docker-compose file: ${error}`);
    }
  }

  /**
   * Check if docker-compose uses Cypress
   */
  isCypressDockerCompose(config: any): boolean {
    if (!config.services) return false;

    for (const service of Object.values(config.services) as any[]) {
      // Check command
      if (service.command && typeof service.command === 'string') {
        if (this.cypressCommandPatterns.some(pattern =>
          service.command.includes(pattern)
        )) {
          return true;
        }
      }

      // Check environment variables
      if (service.environment) {
        const envVars = Array.isArray(service.environment) ?
          service.environment : Object.keys(service.environment);

        if (envVars.some((env: string) =>
          this.cypressEnvironmentPatterns.some(pattern => env.includes(pattern))
        )) {
          return true;
        }
      }

      // Check volumes for Cypress paths
      if (service.volumes && Array.isArray(service.volumes)) {
        if (service.volumes.some((volume: string) =>
          volume.includes('cypress/videos') || volume.includes('cypress/screenshots')
        )) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Convert docker-compose configuration
   */
  async convertDockerCompose(config: any): Promise<any> {
    const convertedConfig = {
      ...config,
      services: {}
    };

    if (!config.services) {
      return convertedConfig;
    }

    for (const [serviceName, service] of Object.entries(config.services) as [string, any][]) {
      const convertedServiceName = serviceName.replace(/cypress/gi, 'playwright');
      const convertedService = { ...service };

      // Convert command
      if (service.command) {
        convertedService.command = this.convertDockerComposeCommand(service.command);
      }

      // Convert environment variables
      if (service.environment) {
        convertedService.environment = this.convertDockerComposeEnvironment(service.environment);
      }

      // Convert volumes
      if (service.volumes) {
        convertedService.volumes = this.convertDockerComposeVolumes(service.volumes);
      }

      convertedConfig.services[convertedServiceName] = convertedService;
    }

    return convertedConfig;
  }

  /**
   * Convert docker-compose command
   */
  private convertDockerComposeCommand(command: string): string {
    let convertedCommand = command;

    convertedCommand = convertedCommand.replace(/npm run cy:run/g, 'npx playwright test');
    convertedCommand = convertedCommand.replace(/yarn cy:run/g, 'npx playwright test');
    convertedCommand = convertedCommand.replace(/cypress run/g, 'playwright test');

    return convertedCommand;
  }

  /**
   * Convert docker-compose environment variables
   */
  private convertDockerComposeEnvironment(environment: any): any {
    if (Array.isArray(environment)) {
      return environment
        .filter(env => !this.cypressEnvironmentPatterns.some(pattern => env.includes(pattern)))
        .map(env => {
          if (env.includes('CYPRESS_baseUrl')) {
            return env.replace('CYPRESS_baseUrl', 'PLAYWRIGHT_baseURL');
          }
          return env;
        });
    } else {
      const convertedEnv: any = {};
      for (const [key, value] of Object.entries(environment)) {
        if (!this.cypressEnvironmentPatterns.some(pattern => key.includes(pattern))) {
          if (key === 'CYPRESS_baseUrl') {
            convertedEnv.PLAYWRIGHT_baseURL = value;
          } else {
            convertedEnv[key] = value;
          }
        }
      }
      return convertedEnv;
    }
  }

  /**
   * Convert docker-compose volumes
   */
  private convertDockerComposeVolumes(volumes: string[]): string[] {
    return volumes.map(volume => {
      if (volume.includes('cypress/videos')) {
        return volume.replace('cypress/videos', 'test-results');
      }
      if (volume.includes('cypress/screenshots')) {
        return volume.replace('cypress/screenshots', 'playwright-report');
      }
      return volume;
    });
  }

  /**
   * Convert .dockerignore file
   */
  async convertDockerIgnore(content: string): Promise<string> {
    const lines = content.split('\n');
    const convertedLines = lines.map(line => {
      if (line.includes('cypress/videos')) {
        return line.replace('cypress/videos', 'test-results');
      }
      if (line.includes('cypress/screenshots')) {
        return line.replace('cypress/screenshots', 'playwright-report');
      }
      return line;
    });

    // Add Playwright-specific ignores if not present
    const playwrightIgnores = ['test-results', 'playwright-report', 'playwright/.cache'];
    for (const ignore of playwrightIgnores) {
      if (!convertedLines.includes(ignore)) {
        convertedLines.push(ignore);
      }
    }

    return convertedLines.join('\n');
  }

  /**
   * Generate Dockerfile for Playwright
   */
  async generatePlaywrightDockerfile(options: DockerfileGenerationOptions): Promise<string> {
    const commands = [
      `FROM mcr.microsoft.com/playwright:v${options.playwrightVersion}-focal`,
      '',
      `WORKDIR ${options.workingDirectory}`,
      '',
      'COPY package*.json ./',
      options.includeDevDependencies ? 'RUN npm ci' : 'RUN npm ci --production',
      '',
      'RUN npx playwright install-deps',
      '',
      'COPY . .',
      '',
      'CMD ["npx", "playwright", "test"]'
    ];

    return commands.join('\n');
  }

  /**
   * Generate docker-compose for Playwright
   */
  async generatePlaywrightDockerCompose(options: DockerComposeGenerationOptions): Promise<any> {
    const command = options.parallelExecution && options.workers ?
      `npx playwright test --workers=${options.workers}` :
      'npx playwright test';

    return {
      version: '3.8',
      services: {
        [options.serviceName]: {
          build: '.',
          environment: [
            `PLAYWRIGHT_baseURL=${options.baseUrl}`
          ],
          volumes: [
            './test-results:/app/test-results',
            './playwright-report:/app/playwright-report'
          ],
          command
        }
      }
    };
  }

  /**
   * Generate multi-browser docker-compose
   */
  async generateMultiBrowserDockerCompose(options: MultiBrowserComposeOptions): Promise<any> {
    const services: any = {};

    for (const browser of options.browsers) {
      services[`playwright-${browser}`] = {
        build: '.',
        environment: [
          `PLAYWRIGHT_baseURL=${options.baseUrl}`
        ],
        volumes: [
          './test-results:/app/test-results',
          './playwright-report:/app/playwright-report'
        ],
        command: `npx playwright test --project=${browser}`
      };
    }

    return {
      version: '3.8',
      services
    };
  }

  /**
   * Generate parallel execution docker-compose
   */
  async generateParallelExecutionCompose(options: ParallelExecutionComposeOptions): Promise<any> {
    const services: any = {};

    for (let i = 1; i <= options.shardCount; i++) {
      services[`playwright-shard-${i}`] = {
        build: '.',
        environment: [
          `PLAYWRIGHT_baseURL=${options.baseUrl}`
        ],
        volumes: [
          './test-results:/app/test-results',
          './playwright-report:/app/playwright-report'
        ],
        command: `npx playwright test --shard=${i}/${options.shardCount}`
      };
    }

    return {
      version: '3.8',
      services
    };
  }

  /**
   * Optimize Docker build context
   */
  async optimizeDockerBuildContext(
    content: string,
    options: { minimizeLayerSize: boolean; useMultiStage: boolean }
  ): Promise<string> {
    if (!options.useMultiStage) {
      return content;
    }

    const multiStageDockerfile = [
      '# Multi-stage build for optimized Playwright container',
      'FROM node:18-alpine as dependencies',
      'WORKDIR /app',
      'COPY package*.json ./',
      'RUN npm ci --production',
      '',
      'FROM mcr.microsoft.com/playwright:v1.40.0-focal',
      'WORKDIR /app',
      'COPY --from=dependencies /app/node_modules ./node_modules',
      'COPY . .',
      'RUN npx playwright install-deps',
      'CMD ["npx", "playwright", "test"]'
    ];

    return multiStageDockerfile.join('\n');
  }

  /**
   * Convert complete Docker configuration
   */
  async convertDockerConfiguration(
    projectPath: string,
    outputPath: string,
    options: DockerConversionOptions = {}
  ): Promise<DockerConversionResult> {
    const startTime = Date.now();
    const result: DockerConversionResult = {
      success: true,
      convertedFiles: [],
      summary: {
        dockerfilesConverted: 0,
        composeFilesConverted: 0,
        servicesConverted: 0,
        conversionTimeMs: 0
      },
      warnings: [],
      errors: []
    };

    try {
      const dockerFiles = await this.detectDockerFiles(projectPath);

      if (dockerFiles.length === 0) {
        result.warnings.push('No Docker configuration files found');
        return result;
      }

      for (const dockerFile of dockerFiles) {
        try {
          const relativePath = path.relative(projectPath, dockerFile);
          const outputFile = path.join(outputPath, relativePath);

          if (dockerFile.includes('Dockerfile')) {
            await this.convertDockerfileFile(dockerFile, outputFile, options, result);
          } else if (dockerFile.includes('docker-compose')) {
            await this.convertDockerComposeFile(dockerFile, outputFile, options, result);
          } else if (dockerFile.includes('.dockerignore')) {
            await this.convertDockerIgnoreFile(dockerFile, outputFile, result);
          }
        } catch (error) {
          result.errors.push(`Failed to convert ${dockerFile}: ${error}`);
          result.success = false;
        }
      }

      result.summary.conversionTimeMs = Date.now() - startTime;

    } catch (error) {
      result.errors.push(`Failed to convert Docker configuration: ${error}`);
      result.success = false;
    }

    return result;
  }

  private async convertDockerfileFile(
    inputFile: string,
    outputFile: string,
    options: DockerConversionOptions,
    result: DockerConversionResult
  ): Promise<void> {
    const content = fs.readFileSync(inputFile, 'utf8');

    if (!this.isCypressDockerfile(content)) {
      result.warnings.push(`${inputFile} does not appear to be a Cypress Dockerfile`);
      return;
    }

    const convertedContent = await this.convertDockerfile(content, options);

    await fs.ensureDir(path.dirname(outputFile));
    fs.writeFileSync(outputFile, convertedContent, 'utf8');

    result.convertedFiles.push({
      type: 'dockerfile',
      originalPath: inputFile,
      convertedPath: outputFile,
      conversionSummary: {
        instructionsModified: convertedContent.split('\n').length
      }
    });

    result.summary.dockerfilesConverted++;
  }

  private async convertDockerComposeFile(
    inputFile: string,
    outputFile: string,
    options: DockerConversionOptions,
    result: DockerConversionResult
  ): Promise<void> {
    const config = await this.parseDockerCompose(inputFile);

    if (!this.isCypressDockerCompose(config)) {
      result.warnings.push(`${inputFile} does not appear to use Cypress`);
      return;
    }

    const convertedConfig = await this.convertDockerCompose(config);
    const yamlContent = yaml.dump(convertedConfig, { indent: 2 });

    await fs.ensureDir(path.dirname(outputFile));
    fs.writeFileSync(outputFile, yamlContent, 'utf8');

    const servicesCount = Object.keys(convertedConfig.services || {}).length;

    result.convertedFiles.push({
      type: 'docker-compose',
      originalPath: inputFile,
      convertedPath: outputFile,
      conversionSummary: {
        servicesConverted: servicesCount
      }
    });

    result.summary.composeFilesConverted++;
    result.summary.servicesConverted += servicesCount;
  }

  private async convertDockerIgnoreFile(
    inputFile: string,
    outputFile: string,
    result: DockerConversionResult
  ): Promise<void> {
    const content = fs.readFileSync(inputFile, 'utf8');
    const convertedContent = await this.convertDockerIgnore(content);

    await fs.ensureDir(path.dirname(outputFile));
    fs.writeFileSync(outputFile, convertedContent, 'utf8');

    result.convertedFiles.push({
      type: 'dockerignore',
      originalPath: inputFile,
      convertedPath: outputFile,
      conversionSummary: {}
    });
  }
}