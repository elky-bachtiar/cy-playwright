import * as path from 'path';

export interface PathTransformationResult {
  content: string;
  transformedPaths: Array<{
    original: string;
    transformed: string;
    reason: string;
  }>;
  warnings: string[];
}

export interface PathTransformationOptions {
  sourceDir?: string;
  outputDir?: string;
  preserveStructure?: boolean;
  updatePageObjectPaths?: boolean;
}

export class ImportPathTransformer {

  /**
   * Transform import paths from Cypress to Playwright project structure
   */
  transformImportPaths(
    content: string,
    filePath: string,
    options: PathTransformationOptions = {}
  ): PathTransformationResult {
    const transformedPaths: Array<{ original: string; transformed: string; reason: string }> = [];
    const warnings: string[] = [];

    const {
      sourceDir = 'cypress',
      outputDir = 'tests',
      preserveStructure = true,
      updatePageObjectPaths = true
    } = options;

    let transformedContent = content;

    // Transform import statements
    transformedContent = this.transformImportStatements(
      transformedContent,
      filePath,
      options,
      transformedPaths,
      warnings
    );

    // Transform dynamic imports and require statements
    transformedContent = this.transformDynamicImports(
      transformedContent,
      filePath,
      options,
      transformedPaths,
      warnings
    );

    return {
      content: transformedContent,
      transformedPaths,
      warnings
    };
  }

