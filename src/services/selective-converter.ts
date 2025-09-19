import * as fs from 'fs-extra';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { ProjectTypeAnalyzer, ProjectAnalysisResult } from './project-type-analyzer';
import { CommandConverter } from '../command-converter';

export interface ConversionOptions {
  preserveStructure?: boolean;
  skipExisting?: boolean;
  outputDir?: string;
  batchSize?: number;
  parallel?: boolean;
}

export interface ConversionResult {
  originalPath: string;
  convertedPath: string;
  success: boolean;
  errors: string[];
  warnings?: string[];
  conversionTime?: number;
}

export interface ConversionScope {
  toConvert: string[];
  toPreserve: string[];
  conflicts: Array<{
    cypressFile: string;
    playwrightFile: string;
    recommendation: string;
  }>;
}

export interface SelectiveConversionResult {
  totalFilesProcessed: number;
  successfulConversions: number;
  failedConversions: number;
  skippedFiles: string[];
  preservedFiles: string[];
  mixedFiles: string[];
  errors: string[];
  warnings: string[];
  conversionResults: ConversionResult[];
  performanceMetrics: {
    conversionTime: number;
    filesPerSecond: number;
    averageTimePerFile: number;
  };
  summary: {
    originalCypressFiles: number;
    convertedFiles: number;
    preservedPlaywrightFiles: number;
    preservedAngularFiles: number;
    conflictsResolved: number;
  };
}

export class SelectiveConverter {
  private logger: Logger;
  private projectAnalyzer: ProjectTypeAnalyzer;
  private commandConverter: CommandConverter;

  constructor(projectAnalyzer?: ProjectTypeAnalyzer) {
    this.logger = new Logger('SelectiveConverter');
    this.projectAnalyzer = projectAnalyzer || new ProjectTypeAnalyzer();
    this.commandConverter = new CommandConverter();
  }

  async convertProject(
    projectPath: string,
    outputPath: string,
    options: ConversionOptions = {}
  ): Promise<SelectiveConversionResult> {
    const startTime = Date.now();

    try {
      // Validate and normalize options
      const validatedOptions = this.validateConversionOptions(options);

      // Analyze project structure
      this.logger.info(`Analyzing project structure at ${projectPath}`);
      const projectAnalysis = await this.projectAnalyzer.analyzeProject(projectPath);

      // Determine conversion scope
      const conversionScope = this.getConversionScope(projectAnalysis);

      // Prepare output directory
      await fs.ensureDir(outputPath);

      // Initialize result tracking
      const conversionResults: ConversionResult[] = [];
      const skippedFiles: string[] = [];
      const preservedFiles: string[] = [];
      const mixedFiles: string[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];

      // Process files that should be preserved (copied as-is)
      for (const filePath of conversionScope.toPreserve) {
        try {
          const outputFilePath = this.determineOutputPath(filePath, outputPath, validatedOptions);
          await fs.ensureDir(path.dirname(outputFilePath));
          await fs.copy(filePath, outputFilePath);
          preservedFiles.push(filePath);

          if (projectAnalysis.categorizedFiles.mixed.includes(filePath)) {
            mixedFiles.push(filePath);
            warnings.push(`Mixed framework file detected: ${filePath} - Manual review recommended`);
          }
        } catch (error) {
          const errorMsg = `Failed to preserve file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          this.logger.error(errorMsg);
        }
      }

      // Process files that need conversion
      for (const filePath of conversionScope.toConvert) {
        try {
          const outputFilePath = this.determineOutputPath(filePath, outputPath, validatedOptions);

          // Check if file already exists and skip if requested
          if (validatedOptions.skipExisting && await fs.pathExists(outputFilePath)) {
            skippedFiles.push(filePath);
            warnings.push(`File already exists, skipping: ${outputFilePath}`);
            continue;
          }

          // Convert the file
          const conversionResult = await this.convertFile(filePath, outputFilePath);
          conversionResults.push(conversionResult);

          if (!conversionResult.success) {
            errors.push(...conversionResult.errors);
          }
        } catch (error) {
          const errorMsg = `Failed to convert file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          this.logger.error(errorMsg);

          conversionResults.push({
            originalPath: filePath,
            convertedPath: '',
            success: false,
            errors: [errorMsg]
          });
        }
      }

      // Handle conflicts
      for (const conflict of conversionScope.conflicts) {
        warnings.push(
          `Naming conflict detected: ${conflict.cypressFile} vs ${conflict.playwrightFile} - ${conflict.recommendation}`
        );
      }

      const endTime = Date.now();
      const conversionTime = endTime - startTime;

      // Calculate performance metrics
      const successfulConversions = conversionResults.filter(r => r.success).length;
      const failedConversions = conversionResults.filter(r => !r.success).length;
      const totalProcessed = conversionResults.length + preservedFiles.length;

      return {
        totalFilesProcessed: totalProcessed,
        successfulConversions,
        failedConversions,
        skippedFiles,
        preservedFiles,
        mixedFiles,
        errors,
        warnings,
        conversionResults,
        performanceMetrics: {
          conversionTime,
          filesPerSecond: totalProcessed / (conversionTime / 1000),
          averageTimePerFile: conversionTime / Math.max(totalProcessed, 1)
        },
        summary: {
          originalCypressFiles: projectAnalysis.summary.cypressFiles,
          convertedFiles: successfulConversions,
          preservedPlaywrightFiles: projectAnalysis.summary.playwrightFiles,
          preservedAngularFiles: projectAnalysis.summary.angularFiles,
          conflictsResolved: conversionScope.conflicts.length
        }
      };
    } catch (error) {
      this.logger.error('Error during selective conversion:', error);
      throw error;
    }
  }

