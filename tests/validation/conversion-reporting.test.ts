import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ConversionReportingValidator, ConversionReport } from '../../src/validation/conversion-reporting-validator';
import { ErrorCategorizationService } from '../../src/services/error-categorization-service';
import { ComparisonAnalyzer } from '../../src/services/comparison-analyzer';
import { CIMigrationAnalyzer } from '../../src/validation/ci-migration-analyzer';
import * as fs from 'fs-extra';

// Mock dependencies
jest.mock('fs-extra');
const mockFs = {
  pathExists: jest.fn(),
  readdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  ensureDir: jest.fn(),
  copy: jest.fn(),
  remove: jest.fn()
};

describe('Conversion Reporting Test Suite', () => {
  let reportingValidator: ConversionReportingValidator;
  let errorCategorizationService: ErrorCategorizationService;
  let comparisonAnalyzer: ComparisonAnalyzer;
  let ciMigrationAnalyzer: CIMigrationAnalyzer;

  beforeEach(() => {
    reportingValidator = new ConversionReportingValidator();
    errorCategorizationService = new ErrorCategorizationService();
    comparisonAnalyzer = new ComparisonAnalyzer();
    ciMigrationAnalyzer = new CIMigrationAnalyzer();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Detailed Conversion Report Generation', () => {
    test('should generate comprehensive conversion report', async () => {
      const conversionData = {
        sourceProject: '/path/to/cypress/project',
        targetProject: '/path/to/playwright/project',
        conversionResults: {
          filesConverted: 15,
          testsConverted: 42,
          customCommandsConverted: 8,
          configurationsMigrated: 3
        },
        validationResults: {
          syntaxValidation: { passed: 40, failed: 2 },
          executionValidation: { passed: 38, failed: 4 }
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readdir.mockResolvedValue(['test1.spec.ts', 'test2.spec.ts'] as any);

      const report = await reportingValidator.generateDetailedReport(conversionData);

      expect(report.summary.totalFiles).toBe(15);
      expect(report.summary.successRate).toBeGreaterThan(80);
      expect(report.sections).toContain('fileConversions');
      expect(report.sections).toContain('validationResults');
      expect(report.sections).toContain('recommendations');
    });

    test('should include file-by-file conversion details', async () => {
      const conversionData = {
        sourceProject: '/path/to/cypress/project',
        targetProject: '/path/to/playwright/project',
        fileConversions: [
          {
            sourcePath: 'cypress/e2e/login.cy.ts',
            targetPath: 'tests/login.spec.ts',
            status: 'success',
            linesConverted: 45,
            issuesFound: []
          },
          {
            sourcePath: 'cypress/e2e/dashboard.cy.ts',
            targetPath: 'tests/dashboard.spec.ts',
            status: 'warning',
            linesConverted: 78,
            issuesFound: ['Missing await on line 23']
          }
        ]
      };

      const report = await reportingValidator.generateDetailedReport(conversionData);

      expect(report.fileDetails).toHaveLength(2);
      expect(report.fileDetails[0].conversionStatus).toBe('success');
      expect(report.fileDetails[1].conversionStatus).toBe('warning');
      expect(report.fileDetails[1].issues).toContain('Missing await on line 23');
    });

    test('should analyze custom command conversions', async () => {
      const conversionData = {
        customCommands: [
          {
            name: 'loginUser',
            sourceFile: 'cypress/support/commands.js',
            targetImplementation: 'page-object',
            targetFile: 'tests/page-objects/AuthPage.ts',
            complexity: 'medium'
          },
          {
            name: 'selectProduct',
            sourceFile: 'cypress/support/commands.js',
            targetImplementation: 'utility-function',
            targetFile: 'tests/utils/product-helpers.ts',
            complexity: 'low'
          }
        ]
      };

      const report = await reportingValidator.generateDetailedReport(conversionData);

      expect(report.customCommandAnalysis).toHaveLength(2);
      expect(report.customCommandAnalysis[0].conversionStrategy).toBe('page-object');
      expect(report.customCommandAnalysis[1].conversionStrategy).toBe('utility-function');
    });

    test('should include configuration migration details', async () => {
      const conversionData = {
        configurationMigration: {
          cypressConfig: {
            baseUrl: 'http://localhost:3000',
            viewportWidth: 1280,
            viewportHeight: 720,
            defaultCommandTimeout: 4000
          },
          playwrightConfig: {
            use: {
              baseURL: 'http://localhost:3000',
              viewport: { width: 1280, height: 720 },
              actionTimeout: 4000
            }
          },
          mappings: ['baseUrl → baseURL', 'viewportWidth/Height → viewport', 'defaultCommandTimeout → actionTimeout']
        }
      };

      const report = await reportingValidator.generateDetailedReport(conversionData);

      expect(report.configurationAnalysis.originalSettings).toBeDefined();
      expect(report.configurationAnalysis.convertedSettings).toBeDefined();
      expect(report.configurationAnalysis.mappings).toHaveLength(3);
    });

    test('should generate performance metrics', async () => {
      const conversionData = {
        performanceMetrics: {
          conversionDuration: 125000, // 2 minutes 5 seconds
          fileProcessingTimes: {
            'test1.cy.ts': 2500,
            'test2.cy.ts': 3200
          },
          memoryUsage: {
            peak: 512,
            average: 256
          },
          filesPerSecond: 0.12
        }
      };

      const report = await reportingValidator.generateDetailedReport(conversionData);

      expect(report.performanceMetrics.totalDuration).toBe(125000);
      expect(report.performanceMetrics.averageFileProcessingTime).toBeGreaterThan(0);
      expect(report.performanceMetrics.efficiency.filesPerSecond).toBe(0.12);
    });
  });

  describe('Error Categorization and Suggestions', () => {
    test('should categorize syntax errors', async () => {
      const errors = [
        {
          type: 'syntax_error',
          message: 'Unexpected token )',
          file: 'test1.spec.ts',
          line: 15
        },
        {
          type: 'missing_import',
          message: 'test is not defined',
          file: 'test2.spec.ts',
          line: 1
        },
        {
          type: 'conversion_artifact',
          message: 'Found cy.get command',
          file: 'test3.spec.ts',
          line: 8
        }
      ];

      const categorization = await errorCategorizationService.categorizeErrors(errors);

      expect(categorization.categories.syntax).toHaveLength(1);
      expect(categorization.categories.imports).toHaveLength(1);
      expect(categorization.categories.conversion).toHaveLength(1);
      expect(categorization.totalErrors).toBe(3);
    });

    test('should generate targeted suggestions for each error category', async () => {
      const errors = [
        { type: 'missing_import', message: 'expect is not defined', file: 'test.spec.ts' },
        { type: 'missing_await', message: 'Missing await for page.click()', file: 'test.spec.ts' }
      ];

      const suggestions = await errorCategorizationService.generateSuggestions(errors);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('Add missing Playwright imports: import { test, expect } from \'@playwright/test\'');
      expect(suggestions).toContain('Add await keywords for asynchronous operations');
    });

    test('should prioritize errors by severity and impact', async () => {
      const errors = [
        { type: 'syntax_error', severity: 'high', impact: 'blocking' },
        { type: 'missing_await', severity: 'medium', impact: 'warning' },
        { type: 'style_issue', severity: 'low', impact: 'suggestion' }
      ];

      const prioritized = await errorCategorizationService.prioritizeErrors(errors);

      expect(prioritized[0].severity).toBe('high');
      expect(prioritized[0].impact).toBe('blocking');
      expect(prioritized[prioritized.length - 1].severity).toBe('low');
    });

    test('should suggest automated fixes where possible', async () => {
      const errors = [
        {
          type: 'missing_import',
          message: 'test is not defined',
          file: 'test.spec.ts',
          autoFixable: true
        },
        {
          type: 'missing_await',
          message: 'Missing await for page.goto',
          file: 'test.spec.ts',
          line: 10,
          autoFixable: true
        }
      ];

      const fixes = await errorCategorizationService.generateAutomatedFixes(errors);

      expect(fixes).toHaveLength(2);
      expect(fixes[0].fixType).toBe('add_import');
      expect(fixes[1].fixType).toBe('add_await');
      expect(fixes[0].applicableFiles).toContain('test.spec.ts');
    });

    test('should track error patterns across files', async () => {
      const errors = [
        { type: 'missing_await', file: 'test1.spec.ts', pattern: 'page.click' },
        { type: 'missing_await', file: 'test2.spec.ts', pattern: 'page.click' },
        { type: 'missing_await', file: 'test3.spec.ts', pattern: 'page.goto' }
      ];

      const patterns = await errorCategorizationService.analyzeErrorPatterns(errors);

      expect(patterns.commonPatterns).toContain('missing_await_page_click');
      expect(patterns.affectedFiles.get('missing_await_page_click')).toHaveLength(2);
      expect(patterns.recommendations).toContain('Consider adding await to all page interaction methods');
    });
  });

  describe('Before/After Comparison Reports', () => {
    test('should compare code structure before and after conversion', async () => {
      const beforeStructure = {
        totalFiles: 20,
        testFiles: 15,
        supportFiles: 3,
        configFiles: 2,
        totalLines: 2500,
        testCoverage: {
          statements: 85,
          branches: 78,
          functions: 92
        }
      };

      const afterStructure = {
        totalFiles: 18,
        testFiles: 15,
        supportFiles: 1,
        configFiles: 2,
        totalLines: 2200,
        testCoverage: {
          statements: 87,
          branches: 80,
          functions: 94
        }
      };

      const comparison = await comparisonAnalyzer.compareProjectStructure(beforeStructure, afterStructure);

      expect(comparison.improvements).toContain('Reduced total lines of code by 12%');
      expect(comparison.improvements).toContain('Improved test coverage across all metrics');
      expect(comparison.changes.fileReduction).toBe(2);
      expect(comparison.changes.lineReduction).toBe(300);
    });

    test('should analyze test execution time improvements', async () => {
      const beforeExecution = {
        totalDuration: 180000, // 3 minutes
        averageTestDuration: 4500,
        parallelization: false,
        browserCount: 1
      };

      const afterExecution = {
        totalDuration: 95000, // 1 minute 35 seconds
        averageTestDuration: 2375,
        parallelization: true,
        browserCount: 3
      };

      const comparison = await comparisonAnalyzer.compareExecutionPerformance(beforeExecution, afterExecution);

      expect(comparison.speedImprovement).toBeCloseTo(47.2, 1); // ~47% improvement
      expect(comparison.improvements).toContain('Enabled parallel execution');
      expect(comparison.improvements).toContain('Added multi-browser testing');
    });

    test('should compare locator strategies and maintainability', async () => {
      const beforeLocators = {
        cssSelectors: 45,
        dataTestIds: 12,
        xpathSelectors: 8,
        semanticSelectors: 5,
        maintainabilityScore: 35
      };

      const afterLocators = {
        cssSelectors: 15,
        dataTestIds: 20,
        semanticSelectors: 35,
        getByRoleSelectors: 25,
        maintainabilityScore: 85
      };

      const comparison = await comparisonAnalyzer.compareLocatorStrategies(beforeLocators, afterLocators);

      expect(comparison.maintainabilityImprovement).toBe(50);
      expect(comparison.modernSelectorAdoption).toBeGreaterThan(80);
      expect(comparison.recommendations).toContain('Excellent adoption of semantic selectors');
    });

    test('should analyze dependency and security improvements', async () => {
      const beforeDependencies = {
        totalDependencies: 45,
        securityVulnerabilities: 8,
        outdatedPackages: 12,
        mainFramework: 'cypress@10.3.0'
      };

      const afterDependencies = {
        totalDependencies: 38,
        securityVulnerabilities: 2,
        outdatedPackages: 3,
        mainFramework: '@playwright/test@1.40.0'
      };

      const comparison = await comparisonAnalyzer.compareDependencies(beforeDependencies, afterDependencies);

      expect(comparison.securityImprovement).toBe(75); // 75% reduction in vulnerabilities
      expect(comparison.dependencyReduction).toBe(7);
      expect(comparison.improvements).toContain('Significant reduction in security vulnerabilities');
    });
  });

  describe('CI/CD Migration Analysis Reports', () => {
    test('should analyze GitHub Actions workflow conversion', async () => {
      const originalWorkflow = {
        name: 'Cypress Tests',
        triggers: ['push', 'pull_request'],
        jobs: {
          'cypress-run': {
            browsers: ['chrome', 'firefox'],
            parallelization: false,
            artifactCollection: ['videos', 'screenshots']
          }
        }
      };

      const convertedWorkflow = {
        name: 'Playwright Tests',
        triggers: ['push', 'pull_request'],
        jobs: {
          'playwright-run': {
            browsers: ['chromium', 'firefox', 'webkit'],
            parallelization: true,
            sharding: 4,
            artifactCollection: ['traces', 'reports']
          }
        }
      };

      const analysis = await ciMigrationAnalyzer.analyzeGitHubActions(originalWorkflow, convertedWorkflow);

      expect(analysis.improvements).toContain('Added WebKit browser testing');
      expect(analysis.improvements).toContain('Enabled test sharding for faster execution');
      expect(analysis.changes.browsersAdded).toContain('webkit');
      expect(analysis.changes.featuresAdded).toContain('parallelization');
    });

    test('should analyze CircleCI configuration migration', async () => {
      const originalConfig = {
        version: '2.1',
        jobs: {
          'cypress-test': {
            docker: [{ image: 'cypress/browsers:node16.14.2-slim-chrome103-ff102' }],
            parallelism: 2,
            steps: ['cypress run --record']
          }
        }
      };

      const convertedConfig = {
        version: '2.1',
        jobs: {
          'playwright-test': {
            docker: [{ image: 'mcr.microsoft.com/playwright:v1.40.0-focal' }],
            parallelism: 4,
            steps: ['npx playwright test --shard=$CIRCLE_NODE_INDEX/$CIRCLE_NODE_TOTAL']
          }
        }
      };

      const analysis = await ciMigrationAnalyzer.analyzeCircleCI(originalConfig, convertedConfig);

      expect(analysis.improvements).toContain('Doubled parallelism for faster execution');
      expect(analysis.improvements).toContain('Upgraded to official Playwright Docker image');
      expect(analysis.changes.parallelismIncrease).toBe(2);
    });

    test('should provide migration recommendations', async () => {
      const migrationData = {
        platform: 'github-actions',
        originalComplexity: 'medium',
        convertedComplexity: 'medium',
        featuresAdded: ['sharding', 'multi-browser'],
        featuresRemoved: ['cypress-dashboard'],
        issuesDetected: ['missing-artifact-cleanup']
      };

      const recommendations = await ciMigrationAnalyzer.generateMigrationRecommendations(migrationData);

      expect(recommendations.immediate).toContain('Add artifact cleanup step');
      expect(recommendations.longTerm).toContain('Consider implementing test result caching');
      expect(recommendations.performance).toContain('Monitor sharding effectiveness');
    });

    test('should calculate CI/CD migration success metrics', async () => {
      const migrationMetrics = {
        executionTimeImprovement: 45, // 45% faster
        reliabilityImprovement: 20, // 20% more reliable
        maintenanceReduction: 30, // 30% less maintenance
        featureEnhancements: 5,
        costReduction: 15 // 15% cost reduction
      };

      const successScore = await ciMigrationAnalyzer.calculateMigrationSuccess(migrationMetrics);

      expect(successScore.overallScore).toBeGreaterThan(75);
      expect(successScore.strongestImprovement).toBe('execution_time');
      expect(successScore.riskAreas).toHaveLength(0); // No significant risks
    });
  });

  describe('Report Export and Formatting', () => {
    test('should export report in multiple formats', async () => {
      const report: DetailedConversionReport = {
        summary: {
          projectName: 'Test Project',
          conversionDate: new Date(),
          totalFiles: 15,
          successRate: 92.5
        },
        sections: ['summary', 'fileDetails', 'recommendations'],
        fileDetails: [],
        recommendations: ['Use semantic locators'],
        performanceMetrics: {
          totalDuration: 120000,
          averageFileProcessingTime: 8000,
          efficiency: { filesPerSecond: 0.125 }
        }
      };

      const htmlReport = await reportingValidator.exportReport(report, 'html');
      const markdownReport = await reportingValidator.exportReport(report, 'markdown');
      const jsonReport = await reportingValidator.exportReport(report, 'json');

      expect(htmlReport).toContain('<html>');
      expect(htmlReport).toContain('Test Project');
      expect(markdownReport).toContain('# Conversion Report');
      expect(jsonReport).toContain('"projectName":"Test Project"');
    });

    test('should generate executive summary for stakeholders', async () => {
      const report: DetailedConversionReport = {
        summary: {
          projectName: 'E-commerce Platform',
          conversionDate: new Date(),
          totalFiles: 50,
          successRate: 96,
          keyMetrics: {
            testExecutionImprovement: 40,
            maintenanceReduction: 35,
            browserCoverageIncrease: 200
          }
        },
        sections: ['summary'],
        fileDetails: [],
        recommendations: [],
        performanceMetrics: {
          totalDuration: 300000,
          averageFileProcessingTime: 6000,
          efficiency: { filesPerSecond: 0.167 }
        }
      };

      const executiveSummary = await reportingValidator.generateExecutiveSummary(report);

      expect(executiveSummary.keyAchievements).toContain('96% conversion success rate');
      expect(executiveSummary.businessImpact).toContain('40% faster test execution');
      expect(executiveSummary.businessImpact).toContain('200% increase in browser coverage');
      expect(executiveSummary.recommendations).toHaveLength(3);
    });

    test('should include interactive elements for HTML reports', async () => {
      const report = {
        summary: { projectName: 'Interactive Test', successRate: 88 },
        sections: ['fileDetails'],
        fileDetails: [
          { fileName: 'test1.spec.ts', conversionStatus: 'success' },
          { fileName: 'test2.spec.ts', conversionStatus: 'warning' }
        ]
      };

      const htmlReport = await reportingValidator.exportReport(report, 'html', { interactive: true });

      expect(htmlReport).toContain('onclick=');
      expect(htmlReport).toContain('chart');
      expect(htmlReport).toContain('collapsible');
    });
  });
});