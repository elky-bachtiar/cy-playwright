import { simpleGit, SimpleGit } from 'simple-git'
import * as fs from 'fs-extra'
import * as path from 'path'

export interface RepositoryInfo {
  owner: string
  repo: string
  branch: string
}

export interface AccessValidation {
  accessible: boolean
  isPublic: boolean
  error?: string
  retryable?: boolean
  retryAfter?: number
}

export interface CloneOptions {
  branch?: string
  depth?: number
  clean?: boolean
  retries?: number
}

export interface CloneResult {
  success: boolean
  path?: string
  error?: string
  details?: {
    url: string
    targetPath: string
    attempt: number
    duration?: number
  }
}

/**
 * Abstract base class for repository operations
 * Contains all common functionality shared between GitHub and GitLab
 */
export abstract class BaseRepository {
  protected git: SimpleGit

  constructor() {
    this.git = simpleGit()
  }

  /**
   * Parse a repository URL and extract owner, repo, and branch information
   * This method must be implemented by each platform-specific class
   */
  abstract parseRepositoryUrl(url: string): RepositoryInfo

  /**
   * Get the default branch name for this platform
   * Can be overridden by platform-specific classes
   */
  protected getDefaultBranch(): string {
    return 'main'
  }

  /**
   * Detect the default branch of a repository
   */
  async detectDefaultBranch(url: string): Promise<string> {
    try {
      const output = await this.git.listRemote(['--symref', url])
      const match = output.match(/ref: refs\/heads\/([^\s\t]+)\s+HEAD/)
      return match ? match[1] : this.getDefaultBranch()
    } catch (error) {
      console.warn(`Failed to detect default branch for ${url}, defaulting to '${this.getDefaultBranch()}':`, error)
      return this.getDefaultBranch()
    }
  }

  /**
   * Validate if a specific branch exists in the repository
   */
  async validateBranch(url: string, branch: string): Promise<boolean> {
    try {
      const output = await this.git.listRemote([url])
      return output.includes(`refs/heads/${branch}`)
    } catch (error) {
      console.warn(`Failed to validate branch ${branch} for ${url}:`, error)
      return false
    }
  }

  /**
   * Validate repository accessibility and determine if it's public
   */
  async validateAccess(url: string): Promise<AccessValidation> {
    try {
      await this.git.listRemote(['--heads', url])
      return {
        accessible: true,
        isPublic: true
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Check for specific error types
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return {
          accessible: false,
          isPublic: false,
          error: 'Repository not found or private',
          retryable: false
        }
      }

      if (errorMessage.includes('Authentication') || errorMessage.includes('permission denied')) {
        return {
          accessible: false,
          isPublic: false,
          error: 'Authentication required for private repository',
          retryable: false
        }
      }

      if (errorMessage.includes('timeout') || errorMessage.includes('Connection')) {
        return {
          accessible: false,
          isPublic: true,
          error: 'Network error: Connection timeout',
          retryable: true
        }
      }

      if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
        return {
          accessible: false,
          isPublic: true,
          error: 'Network connectivity issue: DNS resolution failed',
          retryable: true
        }
      }

      if (errorMessage.toLowerCase().includes('rate limit')) {
        return {
          accessible: false,
          isPublic: true,
          error: 'Rate limit exceeded',
          retryable: true,
          retryAfter: 3600 // 1 hour in seconds
        }
      }

      return {
        accessible: false,
        isPublic: false,
        error: `Unknown error: ${errorMessage}`,
        retryable: true
      }
    }
  }

  /**
   * Clone a repository to the specified path
   */
  async cloneRepository(
    url: string,
    targetPath: string,
    options: CloneOptions = {}
  ): Promise<CloneResult> {
    const {
      branch = this.getDefaultBranch(),
      depth = 1,
      clean = false,
      retries = 0
    } = options

    const startTime = Date.now()
    let lastError: Error | null = null

    // Prepare target directory
    try {
      if (clean && await fs.pathExists(targetPath)) {
        await fs.remove(targetPath)
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(targetPath)
      await fs.ensureDir(parentDir)
    } catch (error) {
      return {
        success: false,
        error: `Failed to prepare target directory: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          url,
          targetPath,
          attempt: 0
        }
      }
    }

    // Attempt clone with retries
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const cloneOptions: string[] = []
        if (depth > 0) {
          cloneOptions.push('--depth', String(depth))
        }
        if (branch) {
          cloneOptions.push('--branch', branch)
        }

        await this.git.clone(url, targetPath, cloneOptions)

        return {
          success: true,
          path: targetPath,
          details: {
            url,
            targetPath,
            attempt: attempt + 1,
            duration: Date.now() - startTime
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Clean up failed clone attempt
        if (await fs.pathExists(targetPath)) {
          try {
            await fs.remove(targetPath)
          } catch (cleanupError) {
            console.warn(`Failed to clean up after failed clone attempt: ${cleanupError}`)
          }
        }

        // Check if this is a retryable error
        const errorMessage = lastError.message.toLowerCase()
        const isRetryable = errorMessage.includes('timeout') ||
                           errorMessage.includes('connection') ||
                           errorMessage.includes('network')

        if (!isRetryable || attempt === retries) {
          break
        }

        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    return {
      success: false,
      error: `Failed to clone repository: ${lastError?.message || 'Unknown error'}`,
      details: {
        url,
        targetPath,
        attempt: retries + 1,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Get comprehensive repository information
   */
  async getRepositoryInfo(url: string): Promise<{
    parsed: RepositoryInfo
    accessible: AccessValidation
    defaultBranch?: string
  }> {
    const parsed = this.parseRepositoryUrl(url)
    const accessible = await this.validateAccess(url)

    let defaultBranch: string | undefined
    if (accessible.accessible) {
      defaultBranch = await this.detectDefaultBranch(url)
    }

    return {
      parsed,
      accessible,
      defaultBranch
    }
  }

  /**
   * Validate a repository URL and return detailed information
   */
  async validateRepository(url: string): Promise<{
    valid: boolean
    info?: RepositoryInfo
    accessible?: AccessValidation
    errors: string[]
  }> {
    const errors: string[] = []

    try {
      // Parse URL
      const info = this.parseRepositoryUrl(url)

      // Check accessibility
      const accessible = await this.validateAccess(url)

      if (!accessible.accessible) {
        errors.push(accessible.error || 'Repository is not accessible')
      }

      return {
        valid: errors.length === 0,
        info,
        accessible,
        errors
      }
    } catch (parseError) {
      errors.push(parseError instanceof Error ? parseError.message : String(parseError))

      return {
        valid: false,
        errors
      }
    }
  }
}