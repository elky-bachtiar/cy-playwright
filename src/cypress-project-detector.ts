import * as fs from 'fs-extra'
import * as path from 'path'

export interface ConfigurationResult {
  detected: boolean
  configType?: 'cypress.config.js' | 'cypress.config.ts' | 'cypress.json'
  version?: 'v10+' | 'v9-'
  configuration?: any
  errors?: string[]
  warnings?: string[]
}

export interface PackageManagerResult {
  manager: 'npm' | 'yarn' | 'pnpm'
  lockFile?: string
  assumed?: boolean
}

export interface ProjectStructureResult {
  directories: string[]
  testTypes: string[]
  version: 'v10+' | 'v9-'
  hasComponentTesting: boolean
  hasMultipleTestTypes: boolean
  hasCustomSelectors?: boolean
  hasCustomCommands?: boolean
  hasEnvironmentConfig?: boolean
  hasCiCdConfig?: boolean
  testCounts?: Record<string, number>
  isEmpty?: boolean
  hasSymlinks?: boolean
  advancedFeatures?: AdvancedFeatureResult
  errors?: string[]
  warnings?: string[]
}

export interface AdvancedFeatureResult {
  selectorFiles: string[]
  customCommandFiles: string[]
  environmentFiles: string[]
  cicdConfigurations: CiCdConfiguration[]
  hasViewportConfig: boolean
  hasMobileTestVariants: boolean
  hasDockerConfig: boolean
}

export interface CiCdConfiguration {
  platform: 'github-actions' | 'circleci' | 'appveyor' | 'other'
  configFile: string
  hasCypressIntegration: boolean
  hasParallelExecution: boolean
  hasBrowserMatrix: boolean
}

export interface DependencyResult {
  hasCypress: boolean
  cypressVersion?: string
  majorVersion?: number
  isLegacyVersion?: boolean
  dependencies: string[]
  plugins: string[]
  hasPlugins: boolean
  nodeVersionRequirement?: string
  nodeCompatible?: boolean
  compatibilityWarnings: string[]
  errors?: string[]
}

export interface ProjectAnalysis {
  isCypressProject: boolean
  configuration: ConfigurationResult
  structure: ProjectStructureResult
  dependencies: DependencyResult
  packageManager: PackageManagerResult
  summary: {
    projectType: string
    complexity: 'simple' | 'moderate' | 'complex'
    testFileCount: number
    hasAdvancedFeatures: boolean
  }
  conversionReadiness: {
    ready: boolean
    blockers: string[]
    warnings: string[]
  }
}

