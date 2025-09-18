#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXAMPLES_REPO_PATH = '/tmp/cypress-example-recipes';
const CONVERSION_OUTPUT_PATH = '/tmp/cypress-conversions';

// Configuration
const CONFIG = {
  // Number of examples to test (set to null for all)
  maxExamples: 10,

  // Whether to run actual Playwright tests
  runPlaywrightTests: true,

  // Timeouts
  conversionTimeout: 120000,
  installTimeout: 60000,
  testTimeout: 180000
};

async function comprehensiveConversionTest() {
  console.log('🚀 Starting comprehensive Cypress to Playwright conversion test...');
  console.log(`Configuration: Testing ${CONFIG.maxExamples || 'all'} examples, Playwright tests: ${CONFIG.runPlaywrightTests}`);

  // Setup
  await setupEnvironment();

  // Discover examples
  const examples = await discoverExamples();
  console.log(`📁 Discovered ${examples.length} Cypress examples`);

  const testExamples = CONFIG.maxExamples ? examples.slice(0, CONFIG.maxExamples) : examples;
  console.log(`🎯 Testing ${testExamples.length} examples`);

  // Run conversion pipeline
  const results = await runConversionPipeline(testExamples);

  // Generate comprehensive report
  await generateComprehensiveReport(results);

  return results;
}

async function setupEnvironment() {
  // Clone repository if needed
  if (!fs.existsSync(EXAMPLES_REPO_PATH)) {
    console.log('📥 Cloning cypress-example-recipes repository...');
    execSync(`git clone https://github.com/cypress-io/cypress-example-recipes.git ${EXAMPLES_REPO_PATH}`);
  }

  // Create output directory
  if (!fs.existsSync(CONVERSION_OUTPUT_PATH)) {
    fs.mkdirSync(CONVERSION_OUTPUT_PATH, { recursive: true });
  }
}

async function discoverExamples() {
  const examplesDir = path.join(EXAMPLES_REPO_PATH, 'examples');
  const examples = [];

  const entries = fs.readdirSync(examplesDir);
  for (const entry of entries) {
    const examplePath = path.join(examplesDir, entry);
    if (!fs.statSync(examplePath).isDirectory()) continue;

    // Check if it has Cypress files
    const cypressDir = path.join(examplePath, 'cypress');
    const hasConfig = [
      'cypress.config.js',
      'cypress.config.ts',
      'cypress.json'
    ].some(config => fs.existsSync(path.join(examplePath, config)));

    const hasCypressFiles = fs.existsSync(cypressDir) || hasConfig;

    if (hasCypressFiles) {
      // Count test files
      let testFileCount = 0;
      if (fs.existsSync(cypressDir)) {
        const findTestFiles = (dir) => {
          const files = fs.readdirSync(dir);
          files.forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
              findTestFiles(filePath);
            } else if (file.endsWith('.cy.js') || file.endsWith('.cy.ts') ||
                      file.endsWith('.spec.js') || file.endsWith('.spec.ts')) {
              testFileCount++;
            }
          });
        };
        findTestFiles(cypressDir);
      }

      examples.push({
        name: entry,
        path: examplePath,
        hasConfig,
        testFileCount
      });
    }
  }

  return examples.sort((a, b) => b.testFileCount - a.testFileCount);
}

async function runConversionPipeline(examples) {
  const results = {
    conversions: {
      successful: [],
      failed: []
    },
    validations: {
      syntaxValid: [],
      syntaxInvalid: [],
      structureValid: []
    },
    testExecution: {
      executable: [],
      nonExecutable: [],
      passed: [],
      failed: []
    },
    summary: {
      totalExamples: examples.length,
      conversionSuccessCount: 0,
      validationSuccessCount: 0,
      testExecutionSuccessCount: 0
    }
  };

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const outputPath = path.join(CONVERSION_OUTPUT_PATH, example.name);

    console.log(`\n[${i + 1}/${examples.length}] Processing: ${example.name}`);
    console.log(`  📊 Original Cypress tests: ${example.testFileCount}`);

    // Phase 1: Conversion
    const conversionResult = await performConversion(example, outputPath);
    if (conversionResult.success) {
      results.conversions.successful.push(conversionResult);
      results.summary.conversionSuccessCount++;
      console.log(`  ✅ Conversion successful: ${conversionResult.playwrightTestFiles} test files created`);
    } else {
      results.conversions.failed.push(conversionResult);
      console.log(`  ❌ Conversion failed: ${conversionResult.error}`);
      continue; // Skip validation and testing if conversion failed
    }

    // Phase 2: Validation
    const validationResult = await performValidation(example.name, outputPath);
    if (validationResult.syntaxValid) {
      results.validations.syntaxValid.push(example.name);
      results.summary.validationSuccessCount++;
      console.log(`  ✅ Validation passed`);
    } else {
      results.validations.syntaxInvalid.push({
        name: example.name,
        issues: validationResult.issues
      });
      console.log(`  ❌ Validation failed: ${validationResult.issues.length} issues`);
    }

    // Phase 3: Test Execution (only if validation passed and enabled)
    if (validationResult.syntaxValid && CONFIG.runPlaywrightTests) {
      const testResult = await performTestExecution(example.name, outputPath);
      if (testResult.executable) {
        results.testExecution.executable.push(example.name);

        if (testResult.success) {
          results.testExecution.passed.push({
            name: example.name,
            stats: testResult.stats
          });
          results.summary.testExecutionSuccessCount++;
          console.log(`  ✅ Tests executed successfully: ${testResult.stats.passed}/${testResult.stats.total} passed`);
        } else {
          results.testExecution.failed.push({
            name: example.name,
            error: testResult.error
          });
          console.log(`  ⚠️  Tests executable but failed: ${testResult.error}`);
        }
      } else {
        results.testExecution.nonExecutable.push({
          name: example.name,
          error: testResult.error
        });
        console.log(`  ❌ Tests not executable: ${testResult.error}`);
      }
    }
  }

  return results;
}

