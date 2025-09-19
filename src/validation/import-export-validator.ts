import { Logger } from '../utils/logger';
import * as ts from 'typescript';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface ImportValidationResult {
  isValid: boolean;
  errors: ImportValidationError[];
  warnings: ImportValidationWarning[];
  playwrightImports: string[];
  typeImports: string[];
  relativeImports: string[];
  missingImports: string[];
  unusedImports: string[];
  invalidPaths: string[];
}

export interface ExportValidationResult {
  isValid: boolean;
  namedExports: string[];
  hasDefaultExport: boolean;
  errors: ImportValidationError[];
  warnings: ImportValidationWarning[];
}

export interface ImportValidationError {
  type: 'missing_import' | 'invalid_import_path' | 'syntax_error';
  message: string;
  importName?: string;
  suggestion?: string;
}

export interface ImportValidationWarning {
  type: 'unused_import' | 'deprecated_import' | 'suboptimal_path';
  message: string;
  importName?: string;
  suggestion?: string;
}

export class ImportExportValidator {
  private logger = new Logger('ImportExportValidator');

  // Essential Playwright imports
  private essentialPlaywrightImports = new Set([
    'test', 'expect'
  ]);

  // Common Playwright imports
  private commonPlaywrightImports = new Set([
    'test', 'expect', 'Page', 'BrowserContext', 'Browser',
    'Locator', 'Response', 'Request', 'ElementHandle',
    'PlaywrightTestConfig', 'PlaywrightTestOptions'
  ]);

  // Playwright browser imports
  private playwrightBrowserImports = new Set([
    'chromium', 'firefox', 'webkit'
  ]);

  async validateImports(content: string, filePath: string): Promise<ImportValidationResult> {
    this.logger.debug(`Validating imports in: ${filePath}`);

    const result: ImportValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      playwrightImports: [],
      typeImports: [],
      relativeImports: [],
      missingImports: [],
      unusedImports: [],
      invalidPaths: []
    };

    try {
      // Parse imports using TypeScript AST
      await this.parseImports(content, filePath, result);

      // Validate essential imports are present
      this.validateEssentialImports(content, result);

      // Check for unused imports
      this.validateImportUsage(content, result);

      // Validate relative import paths
      await this.validateRelativePaths(result.relativeImports, filePath, result);

      // Determine overall validity
      result.isValid = result.errors.length === 0;

    } catch (error) {
      this.logger.error('Import validation failed:', error);
      result.isValid = false;
      result.errors.push({
        type: 'syntax_error',
        message: `Import validation error: ${error.message}`
      });
    }

