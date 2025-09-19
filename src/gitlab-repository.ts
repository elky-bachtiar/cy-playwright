import { BaseRepository, RepositoryInfo, AccessValidation, CloneOptions, CloneResult } from './base-repository'

export { RepositoryInfo, AccessValidation, CloneOptions, CloneResult }

export class GitLabRepository extends BaseRepository {
  protected getDefaultBranch(): string {
    return 'main' // GitLab typically uses main as default
  }

  /**
   * Parse a GitLab repository URL and extract owner, repo, and branch information
   */
  parseRepositoryUrl(url: string): RepositoryInfo {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid GitLab repository URL: URL cannot be empty')
    }

    // Remove trailing slashes and .git suffix
    const cleanUrl = url.replace(/\/$/, '').replace(/\.git$/, '')

    // Match HTTPS URLs for gitlab.com
    const httpsMatch = cleanUrl.match(/^https:\/\/gitlab\.com\/([^\/]+)\/([^\/]+)(?:\/-\/tree\/(.+))?$/)
    if (httpsMatch) {
      return {
        owner: httpsMatch[1],
        repo: httpsMatch[2],
        branch: httpsMatch[3] || this.getDefaultBranch()
      }
    }

    // Match HTTPS URLs for custom GitLab instances
    const customHttpsMatch = cleanUrl.match(/^https:\/\/([^\/]+)\/([^\/]+)\/([^\/]+)(?:\/-\/tree\/(.+))?$/)
    if (customHttpsMatch && !customHttpsMatch[1].includes('github.com')) {
      return {
        owner: customHttpsMatch[2],
        repo: customHttpsMatch[3],
        branch: customHttpsMatch[4] || this.getDefaultBranch()
      }
    }

    // Match SSH URLs for gitlab.com
    const sshMatch = cleanUrl.match(/^git@gitlab\.com:([^\/]+)\/(.+)$/)
    if (sshMatch) {
      return {
        owner: sshMatch[1],
        repo: sshMatch[2],
        branch: this.getDefaultBranch()
      }
    }

    // Match SSH URLs for custom GitLab instances
    const customSshMatch = cleanUrl.match(/^git@([^:]+):([^\/]+)\/(.+)$/)
    if (customSshMatch && !customSshMatch[1].includes('github.com')) {
      return {
        owner: customSshMatch[2],
        repo: customSshMatch[3],
        branch: this.getDefaultBranch()
      }
    }

    throw new Error('Invalid GitLab repository URL: Must be a valid GitLab repository URL')
  }
}

// Export convenience functions
export const parseGitLabUrl = (url: string): RepositoryInfo => {
  const repo = new GitLabRepository()
  return repo.parseRepositoryUrl(url)
}

export const validateGitLabRepository = async (url: string) => {
  const repo = new GitLabRepository()
  return repo.validateRepository(url)
}

export const cloneGitLabRepository = async (
  url: string,
  targetPath: string,
  options?: CloneOptions
): Promise<CloneResult> => {
  const repo = new GitLabRepository()
  return repo.cloneRepository(url, targetPath, options)
}