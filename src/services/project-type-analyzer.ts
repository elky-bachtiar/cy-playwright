import * as fs from 'fs-extra';
import * as path from 'path';
import * as ts from 'typescript';
import { Logger } from '../utils/logger';

export interface ProjectTypeResult {
  type: 'angular-unit' | 'cypress-e2e' | 'playwright' | 'mixed' | 'unknown';
  confidence: number;
  indicators: string[];
  error?: string;
}

export interface FileAnalysis {
  filePath: string;
  type: ProjectTypeResult['type'];
  confidence: number;
  indicators: string[];
  size: number;
}

export interface ConversionScope {
  shouldConvert: string[];
  shouldPreserve: string[];
  conflicts: Array<{
    cypressFile: string;
    playwrightFile: string;
    recommendation: 'rename' | 'merge' | 'skip';
  }>;
}

export interface ProjectAnalysisResult {
  totalFiles: number;
  categorizedFiles: Record<ProjectTypeResult['type'], string[]>;
  conversionCandidates: string[];
  conversionScope: ConversionScope;
  performanceMetrics: {
    analysisTime: number;
    filesPerSecond: number;
  };
  summary: {
    cypressFiles: number;
    playwrightFiles: number;
    angularFiles: number;
    mixedFiles: number;
    unknownFiles: number;
  };
}

export interface FrameworkUsage {
  cypress: boolean;
  playwright: boolean;
  angular: boolean;
}

export class ProjectTypeAnalyzer {
  private logger: Logger;

  private readonly CYPRESS_PATTERNS = [
    /cy\.(visit|get|contains|click|type|should|wait|intercept|fixture)/,
    /cy\./,
    /Cypress\./,
    /@cypress/,
    /cypress/i
  ];

