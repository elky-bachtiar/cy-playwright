import * as fs from 'fs-extra';
import * as path from 'path';
import { PageObjectAnalyzer, PageObjectAnalysisResult } from './page-object-analyzer';
import { PageObjectTransformer, ConvertedPageObject } from './page-object-transformer';
import { TestStructureConverter } from './test-structure-converter';
import { ImportDeduplicationService } from './import-deduplication-service';
import { ImportPathTransformer } from './import-path-transformer';
import { CypressTestFile } from '../types';

export interface EnhancedConversionOptions {
  sourceDir: string;
  outputDir: string;
  preserveMethodChaining?: boolean;
  convertPageObjects?: boolean;
  deduplicateImports?: boolean;
  transformImportPaths?: boolean;
  convertTestStructure?: boolean;
  verbose?: boolean;
}

export interface ConversionResult {
  convertedFiles: Array<{
    originalPath: string;
    convertedPath: string;
    content: string;
    type: 'test' | 'pageObject' | 'support';
  }>;
  pageObjects: ConvertedPageObject[];
  summary: {
    totalFiles: number;
    convertedFiles: number;
    pageObjectFiles: number;
    warnings: string[];
    errors: string[];
    conversionRate: number;
  };
}

export class EnhancedConversionService {
  private pageObjectAnalyzer: PageObjectAnalyzer;
  private pageObjectTransformer: PageObjectTransformer;
  private testStructureConverter: TestStructureConverter;
  private importDeduplicationService: ImportDeduplicationService;
  private importPathTransformer: ImportPathTransformer;

  constructor() {
    this.pageObjectAnalyzer = new PageObjectAnalyzer();
    this.pageObjectTransformer = new PageObjectTransformer();
    this.testStructureConverter = new TestStructureConverter();
    this.importDeduplicationService = new ImportDeduplicationService();
    this.importPathTransformer = new ImportPathTransformer();
  }

  /**
   * Convert entire Cypress project with enhanced features
   */
  async convertProject(options: EnhancedConversionOptions): Promise<ConversionResult> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const convertedFiles: Array<{
      originalPath: string;
      convertedPath: string;
      content: string;
      type: 'test' | 'pageObject' | 'support';
    }> = [];

