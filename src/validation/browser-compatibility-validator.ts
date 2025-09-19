import { Logger } from '../utils/logger';
import * as childProcess from 'child_process';
import { promisify } from 'util';

const exec = promisify(childProcess.exec);

export interface BrowserInstallationResult {
  allInstalled: boolean;
  installedBrowsers: string[];
  missingBrowsers: string[];
  installCommand?: string;
}

export interface BrowserVersionResult {
  compatibleBrowsers: string[];
  incompatibleBrowsers: string[];
  overallCompatibility: boolean;
  versionInfo: Record<string, string>;
}

export interface SystemRequirementsResult {
  meetsRequirements: boolean;
  supportedBrowsers: string[];
  unsupportedBrowsers: string[];
  warnings: string[];
  recommendations: string[];
}

export interface DisplayModeResult {
  isSupported: boolean;
  requirements: string[];
  warnings: string[];
  recommendations: string[];
}

export class BrowserCompatibilityValidator {
  private logger = new Logger('BrowserCompatibilityValidator');

  // Supported Playwright browsers
  private readonly supportedBrowsers = ['chromium', 'firefox', 'webkit'];

  // Minimum system requirements
  private readonly minSystemRequirements = {
    memory: 2048, // MB
    diskSpace: 5, // GB
    supportedPlatforms: ['linux', 'darwin', 'win32']
  };

  async validateBrowserInstallations(): Promise<BrowserInstallationResult> {
    this.logger.debug('Validating browser installations');

    const result: BrowserInstallationResult = {
      allInstalled: false,
      installedBrowsers: [],
      missingBrowsers: []
    };

    try {
      // Use playwright install --dry-run to check browser status
      const { stdout } = await exec('npx playwright install --dry-run');

      for (const browser of this.supportedBrowsers) {
        if (this.isBrowserInstalled(stdout, browser)) {
          result.installedBrowsers.push(browser);
        } else {
          result.missingBrowsers.push(browser);
        }
      }

      result.allInstalled = result.missingBrowsers.length === 0;

      if (!result.allInstalled) {
        result.installCommand = 'npx playwright install';
      }

    } catch (error) {
      this.logger.error('Failed to check browser installations:', error);

      // Fallback: assume all browsers need installation
      result.missingBrowsers = [...this.supportedBrowsers];
      result.installCommand = 'npx playwright install';
    }

    return result;
  }

  async validateBrowserVersions(browserVersions: Record<string, string>): Promise<BrowserVersionResult> {
    this.logger.debug('Validating browser versions', browserVersions);

    const result: BrowserVersionResult = {
      compatibleBrowsers: [],
      incompatibleBrowsers: [],
      overallCompatibility: false,
      versionInfo: {}
    };

    try {
      // Get Playwright version for compatibility check
      const { stdout } = await exec('npx playwright --version');
      const playwrightVersion = this.extractPlaywrightVersion(stdout);

      for (const [browser, version] of Object.entries(browserVersions)) {
        result.versionInfo[browser] = version;

        if (this.isBrowserVersionCompatible(browser, version, playwrightVersion)) {
          result.compatibleBrowsers.push(browser);
        } else {
          result.incompatibleBrowsers.push(browser);
        }
      }

      result.overallCompatibility = result.incompatibleBrowsers.length === 0;

    } catch (error) {
      this.logger.error('Failed to validate browser versions:', error);
      // Assume all browsers are compatible if we can't check
      result.compatibleBrowsers = Object.keys(browserVersions);
      result.overallCompatibility = true;
    }

    return result;
  }

  async validateSystemRequirements(systemInfo?: {
    platform: string;
    arch: string;
    availableMemory: number;
    diskSpace: number;
  }): Promise<SystemRequirementsResult> {
    this.logger.debug('Validating system requirements');

    const result: SystemRequirementsResult = {
      meetsRequirements: true,
      supportedBrowsers: [],
      unsupportedBrowsers: [],
      warnings: [],
      recommendations: []
    };

    try {
      const actualSystemInfo = systemInfo || await this.getSystemInfo();

      // Validate platform support
      if (!this.minSystemRequirements.supportedPlatforms.includes(actualSystemInfo.platform)) {
        result.meetsRequirements = false;
        result.unsupportedBrowsers = [...this.supportedBrowsers];
        result.warnings.push(`Unsupported platform: ${actualSystemInfo.platform}`);
        return result;
      }

      // Validate memory requirements
      if (actualSystemInfo.availableMemory < this.minSystemRequirements.memory * 1024 * 1024) {
        result.warnings.push('Low available memory may affect browser performance');

        // WebKit typically requires more memory
        if (actualSystemInfo.availableMemory < 4 * 1024 * 1024 * 1024) { // 4GB
          result.unsupportedBrowsers.push('webkit');
          result.recommendations.push('Consider increasing available memory for WebKit support');
        }
      }

      // Validate disk space
      if (actualSystemInfo.diskSpace < this.minSystemRequirements.diskSpace * 1024 * 1024 * 1024) {
        result.warnings.push('Insufficient disk space for browser installations');
        result.recommendations.push('Free up disk space before installing browsers');
      }

      // Platform-specific validations
      this.validatePlatformSpecificRequirements(actualSystemInfo, result);

      // Determine supported browsers
      result.supportedBrowsers = this.supportedBrowsers.filter(
        browser => !result.unsupportedBrowsers.includes(browser)
      );

      result.meetsRequirements = result.supportedBrowsers.length > 0;

    } catch (error) {
      this.logger.error('Failed to validate system requirements:', error);
      result.warnings.push('Unable to validate system requirements');
    }

    return result;
  }

