import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import * as fs from 'fs-extra'
import * as path from 'path'
import { RepositoryIntegrationService } from '../src/repository-integration'

// Mock the external dependencies
const mockListRemote = jest.fn()
const mockClone = jest.fn()
const mockEnsureDir = jest.fn()
const mockRemove = jest.fn()
const mockPathExists = jest.fn()
const mockReaddir = jest.fn()
const mockReadFile = jest.fn()
const mockReadJSON = jest.fn()
const mockStat = jest.fn()

jest.mock('simple-git', () => ({
  simpleGit: () => ({
    listRemote: mockListRemote,
    clone: mockClone
  })
}))

jest.mock('fs-extra', () => ({
  ensureDir: mockEnsureDir,
  remove: mockRemove,
  pathExists: mockPathExists,
  readdir: mockReaddir,
  readFile: mockReadFile,
  readJSON: mockReadJSON,
  stat: mockStat
}))

describe('RepositoryIntegrationService', () => {
  let service: RepositoryIntegrationService
  const testTempDir = '/tmp/test-cypress-conversions'

  beforeEach(() => {
    service = new RepositoryIntegrationService(testTempDir)

    // Reset all mocks
    jest.clearAllMocks()

    // Set default mock implementations
    mockEnsureDir.mockResolvedValue(undefined)
    mockRemove.mockResolvedValue(undefined)
    mockPathExists.mockResolvedValue(true)
    mockReaddir.mockResolvedValue([])
    mockReadFile.mockResolvedValue('')
    mockReadJSON.mockResolvedValue({})
    mockStat.mockResolvedValue({ isDirectory: () => false, isFile: () => true })
  })

  afterEach(async () => {
    jest.clearAllMocks()
  })

  describe('Repository Analysis', () => {
    test('should analyze helenanull/cypress-example repository', async () => {
      // Mock the repository exists
      mockListRemote.mockResolvedValue('origin')
      mockClone.mockResolvedValue(undefined)

      // Mock project structure
      mockPathExists.mockImplementation((filePath: any) => {
        const path = String(filePath)
        if (path.includes('cypress.config.js')) return Promise.resolve(true)
        if (path.includes('cypress/selectors')) return Promise.resolve(true)
        if (path.includes('.github/workflows')) return Promise.resolve(true)
        return Promise.resolve(false)
      })

      mockReaddir.mockImplementation((dirPath: any) => {
        const path = String(dirPath)
        if (path.includes('cypress/selectors')) {
          return Promise.resolve(['login.js', 'navigation.js'])
        }
        if (path.includes('cypress/e2e')) {
          return Promise.resolve(['login.cy.js', 'navigation.cy.js'])
        }
        if (path.includes('cypress/support')) {
          return Promise.resolve(['commands.cmd.js', 'e2e.js'])
        }
        return Promise.resolve([])
      })

      mockReadFile.mockImplementation((filePath: any) => {
        const path = String(filePath)
        if (path.includes('cypress.config.js')) {
          return Promise.resolve(`
            const { defineConfig } = require('cypress')
            module.exports = defineConfig({
              e2e: {
                baseUrl: 'http://localhost:3000',
                viewportWidth: 1280,
                viewportHeight: 720
              }
            })
          `)
        }
        if (path.includes('package.json')) {
          return Promise.resolve(JSON.stringify({
            dependencies: {
              cypress: '^12.5.0'
            },
            devDependencies: {
              'cypress-real-events': '^1.7.0',
              '@cypress/webpack-preprocessor': '^5.15.0'
            }
          }))
        }
        return Promise.resolve('')
      })

      const result = await service.analyzeRepository('https://github.com/helenanull/cypress-example.git')

      expect(result.repository).toBeDefined()
      expect(result.repository.url).toBe('https://github.com/helenanull/cypress-example.git')
      expect(result.repository.name).toBe('cypress-example')
      expect(result.repository.owner).toBe('helenanull')
      expect(result.repository.analysis.detected).toBe(true)
    })

    test('should analyze cypress-io/cypress-example-kitchensink repository', async () => {
      // Mock the repository exists
      mockListRemote.mockResolvedValue('origin')
      mockClone.mockResolvedValue(undefined)

      // Mock comprehensive project structure
      mockPathExists.mockImplementation((filePath: any) => {
        const path = String(filePath)
        if (path.includes('cypress.config.js')) return Promise.resolve(true)
        if (path.includes('.github/workflows')) return Promise.resolve(true)
        if (path.includes('circle.yml')) return Promise.resolve(true)
        if (path.includes('appveyor.yml')) return Promise.resolve(true)
        return Promise.resolve(false)
      })

      mockReaddir.mockImplementation((dirPath: any) => {
        const path = String(dirPath)
        if (path.includes('cypress/e2e')) {
          return Promise.resolve([
            'actions.cy.js', 'aliasing.cy.js', 'assertions.cy.js',
            'connectors.cy.js', 'cookies.cy.js', 'files.cy.js',
            'local_storage.cy.js', 'location.cy.js', 'misc.cy.js',
            'network_requests.cy.js', 'querying.cy.js', 'spies_stubs_clocks.cy.js',
            'traversal.cy.js', 'utilities.cy.js', 'viewport.cy.js',
            'waiting.cy.js', 'window.cy.js'
          ])
        }
        if (path.includes('cypress/support')) {
          return Promise.resolve(['commands.js', 'e2e.js'])
        }
        return Promise.resolve([])
      })

      mockReadFile.mockImplementation((filePath: any) => {
        const path = String(filePath)
        if (path.includes('cypress.config.js')) {
          return Promise.resolve(`
            const { defineConfig } = require('cypress')
            module.exports = defineConfig({
              e2e: {
                baseUrl: 'https://example.cypress.io',
                excludeSpecPattern: ['**/1-getting-started/*', '**/2-advanced-examples/*'],
                viewportWidth: 1000,
                viewportHeight: 660,
                video: true,
                screenshot: true
              }
            })
          `)
        }
        if (path.includes('package.json')) {
          return Promise.resolve(JSON.stringify({
            dependencies: {
              cypress: '^12.0.0'
            },
            devDependencies: {
              '@cypress/code-coverage': '^3.10.0',
              'start-server-and-test': '^1.15.0',
              'cypress-multi-reporters': '^1.6.0'
            }
          }))
        }
        if (path.includes('.github/workflows')) {
          return Promise.resolve(`
            name: End-to-end tests
            on: [push, pull_request]
            jobs:
              cypress-run:
                runs-on: ubuntu-latest
                steps:
                  - name: Checkout
                    uses: actions/checkout@v3
                  - name: Cypress run
                    uses: cypress-io/github-action@v5
          `)
        }
        return Promise.resolve('')
      })

      const result = await service.analyzeRepository('https://github.com/cypress-io/cypress-example-kitchensink.git')

      expect(result.repository).toBeDefined()
      expect(result.repository.url).toBe('https://github.com/cypress-io/cypress-example-kitchensink.git')
      expect(result.repository.name).toBe('cypress-example-kitchensink')
      expect(result.repository.owner).toBe('cypress-io')
      expect(result.repository.analysis.detected).toBe(true)
    })

    test('should handle repository cloning errors gracefully', async () => {
      mockListRemote.mockRejectedValue(new Error('Repository not found'))

      const result = await service.analyzeRepository('https://github.com/nonexistent/repo.git')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Repository not found')
    })

    test('should detect non-Cypress repositories', async () => {
      mockListRemote.mockResolvedValue('origin')
      mockClone.mockResolvedValue(undefined)
      mockPathExists.mockResolvedValue(false) // No cypress config files

      const result = await service.analyzeRepository('https://github.com/example/react-app.git')

      expect(result.repository?.analysis.detected).toBe(false)
      expect(result.repository?.analysis.error).toContain('No Cypress configuration')
    })
  })

  describe('Repository Conversion', () => {
    test('should convert repository with proper cleanup', async () => {
      // Mock successful repository analysis
      mockListRemote.mockResolvedValue('origin')
      mockClone.mockResolvedValue(undefined)
      mockPathExists.mockResolvedValue(true)

      mockReadFile.mockImplementation((filePath: any) => {
        const path = String(filePath)
        if (path.includes('cypress.config.js')) {
          return Promise.resolve(`
            module.exports = { e2e: { baseUrl: 'http://localhost:3000' } }
          `)
        }
        if (path.includes('package.json')) {
          return Promise.resolve(JSON.stringify({
            dependencies: { cypress: '^12.0.0' }
          }))
        }
        return Promise.resolve('')
      })

      const result = await service.convertRepository('https://github.com/example/cypress-project.git')

      expect(result.success).toBe(true)
      expect(result.repository?.analysis.detected).toBe(true)
      expect(mockRemove).toHaveBeenCalled() // Cleanup should be called
    })

    test('should handle conversion failures with cleanup', async () => {
      mockListRemote.mockResolvedValue('origin')
      mockClone.mockResolvedValue(undefined)
      mockPathExists.mockResolvedValue(false) // No Cypress config

      const result = await service.convertRepository('https://github.com/example/not-cypress.git')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(mockRemove).toHaveBeenCalled() // Cleanup should still be called
    })
  })

  describe('Bulk Processing', () => {
    test('should process multiple repositories', async () => {
      const repositories = [
        'https://github.com/helenanull/cypress-example.git',
        'https://github.com/cypress-io/cypress-example-kitchensink.git'
      ]

      // Mock successful analysis for both repos
      mockListRemote.mockResolvedValue('origin')
      mockClone.mockResolvedValue(undefined)
      mockPathExists.mockResolvedValue(true)
      mockReadFile.mockResolvedValue('module.exports = { e2e: {} }')

      const results = await service.processBatch(repositories)

      expect(results).toHaveLength(2)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(true)
      expect(mockClone).toHaveBeenCalledTimes(2)
    })

    test('should handle mixed success/failure scenarios', async () => {
      const repositories = [
        'https://github.com/helenanull/cypress-example.git',
        'https://github.com/example/invalid-repo.git'
      ]

      // First repo succeeds, second fails
      mockListRemote
        .mockResolvedValueOnce('origin')
        .mockRejectedValueOnce(new Error('Not found'))

      mockClone.mockResolvedValue(undefined)
      mockPathExists.mockResolvedValue(true)
      mockReadFile.mockResolvedValue('module.exports = { e2e: {} }')

      const results = await service.processBatch(repositories)

      expect(results).toHaveLength(2)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(false)
      expect(results[1].error).toContain('Not found')
    })
  })

  describe('Progress Tracking', () => {
    test('should track conversion progress', async () => {
      const progressCallback = jest.fn()

      mockListRemote.mockResolvedValue('origin')
      mockClone.mockResolvedValue(undefined)
      mockPathExists.mockResolvedValue(true)
      mockReadFile.mockResolvedValue('module.exports = { e2e: {} }')

      await service.convertRepository(
        'https://github.com/example/cypress-project.git',
        { onProgress: progressCallback }
      )

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'cloning',
          progress: expect.any(Number),
          message: expect.any(String)
        })
      )

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'complete',
          progress: 1.0,
          message: expect.any(String)
        })
      )
    })
  })
})