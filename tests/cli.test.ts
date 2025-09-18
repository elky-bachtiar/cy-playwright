import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { CLI } from '../src/cli';

describe('CLI', () => {
  let testDir: string;
  let cypressProjectDir: string;
  let outputDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'temp');
    cypressProjectDir = path.join(testDir, 'cypress-project');
    outputDir = path.join(testDir, 'output');

    await fs.ensureDir(cypressProjectDir);
    await fs.ensureDir(outputDir);

    // Create mock Cypress project structure
    await fs.ensureDir(path.join(cypressProjectDir, 'cypress', 'e2e'));
    await fs.writeFile(
      path.join(cypressProjectDir, 'cypress.config.js'),
      'module.exports = { e2e: { baseUrl: "http://localhost:3000" } };'
    );
    await fs.writeFile(
      path.join(cypressProjectDir, 'cypress', 'e2e', 'sample.cy.js'),
      'describe("Sample test", () => { it("should work", () => { cy.visit("/"); }); });'
    );
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('argument parsing', () => {
    it('should parse source directory argument', () => {
      const cli = new CLI();
      const result = cli.parseArguments(['node', 'cli.js', 'convert', '--source', cypressProjectDir, '--output', outputDir]);

      expect(result.source).toBe(cypressProjectDir);
      expect(result.output).toBe(outputDir);
    });

    it('should parse short argument flags', () => {
      const cli = new CLI();
      const result = cli.parseArguments(['node', 'cli.js', 'convert', '-s', cypressProjectDir, '-o', outputDir]);

      expect(result.source).toBe(cypressProjectDir);
      expect(result.output).toBe(outputDir);
    });

    it('should require source and output directories', () => {
      const cli = new CLI();

      expect(() => {
        cli.parseArguments(['node', 'cli.js', 'convert']);
      }).toThrow();
    });

    it('should validate that source directory exists', async () => {
      const cli = new CLI();
      const nonExistentDir = path.join(testDir, 'non-existent');

      const result = await cli.validateArguments({
        source: nonExistentDir,
        output: outputDir
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Source directory does not exist');
    });
  });

  describe('project structure validation', () => {
    it('should detect valid Cypress project', async () => {
      const cli = new CLI();

      const result = await cli.validateCypressProject(cypressProjectDir);

      expect(result.isValid).toBe(true);
      expect(result.configPath).toBe(path.join(cypressProjectDir, 'cypress.config.js'));
    });

    it('should reject directory without cypress.config.js', async () => {
      const cli = new CLI();
      await fs.remove(path.join(cypressProjectDir, 'cypress.config.js'));

      const result = await cli.validateCypressProject(cypressProjectDir);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No cypress.config.js found');
    });

    it('should detect test files in project', async () => {
      const cli = new CLI();

      const result = await cli.scanForTestFiles(cypressProjectDir);

      expect(result.testFiles).toHaveLength(1);
      expect(result.testFiles[0]).toContain('sample.cy.js');
    });

    it('should find multiple test file patterns', async () => {
      const cli = new CLI();

      // Add more test files with different patterns
      await fs.writeFile(
        path.join(cypressProjectDir, 'cypress', 'e2e', 'another.spec.js'),
        'describe("Another test", () => {});'
      );
      await fs.writeFile(
        path.join(cypressProjectDir, 'cypress', 'e2e', 'typed.cy.ts'),
        'describe("Typed test", () => {});'
      );

      const result = await cli.scanForTestFiles(cypressProjectDir);

      expect(result.testFiles).toHaveLength(3);
      expect(result.testFiles.some(f => f.includes('sample.cy.js'))).toBe(true);
      expect(result.testFiles.some(f => f.includes('another.spec.js'))).toBe(true);
      expect(result.testFiles.some(f => f.includes('typed.cy.ts'))).toBe(true);
    });
  });

  describe('directory scanning', () => {
    it('should create output directory if it does not exist', async () => {
      const cli = new CLI();
      const newOutputDir = path.join(testDir, 'new-output');

      await cli.ensureOutputDirectory(newOutputDir);

      expect(await fs.pathExists(newOutputDir)).toBe(true);
    });

    it('should validate output directory is writable', async () => {
      const cli = new CLI();

      const result = await cli.validateOutputDirectory(outputDir);

      expect(result.isValid).toBe(true);
      expect(result.isWritable).toBe(true);
    });
  });
});