  /**
   * Transform static import statements
   */
  private transformImportStatements(
    content: string,
    filePath: string,
    options: PathTransformationOptions,
    transformedPaths: Array<{ original: string; transformed: string; reason: string }>,
    warnings: string[]
  ): string {
    const importRegex = /import\s+(.+?)\s+from\s+['"](.*?)['"];?/g;

    return content.replace(importRegex, (match, importClause, importPath) => {
      if (this.shouldTransformPath(importPath)) {
        const transformedPath = this.transformSinglePath(importPath, filePath, options, warnings);

        if (transformedPath !== importPath) {
          transformedPaths.push({
            original: importPath,
            transformed: transformedPath,
            reason: this.getTransformationReason(importPath, transformedPath)
          });
        }

        return `import ${importClause} from '${transformedPath}';`;
      }

      return match;
    });
  }

  /**
   * Transform dynamic imports and require statements
   */
  private transformDynamicImports(
    content: string,
    filePath: string,
    options: PathTransformationOptions,
    transformedPaths: Array<{ original: string; transformed: string; reason: string }>,
    warnings: string[]
  ): string {
    // Transform require() statements
    content = content.replace(/require\s*\(\s*['"](.*?)['"]\s*\)/g, (match, requirePath) => {
      if (this.shouldTransformPath(requirePath)) {
        const transformedPath = this.transformSinglePath(requirePath, filePath, options, warnings);

        if (transformedPath !== requirePath) {
          transformedPaths.push({
            original: requirePath,
            transformed: transformedPath,
            reason: this.getTransformationReason(requirePath, transformedPath)
          });
        }

        return `require('${transformedPath}')`;
      }

      return match;
    });

    // Transform dynamic import() statements
    content = content.replace(/import\s*\(\s*['"](.*?)['"]\s*\)/g, (match, importPath) => {
      if (this.shouldTransformPath(importPath)) {
        const transformedPath = this.transformSinglePath(importPath, filePath, options, warnings);

        if (transformedPath !== importPath) {
          transformedPaths.push({
            original: importPath,
            transformed: transformedPath,
            reason: this.getTransformationReason(importPath, transformedPath)
          });
        }

        return `import('${transformedPath}')`;
      }

      return match;
    });

    return content;
  }

  /**
   * Check if a path should be transformed
   */
  private shouldTransformPath(importPath: string): boolean {
    // Don't transform absolute paths or npm packages
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
      return false;
    }

    // Don't transform already correct paths
    if (importPath.includes('/tests/') || importPath.includes('/playwright/')) {
      return false;
    }

    return true;
  }

  /**
   * Transform a single import path
   */
  private transformSinglePath(
    importPath: string,
    currentFilePath: string,
    options: PathTransformationOptions,
    warnings: string[]
  ): string {
    const { sourceDir = 'cypress', outputDir = 'tests' } = options;

    let transformedPath = importPath;

    // Handle page object imports
    if (this.isPageObjectImport(importPath)) {
      transformedPath = this.transformPageObjectPath(importPath, options);
    }
    // Handle fixture imports
    else if (this.isFixtureImport(importPath)) {
      transformedPath = this.transformFixturePath(importPath, options);
    }
    // Handle support file imports
    else if (this.isSupportFileImport(importPath)) {
      transformedPath = this.transformSupportFilePath(importPath, options);
    }
    // Handle test file imports
    else if (this.isTestFileImport(importPath)) {
      transformedPath = this.transformTestFilePath(importPath, options);
    }
    // Handle general cypress path conversion
    else if (importPath.includes(sourceDir)) {
      transformedPath = this.transformCypressPath(importPath, sourceDir, outputDir);
    }
    // Handle deep relative paths (../../../)
    else if (this.isDeepRelativePath(importPath)) {
      transformedPath = this.normalizeDeepRelativePath(importPath, currentFilePath, options, warnings);
    }

    return transformedPath;
  }

  /**
   * Check if import is for a page object
   */
  private isPageObjectImport(importPath: string): boolean {
    return importPath.includes('/pages/') ||
           importPath.includes('/page-objects/') ||
           importPath.endsWith('Page') ||
           importPath.includes('Page.');
  }

  /**
   * Transform page object import path
   */
  private transformPageObjectPath(importPath: string, options: PathTransformationOptions): string {
    const { outputDir = 'tests' } = options;

    // Convert cypress/pages to tests/pages
    let transformed = importPath
      .replace(/cypress\/pages/g, `${outputDir}/pages`)
      .replace(/cypress\/page-objects/g, `${outputDir}/page-objects`)
      .replace(/cypress\/support\/pages/g, `${outputDir}/support/pages`)
      .replace(/cypress\/support\/page-objects/g, `${outputDir}/support/page-objects`);

    // Handle relative path adjustments
    if (importPath.startsWith('../') && !transformed.startsWith('../')) {
      // Adjust relative depth if needed
      const currentDepth = (importPath.match(/\.\.\//g) || []).length;
      if (currentDepth > 1) {
        const adjustment = '../'.repeat(currentDepth - 1);
        transformed = adjustment + transformed;
      }
    }

    return transformed;
  }

  /**
   * Check if import is for a fixture
   */
  private isFixtureImport(importPath: string): boolean {
    return importPath.includes('/fixtures/') ||
           importPath.includes('fixture');
  }

  /**
   * Transform fixture import path
   */
  private transformFixturePath(importPath: string, options: PathTransformationOptions): string {
    const { outputDir = 'tests' } = options;

    return importPath
      .replace(/cypress\/fixtures/g, `${outputDir}/fixtures`)
      .replace(/cypress\/support\/fixtures/g, `${outputDir}/fixtures`);
  }

  /**
   * Check if import is for a support file
   */
  private isSupportFileImport(importPath: string): boolean {
    return importPath.includes('/support/') ||
           importPath.includes('/commands/') ||
           importPath.includes('/utilities/') ||
           importPath.includes('/helpers/');
  }

  /**
   * Transform support file import path
   */
  private transformSupportFilePath(importPath: string, options: PathTransformationOptions): string {
    const { outputDir = 'tests' } = options;

    return importPath
      .replace(/cypress\/support/g, `${outputDir}/support`)
      .replace(/cypress\/commands/g, `${outputDir}/support/commands`)
      .replace(/cypress\/utilities/g, `${outputDir}/support/utilities`)
      .replace(/cypress\/helpers/g, `${outputDir}/support/helpers`);
  }

  /**
   * Check if import is for a test file
   */
  private isTestFileImport(importPath: string): boolean {
    return importPath.includes('/e2e/') ||
           importPath.includes('/integration/') ||
           importPath.includes('/component/') ||
           importPath.includes('.spec.') ||
           importPath.includes('.test.');
  }

  /**
   * Transform test file import path
   */
  private transformTestFilePath(importPath: string, options: PathTransformationOptions): string {
    const { outputDir = 'tests' } = options;

    return importPath
      .replace(/cypress\/e2e/g, outputDir)
      .replace(/cypress\/integration/g, outputDir)
      .replace(/cypress\/component/g, `${outputDir}/component`)
      .replace(/\.cy\.(js|ts)/, '.spec.$1');
  }

  /**
   * Transform general cypress paths
   */
  private transformCypressPath(importPath: string, sourceDir: string, outputDir: string): string {
    return importPath.replace(new RegExp(sourceDir, 'g'), outputDir);
  }

  /**
   * Check if path has deep relative navigation (../../../)
   */
  private isDeepRelativePath(importPath: string): boolean {
    return (importPath.match(/\.\.\//g) || []).length > 2;
  }

  /**
   * Normalize deep relative paths
   */
  private normalizeDeepRelativePath(
    importPath: string,
    currentFilePath: string,
    options: PathTransformationOptions,
    warnings: string[]
  ): string {
    const relativeDepth = (importPath.match(/\.\.\//g) || []).length;

    if (relativeDepth > 3) {
      warnings.push(`Deep relative path detected (${relativeDepth} levels): ${importPath} - consider using absolute imports`);
    }

    // Try to resolve and simplify the path
    try {
      const currentDir = path.dirname(currentFilePath);
      const resolvedPath = path.resolve(currentDir, importPath);
      const simplifiedPath = path.relative(currentDir, resolvedPath);

      // Convert back to forward slashes for consistency
      return simplifiedPath.replace(/\\/g, '/');
    } catch (error) {
      warnings.push(`Could not normalize path: ${importPath}`);
      return importPath;
    }
  }

  /**
   * Get reason for transformation
   */
  private getTransformationReason(originalPath: string, transformedPath: string): string {
    if (originalPath.includes('cypress/pages') || originalPath.includes('cypress/page-objects')) {
      return 'Page object path updated for Playwright structure';
    }
    if (originalPath.includes('cypress/fixtures')) {
      return 'Fixture path updated for Playwright structure';
    }
    if (originalPath.includes('cypress/support')) {
      return 'Support file path updated for Playwright structure';
    }
    if (originalPath.includes('cypress/e2e') || originalPath.includes('cypress/integration')) {
      return 'Test file path updated for Playwright structure';
    }
    if ((originalPath.match(/\.\.\//g) || []).length > 2) {
      return 'Deep relative path normalized';
    }
    if (originalPath.includes('cypress')) {
      return 'Cypress path converted to Playwright structure';
    }
    return 'Path structure updated';
  }

  /**
   * Get relative path between two file paths
   */
  private getRelativePath(from: string, to: string): string {
    const relativePath = path.relative(path.dirname(from), to);

    // Ensure the path starts with ./ or ../
    if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
      return './' + relativePath;
    }

    // Convert backslashes to forward slashes for consistency
    return relativePath.replace(/\\/g, '/');
  }

  /**
   * Validate transformed path exists or could exist
   */
  private validateTransformedPath(transformedPath: string, warnings: string[]): void {
    // Add basic validation warnings
    if (transformedPath.includes('..\\') || transformedPath.includes('../..\\')) {
      warnings.push(`Potentially problematic path structure: ${transformedPath}`);
    }

    if (transformedPath.length > 200) {
      warnings.push(`Very long path detected: ${transformedPath}`);
    }
  }
}