import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const EXAMPLES_REPO_PATH = '/tmp/cypress-example-recipes';
const CONVERSION_OUTPUT_PATH = '/tmp/cypress-conversions';

// Test a smaller subset of examples first
const EXAMPLE_SUBSET = [
  'fundamentals__add-custom-command',
  'testing-dom__download',
  'testing-dom__sorting-table',
  'stubbing-spying__google-analytics',
  'fundamentals__typescript'
];

test.describe('Cypress Examples Subset Conversion', () => {
  test.beforeAll(async () => {
    // Ensure the examples repository is cloned
    if (!fs.existsSync(EXAMPLES_REPO_PATH)) {
      execSync(`git clone https://github.com/cypress-io/cypress-example-recipes.git ${EXAMPLES_REPO_PATH}`);
    }

    // Create output directory for conversions
    if (!fs.existsSync(CONVERSION_OUTPUT_PATH)) {
      fs.mkdirSync(CONVERSION_OUTPUT_PATH, { recursive: true });
    }
  });

  test('should convert selected Cypress examples successfully', async () => {
    const conversionResults: Array<{
      name: string;
      success: boolean;
      error?: string;
      hasPlaywrightConfig: boolean;
      hasPackageJson: boolean;
      testFilesCreated: number;
    }> = [];

    for (const exampleName of EXAMPLE_SUBSET) {
      const sourcePath = path.join(EXAMPLES_REPO_PATH, 'examples', exampleName);
      const outputPath = path.join(CONVERSION_OUTPUT_PATH, exampleName);

      if (!fs.existsSync(sourcePath)) {
        console.log(`Skipping ${exampleName} - source path does not exist`);
        continue;
      }

      console.log(`Converting: ${exampleName}`);

      try {
        // Run conversion
        const cliPath = path.join(__dirname, '../../src/cli.ts');
        const command = `npx tsx "${cliPath}" convert --source "${sourcePath}" --output "${outputPath}" --verbose`;

        execSync(command, {
          stdio: 'pipe',
          timeout: 60000
        });

        // Validate conversion results
        const hasPlaywrightConfig = fs.existsSync(path.join(outputPath, 'playwright.config.ts')) ||
                                   fs.existsSync(path.join(outputPath, 'playwright.config.js'));

        const hasPackageJson = fs.existsSync(path.join(outputPath, 'package.json'));

        const testsDir = path.join(outputPath, 'tests');
        let testFilesCreated = 0;

        if (fs.existsSync(testsDir)) {
          const testFiles = fs.readdirSync(testsDir)
            .filter(file => file.endsWith('.spec.ts') || file.endsWith('.spec.js'));
          testFilesCreated = testFiles.length;
        }

        conversionResults.push({
          name: exampleName,
          success: true,
          hasPlaywrightConfig,
          hasPackageJson,
          testFilesCreated
        });

        console.log(`✅ ${exampleName}: ${testFilesCreated} test files created`);

      } catch (error) {
        console.error(`❌ ${exampleName} failed:`, error instanceof Error ? error.message : String(error));
        conversionResults.push({
          name: exampleName,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          hasPlaywrightConfig: false,
          hasPackageJson: false,
          testFilesCreated: 0
        });
      }
    }

    // Analyze results
    const successful = conversionResults.filter(r => r.success);
    const failed = conversionResults.filter(r => !r.success);

    console.log(`\nConversion Results:`);
    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`📊 Success Rate: ${((successful.length / conversionResults.length) * 100).toFixed(1)}%`);

    if (failed.length > 0) {
      console.log(`\nFailed conversions:`);
      failed.forEach(f => console.log(`- ${f.name}: ${f.error}`));
    }

    // Expectations
    expect(conversionResults.length).toBeGreaterThan(0);
    expect(successful.length).toBeGreaterThan(0);

    // Expect at least 60% success rate for this subset
    const successRate = successful.length / conversionResults.length;
    expect(successRate).toBeGreaterThan(0.6);

    // Validate that successful conversions have required files
    for (const result of successful) {
      expect(result.hasPackageJson).toBe(true);
      expect(result.testFilesCreated).toBeGreaterThan(0);
    }
  });

  test('should validate basic Playwright test structure', async () => {
    // Check a specific converted example
    const exampleName = 'fundamentals__add-custom-command';
    const outputPath = path.join(CONVERSION_OUTPUT_PATH, exampleName);

    if (!fs.existsSync(outputPath)) {
      test.skip('Example not converted');
      return;
    }

    const testsDir = path.join(outputPath, 'tests');
    expect(fs.existsSync(testsDir)).toBe(true);

    const testFiles = fs.readdirSync(testsDir)
      .filter(file => file.endsWith('.spec.ts') || file.endsWith('.spec.js'))
      .map(file => path.join(testsDir, file));

    expect(testFiles.length).toBeGreaterThan(0);

    for (const testFile of testFiles) {
      const content = fs.readFileSync(testFile, 'utf8');

      // Basic structure checks
      expect(content).toContain("import { test, expect } from '@playwright/test'");
      expect(content).toMatch(/test\.(describe|only)?\(/);

      console.log(`✅ Validated: ${path.basename(testFile)}`);
    }
  });
});