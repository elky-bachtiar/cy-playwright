export interface ImportStatement {
  raw: string;
  source: string;
  namedImports: string[];
  defaultImport?: string;
  namespaceImport?: string;
  type: 'builtin' | 'external' | 'relative' | 'cypress' | 'playwright';
  lineNumber?: number;
}

export interface ImportAnalysisResult {
  imports: ImportStatement[];
  duplicates: ImportStatement[];
  conflicts: string[];
  cypressImports: ImportStatement[];
  playwrightImports: ImportStatement[];
}

export class ImportAnalyzer {

  /**
   * Analyze imports in a file content
   */
  analyzeImports(content: string): ImportAnalysisResult {
    const imports = this.extractImports(content);
    const duplicates = this.findDuplicateImports(imports);
    const conflicts = this.findImportConflicts(imports);
    const cypressImports = imports.filter(imp => imp.type === 'cypress');
    const playwrightImports = imports.filter(imp => imp.type === 'playwright');

    return {
      imports,
      duplicates,
      conflicts,
      cypressImports,
      playwrightImports
    };
  }

  /**
   * Extract all import statements from content
   */
  private extractImports(content: string): ImportStatement[] {
    const imports: ImportStatement[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip comments and empty lines
      if (!line || line.startsWith('//') || line.startsWith('/*')) {
        continue;
      }

      // Match various import patterns
      const importMatch = line.match(/^import\s+(.+?)\s+from\s+['"](.*?)['"];?$/);
      if (importMatch) {
        const importClause = importMatch[1].trim();
        const source = importMatch[2];

        const importStatement = this.parseImportClause(importClause, source, line, i + 1);
        imports.push(importStatement);
      }
    }

    return imports;
  }

  /**
   * Parse import clause to extract named, default, and namespace imports
   */
  private parseImportClause(
    importClause: string,
    source: string,
    rawStatement: string,
    lineNumber: number
  ): ImportStatement {
    let defaultImport: string | undefined;
    let namespaceImport: string | undefined;
    const namedImports: string[] = [];

    // Handle namespace import: import * as name from 'module'
    const namespaceMatch = importClause.match(/^\*\s+as\s+(\w+)$/);
    if (namespaceMatch) {
      namespaceImport = namespaceMatch[1];
    } else {
      // Split by comma to handle mixed imports
      const parts = importClause.split(',').map(part => part.trim());

      for (const part of parts) {
        // Check for default import (simple identifier)
        if (/^\w+$/.test(part)) {
          defaultImport = part;
        }
        // Check for named imports in braces
        else if (part.includes('{') || part.includes('}')) {
          const namedMatch = part.match(/\{([^}]+)\}/);
          if (namedMatch) {
            const named = namedMatch[1]
              .split(',')
              .map(item => item.trim())
              .filter(Boolean);
            namedImports.push(...named);
          }
        }
        // Handle mixed default and named: default, { named }
        else if (part.includes('{')) {
          const mixedMatch = part.match(/(\w+),?\s*\{([^}]+)\}/);
          if (mixedMatch) {
            if (!defaultImport) defaultImport = mixedMatch[1].replace(',', '').trim();
            const named = mixedMatch[2]
              .split(',')
              .map(item => item.trim())
              .filter(Boolean);
            namedImports.push(...named);
          }
        }
      }
    }

    return {
      raw: rawStatement,
      source,
      namedImports,
      defaultImport,
      namespaceImport,
      type: this.categorizeImport(source),
      lineNumber
    };
  }

  /**
   * Categorize import based on source
   */
  private categorizeImport(source: string): ImportStatement['type'] {
    // Cypress-related imports
    if (source.includes('cypress') || source === '@cypress/webpack-preprocessor' ||
        source === 'cypress-selectors' || source.includes('@cypress/')) {
      return 'cypress';
    }

    // Playwright-related imports
    if (source.includes('@playwright/') || source === 'playwright') {
      return 'playwright';
    }

    // Built-in Node.js modules
    if (['fs', 'path', 'crypto', 'util', 'os', 'http', 'https', 'url', 'events'].includes(source) ||
        source.startsWith('node:')) {
      return 'builtin';
    }

    // Relative imports
    if (source.startsWith('./') || source.startsWith('../')) {
      return 'relative';
    }

    // External npm packages
    return 'external';
  }

  /**
   * Find duplicate imports (same source)
   */
  private findDuplicateImports(imports: ImportStatement[]): ImportStatement[] {
    const sourceMap = new Map<string, ImportStatement[]>();

    for (const imp of imports) {
      if (!sourceMap.has(imp.source)) {
        sourceMap.set(imp.source, []);
      }
      sourceMap.get(imp.source)!.push(imp);
    }

    const duplicates: ImportStatement[] = [];
    for (const [source, importsForSource] of sourceMap) {
      if (importsForSource.length > 1) {
        duplicates.push(...importsForSource);
      }
    }

    return duplicates;
  }

