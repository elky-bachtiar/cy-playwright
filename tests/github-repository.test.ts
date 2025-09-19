import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'

// Mock the external dependencies before any imports
const mockListRemote = jest.fn()
const mockClone = jest.fn()
const mockCheckout = jest.fn()
const mockEnsureDir = jest.fn()
const mockRemove = jest.fn()
const mockPathExists = jest.fn()

jest.mock('simple-git', () => ({
  simpleGit: () => ({
    listRemote: mockListRemote,
    clone: mockClone,
    checkout: mockCheckout
  })
}))

jest.mock('fs-extra', () => ({
  ensureDir: mockEnsureDir,
  remove: mockRemove,
  pathExists: mockPathExists
}))

// Import after mocking
import { GitHubRepository } from '../src/github-repository'

describe('GitHubRepository', () => {
  let repository: GitHubRepository

  beforeEach(() => {
    repository = new GitHubRepository()

    // Reset all mocks
    jest.clearAllMocks()

    // Set default mock implementations
    mockEnsureDir.mockResolvedValue(undefined)
    mockRemove.mockResolvedValue(undefined)
    mockPathExists.mockResolvedValue(false)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('URL Parsing and Validation', () => {
    test('should parse valid GitHub HTTPS URLs', () => {
      const testCases = [
        {
          input: 'https://github.com/helenanull/cypress-example',
          expected: {
            owner: 'helenanull',
            repo: 'cypress-example',
            branch: 'master'
          }
        },
        {
          input: 'https://github.com/cypress-io/cypress-example-kitchensink',
          expected: {
            owner: 'cypress-io',
            repo: 'cypress-example-kitchensink',
            branch: 'master'
          }
        }
      ]

      testCases.forEach(({ input, expected }) => {
        const result = repository.parseRepositoryUrl(input)
        expect(result).toEqual(expected)
      })
    })

    test('should parse GitHub URLs with specific branches', () => {
      const url = 'https://github.com/helenanull/cypress-example/tree/develop'
      const result = repository.parseRepositoryUrl(url)

      expect(result).toEqual({
        owner: 'helenanull',
        repo: 'cypress-example',
        branch: 'develop'
      })
    })

    test('should parse GitHub SSH URLs', () => {
      const url = 'git@github.com:helenanull/cypress-example.git'
      const result = repository.parseRepositoryUrl(url)

      expect(result).toEqual({
        owner: 'helenanull',
        repo: 'cypress-example',
        branch: 'master'
      })
    })

    test('should reject invalid URLs', () => {
      const invalidUrls = [
        'not-a-url',
        'https://gitlab.com/user/repo',
        'https://github.com/user',
        'https://github.com/',
        'https://bitbucket.org/user/repo',
        ''
      ]

      invalidUrls.forEach(url => {
        expect(() => repository.parseRepositoryUrl(url)).toThrow('Invalid GitHub repository URL')
      })
    })

    test('should handle URLs with .git suffix', () => {
      const url = 'https://github.com/helenanull/cypress-example.git'
      const result = repository.parseRepositoryUrl(url)

      expect(result).toEqual({
        owner: 'helenanull',
        repo: 'cypress-example',
        branch: 'master'
      })
    })

    test('should handle URLs with trailing slashes', () => {
      const url = 'https://github.com/helenanull/cypress-example/'
      const result = repository.parseRepositoryUrl(url)

      expect(result).toEqual({
        owner: 'helenanull',
        repo: 'cypress-example',
        branch: 'master'
      })
    })
  })

  describe('Branch Detection and Validation', () => {
    test('should detect default branch when not specified', async () => {
      mockListRemote.mockResolvedValue('ref: refs/heads/main\tHEAD\n')

      const result = await repository.detectDefaultBranch('https://github.com/helenanull/cypress-example')

      expect(result).toBe('main')
      expect(mockListRemote).toHaveBeenCalledWith(['--symref', 'https://github.com/helenanull/cypress-example'])
    })

    test('should handle repositories with master as default branch', async () => {
      mockListRemote.mockResolvedValue('ref: refs/heads/master\tHEAD\n')

      const result = await repository.detectDefaultBranch('https://github.com/legacy/repo')

      expect(result).toBe('master')
    })

    test('should validate branch existence', async () => {
      mockListRemote.mockResolvedValue('refs/heads/main\nrefs/heads/develop\nrefs/heads/feature-branch\n')

      const exists = await repository.validateBranch('https://github.com/helenanull/cypress-example', 'develop')
      const notExists = await repository.validateBranch('https://github.com/helenanull/cypress-example', 'nonexistent')

      expect(exists).toBe(true)
      expect(notExists).toBe(false)
    })
  })

  describe('Repository Accessibility', () => {
    test('should validate public repository access', async () => {
      mockListRemote.mockResolvedValue('ref: refs/heads/main\tHEAD\n')

      const result = await repository.validateAccess('https://github.com/helenanull/cypress-example')

      expect(result.accessible).toBe(true)
      expect(result.isPublic).toBe(true)
    })

    test('should handle private repository access', async () => {
      mockListRemote.mockRejectedValue(new Error('Repository not found'))

      const result = await repository.validateAccess('https://github.com/private/repo')

      expect(result.accessible).toBe(false)
      expect(result.isPublic).toBe(false)
      expect(result.error).toContain('Repository not found or private')
    })

    test('should handle authentication errors', async () => {
      mockListRemote.mockRejectedValue(new Error('Authentication failed'))

      const result = await repository.validateAccess('https://github.com/secure/repo')

      expect(result.accessible).toBe(false)
      expect(result.error).toContain('Authentication required')
    })
  })

  describe('Network Error Scenarios', () => {
    test('should handle network timeout errors', async () => {
      mockListRemote.mockRejectedValue(new Error('Connection timeout'))

      const result = await repository.validateAccess('https://github.com/helenanull/cypress-example')

      expect(result.accessible).toBe(false)
      expect(result.error).toContain('Network error')
      expect(result.retryable).toBe(true)
    })

    test('should handle DNS resolution errors', async () => {
      mockListRemote.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))

      const result = await repository.validateAccess('https://github.com/invalid/repo')

      expect(result.accessible).toBe(false)
      expect(result.error).toContain('Network connectivity issue')
      expect(result.retryable).toBe(true)
    })

    test('should handle rate limiting errors', async () => {
      mockListRemote.mockRejectedValue(new Error('rate limit exceeded'))

      const result = await repository.validateAccess('https://github.com/helenanull/cypress-example')

      expect(result.accessible).toBe(false)
      expect(result.error).toContain('Rate limit exceeded')
      expect(result.retryAfter).toBeGreaterThan(0)
    })
  })

  describe('Repository Cloning', () => {
    test('should clone repository successfully', async () => {
      mockClone.mockResolvedValue(undefined)
      mockPathExists.mockResolvedValue(false)

      const result = await repository.cloneRepository(
        'https://github.com/helenanull/cypress-example',
        '/tmp/test-repo',
        { branch: 'master', depth: 1 }
      )

      expect(result.success).toBe(true)
      expect(result.path).toBe('/tmp/test-repo')
      expect(mockClone).toHaveBeenCalledWith(
        'https://github.com/helenanull/cypress-example',
        '/tmp/test-repo',
        ['--depth', '1', '--branch', 'main']
      )
    })

    test('should handle clone failures', async () => {
      mockClone.mockRejectedValue(new Error('Clone failed'))
      mockPathExists.mockResolvedValue(false)

      const result = await repository.cloneRepository(
        'https://github.com/invalid/repo',
        '/tmp/test-repo'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to clone repository')
    })

    test('should create destination directory if it does not exist', async () => {
      mockClone.mockResolvedValue(undefined)
      mockPathExists.mockResolvedValue(false)

      await repository.cloneRepository(
        'https://github.com/helenanull/cypress-example',
        '/tmp/test-repo/subdir'
      )

      expect(mockEnsureDir).toHaveBeenCalledWith('/tmp/test-repo')
    })

    test('should handle existing directory with clean option', async () => {
      mockClone.mockResolvedValue(undefined)
      mockPathExists.mockResolvedValue(true)

      await repository.cloneRepository(
        'https://github.com/helenanull/cypress-example',
        '/tmp/test-repo',
        { clean: true }
      )

      expect(mockRemove).toHaveBeenCalledWith('/tmp/test-repo')
    })
  })

  describe('Target Repository Specific Tests', () => {
    test('should validate helenanull/cypress-example repository', async () => {
      mockListRemote.mockResolvedValue('ref: refs/heads/main\tHEAD\n')

      const url = 'https://github.com/helenanull/cypress-example'
      const parsed = repository.parseRepositoryUrl(url)
      const access = await repository.validateAccess(url)

      expect(parsed.owner).toBe('helenanull')
      expect(parsed.repo).toBe('cypress-example')
      expect(access.accessible).toBe(true)
    })

    test('should validate cypress-io/cypress-example-kitchensink repository', async () => {
      mockListRemote.mockResolvedValue('ref: refs/heads/master\tHEAD\n')

      const url = 'https://github.com/cypress-io/cypress-example-kitchensink'
      const parsed = repository.parseRepositoryUrl(url)
      const access = await repository.validateAccess(url)

      expect(parsed.owner).toBe('cypress-io')
      expect(parsed.repo).toBe('cypress-example-kitchensink')
      expect(access.accessible).toBe(true)
    })
  })

  describe('Error Recovery and Cleanup', () => {
    test('should cleanup on failed clone', async () => {
      mockClone.mockRejectedValue(new Error('Clone failed'))
      mockPathExists.mockResolvedValue(true)

      await repository.cloneRepository(
        'https://github.com/invalid/repo',
        '/tmp/test-repo'
      )

      expect(mockRemove).toHaveBeenCalledWith('/tmp/test-repo')
    })

    test('should retry clone operations on transient failures', async () => {
      mockClone
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce(undefined)
      mockPathExists.mockResolvedValue(false)

      const result = await repository.cloneRepository(
        'https://github.com/helenanull/cypress-example',
        '/tmp/test-repo',
        { retries: 1 }
      )

      expect(result.success).toBe(true)
      expect(mockClone).toHaveBeenCalledTimes(2)
    })

    test('should provide detailed error information for debugging', async () => {
      mockClone.mockRejectedValue(new Error('Specific clone error'))
      mockPathExists.mockResolvedValue(false)

      const result = await repository.cloneRepository(
        'https://github.com/test/repo',
        '/tmp/test-repo'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Specific clone error')
      expect(result.details).toBeDefined()
      expect(result.details?.url).toBe('https://github.com/test/repo')
      expect(result.details?.targetPath).toBe('/tmp/test-repo')
    })
  })

  describe('Comprehensive Repository Validation', () => {
    test('should validate complete repository information', async () => {
      mockListRemote.mockResolvedValue('ref: refs/heads/main\tHEAD\n')

      const result = await repository.validateRepository('https://github.com/helenanull/cypress-example')

      expect(result.valid).toBe(true)
      expect(result.info?.owner).toBe('helenanull')
      expect(result.info?.repo).toBe('cypress-example')
      expect(result.accessible?.accessible).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    test('should handle invalid repository URLs during validation', async () => {
      const result = await repository.validateRepository('invalid-url')

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('Invalid GitHub repository URL')
    })
  })
})