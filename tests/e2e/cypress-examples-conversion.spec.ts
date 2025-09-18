import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ConversionValidator } from '../utils/conversion-validator';

interface ExampleProject {
  name: string;
  path: string;
  hasPackageJson: boolean;
  hasCypressConfig: boolean;
  testFiles: string[];
}

test.describe('Cypress Examples Repository Conversion', () => {
  const EXAMPLES_REPO_PATH = '/tmp/cypress-example-recipes';
  const CONVERSION_OUTPUT_PATH = '/tmp/cypress-conversions';
  let exampleProjects: ExampleProject[] = [];
  const validator = new ConversionValidator();

  test.beforeAll(async () => {
    // Ensure the examples repository is cloned
    if (!fs.existsSync(EXAMPLES_REPO_PATH)) {
      execSync(`git clone https://github.com/cypress-io/cypress-example-recipes.git ${EXAMPLES_REPO_PATH}`);
    }

    // Create output directory for conversions
    if (!fs.existsSync(CONVERSION_OUTPUT_PATH)) {
      fs.mkdirSync(CONVERSION_OUTPUT_PATH, { recursive: true });
    }

    // Discover all example projects
    exampleProjects = await discoverExampleProjects();
    console.log(`Found ${exampleProjects.length} example projects to convert`);
  });

  test('should discover all Cypress example projects', async () => {
    expect(exampleProjects.length).toBeGreaterThan(70);

    const projectsWithTests = exampleProjects.filter(p => p.testFiles.length > 0);
    expect(projectsWithTests.length).toBeGreaterThan(60);

    console.log(`Projects with Cypress tests: ${projectsWithTests.length}`);
  });

  test('should convert first 10 example projects to Playwright', async () => {
    const conversionResults: Array<{
      name: string;
      success: boolean;
      error?: string;
      playwrightTestsCreated: number;
      originalCypressTests: number;
    }> = [];

    // Test only first 10 projects for speed
    const projectsToTest = exampleProjects.filter(p => p.testFiles.length > 0).slice(0, 10);

    for (const project of projectsToTest) {
      console.log(`Converting project: ${project.name}`);

      try {
        const result = await convertProject(project);
        conversionResults.push(result);

        // Don't fail individual conversions - collect results for analysis

      } catch (error) {
        console.error(`Failed to convert ${project.name}:`, error);
        conversionResults.push({
          name: project.name,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          playwrightTestsCreated: 0,
          originalCypressTests: project.testFiles.length
        });
      }
    }

    // Print conversion summary
    const successful = conversionResults.filter(r => r.success);
    const failed = conversionResults.filter(r => !r.success);

    console.log(`\nConversion Summary:`);
    console.log(`- Successful: ${successful.length}`);
    console.log(`- Failed: ${failed.length}`);
    console.log(`- Total: ${conversionResults.length}`);

    if (failed.length > 0) {
      console.log(`\nFailed conversions:`);
      failed.forEach(f => console.log(`- ${f.name}: ${f.error}`));
    }

    // Expect at least some successful conversions
    expect(successful.length).toBeGreaterThan(0);
    expect(conversionResults.length).toBeGreaterThan(0);

    // Log the success rate for analysis
    const successRate = successful.length / conversionResults.length;
    console.log(`Overall success rate: ${(successRate * 100).toFixed(1)}%`);

    // Expect at least 40% success rate (realistic for complex examples)
    expect(successRate).toBeGreaterThan(0.4);
  });

  test('should validate converted Playwright tests syntax and structure', async () => {
    const playwrightProjects = fs.readdirSync(CONVERSION_OUTPUT_PATH)
      .filter(name => fs.statSync(path.join(CONVERSION_OUTPUT_PATH, name)).isDirectory());

    let validProjects = 0;
    let totalProjects = 0;
    const validationReports: string[] = [];

    for (const projectName of playwrightProjects) {
      const projectPath = path.join(CONVERSION_OUTPUT_PATH, projectName);
      const originalProject = exampleProjects.find(p => p.name === projectName);

      if (!originalProject) continue;

      totalProjects++;

      try {
        // Use comprehensive validation
        const validationResult = await validator.validateConvertedProject(
          projectPath,
          originalProject.path,
          {
            validateSyntax: true,
            validateImports: true,
            validateStructure: true,
            checkRequiredFiles: true
          }
        );

        if (validationResult.isValid) {
          validProjects++;
        }

        // Generate and store validation report
        const report = validator.generateValidationReport(validationResult);
        validationReports.push(`## ${projectName}\n${report}\n`);

        // Log key metrics
        console.log(`${projectName}: ${validationResult.isValid ? '✅' : '❌'} | ` +
                   `${validationResult.metrics.playwrightTestFiles}/${validationResult.metrics.originalCypressFiles} tests | ` +
                   `${validationResult.metrics.conversionRate.toFixed(1)}% conversion rate`);

        if (validationResult.warnings.length > 0) {
          console.log(`  Warnings: ${validationResult.warnings.length}`);
        }

        if (validationResult.errors.length > 0) {
          console.log(`  Errors: ${validationResult.errors.length}`);
        }

      } catch (error) {
        console.error(`Validation failed for ${projectName}:`, error);
        validationReports.push(`## ${projectName}\n❌ Validation failed: ${error}\n`);
      }
    }

    // Write comprehensive validation report
    const fullReport = [
      '# Cypress Examples Conversion Validation Report',
      '',
      `**Summary:** ${validProjects}/${totalProjects} projects passed validation`,
      `**Success Rate:** ${((validProjects / totalProjects) * 100).toFixed(1)}%`,
      '',
      ...validationReports
    ].join('\n');

    fs.writeFileSync(path.join(CONVERSION_OUTPUT_PATH, 'validation-report.md'), fullReport);

    console.log(`\nValidation Summary: ${validProjects}/${totalProjects} projects passed`);
    console.log(`Report saved to: ${path.join(CONVERSION_OUTPUT_PATH, 'validation-report.md')}`);

    // Expect at least some projects to be valid
    expect(validProjects).toBeGreaterThan(0);
    expect(totalProjects).toBeGreaterThan(0);

    // Expect a reasonable success rate (at least 60%)
    const successRate = validProjects / totalProjects;
    expect(successRate).toBeGreaterThan(0.6);
  });

  async function discoverExampleProjects(): Promise<ExampleProject[]> {
    const examplesDir = path.join(EXAMPLES_REPO_PATH, 'examples');
    const projects: ExampleProject[] = [];

    if (!fs.existsSync(examplesDir)) {
      throw new Error(`Examples directory not found: ${examplesDir}`);
    }

    const entries = fs.readdirSync(examplesDir);

    for (const entry of entries) {
      const projectPath = path.join(examplesDir, entry);
      const stat = fs.statSync(projectPath);

      if (!stat.isDirectory()) continue;

      const cypressDir = path.join(projectPath, 'cypress');
      const packageJsonPath = path.join(projectPath, 'package.json');
      const cypressConfigPath = path.join(projectPath, 'cypress.config.js');
      const cypressConfigTsPath = path.join(projectPath, 'cypress.config.ts');
      const legacyCypressJsonPath = path.join(projectPath, 'cypress.json');

      const hasPackageJson = fs.existsSync(packageJsonPath);
      const hasCypressConfig = fs.existsSync(cypressConfigPath) ||
                              fs.existsSync(cypressConfigTsPath) ||
                              fs.existsSync(legacyCypressJsonPath);

      let testFiles: string[] = [];

      if (fs.existsSync(cypressDir)) {
        testFiles = findTestFiles(cypressDir, ['.cy.js', '.cy.ts', '.spec.js', '.spec.ts', '.test.js', '.test.ts']);
      }

      projects.push({
        name: entry,
        path: projectPath,
        hasPackageJson,
        hasCypressConfig,
        testFiles
      });
    }

    return projects;
  }

  function findTestFiles(dir: string, extensions: string[]): string[] {
    const testFiles: string[] = [];

    function traverse(currentDir: string) {
      const entries = fs.readdirSync(currentDir);

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          traverse(fullPath);
        } else if (stat.isFile()) {
          for (const ext of extensions) {
            if (entry.endsWith(ext)) {
              testFiles.push(fullPath);
              break;
            }
          }
        }
      }
    }

    traverse(dir);
    return testFiles;
  }

  async function convertProject(project: ExampleProject): Promise<{
    name: string;
    success: boolean;
    error?: string;
    playwrightTestsCreated: number;
    originalCypressTests: number;
  }> {
    const outputPath = path.join(CONVERSION_OUTPUT_PATH, project.name);

    // Create output directory
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    try {
      // Copy project to output directory
      execSync(`cp -r "${project.path}/." "${outputPath}"`);

      // Run the conversion using our CLI tool
      const cliPath = path.join(__dirname, '../../src/cli.ts');
      const conversionCommand = `npx tsx "${cliPath}" convert --source "${outputPath}" --output "${outputPath}/playwright-project" --verbose`;

      console.log(`Running conversion: ${conversionCommand}`);
      execSync(conversionCommand, {
        cwd: outputPath,
        stdio: 'pipe'
      });

      // Count created Playwright test files
      const playwrightTestsDir = path.join(outputPath, 'playwright-project', 'tests');
      let playwrightTestsCreated = 0;

      if (fs.existsSync(playwrightTestsDir)) {
        const playwrightTestFiles = findTestFiles(playwrightTestsDir, ['.spec.ts', '.test.ts']);
        playwrightTestsCreated = playwrightTestFiles.length;
      }

      return {
        name: project.name,
        success: true,
        playwrightTestsCreated,
        originalCypressTests: project.testFiles.length
      };

    } catch (error) {
      return {
        name: project.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        playwrightTestsCreated: 0,
        originalCypressTests: project.testFiles.length
      };
    }
  }
});