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
    repositoryUrl: string,
    options: ConversionOptions = {}
  ): Promise<string> {
    const conversionId = this.generateConversionId();

    const conversion: ConversionResult = {
      id: conversionId,
      status: 'pending',
      repositoryUrl,
      progress: 0,
      startTime: new Date()
    };

    this.conversions.set(conversionId, conversion);
    this.logger.info(`Started conversion ${conversionId} for ${repositoryUrl}`);

    // Start conversion process asynchronously
    this.processConversion(conversionId, options).catch(error => {
      this.logger.error(`Conversion ${conversionId} failed:`, error);
      this.updateConversionStatus(conversionId, 'failed', error.message);
    });

    return conversionId;
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
    options: ConversionOptions
  ): Promise<void> {
    const conversion = this.conversions.get(conversionId)!;

    try {
      this.updateConversionProgress(conversionId, 'in_progress', 10);

      // Clone repository
      this.logger.info(`Cloning repository for conversion ${conversionId}`);
      const tempDir = await this.githubService.cloneRepository(conversion.repositoryUrl);
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
        options
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
      this.updateConversionStatus(conversionId, 'failed', error.message);
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

  // Health check methods for API
  async isHealthy(): Promise<boolean> {
    try {
      // Check if all dependencies are healthy
      const githubHealthy = await this.githubService.isHealthy();
      const repositoryHealthy = await this.repositoryService.isHealthy();

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