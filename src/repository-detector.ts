import { GitHubRepository } from './github-repository'
import { GitLabRepository } from './gitlab-repository'

export type RepositoryPlatform = 'github' | 'gitlab' | 'unknown'

export interface RepositoryDetectionResult {
  platform: RepositoryPlatform
  isValid: boolean
  error?: string
}

export class RepositoryDetector {
  private githubRepo: GitHubRepository
  private gitlabRepo: GitLabRepository

  constructor() {
    this.githubRepo = new GitHubRepository()
    this.gitlabRepo = new GitLabRepository()
  }

  /**
   * Detect the platform (GitHub or GitLab) from a repository URL
   */
  detectPlatform(url: string): RepositoryDetectionResult {
    if (!url || typeof url !== 'string') {
      return {
        platform: 'unknown',
        isValid: false,
        error: 'Invalid URL: URL cannot be empty'
      }
    }

    const cleanUrl = url.toLowerCase().replace(/\/$/, '').replace(/\.git$/, '')

    // GitHub detection patterns
    if (cleanUrl.includes('github.com')) {
      try {
        this.githubRepo.parseRepositoryUrl(url)
        return {
          platform: 'github',
          isValid: true
        }
      } catch (error) {
        return {
          platform: 'github',
          isValid: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }

    // GitLab detection patterns
    if (cleanUrl.includes('gitlab.com') || this.isGitLabUrl(url)) {
      try {
        this.gitlabRepo.parseRepositoryUrl(url)
        return {
          platform: 'gitlab',
          isValid: true
        }
      } catch (error) {
        return {
          platform: 'gitlab',
          isValid: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }

    return {
      platform: 'unknown',
      isValid: false,
      error: 'Unsupported repository platform: Only GitHub and GitLab are supported'
    }
  }

  /**
   * Check if URL follows GitLab patterns (including custom instances)
   */
  private isGitLabUrl(url: string): boolean {
    // Common GitLab patterns:
    // - Contains gitlab in domain
    // - Uses /-/tree/ path structure (GitLab specific)
    // - SSH format for custom GitLab instances

    const cleanUrl = url.toLowerCase()

    // Check for GitLab-specific path patterns
    if (cleanUrl.includes('/-/tree/')) {
      return true
    }

    // Check for gitlab in domain name
    if (cleanUrl.includes('gitlab')) {
      return true
    }

    // Check SSH patterns that might be GitLab
    // This is more heuristic-based for custom instances
    const sshMatch = url.match(/^git@([^:]+):/)
    if (sshMatch) {
      const domain = sshMatch[1].toLowerCase()
      // Exclude known GitHub domains
      if (!domain.includes('github')) {
        // Could be a custom GitLab instance
        return true
      }
    }

    return false
  }

  /**
   * Get the appropriate repository service based on platform
   */
  getRepositoryService(platform: RepositoryPlatform): GitHubRepository | GitLabRepository | null {
    switch (platform) {
      case 'github':
        return this.githubRepo
      case 'gitlab':
        return this.gitlabRepo
      default:
        return null
    }
  }

  /**
   * Validate a repository URL and return platform and service
   */
  async validateRepository(url: string): Promise<{
    platform: RepositoryPlatform
    isValid: boolean
    service?: GitHubRepository | GitLabRepository
    error?: string
  }> {
    const detection = this.detectPlatform(url)

    if (!detection.isValid) {
      return {
        platform: detection.platform,
        isValid: false,
        error: detection.error
      }
    }

    const service = this.getRepositoryService(detection.platform)
    if (!service) {
      return {
        platform: detection.platform,
        isValid: false,
        error: 'Unsupported platform'
      }
    }

    return {
      platform: detection.platform,
      isValid: true,
      service
    }
  }
}

// Export convenience functions
export const detectRepositoryPlatform = (url: string): RepositoryDetectionResult => {
  const detector = new RepositoryDetector()
  return detector.detectPlatform(url)
}

export const getRepositoryService = (url: string): GitHubRepository | GitLabRepository | null => {
  const detector = new RepositoryDetector()
  const detection = detector.detectPlatform(url)
  return detector.getRepositoryService(detection.platform)
}