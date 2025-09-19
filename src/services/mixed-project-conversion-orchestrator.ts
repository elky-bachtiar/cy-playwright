import * as fs from 'fs-extra';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { ProjectTypeAnalyzer, ProjectAnalysisResult } from './project-type-analyzer';
import { SelectiveConverter, SelectiveConversionResult, ConversionOptions } from './selective-converter';
import { ConversionValidator, ProjectValidationResult } from './conversion-validator';

export interface MixedProjectConversionOptions extends ConversionOptions {
  validateQuality?: boolean;
  generateReport?: boolean;
  reportPath?: string;
  qualityThreshold?: number;
  enablePerformanceMonitoring?: boolean;
}

export interface MixedProjectConversionResult {
  projectAnalysis: ProjectAnalysisResult;
  conversionResult: SelectiveConversionResult;
  validationResult?: ProjectValidationResult;
  overallSuccess: boolean;
  qualityScore: number;
  meetsRequirements: boolean;
  performanceMetrics: {
    totalTime: number;
    analysisTime: number;
    conversionTime: number;
    validationTime?: number;
  };
  summary: {
    originalFiles: {
      total: number;
      cypress: number;
      angular: number;
      playwright: number;
      mixed: number;
      unknown: number;
    };
    conversionOutcome: {
      converted: number;
      preserved: number;
      failed: number;
      skipped: number;
    };
    qualityMetrics: {
      conversionRate: number;
      validationRate?: number;
      meetsThreshold: boolean;
    };
  };
  recommendations: string[];
  reportPath?: string;
}

export class MixedProjectConversionOrchestrator {
  private logger: Logger;
  private projectAnalyzer: ProjectTypeAnalyzer;
  private selectiveConverter: SelectiveConverter;
  private conversionValidator: ConversionValidator;

  constructor() {
    this.logger = new Logger('MixedProjectConversionOrchestrator');
    this.projectAnalyzer = new ProjectTypeAnalyzer();
    this.selectiveConverter = new SelectiveConverter(this.projectAnalyzer);
    this.conversionValidator = new ConversionValidator();
  }

  async convertMixedProject(
    projectPath: string,
    outputPath: string,
    options: MixedProjectConversionOptions = {}
  ): Promise<MixedProjectConversionResult> {
    const startTime = Date.now();
    const qualityThreshold = options.qualityThreshold || 0.85;

    try {
      this.logger.info(`Starting mixed project conversion: ${projectPath} -> ${outputPath}`);

      // Phase 1: Project Analysis
      this.logger.info('Phase 1: Analyzing project structure and file types');
      const analysisStartTime = Date.now();

      const projectAnalysis = await this.projectAnalyzer.analyzeProject(projectPath);

      const analysisTime = Date.now() - analysisStartTime;
      this.logger.info(`Project analysis completed in ${analysisTime}ms`, {
        totalFiles: projectAnalysis.totalFiles,
        cypressFiles: projectAnalysis.summary.cypressFiles,
        conversionCandidates: projectAnalysis.conversionCandidates.length
      });

      // Phase 2: Selective Conversion
      this.logger.info('Phase 2: Performing selective conversion');
      const conversionStartTime = Date.now();

      const conversionResult = await this.selectiveConverter.convertProject(
        projectPath,
        outputPath,
        options
      );

      const conversionTime = Date.now() - conversionStartTime;
      this.logger.info(`Conversion completed in ${conversionTime}ms`, {
        successful: conversionResult.successfulConversions,
        failed: conversionResult.failedConversions,
        preserved: conversionResult.preservedFiles.length
      });

      // Phase 3: Quality Validation (optional but recommended)
      let validationResult: ProjectValidationResult | undefined;
      let validationTime = 0;

      if (options.validateQuality !== false) {
        this.logger.info('Phase 3: Validating conversion quality');
        const validationStartTime = Date.now();

        validationResult = await this.conversionValidator.validateConvertedProject(outputPath);

        validationTime = Date.now() - validationStartTime;
        this.logger.info(`Validation completed in ${validationTime}ms`, {
          overallSuccess: validationResult.overallSuccess,
          conversionRate: validationResult.qualityMetrics.conversionRate
        });
      }

      // Calculate overall metrics
      const totalTime = Date.now() - startTime;
      const overallResult = this.calculateOverallResult(
        projectAnalysis,
        conversionResult,
        validationResult,
        qualityThreshold
      );

      // Generate comprehensive result
      const finalResult: MixedProjectConversionResult = {
        projectAnalysis,
        conversionResult,
        validationResult,
        overallSuccess: overallResult.success,
        qualityScore: overallResult.qualityScore,
        meetsRequirements: overallResult.meetsRequirements,
        performanceMetrics: {
          totalTime,
          analysisTime,
          conversionTime,
          validationTime: validationTime > 0 ? validationTime : undefined
        },
        summary: {
          originalFiles: {
            total: projectAnalysis.totalFiles,
            cypress: projectAnalysis.summary.cypressFiles,
            angular: projectAnalysis.summary.angularFiles,
            playwright: projectAnalysis.summary.playwrightFiles,
            mixed: projectAnalysis.summary.mixedFiles,
            unknown: projectAnalysis.summary.unknownFiles
          },
          conversionOutcome: {
            converted: conversionResult.successfulConversions,
            preserved: conversionResult.preservedFiles.length,
            failed: conversionResult.failedConversions,
            skipped: conversionResult.skippedFiles.length
          },
          qualityMetrics: {
            conversionRate: this.calculateConversionRate(projectAnalysis, conversionResult),
            validationRate: validationResult?.qualityMetrics.conversionRate,
            meetsThreshold: overallResult.meetsRequirements
          }
        },
        recommendations: this.generateRecommendations(
          projectAnalysis,
          conversionResult,
          validationResult,
          qualityThreshold
        )
      };

      // Generate comprehensive report
      if (options.generateReport !== false) {
        const reportPath = options.reportPath || path.join(outputPath, 'conversion-report.json');
        await this.generateComprehensiveReport(finalResult, reportPath);
        finalResult.reportPath = reportPath;
      }

      this.logger.info('Mixed project conversion completed', {
        overallSuccess: finalResult.overallSuccess,
        qualityScore: finalResult.qualityScore,
        totalTime: finalResult.performanceMetrics.totalTime
      });

      return finalResult;

    } catch (error) {
      this.logger.error('Error during mixed project conversion:', error);
      throw error;
    }
  }

