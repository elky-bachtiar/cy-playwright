import { Logger } from '../utils/logger';
import { SyntaxValidator } from './syntax-validator';
import { ExecutionValidator } from './execution-validator';
import { EnvironmentValidator } from './environment-validator';
import { DependencyValidator } from './dependency-validator';
import { BrowserCompatibilityValidator } from './browser-compatibility-validator';
import { ErrorCategorizationService } from '../services/error-categorization-service';
import { ComparisonAnalyzer } from '../services/comparison-analyzer';
import { CIMigrationAnalyzer } from '../services/ci-migration-analyzer';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface ConversionReport {
  projectPath: string;
  conversionDate: string;
  summary: ConversionSummary;
  syntaxValidation: SyntaxValidationResults;
  executionValidation: ExecutionValidationResults;
  environmentValidation: EnvironmentValidationResults;
  dependencyValidation: DependencyValidationResults;
  browserCompatibility: BrowserCompatibilityResults;
  errorCategorization: ErrorCategorizationResults;
  beforeAfterComparison: BeforeAfterComparisonResults;
  ciMigrationAnalysis: CIMigrationAnalysisResults;
  recommendations: string[];
  nextSteps: string[];
}

export interface ConversionSummary {
  totalFiles: number;
  convertedFiles: number;
  failedFiles: number;
  successRate: number;
  totalErrors: number;
  criticalErrors: number;
  warnings: number;
  estimatedManualEffort: string;
}

export interface SyntaxValidationResults {
  validFiles: number;
  invalidFiles: number;
  syntaxErrors: number;
  conversionArtifacts: number;
  missingImports: number;
  asyncPatternIssues: number;
}

export interface ExecutionValidationResults {
  executableTests: number;
  failingTests: number;
  environmentIssues: number;
  dependencyIssues: number;
  executionErrors: Array<{
    file: string;
    error: string;
    severity: 'critical' | 'warning';
  }>;
}

export interface EnvironmentValidationResults {
  nodeVersion: {
    isValid: boolean;
    version: string;
    recommendation?: string;
  };
  packageManager: {
    isAvailable: boolean;
    version: string;
    recommendation?: string;
  };
  systemRequirements: {
    meetsRequirements: boolean;
    issues: string[];
    recommendations: string[];
  };
}

export interface DependencyValidationResults {
  playwrightInstalled: boolean;
  compatibilityIssues: number;
  missingPackages: string[];
  versionConflicts: number;
  typeScriptConfig: {
    hasConfig: boolean;
    isValid: boolean;
    recommendations: string[];
  };
}

export interface BrowserCompatibilityResults {
  supportedBrowsers: string[];
  unsupportedBrowsers: string[];
  installationRequired: boolean;
  systemCompatibility: boolean;
  warnings: string[];
}

export interface ErrorCategorizationResults {
  categories: {
    [category: string]: {
      count: number;
      severity: 'critical' | 'major' | 'minor';
      examples: string[];
      impact: string;
      resolution: string;
    };
  };
  priorityOrder: string[];
  estimatedFixTime: {
    [category: string]: string;
  };
}

export interface BeforeAfterComparisonResults {
  testExecutionTime: {
    before: number;
    after: number;
    improvement: number;
  };
  testReliability: {
    before: number;
    after: number;
    improvement: number;
  };
  maintainabilityScore: {
    before: number;
    after: number;
    improvement: number;
  };
  browserCoverage: {
    before: string[];
    after: string[];
    added: string[];
    removed: string[];
  };
  featureComparison: {
    gained: string[];
    lost: string[];
    equivalent: string[];
  };
}

export interface CIMigrationAnalysisResults {
  currentCIConfig: {
    detected: boolean;
    platform: string;
    configFile: string;
  };
  migrationRequirements: {
    newDependencies: string[];
    configChanges: string[];
    scriptUpdates: string[];
  };
  estimatedMigrationTime: string;
  recommendations: string[];
  risksAndChallenges: string[];
}

export class ConversionReportingValidator {
  private logger = new Logger('ConversionReportingValidator');
  private syntaxValidator = new SyntaxValidator();
  private executionValidator = new ExecutionValidator();
  private environmentValidator = new EnvironmentValidator();
  private dependencyValidator = new DependencyValidator();
  private browserCompatibilityValidator = new BrowserCompatibilityValidator();
  private errorCategorizationService = new ErrorCategorizationService();
  private comparisonAnalyzer = new ComparisonAnalyzer();
  private ciMigrationAnalyzer = new CIMigrationAnalyzer();

