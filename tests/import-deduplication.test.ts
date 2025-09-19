import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ImportAnalyzer } from '../src/services/import-analyzer';
import { ImportPathTransformer } from '../src/services/import-path-transformer';

// Mock file system operations
jest.mock('fs-extra', () => ({
  readdir: jest.fn(),
  stat: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  ensureDir: jest.fn(),
  pathExists: jest.fn()
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ImportAnalyzer', () => {
  let analyzer: ImportAnalyzer;
  const testFilePath = '/test/file.ts';

  beforeEach(() => {
    analyzer = new ImportAnalyzer();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Duplicate Import Detection', () => {
    test('should detect duplicate Playwright test imports', async () => {
      // Arrange
      const fileContent = `import { test, expect } from '@playwright/test';
import { expect, Request, test } from '@playwright/test';
import { BoekenPage } from '../pages/boeken-page';`;

      mockFs.readFile.mockResolvedValue(fileContent as any);

      // Act
      const result = await analyzer.analyzeDuplicateImports(testFilePath);

      // Assert
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0]).toEqual({
        source: '@playwright/test',
        imports: [
          { namedImports: ['test', 'expect'], line: 1 },
          { namedImports: ['expect', 'Request', 'test'], line: 2 }
        ]
      });
    });

    test('should detect multiple sources with duplicate imports', async () => {
      // Arrange
      const fileContent = `import { test, expect } from '@playwright/test';
import { expect } from '@playwright/test';
import React from 'react';
import React, { useState } from 'react';`;

      mockFs.readFile.mockResolvedValue(fileContent as any);

      // Act
      const result = await analyzer.analyzeDuplicateImports(testFilePath);

      // Assert
      expect(result.duplicates).toHaveLength(2);
      expect(result.duplicates.find(d => d.source === '@playwright/test')).toBeDefined();
      expect(result.duplicates.find(d => d.source === 'react')).toBeDefined();
    });

    test('should not flag single imports as duplicates', async () => {
      // Arrange
      const fileContent = `import { test, expect } from '@playwright/test';
import { BoekenPage } from '../pages/boeken-page';
import { WireMockMappingClient } from '../../../wiremock/generated/mappings/WiremockServerConfig';`;

      mockFs.readFile.mockResolvedValue(fileContent as any);

      // Act
      const result = await analyzer.analyzeDuplicateImports(testFilePath);

      // Assert
      expect(result.duplicates).toHaveLength(0);
    });
  });

  describe('Cypress-specific Import Removal', () => {
    test('should identify Cypress-specific imports for removal', async () => {
      // Arrange
      const fileContent = `import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DebugElement } from '@angular/core';
import { test, expect } from '@playwright/test';
import { BoekenPage } from '../pages/boeken-page';`;

      mockFs.readFile.mockResolvedValue(fileContent as any);

      // Act
      const result = await analyzer.analyzeCypressImports(testFilePath);

      // Assert
      expect(result.cypressImports).toHaveLength(3);
      expect(result.cypressImports[0]).toEqual({
        source: '@angular/core/testing',
        namedImports: ['ComponentFixture', 'TestBed'],
        shouldRemove: true,
        reason: 'Angular testing import not needed in e2e tests'
      });
    });

    test('should preserve legitimate imports', async () => {
      // Arrange
      const fileContent = `import { test, expect } from '@playwright/test';
import { WireMockMappingClient } from '../../../wiremock/generated/mappings/WiremockServerConfig';
import { MockUtil } from '@sta/wiremock-generator-ts';
import { Inloggegevens } from '../../../wiremock/generated/dtos/model/inloggegevens';`;

      mockFs.readFile.mockResolvedValue(fileContent as any);

      // Act
      const result = await analyzer.analyzeCypressImports(testFilePath);

      // Assert
      expect(result.legitImports).toHaveLength(4);
      expect(result.cypressImports).toHaveLength(0);
    });

    test('should handle mixed Angular and e2e imports', async () => {
      // Arrange
      const fileContent = `import { ComponentFixture, TestBed } from '@angular/core/testing';
import { test, expect } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { MockUtil } from '@sta/wiremock-generator-ts';`;

      mockFs.readFile.mockResolvedValue(fileContent as any);

      // Act
      const result = await analyzer.analyzeAllImports(testFilePath);

      // Assert
      expect(result.duplicates).toHaveLength(1); // Playwright duplicates
      expect(result.cypressImports).toHaveLength(1); // Angular testing
      expect(result.legitImports).toHaveLength(1); // MockUtil
    });
  });

  describe('Import Sorting and Organization', () => {
    test('should sort imports by type and source', async () => {
      // Arrange
      const fileContent = `import { WireMockMappingClient } from '../../../wiremock/generated/mappings/WiremockServerConfig';
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import * as path from 'path';
import { BoekenPage } from '../pages/boeken-page';`;

      mockFs.readFile.mockResolvedValue(fileContent as any);

      // Act
      const result = await analyzer.organizeImports(testFilePath);

      // Assert
      expect(result.organized).toEqual([
        { category: 'builtin', source: 'fs', imports: ['*'] },
        { category: 'builtin', source: 'path', imports: ['*'] },
        { category: 'external', source: '@playwright/test', imports: ['test', 'expect'] },
        { category: 'relative', source: '../pages/boeken-page', imports: ['BoekenPage'] },
        { category: 'relative', source: '../../../wiremock/generated/mappings/WiremockServerConfig', imports: ['WireMockMappingClient'] }
      ]);
    });

    test('should merge duplicate imports during organization', async () => {
      // Arrange
      const fileContent = `import { test } from '@playwright/test';
import { expect } from '@playwright/test';
import { Request } from '@playwright/test';`;

      mockFs.readFile.mockResolvedValue(fileContent as any);

      // Act
      const result = await analyzer.organizeImports(testFilePath);

      // Assert
      expect(result.organized).toHaveLength(1);
      expect(result.organized[0]).toEqual({
        category: 'external',
        source: '@playwright/test',
        imports: ['test', 'expect', 'Request']
      });
    });
  });
});