    try {
      // Step 1: Analyze page objects if enabled
      let pageObjectAnalysis: PageObjectAnalysisResult | null = null;
      let convertedPageObjects: ConvertedPageObject[] = [];

      if (options.convertPageObjects) {
        if (options.verbose) console.log('🔍 Analyzing page objects...');
        // Find page object files
        const pageObjectFiles = await this.findPageObjectFiles(options.sourceDir);

        if (pageObjectFiles.length > 0) {
          const pageObjectAnalyses = await this.pageObjectAnalyzer.analyzeMultiplePageObjects(pageObjectFiles);

          if (options.verbose) console.log('🔄 Converting page objects...');
          // Transform each page object
          for (let i = 0; i < pageObjectAnalyses.length; i++) {
            const analysis = pageObjectAnalyses[i];
            const filePath = pageObjectFiles[i];

            if (analysis.isPageObject) {
              const convertedPageObject = this.pageObjectTransformer.generatePlaywrightPageObject(
                analysis,
                { preserveClassName: options.preserveMethodChaining }
              );

              convertedFiles.push({
                originalPath: filePath.replace(options.outputDir, options.sourceDir),
                convertedPath: filePath,
                content: convertedPageObject.generatedCode,
                type: 'pageObject'
              });

              convertedPageObjects.push(convertedPageObject);
            }
          }
        }
      }

      // Step 2: Find and convert test files
      if (options.verbose) console.log('🔍 Finding test files...');
      const testFiles = await this.findTestFiles(options.sourceDir);

      for (const testFile of testFiles) {
        try {
          if (options.verbose) console.log(`🔄 Converting test file: ${testFile}`);
          const convertedTest = await this.convertSingleTestFile(testFile, options, pageObjectAnalysis);

          if (convertedTest) {
            convertedFiles.push({
              originalPath: testFile,
              convertedPath: convertedTest.outputPath,
              content: convertedTest.content,
              type: 'test'
            });
            warnings.push(...convertedTest.warnings);
          }
        } catch (error) {
          errors.push(`Failed to convert test file ${testFile}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Step 3: Convert support files
      if (options.verbose) console.log('🔍 Converting support files...');
      const supportFiles = await this.findSupportFiles(options.sourceDir);

      for (const supportFile of supportFiles) {
        try {
          const convertedSupport = await this.convertSupportFile(supportFile, options);
          if (convertedSupport) {
            convertedFiles.push({
              originalPath: supportFile,
              convertedPath: convertedSupport.outputPath,
              content: convertedSupport.content,
              type: 'support'
            });
            warnings.push(...convertedSupport.warnings);
          }
        } catch (error) {
          errors.push(`Failed to convert support file ${supportFile}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Step 4: Write all converted files
      if (options.verbose) console.log('💾 Writing converted files...');
      await this.writeConvertedFiles(convertedFiles, options.outputDir);

      // Create summary
      const totalFiles = testFiles.length + supportFiles.length + convertedPageObjects.length;
      const conversionRate = totalFiles > 0 ? (convertedFiles.length / totalFiles) * 100 : 0;

      return {
        convertedFiles,
        pageObjects: convertedPageObjects,
        summary: {
          totalFiles,
          convertedFiles: convertedFiles.length,
          pageObjectFiles: convertedPageObjects.length,
          warnings,
          errors,
          conversionRate
        }
      };

    } catch (error) {
      errors.push(`Project conversion failed: ${error instanceof Error ? error.message : String(error)}`);

      return {
        convertedFiles: [],
        pageObjects: [],
        summary: {
          totalFiles: 0,
          convertedFiles: 0,
          pageObjectFiles: 0,
          warnings,
          errors,
          conversionRate: 0
        }
      };
    }
  }

  /**
   * Convert a single test file with all enhancements
   */
  private async convertSingleTestFile(
    testFilePath: string,
    options: EnhancedConversionOptions,
    pageObjectAnalysis: PageObjectAnalysisResult | null
  ): Promise<{
    content: string;
    outputPath: string;
    warnings: string[];
  } | null> {
    const warnings: string[] = [];

    try {
      let content = await fs.readFile(testFilePath, 'utf-8');

      // Step 1: Transform import paths if enabled (simplified approach)
      if (options.transformImportPaths) {
        // Use basic import path normalization
        content = this.normalizeImportPaths(content, testFilePath, warnings);
      }

      // Step 2: Convert test structure (describe/context blocks)
      if (options.convertTestStructure) {
        // Parse the test file structure
        const parsedFile = await this.parseTestFileStructure(content, testFilePath);

        if (parsedFile) {
          const structureResult = this.testStructureConverter.convertTestFile(
            parsedFile,
            {
              preserveHooks: true,
              convertAssertions: true,
              usePageObjects: options.convertPageObjects && pageObjectAnalysis !== null
            }
          );
          content = structureResult.content;
          warnings.push(...structureResult.warnings);
        }
      }

      // Step 3: Deduplicate imports if enabled (simplified approach)
      if (options.deduplicateImports) {
        content = this.simplifyImportDeduplication(content, testFilePath, warnings);
      }

      // Generate output path
      const outputPath = this.generateOutputPath(testFilePath, options.sourceDir, options.outputDir);

      return {
        content,
        outputPath,
        warnings
      };

    } catch (error) {
      warnings.push(`Failed to convert test file ${testFilePath}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Convert a support file
   */
  private async convertSupportFile(
    supportFilePath: string,
    options: EnhancedConversionOptions
  ): Promise<{
    content: string;
    outputPath: string;
    warnings: string[];
  } | null> {
    const warnings: string[] = [];

    try {
      let content = await fs.readFile(supportFilePath, 'utf-8');

      // Transform import paths (simplified approach)
      if (options.transformImportPaths) {
        content = this.normalizeImportPaths(content, supportFilePath, warnings);
      }

      // Deduplicate imports (simplified approach)
      if (options.deduplicateImports) {
        content = this.simplifyImportDeduplication(content, supportFilePath, warnings);
      }

      // Convert custom commands to page object methods
      content = this.convertCustomCommandsToComments(content, warnings);

      const outputPath = this.generateOutputPath(supportFilePath, options.sourceDir, options.outputDir);

      return {
        content,
        outputPath,
        warnings
      };

    } catch (error) {
      warnings.push(`Failed to convert support file ${supportFilePath}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Parse test file structure (simplified)
   */
  private async parseTestFileStructure(content: string, filePath: string): Promise<CypressTestFile | null> {
    // This is a simplified parser - in a real implementation, you'd use AST parsing
    const lines = content.split('\n');
    const describes: any[] = [];
    let currentDescribe: any = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Find describe/context blocks
      const describeMatch = line.match(/(?:describe|context)\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (describeMatch) {
        if (currentDescribe) {
          describes.push(currentDescribe);
        }
        currentDescribe = {
          name: describeMatch[1],
          tests: [],
          describes: [],
          hooks: []
        };
      }

      // Find test blocks
      const testMatch = line.match(/it\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (testMatch && currentDescribe) {
        currentDescribe.tests.push({
          name: testMatch[1],
          commands: [] // Simplified - would extract actual commands
        });
      }
    }

    if (currentDescribe) {
      describes.push(currentDescribe);
    }

    return {
      filePath,
      describes,
      cypressCommands: [],
      imports: []
    };
  }

  /**
   * Convert custom commands to TODO comments
   */
  private convertCustomCommandsToComments(content: string, warnings: string[]): string {
    return content.replace(/Cypress\.Commands\.add\(/g, (match) => {
      warnings.push('Custom command found - converted to TODO comment');
      return '// TODO: Convert custom command: ' + match;
    });
  }

  /**
   * Find all test files in the project
   */
  private async findTestFiles(sourceDir: string): Promise<string[]> {
    const testFiles: string[] = [];
    const testDirs = [
      path.join(sourceDir, 'e2e'),
      path.join(sourceDir, 'integration'),
      path.join(sourceDir, 'component'),
      path.join(sourceDir, 'cypress', 'e2e'),
      path.join(sourceDir, 'cypress', 'integration'),
      path.join(sourceDir, 'cypress', 'component')
    ];

    for (const testDir of testDirs) {
      if (await fs.pathExists(testDir)) {
        const files = await this.getFilesRecursively(testDir);
        const cypressTestFiles = files.filter(file =>
          (file.endsWith('.ts') || file.endsWith('.js')) &&
          (file.includes('.cy.') || file.includes('.spec.') || file.includes('.test.'))
        );
        testFiles.push(...cypressTestFiles);
      }
    }

    return testFiles;
  }

  /**
   * Find all page object files in the project
   */
  private async findPageObjectFiles(sourceDir: string): Promise<string[]> {
    const pageObjectFiles: string[] = [];
    const pageDirs = [
      path.join(sourceDir, 'pages'),
      path.join(sourceDir, 'page-objects'),
      path.join(sourceDir, 'support', 'pages'),
      path.join(sourceDir, 'support', 'page-objects'),
      path.join(sourceDir, 'cypress', 'pages'),
      path.join(sourceDir, 'cypress', 'page-objects'),
      path.join(sourceDir, 'cypress', 'pageObjects'),
      path.join(sourceDir, 'cypress', 'support', 'pages'),
      path.join(sourceDir, 'cypress', 'support', 'page-objects')
    ];

    for (const pageDir of pageDirs) {
      if (await fs.pathExists(pageDir)) {
        const files = await this.getFilesRecursively(pageDir);
        const pageFiles = files.filter(file =>
          (file.endsWith('.ts') || file.endsWith('.js')) &&
          !file.includes('.spec.') &&
          !file.includes('.test.')
        );
        pageObjectFiles.push(...pageFiles);
      }
    }

    return pageObjectFiles;
  }

  /**
   * Find all support files in the project
   */
  private async findSupportFiles(sourceDir: string): Promise<string[]> {
    const supportFiles: string[] = [];
    const supportDir = path.join(sourceDir, 'support');

    if (await fs.pathExists(supportDir)) {
      const files = await this.getFilesRecursively(supportDir);
      const supportFilesList = files.filter(file =>
        (file.endsWith('.ts') || file.endsWith('.js')) &&
        !file.includes('.spec.') &&
        !file.includes('.test.')
      );
      supportFiles.push(...supportFilesList);
    }

    return supportFiles;
  }

  /**
   * Get files recursively from directory
   */
  private async getFilesRecursively(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.getFilesRecursively(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Generate output path for converted file
   */
  private generateOutputPath(inputPath: string, sourceDir: string, outputDir: string): string {
    const relativePath = path.relative(sourceDir, inputPath);

    return path.join(outputDir, relativePath)
      .replace(/cypress[\/\\](e2e|integration)/g, outputDir)
      .replace(/\.cy\.(js|ts)/, '.spec.$1')
      .replace(/cypress[\/\\]pages/g, `${outputDir}/pages`)
      .replace(/cypress[\/\\]support/g, `${outputDir}/support`);
  }

  /**
   * Write all converted files to output directory
   */
  private async writeConvertedFiles(
    convertedFiles: Array<{ originalPath: string; convertedPath: string; content: string; type: string }>,
    outputDir: string
  ): Promise<void> {
    for (const file of convertedFiles) {
      const fullOutputPath = path.resolve(outputDir, file.convertedPath);
      await fs.ensureDir(path.dirname(fullOutputPath));
      await fs.writeFile(fullOutputPath, file.content, 'utf-8');
    }

    // Generate page object index file if page objects exist
    const pageObjects = convertedFiles.filter(f => f.type === 'pageObject');
    if (pageObjects.length > 0) {
      const indexContent = this.generateSimplePageObjectIndex(pageObjects);

      const indexPath = path.join(outputDir, 'pages', 'index.ts');
      await fs.ensureDir(path.dirname(indexPath));
      await fs.writeFile(indexPath, indexContent, 'utf-8');
    }
  }

  /**
   * Simple import path normalization
   */
  private normalizeImportPaths(content: string, filePath: string, warnings: string[]): string {
    // Basic import path normalization - convert relative paths to use Playwright conventions
    const normalized = content
      .replace(/from ['"]\.\.\/\.\.\/pages\//g, "from '../pages/")
      .replace(/from ['"]\.\.\/pages\//g, "from './pages/")
      .replace(/from ['"]cypress\//g, "from '@playwright/test'");

    if (normalized !== content) {
      warnings.push('Import paths normalized for Playwright structure');
    }

    return normalized;
  }

  /**
   * Simple import deduplication
   */
  private simplifyImportDeduplication(content: string, filePath: string, warnings: string[]): string {
    // Basic duplicate import removal
    const lines = content.split('\n');
    const importMap = new Map<string, string>();
    const processedLines: string[] = [];

    for (const line of lines) {
      if (line.trim().startsWith('import ')) {
        const key = line.trim();
        if (!importMap.has(key)) {
          importMap.set(key, line);
          processedLines.push(line);
        } else {
          warnings.push(`Removed duplicate import: ${key}`);
        }
      } else {
        processedLines.push(line);
      }
    }

    return processedLines.join('\n');
  }

  /**
   * Generate simple page object index file
   */
  private generateSimplePageObjectIndex(pageObjects: Array<{ originalPath: string; convertedPath: string; content: string; type: string }>): string {
    const exports = pageObjects.map(po => {
      const className = path.basename(po.convertedPath, '.ts');
      const relativePath = `./${className}`;
      return `export { ${className} } from '${relativePath}';`;
    });

    return [
      '// Auto-generated page object index',
      '// This file exports all page objects for easy importing',
      '',
      ...exports,
      ''
    ].join('\n');
  }
}