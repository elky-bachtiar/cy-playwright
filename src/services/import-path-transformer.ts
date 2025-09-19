import * as path from 'path';
import { Logger } from '../utils/logger';
import { ImportInfo } from './import-analyzer';

export interface PathMapping {
  [originalPath: string]: string;
}

export interface OutputStructure {
  testsDir: string;
  pagesDir: string;
  utilsDir?: string;
  servicesDir?: string;
}

export interface PathNormalizationResult {
  originalPath: string;
  normalizedPath: string;
  changed: boolean;
  reason?: string;
}

export class ImportPathTransformer {
  private logger = new Logger('ImportPathTransformer');

  // External libraries that should never be modified
  private readonly externalLibraries = [
    '@playwright/test',
    '@angular/',
    'wiremock-rest-client',
    '@sta/wiremock-generator-ts',
    'react',
    'lodash',
    'fs-extra',
    'typescript'
  ];

  normalizeRelativePath(importPath: string, currentFile: string, projectRoot: string): string {
    try {
      // Skip external libraries
      if (this.isExternalLibrary(importPath)) {
        return importPath;
      }

      // Skip already normalized paths
      if (!importPath.startsWith('.')) {
        return importPath;
      }

      // Resolve the absolute path of the import
      const currentDir = path.dirname(currentFile);
      const absoluteImportPath = path.resolve(currentDir, importPath);

      // Calculate relative path from project root
      const relativeFromRoot = path.relative(projectRoot, absoluteImportPath);

      // Normalize excessive parent directory traversals
      const normalizedPath = this.simplifyRelativePath(importPath, currentFile, projectRoot);

      this.logger.debug(`Normalized path from ${importPath} to ${normalizedPath} for file ${currentFile}`);
      return normalizedPath;
    } catch (error) {
      this.logger.warn(`Failed to normalize path ${importPath} in ${currentFile}:`, error);
      return importPath; // Return original on error
    }
  }

  correctPageObjectPath(importPath: string, currentFile: string, outputStructure: OutputStructure): string {
    try {
      // Skip non-relative imports
      if (!importPath.startsWith('.')) {
        return importPath;
      }

      // Check if this is a page object import
      if (this.isPageObjectImport(importPath)) {
        const currentDir = path.dirname(currentFile);
        const pagesDir = outputStructure.pagesDir || 'pages';

        // Calculate the correct relative path to pages directory
        const relativeToPagesDir = path.relative(currentDir, pagesDir);
        const pageObjectName = path.basename(importPath);

        const correctedPath = path.join(relativeToPagesDir, pageObjectName).replace(/\\/g, '/');

        this.logger.debug(`Corrected page object path from ${importPath} to ${correctedPath}`);
        return correctedPath;
      }

      return importPath;
    } catch (error) {
      this.logger.warn(`Failed to correct page object path ${importPath}:`, error);
      return importPath;
    }
  }

  rewriteImportStatement(originalImport: string, pathMapping: PathMapping): string {
    try {
      let rewrittenImport = originalImport;

      // Apply path mappings
      Object.entries(pathMapping).forEach(([originalPath, newPath]) => {
        const quotedOriginalPath = `"${originalPath}"`;
        const quotedNewPath = `"${newPath}"`;
        const singleQuotedOriginalPath = `'${originalPath}'`;
        const singleQuotedNewPath = `'${newPath}'`;

        if (rewrittenImport.includes(quotedOriginalPath)) {
          rewrittenImport = rewrittenImport.replace(quotedOriginalPath, quotedNewPath);
        } else if (rewrittenImport.includes(singleQuotedOriginalPath)) {
          rewrittenImport = rewrittenImport.replace(singleQuotedOriginalPath, singleQuotedNewPath);
        }
      });

      return rewrittenImport;
    } catch (error) {
      this.logger.warn(`Failed to rewrite import statement ${originalImport}:`, error);
      return originalImport;
    }
  }

