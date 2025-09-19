import { ImportAnalyzer, ImportStatement } from './import-analyzer';

export interface DeduplicationResult {
  content: string;
  removedDuplicates: string[];
  removedCypressImports: string[];
  addedPlaywrightImports: string[];
  warnings: string[];
}

export class ImportDeduplicationService {
  private importAnalyzer: ImportAnalyzer;

  constructor() {
    this.importAnalyzer = new ImportAnalyzer();
  }

  /**
   * Deduplicate and clean up imports in file content
   */
  deduplicateImports(content: string): DeduplicationResult {
    const removedDuplicates: string[] = [];
    const removedCypressImports: string[] = [];
    const addedPlaywrightImports: string[] = [];
    const warnings: string[] = [];

    // Analyze current imports
    const analysis = this.importAnalyzer.analyzeImports(content);

    // Track what we're removing
    analysis.cypressImports.forEach(imp => {
      removedCypressImports.push(imp.source);
    });

    // Remove Cypress imports
    const filteredImports = this.importAnalyzer.filterCypressImports(analysis.imports);

    // Handle duplicates
    const deduplicatedImports = this.deduplicateImportStatements(filteredImports);

    // Track removed duplicates
    if (analysis.duplicates.length > 0) {
      const duplicateGroups = this.groupDuplicatesBySource(analysis.duplicates);
      for (const [source, dups] of duplicateGroups) {
        if (dups.length > 1) {
          removedDuplicates.push(`Merged ${dups.length} duplicate imports from '${source}'`);
        }
      }
    }

    // Add Playwright imports if needed
    const playwrightImports = this.generatePlaywrightImports(content);
    const allImports = [...deduplicatedImports, ...playwrightImports];

    playwrightImports.forEach(imp => {
      addedPlaywrightImports.push(imp.source);
    });

    // Sort imports
    const sortedImports = this.importAnalyzer.sortImports(allImports);

    // Generate new content
    const newContent = this.replaceImportsInContent(content, sortedImports);

    // Add warnings for conflicts
    warnings.push(...analysis.conflicts);

    return {
      content: newContent,
      removedDuplicates,
      removedCypressImports,
      addedPlaywrightImports,
      warnings
    };
  }

  /**
   * Deduplicate import statements by merging those with same source
   */
  private deduplicateImportStatements(imports: ImportStatement[]): ImportStatement[] {
    const sourceMap = new Map<string, ImportStatement[]>();

    // Group imports by source
    for (const imp of imports) {
      if (!sourceMap.has(imp.source)) {
        sourceMap.set(imp.source, []);
      }
      sourceMap.get(imp.source)!.push(imp);
    }

    const deduplicatedImports: ImportStatement[] = [];

    // Merge imports with same source
    for (const [source, importsForSource] of sourceMap) {
      if (importsForSource.length === 1) {
        deduplicatedImports.push(importsForSource[0]);
      } else {
        // Merge multiple imports from same source
        const merged = this.importAnalyzer.mergeImports(importsForSource);
        deduplicatedImports.push(merged);
      }
    }

    return deduplicatedImports;
  }

  /**
   * Group duplicate imports by source
   */
  private groupDuplicatesBySource(duplicates: ImportStatement[]): Map<string, ImportStatement[]> {
    const groups = new Map<string, ImportStatement[]>();

    for (const duplicate of duplicates) {
      if (!groups.has(duplicate.source)) {
        groups.set(duplicate.source, []);
      }
      groups.get(duplicate.source)!.push(duplicate);
    }

    return groups;
  }