  private calculateOverallResult(
    projectAnalysis: ProjectAnalysisResult,
    conversionResult: SelectiveConversionResult,
    validationResult?: ProjectValidationResult,
    qualityThreshold: number = 0.85
  ): { success: boolean; qualityScore: number; meetsRequirements: boolean } {

    // Calculate conversion success rate
    const conversionRate = this.calculateConversionRate(projectAnalysis, conversionResult);

    // Calculate validation success rate if available
    const validationRate = validationResult?.qualityMetrics.conversionRate || conversionRate;

    // Calculate overall quality score (weighted average)
    const conversionWeight = 0.7;
    const validationWeight = 0.3;
    const qualityScore = (conversionRate * conversionWeight) + (validationRate * validationWeight);

    // Determine overall success
    const conversionSuccess = conversionResult.failedConversions === 0 || conversionRate >= qualityThreshold;
    const validationSuccess = !validationResult || validationResult.overallSuccess;
    const overallSuccess = conversionSuccess && validationSuccess;

    // Check if meets requirements (>85% success rate)
    const meetsRequirements = qualityScore >= qualityThreshold;

    return {
      success: overallSuccess,
      qualityScore,
      meetsRequirements
    };
  }

  private calculateConversionRate(
    projectAnalysis: ProjectAnalysisResult,
    conversionResult: SelectiveConversionResult
  ): number {
    const totalCandidates = projectAnalysis.conversionCandidates.length;
    if (totalCandidates === 0) return 1.0; // No files to convert = 100% success

    return conversionResult.successfulConversions / totalCandidates;
  }

  private generateRecommendations(
    projectAnalysis: ProjectAnalysisResult,
    conversionResult: SelectiveConversionResult,
    validationResult?: ProjectValidationResult,
    qualityThreshold: number = 0.85
  ): string[] {
    const recommendations: string[] = [];

    // Conversion rate recommendations
    const conversionRate = this.calculateConversionRate(projectAnalysis, conversionResult);
    if (conversionRate < qualityThreshold) {
      recommendations.push(
        `Conversion rate (${(conversionRate * 100).toFixed(1)}%) is below ${(qualityThreshold * 100)}% threshold. ` +
        'Review failed conversions and improve conversion logic for complex patterns.'
      );
    }

    // File type distribution recommendations
    if (projectAnalysis.summary.mixedFiles > 0) {
      recommendations.push(
        `${projectAnalysis.summary.mixedFiles} files contain mixed framework patterns. ` +
        'Manual review recommended to ensure proper conversion.'
      );
    }

    // Performance recommendations
    const filesPerSecond = projectAnalysis.totalFiles / (conversionResult.performanceMetrics.conversionTime / 1000);
    if (filesPerSecond < 10) {
      recommendations.push(
        `Conversion performance (${filesPerSecond.toFixed(1)} files/sec) is below optimal. ` +
        'Consider enabling parallel processing or increasing batch sizes.'
      );
    }

    // Validation recommendations
    if (validationResult && !validationResult.overallSuccess) {
      recommendations.push(
        'Validation failures detected. Review syntax errors and compilation issues before deployment.'
      );
    }

    // Conflict resolution recommendations
    if (projectAnalysis.conversionScope.conflicts.length > 0) {
      recommendations.push(
        `${projectAnalysis.conversionScope.conflicts.length} naming conflicts detected. ` +
        'Consider renaming strategy to avoid overwriting existing Playwright tests.'
      );
    }

    // Success recommendations
    if (conversionRate >= qualityThreshold && (!validationResult || validationResult.overallSuccess)) {
      recommendations.push(
        'Conversion completed successfully! Consider running additional manual testing on complex test scenarios.'
      );
    }

    return recommendations;
  }