    return result;
  }

  async validateExports(content: string, filePath: string): Promise<ExportValidationResult> {
    this.logger.debug(`Validating exports in: ${filePath}`);

    const result: ExportValidationResult = {
      isValid: true,
      namedExports: [],
      hasDefaultExport: false,
      errors: [],
      warnings: []
    };

    try {
      await this.parseExports(content, result);
      result.isValid = result.errors.length === 0;
    } catch (error) {
      this.logger.error('Export validation failed:', error);
      result.isValid = false;
      result.errors.push({
        type: 'syntax_error',
        message: `Export validation error: ${error.message}`
      });
    }

    return result;
  }

  private async parseImports(content: string, filePath: string, result: ImportValidationResult): Promise<void> {
    const sourceFile = ts.createSourceFile(
      path.basename(filePath),
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        this.processImportDeclaration(node, result);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private processImportDeclaration(node: ts.ImportDeclaration, result: ImportValidationResult): void {
    const moduleSpecifier = node.moduleSpecifier;

    if (!ts.isStringLiteral(moduleSpecifier)) {
      return;
    }

    const moduleName = moduleSpecifier.text;

    // Process Playwright imports
    if (moduleName === '@playwright/test') {
      this.processPlaywrightTestImports(node, result);
    } else if (moduleName === 'playwright') {
      this.processPlaywrightBrowserImports(node, result);
    } else if (moduleName.startsWith('.')) {
      // Relative import
      result.relativeImports.push(moduleName);
    }

    // Check for type imports
    if (node.importClause?.isTypeOnly) {
      this.processTypeImports(node, result);
    }
  }

  private processPlaywrightTestImports(node: ts.ImportDeclaration, result: ImportValidationResult): void {
    if (!node.importClause) return;

    // Named imports
    if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const element of node.importClause.namedBindings.elements) {
        const importName = element.name.text;
        result.playwrightImports.push(importName);
      }
    }

    // Namespace imports (import * as playwright from '@playwright/test')
    if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
      const namespaceName = node.importClause.namedBindings.name.text;
      result.playwrightImports.push(`* as ${namespaceName}`);
    }
  }

  private processPlaywrightBrowserImports(node: ts.ImportDeclaration, result: ImportValidationResult): void {
    if (!node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)) {
      return;
    }

    for (const element of node.importClause.namedBindings.elements) {
      const importName = element.name.text;
      if (this.playwrightBrowserImports.has(importName)) {
        result.playwrightImports.push(importName);
      }
    }
  }

  private processTypeImports(node: ts.ImportDeclaration, result: ImportValidationResult): void {
    if (!node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)) {
      return;
    }

    for (const element of node.importClause.namedBindings.elements) {
      const importName = element.name.text;
      result.typeImports.push(importName);
    }
  }

  private validateEssentialImports(content: string, result: ImportValidationResult): void {
    // Check if test() is used
    if (content.includes('test(') && !result.playwrightImports.includes('test')) {
      result.missingImports.push('test');
      result.errors.push({
        type: 'missing_import',
        message: 'Missing import for "test" from @playwright/test',
        importName: 'test',
        suggestion: 'Add: import { test } from \'@playwright/test\';'
      });
    }

    // Check if expect() is used
    if (content.includes('expect(') && !result.playwrightImports.includes('expect')) {
      result.missingImports.push('expect');
      result.errors.push({
        type: 'missing_import',
        message: 'Missing import for "expect" from @playwright/test',
        importName: 'expect',
        suggestion: 'Add: import { expect } from \'@playwright/test\';'
      });
    }

    // Check for Page type usage
    if (content.includes(': Page') && !result.playwrightImports.includes('Page') && !result.typeImports.includes('Page')) {
      result.warnings.push({
        type: 'unused_import',
        message: 'Page type used but not imported',
        importName: 'Page',
        suggestion: 'Add: import type { Page } from \'@playwright/test\';'
      });
    }
  }

  private validateImportUsage(content: string, result: ImportValidationResult): void {
    // Check each imported item to see if it's actually used
    for (const importName of result.playwrightImports) {
      if (importName.startsWith('* as ')) {
        // Skip namespace imports for now
        continue;
      }

      if (!this.isImportUsed(importName, content)) {
        result.unusedImports.push(importName);
        result.warnings.push({
          type: 'unused_import',
          message: `Unused import: ${importName}`,
          importName,
          suggestion: `Remove unused import: ${importName}`
        });
      }
    }

    // Check type imports
    for (const typeName of result.typeImports) {
      if (!this.isTypeUsed(typeName, content)) {
        result.unusedImports.push(typeName);
        result.warnings.push({
          type: 'unused_import',
          message: `Unused type import: ${typeName}`,
          importName: typeName,
          suggestion: `Remove unused type import: ${typeName}`
        });
      }
    }
  }

  private isImportUsed(importName: string, content: string): boolean {
    // Simple usage detection - could be more sophisticated
    const usagePatterns = [
      new RegExp(`\\b${importName}\\s*\\(`), // Function calls
      new RegExp(`\\b${importName}\\.`), // Property access
      new RegExp(`:\\s*${importName}\\b`), // Type annotations
      new RegExp(`<${importName}>`), // Generic type usage
      new RegExp(`\\b${importName}\\s*=`), // Assignments
    ];

    return usagePatterns.some(pattern => pattern.test(content));
  }

  private isTypeUsed(typeName: string, content: string): boolean {
    const typeUsagePatterns = [
      new RegExp(`:\\s*${typeName}\\b`), // Type annotations
      new RegExp(`<${typeName}>`), // Generic types
      new RegExp(`\\bas\\s+${typeName}\\b`), // Type assertions
      new RegExp(`\\bextends\\s+${typeName}\\b`), // Interface/class extensions
      new RegExp(`\\bimplements\\s+${typeName}\\b`), // Interface implementations
    ];

    return typeUsagePatterns.some(pattern => pattern.test(content));
  }

  private async validateRelativePaths(relativePaths: string[], filePath: string, result: ImportValidationResult): Promise<void> {
    const baseDir = path.dirname(filePath);

    for (const relativePath of relativePaths) {
      try {
        const resolvedPath = await this.resolveRelativePath(relativePath, baseDir);

        if (!(await fs.pathExists(resolvedPath))) {
          result.invalidPaths.push(relativePath);
          result.errors.push({
            type: 'invalid_import_path',
            message: `Invalid import path: ${relativePath}`,
            suggestion: `Check that the file exists at: ${resolvedPath}`
          });
        }
      } catch (error) {
        result.invalidPaths.push(relativePath);
        result.errors.push({
          type: 'invalid_import_path',
          message: `Cannot resolve import path: ${relativePath}`,
          suggestion: 'Check the relative path syntax'
        });
      }
    }
  }

  private async resolveRelativePath(relativePath: string, baseDir: string): Promise<string> {
    const extensions = ['.ts', '.js', '.tsx', '.jsx', '/index.ts', '/index.js'];
    let resolvedPath = path.resolve(baseDir, relativePath);

    // If the path doesn't have an extension, try common extensions
    if (!path.extname(resolvedPath)) {
      for (const ext of extensions) {
        const pathWithExt = resolvedPath + ext;
        if (await fs.pathExists(pathWithExt)) {
          return pathWithExt;
        }
      }
    }

    return resolvedPath;
  }

  private async parseExports(content: string, result: ExportValidationResult): Promise<void> {
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const visit = (node: ts.Node) => {
      if (ts.isExportDeclaration(node)) {
        this.processExportDeclaration(node, result);
      } else if (ts.isExportAssignment(node)) {
        result.hasDefaultExport = true;
      } else if (this.hasExportModifier(node)) {
        this.processExportedDeclaration(node, result);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private processExportDeclaration(node: ts.ExportDeclaration, result: ExportValidationResult): void {
    if (!node.exportClause) {
      return;
    }

    if (ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        const exportName = element.name.text;
        result.namedExports.push(exportName);
      }
    }
  }

  private processExportedDeclaration(node: ts.Node, result: ExportValidationResult): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      result.namedExports.push(node.name.text);
    } else if (ts.isClassDeclaration(node) && node.name) {
      result.namedExports.push(node.name.text);
    } else if (ts.isInterfaceDeclaration(node)) {
      result.namedExports.push(node.name.text);
    } else if (ts.isTypeAliasDeclaration(node)) {
      result.namedExports.push(node.name.text);
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          result.namedExports.push(declaration.name.text);
        }
      }
    }
  }

  private hasExportModifier(node: ts.Node): boolean {
    return node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }
}