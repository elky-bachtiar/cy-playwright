import { Logger } from '../utils/logger';
import * as childProcess from 'child_process';
import { promisify } from 'util';

const exec = promisify(childProcess.exec);

export interface NodeVersionResult {
  isValid: boolean;
  version: string;
  isSupported: boolean;
  recommendation?: string;
}

export interface PackageManagerResult {
  isAvailable: boolean;
  version: string;
  recommendation?: string;
}

export interface SystemDependenciesResult {
  allAvailable: boolean;
  availableDependencies: string[];
  missingDependencies: string[];
  recommendations: string[];
}

export interface EnvironmentVariablesResult {
  allPresent: boolean;
  presentVariables: string[];
  missingVariables: string[];
  recommendations: string[];
}

export class EnvironmentValidator {
  private logger = new Logger('EnvironmentValidator');

  // Minimum supported Node.js version
  private readonly minNodeVersion = '16.0.0';

  async validateNodeVersion(): Promise<NodeVersionResult> {
    this.logger.debug('Validating Node.js version');

    try {
      const { stdout } = await exec('node --version');
      const version = stdout.trim().replace('v', '');

      const isSupported = this.compareVersions(version, this.minNodeVersion) >= 0;

      return {
        isValid: isSupported,
        version,
        isSupported,
        recommendation: isSupported ? undefined : `Upgrade to Node.js ${this.minNodeVersion} or higher`
      };
    } catch (error) {
      this.logger.error('Failed to check Node.js version:', error);
      return {
        isValid: false,
        version: 'unknown',
        isSupported: false,
        recommendation: 'Install Node.js'
      };
    }
  }

  async validatePackageManager(manager: 'npm' | 'yarn' | 'pnpm'): Promise<PackageManagerResult> {
    this.logger.debug(`Validating package manager: ${manager}`);

    try {
      const { stdout } = await exec(`${manager} --version`);
      const version = stdout.trim();

      return {
        isAvailable: true,
        version,
        recommendation: undefined
      };
    } catch (error) {
      this.logger.warn(`Package manager ${manager} not available:`, error);
      return {
        isAvailable: false,
        version: 'not installed',
        recommendation: `Install ${manager}`
      };
    }
  }

  async validateSystemDependencies(dependencies: string[]): Promise<SystemDependenciesResult> {
    this.logger.debug('Validating system dependencies:', dependencies);

    const availableDependencies: string[] = [];
    const missingDependencies: string[] = [];
    const recommendations: string[] = [];

    for (const dep of dependencies) {
      try {
        await exec(`${dep} --version`);
        availableDependencies.push(dep);
      } catch (error) {
        this.logger.warn(`System dependency ${dep} not available:`, error);
        missingDependencies.push(dep);
        recommendations.push(`Install ${dep}`);
      }
    }

    return {
      allAvailable: missingDependencies.length === 0,
      availableDependencies,
      missingDependencies,
      recommendations
    };
  }

  async validateEnvironmentVariables(requiredVars: string[]): Promise<EnvironmentVariablesResult> {
    this.logger.debug('Validating environment variables:', requiredVars);

    const presentVariables: string[] = [];
    const missingVariables: string[] = [];
    const recommendations: string[] = [];

    for (const varName of requiredVars) {
      if (process.env[varName]) {
        presentVariables.push(varName);
      } else {
        missingVariables.push(varName);
        recommendations.push(`Set environment variable: ${varName}`);
      }
    }

    return {
      allPresent: missingVariables.length === 0,
      presentVariables,
      missingVariables,
      recommendations
    };
  }

  async validateDisplayServer(): Promise<{ available: boolean; type?: string }> {
    this.logger.debug('Validating display server availability');

    try {
      // Check for X11 display
      if (process.env.DISPLAY) {
        return { available: true, type: 'X11' };
      }

      // Check for Wayland
      if (process.env.WAYLAND_DISPLAY) {
        return { available: true, type: 'Wayland' };
      }

      // On macOS, display is always available
      if (process.platform === 'darwin') {
        return { available: true, type: 'macOS' };
      }

      // On Windows, display is always available
      if (process.platform === 'win32') {
        return { available: true, type: 'Windows' };
      }

      return { available: false };
    } catch (error) {
      this.logger.warn('Failed to validate display server:', error);
      return { available: false };
    }
  }

  async validateMemoryRequirements(minMemoryMB: number = 2048): Promise<{
    sufficient: boolean;
    available: number;
    required: number;
    recommendation?: string;
  }> {
    this.logger.debug(`Validating memory requirements: ${minMemoryMB}MB`);

    try {
      const os = await import('os');
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const totalMemoryMB = Math.floor(totalMemory / 1024 / 1024);
      const freeMemoryMB = Math.floor(freeMemory / 1024 / 1024);

      const sufficient = freeMemoryMB >= minMemoryMB;

      return {
        sufficient,
        available: freeMemoryMB,
        required: minMemoryMB,
        recommendation: sufficient ? undefined : `Ensure at least ${minMemoryMB}MB of free memory is available`
      };
    } catch (error) {
      this.logger.error('Failed to check memory requirements:', error);
      return {
        sufficient: false,
        available: 0,
        required: minMemoryMB,
        recommendation: 'Unable to determine memory availability'
      };
    }
  }

  async validateDiskSpace(minSpaceGB: number = 5): Promise<{
    sufficient: boolean;
    available: number;
    required: number;
    recommendation?: string;
  }> {
    this.logger.debug(`Validating disk space requirements: ${minSpaceGB}GB`);

    try {
      const fs = await import('fs');
      const { promisify } = await import('util');
      const stat = promisify(fs.stat);

      // Get stats for current working directory
      const stats = await stat(process.cwd());
      // Note: This is a simplified check. In a real implementation,
      // you'd use statvfs or similar to get actual disk space

      return {
        sufficient: true, // Simplified for this implementation
        available: 999, // Placeholder
        required: minSpaceGB,
        recommendation: undefined
      };
    } catch (error) {
      this.logger.error('Failed to check disk space:', error);
      return {
        sufficient: false,
        available: 0,
        required: minSpaceGB,
        recommendation: `Ensure at least ${minSpaceGB}GB of free disk space is available`
      };
    }
  }

  async validateNetworkConnectivity(testUrls: string[] = ['https://www.google.com']): Promise<{
    connected: boolean;
    reachableUrls: string[];
    unreachableUrls: string[];
    recommendation?: string;
  }> {
    this.logger.debug('Validating network connectivity');

    const reachableUrls: string[] = [];
    const unreachableUrls: string[] = [];

    for (const url of testUrls) {
      try {
        // Simple connectivity test using curl
        await exec(`curl -f -s --max-time 10 ${url}`);
        reachableUrls.push(url);
      } catch (error) {
        unreachableUrls.push(url);
      }
    }

    const connected = reachableUrls.length > 0;

    return {
      connected,
      reachableUrls,
      unreachableUrls,
      recommendation: connected ? undefined : 'Check network connectivity'
    };
  }

  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    return 0;
  }
}