  async generateDetailedReport(projectPath: string): Promise<ConversionReport> {
    this.logger.info(`Generating detailed conversion report for: ${projectPath}`);

    const report: ConversionReport = {
      projectPath,
      conversionDate: new Date().toISOString(),
      summary: await this.generateSummary(projectPath),
      syntaxValidation: await this.generateSyntaxValidationResults(projectPath),
      executionValidation: await this.generateExecutionValidationResults(projectPath),
      environmentValidation: await this.generateEnvironmentValidationResults(),
      dependencyValidation: await this.generateDependencyValidationResults(projectPath),
      browserCompatibility: await this.generateBrowserCompatibilityResults(),
      errorCategorization: await this.generateErrorCategorizationResults(projectPath),
      beforeAfterComparison: await this.generateBeforeAfterComparison(projectPath),
      ciMigrationAnalysis: await this.generateCIMigrationAnalysis(projectPath),
      recommendations: [],
      nextSteps: []
    };

    // Generate recommendations and next steps based on results
    report.recommendations = this.generateRecommendations(report);
    report.nextSteps = this.generateNextSteps(report);

    return report;
  }

  async generateConversionSummary(projectPath: string): Promise<ConversionSummary> {
    this.logger.debug(`Generating conversion summary for: ${projectPath}`);

    const testFiles = await this.findTestFiles(projectPath);
    const validationResults = await Promise.all(
      testFiles.map(file => this.syntaxValidator.validateTestFile(file))
    );

    const totalFiles = testFiles.length;
    const failedFiles = validationResults.filter(result => !result.isValid).length;
    const convertedFiles = totalFiles - failedFiles;
    const successRate = totalFiles > 0 ? (convertedFiles / totalFiles) * 100 : 0;

    const totalErrors = validationResults.reduce((sum, result) => sum + result.errors.length, 0);
    const criticalErrors = validationResults.reduce(
      (sum, result) => sum + result.errors.filter(e => e.severity === 'error').length,
      0
    );
    const warnings = validationResults.reduce(
      (sum, result) => sum + result.errors.filter(e => e.severity === 'warning').length,
      0
    );

    const estimatedManualEffort = this.calculateEstimatedEffort(criticalErrors, warnings);

    return {
      totalFiles,
      convertedFiles,
      failedFiles,
      successRate,
      totalErrors,
      criticalErrors,
      warnings,
      estimatedManualEffort
    };
  }