async function performConversion(example, outputPath) {
  try {
    const cliPath = path.join(__dirname, '../src/cli.ts');
    const command = `npx tsx "${cliPath}" convert --source "${example.path}" --output "${outputPath}" --verbose`;

    execSync(command, {
      stdio: 'pipe',
      timeout: CONFIG.conversionTimeout
    });

    // Count generated test files
    const testsDir = path.join(outputPath, 'tests');
    const playwrightTestFiles = fs.existsSync(testsDir)
      ? fs.readdirSync(testsDir).filter(f => f.endsWith('.spec.ts') || f.endsWith('.spec.js')).length
      : 0;

    return {
      name: example.name,
      success: true,
      playwrightTestFiles,
      originalTestFiles: example.testFileCount
    };

  } catch (error) {
    return {
      name: example.name,
      success: false,
      error: error.message.split('\n')[0],
      originalTestFiles: example.testFileCount
    };
  }
}

async function performValidation(projectName, projectPath) {
  const testsDir = path.join(projectPath, 'tests');
  const issues = [];

  if (!fs.existsSync(testsDir)) {
    return { syntaxValid: false, issues: ['No tests directory found'] };
  }

  const testFiles = fs.readdirSync(testsDir)
    .filter(f => f.endsWith('.spec.js') || f.endsWith('.spec.ts'))
    .map(f => path.join(testsDir, f));

  if (testFiles.length === 0) {
    return { syntaxValid: false, issues: ['No test files found'] };
  }

  // Basic syntax checks
  for (const testFile of testFiles) {
    try {
      const content = fs.readFileSync(testFile, 'utf8');

      // Check for common syntax issues
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        // Check for missing quotes in page.goto()
        if (line.includes('await page.goto(') && !line.includes("'") && !line.includes('"')) {
          issues.push(`${path.basename(testFile)}:${index + 1} - Missing quotes in page.goto()`);
        }

        // Check for unterminated strings
        if (line.includes("'() => {") && !line.includes("'}")) {
          issues.push(`${path.basename(testFile)}:${index + 1} - Possible unterminated string`);
        }
      });

      // Node.js syntax check
      execSync(`node -c "${testFile}"`, { stdio: 'pipe' });

    } catch (error) {
      issues.push(`${path.basename(testFile)} - ${error.message.split('\n')[0]}`);
    }
  }

  return {
    syntaxValid: issues.length === 0,
    issues
  };
}

async function performTestExecution(projectName, projectPath) {
  try {
    // Install dependencies if needed
    if (!fs.existsSync(path.join(projectPath, 'node_modules'))) {
      execSync('npm install', {
        cwd: projectPath,
        stdio: 'pipe',
        timeout: CONFIG.installTimeout
      });
    }

    // Check if Playwright can parse the tests
    execSync('npx playwright test --list', {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 30000
    });

    if (!CONFIG.runPlaywrightTests) {
      return { executable: true, success: true };
    }

    // Run the tests
    const testOutput = execSync('npx playwright test --reporter=json', {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: CONFIG.testTimeout,
      encoding: 'utf8'
    });

    // Parse results
    const testReport = JSON.parse(testOutput);
    const stats = { total: 0, passed: 0, failed: 0, skipped: 0 };

    if (testReport.suites) {
      testReport.suites.forEach(suite => {
        if (suite.specs) {
          suite.specs.forEach(spec => {
            if (spec.tests) {
              spec.tests.forEach(test => {
                stats.total++;
                if (test.status === 'passed') stats.passed++;
                else if (test.status === 'failed') stats.failed++;
                else stats.skipped++;
              });
            }
          });
        }
      });
    }

    return {
      executable: true,
      success: stats.failed === 0,
      stats
    };

  } catch (error) {
    const errorMsg = error.message.split('\n')[0];

    if (errorMsg.includes('playwright test --list')) {
      return { executable: false, error: 'Playwright cannot parse test files' };
    } else {
      return { executable: true, success: false, error: errorMsg };
    }
  }
}

