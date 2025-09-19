import { Logger } from '../utils/logger';

export interface VersionConflict {
  package1: string;
  version1: string;
  package2: string;
  version2: string;
  issue: string;
}

export class DependencyManager {
  private logger = new Logger('DependencyManager');

  // Compatible version ranges for Playwright packages
  private readonly compatibleVersions = {
    '@playwright/test': '^1.30.0',
    'playwright': '^1.30.0',
    'typescript': '^4.0.0',
    '@types/node': '^16.0.0'
  };

  detectVersionConflicts(dependencies: Record<string, string>): string[] {
    this.logger.debug('Detecting version conflicts in dependencies');

    const conflicts: string[] = [];

    // Check Playwright package version consistency
    const playwrightVersion = dependencies['playwright'];
    const testVersion = dependencies['@playwright/test'];

    if (playwrightVersion && testVersion) {
      const playwrightMajor = this.extractMajorVersion(playwrightVersion);
      const testMajor = this.extractMajorVersion(testVersion);

      if (playwrightMajor !== testMajor) {
        conflicts.push(`Version mismatch between playwright (${playwrightVersion}) and @playwright/test (${testVersion})`);
      }
    }

    // Check TypeScript version compatibility
    const tsVersion = dependencies['typescript'];
    if (tsVersion) {
      const majorVersion = this.extractMajorVersion(tsVersion);
      if (majorVersion < 4) {
        conflicts.push(`TypeScript version ${tsVersion} is too old for Playwright. Minimum version 4.0.0 required.`);
      }
    }

    // Check Node types version
    const nodeTypesVersion = dependencies['@types/node'];
    if (nodeTypesVersion) {
      const majorVersion = this.extractMajorVersion(nodeTypesVersion);
      if (majorVersion < 16) {
        conflicts.push(`@types/node version ${nodeTypesVersion} is outdated. Consider upgrading to version 16 or higher.`);
      }
    }

    // Check for conflicting test frameworks
    const conflictingPackages = [
      'cypress',
      'selenium-webdriver',
      'webdriverio',
      'puppeteer'
    ];

    for (const pkg of conflictingPackages) {
      if (dependencies[pkg]) {
        conflicts.push(`Found ${pkg} package which may conflict with Playwright. Consider removing if not needed.`);
      }
    }

    return conflicts;
  }

  generateInstallCommand(missingPackages: string[], useTypeScript: boolean = true): string {
    this.logger.debug(`Generating install command for packages: ${missingPackages.join(', ')}`);

    const packages = [...missingPackages];

    // Add TypeScript packages if needed and not already included
    if (useTypeScript) {
      if (!packages.includes('typescript') && !missingPackages.includes('typescript')) {
        packages.push('typescript');
      }
      if (!packages.includes('@types/node') && !missingPackages.includes('@types/node')) {
        packages.push('@types/node');
      }
    }

    return `npm install -D ${packages.join(' ')}`;
  }

  validateVersionCompatibility(packageName: string, version: string): {
    isCompatible: boolean;
    recommendedVersion?: string;
    issue?: string;
  } {
    this.logger.debug(`Validating version compatibility for ${packageName}@${version}`);

    const requiredVersion = this.compatibleVersions[packageName as keyof typeof this.compatibleVersions];

    if (!requiredVersion) {
      return { isCompatible: true };
    }

    const isCompatible = this.isVersionCompatible(version, requiredVersion);

    return {
      isCompatible,
      recommendedVersion: isCompatible ? undefined : requiredVersion,
      issue: isCompatible ? undefined : `Version ${version} does not meet requirement ${requiredVersion}`
    };
  }

  getRequiredDependencies(options: {
    useTypeScript?: boolean;
    includeDevDependencies?: boolean;
  } = {}): Record<string, string> {
    const { useTypeScript = true, includeDevDependencies = true } = options;

    const dependencies: Record<string, string> = {
      '@playwright/test': this.compatibleVersions['@playwright/test'],
      'playwright': this.compatibleVersions['playwright']
    };

    if (useTypeScript && includeDevDependencies) {
      dependencies['typescript'] = this.compatibleVersions['typescript'];
      dependencies['@types/node'] = this.compatibleVersions['@types/node'];
    }

    return dependencies;
  }

  getOptionalDependencies(): Record<string, string> {
    return {
      'eslint': '^8.0.0',
      '@typescript-eslint/eslint-plugin': '^6.0.0',
      '@typescript-eslint/parser': '^6.0.0',
      'prettier': '^3.0.0',
      'husky': '^8.0.0',
      'lint-staged': '^14.0.0'
    };
  }

  resolveDependencyConflicts(dependencies: Record<string, string>): {
    resolved: Record<string, string>;
    changes: string[];
    warnings: string[];
  } {
    this.logger.debug('Resolving dependency conflicts');

    const resolved = { ...dependencies };
    const changes: string[] = [];
    const warnings: string[] = [];

    // Resolve Playwright version conflicts
    const playwrightVersion = resolved['playwright'];
    const testVersion = resolved['@playwright/test'];

    if (playwrightVersion && testVersion) {
      const playwrightMajor = this.extractMajorVersion(playwrightVersion);
      const testMajor = this.extractMajorVersion(testVersion);

      if (playwrightMajor !== testMajor) {
        // Use the higher version for both packages
        const higherVersion = this.getHigherVersion(playwrightVersion, testVersion);
        const targetVersion = `^${this.extractMajorVersion(higherVersion)}.0.0`;

        resolved['playwright'] = targetVersion;
        resolved['@playwright/test'] = targetVersion;

        changes.push(`Aligned Playwright versions to ${targetVersion}`);
      }
    }

    // Update TypeScript if too old
    const tsVersion = resolved['typescript'];
    if (tsVersion) {
      const majorVersion = this.extractMajorVersion(tsVersion);
      if (majorVersion < 4) {
        resolved['typescript'] = this.compatibleVersions['typescript'];
        changes.push(`Updated TypeScript to ${this.compatibleVersions['typescript']}`);
      }
    }

    // Update Node types if too old
    const nodeTypesVersion = resolved['@types/node'];
    if (nodeTypesVersion) {
      const majorVersion = this.extractMajorVersion(nodeTypesVersion);
      if (majorVersion < 16) {
        resolved['@types/node'] = this.compatibleVersions['@types/node'];
        changes.push(`Updated @types/node to ${this.compatibleVersions['@types/node']}`);
      }
    }

    // Warn about conflicting packages
    const conflictingPackages = ['cypress', 'selenium-webdriver', 'webdriverio', 'puppeteer'];
    for (const pkg of conflictingPackages) {
      if (resolved[pkg]) {
        warnings.push(`Consider removing ${pkg} as it may conflict with Playwright`);
      }
    }

    return { resolved, changes, warnings };
  }

  private extractMajorVersion(version: string): number {
    const match = version.match(/^[\^~]?(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private getHigherVersion(version1: string, version2: string): string {
    const v1Major = this.extractMajorVersion(version1);
    const v2Major = this.extractMajorVersion(version2);

    return v1Major >= v2Major ? version1 : version2;
  }

  private isVersionCompatible(installedVersion: string, requiredVersion: string): boolean {
    // Simplified version checking - in production, use semver library
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

    // Tilde ranges (~) allow patch-level changes
    if (requiredVersion.startsWith('~')) {
      return installedParts[0] === requiredParts[0] &&
             installedParts[1] === requiredParts[1] &&
             installedParts[2] >= requiredParts[2];
    }

    // Exact match for other ranges
    return installedParts[0] >= requiredParts[0];
  }
}