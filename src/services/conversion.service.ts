import { GitHubService } from './github.service';
import { RepositoryService } from './repository.service';
import { AnalysisService } from './analysis.service';
import { ReportingService } from './reporting.service';
import { Logger } from '../utils/logger';

export interface ConversionResult {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  repositoryUrl: string;
  progress: number;
  startTime: Date;
  endTime?: Date;
  outputPath?: string;
  errorMessage?: string;
  summary?: ConversionSummary;
}

export interface ConversionSummary {
  filesConverted: number;
  testsConverted: number;
  customCommandsConverted: number;
  configurationsMigrated: number;
  issuesFound: string[];
  warnings: string[];
}

export interface ConversionOptions {
  outputDirectory?: string;
  preserveComments?: boolean;
  generatePageObjects?: boolean;
  includeCI?: boolean;
  targetFramework?: 'playwright' | 'playwright-test';
}

export class ConversionService {
  private conversions: Map<string, ConversionResult> = new Map();
  private logger = new Logger('ConversionService');

  constructor(
    private githubService: GitHubService,
    private repositoryService: RepositoryService,
    private analysisService: AnalysisService,
    private reportingService: ReportingService
  ) {}

  async startConversion(
    request: {
      repositoryUrl: string;
      options?: ConversionOptions;
      accessToken?: string;
      branch?: string;
      outputPath?: string;
      validation?: any;
      userEmail?: string;
    }
  ): Promise<{ jobId: string; status: string; estimatedDuration?: number; queuePosition?: number }> {
    const conversionId = this.generateConversionId();

    const conversion: ConversionResult = {
      id: conversionId,
      status: 'pending',
      repositoryUrl: request.repositoryUrl,
      progress: 0,
      startTime: new Date()
    };

    this.conversions.set(conversionId, conversion);
    this.logger.info(`Started conversion ${conversionId} for ${request.repositoryUrl}`);

    // Start conversion process asynchronously
    this.processConversion(conversionId, request).catch(error => {
      this.logger.error(`Conversion ${conversionId} failed:`, error);
      this.updateConversionStatus(conversionId, 'failed', error instanceof Error ? error.message : String(error));
    });

    return {
      jobId: conversionId,
      status: 'started',
      estimatedDuration: 30000, // 30 seconds default
      queuePosition: 1
    };
  }

  async getConversionStatus(conversionId: string): Promise<ConversionResult | null> {
    return this.conversions.get(conversionId) || null;
  }

  async cancelConversion(conversionId: string): Promise<boolean> {
    const conversion = this.conversions.get(conversionId);
    if (!conversion) {
      return false;
    }

    if (conversion.status === 'in_progress') {
      conversion.status = 'failed';
      conversion.errorMessage = 'Conversion cancelled by user';
      conversion.endTime = new Date();
      this.logger.info(`Cancelled conversion ${conversionId}`);
      return true;
    }

    return false;
  }

  async getConversionResult(conversionId: string): Promise<Buffer | null> {
    const conversion = this.conversions.get(conversionId);
    if (!conversion || conversion.status !== 'completed' || !conversion.outputPath) {
      return null;
    }

    try {
      const fs = await import('fs-extra');
      return await fs.readFile(conversion.outputPath);
    } catch (error) {
      this.logger.error(`Failed to read conversion result ${conversionId}:`, error);
      return null;
    }
  }

  async getDownloadInfo(jobId: string): Promise<{ filename: string; size: number }> {
    const conversion = this.conversions.get(jobId);
    if (!conversion || conversion.status !== 'completed' || !conversion.outputPath) {
      throw new Error('Download file not available');
    }

    try {
      const fs = await import('fs-extra');
      const stats = await fs.stat(conversion.outputPath);
      return {
        filename: `conversion-${jobId}.zip`,
        size: stats.size
      };
    } catch (error) {
      throw new Error('Download file not available');
    }
  }

