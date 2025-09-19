import { Logger } from '../utils/logger';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface PlaywrightInstallationResult {
  isInstalled: boolean;
  version?: string;
  hasTestRunner: boolean;
  hasBrowsers: boolean;
  missingPackages: string[];
  installCommand?: string;
}

export interface DependencyCompatibilityResult {
  isCompatible: boolean;
  compatiblePackages: string[];
  incompatiblePackages: string[];
  conflicts: DependencyConflict[];
  recommendations: string[];
}

export interface DependencyConflict {
  package1: string;
  version1: string;
  package2: string;
  version2: string;
  issue: string;
}

export interface TypeScriptConfigResult {
  hasConfig: boolean;
  isValid: boolean;
  hasPlaywrightTypes: boolean;
  recommendations: string[];
  issues: string[];
}

export class DependencyValidator {
  private logger = new Logger('DependencyValidator');

  // Required Playwright packages
  private readonly requiredPackages = ['@playwright/test'];

  // Optional but recommended packages
  private readonly recommendedPackages = ['playwright'];

  // Compatible version ranges
  private readonly compatibleVersions = {
    '@playwright/test': '^1.30.0',
    'playwright': '^1.30.0',
    'typescript': '^4.0.0',
    '@types/node': '^16.0.0'
  };

  async validatePlaywrightInstallation(projectPath: string): Promise<PlaywrightInstallationResult> {
    this.logger.debug(`Validating Playwright installation in: ${projectPath}`);

    const result: PlaywrightInstallationResult = {
      isInstalled: false,
      hasTestRunner: false,
      hasBrowsers: false,
      missingPackages: []
    };

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');

      if (!(await fs.pathExists(packageJsonPath))) {
        result.missingPackages.push('package.json');
        result.installCommand = 'npm init -y && npm install -D @playwright/test';
        return result;
      }

      const packageJson = await fs.readJson(packageJsonPath);
      const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Check for @playwright/test
      if (allDependencies['@playwright/test']) {
        result.hasTestRunner = true;
        result.version = allDependencies['@playwright/test'];
      } else {
        result.missingPackages.push('@playwright/test');
      }

      // Check for playwright (browsers)
      if (allDependencies['playwright']) {
        result.hasBrowsers = true;
      } else {
        result.missingPackages.push('playwright');
      }

      // Check if packages are actually installed in node_modules
      const nodeModulesPath = path.join(projectPath, 'node_modules');
      if (await fs.pathExists(nodeModulesPath)) {
        const testRunnerPath = path.join(nodeModulesPath, '@playwright/test');
        const browsersPath = path.join(nodeModulesPath, 'playwright');

        if (!(await fs.pathExists(testRunnerPath)) && result.hasTestRunner) {
          result.missingPackages.push('@playwright/test (not installed)');
          result.hasTestRunner = false;
        }

        if (!(await fs.pathExists(browsersPath)) && result.hasBrowsers) {
          result.missingPackages.push('playwright (not installed)');
          result.hasBrowsers = false;
        }
      }

      result.isInstalled = result.hasTestRunner;

      // Generate install command if needed
      if (result.missingPackages.length > 0) {
        const packagesToInstall = result.missingPackages
          .filter(pkg => !pkg.includes('(not installed)') && pkg !== 'package.json')
          .join(' ');

        if (packagesToInstall) {
          result.installCommand = `npm install -D ${packagesToInstall}`;
        } else if (result.missingPackages.some(pkg => pkg.includes('(not installed)'))) {
          result.installCommand = 'npm install';
        }
      }

    } catch (error) {
      this.logger.error('Failed to validate Playwright installation:', error);
      result.missingPackages.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  async validateDependencyCompatibility(projectPath: string): Promise<DependencyCompatibilityResult> {
    this.logger.debug(`Validating dependency compatibility in: ${projectPath}`);

    const result: DependencyCompatibilityResult = {
      isCompatible: true,
      compatiblePackages: [],
      incompatiblePackages: [],
      conflicts: [],
      recommendations: []
    };

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');

      if (!(await fs.pathExists(packageJsonPath))) {
        result.isCompatible = false;
        result.recommendations.push('Create package.json file');
        return result;
      }

      const packageJson = await fs.readJson(packageJsonPath);
      const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Check version compatibility
      for (const [packageName, installedVersion] of Object.entries(allDependencies)) {
        if (this.compatibleVersions[packageName as keyof typeof this.compatibleVersions]) {
          const requiredVersion = this.compatibleVersions[packageName as keyof typeof this.compatibleVersions];

          if (this.isVersionCompatible(installedVersion as string, requiredVersion)) {
            result.compatiblePackages.push(packageName);
          } else {
            result.incompatiblePackages.push(packageName);
            result.recommendations.push(`Update ${packageName} to ${requiredVersion}`);
          }
        }
      }

      // Check for specific conflicts
      this.checkPlaywrightVersionConflicts(allDependencies, result);
      this.checkTypeScriptConflicts(allDependencies, result);
      this.checkNodeTypesConflicts(allDependencies, result);

      result.isCompatible = result.conflicts.length === 0 && result.incompatiblePackages.length === 0;

    } catch (error) {
      this.logger.error('Failed to validate dependency compatibility:', error);
      result.isCompatible = false;
      result.recommendations.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  async validateTypeScriptConfig(projectPath: string): Promise<TypeScriptConfigResult> {
    this.logger.debug(`Validating TypeScript configuration in: ${projectPath}`);

    const result: TypeScriptConfigResult = {
      hasConfig: false,
      isValid: true,
      hasPlaywrightTypes: false,
      recommendations: [],
      issues: []
    };

    try {
      const tsConfigPath = path.join(projectPath, 'tsconfig.json');

      if (!(await fs.pathExists(tsConfigPath))) {
        result.recommendations.push('Consider adding TypeScript configuration for better type safety');
        return result;
      }

      result.hasConfig = true;

      const tsConfig = await fs.readJson(tsConfigPath);

      // Validate compiler options
      this.validateCompilerOptions(tsConfig.compilerOptions || {}, result);

      // Check for Playwright types
      if (tsConfig.compilerOptions?.types && tsConfig.compilerOptions.types.includes('@playwright/test')) {
        result.hasPlaywrightTypes = true;
      } else {
        result.recommendations.push('Add @playwright/test to types array');
      }

      // Validate include/exclude patterns
      this.validateIncludeExcludePatterns(tsConfig, result);

    } catch (error) {
      this.logger.error('Failed to validate TypeScript configuration:', error);
      result.isValid = false;
      result.issues.push(`TypeScript validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  private isVersionCompatible(installedVersion: string, requiredVersion: string): boolean {
    // Simplified version checking - in a real implementation, use semver library
    const cleanInstalled = installedVersion.replace(/[^0-9.]/g, '');
    const cleanRequired = requiredVersion.replace(/[^0-9.]/g, '');

    const installedParts = cleanInstalled.split('.').map(Number);
    const requiredParts = cleanRequired.split('.').map(Number);

    // Major version must match for caret ranges (^)
    if (requiredVersion.startsWith('^')) {
      return installedParts[0] === requiredParts[0] &&
             (installedParts[1] > requiredParts[1] ||
              (installedParts[1] === requiredParts[1] && installedParts[2] >= requiredParts[2]));
    }

    // For other ranges, do basic comparison
    return installedParts[0] >= requiredParts[0];
  }

  private checkPlaywrightVersionConflicts(dependencies: Record<string, string>, result: DependencyCompatibilityResult): void {
    const playwrightVersion = dependencies['playwright'];
    const testVersion = dependencies['@playwright/test'];

    if (playwrightVersion && testVersion) {
      const playwrightMajor = playwrightVersion.match(/(\d+)/)?.[1];
      const testMajor = testVersion.match(/(\d+)/)?.[1];

      if (playwrightMajor !== testMajor) {
        result.conflicts.push({
          package1: 'playwright',
          version1: playwrightVersion,
          package2: '@playwright/test',
          version2: testVersion,
          issue: 'Version mismatch between playwright packages'
        });
      }
    }
  }

  private checkTypeScriptConflicts(dependencies: Record<string, string>, result: DependencyCompatibilityResult): void {
    const tsVersion = dependencies['typescript'];

    if (tsVersion) {
      const majorVersion = parseInt(tsVersion.match(/(\d+)/)?.[1] || '0', 10);

      if (majorVersion < 4) {
        result.conflicts.push({
          package1: 'typescript',
          version1: tsVersion,
          package2: '@playwright/test',
          version2: 'latest',
          issue: 'TypeScript version too old for Playwright'
        });
      }
    }
  }

  private checkNodeTypesConflicts(dependencies: Record<string, string>, result: DependencyCompatibilityResult): void {
    const nodeTypesVersion = dependencies['@types/node'];

    if (nodeTypesVersion) {
      const majorVersion = parseInt(nodeTypesVersion.match(/(\d+)/)?.[1] || '0', 10);

      if (majorVersion < 16) {
        result.recommendations.push('Consider updating @types/node to version 16 or higher');
      }
    }
  }

  private validateCompilerOptions(compilerOptions: any, result: TypeScriptConfigResult): void {
    // Check target
    if (compilerOptions.target) {
      const target = compilerOptions.target.toLowerCase();
      if (['es5', 'es3'].includes(target)) {
        result.recommendations.push('Consider upgrading target to ES2020 or higher');
      }
    }

    // Check module
    if (compilerOptions.module) {
      const module = compilerOptions.module.toLowerCase();
      if (!['commonjs', 'esnext', 'es2020'].includes(module)) {
        result.recommendations.push('Consider using CommonJS or ESNext module format');
      }
    }

    // Check strict mode
    if (compilerOptions.strict === false) {
      result.recommendations.push('Enable strict mode for better type safety');
    }

    // Check ES module interop
    if (!compilerOptions.esModuleInterop) {
      result.recommendations.push('Enable esModuleInterop for better module compatibility');
    }

    // Check lib
    if (compilerOptions.lib && !compilerOptions.lib.some((lib: string) => lib.toLowerCase().includes('es2020'))) {
      result.recommendations.push('Include ES2020 in lib array for modern JavaScript features');
    }
  }

  private validateIncludeExcludePatterns(tsConfig: any, result: TypeScriptConfigResult): void {
    // Check if test files are included
    if (tsConfig.include) {
      const hasTestIncludes = tsConfig.include.some((pattern: string) =>
        pattern.includes('test') || pattern.includes('spec') || pattern.includes('*.ts')
      );

      if (!hasTestIncludes) {
        result.recommendations.push('Ensure test files are included in TypeScript compilation');
      }
    }

    // Check exclude patterns
    if (tsConfig.exclude) {
      const excludesTests = tsConfig.exclude.some((pattern: string) =>
        pattern.includes('test') || pattern.includes('spec')
      );

      if (excludesTests) {
        result.issues.push('Test files appear to be excluded from TypeScript compilation');
      }
    }
  }
}