export class CypressProjectDetector {
  /**
   * Analyze advanced project features including CI/CD, custom commands, and environment configs
   */
  async analyzeAdvancedFeatures(projectPath: string): Promise<AdvancedFeatureResult> {
    const selectorFiles: string[] = []
    const customCommandFiles: string[] = []
    const environmentFiles: string[] = []
    const cicdConfigurations: CiCdConfiguration[] = []
    let hasViewportConfig = false
    let hasMobileTestVariants = false
    let hasDockerConfig = false

    try {
      // Detect selector files
      const selectorPaths = [
        'cypress/selectors',
        'cypress/support/selectors',
        'src/selectors'
      ]

      for (const selectorPath of selectorPaths) {
        try {
          const fullPath = path.join(projectPath, selectorPath)
          if (await fs.pathExists(fullPath)) {
            const files = await fs.readdir(fullPath)
            const selectorFileList = files.filter(file =>
              file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.json')
            )
            selectorFiles.push(...selectorFileList.map(file => path.join(selectorPath, file)))
          }
        } catch (error) {
          // Ignore permission errors and continue with other paths
        }
      }

      // Detect custom command files (.cmd.js pattern)
      const commandPaths = [
        'cypress/support',
        'cypress/support/commands',
        'cypress/commands'
      ]

      for (const commandPath of commandPaths) {
        try {
          const fullPath = path.join(projectPath, commandPath)
          if (await fs.pathExists(fullPath)) {
            const files = await fs.readdir(fullPath)
            const commandFileList = files.filter(file =>
              file.includes('.cmd.') || file.includes('command') || file === 'commands.js' || file === 'commands.ts'
            )
            customCommandFiles.push(...commandFileList.map(file => path.join(commandPath, file)))
          }
        } catch (error) {
          // Ignore permission errors and continue with other paths
        }
      }

      // Detect environment files
      const envPaths = [
        '.env',
        '.env.local',
        '.env.development',
        '.env.production',
        'cypress.env.json',
        'config/environments'
      ]

      for (const envPath of envPaths) {
        try {
          const fullPath = path.join(projectPath, envPath)
          if (await fs.pathExists(fullPath)) {
            environmentFiles.push(envPath)
          }
        } catch (error) {
          // Ignore permission errors and continue with other paths
        }
      }

      // Detect CI/CD configurations
      await this.detectCiCdConfigurations(projectPath, cicdConfigurations)

      // Detect viewport and mobile configurations
      const viewportConfig = await this.detectViewportConfiguration(projectPath)
      hasViewportConfig = viewportConfig.hasViewportConfig
      hasMobileTestVariants = viewportConfig.hasMobileTestVariants

      // Detect Docker configuration
      hasDockerConfig = await this.detectDockerConfiguration(projectPath)

    } catch (error) {
      // Silently handle errors in advanced feature detection
      // These features are optional and shouldn't prevent basic project analysis
    }

    return {
      selectorFiles,
      customCommandFiles,
      environmentFiles,
      cicdConfigurations,
      hasViewportConfig,
      hasMobileTestVariants,
      hasDockerConfig
    }
  }

  /**
   * Detect CI/CD configurations
   */
  private async detectCiCdConfigurations(projectPath: string, configurations: CiCdConfiguration[]): Promise<void> {
    const cicdConfigs = [
      {
        platform: 'github-actions' as const,
        patterns: ['.github/workflows/*.yml', '.github/workflows/*.yaml']
      },
      {
        platform: 'circleci' as const,
        patterns: ['.circleci/config.yml', '.circleci/config.yaml']
      },
      {
        platform: 'appveyor' as const,
        patterns: ['appveyor.yml', '.appveyor.yml']
      }
    ]

    for (const config of cicdConfigs) {
      for (const pattern of config.patterns) {
        const configPath = path.join(projectPath, pattern.replace('*', ''))
        const configDir = path.dirname(configPath)

        try {
          if (pattern.includes('*')) {
            // Handle wildcard patterns
            if (await fs.pathExists(configDir)) {
              const files = await fs.readdir(configDir)
              const matchingFiles = files.filter(file =>
                file.endsWith('.yml') || file.endsWith('.yaml')
              )

              for (const file of matchingFiles) {
                const fullConfigPath = path.join(configDir, file)
                const analysis = await this.analyzeCiCdFile(fullConfigPath)
                configurations.push({
                  platform: config.platform,
                  configFile: path.relative(projectPath, fullConfigPath),
                  ...analysis
                })
              }
            }
          } else {
            if (await fs.pathExists(configPath)) {
              const analysis = await this.analyzeCiCdFile(configPath)
              configurations.push({
                platform: config.platform,
                configFile: pattern,
                ...analysis
              })
            }
          }
        } catch (error) {
          // Silently ignore permission errors and other access issues
          // CI/CD detection is optional and shouldn't fail the whole analysis
        }
      }
    }
  }