async function generateComprehensiveReport(results) {
  console.log('\n📊 COMPREHENSIVE CONVERSION TEST RESULTS');
  console.log('='.repeat(60));

  // Conversion Summary
  const conversionRate = (results.summary.conversionSuccessCount / results.summary.totalExamples * 100).toFixed(1);
  console.log(`🔄 CONVERSION PHASE:`);
  console.log(`   Total examples: ${results.summary.totalExamples}`);
  console.log(`   ✅ Successful: ${results.summary.conversionSuccessCount} (${conversionRate}%)`);
  console.log(`   ❌ Failed: ${results.conversions.failed.length}`);

  // Validation Summary
  const validationRate = results.summary.conversionSuccessCount > 0
    ? (results.summary.validationSuccessCount / results.summary.conversionSuccessCount * 100).toFixed(1)
    : 0;
  console.log(`\n🔍 VALIDATION PHASE:`);
  console.log(`   Projects to validate: ${results.summary.conversionSuccessCount}`);
  console.log(`   ✅ Syntax valid: ${results.summary.validationSuccessCount} (${validationRate}%)`);
  console.log(`   ❌ Syntax invalid: ${results.validations.syntaxInvalid.length}`);

  // Test Execution Summary
  let testExecutionRate = 0;
  if (CONFIG.runPlaywrightTests) {
    const executableCount = results.testExecution.executable.length;
    testExecutionRate = results.summary.validationSuccessCount > 0
      ? (results.summary.testExecutionSuccessCount / results.summary.validationSuccessCount * 100).toFixed(1)
      : 0;

    console.log(`\n🧪 TEST EXECUTION PHASE:`);
    console.log(`   Projects to test: ${results.summary.validationSuccessCount}`);
    console.log(`   ✅ Executable: ${executableCount}`);
    console.log(`   ✅ Passed tests: ${results.summary.testExecutionSuccessCount} (${testExecutionRate}%)`);
    console.log(`   ❌ Failed tests: ${results.testExecution.failed.length}`);
    console.log(`   ❌ Non-executable: ${results.testExecution.nonExecutable.length}`);

    // Aggregate test statistics
    if (results.testExecution.passed.length > 0) {
      const totalTests = results.testExecution.passed.reduce((sum, p) => sum + p.stats.total, 0);
      const totalPassed = results.testExecution.passed.reduce((sum, p) => sum + p.stats.passed, 0);
      const totalFailed = results.testExecution.passed.reduce((sum, p) => sum + p.stats.failed, 0);

      console.log(`\n📈 AGGREGATE TEST STATISTICS:`);
      console.log(`   Total tests executed: ${totalTests}`);
      console.log(`   ✅ Passed: ${totalPassed} (${(totalPassed / totalTests * 100).toFixed(1)}%)`);
      console.log(`   ❌ Failed: ${totalFailed} (${(totalFailed / totalTests * 100).toFixed(1)}%)`);
    }
  }

  // Overall Success Pipeline
  const overallSuccessRate = results.summary.totalExamples > 0
    ? (results.summary.testExecutionSuccessCount / results.summary.totalExamples * 100).toFixed(1)
    : 0;

  console.log(`\n🎯 OVERALL PIPELINE SUCCESS:`);
  console.log(`   End-to-end success rate: ${overallSuccessRate}%`);
  console.log(`   (Conversion → Validation → Test Execution)`);

  // Save detailed report
  const reportPath = path.join(CONVERSION_OUTPUT_PATH, 'comprehensive-test-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    config: CONFIG,
    summary: {
      ...results.summary,
      conversionRate: parseFloat(conversionRate),
      validationRate: parseFloat(validationRate),
      testExecutionRate: CONFIG.runPlaywrightTests ? parseFloat(testExecutionRate) : null,
      overallSuccessRate: parseFloat(overallSuccessRate)
    },
    results
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Comprehensive report saved to: ${reportPath}`);

  // Success/Failure Details
  if (results.conversions.failed.length > 0) {
    console.log(`\n❌ CONVERSION FAILURES:`);
    results.conversions.failed.forEach(f => console.log(`   - ${f.name}: ${f.error}`));
  }

  if (results.validations.syntaxInvalid.length > 0) {
    console.log(`\n❌ VALIDATION FAILURES:`);
    results.validations.syntaxInvalid.forEach(f => {
      console.log(`   - ${f.name}: ${f.issues.length} issues`);
    });
  }

  if (results.testExecution.failed.length > 0) {
    console.log(`\n❌ TEST EXECUTION FAILURES:`);
    results.testExecution.failed.forEach(f => console.log(`   - ${f.name}: ${f.error}`));
  }

  console.log('\n🎉 Comprehensive conversion test completed!');
  console.log(`📁 All results available in: ${CONVERSION_OUTPUT_PATH}`);
}

// Run if called directly
if (require.main === module) {
  comprehensiveConversionTest().catch(console.error);
}

module.exports = { comprehensiveConversionTest };