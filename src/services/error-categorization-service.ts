import { Logger } from '../utils/logger';

export interface ValidationError {
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  column?: number;
  file?: string;
  code?: string;
}

export interface ErrorCategory {
  count: number;
  severity: 'critical' | 'major' | 'minor';
  examples: string[];
  impact: string;
  resolution: string;
}

export interface ErrorCategorizationResults {
  categories: {
    [category: string]: ErrorCategory;
  };
  priorityOrder: string[];
  estimatedFixTime: {
    [category: string]: string;
  };
}

export class ErrorCategorizationService {
  private logger = new Logger('ErrorCategorizationService');

  // Error patterns and their categorization rules
  private readonly errorPatterns = {
    'syntax-errors': {
      patterns: [
        /SyntaxError|Unexpected token|Expected/i,
        /Cannot find name|Property .* does not exist/i,
        /Type .* is not assignable to type/i
      ],
      severity: 'critical' as const,
      impact: 'Prevents test compilation and execution',
      resolution: 'Fix TypeScript/JavaScript syntax errors',
      estimatedTime: '15-30 minutes per error'
    },
    'import-issues': {
      patterns: [
        /Cannot resolve module|Module not found/i,
        /has no exported member/i,
        /Cannot find module/i
      ],
      severity: 'critical' as const,
      impact: 'Prevents test files from loading required dependencies',
      resolution: 'Update import statements and install missing packages',
      estimatedTime: '10-20 minutes per import'
    },
    'async-await-patterns': {
      patterns: [
        /await.*without async/i,
        /Promise.*not handled/i,
        /async.*without await/i
      ],
      severity: 'major' as const,
      impact: 'May cause test timing issues and unreliable results',
      resolution: 'Convert to proper async/await patterns',
      estimatedTime: '20-40 minutes per file'
    },
    'locator-strategy': {
      patterns: [
        /cy\.get.*deprecated/i,
        /querySelector.*brittle/i,
        /css selector.*unreliable/i
      ],
      severity: 'major' as const,
      impact: 'Tests may be brittle and fail unexpectedly',
      resolution: 'Migrate to semantic locators (getByRole, getByText)',
      estimatedTime: '30-60 minutes per locator'
    },
    'cypress-artifacts': {
      patterns: [
        /cy\./i,
        /Cypress\./i,
        /cypress/i
      ],
      severity: 'critical' as const,
      impact: 'Unconverted Cypress code will cause runtime errors',
      resolution: 'Complete conversion to Playwright equivalents',
      estimatedTime: '20-45 minutes per artifact'
    },
    'configuration-issues': {
      patterns: [
        /playwright\.config/i,
        /browser.*not configured/i,
        /viewport.*invalid/i
      ],
      severity: 'major' as const,
      impact: 'Tests may not run in intended environment',
      resolution: 'Update Playwright configuration settings',
      estimatedTime: '15-30 minutes per config issue'
    },
    'dependency-conflicts': {
      patterns: [
        /version conflict/i,
        /peer dependency/i,
        /incompatible version/i
      ],
      severity: 'major' as const,
      impact: 'May cause build failures or runtime issues',
      resolution: 'Resolve dependency version conflicts',
      estimatedTime: '30-90 minutes per conflict'
    },
    'browser-compatibility': {
      patterns: [
        /browser.*not supported/i,
        /webkit.*issue/i,
        /firefox.*compatibility/i
      ],
      severity: 'minor' as const,
      impact: 'Limited browser test coverage',
      resolution: 'Update test code for cross-browser compatibility',
      estimatedTime: '45-120 minutes per browser issue'
    },
    'performance-issues': {
      patterns: [
        /timeout/i,
        /slow.*execution/i,
        /memory.*usage/i
      ],
      severity: 'minor' as const,
      impact: 'Tests may run slowly or consume excessive resources',
      resolution: 'Optimize test performance and resource usage',
      estimatedTime: '60-180 minutes per performance issue'
    },
    'assertion-patterns': {
      patterns: [
        /should.*not converted/i,
        /expect.*missing/i,
        /assertion.*invalid/i
      ],
      severity: 'major' as const,
      impact: 'Tests may not properly validate expected behavior',
      resolution: 'Convert Cypress assertions to Playwright expect patterns',
      estimatedTime: '10-25 minutes per assertion'
    }
  };

