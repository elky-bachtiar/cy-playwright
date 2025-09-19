import * as fs from 'fs-extra';
import * as path from 'path';
import * as ts from 'typescript';
import { Logger } from '../utils/logger';

export interface ImportInfo {
  source: string;
  defaultImport?: string;
  namedImports?: string[];
  namespaceImport?: string;
  line: number;
  isTypeOnly?: boolean;
}

export interface DuplicateImport {
  source: string;
  imports: ImportInfo[];
}

export interface CypressImport {
  source: string;
  namedImports?: string[];
  defaultImport?: string;
  shouldRemove: boolean;
  reason: string;
  line: number;
}

export interface OrganizedImport {
  category: 'builtin' | 'external' | 'relative';
  source: string;
  imports: string[];
  defaultImport?: string;
  namespaceImport?: string;
}

export interface ImportAnalysisResults {
  duplicates: DuplicateImport[];
  cypressImports: CypressImport[];
  legitImports: ImportInfo[];
  totalImports: number;
}

export interface ImportOrganizationResults {
  organized: OrganizedImport[];
  removed: CypressImport[];
  merged: DuplicateImport[];
}

export class ImportAnalyzer {
  private logger = new Logger('ImportAnalyzer');

  // Angular/Cypress-specific imports that should be removed from e2e tests
  private readonly cypressPatterns = [
    '@angular/core/testing',
    '@angular/platform-browser',
    '@angular/core',
    '@angular/common/testing',
    'jasmine',
    'karma'
  ];

  // Built-in Node.js modules
  private readonly builtinModules = [
    'fs', 'path', 'crypto', 'http', 'https', 'url', 'util', 'events',
    'stream', 'buffer', 'child_process', 'cluster', 'os', 'readline'
  ];

  async analyzeDuplicateImports(filePath: string): Promise<{ duplicates: DuplicateImport[] }> {
    try {
      this.logger.debug(`Analyzing duplicate imports for: ${filePath}`);

      const fileContent = await fs.readFile(filePath, 'utf8');
      const sourceFile = this.createSourceFile(filePath, fileContent);
      const imports = this.extractImports(sourceFile);

      const duplicates = this.findDuplicateImports(imports);

      this.logger.debug(`Found ${duplicates.length} duplicate import sources in ${filePath}`);
      return { duplicates };
    } catch (error) {
      this.logger.error(`Failed to analyze duplicate imports for ${filePath}:`, error);
      throw error;
    }
  }

  async analyzeCypressImports(filePath: string): Promise<{ cypressImports: CypressImport[], legitImports: ImportInfo[] }> {
    try {
      this.logger.debug(`Analyzing Cypress imports for: ${filePath}`);

      const fileContent = await fs.readFile(filePath, 'utf8');
      const sourceFile = this.createSourceFile(filePath, fileContent);
      const imports = this.extractImports(sourceFile);

      const cypressImports: CypressImport[] = [];
      const legitImports: ImportInfo[] = [];

      imports.forEach(importInfo => {
        if (this.isCypressImport(importInfo.source)) {
          cypressImports.push({
            source: importInfo.source,
            namedImports: importInfo.namedImports,
            defaultImport: importInfo.defaultImport,
            shouldRemove: true,
            reason: this.getCypressRemovalReason(importInfo.source),
            line: importInfo.line
          });
        } else {
          legitImports.push(importInfo);
        }
      });

      this.logger.debug(`Found ${cypressImports.length} Cypress imports and ${legitImports.length} legitimate imports`);
      return { cypressImports, legitImports };
    } catch (error) {
      this.logger.error(`Failed to analyze Cypress imports for ${filePath}:`, error);
      throw error;
    }
  }

  async analyzeAllImports(filePath: string): Promise<ImportAnalysisResults> {
    try {
      this.logger.debug(`Analyzing all imports for: ${filePath}`);

      const fileContent = await fs.readFile(filePath, 'utf8');
      const sourceFile = this.createSourceFile(filePath, fileContent);
      const imports = this.extractImports(sourceFile);

      const duplicates = this.findDuplicateImports(imports);
      const cypressImports: CypressImport[] = [];
      const legitImports: ImportInfo[] = [];

      imports.forEach(importInfo => {
        if (this.isCypressImport(importInfo.source)) {
          cypressImports.push({
            source: importInfo.source,
            namedImports: importInfo.namedImports,
            defaultImport: importInfo.defaultImport,
            shouldRemove: true,
            reason: this.getCypressRemovalReason(importInfo.source),
            line: importInfo.line
          });
        } else {
          legitImports.push(importInfo);
        }
      });

      return {
        duplicates,
        cypressImports,
        legitImports,
        totalImports: imports.length
      };
    } catch (error) {
      this.logger.error(`Failed to analyze imports for ${filePath}:`, error);
      throw error;
    }
  }

  async organizeImports(filePath: string): Promise<ImportOrganizationResults> {
    try {
      this.logger.debug(`Organizing imports for: ${filePath}`);

      const analysis = await this.analyzeAllImports(filePath);
      const organized = this.categorizeAndMergeImports(analysis.legitImports);

      return {
        organized,
        removed: analysis.cypressImports,
        merged: analysis.duplicates
      };
    } catch (error) {
      this.logger.error(`Failed to organize imports for ${filePath}:`, error);
      throw error;
    }
  }

