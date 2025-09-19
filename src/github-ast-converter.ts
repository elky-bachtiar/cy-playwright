import * as path from 'path'
import * as fs from 'fs-extra'
import { ASTParser } from './ast-parser'
import { CommandConverter } from './command-converter'
import { CypressProjectDetector, ProjectAnalysis } from './cypress-project-detector'
import {
  CypressTestFile,
  ConvertedCommand,
  ConfigurationMigrationResult,
  PackageJsonTransformation,
  GitHubProjectContext,
  ConversionOptions
} from './types'

export interface GitHubConversionOptions {
  preserveStructure?: boolean
  generatePageObjects?: boolean
  migrateFixtures?: boolean
  convertConfiguration?: boolean
  updateDependencies?: boolean
  targetBrowsers?: string[]
}

export class GitHubASTConverter {
  private astParser: ASTParser
  private commandConverter: CommandConverter
  private projectDetector: CypressProjectDetector

  constructor() {
    this.astParser = new ASTParser()
    this.commandConverter = new CommandConverter()
    this.projectDetector = new CypressProjectDetector()
  }

  /**
   * Convert a complete GitHub Cypress project to Playwright
   */
  async convertGitHubProject(
    projectPath: string,
    outputPath: string,
    repositoryInfo: { owner: string; repo: string; branch: string },
    options: GitHubConversionOptions = {}
  ): Promise<{
    success: boolean
    convertedFiles: string[]
    configurationMigration?: ConfigurationMigrationResult
    packageJsonTransformation?: PackageJsonTransformation
    warnings: string[]
    errors: string[]
  }> {
    const warnings: string[] = []
    const errors: string[] = []
    const convertedFiles: string[] = []

    try {
      // Step 1: Analyze the project structure
      const projectAnalysis = await this.projectDetector.analyzeProject(projectPath)

      // Step 2: Create GitHub project context
      const context: GitHubProjectContext = {
        projectPath,
        projectAnalysis,
        repositoryInfo,
        advancedFeatures: {
          hasCustomSelectors: projectAnalysis.structure.hasCustomSelectors || false,
          hasCustomCommands: projectAnalysis.structure.hasCustomCommands || false,
          hasCiCdConfig: projectAnalysis.structure.hasCiCdConfig || false,
          hasDockerConfig: projectAnalysis.structure.advancedFeatures?.hasDockerConfig || false,
          hasViewportConfig: projectAnalysis.structure.advancedFeatures?.hasViewportConfig || false,
          hasMobileTestVariants: projectAnalysis.structure.advancedFeatures?.hasMobileTestVariants || false
        }
      }

      // Step 3: Convert configuration files
      let configurationMigration: ConfigurationMigrationResult | undefined
      if (options.convertConfiguration !== false) {
        configurationMigration = await this.migrateConfiguration(context, options)
        warnings.push(...configurationMigration.warnings)
      }

      // Step 4: Transform package.json
      let packageJsonTransformation: PackageJsonTransformation | undefined
      if (options.updateDependencies !== false) {
        packageJsonTransformation = await this.transformPackageJson(context, options)
        warnings.push(...packageJsonTransformation.warnings)
      }

      // Step 5: Convert test files
      const testFiles = await this.findTestFiles(projectPath)
      for (const testFile of testFiles) {
        try {
          const convertedFile = await this.convertTestFile(testFile, context, options)
          if (convertedFile) {
            const outputFile = this.generateOutputPath(testFile, projectPath, outputPath)
            await this.ensureDirectoryExists(path.dirname(outputFile))
            await fs.writeFile(outputFile, convertedFile.content)
            convertedFiles.push(outputFile)
            warnings.push(...convertedFile.warnings)
          }
        } catch (error) {
          errors.push(`Failed to convert ${testFile}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      // Step 6: Generate additional files (Page Objects, fixtures, etc.)
      if (options.generatePageObjects && context.advancedFeatures.hasCustomCommands) {
        const pageObjects = await this.generatePageObjects(context, outputPath)
        convertedFiles.push(...pageObjects)
      }

      return {
        success: errors.length === 0,
        convertedFiles,
        configurationMigration,
        packageJsonTransformation,
        warnings,
        errors
      }

    } catch (error) {
      errors.push(`Project conversion failed: ${error instanceof Error ? error.message : String(error)}`)
      return {
        success: false,
        convertedFiles,
        warnings,
        errors
      }
    }
  }

  /**
   * Migrate Cypress configuration to Playwright configuration
   */
  async migrateConfiguration(
    context: GitHubProjectContext,
    options: GitHubConversionOptions
  ): Promise<ConfigurationMigrationResult> {
    const warnings: string[] = []
    const unmappedSettings: string[] = []
    const environmentVariables: string[] = []

    try {
      const configPath = await this.findConfigurationFile(context.projectPath)
      if (!configPath) {
        warnings.push('No Cypress configuration file found')
        return {
          playwrightConfig: this.generateDefaultPlaywrightConfig(context, options),
          warnings,
          unmappedSettings,
          environmentVariables
        }
      }

      const cypressConfig = await this.loadCypressConfiguration(configPath)
      const playwrightConfig = await this.convertCypressConfigToPlaywright(
        cypressConfig,
        context,
        options
      )

      // Extract environment variables
      if (cypressConfig.env) {
        environmentVariables.push(...Object.keys(cypressConfig.env))
      }

      return {
        playwrightConfig,
        warnings,
        unmappedSettings,
        environmentVariables
      }

    } catch (error) {
      warnings.push(`Configuration migration failed: ${error instanceof Error ? error.message : String(error)}`)
      return {
        playwrightConfig: this.generateDefaultPlaywrightConfig(context, options),
        warnings,
        unmappedSettings,
        environmentVariables
      }
    }
  }

  /**
   * Transform package.json for Playwright dependencies and scripts
   */
  async transformPackageJson(
    context: GitHubProjectContext,
    options: GitHubConversionOptions
  ): Promise<PackageJsonTransformation> {
    const warnings: string[] = []
    const removedDependencies: string[] = []
    const addedDependencies: string[] = []

    try {
      const packageJsonPath = path.join(context.projectPath, 'package.json')
      if (!(await fs.pathExists(packageJsonPath))) {
        warnings.push('package.json not found')
        return {
          scripts: {},
          dependencies: {},
          devDependencies: {},
          removedDependencies,
          addedDependencies,
          warnings
        }
      }

      const packageJson = await fs.readJSON(packageJsonPath)

      // Transform scripts
      const scripts = this.convertCypressScriptsToPlaywright(packageJson.scripts || {})

      // Transform dependencies
      const { dependencies, devDependencies } = this.convertCypressDependenciesToPlaywright(
        packageJson.dependencies || {},
        packageJson.devDependencies || {}
      )

      // Track changes
      const originalCypressDeps = Object.keys(packageJson.devDependencies || {}).filter(dep =>
        dep.includes('cypress') || dep.startsWith('@cypress/')
      )
      removedDependencies.push(...originalCypressDeps)

      const newPlaywrightDeps = ['@playwright/test', 'playwright']
      addedDependencies.push(...newPlaywrightDeps)

      return {
        scripts,
        dependencies,
        devDependencies,
        removedDependencies,
        addedDependencies,
        warnings
      }

    } catch (error) {
      warnings.push(`Package.json transformation failed: ${error instanceof Error ? error.message : String(error)}`)
      return {
        scripts: {},
        dependencies: {},
        devDependencies: {},
        removedDependencies,
        addedDependencies,
        warnings
      }
    }
  }

  /**
   * Convert Cypress scripts to Playwright equivalents
   */
  private convertCypressScriptsToPlaywright(scripts: Record<string, string>): Record<string, string> {
    const convertedScripts: Record<string, string> = {}

    const scriptMappings: Record<string, string> = {
      'cypress open': 'playwright test --ui',
      'cypress run': 'playwright test',
      'cypress run --headless': 'playwright test',
      'cypress run --headed': 'playwright test --headed',
      'cypress run --browser chrome': 'playwright test --project=chromium',
      'cypress run --browser firefox': 'playwright test --project=firefox',
      'cypress run --browser edge': 'playwright test --project=webkit',
      'cypress run --component': 'playwright test --project=component',
      'cypress run --parallel': 'playwright test --workers=4'
    }

    Object.entries(scripts).forEach(([key, value]) => {
      let convertedValue = value

      // Apply direct mappings
      Object.entries(scriptMappings).forEach(([cypressCmd, playwrightCmd]) => {
        if (convertedValue.includes(cypressCmd)) {
          convertedValue = convertedValue.replace(cypressCmd, playwrightCmd)
        }
      })

      // Handle spec patterns
      convertedValue = convertedValue.replace(
        /--spec ['"](.*?)['"]/,
        (match, specPattern) => {
          const playwrightPattern = specPattern
            .replace(/cypress\/(e2e|integration)/, 'tests')
            .replace(/\.cy\.(js|ts)/, '.spec.$2')
          return `--testNamePattern="${playwrightPattern}"`
        }
      )

      // Handle start-server-and-test patterns
      convertedValue = convertedValue.replace(
        /(start-server-and-test .+ \d+ )cy:run/,
        '$1"playwright test"'
      )

      convertedScripts[key] = convertedValue
    })

    return convertedScripts
  }

  /**
   * Convert Cypress dependencies to Playwright equivalents
   */
  private convertCypressDependenciesToPlaywright(
    dependencies: Record<string, string>,
    devDependencies: Record<string, string>
  ): {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  } {
    const newDependencies = { ...dependencies }
    const newDevDependencies = { ...devDependencies }

    // Remove Cypress dependencies
    delete newDevDependencies.cypress
    delete newDevDependencies['@cypress/webpack-preprocessor']
    delete newDevDependencies['@cypress/code-coverage']
    delete newDevDependencies['cypress-real-events']

    // Add Playwright dependencies
    newDevDependencies['@playwright/test'] = '^1.40.0'
    newDevDependencies['playwright'] = '^1.40.0'

    return {
      dependencies: newDependencies,
      devDependencies: newDevDependencies
    }
  }

  /**
   * Convert individual test file
   */
  private async convertTestFile(
    testFilePath: string,
    context: GitHubProjectContext,
    options: GitHubConversionOptions
  ): Promise<{
    content: string
    warnings: string[]
  } | null> {
    const warnings: string[] = []

    try {
      const testFileContent = await fs.readFile(testFilePath, 'utf-8')
      const parsedFile = await this.astParser.parseTestFile(testFilePath)

      if (!parsedFile) {
        warnings.push(`Could not parse test file: ${testFilePath}`)
        return null
      }

      let convertedContent = this.generatePlaywrightTestStructure(parsedFile, context, options)

      // Add GitHub-specific conversions based on repository
      if (context.repositoryInfo.repo === 'cypress-example-kitchensink') {
        convertedContent = this.applyKitchenSinkSpecificConversions(convertedContent, warnings)
      }

      if (context.repositoryInfo.repo === 'cypress-example') {
        convertedContent = this.applyHelenanullSpecificConversions(convertedContent, warnings)
      }

      return {
        content: convertedContent,
        warnings
      }

    } catch (error) {
      warnings.push(`Failed to convert test file ${testFilePath}: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /**
   * Apply Kitchen Sink specific conversion patterns
   */
  private applyKitchenSinkSpecificConversions(content: string, warnings: string[]): string {
    let convertedContent = content

    // Convert educational comments to Playwright equivalents
    convertedContent = convertedContent.replace(
      /\/\/ Cypress\.Commands\.add/g,
      '// Page Object Method:'
    )

    // Handle comprehensive API patterns
    convertedContent = convertedContent.replace(
      /cy\.get\('\.action-btn'\)\.click\({ multiple: true }\)/g,
      'await page.locator(\'.action-btn\').click({ clickCount: 1 }); // Note: multiple click handled differently'
    )

    warnings.push('Applied Kitchen Sink repository specific conversions')
    return convertedContent
  }

  /**
   * Apply Helena Null repository specific conversion patterns
   */
  private applyHelenanullSpecificConversions(content: string, warnings: string[]): string {
    let convertedContent = content

    // Handle centralized selectors
    convertedContent = convertedContent.replace(
      /import.*selectors.*from/g,
      'import { selectors } from \'../support/selectors\''
    )

    // Convert custom command patterns
    convertedContent = convertedContent.replace(
      /cy\.customCommand/g,
      'await page.customAction'
    )

    warnings.push('Applied Helena Null repository specific conversions')
    return convertedContent
  }

  /**
   * Generate Playwright test structure from parsed Cypress test
   */
  private generatePlaywrightTestStructure(
    parsedFile: CypressTestFile,
    context: GitHubProjectContext,
    options: GitHubConversionOptions
  ): string {
    const imports = this.generateImports(context, options)
    const testBlocks = parsedFile.describes.map(describe =>
      this.convertDescribeBlock(describe, context, options)
    ).join('\n\n')

    return `${imports}\n\n${testBlocks}`
  }

  /**
   * Generate appropriate imports for Playwright test
   */
  private generateImports(context: GitHubProjectContext, options: GitHubConversionOptions): string {
    const imports = [
      'import { test, expect } from \'@playwright/test\';'
    ]

    if (context.advancedFeatures.hasCustomCommands && options.generatePageObjects) {
      imports.push('import { PageObjects } from \'../support/page-objects\';')
    }

    if (context.advancedFeatures.hasCustomSelectors) {
      imports.push('import { selectors } from \'../support/selectors\';')
    }

    return imports.join('\n')
  }

  /**
   * Convert Cypress describe block to Playwright test.describe
   */
  private convertDescribeBlock(describe: any, context: GitHubProjectContext, options: GitHubConversionOptions): string {
    const tests = describe.tests.map((test: any) =>
      this.convertTestCase(test, context, options)
    ).join('\n\n')

    return `test.describe('${describe.title}', () => {\n${tests}\n});`
  }

  /**
   * Convert individual test case
   */
  private convertTestCase(testCase: any, context: GitHubProjectContext, options: GitHubConversionOptions): string {
    const convertedCommands = testCase.commands.map((cmd: any) =>
      this.commandConverter.convertCommand(cmd)
    ).join('\n  ')

    return `  test('${testCase.title}', async ({ page }) => {\n    ${convertedCommands}\n  });`
  }

  // Helper methods
  private async findConfigurationFile(projectPath: string): Promise<string | null> {
    const configFiles = ['cypress.config.js', 'cypress.config.ts', 'cypress.json']

    for (const configFile of configFiles) {
      const configPath = path.join(projectPath, configFile)
      if (await fs.pathExists(configPath)) {
        return configPath
      }
    }

    return null
  }

  private async loadCypressConfiguration(configPath: string): Promise<any> {
    if (configPath.endsWith('.json')) {
      return fs.readJSON(configPath)
    }

    // For JS/TS files, we'll need to evaluate them safely
    // This is a simplified approach - in practice, you'd want more robust evaluation
    const content = await fs.readFile(configPath, 'utf-8')
    return this.parseJavaScriptConfig(content)
  }

  private parseJavaScriptConfig(content: string): any {
    // Simplified JavaScript config parsing
    // In practice, you'd want to use a more robust approach like VM or AST parsing
    try {
      const configMatch = content.match(/export default\s+(\{[\s\S]*\})/)?.[1]
      if (configMatch) {
        return eval(`(${configMatch})`)
      }
    } catch (error) {
      // Fallback to default config
    }

    return {}
  }

  private async convertCypressConfigToPlaywright(
    cypressConfig: any,
    context: GitHubProjectContext,
    options: GitHubConversionOptions
  ): Promise<any> {
    const playwrightConfig: any = {
      projects: []
    }

    // Convert e2e configuration
    if (cypressConfig.e2e) {
      playwrightConfig.projects.push({
        name: 'chromium',
        use: {
          baseURL: cypressConfig.e2e.baseUrl,
          viewport: cypressConfig.e2e.viewportWidth && cypressConfig.e2e.viewportHeight
            ? { width: cypressConfig.e2e.viewportWidth, height: cypressConfig.e2e.viewportHeight }
            : { width: 1280, height: 720 }
        },
        testDir: 'tests/e2e'
      })
    }

    // Convert component configuration
    if (cypressConfig.component) {
      playwrightConfig.projects.push({
        name: 'component',
        testDir: 'tests/component',
        use: {
          // Component-specific configuration
        }
      })
    }

    // Add multi-browser support if requested
    if (options.targetBrowsers && options.targetBrowsers.length > 1) {
      const additionalBrowsers = options.targetBrowsers.filter(b => b !== 'chromium')
      for (const browser of additionalBrowsers) {
        playwrightConfig.projects.push({
          name: browser,
          use: {
            ...playwrightConfig.projects[0].use
          },
          testDir: playwrightConfig.projects[0].testDir
        })
      }
    }

    return playwrightConfig
  }

  private generateDefaultPlaywrightConfig(
    context: GitHubProjectContext,
    options: GitHubConversionOptions
  ): any {
    return {
      projects: [
        {
          name: 'chromium',
          use: {
            baseURL: 'http://localhost:3000',
            viewport: { width: 1280, height: 720 }
          },
          testDir: 'tests'
        }
      ]
    }
  }

  private async findTestFiles(projectPath: string): Promise<string[]> {
    const testFiles: string[] = []
    const testDirs = ['cypress/e2e', 'cypress/integration', 'cypress/component']

    for (const testDir of testDirs) {
      const fullPath = path.join(projectPath, testDir)
      if (await fs.pathExists(fullPath)) {
        const files = await this.getFilesRecursively(fullPath)
        const cypressFiles = this.astParser.detectCypressTestFiles(files)
        testFiles.push(...cypressFiles.map(f => path.join(fullPath, f)))
      }
    }

    return testFiles
  }

  private async getFilesRecursively(dirPath: string): Promise<string[]> {
    const files: string[] = []
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const subFiles = await this.getFilesRecursively(fullPath)
        files.push(...subFiles)
      } else {
        files.push(entry.name)
      }
    }

    return files
  }

  private generateOutputPath(inputPath: string, projectPath: string, outputPath: string): string {
    const relativePath = path.relative(projectPath, inputPath)
    const convertedPath = relativePath
      .replace(/cypress\/(e2e|integration)/, 'tests')
      .replace(/\.cy\.(js|ts)/, '.spec.$2')

    return path.join(outputPath, convertedPath)
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    await fs.ensureDir(dirPath)
  }

  private async generatePageObjects(context: GitHubProjectContext, outputPath: string): Promise<string[]> {
    const pageObjectFiles: string[] = []

    // Generate page objects from custom commands
    if (context.advancedFeatures.hasCustomCommands) {
      const pageObjectContent = this.generatePageObjectFromCustomCommands(context)
      const pageObjectPath = path.join(outputPath, 'support', 'page-objects.ts')

      await this.ensureDirectoryExists(path.dirname(pageObjectPath))
      await fs.writeFile(pageObjectPath, pageObjectContent)
      pageObjectFiles.push(pageObjectPath)
    }

    return pageObjectFiles
  }

  private generatePageObjectFromCustomCommands(context: GitHubProjectContext): string {
    return `
import { Page } from '@playwright/test';

export class PageObjects {
  constructor(private page: Page) {}

  // Custom commands converted to page object methods
  // TODO: Implement based on detected custom commands

  async customLogin(username: string, password: string) {
    await this.page.getByTestId('username').fill(username);
    await this.page.getByTestId('password').fill(password);
    await this.page.getByTestId('submit').click();
  }
}
`
  }
}

// Export convenience functions
export const convertGitHubCypressProject = async (
  projectPath: string,
  outputPath: string,
  repositoryInfo: { owner: string; repo: string; branch: string },
  options?: GitHubConversionOptions
) => {
  const converter = new GitHubASTConverter()
  return converter.convertGitHubProject(projectPath, outputPath, repositoryInfo, options)
}