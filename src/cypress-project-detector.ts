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
  testCounts?: Record<string, number>
  isEmpty?: boolean
  hasSymlinks?: boolean
  errors?: string[]
  warnings?: string[]
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

      return {
        directories,
        testTypes,
        version,
        hasComponentTesting,
        hasMultipleTestTypes: testTypes.length > 1,
        hasCustomSelectors,
        testCounts: Object.keys(testCounts).length > 0 ? testCounts : undefined,
        isEmpty,
        hasSymlinks,
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
                               dependencies.hasPlugins ||
                               structure.hasMultipleTestTypes

    let complexity: 'simple' | 'moderate' | 'complex' = 'simple'
    if (testFileCount > 50 || dependencies.plugins.length > 5) {
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