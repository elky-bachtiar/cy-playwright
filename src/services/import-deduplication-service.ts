import * as fs from 'fs-extra';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { ImportAnalyzer, ImportAnalysisResults, OrganizedImport } from './import-analyzer';
import { ImportPathTransformer, PathMapping } from './import-path-transformer';

export interface ImportDeduplicationResult {
  originalFile: string;
  cleanedContent: string;
  analysis: ImportAnalysisResults;
  pathMappings: PathMapping;
  removedImports: string[];
  duplicatesResolved: number;
  syntaxValid: boolean;
  errors: string[];
}

export interface DeduplicationOptions {
  projectRoot: string;
  outputDir?: string;
  preserveComments?: boolean;
  generateReport?: boolean;
}

export class ImportDeduplicationService {
  private logger = new Logger('ImportDeduplicationService');
  private analyzer = new ImportAnalyzer();
  private pathTransformer = new ImportPathTransformer();

  async deduplicateFile(filePath: string, options: DeduplicationOptions): Promise<ImportDeduplicationResult> {
    try {
      this.logger.info(`Processing file: ${filePath}`);

      // Read original file
      const originalContent = await fs.readFile(filePath, 'utf8');

      // Analyze imports
      const analysis = await this.analyzer.analyzeAllImports(filePath);

      // Generate path mappings
      const pathMappings = this.pathTransformer.generatePathMappings(analysis.legitImports, filePath);

      // Process and clean the file
      const cleanedContent = await this.processImports(originalContent, analysis, pathMappings, options);

      // Validate syntax
      const syntaxValid = await this.validateSyntax(cleanedContent, filePath);

      const result: ImportDeduplicationResult = {
        originalFile: filePath,
        cleanedContent,
        analysis,
        pathMappings,
        removedImports: analysis.cypressImports.map(ci => ci.source),
        duplicatesResolved: analysis.duplicates.length,
        syntaxValid,
        errors: syntaxValid ? [] : ['Syntax validation failed']
      };

      this.logger.info(`Successfully processed ${filePath}: ${result.duplicatesResolved} duplicates resolved, ${result.removedImports.length} imports removed`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to deduplicate imports in ${filePath}:`, error);
      throw error;
    }
  }

  async deduplicateProject(projectPath: string, options: DeduplicationOptions): Promise<ImportDeduplicationResult[]> {
    try {
      this.logger.info(`Processing project: ${projectPath}`);

      // Find all TypeScript test files
      const testFiles = await this.findTestFiles(projectPath);

      this.logger.info(`Found ${testFiles.length} test files to process`);

      // Process each file
      const results: ImportDeduplicationResult[] = [];
      for (const filePath of testFiles) {
        try {
          const result = await this.deduplicateFile(filePath, options);
          results.push(result);
        } catch (error) {
          this.logger.warn(`Skipping file ${filePath} due to error:`, error);
          results.push({
            originalFile: filePath,
            cleanedContent: '',
            analysis: { duplicates: [], cypressImports: [], legitImports: [], totalImports: 0 },
            pathMappings: {},
            removedImports: [],
            duplicatesResolved: 0,
            syntaxValid: false,
            errors: [error instanceof Error ? error.message : String(error)]
          });
        }
      }

      // Generate summary report
      if (options.generateReport) {
        await this.generateReport(results, options);
      }

      this.logger.info(`Project processing complete: ${results.length} files processed`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to process project ${projectPath}:`, error);
      throw error;
    }
  }

  async validateDlaConversion(dlaProjectPath: string): Promise<boolean> {
    try {
      this.logger.info(`Validating DLA conversion: ${dlaProjectPath}`);

      const options: DeduplicationOptions = {
        projectRoot: dlaProjectPath,
        generateReport: true
      };

      const results = await this.deduplicateProject(dlaProjectPath, options);

      // Check success criteria
      const totalFiles = results.length;
      const successfulFiles = results.filter(r => r.syntaxValid && r.errors.length === 0).length;
      const successRate = totalFiles > 0 ? (successfulFiles / totalFiles) * 100 : 0;

      const totalDuplicates = results.reduce((sum, r) => sum + r.duplicatesResolved, 0);
      const totalRemovedImports = results.reduce((sum, r) => sum + r.removedImports.length, 0);

      this.logger.info(`DLA validation results: ${successRate.toFixed(1)}% success rate (${successfulFiles}/${totalFiles} files)`);
      this.logger.info(`Resolved ${totalDuplicates} duplicate imports and removed ${totalRemovedImports} unwanted imports`);

      // Success criteria: >85% success rate
      return successRate >= 85;
    } catch (error) {
      this.logger.error(`DLA validation failed:`, error);
      return false;
    }
  }

  private async processImports(
    originalContent: string,
    analysis: ImportAnalysisResults,
    pathMappings: PathMapping,
    options: DeduplicationOptions
  ): Promise<string> {
    let cleanedContent = originalContent;

    // Remove Cypress/Angular imports
    for (const cypressImport of analysis.cypressImports) {
      cleanedContent = this.removeImportLines(cleanedContent, cypressImport.source);
    }

    // Deduplicate imports
    for (const duplicate of analysis.duplicates) {
      cleanedContent = this.mergeImportLines(cleanedContent, duplicate);
    }

    // Apply path corrections
    for (const [originalPath, newPath] of Object.entries(pathMappings)) {
      cleanedContent = this.pathTransformer.rewriteImportStatement(cleanedContent, { [originalPath]: newPath });
    }

    // Organize imports
    const organized = await this.analyzer.organizeImports('/temp/file.ts');
    cleanedContent = this.reorderImports(cleanedContent, organized.organized);

    return cleanedContent;
  }