  mergeImports(duplicates: DuplicateImport[]): OrganizedImport[] {
    return duplicates.map(duplicate => {
      const allNamedImports = new Set<string>();
      let defaultImport: string | undefined;
      let namespaceImport: string | undefined;

      duplicate.imports.forEach(importInfo => {
        if (importInfo.namedImports) {
          importInfo.namedImports.forEach(named => allNamedImports.add(named));
        }
        if (importInfo.defaultImport) {
          defaultImport = importInfo.defaultImport;
        }
        if (importInfo.namespaceImport) {
          namespaceImport = importInfo.namespaceImport;
        }
      });

      return {
        category: this.categorizeImport(duplicate.source),
        source: duplicate.source,
        imports: Array.from(allNamedImports),
        defaultImport,
        namespaceImport
      };
    });
  }

  removeUnwantedImports(cypressImports: CypressImport[]): CypressImport[] {
    // Return empty array as these should all be removed
    return [];
  }

  private createSourceFile(filePath: string, sourceCode: string): ts.SourceFile {
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(filePath)
    );

    // Check for syntax errors
    const syntacticDiagnostics = (sourceFile as any).parseDiagnostics || [];
    if (syntacticDiagnostics.length > 0) {
      const errors = syntacticDiagnostics.map((diagnostic: ts.Diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      ).join('\n');
      this.logger.warn(`Syntax errors in ${filePath}, continuing with best effort parsing:\n${errors}`);
    }

    return sourceFile;
  }

  private getScriptKind(filePath: string): ts.ScriptKind {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
        return ts.ScriptKind.TS;
      case '.tsx':
        return ts.ScriptKind.TSX;
      case '.js':
        return ts.ScriptKind.JS;
      case '.jsx':
        return ts.ScriptKind.JSX;
      default:
        return ts.ScriptKind.TS;
    }
  }

  private extractImports(sourceFile: ts.SourceFile): ImportInfo[] {
    const imports: ImportInfo[] = [];

    const visitNode = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const importInfo = this.parseImportDeclaration(node, sourceFile);
        if (importInfo) {
          imports.push(importInfo);
        }
      }
      ts.forEachChild(node, visitNode);
    };

    visitNode(sourceFile);
    return imports;
  }

  private parseImportDeclaration(node: ts.ImportDeclaration, sourceFile: ts.SourceFile): ImportInfo | null {
    const source = (node.moduleSpecifier as ts.StringLiteral).text;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    let defaultImport: string | undefined;
    let namedImports: string[] | undefined;
    let namespaceImport: string | undefined;

    if (node.importClause) {
      // Default import
      if (node.importClause.name) {
        defaultImport = node.importClause.name.text;
      }

      // Named bindings
      if (node.importClause.namedBindings) {
        if (ts.isNamespaceImport(node.importClause.namedBindings)) {
          // import * as name
          namespaceImport = node.importClause.namedBindings.name.text;
        } else if (ts.isNamedImports(node.importClause.namedBindings)) {
          // import { name1, name2 }
          namedImports = node.importClause.namedBindings.elements.map(
            element => element.name.text
          );
        }
      }
    }

    return {
      source,
      defaultImport,
      namedImports,
      namespaceImport,
      line,
      isTypeOnly: node.importClause?.isTypeOnly || false
    };
  }

  private findDuplicateImports(imports: ImportInfo[]): DuplicateImport[] {
    const sourceMap = new Map<string, ImportInfo[]>();

    imports.forEach(importInfo => {
      if (!sourceMap.has(importInfo.source)) {
        sourceMap.set(importInfo.source, []);
      }
      sourceMap.get(importInfo.source)!.push(importInfo);
    });

    const duplicates: DuplicateImport[] = [];
    sourceMap.forEach((importList, source) => {
      if (importList.length > 1) {
        duplicates.push({
          source,
          imports: importList
        });
      }
    });

    return duplicates;
  }

  private isCypressImport(source: string): boolean {
    return this.cypressPatterns.some(pattern => source.startsWith(pattern));
  }

  private getCypressRemovalReason(source: string): string {
    if (source.startsWith('@angular')) {
      return 'Angular testing import not needed in e2e tests';
    }
    if (source.includes('jasmine') || source.includes('karma')) {
      return 'Unit testing framework import not needed in e2e tests';
    }
    return 'Cypress-specific import not compatible with Playwright';
  }

  private categorizeAndMergeImports(imports: ImportInfo[]): OrganizedImport[] {
    const categorized = new Map<string, {
      category: 'builtin' | 'external' | 'relative';
      namedImports: Set<string>;
      defaultImport?: string;
      namespaceImport?: string;
    }>();

    imports.forEach(importInfo => {
      const category = this.categorizeImport(importInfo.source);

      if (!categorized.has(importInfo.source)) {
        categorized.set(importInfo.source, {
          category,
          namedImports: new Set(),
          defaultImport: importInfo.defaultImport,
          namespaceImport: importInfo.namespaceImport
        });
      }

      const entry = categorized.get(importInfo.source)!;
      if (importInfo.namedImports) {
        importInfo.namedImports.forEach(named => entry.namedImports.add(named));
      }
    });

    // Convert to organized imports and sort
    const organized: OrganizedImport[] = Array.from(categorized.entries()).map(([source, info]) => ({
      category: info.category,
      source,
      imports: Array.from(info.namedImports).sort(),
      defaultImport: info.defaultImport,
      namespaceImport: info.namespaceImport
    }));

    // Sort by category, then by source
    organized.sort((a, b) => {
      const categoryOrder = { builtin: 0, external: 1, relative: 2 };
      const categoryDiff = categoryOrder[a.category] - categoryOrder[b.category];
      if (categoryDiff !== 0) return categoryDiff;
      return a.source.localeCompare(b.source);
    });

    return organized;
  }

  private categorizeImport(source: string): 'builtin' | 'external' | 'relative' {
    if (this.builtinModules.includes(source)) {
      return 'builtin';
    }
    if (source.startsWith('.')) {
      return 'relative';
    }
    return 'external';
  }
}