  /**
   * Find import conflicts (same import name from different sources)
   */
  private findImportConflicts(imports: ImportStatement[]): string[] {
    const nameToSources = new Map<string, Set<string>>();
    const conflicts: string[] = [];

    for (const imp of imports) {
      // Check default imports
      if (imp.defaultImport) {
        if (!nameToSources.has(imp.defaultImport)) {
          nameToSources.set(imp.defaultImport, new Set());
        }
        nameToSources.get(imp.defaultImport)!.add(imp.source);
      }

      // Check named imports
      for (const named of imp.namedImports) {
        const cleanName = named.split(' as ')[0].trim(); // Handle aliased imports
        if (!nameToSources.has(cleanName)) {
          nameToSources.set(cleanName, new Set());
        }
        nameToSources.get(cleanName)!.add(imp.source);
      }

      // Check namespace imports
      if (imp.namespaceImport) {
        if (!nameToSources.has(imp.namespaceImport)) {
          nameToSources.set(imp.namespaceImport, new Set());
        }
        nameToSources.get(imp.namespaceImport)!.add(imp.source);
      }
    }

    for (const [name, sources] of nameToSources) {
      if (sources.size > 1) {
        conflicts.push(`Import '${name}' comes from multiple sources: ${Array.from(sources).join(', ')}`);
      }
    }

    return conflicts;
  }

  /**
   * Check if imports are compatible (can be merged)
   */
  canMergeImports(import1: ImportStatement, import2: ImportStatement): boolean {
    return import1.source === import2.source;
  }

  /**
   * Merge compatible imports
   */
  mergeImports(imports: ImportStatement[]): ImportStatement {
    if (imports.length === 0) {
      throw new Error('Cannot merge empty imports array');
    }

    const firstImport = imports[0];
    const mergedImport: ImportStatement = {
      raw: '', // Will be regenerated
      source: firstImport.source,
      namedImports: [],
      type: firstImport.type
    };

    const allNamedImports = new Set<string>();
    let hasDefaultImport = false;
    let hasNamespaceImport = false;

    for (const imp of imports) {
      // Collect named imports
      for (const named of imp.namedImports) {
        allNamedImports.add(named);
      }

      // Handle default import (take first non-undefined)
      if (imp.defaultImport && !hasDefaultImport) {
        mergedImport.defaultImport = imp.defaultImport;
        hasDefaultImport = true;
      }

      // Handle namespace import (take first non-undefined)
      if (imp.namespaceImport && !hasNamespaceImport) {
        mergedImport.namespaceImport = imp.namespaceImport;
        hasNamespaceImport = true;
      }
    }

    mergedImport.namedImports = Array.from(allNamedImports).sort();
    mergedImport.raw = this.generateImportStatement(mergedImport);

    return mergedImport;
  }

  /**
   * Generate import statement string from ImportStatement object
   */
  private generateImportStatement(imp: ImportStatement): string {
    const parts: string[] = [];

    // Add default import
    if (imp.defaultImport) {
      parts.push(imp.defaultImport);
    }

    // Add namespace import
    if (imp.namespaceImport) {
      parts.push(`* as ${imp.namespaceImport}`);
    }

    // Add named imports
    if (imp.namedImports.length > 0) {
      const namedPart = `{ ${imp.namedImports.join(', ')} }`;
      parts.push(namedPart);
    }

    const importClause = parts.join(', ');
    return `import ${importClause} from '${imp.source}';`;
  }

  /**
   * Sort imports by category and source
   */
  sortImports(imports: ImportStatement[]): ImportStatement[] {
    const typeOrder = ['builtin', 'external', 'relative', 'playwright'];

    return imports.sort((a, b) => {
      // First sort by type
      const typeComparison = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
      if (typeComparison !== 0) {
        return typeComparison;
      }

      // Then sort by source alphabetically
      return a.source.localeCompare(b.source);
    });
  }

  /**
   * Filter out Cypress-specific imports that should be removed
   */
  filterCypressImports(imports: ImportStatement[]): ImportStatement[] {
    const cypressImportsToRemove = [
      'cypress',
      '@cypress/webpack-preprocessor',
      '@cypress/code-coverage',
      'cypress-real-events',
      'cypress-selectors',
      '@testing-library/cypress',
      'cypress-iframe',
      'cypress-file-upload'
    ];

    return imports.filter(imp =>
      !cypressImportsToRemove.includes(imp.source) &&
      !imp.source.startsWith('@cypress/') &&
      imp.type !== 'cypress'
    );
  }
}