  private async convertFile(inputPath: string, outputPath: string): Promise<ConversionResult> {
    const startTime = Date.now();

    try {
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));

      // Read source file
      const sourceContent = await fs.readFile(inputPath, 'utf-8');

      // For now, perform basic conversion by replacing common patterns
      // In a full implementation, this would use the complete conversion pipeline
      let convertedContent = sourceContent;

      // Basic Cypress to Playwright conversions
      convertedContent = convertedContent.replace(/cy\.visit\(/g, 'await page.goto(');
      convertedContent = convertedContent.replace(/cy\.get\(/g, 'page.locator(');
      convertedContent = convertedContent.replace(/cy\.type\(/g, 'await locator.fill(');
      convertedContent = convertedContent.replace(/cy\.click\(\)/g, 'await locator.click()');
      convertedContent = convertedContent.replace(/cy\.should\('be\.visible'\)/g, 'await expect(locator).toBeVisible()');

      // Add Playwright imports if not present
      if (!convertedContent.includes('@playwright/test')) {
        convertedContent = `import { test, expect } from '@playwright/test';\n\n${convertedContent}`;
      }

      // Write converted content
      await fs.writeFile(outputPath, convertedContent);

      return {
        originalPath: inputPath,
        convertedPath: outputPath,
        success: true,
        errors: [],
        warnings: [],
        conversionTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        originalPath: inputPath,
        convertedPath: outputPath,
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown conversion error'],
        conversionTime: Date.now() - startTime
      };
    }
  }

  determineOutputPath(inputPath: string, outputBaseDir: string, options: ConversionOptions): string {
    const fileName = path.basename(inputPath);
    let outputFileName = fileName;

    // Convert Cypress file extensions to Playwright equivalents
    if (fileName.endsWith('.cy.ts')) {
      outputFileName = fileName.replace('.cy.ts', '.spec.ts');
    } else if (fileName.endsWith('.cy.js')) {
      outputFileName = fileName.replace('.cy.js', '.spec.js');
    }

    if (options.preserveStructure) {
      // Try to preserve relative directory structure
      const relativePath = this.extractRelativePath(inputPath);
      const outputDir = path.join(outputBaseDir, options.outputDir || 'tests', relativePath);
      return path.join(outputDir, outputFileName);
    } else {
      // Flatten structure
      const outputDir = path.join(outputBaseDir, options.outputDir || 'tests');
      return path.join(outputDir, outputFileName);
    }
  }

  private extractRelativePath(filePath: string): string {
    // Extract the relative path for common Cypress directory structures
    const commonPaths = [
      '/cypress/e2e/',
      '/cypress/integration/',
      '/e2e/',
      '/integration/',
      '/cypress/'
    ];

    for (const commonPath of commonPaths) {
      const index = filePath.indexOf(commonPath);
      if (index !== -1) {
        const relativePart = filePath.substring(index + commonPath.length);
        return path.dirname(relativePart);
      }
    }

    // Fallback: use the directory name containing the file
    return path.dirname(path.basename(filePath));
  }

  getConversionScope(projectAnalysis: ProjectAnalysisResult): ConversionScope {
    return {
      toConvert: [...projectAnalysis.conversionCandidates],
      toPreserve: [
        ...projectAnalysis.categorizedFiles['angular-unit'],
        ...projectAnalysis.categorizedFiles['playwright'],
        ...projectAnalysis.categorizedFiles['mixed'],
        ...projectAnalysis.categorizedFiles['unknown']
      ],
      conflicts: [...projectAnalysis.conversionScope.conflicts]
    };
  }

  validateConversionOptions(options: ConversionOptions): Required<ConversionOptions> {
    return {
      preserveStructure: options.preserveStructure ?? true,
      skipExisting: options.skipExisting ?? false,
      outputDir: options.outputDir ?? 'tests',
      batchSize: options.batchSize ?? 10,
      parallel: options.parallel ?? false
    };
  }

  async convertBatch(
    files: string[],
    outputBaseDir: string,
    options: ConversionOptions
  ): Promise<ConversionResult[]> {
    const batchSize = options.batchSize || 10;
    const results: ConversionResult[] = [];

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      if (options.parallel) {
        // Process batch in parallel
        const batchPromises = batch.map(filePath => {
          const outputPath = this.determineOutputPath(filePath, outputBaseDir, options);
          return this.convertFile(filePath, outputPath);
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } else {
        // Process batch sequentially
        for (const filePath of batch) {
          const outputPath = this.determineOutputPath(filePath, outputBaseDir, options);
          const result = await this.convertFile(filePath, outputPath);
          results.push(result);
        }
      }
    }

    return results;
  }

  async generateConversionReport(result: SelectiveConversionResult, reportPath: string): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      summary: result.summary,
      performanceMetrics: result.performanceMetrics,
      conversionDetails: {
        successful: result.conversionResults.filter(r => r.success).length,
        failed: result.conversionResults.filter(r => !r.success).length,
        preserved: result.preservedFiles.length,
        skipped: result.skippedFiles.length
      },
      errors: result.errors,
      warnings: result.warnings,
      fileDetails: result.conversionResults.map(r => ({
        originalPath: r.originalPath,
        convertedPath: r.convertedPath,
        success: r.success,
        conversionTime: r.conversionTime,
        errorCount: r.errors.length
      }))
    };

    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  }
}