  async exportReport(report: ConversionReport, format: 'json' | 'html' | 'markdown'): Promise<string> {
    this.logger.debug(`Exporting report in ${format} format`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = path.join(report.projectPath, 'conversion-reports');
    await fs.ensureDir(outputDir);

    let outputPath: string;
    let content: string;

    switch (format) {
      case 'json':
        outputPath = path.join(outputDir, `conversion-report-${timestamp}.json`);
        content = JSON.stringify(report, null, 2);
        break;

      case 'html':
        outputPath = path.join(outputDir, `conversion-report-${timestamp}.html`);
        content = this.generateHTMLReport(report);
        break;

      case 'markdown':
        outputPath = path.join(outputDir, `conversion-report-${timestamp}.md`);
        content = this.generateMarkdownReport(report);
        break;

      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    await fs.writeFile(outputPath, content, 'utf8');
    this.logger.info(`Report exported to: ${outputPath}`);

    return outputPath;
  }

  private async generateSummary(projectPath: string): Promise<ConversionSummary> {
    return this.generateConversionSummary(projectPath);
  }

  private async generateSyntaxValidationResults(projectPath: string): Promise<SyntaxValidationResults> {
    const testFiles = await this.findTestFiles(projectPath);
    const results = await Promise.all(
      testFiles.map(file => this.syntaxValidator.validateTestFile(file))
    );

    const validFiles = results.filter(r => r.isValid).length;
    const invalidFiles = results.filter(r => !r.isValid).length;
    const syntaxErrors = results.reduce((sum, r) => sum + r.errors.filter(e => e.type === 'syntax').length, 0);
    const conversionArtifacts = results.reduce((sum, r) => sum + r.errors.filter(e => e.type === 'conversion').length, 0);
    const missingImports = results.reduce((sum, r) => sum + r.errors.filter(e => e.type === 'import').length, 0);
    const asyncPatternIssues = results.reduce((sum, r) => sum + r.errors.filter(e => e.type === 'async').length, 0);

    return {
      validFiles,
      invalidFiles,
      syntaxErrors,
      conversionArtifacts,
      missingImports,
      asyncPatternIssues
    };
  }

  private async generateExecutionValidationResults(projectPath: string): Promise<ExecutionValidationResults> {
    const executionResult = await this.executionValidator.validateProject(projectPath);

    return {
      executableTests: executionResult.executableTests || 0,
      failingTests: executionResult.failingTests || 0,
      environmentIssues: executionResult.environmentIssues || 0,
      dependencyIssues: executionResult.dependencyIssues || 0,
      executionErrors: executionResult.executionErrors || []
    };
  }

  private async generateEnvironmentValidationResults(): Promise<EnvironmentValidationResults> {
    const nodeVersion = await this.environmentValidator.validateNodeVersion();
    const packageManager = await this.environmentValidator.validatePackageManager('npm');
    const systemRequirements = await this.environmentValidator.validateSystemDependencies(['git']);

    return {
      nodeVersion: {
        isValid: nodeVersion.isValid,
        version: nodeVersion.version,
        recommendation: nodeVersion.recommendation
      },
      packageManager: {
        isAvailable: packageManager.isAvailable,
        version: packageManager.version,
        recommendation: packageManager.recommendation
      },
      systemRequirements: {
        meetsRequirements: systemRequirements.allAvailable,
        issues: systemRequirements.missingDependencies,
        recommendations: systemRequirements.recommendations
      }
    };
  }

  private async generateDependencyValidationResults(projectPath: string): Promise<DependencyValidationResults> {
    const playwrightInstallation = await this.dependencyValidator.validatePlaywrightInstallation(projectPath);
    const compatibility = await this.dependencyValidator.validateDependencyCompatibility(projectPath);
    const typeScriptConfig = await this.dependencyValidator.validateTypeScriptConfig(projectPath);

    return {
      playwrightInstalled: playwrightInstallation.isInstalled,
      compatibilityIssues: compatibility.incompatiblePackages.length,
      missingPackages: playwrightInstallation.missingPackages,
      versionConflicts: compatibility.conflicts.length,
      typeScriptConfig: {
        hasConfig: typeScriptConfig.hasConfig,
        isValid: typeScriptConfig.isValid,
        recommendations: typeScriptConfig.recommendations
      }
    };
  }

  private async generateBrowserCompatibilityResults(): Promise<BrowserCompatibilityResults> {
    const systemRequirements = await this.browserCompatibilityValidator.validateSystemRequirements();
    const browserInstallations = await this.browserCompatibilityValidator.validateBrowserInstallations();

    return {
      supportedBrowsers: systemRequirements.supportedBrowsers,
      unsupportedBrowsers: systemRequirements.unsupportedBrowsers,
      installationRequired: !browserInstallations.allInstalled,
      systemCompatibility: systemRequirements.meetsRequirements,
      warnings: systemRequirements.warnings
    };
  }

  private async generateErrorCategorizationResults(projectPath: string): Promise<ErrorCategorizationResults> {
    const testFiles = await this.findTestFiles(projectPath);
    const validationResults = await Promise.all(
      testFiles.map(file => this.syntaxValidator.validateTestFile(file))
    );

    const allErrors = validationResults.flatMap(result => result.errors);
    return this.errorCategorizationService.categorizeErrors(allErrors);
  }

  private async generateBeforeAfterComparison(projectPath: string): Promise<BeforeAfterComparisonResults> {
    return this.comparisonAnalyzer.generateComparison(projectPath);
  }

  private async generateCIMigrationAnalysis(projectPath: string): Promise<CIMigrationAnalysisResults> {
    return this.ciMigrationAnalyzer.analyzeMigration(projectPath);
  }

  private generateRecommendations(report: ConversionReport): string[] {
    const recommendations: string[] = [];

    // Environment recommendations
    if (!report.environmentValidation.nodeVersion.isValid) {
      recommendations.push(report.environmentValidation.nodeVersion.recommendation || 'Update Node.js version');
    }

    // Dependency recommendations
    if (!report.dependencyValidation.playwrightInstalled) {
      recommendations.push('Install Playwright packages');
    }

    // Browser compatibility recommendations
    if (report.browserCompatibility.installationRequired) {
      recommendations.push('Install Playwright browsers using npx playwright install');
    }

    // Syntax validation recommendations
    if (report.syntaxValidation.syntaxErrors > 0) {
      recommendations.push('Fix syntax errors in converted test files');
    }

    // Error categorization recommendations
    Object.entries(report.errorCategorization.categories).forEach(([category, info]) => {
      if (info.severity === 'critical' && info.count > 0) {
        recommendations.push(`Address ${info.count} ${category} issues: ${info.resolution}`);
      }
    });

    return recommendations;
  }

  private generateNextSteps(report: ConversionReport): string[] {
    const nextSteps: string[] = [];

    // Prioritize based on severity
    if (report.summary.criticalErrors > 0) {
      nextSteps.push('1. Fix critical syntax and execution errors');
    }

    if (!report.dependencyValidation.playwrightInstalled) {
      nextSteps.push('2. Install and configure Playwright dependencies');
    }

    if (report.browserCompatibility.installationRequired) {
      nextSteps.push('3. Install required browsers for testing');
    }

    if (report.executionValidation.failingTests > 0) {
      nextSteps.push('4. Debug and fix failing test executions');
    }

    if (report.ciMigrationAnalysis.migrationRequirements.configChanges.length > 0) {
      nextSteps.push('5. Update CI/CD configuration for Playwright');
    }

    nextSteps.push('6. Run full test suite validation');
    nextSteps.push('7. Performance comparison and optimization');

    return nextSteps;
  }

  private async findTestFiles(projectPath: string): Promise<string[]> {
    const testDirs = ['tests', 'e2e', 'test'];
    const testFiles: string[] = [];

    for (const dir of testDirs) {
      const testDir = path.join(projectPath, dir);
      if (await fs.pathExists(testDir)) {
        const files = await this.getTestFilesFromDir(testDir);
        testFiles.push(...files);
      }
    }

    return testFiles;
  }

  private async getTestFilesFromDir(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.getTestFilesFromDir(fullPath);
        files.push(...subFiles);
      } else if (entry.name.match(/\.(test|spec)\.(js|ts)$/)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private calculateEstimatedEffort(criticalErrors: number, warnings: number): string {
    const hours = Math.ceil((criticalErrors * 0.5) + (warnings * 0.1));

    if (hours < 1) return 'Less than 1 hour';
    if (hours < 8) return `${hours} hours`;
    if (hours < 40) return `${Math.ceil(hours / 8)} days`;
    return `${Math.ceil(hours / 40)} weeks`;
  }

  private generateHTMLReport(report: ConversionReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Cypress to Playwright Conversion Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; }
        .summary { background: #f5f5f5; padding: 20px; margin: 20px 0; }
        .section { margin: 30px 0; }
        .error { color: #d32f2f; }
        .warning { color: #f57c00; }
        .success { color: #388e3c; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Cypress to Playwright Conversion Report</h1>
        <p>Project: ${report.projectPath}</p>
        <p>Generated: ${report.conversionDate}</p>
    </div>

    <div class="summary">
        <h2>Summary</h2>
        <p>Success Rate: <span class="${report.summary.successRate > 80 ? 'success' : 'warning'}">${report.summary.successRate.toFixed(1)}%</span></p>
        <p>Files Converted: ${report.summary.convertedFiles}/${report.summary.totalFiles}</p>
        <p>Critical Errors: <span class="error">${report.summary.criticalErrors}</span></p>
        <p>Warnings: <span class="warning">${report.summary.warnings}</span></p>
        <p>Estimated Manual Effort: ${report.summary.estimatedManualEffort}</p>
    </div>

    <div class="section">
        <h2>Recommendations</h2>
        <ul>
            ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>

    <div class="section">
        <h2>Next Steps</h2>
        <ol>
            ${report.nextSteps.map(step => `<li>${step}</li>`).join('')}
        </ol>
    </div>
</body>
</html>`;
  }

  private generateMarkdownReport(report: ConversionReport): string {
    return `# Cypress to Playwright Conversion Report

**Project:** ${report.projectPath}
**Generated:** ${report.conversionDate}

## Summary

- **Success Rate:** ${report.summary.successRate.toFixed(1)}%
- **Files Converted:** ${report.summary.convertedFiles}/${report.summary.totalFiles}
- **Critical Errors:** ${report.summary.criticalErrors}
- **Warnings:** ${report.summary.warnings}
- **Estimated Manual Effort:** ${report.summary.estimatedManualEffort}

## Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

## Next Steps

${report.nextSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

## Validation Results

### Syntax Validation
- Valid Files: ${report.syntaxValidation.validFiles}
- Invalid Files: ${report.syntaxValidation.invalidFiles}
- Syntax Errors: ${report.syntaxValidation.syntaxErrors}
- Conversion Artifacts: ${report.syntaxValidation.conversionArtifacts}

### Execution Validation
- Executable Tests: ${report.executionValidation.executableTests}
- Failing Tests: ${report.executionValidation.failingTests}
- Environment Issues: ${report.executionValidation.environmentIssues}

### Environment
- Node.js Version: ${report.environmentValidation.nodeVersion.version} (${report.environmentValidation.nodeVersion.isValid ? 'Valid' : 'Invalid'})
- Package Manager: ${report.environmentValidation.packageManager.version} (${report.environmentValidation.packageManager.isAvailable ? 'Available' : 'Not Available'})

### Dependencies
- Playwright Installed: ${report.dependencyValidation.playwrightInstalled ? 'Yes' : 'No'}
- Compatibility Issues: ${report.dependencyValidation.compatibilityIssues}
- Missing Packages: ${report.dependencyValidation.missingPackages.join(', ') || 'None'}

### Browser Compatibility
- Supported Browsers: ${report.browserCompatibility.supportedBrowsers.join(', ')}
- Unsupported Browsers: ${report.browserCompatibility.unsupportedBrowsers.join(', ') || 'None'}
- Installation Required: ${report.browserCompatibility.installationRequired ? 'Yes' : 'No'}
`;
  }
}