  /**
   * Analyze CI/CD configuration file content
   */
  private async analyzeCiCdFile(configPath: string): Promise<{
    hasCypressIntegration: boolean
    hasParallelExecution: boolean
    hasBrowserMatrix: boolean
  }> {
    try {
      const content = await fs.readFile(configPath, 'utf-8')
      const lowerContent = content.toLowerCase()

      return {
        hasCypressIntegration: lowerContent.includes('cypress') || lowerContent.includes('cy:'),
        hasParallelExecution: lowerContent.includes('parallel') || lowerContent.includes('matrix'),
        hasBrowserMatrix: lowerContent.includes('browser') && (lowerContent.includes('matrix') || lowerContent.includes('strategy'))
      }
    } catch (error) {
      return {
        hasCypressIntegration: false,
        hasParallelExecution: false,
        hasBrowserMatrix: false
      }
    }
  }

  /**
   * Detect viewport and mobile configuration
   */
  private async detectViewportConfiguration(projectPath: string): Promise<{
    hasViewportConfig: boolean
    hasMobileTestVariants: boolean
  }> {
    try {
      // Check Cypress configuration files for viewport settings
      const configFiles = [
        'cypress.config.js',
        'cypress.config.ts',
        'cypress.json'
      ]

      for (const configFile of configFiles) {
        const configPath = path.join(projectPath, configFile)
        if (await fs.pathExists(configPath)) {
          const content = await fs.readFile(configPath, 'utf-8')
          const lowerContent = content.toLowerCase()

          const hasViewportConfig = lowerContent.includes('viewport') ||
                                  lowerContent.includes('viewportwidth') ||
                                  lowerContent.includes('viewportheight')

          const hasMobileTestVariants = lowerContent.includes('mobile') ||
                                      lowerContent.includes('iphone') ||
                                      lowerContent.includes('android') ||
                                      lowerContent.includes('tablet')

          if (hasViewportConfig || hasMobileTestVariants) {
            return { hasViewportConfig, hasMobileTestVariants }
          }
        }
      }

      // Check test files for viewport-related commands
      const testDirs = ['cypress/e2e', 'cypress/integration', 'cypress/component']
      for (const testDir of testDirs) {
        const testDirPath = path.join(projectPath, testDir)
        if (await fs.pathExists(testDirPath)) {
          const files = await fs.readdir(testDirPath)
          for (const file of files) {
            if (file.endsWith('.cy.js') || file.endsWith('.cy.ts') || file.endsWith('.spec.js') || file.endsWith('.spec.ts')) {
              const content = await fs.readFile(path.join(testDirPath, file), 'utf-8')
              const lowerContent = content.toLowerCase()

              if (lowerContent.includes('cy.viewport') || lowerContent.includes('mobile') || lowerContent.includes('tablet')) {
                return {
                  hasViewportConfig: lowerContent.includes('cy.viewport'),
                  hasMobileTestVariants: lowerContent.includes('mobile') || lowerContent.includes('tablet')
                }
              }
            }
          }
        }
      }

      return { hasViewportConfig: false, hasMobileTestVariants: false }
    } catch (error) {
      return { hasViewportConfig: false, hasMobileTestVariants: false }
    }
  }

  /**
   * Detect Docker configuration
   */
  private async detectDockerConfiguration(projectPath: string): Promise<boolean> {
    const dockerFiles = [
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.yaml',
      '.dockerignore'
    ]

    for (const dockerFile of dockerFiles) {
      const dockerPath = path.join(projectPath, dockerFile)
      if (await fs.pathExists(dockerPath)) {
        return true
      }
    }

    return false
  }

  /**
   * Detect Cypress configuration files and parse them
   */
  async detectConfiguration(projectPath: string): Promise<ConfigurationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      // Check for v10+ configuration files first
      const configJsPath = path.join(projectPath, 'cypress.config.js')
      const configTsPath = path.join(projectPath, 'cypress.config.ts')
      const legacyConfigPath = path.join(projectPath, 'cypress.json')

      if (await fs.pathExists(configJsPath)) {
        try {
          const config = await fs.readJSON(configJsPath)
          return {
            detected: true,
            configType: 'cypress.config.js',
            version: 'v10+',
            configuration: config
          }
        } catch (error) {
          errors.push(`Failed to parse configuration file: ${error instanceof Error ? error.message : String(error)}`)
          return { detected: false, errors }
        }
      }