  categorizeErrors(errors: ValidationError[]): ErrorCategorizationResults {
    this.logger.debug(`Categorizing ${errors.length} errors`);

    const categories: { [category: string]: ErrorCategory } = {};
    const estimatedFixTime: { [category: string]: string } = {};

    // Initialize categories
    Object.keys(this.errorPatterns).forEach(category => {
      categories[category] = {
        count: 0,
        severity: this.errorPatterns[category].severity,
        examples: [],
        impact: this.errorPatterns[category].impact,
        resolution: this.errorPatterns[category].resolution
      };
      estimatedFixTime[category] = this.errorPatterns[category].estimatedTime;
    });

    // Categorize each error
    errors.forEach(error => {
      let categorized = false;

      for (const [categoryName, categoryInfo] of Object.entries(this.errorPatterns)) {
        if (this.matchesCategory(error, categoryInfo.patterns)) {
          categories[categoryName].count++;

          // Add example if we have fewer than 3
          if (categories[categoryName].examples.length < 3) {
            const example = error.file
              ? `${error.file}:${error.line || 0} - ${error.message}`
              : error.message;
            categories[categoryName].examples.push(example);
          }

          categorized = true;
          break;
        }
      }

      // Handle uncategorized errors
      if (!categorized) {
        if (!categories['other']) {
          categories['other'] = {
            count: 0,
            severity: 'minor',
            examples: [],
            impact: 'Various issues that need individual assessment',
            resolution: 'Review and fix case-by-case'
          };
          estimatedFixTime['other'] = '15-60 minutes per issue';
        }
        categories['other'].count++;

        if (categories['other'].examples.length < 3) {
          const example = error.file
            ? `${error.file}:${error.line || 0} - ${error.message}`
            : error.message;
          categories['other'].examples.push(example);
        }
      }
    });

    // Generate priority order based on severity and count
    const priorityOrder = this.generatePriorityOrder(categories);

    return {
      categories,
      priorityOrder,
      estimatedFixTime
    };
  }

  getCategoryDetails(categoryName: string): ErrorCategory | null {
    if (this.errorPatterns[categoryName]) {
      return {
        count: 0,
        severity: this.errorPatterns[categoryName].severity,
        examples: [],
        impact: this.errorPatterns[categoryName].impact,
        resolution: this.errorPatterns[categoryName].resolution
      };
    }
    return null;
  }

  estimateTotalFixTime(categories: { [category: string]: ErrorCategory }): {
    totalHours: number;
    breakdown: { [category: string]: number };
  } {
    let totalMinutes = 0;
    const breakdown: { [category: string]: number } = {};

    Object.entries(categories).forEach(([categoryName, category]) => {
      if (category.count > 0) {
        const timeRange = this.estimatedFixTime[categoryName] || '30 minutes per issue';
        const avgMinutes = this.parseTimeEstimate(timeRange);
        const categoryTime = avgMinutes * category.count;

        breakdown[categoryName] = Math.round(categoryTime / 60 * 10) / 10; // Round to 1 decimal
        totalMinutes += categoryTime;
      }
    });

    return {
      totalHours: Math.round(totalMinutes / 60 * 10) / 10,
      breakdown
    };
  }

  generatePriorityMatrix(categories: { [category: string]: ErrorCategory }): {
    critical: string[];
    major: string[];
    minor: string[];
  } {
    const critical: string[] = [];
    const major: string[] = [];
    const minor: string[] = [];

    Object.entries(categories).forEach(([categoryName, category]) => {
      if (category.count > 0) {
        switch (category.severity) {
          case 'critical':
            critical.push(categoryName);
            break;
          case 'major':
            major.push(categoryName);
            break;
          case 'minor':
            minor.push(categoryName);
            break;
        }
      }
    });

    // Sort by count within each severity level
    const sortByCount = (a: string, b: string) =>
      categories[b].count - categories[a].count;

    return {
      critical: critical.sort(sortByCount),
      major: major.sort(sortByCount),
      minor: minor.sort(sortByCount)
    };
  }

  private matchesCategory(error: ValidationError, patterns: RegExp[]): boolean {
    const textToMatch = `${error.message} ${error.code || ''}`.toLowerCase();
    return patterns.some(pattern => pattern.test(textToMatch));
  }

  private generatePriorityOrder(categories: { [category: string]: ErrorCategory }): string[] {
    const categoryEntries = Object.entries(categories)
      .filter(([_, category]) => category.count > 0);

    // Sort by severity first, then by count
    const severityWeight = { critical: 3, major: 2, minor: 1 };

    return categoryEntries
      .sort(([aName, a], [bName, b]) => {
        const aSeverityWeight = severityWeight[a.severity];
        const bSeverityWeight = severityWeight[b.severity];

        if (aSeverityWeight !== bSeverityWeight) {
          return bSeverityWeight - aSeverityWeight; // Higher severity first
        }

        return b.count - a.count; // Higher count first within same severity
      })
      .map(([name]) => name);
  }

  private parseTimeEstimate(timeString: string): number {
    // Extract average minutes from time range strings like "15-30 minutes per error"
    const match = timeString.match(/(\d+)-(\d+)\s*minutes/i);
    if (match) {
      const min = parseInt(match[1], 10);
      const max = parseInt(match[2], 10);
      return (min + max) / 2;
    }

    // Fallback for single value like "30 minutes per issue"
    const singleMatch = timeString.match(/(\d+)\s*minutes/i);
    if (singleMatch) {
      return parseInt(singleMatch[1], 10);
    }

    return 30; // Default fallback
  }

  private get estimatedFixTime() {
    const result: { [category: string]: string } = {};
    Object.entries(this.errorPatterns).forEach(([category, info]) => {
      result[category] = info.estimatedTime;
    });
    return result;
  }
}