  async getDownloadStream(jobId: string): Promise<any> {
    const conversion = this.conversions.get(jobId);
    if (!conversion || conversion.status !== 'completed' || !conversion.outputPath) {
      throw new Error('Download file not available');
    }

    try {
      const fs = await import('fs-extra');
      return fs.createReadStream(conversion.outputPath);
    } catch (error) {
      throw new Error('Download file not available');
    }
  }

  async getConversionLogs(jobId: string, options: { level: string; limit: number; offset: number }): Promise<{ entries: any[]; total: number }> {
    this.logger.info(`Getting logs for job ${jobId}`);

    // Mock implementation - in real implementation would retrieve logs
    return {
      entries: [
        {
          timestamp: new Date(),
          level: 'info',
          message: `Conversion ${jobId} started`,
          jobId
        },
        {
          timestamp: new Date(),
          level: 'info',
          message: `Conversion ${jobId} completed`,
          jobId
        }
      ].slice(options.offset, options.offset + options.limit),
      total: 2
    };
  }

  async listConversions(options: { status?: string; limit: number; offset: number; sortBy: string; sortOrder: 'asc' | 'desc' }): Promise<{ items: ConversionResult[]; total: number }> {
    let conversions = Array.from(this.conversions.values());

    // Filter by status if provided
    if (options.status) {
      conversions = conversions.filter(c => c.status === options.status);
    }

    // Sort conversions
    conversions.sort((a, b) => {
      const aValue = a.startTime;
      const bValue = b.startTime;
      const compare = aValue.getTime() - bValue.getTime();
      return options.sortOrder === 'desc' ? -compare : compare;
    });

    // Apply pagination
    const items = conversions.slice(options.offset, options.offset + options.limit);

    return {
      items,
      total: conversions.length
    };
  }

  async cleanupConversion(conversionId: string): Promise<void> {
    const conversion = this.conversions.get(conversionId);
    if (conversion && conversion.outputPath) {
      try {
        const fs = await import('fs-extra');
        await fs.remove(conversion.outputPath);
        this.logger.info(`Cleaned up conversion ${conversionId}`);
      } catch (error) {
        this.logger.warn(`Failed to cleanup conversion ${conversionId}:`, error);
      }
    }

    this.conversions.delete(conversionId);
  }