  rewriteNamedImports(originalImport: string, dedupedImports: string[]): string {
    try {
      // Extract the source module from the import statement
      const sourceMatch = originalImport.match(/from\s+['"]([^'"]+)['"]/);
      if (!sourceMatch) {
        return originalImport;
      }

      const source = sourceMatch[1];
      const quote = originalImport.includes(`"${source}"`) ? '"' : "'";

      // Handle different import patterns
      if (dedupedImports.length === 0) {
        // No named imports, might be default or namespace import
        return originalImport;
      }

      // Check if there's a default import
      const defaultImportMatch = originalImport.match(/import\s+(\w+)\s*,?\s*\{/);
      const defaultImport = defaultImportMatch ? defaultImportMatch[1] + ', ' : '';

      // Construct the new import statement
      const namedImportsStr = dedupedImports.join(', ');
      const newImport = `import ${defaultImport}{ ${namedImportsStr} } from ${quote}${source}${quote};`;

      this.logger.debug(`Rewrote named imports from ${originalImport} to ${newImport}`);
      return newImport;
    } catch (error) {
      this.logger.warn(`Failed to rewrite named imports ${originalImport}:`, error);
      return originalImport;
    }
  }

  generatePathMappings(imports: ImportInfo[], currentFile: string): PathMapping {
    const mappings: PathMapping = {};

    try {
      imports.forEach(importInfo => {
        if (this.shouldNormalizePath(importInfo.source)) {
          const currentDir = path.dirname(currentFile);
          const normalizedPath = this.normalizeDeepRelativePath(importInfo.source, currentDir);

          if (normalizedPath !== importInfo.source) {
            mappings[importInfo.source] = normalizedPath;
          }
        }
      });

      this.logger.debug(`Generated ${Object.keys(mappings).length} path mappings for ${currentFile}`);
      return mappings;
    } catch (error) {
      this.logger.warn(`Failed to generate path mappings for ${currentFile}:`, error);
      return {};
    }
  }

  normalizeAllPaths(imports: ImportInfo[], currentFile: string, projectRoot: string): PathNormalizationResult[] {
    return imports.map(importInfo => {
      const originalPath = importInfo.source;

      if (this.isExternalLibrary(originalPath)) {
        return {
          originalPath,
          normalizedPath: originalPath,
          changed: false,
          reason: 'External library - not modified'
        };
      }

      const normalizedPath = this.normalizeRelativePath(originalPath, currentFile, projectRoot);
      const changed = normalizedPath !== originalPath;

      return {
        originalPath,
        normalizedPath,
        changed,
        reason: changed ? 'Simplified relative path' : 'No changes needed'
      };
    });
  }

  private isExternalLibrary(importPath: string): boolean {
    return this.externalLibraries.some(lib => importPath.startsWith(lib)) || !importPath.startsWith('.');
  }

  private isPageObjectImport(importPath: string): boolean {
    const pagePrefixes = ['../pages/', './pages/', '/pages/'];
    const pageNames = ['page', 'Page', '-page', 'cy-', '-cy'];

    return pagePrefixes.some(prefix => importPath.includes(prefix)) ||
           pageNames.some(name => importPath.includes(name));
  }

  private shouldNormalizePath(importPath: string): boolean {
    // Only normalize relative paths with excessive parent directory traversal
    return importPath.startsWith('.') && importPath.includes('../../../');
  }

  private simplifyRelativePath(importPath: string, currentFile: string, projectRoot: string): string {
    try {
      const currentDir = path.dirname(currentFile);
      const absoluteImportPath = path.resolve(currentDir, importPath);
      const relativeFromProject = path.relative(projectRoot, absoluteImportPath);

      // Calculate new relative path from current file to the resolved location
      const newRelativePath = path.relative(currentDir, absoluteImportPath);

      // Ensure proper forward slashes for module imports
      return newRelativePath.replace(/\\/g, '/');
    } catch (error) {
      this.logger.warn(`Failed to simplify relative path ${importPath}:`, error);
      return importPath;
    }
  }

  private normalizeDeepRelativePath(importPath: string, currentDir: string): string {
    // Count the number of '../' patterns
    const parentDirCount = (importPath.match(/\.\.\//g) || []).length;

    // If there are more than 2 levels of parent directory traversal, try to simplify
    if (parentDirCount > 2) {
      // Remove excessive parent directory traversal
      const pathParts = importPath.split('/');
      const nonParentParts = pathParts.filter(part => part !== '..' && part !== '.');

      // Reconstruct with fewer parent directories
      const simplifiedPath = '../' + nonParentParts.join('/');

      this.logger.debug(`Simplified deep relative path from ${importPath} to ${simplifiedPath}`);
      return simplifiedPath;
    }

    return importPath;
  }
}