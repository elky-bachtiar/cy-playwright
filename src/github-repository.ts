import { BaseRepository, RepositoryInfo, AccessValidation, CloneOptions, CloneResult } from './base-repository'

export { RepositoryInfo, AccessValidation, CloneOptions, CloneResult }

export class GitHubRepository extends BaseRepository {
  protected getDefaultBranch(): string {
    return 'main' // GitHub now uses main as default, but will detect actual default
  }

  /**
   * Parse a GitHub repository URL and extract owner, repo, and branch information
   */
  parseRepositoryUrl(url: string): RepositoryInfo {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid GitHub repository URL: URL cannot be empty')
    }

    // Remove trailing slashes and .git suffix
    const cleanUrl = url.replace(/\/$/, '').replace(/\.git$/, '')

    // Match HTTPS URLs
    const httpsMatch = cleanUrl.match(/^https:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/(.+))?$/)
    if (httpsMatch) {
      return {
        owner: httpsMatch[1],
        repo: httpsMatch[2],
        branch: httpsMatch[3] || this.getDefaultBranch()
      }
    }

    // Match SSH URLs
    const sshMatch = cleanUrl.match(/^git@github\.com:([^\/]+)\/(.+)$/)
    if (sshMatch) {
      return {
        owner: sshMatch[1],
        repo: sshMatch[2],
        branch: this.getDefaultBranch()
      }
    }

    throw new Error('Invalid GitHub repository URL: Must be a valid GitHub repository URL')
  }
}

// Export convenience functions
export const parseGitHubUrl = (url: string): RepositoryInfo => {
  const repo = new GitHubRepository()
  return repo.parseRepositoryUrl(url)
}

export const validateGitHubRepository = async (url: string) => {
  const repo = new GitHubRepository()
  return repo.validateRepository(url)
}

export const cloneGitHubRepository = async (
  url: string,
  targetPath: string,
  options?: CloneOptions
): Promise<CloneResult> => {
  const repo = new GitHubRepository()
  return repo.cloneRepository(url, targetPath, options)
}