  private readonly PLAYWRIGHT_PATTERNS = [
    /@playwright\/test/,
    /page\.(goto|fill|click|locator|waitFor)/,
    /page\./,
    /await expect\(/,
    /test\(/,
    /toBeVisible|toHaveText|toHaveURL/
  ];

  private readonly ANGULAR_PATTERNS = [
    /ComponentFixture/,
    /TestBed/,
    /@angular\/core\/testing/,
    /configureTestingModule/,
    /detectChanges/,
    /beforeEach.*TestBed/
  ];

  constructor() {
    this.logger = new Logger('ProjectTypeAnalyzer');
  }

  async detectProjectType(filePath: string): Promise<ProjectTypeResult> {
    try {
      if (!await fs.pathExists(filePath)) {
        return {
          type: 'unknown',
          confidence: 0,
          indicators: [],
          error: 'File does not exist'
        };
      }

      const content = await fs.readFile(filePath, 'utf-8');
      return this.analyzeFileContent(content, filePath);
    } catch (error) {
      this.logger.error(`Error detecting project type for ${filePath}:`, error);
      return {
        type: 'unknown',
        confidence: 0,
        indicators: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private analyzeFileContent(content: string, filePath: string): ProjectTypeResult {
    try {
      const frameworkUsage = this.detectFrameworkUsage(content);
      const indicators: string[] = [];
      let type: ProjectTypeResult['type'] = 'unknown';
      let confidence = 0;

      // Check for import statements and usage patterns
      const imports = this.extractImports(content);

      // Angular detection
      if (frameworkUsage.angular) {
        type = 'angular-unit';
        confidence = 0.9;
        indicators.push('ComponentFixture', 'TestBed');
      }

      // Mixed framework detection
      if (frameworkUsage.cypress && frameworkUsage.playwright) {
        type = 'mixed';
        confidence = 0.8;
        indicators.push('@playwright/test', 'cy.visit');
      }
      // Playwright detection
      else if (frameworkUsage.playwright) {
        type = 'playwright';
        confidence = 0.9;
        indicators.push('@playwright/test', 'page.goto');
      }
      // Cypress detection
      else if (frameworkUsage.cypress) {
        type = 'cypress-e2e';
        confidence = 0.9;
        indicators.push('cy.visit', 'cy.get');
      }

      // Enhance confidence based on file extension and path
      if (filePath.includes('.cy.') && type === 'cypress-e2e') {
        confidence = Math.min(confidence + 0.1, 1.0);
      }
      if (filePath.includes('.spec.') && type === 'playwright') {
        confidence = Math.min(confidence + 0.1, 1.0);
      }
      if (filePath.includes('e2e/') && (type === 'cypress-e2e' || type === 'playwright')) {
        confidence = Math.min(confidence + 0.05, 1.0);
      }

      // Add import-based indicators
      imports.forEach(imp => {
        if (imp.includes('@playwright/test')) indicators.push('@playwright/test');
        if (imp.includes('@angular/core/testing')) indicators.push('@angular/core/testing');
        if (imp.includes('cypress')) indicators.push('cypress');
      });

      return {
        type,
        confidence,
        indicators: Array.from(new Set(indicators)) // Remove duplicates
      };
    } catch (error) {
      this.logger.warn(`Error analyzing file content for ${filePath}:`, error);
      return {
        type: 'unknown',
        confidence: 0,
        indicators: [],
        error: error instanceof Error ? error.message : 'Parse error'
      };
    }
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];

    try {
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
          const moduleSpecifier = node.moduleSpecifier.getText().replace(/['"]/g, '');
          imports.push(moduleSpecifier);
        }
        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch (error) {
      // If TypeScript parsing fails, fall back to regex
      const importRegex = /import.*?from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  detectFrameworkUsage(content: string): FrameworkUsage {
    return {
      cypress: this.CYPRESS_PATTERNS.some(pattern => pattern.test(content)),
      playwright: this.PLAYWRIGHT_PATTERNS.some(pattern => pattern.test(content)),
      angular: this.ANGULAR_PATTERNS.some(pattern => pattern.test(content))
    };
  }

  async analyzeProject(projectPath: string): Promise<ProjectAnalysisResult> {
    const startTime = Date.now();

    try {
      const allFiles = await this.getAllTestFiles(projectPath);
      const categorizedFiles: Record<ProjectTypeResult['type'], string[]> = {
        'angular-unit': [],
        'cypress-e2e': [],
        'playwright': [],
        'mixed': [],
        'unknown': []
      };

      const fileAnalyses: FileAnalysis[] = [];

      // Analyze each file
      for (const file of allFiles) {
        const analysis = await this.detectProjectType(file);
        categorizedFiles[analysis.type].push(file);

        const stats = await fs.stat(file);
        fileAnalyses.push({
          filePath: file,
          type: analysis.type,
          confidence: analysis.confidence,
          indicators: analysis.indicators,
          size: stats.size
        });
      }

      // Determine conversion scope
      const conversionScope = this.determineConversionScope(categorizedFiles);

      const endTime = Date.now();
      const analysisTime = endTime - startTime;

      return {
        totalFiles: allFiles.length,
        categorizedFiles,
        conversionCandidates: categorizedFiles['cypress-e2e'],
        conversionScope,
        performanceMetrics: {
          analysisTime,
          filesPerSecond: allFiles.length / (analysisTime / 1000)
        },
        summary: {
          cypressFiles: categorizedFiles['cypress-e2e'].length,
          playwrightFiles: categorizedFiles['playwright'].length,
          angularFiles: categorizedFiles['angular-unit'].length,
          mixedFiles: categorizedFiles['mixed'].length,
          unknownFiles: categorizedFiles['unknown'].length
        }
      };
    } catch (error) {
      this.logger.error('Error analyzing project:', error);
      throw error;
    }
  }

  private async getAllTestFiles(projectPath: string): Promise<string[]> {
    const testFiles: string[] = [];

    const scanDirectory = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dirPath);

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry);
          const stats = await fs.stat(fullPath);

          if (stats.isDirectory()) {
            // Skip node_modules and other irrelevant directories
            if (!['node_modules', '.git', 'dist', 'build'].includes(entry)) {
              await scanDirectory(fullPath);
            }
          } else if (stats.isFile() && this.isTestFile(entry)) {
            testFiles.push(fullPath);
          }
        }
      } catch (error) {
        this.logger.warn(`Error scanning directory ${dirPath}:`, error);
      }
    };

    await scanDirectory(projectPath);
    return testFiles;
  }

  private isTestFile(fileName: string): boolean {
    const testExtensions = ['.ts', '.js'];
    const testPatterns = [
      /\.spec\./,
      /\.test\./,
      /\.cy\./,
      /\.e2e\./
    ];

    const hasTestExtension = testExtensions.some(ext => fileName.endsWith(ext));
    const hasTestPattern = testPatterns.some(pattern => pattern.test(fileName));

    return hasTestExtension && hasTestPattern;
  }

  getFileCategory(fileName: string): string {
    if (fileName.includes('.cy.')) return 'potential-cypress';
    if (fileName.includes('.spec.')) return 'potential-test';
    if (fileName.includes('.component.spec.')) return 'potential-angular';
    if (fileName.includes('e2e/')) return 'potential-e2e';
    return 'support';
  }

  private determineConversionScope(categorizedFiles: Record<ProjectTypeResult['type'], string[]>): ConversionScope {
    const shouldConvert = [...categorizedFiles['cypress-e2e']];
    const shouldPreserve = [
      ...categorizedFiles['angular-unit'],
      ...categorizedFiles['playwright'],
      ...categorizedFiles['unknown']
    ];
    const conflicts: ConversionScope['conflicts'] = [];

    // Detect naming conflicts between Cypress and Playwright files
    const cypressFiles = categorizedFiles['cypress-e2e'];
    const playwrightFiles = categorizedFiles['playwright'];

    for (const cypressFile of cypressFiles) {
      const baseName = path.basename(cypressFile, path.extname(cypressFile)).replace('.cy', '');

      for (const playwrightFile of playwrightFiles) {
        const playwrightBaseName = path.basename(playwrightFile, path.extname(playwrightFile)).replace('.spec', '');

        if (baseName === playwrightBaseName) {
          conflicts.push({
            cypressFile,
            playwrightFile,
            recommendation: 'rename'
          });
        }
      }
    }

    return {
      shouldConvert,
      shouldPreserve,
      conflicts
    };
  }
}