describe('ImportPathTransformer', () => {
  let transformer: ImportPathTransformer;

  beforeEach(() => {
    transformer = new ImportPathTransformer();
    jest.clearAllMocks();
  });

  describe('Relative Path Conversion', () => {
    test('should convert deep relative paths to proper structure', () => {
      // Arrange
      const importPath = '../../../wiremock/generated/dtos/model/inloggegevens';
      const currentFile = '/project/tests/specs/login.spec.ts';
      const projectRoot = '/project';

      // Act
      const result = transformer.normalizeRelativePath(importPath, currentFile, projectRoot);

      // Assert
      expect(result).toBe('../wiremock/generated/dtos/model/inloggegevens');
    });

    test('should handle page object import path correction', () => {
      // Arrange
      const importPath = '../pages/cy-login-page';
      const currentFile = '/project/tests/specs/login.spec.ts';
      const outputStructure = { pagesDir: 'pages', testsDir: 'tests' };

      // Act
      const result = transformer.correctPageObjectPath(importPath, currentFile, outputStructure);

      // Assert
      expect(result).toBe('../pages/cy-login-page');
    });

    test('should preserve external library import paths', () => {
      // Arrange
      const importPaths = [
        'wiremock-rest-client/dist/model/stub-mapping.model',
        '@sta/wiremock-generator-ts',
        '@playwright/test'
      ];

      // Act & Assert
      importPaths.forEach(importPath => {
        const result = transformer.normalizeRelativePath(importPath, '/any/file.ts', '/project');
        expect(result).toBe(importPath);
      });
    });
  });

  describe('Import Statement Rewriting', () => {
    test('should rewrite import statements with corrected paths', () => {
      // Arrange
      const originalImport = `import CyLoginPage from "../pages/cy-login-page";`;
      const pathMapping = { '../pages/cy-login-page': '../pages/login-page' };

      // Act
      const result = transformer.rewriteImportStatement(originalImport, pathMapping);

      // Assert
      expect(result).toBe(`import CyLoginPage from "../pages/login-page";`);
    });

    test('should handle multiple imports in single statement', () => {
      // Arrange
      const originalImport = `import { test, expect, Request } from '@playwright/test';`;
      const dedupedImports = ['test', 'expect']; // Request removed as duplicate

      // Act
      const result = transformer.rewriteNamedImports(originalImport, dedupedImports);

      // Assert
      expect(result).toBe(`import { test, expect } from '@playwright/test';`);
    });

    test('should preserve import statement formatting', () => {
      // Arrange
      const testCases = [
        {
          input: `import { MockUtil } from '@sta/wiremock-generator-ts';`,
          pathMapping: {},
          expected: `import { MockUtil } from '@sta/wiremock-generator-ts';`
        },
        {
          input: `import { WireMockMappingClient } from '../../../wiremock/generated/mappings/WiremockServerConfig';`,
          pathMapping: { '../../../wiremock/generated/mappings/WiremockServerConfig': '../wiremock/mappings/WiremockServerConfig' },
          expected: `import { WireMockMappingClient } from '../wiremock/mappings/WiremockServerConfig';`
        }
      ];

      // Act & Assert
      testCases.forEach(({ input, pathMapping, expected }) => {
        const result = transformer.rewriteImportStatement(input, pathMapping || {});
        expect(result).toBe(expected);
      });
    });
  });
});