  private removeImportLines(content: string, importSource: string): string {
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmedLine = line.trim();
      return !(trimmedLine.includes(`from '${importSource}'`) ||
               trimmedLine.includes(`from "${importSource}"`));
    });
    return filteredLines.join('\n');
  }

  private mergeImportLines(content: string, duplicate: any): string {
    const lines = content.split('\n');
    const importLines: string[] = [];
    const nonImportLines: string[] = [];
    const allNamedImports = new Set<string>();
    let hasDefault = false;
    let defaultName = '';

    // Separate import lines for this source from other lines
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine.includes(`from '${duplicate.source}'`) ||
          trimmedLine.includes(`from "${duplicate.source}"`)) {
        importLines.push(line);

        // Extract named imports
        const namedMatch = line.match(/\{\s*([^}]+)\s*\}/);
        if (namedMatch) {
          const namedImports = namedMatch[1].split(',').map(s => s.trim());
          namedImports.forEach(imp => allNamedImports.add(imp));
        }

        // Check for default import
        const defaultMatch = line.match(/import\s+(\w+)\s*,?\s*\{/);
        if (defaultMatch && !hasDefault) {
          hasDefault = true;
          defaultName = defaultMatch[1];
        }
      } else {
        nonImportLines.push(line);
      }
    });

    // Create merged import line
    if (importLines.length > 1) {
      const quote = duplicate.source.includes("'") ? "'" : '"';
      const namedImportsStr = Array.from(allNamedImports).join(', ');
      const defaultPart = hasDefault ? `${defaultName}, ` : '';
      const mergedImport = `import ${defaultPart}{ ${namedImportsStr} } from ${quote}${duplicate.source}${quote};`;

      // Insert merged import at the position of the first import
      const firstImportIndex = lines.findIndex(line =>
        line.includes(`from '${duplicate.source}'`) ||
        line.includes(`from "${duplicate.source}"`)
      );

      nonImportLines.splice(firstImportIndex, 0, mergedImport);
    }

    return nonImportLines.join('\n');
  }

  private reorderImports(content: string, organized: OrganizedImport[]): string {
    const lines = content.split('\n');
    const importLines: string[] = [];
    const nonImportLines: string[] = [];

    // Separate import lines from other lines
    lines.forEach(line => {
      if (line.trim().startsWith('import ')) {
        importLines.push(line);
      } else {
        nonImportLines.push(line);
      }
    });

    // Generate organized import lines
    const organizedImportLines: string[] = [];
    let currentCategory = '';

    organized.forEach(orgImport => {
      if (orgImport.category !== currentCategory) {
        if (organizedImportLines.length > 0) {
          organizedImportLines.push(''); // Add blank line between categories
        }
        currentCategory = orgImport.category;
      }

      const quote = orgImport.source.includes("'") ? "'" : '"';
      let importStatement = 'import ';

      if (orgImport.defaultImport) {
        importStatement += orgImport.defaultImport;
        if (orgImport.imports.length > 0 || orgImport.namespaceImport) {
          importStatement += ', ';
        }
      }

      if (orgImport.namespaceImport) {
        importStatement += `* as ${orgImport.namespaceImport}`;
      } else if (orgImport.imports.length > 0) {
        importStatement += `{ ${orgImport.imports.join(', ')} }`;
      }

      importStatement += ` from ${quote}${orgImport.source}${quote};`;
      organizedImportLines.push(importStatement);
    });

    // Combine organized imports with non-import lines
    const result = [...organizedImportLines, '', ...nonImportLines.filter(line => line.trim() !== '')];
    return result.join('\n');
  }

  private async validateSyntax(content: string, filePath: string): Promise<boolean> {
    try {
      // Use TypeScript compiler to validate syntax
      const ts = await import('typescript');
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const diagnostics = (sourceFile as any).parseDiagnostics || [];
      return diagnostics.length === 0;
    } catch (error) {
      this.logger.warn(`Syntax validation failed for ${filePath}:`, error);
      return false;
    }
  }

  private async findTestFiles(projectPath: string): Promise<string[]> {
    const testFiles: string[] = [];

    async function scanDirectory(dir: string) {
      try {
        const items = await fs.readdir(dir);

        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = await fs.stat(fullPath);

          if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
            await scanDirectory(fullPath);
          } else if (stat.isFile() && (item.endsWith('.spec.ts') || item.endsWith('.cy.ts'))) {
            testFiles.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }

    await scanDirectory(projectPath);
    return testFiles;
  }

  private async generateReport(results: ImportDeduplicationResult[], options: DeduplicationOptions): Promise<void> {
    try {
      const reportPath = path.join(options.outputDir || options.projectRoot, 'import-deduplication-report.json');

      const summary = {
        timestamp: new Date().toISOString(),
        totalFiles: results.length,
        successfulFiles: results.filter(r => r.syntaxValid).length,
        totalDuplicatesResolved: results.reduce((sum, r) => sum + r.duplicatesResolved, 0),
        totalImportsRemoved: results.reduce((sum, r) => sum + r.removedImports.length, 0),
        files: results.map(r => ({
          file: r.originalFile,
          duplicatesResolved: r.duplicatesResolved,
          importsRemoved: r.removedImports.length,
          syntaxValid: r.syntaxValid,
          errors: r.errors
        }))
      };

      await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));
      this.logger.info(`Generated report: ${reportPath}`);
    } catch (error) {
      this.logger.warn(`Failed to generate report:`, error);
    }
  }
}