      if (await fs.pathExists(configTsPath)) {
        try {
          const configContent = await fs.readFile(configTsPath, 'utf-8')
          return {
            detected: true,
            configType: 'cypress.config.ts',
            version: 'v10+',
            configuration: { content: configContent }
          }
        } catch (error) {
          errors.push(`Failed to read TypeScript configuration: ${error instanceof Error ? error.message : String(error)}`)
          return { detected: false, errors }
        }
      }

      if (await fs.pathExists(legacyConfigPath)) {
        try {
          const config = await fs.readJSON(legacyConfigPath)
          return {
            detected: true,
            configType: 'cypress.json',
            version: 'v9-',
            configuration: config
          }
        } catch (error) {
          errors.push(`Failed to parse configuration file: ${error instanceof Error ? error.message : String(error)}`)
          return { detected: false, errors }
        }
      }

      errors.push('No Cypress configuration file found')
      return { detected: false, errors }

    } catch (error) {
      errors.push(`Error detecting configuration: ${error instanceof Error ? error.message : String(error)}`)
      return { detected: false, errors }
    }
  }

  /**
   * Detect package manager used in the project
   */
  async detectPackageManager(projectPath: string): Promise<PackageManagerResult> {
    const pnpmLock = path.join(projectPath, 'pnpm-lock.yaml')
    const yarnLock = path.join(projectPath, 'yarn.lock')
    const npmLock = path.join(projectPath, 'package-lock.json')

    try {
      // Check in order of preference
      if (await fs.pathExists(pnpmLock)) {
        return { manager: 'pnpm', lockFile: 'pnpm-lock.yaml' }
      }

      if (await fs.pathExists(yarnLock)) {
        return { manager: 'yarn', lockFile: 'yarn.lock' }
      }

      if (await fs.pathExists(npmLock)) {
        return { manager: 'npm', lockFile: 'package-lock.json' }
      }

      // Default to npm if no lock files found
      return { manager: 'npm', assumed: true }
    } catch (error) {
      return { manager: 'npm', assumed: true }
    }
  }

  /**
   * Analyze project directory structure
   */
  async analyzeProjectStructure(projectPath: string): Promise<ProjectStructureResult> {
    const directories: string[] = []
    const testTypes: string[] = []
    const errors: string[] = []
    const warnings: string[] = []
    let hasComponentTesting = false
    let hasCustomSelectors = false
    let hasSymlinks = false
    let isEmpty = false
    const testCounts: Record<string, number> = {}

    try {
      const cypressDir = path.join(projectPath, 'cypress')

      // Check if cypress directory exists, but be lenient for testing
      let cypressDirExists = true
      try {
        cypressDirExists = await fs.pathExists(cypressDir)
      } catch (error) {
        // Continue with directory scanning even if we can't check cypress dir
      }

      // Check for standard directories
      const possibleDirectories = [
        'cypress/e2e',
        'cypress/integration', // legacy
        'cypress/component',
        'cypress/support',
        'cypress/fixtures',
        'cypress/downloads',
        'cypress/plugins', // legacy
        'cypress/selectors' // custom
      ]

      for (const dir of possibleDirectories) {
        const fullPath = path.join(projectPath, dir)
        try {
          if (await fs.pathExists(fullPath)) {
            const stat = await fs.stat(fullPath)
            if (stat.isDirectory()) {
              directories.push(dir)

              // Count test files
              try {
                const files = await fs.readdir(fullPath)
                const testFiles = files.filter(file =>
                  file.endsWith('.cy.js') ||
                  file.endsWith('.cy.ts') ||
                  file.endsWith('.spec.js') ||
                  file.endsWith('.spec.ts') ||
                  file.endsWith('.test.js') ||
                  file.endsWith('.test.ts')
                )
                if (testFiles.length > 0) {
                  testCounts[dir] = testFiles.length
                }
              } catch (error) {
                // Ignore errors reading directory contents
              }

              // Check for symlinks
              if ('isSymbolicLink' in stat && typeof (stat as any).isSymbolicLink === 'function') {
                if ((stat as any).isSymbolicLink()) {
                  hasSymlinks = true
                }
              }
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('EACCES')) {
            errors.push('Permission denied accessing project directory')
          }
        }
      }

      // Determine test types and version
      if (directories.includes('cypress/e2e')) {
        testTypes.push('e2e')
      }
      if (directories.includes('cypress/integration')) {
        testTypes.push('integration')
      }
      if (directories.includes('cypress/component')) {
        testTypes.push('component')
        hasComponentTesting = true
      }
      if (directories.includes('cypress/selectors')) {
        hasCustomSelectors = true
      }

      // Determine version based on directory structure
      const version = directories.includes('cypress/integration') || directories.includes('cypress/plugins') ? 'v9-' : 'v10+'

      // Check if directory is empty
      if (directories.length === 0) {
        isEmpty = true
        warnings.push('Project directory appears to be empty')
      } else if (!cypressDirExists && directories.length === 0) {
        warnings.push('No cypress directory found')
        isEmpty = true
      }

      // Check for symlinks warning
      if (hasSymlinks) {
        warnings.push('Project contains symbolic links')
      }

      // Analyze advanced features
      const advancedFeatures = await this.analyzeAdvancedFeatures(projectPath)
      const hasCustomCommands = advancedFeatures.customCommandFiles.length > 0
      const hasEnvironmentConfig = advancedFeatures.environmentFiles.length > 0
      const hasCiCdConfig = advancedFeatures.cicdConfigurations.length > 0

      return {
        directories,
        testTypes,
        version,
        hasComponentTesting,
        hasMultipleTestTypes: testTypes.length > 1,
        hasCustomSelectors,
        hasCustomCommands,
        hasEnvironmentConfig,
        hasCiCdConfig,
        testCounts: Object.keys(testCounts).length > 0 ? testCounts : undefined,
        isEmpty,
        hasSymlinks,
        advancedFeatures,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      }

    } catch (error) {
      errors.push(`Error analyzing project structure: ${error instanceof Error ? error.message : String(error)}`)
      return {
        directories,
        testTypes,
        version: 'v10+',
        hasComponentTesting: false,
        hasMultipleTestTypes: false,
        hasCustomSelectors: false,
        hasCustomCommands: false,
        hasEnvironmentConfig: false,
        hasCiCdConfig: false,
        errors
      }
    }
  }

  /**
   * Scan and analyze project dependencies
   */
  async scanDependencies(projectPath: string): Promise<DependencyResult> {
    const dependencies: string[] = []
    const plugins: string[] = []
    const compatibilityWarnings: string[] = []
    const errors: string[] = []

    try {
      const packageJsonPath = path.join(projectPath, 'package.json')

      if (!(await fs.pathExists(packageJsonPath))) {
        errors.push('package.json not found')
        return {
          hasCypress: false,
          dependencies,
          plugins,
          hasPlugins: false,
          compatibilityWarnings,
          errors
        }
      }

      const packageJson = await fs.readJSON(packageJsonPath)
      const allDeps = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      }

      // Extract all Cypress-related dependencies
      Object.keys(allDeps).forEach(dep => {
        if (dep.includes('cypress') || dep.startsWith('@cypress/')) {
          dependencies.push(dep)
          if (dep !== 'cypress') {
            plugins.push(dep)
          }
        }
      })

      const hasCypress = dependencies.includes('cypress')
      const cypressVersion = hasCypress ? allDeps['cypress'] : undefined

      let majorVersion: number | undefined
      let isLegacyVersion = false

      if (cypressVersion) {
        // Extract major version number
        const versionMatch = cypressVersion.match(/(\d+)/)
        if (versionMatch) {
          majorVersion = parseInt(versionMatch[1], 10)
          isLegacyVersion = majorVersion < 10

          if (isLegacyVersion) {
            compatibilityWarnings.push('Legacy Cypress version detected (v9 or lower)')
          }
        }
      }

      // Check Node.js version compatibility
      const nodeVersionRequirement = packageJson.engines?.node
      const nodeCompatible = true // Assume compatible for now, could add actual check

      return {
        hasCypress,
        cypressVersion,
        majorVersion,
        isLegacyVersion,
        dependencies,
        plugins,
        hasPlugins: plugins.length > 0,
        nodeVersionRequirement,
        nodeCompatible,
        compatibilityWarnings
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        errors.push('package.json not found')
      } else {
        errors.push(`Error scanning dependencies: ${error instanceof Error ? error.message : String(error)}`)
      }

      return {
        hasCypress: false,
        dependencies,
        plugins,
        hasPlugins: false,
        compatibilityWarnings,
        errors
      }
    }
  }

  /**
   * Perform complete project analysis
   */
  async analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
    const [configuration, structure, dependencies, packageManager] = await Promise.all([
      this.detectConfiguration(projectPath),
      this.analyzeProjectStructure(projectPath),
      this.scanDependencies(projectPath),
      this.detectPackageManager(projectPath)
    ])

    const isCypressProject = configuration.detected && dependencies.hasCypress

    // Calculate summary information
    const testFileCount = structure.testCounts
      ? Object.values(structure.testCounts).reduce((sum, count) => sum + count, 0)
      : 0

    const hasAdvancedFeatures = structure.hasComponentTesting ||
                               structure.hasCustomSelectors ||
                               structure.hasCustomCommands ||
                               structure.hasEnvironmentConfig ||
                               structure.hasCiCdConfig ||
                               (structure.advancedFeatures?.hasViewportConfig) ||
                               (structure.advancedFeatures?.hasMobileTestVariants) ||
                               (structure.advancedFeatures?.hasDockerConfig) ||
                               dependencies.hasPlugins ||
                               structure.hasMultipleTestTypes

    let complexity: 'simple' | 'moderate' | 'complex' = 'simple'
    if (testFileCount > 50 ||
        dependencies.plugins.length > 5 ||
        (structure.advancedFeatures?.cicdConfigurations.length || 0) > 2 ||
        (structure.advancedFeatures?.hasDockerConfig)) {
      complexity = 'complex'
    } else if (testFileCount > 10 || hasAdvancedFeatures) {
      complexity = 'moderate'
    }

    // Determine conversion readiness
    const blockers: string[] = []
    const warnings: string[] = []

    if (!isCypressProject) {
      blockers.push('Not a valid Cypress project')
    }

    if (configuration.errors?.length) {
      blockers.push(...configuration.errors)
    }

    if (dependencies.errors?.length) {
      blockers.push(...dependencies.errors)
    }

    if (dependencies.compatibilityWarnings.length) {
      warnings.push(...dependencies.compatibilityWarnings)
    }

    if (structure.warnings?.length) {
      warnings.push(...structure.warnings)
    }

    // Add warnings for advanced features that require special conversion handling
    if (structure.hasCustomCommands) {
      warnings.push('Custom commands detected - will be converted to Page Object methods')
    }

    if (structure.advancedFeatures?.cicdConfigurations.length) {
      warnings.push('CI/CD configurations detected - will require manual review and updates')
    }

    if (structure.advancedFeatures?.hasViewportConfig) {
      warnings.push('Viewport configurations detected - will be migrated to Playwright viewport settings')
    }

    if (structure.advancedFeatures?.hasDockerConfig) {
      warnings.push('Docker configurations detected - will need updates for Playwright browser dependencies')
    }

    if (structure.advancedFeatures?.environmentFiles.length) {
      warnings.push('Environment files detected - will need validation for Playwright compatibility')
    }

    return {
      isCypressProject,
      configuration,
      structure,
      dependencies,
      packageManager,
      summary: {
        projectType: structure.version === 'v10+' ? 'Modern Cypress' : 'Legacy Cypress',
        complexity,
        testFileCount,
        hasAdvancedFeatures
      },
      conversionReadiness: {
        ready: blockers.length === 0,
        blockers,
        warnings
      }
    }
  }

  /**
   * Quick check if directory contains a Cypress project
   */
  async isCypressProject(projectPath: string): Promise<boolean> {
    try {
      const configResult = await this.detectConfiguration(projectPath)
      const dependencyResult = await this.scanDependencies(projectPath)

      return configResult.detected || dependencyResult.hasCypress
    } catch (error) {
      return false
    }
  }

  /**
   * Get project conversion recommendations
   */
  async getConversionRecommendations(projectPath: string): Promise<{
    recommendations: string[]
    estimatedEffort: 'low' | 'medium' | 'high'
    criticalActions: string[]
  }> {
    const analysis = await this.analyzeProject(projectPath)
    const recommendations: string[] = []
    const criticalActions: string[] = []

    if (!analysis.isCypressProject) {
      criticalActions.push('Verify this is a Cypress project before attempting conversion')
      return {
        recommendations,
        estimatedEffort: 'high',
        criticalActions
      }
    }

    // Add recommendations based on analysis
    if (analysis.dependencies.isLegacyVersion) {
      recommendations.push('Consider upgrading Cypress to v10+ before conversion for better compatibility')
    }

    if (analysis.structure.hasCustomSelectors) {
      recommendations.push('Custom selector files will be converted to Playwright locator patterns')
    }

    if (analysis.dependencies.hasPlugins) {
      recommendations.push('Review Cypress plugins for Playwright alternatives')
    }

    if (analysis.structure.hasComponentTesting) {
      recommendations.push('Component tests will be converted to Playwright component testing')
    }

    if (analysis.structure.hasCustomCommands) {
      recommendations.push('Custom commands will be converted to Page Object methods for better maintainability')
    }

    if (analysis.structure.advancedFeatures?.cicdConfigurations.length) {
      recommendations.push('CI/CD pipelines will need updates for Playwright browser installation and execution')
    }

    if (analysis.structure.advancedFeatures?.hasViewportConfig) {
      recommendations.push('Viewport configurations will be migrated to Playwright projects for multi-device testing')
    }

    if (analysis.structure.advancedFeatures?.hasDockerConfig) {
      recommendations.push('Docker configurations will need updates for Playwright browser dependencies')
    }

    if (analysis.structure.advancedFeatures?.environmentFiles.length) {
      recommendations.push('Environment configurations will be validated for Playwright compatibility')
    }

    if (analysis.structure.advancedFeatures?.hasMobileTestVariants) {
      recommendations.push('Mobile test variants will be converted to Playwright mobile emulation')
    }

    // Determine estimated effort
    let estimatedEffort: 'low' | 'medium' | 'high' = 'low'

    if (analysis.summary.complexity === 'complex' || analysis.dependencies.plugins.length > 5) {
      estimatedEffort = 'high'
    } else if (analysis.summary.complexity === 'moderate' || analysis.structure.hasMultipleTestTypes) {
      estimatedEffort = 'medium'
    }

    return {
      recommendations,
      estimatedEffort,
      criticalActions
    }
  }
}

// Export convenience functions
export const detectCypressProject = async (projectPath: string): Promise<boolean> => {
  const detector = new CypressProjectDetector()
  return detector.isCypressProject(projectPath)
}

export const analyzeCypressProject = async (projectPath: string): Promise<ProjectAnalysis> => {
  const detector = new CypressProjectDetector()
  return detector.analyzeProject(projectPath)
}

export const getCypressProjectRecommendations = async (projectPath: string) => {
  const detector = new CypressProjectDetector()
  return detector.getConversionRecommendations(projectPath)
}