  async validateDisplayMode(config: { headless?: boolean; name?: string }): Promise<DisplayModeResult> {
    this.logger.debug('Validating display mode configuration', config);

    const result: DisplayModeResult = {
      isSupported: true,
      requirements: [],
      warnings: [],
      recommendations: []
    };

    try {
      if (config.headless === false) {
        // Headed mode requires display server
        const displayAvailable = await this.checkDisplayAvailability();

        if (!displayAvailable) {
          result.isSupported = false;
          result.requirements.push('Display server required for headed mode');

          if (process.platform === 'linux') {
            result.requirements.push('X11 or Wayland display server');
            result.recommendations = [
              'Install Xvfb for virtual display: sudo apt-get install xvfb',
              'Or run tests in headless mode'
            ];
          }
        }
      }

      // Platform-specific display validations
      if (process.platform === 'linux' && config.headless === false) {
        if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
          result.warnings.push('No display environment variables set');
        }
      }

    } catch (error) {
      this.logger.error('Failed to validate display mode:', error);
      result.warnings.push('Unable to validate display mode requirements');
    }

    return result;
  }

  async validateWebDriverCompatibility(): Promise<{
    compatible: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    this.logger.debug('Validating WebDriver compatibility');

    const result = {
      compatible: true,
      issues: [],
      recommendations: []
    };

    try {
      // Check for conflicting WebDriver installations
      const chromeDriverCheck = await this.checkConflictingDrivers('chromedriver');
      const geckoDriverCheck = await this.checkConflictingDrivers('geckodriver');

      if (chromeDriverCheck.found) {
        result.issues.push('ChromeDriver detected - may conflict with Playwright');
        result.recommendations.push('Consider removing standalone ChromeDriver');
      }

      if (geckoDriverCheck.found) {
        result.issues.push('GeckoDriver detected - may conflict with Playwright');
        result.recommendations.push('Consider removing standalone GeckoDriver');
      }

      result.compatible = result.issues.length === 0;

    } catch (error) {
      this.logger.warn('WebDriver compatibility check failed:', error);
    }

    return result;
  }

  private isBrowserInstalled(installOutput: string, browser: string): boolean {
    const patterns = {
      chromium: /chromium.*already installed|chromium.*installed/i,
      firefox: /firefox.*already installed|firefox.*installed/i,
      webkit: /webkit.*already installed|webkit.*installed/i
    };

    const pattern = patterns[browser as keyof typeof patterns];
    return pattern ? pattern.test(installOutput) : false;
  }

  private extractPlaywrightVersion(versionOutput: string): string {
    const match = versionOutput.match(/Version (\d+\.\d+\.\d+)/);
    return match ? match[1] : '1.0.0';
  }

  private isBrowserVersionCompatible(browser: string, version: string, playwrightVersion: string): boolean {
    // Simplified compatibility check
    // In a real implementation, you'd have a compatibility matrix

    const playwrightMajor = parseInt(playwrightVersion.split('.')[0], 10);

    // For Playwright 1.x, most modern browser versions are compatible
    if (playwrightMajor >= 1) {
      return true;
    }

    // For older Playwright versions, be more restrictive
    return false;
  }

  private async getSystemInfo() {
    const os = await import('os');

    return {
      platform: process.platform,
      arch: process.arch,
      availableMemory: os.freemem(),
      diskSpace: 50 * 1024 * 1024 * 1024 // Placeholder: 50GB
    };
  }

  private validatePlatformSpecificRequirements(systemInfo: any, result: SystemRequirementsResult): void {
    switch (systemInfo.platform) {
      case 'linux':
        this.validateLinuxRequirements(systemInfo, result);
        break;
      case 'darwin':
        this.validateMacOSRequirements(systemInfo, result);
        break;
      case 'win32':
        this.validateWindowsRequirements(systemInfo, result);
        break;
    }
  }

  private validateLinuxRequirements(systemInfo: any, result: SystemRequirementsResult): void {
    // Linux-specific validations
    if (systemInfo.arch !== 'x64') {
      result.warnings.push('Non-x64 architecture may have limited browser support');
    }

    // Check for common Linux dependencies (would need actual system calls)
    result.recommendations.push('Ensure required system libraries are installed');
  }

  private validateMacOSRequirements(systemInfo: any, result: SystemRequirementsResult): void {
    // macOS-specific validations
    if (systemInfo.arch === 'arm64') {
      result.recommendations.push('ARM64 Mac detected - browsers run under Rosetta translation');
    }
  }

  private validateWindowsRequirements(systemInfo: any, result: SystemRequirementsResult): void {
    // Windows-specific validations
    result.recommendations.push('Ensure Windows Defender exclusions are configured for test directories');
  }

  private async checkDisplayAvailability(): Promise<boolean> {
    try {
      // Check environment variables
      if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
        return true;
      }

      // On macOS and Windows, display is usually available
      if (process.platform === 'darwin' || process.platform === 'win32') {
        return true;
      }

      // On Linux, try to detect X11
      try {
        await exec('xdpyinfo');
        return true;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  private async checkConflictingDrivers(driverName: string): Promise<{ found: boolean; path?: string }> {
    try {
      const { stdout } = await exec(`which ${driverName}`);
      return { found: true, path: stdout.trim() };
    } catch {
      return { found: false };
    }
  }
}