  /**
   * Generate necessary Playwright imports based on content
   */
  private generatePlaywrightImports(content: string): ImportStatement[] {
    const imports: ImportStatement[] = [];

    // Always add basic Playwright test imports if test content is present
    if (this.containsTestContent(content)) {
      imports.push({
        raw: "import { test, expect } from '@playwright/test';",
        source: '@playwright/test',
        namedImports: ['test', 'expect'],
        type: 'playwright'
      });
    }

    // Add Page import if page object patterns detected
    if (this.containsPageObjectPatterns(content)) {
      // Check if Page is already imported
      const hasPageImport = imports.some(imp =>
        imp.namedImports.includes('Page') || imp.namedImports.includes('Locator')
      );

      if (!hasPageImport) {
        imports.push({
          raw: "import { Page, Locator } from '@playwright/test';",
          source: '@playwright/test',
          namedImports: ['Page', 'Locator'],
          type: 'playwright'
        });
      }
    }

    // Add fs and path imports if fixture patterns detected
    if (this.containsFixturePatterns(content)) {
      imports.push({
        raw: "import * as fs from 'fs-extra';",
        source: 'fs-extra',
        namespaceImport: 'fs',
        namedImports: [],
        type: 'external'
      });

      imports.push({
        raw: "import * as path from 'path';",
        source: 'path',
        namespaceImport: 'path',
        namedImports: [],
        type: 'builtin'
      });
    }

    return imports;
  }

  /**
   * Check if content contains test-related patterns
   */
  private containsTestContent(content: string): boolean {
    return /\b(describe|it|test|beforeEach|afterEach|before|after)\s*\(/.test(content) ||
           content.includes('cy.') ||
           content.includes('test(') ||
           content.includes('test.describe');
  }

  /**
   * Check if content contains page object patterns
   */
  private containsPageObjectPatterns(content: string): boolean {
    return /class\s+\w+Page/.test(content) ||
           content.includes('constructor(private page: Page)') ||
           content.includes('Page, Locator') ||
           /@By\./.test(content);
  }

  /**
   * Check if content contains fixture patterns
   */
  private containsFixturePatterns(content: string): boolean {
    return content.includes('cy.fixture(') ||
           content.includes('fixtures/') ||
           content.includes('JSON.parse') && content.includes('readFile');
  }

  /**
   * Replace imports in content with new deduplicated imports
   */
  private replaceImportsInContent(content: string, newImports: ImportStatement[]): string {
    const lines = content.split('\n');
    const newLines: string[] = [];
    let inImportSection = false;
    let importSectionEnded = false;

    // Find where imports section starts and ends
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if this line is an import
      const isImportLine = line.startsWith('import ') && line.includes(' from ');

      if (isImportLine && !importSectionEnded) {
        if (!inImportSection) {
          // First import found, add all new imports here
          inImportSection = true;
          const importSection = this.generateImportSection(newImports);
          newLines.push(importSection);
        }
        // Skip this line (it's being replaced)
        continue;
      } else if (inImportSection && !isImportLine && line && !line.startsWith('//')) {
        // Import section has ended
        inImportSection = false;
        importSectionEnded = true;
        newLines.push(lines[i]);
      } else if (!inImportSection) {
        // Normal line, keep it
        newLines.push(lines[i]);
      }
    }

    // If no imports were found, add them at the beginning
    if (!importSectionEnded && newImports.length > 0) {
      const importSection = this.generateImportSection(newImports);
      return `${importSection}\n\n${content}`;
    }

    return newLines.join('\n');
  }

  /**
   * Generate formatted import section
   */
  private generateImportSection(imports: ImportStatement[]): string {
    if (imports.length === 0) {
      return '';
    }

    const groups: { [key: string]: ImportStatement[] } = {
      builtin: [],
      external: [],
      playwright: [],
      relative: []
    };

    // Group imports by type
    for (const imp of imports) {
      if (groups[imp.type]) {
        groups[imp.type].push(imp);
      }
    }

    const sections: string[] = [];

    // Add each group with spacing
    for (const [groupName, groupImports] of Object.entries(groups)) {
      if (groupImports.length > 0) {
        const importLines = groupImports.map(imp => imp.raw);
        sections.push(importLines.join('\n'));
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Clean up import statement formatting
   */
  private cleanImportStatement(importStatement: string): string {
    return importStatement
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/,\s*}/g, ' }') // Clean up trailing commas
      .replace(/{\s+/g, '{ ') // Clean up opening braces
      .replace(/\s+}/g, ' }') // Clean up closing braces
      .trim();
  }
}