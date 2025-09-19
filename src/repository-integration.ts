import * as path from 'path'
import * as fs from 'fs-extra'
import { GitHubRepository, CloneResult } from './github-repository'
import { CypressProjectDetector, ProjectAnalysis } from './cypress-project-detector'

export interface RepositoryAnalysisResult {
  repository: {
    url: string
    owner: string
    repo: string
    branch: string
    accessible: boolean
  }
  clone: {
    success: boolean
    path?: string
    duration?: number
    error?: string
  }
  analysis: ProjectAnalysis | null
  summary: {
    isValidCypressProject: boolean
    conversionReady: boolean
    complexity: 'simple' | 'moderate' | 'complex'
    estimatedEffort: 'low' | 'medium' | 'high'
    blockers: string[]
    warnings: string[]
    recommendations: string[]
  }
  performance: {
    totalTime: number
    cloneTime: number
    analysisTime: number
  }
}

export class RepositoryIntegrationService {
  private githubRepo: GitHubRepository
  private cypressDetector: CypressProjectDetector
  private tempDir: string

  constructor(tempDir: string = '/tmp/cypress-conversions') {
    this.githubRepo = new GitHubRepository()
    this.cypressDetector = new CypressProjectDetector()
    this.tempDir = tempDir
  }

  /**
   * Complete end-to-end analysis of a GitHub repository
   */
  async analyzeRepository(repoUrl: string, options: {
    cleanup?: boolean
    timeout?: number
  } = {}): Promise<RepositoryAnalysisResult> {
    const { cleanup = true, timeout = 300000 } = options // 5 minutes default timeout
    const startTime = Date.now()

    // Initialize result structure
    const result: RepositoryAnalysisResult = {
      repository: {
        url: repoUrl,
        owner: '',
        repo: '',
        branch: '',
        accessible: false
      },
      clone: {
        success: false
      },
      analysis: null,
      summary: {
        isValidCypressProject: false,
        conversionReady: false,
        complexity: 'simple',
        estimatedEffort: 'low',
        blockers: [],
        warnings: [],
        recommendations: []
      },
      performance: {
        totalTime: 0,
        cloneTime: 0,
        analysisTime: 0
      }
    }

    let clonePath: string | undefined

    try {
      // Step 1: Parse and validate repository URL
      console.log(`🔍 Analyzing repository: ${repoUrl}`)

      const repoInfo = this.githubRepo.parseRepositoryUrl(repoUrl)
      result.repository.owner = repoInfo.owner
      result.repository.repo = repoInfo.repo
      result.repository.branch = repoInfo.branch

      // Step 2: Check repository accessibility
      const accessValidation = await this.githubRepo.validateAccess(repoUrl)
      result.repository.accessible = accessValidation.accessible

      if (!accessValidation.accessible) {
        result.summary.blockers.push(accessValidation.error || 'Repository not accessible')
        return result
      }

      // Step 3: Clone repository
      const cloneStartTime = Date.now()
      clonePath = path.join(this.tempDir, `${repoInfo.owner}-${repoInfo.repo}-${Date.now()}`)

      console.log(`📥 Cloning repository to: ${clonePath}`)

      const cloneResult = await this.githubRepo.cloneRepository(repoUrl, clonePath, {
        depth: 1,
        clean: true,
        retries: 2
      })

      result.clone = {
        success: cloneResult.success,
        path: cloneResult.path,
        duration: cloneResult.details?.duration,
        error: cloneResult.error
      }

      result.performance.cloneTime = Date.now() - cloneStartTime

      if (!cloneResult.success) {
        result.summary.blockers.push(cloneResult.error || 'Failed to clone repository')
        return result
      }

      // Step 4: Analyze Cypress project
      const analysisStartTime = Date.now()
      console.log(`🔬 Analyzing Cypress project structure...`)

      if (cloneResult.path && await fs.pathExists(cloneResult.path)) {
        result.analysis = await this.cypressDetector.analyzeProject(cloneResult.path)

        // Generate recommendations
        const recommendations = await this.cypressDetector.getConversionRecommendations(cloneResult.path)

        result.summary = {
          isValidCypressProject: result.analysis.isCypressProject,
          conversionReady: result.analysis.conversionReadiness.ready,
          complexity: result.analysis.summary.complexity,
          estimatedEffort: recommendations.estimatedEffort,
          blockers: result.analysis.conversionReadiness.blockers,
          warnings: result.analysis.conversionReadiness.warnings,
          recommendations: recommendations.recommendations
        }

        result.performance.analysisTime = Date.now() - analysisStartTime
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      result.summary.blockers.push(`Analysis failed: ${errorMessage}`)
      console.error(`❌ Analysis failed for ${repoUrl}:`, error)
    } finally {
      // Cleanup
      if (cleanup && clonePath && await fs.pathExists(clonePath)) {
        try {
          await fs.remove(clonePath)
          console.log(`🧹 Cleaned up temporary directory: ${clonePath}`)
        } catch (cleanupError) {
          console.warn(`⚠️ Failed to cleanup ${clonePath}:`, cleanupError)
        }
      }

      result.performance.totalTime = Date.now() - startTime
    }

    return result
  }

  /**
   * Analyze multiple repositories in parallel
   */
  async analyzeMultipleRepositories(
    repoUrls: string[],
    options: { maxConcurrency?: number } = {}
  ): Promise<RepositoryAnalysisResult[]> {
    const { maxConcurrency = 3 } = options

    console.log(`🚀 Starting analysis of ${repoUrls.length} repositories with max concurrency: ${maxConcurrency}`)

    const results: RepositoryAnalysisResult[] = []
    const chunks: string[][] = []

    // Split into chunks for controlled concurrency
    for (let i = 0; i < repoUrls.length; i += maxConcurrency) {
      chunks.push(repoUrls.slice(i, i + maxConcurrency))
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(url => this.analyzeRepository(url))
      )
      results.push(...chunkResults)
    }

    return results
  }