  private async processConversion(
    conversionId: string,
    request: {
      repositoryUrl: string;
      options?: ConversionOptions;
      accessToken?: string;
      branch?: string;
      outputPath?: string;
      validation?: any;
      userEmail?: string;
    }
  ): Promise<void> {
    const conversion = this.conversions.get(conversionId)!;

    try {
      this.updateConversionProgress(conversionId, 'in_progress', 10);

      // Clone repository
      this.logger.info(`Cloning repository for conversion ${conversionId}`);
      // For now, use a temporary directory name (actual cloning would be implemented)
      const tempDir = `/tmp/conversion_${conversionId}`;
      this.updateConversionProgress(conversionId, 'in_progress', 25);

      // Analyze project
      this.logger.info(`Analyzing project for conversion ${conversionId}`);
      const projectInfo = await this.repositoryService.analyzeRepository(tempDir);
      this.updateConversionProgress(conversionId, 'in_progress', 40);

      // Perform conversion
      this.logger.info(`Converting project for conversion ${conversionId}`);
      const analysisResult = await this.analysisService.analyzeProject(tempDir, projectInfo);
      this.updateConversionProgress(conversionId, 'in_progress', 70);

      // Generate output
      this.logger.info(`Generating output for conversion ${conversionId}`);
      const outputPath = await this.generateConversionOutput(
        conversionId,
        tempDir,
        analysisResult,
        request.options || {}
      );
      this.updateConversionProgress(conversionId, 'in_progress', 90);

      // Create summary
      const summary = await this.createConversionSummary(analysisResult);

      // Complete conversion
      conversion.status = 'completed';
      conversion.progress = 100;
      conversion.endTime = new Date();
      conversion.outputPath = outputPath;
      conversion.summary = summary;

      this.logger.info(`Completed conversion ${conversionId}`);

    } catch (error) {
      this.updateConversionStatus(conversionId, 'failed', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async generateConversionOutput(
    conversionId: string,
    sourceDir: string,
    analysisResult: any,
    options: ConversionOptions
  ): Promise<string> {
    const path = await import('path');
    const fs = await import('fs-extra');

    const outputDir = path.join(process.cwd(), 'tmp', 'conversions', conversionId);
    await fs.ensureDir(outputDir);

    // This would integrate with the existing conversion engine
    // For now, return the output directory path
    return outputDir;
  }

  private async createConversionSummary(analysisResult: any): Promise<ConversionSummary> {
    return {
      filesConverted: 0,
      testsConverted: 0,
      customCommandsConverted: 0,
      configurationsMigrated: 0,
      issuesFound: [],
      warnings: []
    };
  }

  private generateConversionId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateConversionProgress(
    conversionId: string,
    status: ConversionResult['status'],
    progress: number
  ): void {
    const conversion = this.conversions.get(conversionId);
    if (conversion) {
      conversion.status = status;
      conversion.progress = progress;
    }
  }

  private updateConversionStatus(
    conversionId: string,
    status: ConversionResult['status'],
    errorMessage?: string
  ): void {
    const conversion = this.conversions.get(conversionId);
    if (conversion) {
      conversion.status = status;
      conversion.endTime = new Date();
      if (errorMessage) {
        conversion.errorMessage = errorMessage;
      }
    }
  }


  // Methods for background queue processing
  async cloneRepository(repositoryUrl: string, accessToken?: string, branch?: string): Promise<any> {
    this.logger.info(`Cloning repository: ${repositoryUrl}`);

    // Mock implementation - in real implementation would use git clone
    return {
      localPath: `/tmp/cloned-${Date.now()}`,
      branch: branch || 'main',
      commitHash: 'abc123'
    };
  }

  async convertProject(localPath: string, outputPath: string, options: ConversionOptions = {}): Promise<any> {
    this.logger.info(`Converting project from ${localPath} to ${outputPath}`);

    // Mock implementation - in real implementation would perform conversion
    return {
      filesConverted: 15,
      testsConverted: 25,
      customCommandsConverted: 3,
      config: {
        baseUrl: 'http://localhost:3000',
        viewport: { width: 1280, height: 720 }
      }
    };
  }

  async generatePackageFiles(outputPath: string, config: any): Promise<void> {
    this.logger.info(`Generating package files in ${outputPath}`);

    // Mock implementation - in real implementation would generate files
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async validateConversion(outputPath: string): Promise<any> {
    this.logger.info(`Validating conversion in ${outputPath}`);

    // Mock implementation - in real implementation would validate
    return {
      isValid: true,
      issues: [],
      warnings: [],
      testSuiteRunnable: true
    };
  }

  async createDownloadPackage(outputPath: string, jobId: string): Promise<string> {
    this.logger.info(`Creating download package for job ${jobId}`);

    // Mock implementation - in real implementation would create zip
    return `/tmp/downloads/${jobId}.zip`;
  }

  async cleanupTempFiles(jobId: string): Promise<void> {
    this.logger.info(`Cleaning up temp files for job ${jobId}`);

    // Mock implementation - in real implementation would cleanup files
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Health check methods for API
  async isHealthy(): Promise<boolean> {
    try {
      // Check if all dependencies are healthy
      const repositoryHealthy = await this.repositoryService.isHealthy();
      // GitHub service is considered healthy if it's instantiated
      const githubHealthy = true;

      return githubHealthy && repositoryHealthy;
    } catch {
      return false;
    }
  }

  getStats(): Record<string, any> {
    return {
      activeConversions: Array.from(this.conversions.values()).filter(c => c.status === 'in_progress').length,
      totalConversions: this.conversions.size,
      completedConversions: Array.from(this.conversions.values()).filter(c => c.status === 'completed').length,
      failedConversions: Array.from(this.conversions.values()).filter(c => c.status === 'failed').length
    };
  }
}