import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'

// Mock external dependencies before any imports
const mockReadJSON = jest.fn()
const mockReadFile = jest.fn()
const mockPathExists = jest.fn()
const mockReaddir = jest.fn()
const mockStat = jest.fn()

jest.mock('fs-extra', () => ({
  readJSON: mockReadJSON,
  readFile: mockReadFile,
  pathExists: mockPathExists,
  readdir: mockReaddir,
  stat: mockStat
}))

// Import after mocking
import { CypressProjectDetector } from '../src/cypress-project-detector'

describe('CypressProjectDetector', () => {
  let detector: CypressProjectDetector

  beforeEach(() => {
    detector = new CypressProjectDetector()

    // Reset all mocks
    jest.clearAllMocks()

    // Set default mock implementations
    mockPathExists.mockResolvedValue(false)
    mockReadJSON.mockResolvedValue({})
    mockReadFile.mockResolvedValue('')
    mockReaddir.mockResolvedValue([])
    mockStat.mockResolvedValue({ isDirectory: () => false, isFile: () => true })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Cypress Configuration Detection', () => {
    test('should detect cypress.config.js configuration', async () => {
      const projectPath = '/test/project'
      const mockConfig = {
        e2e: {
          baseUrl: 'http://localhost:3000',
          supportFile: 'cypress/support/e2e.js',
          specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}'
        }
      }

      mockPathExists.mockImplementation((path: string) => {
        return Promise.resolve(path.includes('cypress.config.js'))
      })
      mockReadJSON.mockResolvedValue(mockConfig)

      const result = await detector.detectConfiguration(projectPath)

      expect(result.detected).toBe(true)
      expect(result.configType).toBe('cypress.config.js')
      expect(result.version).toBe('v10+')
      expect(result.configuration).toEqual(mockConfig)
    })

    test('should detect cypress.config.ts configuration', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockImplementation((path: string) => {
        return Promise.resolve(path.includes('cypress.config.ts'))
      })

      // Mock reading TypeScript config file
      mockReadFile.mockResolvedValue(`
        import { defineConfig } from 'cypress'
        export default defineConfig({
          e2e: {
            baseUrl: 'http://localhost:3000',
            setupNodeEvents(on, config) {
              // implement node event listeners here
            },
          },
        })
      `)

      const result = await detector.detectConfiguration(projectPath)

      expect(result.detected).toBe(true)
      expect(result.configType).toBe('cypress.config.ts')
      expect(result.version).toBe('v10+')
    })

    test('should detect legacy cypress.json configuration', async () => {
      const projectPath = '/test/project'
      const legacyConfig = {
        baseUrl: 'http://localhost:8080',
        integrationFolder: 'cypress/integration',
        supportFile: 'cypress/support/index.js',
        video: false
      }

      mockPathExists.mockImplementation((path: string) => {
        return Promise.resolve(path.includes('cypress.json'))
      })
      mockReadJSON.mockResolvedValue(legacyConfig)

      const result = await detector.detectConfiguration(projectPath)

      expect(result.detected).toBe(true)
      expect(result.configType).toBe('cypress.json')
      expect(result.version).toBe('v9-')
      expect(result.configuration).toEqual(legacyConfig)
    })

    test('should handle missing configuration files', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockResolvedValue(false)

      const result = await detector.detectConfiguration(projectPath)

      expect(result.detected).toBe(false)
      expect(result.configType).toBeUndefined()
      expect(result.errors).toContain('No Cypress configuration file found')
    })

    test('should handle malformed configuration files', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockResolvedValue(true)
      mockReadJSON.mockRejectedValue(new Error('Malformed JSON'))

      const result = await detector.detectConfiguration(projectPath)

      expect(result.detected).toBe(false)
      expect(result.errors?.[0]).toContain('Failed to parse configuration file')
    })
  })

  describe('Package Manager Detection', () => {
    test('should detect npm package manager', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockImplementation((path: string) => {
        return Promise.resolve(path.includes('package-lock.json'))
      })

      const result = await detector.detectPackageManager(projectPath)

      expect(result.manager).toBe('npm')
      expect(result.lockFile).toBe('package-lock.json')
    })

    test('should detect yarn package manager', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockImplementation((path: string) => {
        return Promise.resolve(path.includes('yarn.lock'))
      })

      const result = await detector.detectPackageManager(projectPath)

      expect(result.manager).toBe('yarn')
      expect(result.lockFile).toBe('yarn.lock')
    })

    test('should detect pnpm package manager', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockImplementation((path: string) => {
        return Promise.resolve(path.includes('pnpm-lock.yaml'))
      })

      const result = await detector.detectPackageManager(projectPath)

      expect(result.manager).toBe('pnpm')
      expect(result.lockFile).toBe('pnpm-lock.yaml')
    })

    test('should prefer yarn over npm when both are present', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockImplementation((path: string) => {
        return Promise.resolve(path.includes('yarn.lock') || path.includes('package-lock.json'))
      })

      const result = await detector.detectPackageManager(projectPath)

      expect(result.manager).toBe('yarn')
    })

    test('should default to npm when no lock files found', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockResolvedValue(false)

      const result = await detector.detectPackageManager(projectPath)

      expect(result.manager).toBe('npm')
      expect(result.lockFile).toBeUndefined()
      expect(result.assumed).toBe(true)
    })
  })

  describe('Project Structure Analysis', () => {
    test('should detect standard Cypress v10+ project structure', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockImplementation((path: string) => {
        const paths = [
          'cypress/e2e',
          'cypress/support',
          'cypress/fixtures'
        ]
        return Promise.resolve(paths.some(p => path.includes(p)))
      })

      mockStat.mockImplementation(() => ({
        isDirectory: () => true,
        isFile: () => false
      }))

      const result = await detector.analyzeProjectStructure(projectPath)

      expect(result.directories).toContain('cypress/e2e')
      expect(result.directories).toContain('cypress/support')
      expect(result.directories).toContain('cypress/fixtures')
      expect(result.testTypes).toContain('e2e')
      expect(result.version).toBe('v10+')
    })

    test('should detect legacy Cypress v9- project structure', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockImplementation((path: string) => {
        const paths = [
          'cypress/integration',
          'cypress/support',
          'cypress/fixtures',
          'cypress/plugins'
        ]
        return Promise.resolve(paths.some(p => path.includes(p)))
      })

      mockStat.mockImplementation(() => ({
        isDirectory: () => true,
        isFile: () => false
      }))

      const result = await detector.analyzeProjectStructure(projectPath)

      expect(result.directories).toContain('cypress/integration')
      expect(result.directories).toContain('cypress/plugins')
      expect(result.testTypes).toContain('integration')
      expect(result.version).toBe('v9-')
    })

    test('should detect component testing setup', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockImplementation((path: string) => {
        const paths = [
          'cypress/component',
          'cypress/support/component.ts'
        ]
        return Promise.resolve(paths.some(p => path.includes(p)))
      })

      mockStat.mockImplementation(() => ({
        isDirectory: () => true,
        isFile: () => false
      }))

      const result = await detector.analyzeProjectStructure(projectPath)

      expect(result.directories).toContain('cypress/component')
      expect(result.testTypes).toContain('component')
      expect(result.hasComponentTesting).toBe(true)
    })

    test('should detect mixed test structure (e2e + component)', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockImplementation((path: string) => {
        const paths = [
          'cypress/e2e',
          'cypress/component',
          'cypress/support'
        ]
        return Promise.resolve(paths.some(p => path.includes(p)))
      })

      mockStat.mockImplementation(() => ({
        isDirectory: () => true,
        isFile: () => false
      }))

      const result = await detector.analyzeProjectStructure(projectPath)

      expect(result.testTypes).toContain('e2e')
      expect(result.testTypes).toContain('component')
      expect(result.hasMultipleTestTypes).toBe(true)
    })

    test('should count test files in each directory', async () => {
      const projectPath = '/test/project'
      mockPathExists.mockResolvedValue(true)

      mockReaddir.mockImplementation((dirPath: string) => {
        if (dirPath.includes('e2e')) {
          return Promise.resolve(['test1.cy.js', 'test2.cy.ts', 'helper.js'])
        }
        return Promise.resolve([])
      })

      mockStat.mockImplementation((filePath: string) => ({
        isDirectory: () => filePath.includes('cypress'),
        isFile: () => !filePath.includes('cypress')
      }))

      const result = await detector.analyzeProjectStructure(projectPath)

      expect(result.testCounts).toBeDefined()
      expect(result.testCounts!['cypress/e2e']).toBe(2) // Only .cy.js and .cy.ts files
    })
  })

  describe('Dependency Scanning and Validation', () => {
    test('should detect Cypress dependency and version', async () => {
      const projectPath = '/test/project'
      const mockPackageJson = {
        name: 'test-project',
        devDependencies: {
          cypress: '^12.5.0',
          '@cypress/webpack-preprocessor': '^5.15.0'
        }
      }

      mockReadJSON.mockResolvedValue(mockPackageJson)

      const result = await detector.scanDependencies(projectPath)

      expect(result.hasCypress).toBe(true)
      expect(result.cypressVersion).toBe('^12.5.0')
      expect(result.dependencies).toContain('cypress')
      expect(result.dependencies).toContain('@cypress/webpack-preprocessor')
      expect(result.majorVersion).toBe(12)
    })

    test('should detect Cypress plugins and preprocessors', async () => {
      const projectPath = '/test/project'
      const mockPackageJson = {
        devDependencies: {
          cypress: '^11.0.0',
          'cypress-real-events': '^1.7.0',
          '@cypress/code-coverage': '^3.10.0',
          'cypress-cucumber-preprocessor': '^4.3.0'
        }
      }

      mockReadJSON.mockResolvedValue(mockPackageJson)

      const result = await detector.scanDependencies(projectPath)

      expect(result.plugins).toContain('cypress-real-events')
      expect(result.plugins).toContain('@cypress/code-coverage')
      expect(result.plugins).toContain('cypress-cucumber-preprocessor')
      expect(result.hasPlugins).toBe(true)
    })

    test('should check version compatibility', async () => {
      const projectPath = '/test/project'
      const mockPackageJson = {
        devDependencies: {
          cypress: '^8.5.0' // Legacy version
        }
      }

      mockReadJSON.mockResolvedValue(mockPackageJson)

      const result = await detector.scanDependencies(projectPath)

      expect(result.cypressVersion).toBe('^8.5.0')
      expect(result.majorVersion).toBe(8)
      expect(result.isLegacyVersion).toBe(true)
      expect(result.compatibilityWarnings).toContain('Legacy Cypress version detected')
    })

    test('should handle missing package.json', async () => {
      const projectPath = '/test/project'
      mockReadJSON.mockRejectedValue(new Error('ENOENT: no such file'))

      const result = await detector.scanDependencies(projectPath)

      expect(result.hasCypress).toBe(false)
      expect(result.errors).toContain('package.json not found')
    })

    test('should detect Node.js version compatibility', async () => {
      const projectPath = '/test/project'
      const mockPackageJson = {
        engines: {
          node: '>=16.0.0'
        },
        devDependencies: {
          cypress: '^12.0.0'
        }
      }

      mockReadJSON.mockResolvedValue(mockPackageJson)

      const result = await detector.scanDependencies(projectPath)

      expect(result.nodeVersionRequirement).toBe('>=16.0.0')
      expect(result.nodeCompatible).toBe(true)
    })
  })

  describe('Target Repository Specific Tests', () => {
    test('should analyze helenanull/cypress-example project structure', async () => {
      const projectPath = '/test/helenanull-cypress-example'

      // Mock the expected structure based on repository analysis
      mockPathExists.mockImplementation((path: string) => {
        const paths = [
          'cypress/e2e',
          'cypress/support',
          'cypress/selectors', // Centralized selectors
          'cypress.config.js'
        ]
        return Promise.resolve(paths.some(p => path.includes(p)))
      })

      mockReadJSON.mockImplementation((path: string) => {
        if (path.includes('package.json')) {
          return Promise.resolve({
            devDependencies: {
              cypress: '^12.0.0'
            }
          })
        }
        if (path.includes('cypress.config.js')) {
          return Promise.resolve({
            e2e: {
              baseUrl: 'http://localhost:3000',
              env: {
                device: 'web'
              }
            }
          })
        }
        return Promise.resolve({})
      })

      const configResult = await detector.detectConfiguration(projectPath)
      const structureResult = await detector.analyzeProjectStructure(projectPath)

      expect(configResult.detected).toBe(true)
      expect(structureResult.hasCustomSelectors).toBe(true)
      expect(structureResult.directories).toContain('cypress/selectors')
    })

    test('should analyze cypress-io/cypress-example-kitchensink project structure', async () => {
      const projectPath = '/test/cypress-kitchensink'

      // Mock comprehensive Cypress setup
      mockPathExists.mockImplementation((path: string) => {
        const paths = [
          'cypress/e2e',
          'cypress/support',
          'cypress/fixtures',
          'cypress/downloads',
          'cypress.config.js'
        ]
        return Promise.resolve(paths.some(p => path.includes(p)))
      })

      mockReadJSON.mockImplementation((path: string) => {
        if (path.includes('package.json')) {
          return Promise.resolve({
            devDependencies: {
              cypress: '^12.5.0',
              'start-server-and-test': '^1.15.0',
              '@cypress/code-coverage': '^3.10.0'
            },
            scripts: {
              'cy:open': 'cypress open',
              'cy:run': 'cypress run',
              'test:ci': 'start-server-and-test'
            }
          })
        }
        return Promise.resolve({})
      })

      const dependenciesResult = await detector.scanDependencies(projectPath)
      const structureResult = await detector.analyzeProjectStructure(projectPath)

      expect(dependenciesResult.hasPlugins).toBe(true)
      expect(dependenciesResult.plugins).toContain('@cypress/code-coverage')
      expect(dependenciesResult.plugins).toContain('start-server-and-test')
      expect(structureResult.testTypes).toContain('e2e')
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('should handle permission errors gracefully', async () => {
      const projectPath = '/test/restricted-project'
      mockPathExists.mockRejectedValue(new Error('EACCES: permission denied'))

      const result = await detector.analyzeProjectStructure(projectPath)

      expect(result.errors).toContain('Permission denied accessing project directory')
    })

    test('should handle empty project directories', async () => {
      const projectPath = '/test/empty-project'
      mockPathExists.mockResolvedValue(true)
      mockReaddir.mockResolvedValue([])

      const result = await detector.analyzeProjectStructure(projectPath)

      expect(result.isEmpty).toBe(true)
      expect(result.warnings).toContain('Project directory appears to be empty')
    })

    test('should detect corrupted configuration files', async () => {
      const projectPath = '/test/corrupted-project'
      mockPathExists.mockResolvedValue(true)
      mockReadJSON.mockRejectedValue(new Error('Unexpected token in JSON'))

      const result = await detector.detectConfiguration(projectPath)

      expect(result.detected).toBe(false)
      expect(result.errors?.[0]).toContain('Failed to parse configuration file')
    })

    test('should handle symlinks and junctions', async () => {
      const projectPath = '/test/symlinked-project'
      mockPathExists.mockResolvedValue(true)
      mockStat.mockImplementation(() => ({
        isDirectory: () => true,
        isFile: () => false,
        isSymbolicLink: () => true
      }))

      const result = await detector.analyzeProjectStructure(projectPath)

      expect(result.hasSymlinks).toBe(true)
      expect(result.warnings).toContain('Project contains symbolic links')
    })
  })

  describe('Comprehensive Project Analysis', () => {
    test('should provide complete project analysis', async () => {
      const projectPath = '/test/complete-project'

      // Mock complete project setup
      mockPathExists.mockResolvedValue(true)
      mockReadJSON.mockImplementation((path: string) => {
        if (path.includes('package.json')) {
          return Promise.resolve({
            name: 'test-cypress-project',
            devDependencies: {
              cypress: '^12.0.0',
              typescript: '^4.9.0'
            },
            engines: {
              node: '>=16.0.0'
            }
          })
        }
        return Promise.resolve({
          e2e: {
            baseUrl: 'http://localhost:3000',
            supportFile: 'cypress/support/e2e.ts'
          }
        })
      })

      const analysis = await detector.analyzeProject(projectPath)

      expect(analysis.isCypressProject).toBe(true)
      expect(analysis.configuration.detected).toBe(true)
      expect(analysis.dependencies.hasCypress).toBe(true)
      expect(analysis.structure.version).toBeDefined()
      expect(analysis.packageManager.manager).toBeDefined()
      expect(analysis.summary).toBeDefined()
      expect(analysis.conversionReadiness.ready).toBeDefined()
    })
  })
})