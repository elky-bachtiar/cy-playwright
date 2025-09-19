export interface LoggerConfig {
  level?: 'debug' | 'info' | 'warn' | 'error';
  prefix?: string;
  enableTimestamp?: boolean;
  enableColors?: boolean;
}

export class Logger {
  private component: string;
  private config: LoggerConfig;
  private static globalConfig: LoggerConfig = {
    level: 'info',
    enableTimestamp: true,
    enableColors: true
  };

  constructor(component: string, config?: LoggerConfig) {
    this.component = component;
    this.config = { ...Logger.globalConfig, ...config };
  }

  static configure(config: LoggerConfig): void {
    Logger.globalConfig = { ...Logger.globalConfig, ...config };
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      this.log('DEBUG', message, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      this.log('INFO', message, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      this.log('WARN', message, ...args);
    }
  }

  error(message: string, error?: any, ...args: any[]): void {
    if (this.shouldLog('error')) {
      if (error instanceof Error) {
        this.log('ERROR', `${message}: ${error.message}`, error.stack, ...args);
      } else if (error) {
        this.log('ERROR', message, error, ...args);
      } else {
        this.log('ERROR', message, ...args);
      }
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.level || 'info');
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private log(level: string, message: string, ...args: any[]): void {
    const timestamp = this.config.enableTimestamp ? new Date().toISOString() : '';
    const prefix = this.config.prefix || '';
    const component = this.component ? `[${this.component}]` : '';

    let logMessage = '';

    if (timestamp) {
      logMessage += `${timestamp} `;
    }

    if (prefix) {
      logMessage += `${prefix} `;
    }

    logMessage += `${level} ${component} ${message}`;

    // In a real implementation, you might want to use different console methods
    // and handle colors, but for simplicity, we'll just use console.log
    if (level === 'ERROR') {
      console.error(logMessage, ...args);
    } else if (level === 'WARN') {
      console.warn(logMessage, ...args);
    } else {
      console.log(logMessage, ...args);
    }
  }

  // Static utility methods
  static createLogger(component: string, config?: LoggerConfig): Logger {
    return new Logger(component, config);
  }

  static setGlobalLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    Logger.globalConfig.level = level;
  }

  // Method to create child loggers with extended component names
  child(subComponent: string): Logger {
    const childComponent = `${this.component}:${subComponent}`;
    return new Logger(childComponent, this.config);
  }

  // Method to check if a log level would be output
  isDebugEnabled(): boolean {
    return this.shouldLog('debug');
  }

  isInfoEnabled(): boolean {
    return this.shouldLog('info');
  }

  isWarnEnabled(): boolean {
    return this.shouldLog('warn');
  }

  isErrorEnabled(): boolean {
    return this.shouldLog('error');
  }
}