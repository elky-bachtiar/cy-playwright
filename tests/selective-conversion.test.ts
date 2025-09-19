import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { SelectiveConverter } from '../src/services/selective-converter';
import { ProjectTypeAnalyzer } from '../src/services/project-type-analyzer';

// Mock file system operations
jest.mock('fs-extra', () => ({
  readdir: jest.fn(),
  stat: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  ensureDir: jest.fn(),
  pathExists: jest.fn(),
  copy: jest.fn(),
  remove: jest.fn()
}));

// Mock the ProjectTypeAnalyzer
jest.mock('../src/services/project-type-analyzer');

const mockFs = fs as jest.Mocked<typeof fs>;
const MockProjectTypeAnalyzer = ProjectTypeAnalyzer as jest.MockedClass<typeof ProjectTypeAnalyzer>;

describe('SelectiveConverter', () => {
  let converter: SelectiveConverter;
  let mockAnalyzer: jest.Mocked<ProjectTypeAnalyzer>;
  const testProjectPath = '/test/project';
  const outputPath = '/test/output';

  beforeEach(() => {
    mockAnalyzer = new MockProjectTypeAnalyzer() as jest.Mocked<ProjectTypeAnalyzer>;
    converter = new SelectiveConverter(mockAnalyzer);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('convertProject', () => {
    test('should convert only e2e test files, not unit tests', async () => {
      const mockProjectAnalysis = {
        totalFiles: 4,
        categorizedFiles: {
          'angular-unit': ['/test/project/src/component.spec.ts'],
          'cypress-e2e': ['/test/project/e2e/login.cy.ts', '/test/project/e2e/dashboard.cy.ts'],
          'playwright': ['/test/project/tests/api.spec.ts'],
          'mixed': [],
          'unknown': []
        },
        conversionCandidates: ['/test/project/e2e/login.cy.ts', '/test/project/e2e/dashboard.cy.ts'],
        conversionScope: {
          shouldConvert: ['/test/project/e2e/login.cy.ts', '/test/project/e2e/dashboard.cy.ts'],
          shouldPreserve: ['/test/project/src/component.spec.ts', '/test/project/tests/api.spec.ts'],
          conflicts: []
        },
        performanceMetrics: { analysisTime: 100, filesPerSecond: 40 },
        summary: { cypressFiles: 2, playwrightFiles: 1, angularFiles: 1, mixedFiles: 0, unknownFiles: 0 }
      };

      mockAnalyzer.analyzeProject.mockResolvedValue(mockProjectAnalysis);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.ensureDir.mockResolvedValue();
      mockFs.copy.mockResolvedValue();

      const mockConversionResults = [
        {
          originalPath: '/test/project/e2e/login.cy.ts',
          convertedPath: '/test/output/tests/login.spec.ts',
          success: true,
          errors: []
        },
        {
          originalPath: '/test/project/e2e/dashboard.cy.ts',
          convertedPath: '/test/output/tests/dashboard.spec.ts',
          success: true,
          errors: []
        }
      ];

      // Mock the conversion process
      jest.spyOn(converter as any, 'convertFile').mockImplementation(async (filePath: string) => {
        return mockConversionResults.find(result => result.originalPath === filePath);
      });

      const result = await converter.convertProject(testProjectPath, outputPath, {
        preserveStructure: true,
        skipExisting: false
      });

      expect(result.totalFilesProcessed).toBe(2);
      expect(result.successfulConversions).toBe(2);
      expect(result.skippedFiles).toHaveLength(2); // Angular and Playwright files should be skipped
      expect(result.preservedFiles).toContain('/test/project/src/component.spec.ts');
      expect(result.preservedFiles).toContain('/test/project/tests/api.spec.ts');
    });

    test('should preserve existing Playwright tests', async () => {
      const mockProjectAnalysis = {
        totalFiles: 3,
        categorizedFiles: {
          'angular-unit': [],
          'cypress-e2e': ['/test/project/e2e/login.cy.ts'],
          'playwright': ['/test/project/tests/existing.spec.ts'],
          'mixed': [],
          'unknown': []
        },
        conversionCandidates: ['/test/project/e2e/login.cy.ts'],
        conversionScope: {
          shouldConvert: ['/test/project/e2e/login.cy.ts'],
          shouldPreserve: ['/test/project/tests/existing.spec.ts'],
          conflicts: []
        },
        performanceMetrics: { analysisTime: 50, filesPerSecond: 60 },
        summary: { cypressFiles: 1, playwrightFiles: 1, angularFiles: 0, mixedFiles: 0, unknownFiles: 0 }
      };

      mockAnalyzer.analyzeProject.mockResolvedValue(mockProjectAnalysis);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.ensureDir.mockResolvedValue();
      mockFs.copy.mockResolvedValue();

      jest.spyOn(converter as any, 'convertFile').mockResolvedValue({
        originalPath: '/test/project/e2e/login.cy.ts',
        convertedPath: '/test/output/tests/login.spec.ts',
        success: true,
        errors: []
      });

      const result = await converter.convertProject(testProjectPath, outputPath);

      expect(result.preservedFiles).toContain('/test/project/tests/existing.spec.ts');
      expect(mockFs.copy).toHaveBeenCalledWith(
        '/test/project/tests/existing.spec.ts',
        expect.stringContaining('existing.spec.ts')
      );
    });

    test('should handle test files with mixed imports', async () => {
      const mockProjectAnalysis = {
        totalFiles: 2,
        categorizedFiles: {
          'angular-unit': [],
          'cypress-e2e': [],
          'playwright': [],
          'mixed': ['/test/project/tests/mixed.spec.ts'],
          'unknown': []
        },
        conversionCandidates: [],
        conversionScope: {
          shouldConvert: [],
          shouldPreserve: ['/test/project/tests/mixed.spec.ts'],
          conflicts: []
        },
        performanceMetrics: { analysisTime: 30, filesPerSecond: 67 },
        summary: { cypressFiles: 0, playwrightFiles: 0, angularFiles: 0, mixedFiles: 1, unknownFiles: 0 }
      };

      mockAnalyzer.analyzeProject.mockResolvedValue(mockProjectAnalysis);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.ensureDir.mockResolvedValue();

      const result = await converter.convertProject(testProjectPath, outputPath);

      expect(result.mixedFiles).toContain('/test/project/tests/mixed.spec.ts');
      expect(result.warnings).toContain(
        'Mixed framework file detected: /test/project/tests/mixed.spec.ts - Manual review recommended'
      );
    });

    test('should handle directory structure preservation and organization', async () => {
      const mockProjectAnalysis = {
        totalFiles: 3,
        categorizedFiles: {
          'angular-unit': [],
          'cypress-e2e': [
            '/test/project/cypress/e2e/auth/login.cy.ts',
            '/test/project/cypress/e2e/dashboard/overview.cy.ts',
            '/test/project/cypress/e2e/settings/profile.cy.ts'
          ],
          'playwright': [],
          'mixed': [],
          'unknown': []
        },
        conversionCandidates: [
          '/test/project/cypress/e2e/auth/login.cy.ts',
          '/test/project/cypress/e2e/dashboard/overview.cy.ts',
          '/test/project/cypress/e2e/settings/profile.cy.ts'
        ],
        conversionScope: {
          shouldConvert: [
            '/test/project/cypress/e2e/auth/login.cy.ts',
            '/test/project/cypress/e2e/dashboard/overview.cy.ts',
            '/test/project/cypress/e2e/settings/profile.cy.ts'
          ],
          shouldPreserve: [],
          conflicts: []
        },
        performanceMetrics: { analysisTime: 80, filesPerSecond: 37.5 },
        summary: { cypressFiles: 3, playwrightFiles: 0, angularFiles: 0, mixedFiles: 0, unknownFiles: 0 }
      };

      mockAnalyzer.analyzeProject.mockResolvedValue(mockProjectAnalysis);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.ensureDir.mockResolvedValue();

      jest.spyOn(converter as any, 'convertFile').mockImplementation(async (filePath: string) => {
        const fileName = path.basename(filePath, '.cy.ts');
        const relativePath = path.relative('/test/project/cypress/e2e', path.dirname(filePath));
        return {
          originalPath: filePath,
          convertedPath: path.join(outputPath, 'tests', relativePath, `${fileName}.spec.ts`),
          success: true,
          errors: []
        };
      });

      const result = await converter.convertProject(testProjectPath, outputPath, {
        preserveStructure: true
      });

      expect(result.successfulConversions).toBe(3);
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(outputPath, 'tests', 'auth'));
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(outputPath, 'tests', 'dashboard'));
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(outputPath, 'tests', 'settings'));
    });

    test('should skip existing files when skipExisting option is enabled', async () => {
      const mockProjectAnalysis = {
        totalFiles: 2,
        categorizedFiles: {
          'angular-unit': [],
          'cypress-e2e': ['/test/project/e2e/login.cy.ts', '/test/project/e2e/signup.cy.ts'],
          'playwright': [],
          'mixed': [],
          'unknown': []
        },
        conversionCandidates: ['/test/project/e2e/login.cy.ts', '/test/project/e2e/signup.cy.ts'],
        conversionScope: {
          shouldConvert: ['/test/project/e2e/login.cy.ts', '/test/project/e2e/signup.cy.ts'],
          shouldPreserve: [],
          conflicts: []
        },
        performanceMetrics: { analysisTime: 60, filesPerSecond: 33.3 },
        summary: { cypressFiles: 2, playwrightFiles: 0, angularFiles: 0, mixedFiles: 0, unknownFiles: 0 }
      };

      mockAnalyzer.analyzeProject.mockResolvedValue(mockProjectAnalysis);
      mockFs.pathExists.mockImplementation(async (filePath: string) => {
        // Simulate that login.spec.ts already exists
        return filePath.includes('login.spec.ts');
      });
      mockFs.ensureDir.mockResolvedValue();

      jest.spyOn(converter as any, 'convertFile').mockResolvedValue({
        originalPath: '/test/project/e2e/signup.cy.ts',
        convertedPath: '/test/output/tests/signup.spec.ts',
        success: true,
        errors: []
      });

      const result = await converter.convertProject(testProjectPath, outputPath, {
        skipExisting: true
      });

      expect(result.successfulConversions).toBe(1); // Only signup.cy.ts should be converted
      expect(result.skippedFiles).toContain('/test/project/e2e/login.cy.ts');
      expect(result.warnings).toContain(
        'File already exists, skipping: /test/output/tests/login.spec.ts'
      );
    });

    test('should handle large projects efficiently', async () => {
      const manyFiles = Array.from({ length: 100 }, (_, i) => `/test/project/e2e/test${i}.cy.ts`);

      const mockProjectAnalysis = {
        totalFiles: 100,
        categorizedFiles: {
          'angular-unit': [],
          'cypress-e2e': manyFiles,
          'playwright': [],
          'mixed': [],
          'unknown': []
        },
        conversionCandidates: manyFiles,
        conversionScope: {
          shouldConvert: manyFiles,
          shouldPreserve: [],
          conflicts: []
        },
        performanceMetrics: { analysisTime: 1000, filesPerSecond: 100 },
        summary: { cypressFiles: 100, playwrightFiles: 0, angularFiles: 0, mixedFiles: 0, unknownFiles: 0 }
      };

      mockAnalyzer.analyzeProject.mockResolvedValue(mockProjectAnalysis);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.ensureDir.mockResolvedValue();

      jest.spyOn(converter as any, 'convertFile').mockImplementation(async (filePath: string) => {
        // Simulate quick conversion
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          originalPath: filePath,
          convertedPath: filePath.replace('.cy.ts', '.spec.ts').replace('/e2e/', '/tests/'),
          success: true,
          errors: []
        };
      });

      const startTime = Date.now();
      const result = await converter.convertProject(testProjectPath, outputPath);
      const duration = Date.now() - startTime;

      expect(result.successfulConversions).toBe(100);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.performanceMetrics.conversionTime).toBeDefined();
    });
  });

  describe('determineOutputPath', () => {
    test('should generate appropriate output paths for different file types', () => {
      const testCases = [
        {
          input: '/project/cypress/e2e/login.cy.ts',
          expected: '/output/tests/login.spec.ts',
          preserveStructure: false
        },
        {
          input: '/project/cypress/e2e/auth/login.cy.ts',
          expected: '/output/tests/auth/login.spec.ts',
          preserveStructure: true
        },
        {
          input: '/project/e2e/dashboard.cy.ts',
          expected: '/output/tests/dashboard.spec.ts',
          preserveStructure: false
        }
      ];

      testCases.forEach(({ input, expected, preserveStructure }) => {
        const result = converter.determineOutputPath(input, '/output', { preserveStructure });
        expect(result).toBe(expected);
      });
    });
  });

  describe('getConversionScope', () => {
    test('should correctly identify files that need conversion vs preservation', () => {
      const mockAnalysis = {
        categorizedFiles: {
          'angular-unit': ['/project/src/component.spec.ts'],
          'cypress-e2e': ['/project/e2e/login.cy.ts'],
          'playwright': ['/project/tests/api.spec.ts'],
          'mixed': ['/project/tests/mixed.spec.ts'],
          'unknown': ['/project/utils/helper.ts']
        },
        conversionScope: {
          shouldConvert: ['/project/e2e/login.cy.ts'],
          shouldPreserve: [
            '/project/src/component.spec.ts',
            '/project/tests/api.spec.ts',
            '/project/tests/mixed.spec.ts',
            '/project/utils/helper.ts'
          ],
          conflicts: []
        }
      } as any;

      const scope = converter.getConversionScope(mockAnalysis);

      expect(scope.toConvert).toEqual(['/project/e2e/login.cy.ts']);
      expect(scope.toPreserve).toEqual([
        '/project/src/component.spec.ts',
        '/project/tests/api.spec.ts',
        '/project/tests/mixed.spec.ts',
        '/project/utils/helper.ts'
      ]);
      expect(scope.conflicts).toEqual([]);
    });
  });

  describe('validateConversionOptions', () => {
    test('should validate conversion options and provide defaults', () => {
      const validOptions = converter.validateConversionOptions({
        preserveStructure: true,
        skipExisting: false
      });

      expect(validOptions.preserveStructure).toBe(true);
      expect(validOptions.skipExisting).toBe(false);
      expect(validOptions.outputDir).toBe('tests'); // Default value

      const defaultOptions = converter.validateConversionOptions({});
      expect(defaultOptions.preserveStructure).toBe(true); // Default
      expect(defaultOptions.skipExisting).toBe(false); // Default
    });
  });
});