  async generateComprehensiveReport(
    result: MixedProjectConversionResult,
    reportPath: string
  ): Promise<void> {
    const report = {
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        conversionType: 'mixed-project'
      },

      executive_summary: {
        overallSuccess: result.overallSuccess,
        qualityScore: result.qualityScore,
        meetsRequirements: result.meetsRequirements,
        totalTime: result.performanceMetrics.totalTime,
        conversionRate: result.summary.qualityMetrics.conversionRate
      },

      project_analysis: {
        totalFiles: result.projectAnalysis.totalFiles,
        fileDistribution: result.summary.originalFiles,
        conversionCandidates: result.projectAnalysis.conversionCandidates.length,
        preservedFiles: result.projectAnalysis.categorizedFiles['angular-unit'].length +
                       result.projectAnalysis.categorizedFiles.playwright.length,
        conflicts: result.projectAnalysis.conversionScope.conflicts
      },

      conversion_results: {
        summary: result.summary.conversionOutcome,
        performance: result.conversionResult.performanceMetrics,
        errors: result.conversionResult.errors,
        warnings: result.conversionResult.warnings,
        fileDetails: result.conversionResult.conversionResults.map(r => ({
          originalPath: r.originalPath,
          convertedPath: r.convertedPath,
          success: r.success,
          errorCount: r.errors.length
        }))
      },

      validation_results: result.validationResult ? {
        overallSuccess: result.validationResult.overallSuccess,
        qualityMetrics: result.validationResult.qualityMetrics,
        syntaxValidation: result.validationResult.validationSummary.syntaxValidation,
        compilationValidation: result.validationResult.validationSummary.compilationValidation,
        performance: result.validationResult.performanceMetrics
      } : null,

      recommendations: result.recommendations,

      performance_metrics: result.performanceMetrics,

      file_inventory: {
        originalFiles: Object.entries(result.projectAnalysis.categorizedFiles).map(([type, files]) => ({
          type,
          count: files.length,
          files: files.slice(0, 10) // Limit to first 10 for report brevity
        })),
        convertedFiles: result.conversionResult.conversionResults.filter(r => r.success).length,
        preservedFiles: result.conversionResult.preservedFiles.length
      }
    };

    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    this.logger.info(`Comprehensive conversion report generated: ${reportPath}`);
  }

  async validateSystemRequirements(result: MixedProjectConversionResult): Promise<{
    meetsPerformanceCriteria: boolean;
    meetsQualityCriteria: boolean;
    meetsScalabilityCriteria: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Performance Criteria (from technical spec)
    const meetsPerformanceCriteria = this.validatePerformanceCriteria(result, issues);

    // Quality Criteria (>85% success rate)
    const meetsQualityCriteria = this.validateQualityCriteria(result, issues);

    // Scalability Criteria (handle 1000+ files)
    const meetsScalabilityCriteria = this.validateScalabilityCriteria(result, issues);

    return {
      meetsPerformanceCriteria,
      meetsQualityCriteria,
      meetsScalabilityCriteria,
      issues
    };
  }

  private validatePerformanceCriteria(result: MixedProjectConversionResult, issues: string[]): boolean {
    const totalFiles = result.projectAnalysis.totalFiles;
    const totalTimeSeconds = result.performanceMetrics.totalTime / 1000;

    // Should process 100+ files in under 2 minutes (120 seconds)
    if (totalFiles >= 100 && totalTimeSeconds > 120) {
      issues.push(`Performance: Processed ${totalFiles} files in ${totalTimeSeconds.toFixed(1)}s (exceeds 120s limit)`);
      return false;
    }

    return true;
  }

  private validateQualityCriteria(result: MixedProjectConversionResult, issues: string[]): boolean {
    const conversionRate = result.summary.qualityMetrics.conversionRate;

    if (conversionRate < 0.85) {
      issues.push(`Quality: Conversion rate ${(conversionRate * 100).toFixed(1)}% below 85% threshold`);
      return false;
    }

    return true;
  }

  private validateScalabilityCriteria(result: MixedProjectConversionResult, issues: string[]): boolean {
    // Check if system handled large project without memory issues
    const totalFiles = result.projectAnalysis.totalFiles;
    const hasErrors = result.conversionResult.errors.some(error =>
      error.toLowerCase().includes('memory') || error.toLowerCase().includes('timeout')
    );

    if (totalFiles >= 1000 && hasErrors) {
      issues.push('Scalability: Memory or timeout issues detected with large project');
      return false;
    }

    return true;
  }
}