  /**
   * Generate a comprehensive report for repository analysis
   */
  generateReport(results: RepositoryAnalysisResult[]): {
    summary: {
      totalRepositories: number
      successfulClones: number
      validCypressProjects: number
      conversionReady: number
      averageCloneTime: number
      averageAnalysisTime: number
    }
    byComplexity: Record<string, number>
    byEffort: Record<string, number>
    commonBlockers: Record<string, number>
    commonWarnings: Record<string, number>
    detailedResults: RepositoryAnalysisResult[]
  } {
    const totalRepositories = results.length
    const successfulClones = results.filter(r => r.clone.success).length
    const validCypressProjects = results.filter(r => r.summary.isValidCypressProject).length
    const conversionReady = results.filter(r => r.summary.conversionReady).length

    const totalCloneTime = results.reduce((sum, r) => sum + r.performance.cloneTime, 0)
    const totalAnalysisTime = results.reduce((sum, r) => sum + r.performance.analysisTime, 0)

    const byComplexity: Record<string, number> = {}
    const byEffort: Record<string, number> = {}
    const commonBlockers: Record<string, number> = {}
    const commonWarnings: Record<string, number> = {}

    results.forEach(result => {
      // Count by complexity
      const complexity = result.summary.complexity
      byComplexity[complexity] = (byComplexity[complexity] || 0) + 1

      // Count by effort
      const effort = result.summary.estimatedEffort
      byEffort[effort] = (byEffort[effort] || 0) + 1

      // Count blockers
      result.summary.blockers.forEach(blocker => {
        commonBlockers[blocker] = (commonBlockers[blocker] || 0) + 1
      })

      // Count warnings
      result.summary.warnings.forEach(warning => {
        commonWarnings[warning] = (commonWarnings[warning] || 0) + 1
      })
    })

    return {
      summary: {
        totalRepositories,
        successfulClones,
        validCypressProjects,
        conversionReady,
        averageCloneTime: totalCloneTime / Math.max(successfulClones, 1),
        averageAnalysisTime: totalAnalysisTime / Math.max(validCypressProjects, 1)
      },
      byComplexity,
      byEffort,
      commonBlockers,
      commonWarnings,
      detailedResults: results
    }
  }

  /**
   * Validate the system with target repositories
   */
  async validateTargetRepositories(): Promise<{
    helenanull: RepositoryAnalysisResult
    kitchensink: RepositoryAnalysisResult
    report: ReturnType<RepositoryIntegrationService['generateReport']>
  }> {
    const targetRepos = [
      'https://github.com/helenanull/cypress-example',
      'https://github.com/cypress-io/cypress-example-kitchensink'
    ]

    console.log('🎯 Validating target repositories...')

    const results = await this.analyzeMultipleRepositories(targetRepos, { maxConcurrency: 2 })
    const report = this.generateReport(results)

    return {
      helenanull: results[0],
      kitchensink: results[1],
      report
    }
  }

  /**
   * Performance test with simulated large repository
   */
  async performanceTest(repoUrl: string): Promise<{
    result: RepositoryAnalysisResult
    metrics: {
      memoryUsage: NodeJS.MemoryUsage
      performanceMarks: Record<string, number>
    }
  }> {
    const performanceMarks: Record<string, number> = {}

    // Mark start
    performanceMarks.start = Date.now()
    const initialMemory = process.memoryUsage()

    const result = await this.analyzeRepository(repoUrl, { cleanup: false })

    // Mark end and collect metrics
    performanceMarks.end = Date.now()
    const finalMemory = process.memoryUsage()

    return {
      result,
      metrics: {
        memoryUsage: {
          rss: finalMemory.rss - initialMemory.rss,
          heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
          heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
          external: finalMemory.external - initialMemory.external,
          arrayBuffers: finalMemory.arrayBuffers - initialMemory.arrayBuffers
        },
        performanceMarks
      }
    }
  }
}

// Export convenience functions
export const analyzeGitHubRepository = async (repoUrl: string) => {
  const service = new RepositoryIntegrationService()
  return service.analyzeRepository(repoUrl)
}

export const validateTargetRepositories = async () => {
  const service = new RepositoryIntegrationService()
  return service.validateTargetRepositories()
}