describe('Import Integration Tests', () => {
  let analyzer: ImportAnalyzer;
  let transformer: ImportPathTransformer;

  beforeEach(() => {
    analyzer = new ImportAnalyzer();
    transformer = new ImportPathTransformer();
    jest.clearAllMocks();
  });

  test('should process DLA login test conversion example', async () => {
    // Arrange - Based on actual DLA conversion issues
    const fileContent = `import { test, expect } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { Inloggegevens } from '../../../wiremock/generated/dtos/model/inloggegevens';
import { StubMapping } from 'wiremock-rest-client/dist/model/stub-mapping.model';
import { ComponentFixture, TestBed } from '@angular/core/testing';`;

    mockFs.readFile.mockResolvedValue(fileContent);

    // Act
    const analysis = await analyzer.analyzeAllImports('/test/file.ts');
    const organized = await analyzer.organizeImports('/test/file.ts');

    // Assert
    expect(analysis.duplicates).toHaveLength(1); // Playwright duplicates
    expect(analysis.cypressImports).toHaveLength(1); // Angular testing imports
    expect(analysis.legitImports).toHaveLength(2); // WireMock imports

    // Verify organization
    expect(organized.organized.find(o => o.source === '@playwright/test')).toEqual({
      category: 'external',
      source: '@playwright/test',
      imports: ['test', 'expect']
    });
  });

  test('should handle complete import cleanup workflow', async () => {
    // Arrange
    const problematicContent = `import { test, expect } from '@playwright/test';
import { expect, Request, test } from '@playwright/test';
import { BoekenPage } from '../pages/boeken-page';
import { ComponentFixture } from '@angular/core/testing';
import { WireMockMappingClient } from '../../../wiremock/generated/mappings/WiremockServerConfig';`;

    mockFs.readFile.mockResolvedValue(problematicContent);

    // Act
    const analysis = await analyzer.analyzeAllImports('/test/file.ts');

    // Simulate the cleanup process
    const cleanedImports = analyzer.mergeImports(analysis.duplicates);
    const filteredImports = analyzer.removeUnwantedImports(analysis.cypressImports);
    const pathCorrections = transformer.generatePathMappings(analysis.legitImports, '/test/file.ts');

    // Assert
    expect(cleanedImports.find(i => i.source === '@playwright/test')?.imports).toEqual(['test', 'expect', 'Request']);
    expect(filteredImports).toHaveLength(0); // Angular imports removed
    expect(pathCorrections).toHaveProperty('../../../wiremock/generated/mappings/WiremockServerConfig');
  });
});