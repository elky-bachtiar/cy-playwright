#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXAMPLES_REPO_PATH = '/tmp/cypress-example-recipes';
const CONVERSION_OUTPUT_PATH = '/tmp/cypress-conversions';

// Test with a small subset first
const SUBSET_EXAMPLES = [
  'fundamentals__add-custom-command',
  'testing-dom__download',
  'fundamentals__typescript'
];

async function convertSubsetWithTests() {
  console.log('🚀 Starting subset conversion with test execution...');

  // Clone the repository if it doesn't exist
  if (!fs.existsSync(EXAMPLES_REPO_PATH)) {
    console.log('📥 Cloning cypress-example-recipes repository...');
    execSync(`git clone https://github.com/cypress-io/cypress-example-recipes.git ${EXAMPLES_REPO_PATH}`);
  }

  // Create output directory
  if (!fs.existsSync(CONVERSION_OUTPUT_PATH)) {
    fs.mkdirSync(CONVERSION_OUTPUT_PATH, { recursive: true });
  }

  const results = {
    successful: [],
    failed: [],
    testResults: []
  };

  // Process each example in subset
  for (let i = 0; i < SUBSET_EXAMPLES.length; i++) {
    const exampleName = SUBSET_EXAMPLES[i];
    const sourcePath = path.join(EXAMPLES_REPO_PATH, 'examples', exampleName);
    const outputPath = path.join(CONVERSION_OUTPUT_PATH, exampleName);

    console.log(`\n[${i + 1}/${SUBSET_EXAMPLES.length}] Processing: ${exampleName}`);

    if (!fs.existsSync(sourcePath)) {
      console.log(`  ❌ Source path does not exist: ${sourcePath}`);
      continue;
    }

    try {
      // Run conversion
      const cliPath = path.join(__dirname, '../src/cli.ts');
      const command = `npx tsx "${cliPath}" convert --source "${sourcePath}" --output "${outputPath}" --verbose`;

      console.log(`  🔄 Converting...`);
      execSync(command, {
        stdio: 'pipe',
        timeout: 120000
      });

      // Verify conversion results
      const testsDir = path.join(outputPath, 'tests');
      const playwrightTestFiles = fs.existsSync(testsDir)
        ? fs.readdirSync(testsDir).filter(f => f.endsWith('.spec.ts') || f.endsWith('.spec.js'))
        : [];

      if (playwrightTestFiles.length > 0) {
        console.log(`  ✅ Success - Created ${playwrightTestFiles.length} test files`);

        const conversionResult = {
          name: exampleName,
          testFiles: playwrightTestFiles.length,
          conversionSuccess: true
        };

        // Try to run Playwright tests
        try {
          console.log(`  🧪 Running Playwright tests...`);

          // Install dependencies first
          const packageJsonPath = path.join(outputPath, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            console.log(`    📦 Installing dependencies...`);
            execSync('npm install', {
              cwd: outputPath,
              stdio: 'pipe',
              timeout: 60000
            });
          }

          // Install Playwright browsers if not already done
          try {
            execSync('npx playwright install chromium', {
              cwd: outputPath,
              stdio: 'pipe',
              timeout: 120000
            });
          } catch (browserError) {
            console.log(`    ⚠️  Browser install skipped: ${browserError.message.split('\n')[0]}`);
          }

          // Run Playwright tests
          const testOutput = execSync('npx playwright test --reporter=json', {
            cwd: outputPath,
            stdio: 'pipe',
            timeout: 180000,
            encoding: 'utf8'
          });

          // Parse test results
          const testReport = JSON.parse(testOutput);
          const testStats = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0
          };

          // Count test outcomes
          if (testReport.suites) {
            testReport.suites.forEach(suite => {
              if (suite.specs) {
                suite.specs.forEach(spec => {
                  if (spec.tests) {
                    spec.tests.forEach(test => {
                      testStats.total++;
                      if (test.status === 'passed') testStats.passed++;
                      else if (test.status === 'failed') testStats.failed++;
                      else testStats.skipped++;
                    });
                  }
                });
              }
            });
          }

          conversionResult.testResults = {
            success: true,
            stats: testStats,
            duration: testReport.stats?.duration || 0
          };

          console.log(`    ✅ Tests completed: ${testStats.passed}/${testStats.total} passed`);
          if (testStats.failed > 0) {
            console.log(`    ⚠️  Failed tests: ${testStats.failed}`);
          }

        } catch (testError) {
          const errorMsg = testError.message.split('\n')[0];
          console.log(`    ❌ Test execution failed: ${errorMsg}`);
          conversionResult.testResults = {
            success: false,
            error: errorMsg
          };
        }

        results.successful.push(conversionResult);
        results.testResults.push(conversionResult);

      } else {
        console.log(`  ⚠️  Converted but no test files created`);
        results.failed.push({
          name: exampleName,
          error: 'No test files created'
        });
      }

    } catch (error) {
      console.log(`  ❌ Conversion failed: ${error.message.split('\n')[0]}`);
      results.failed.push({
        name: exampleName,
        error: error.message.split('\n')[0]
      });
    }
  }

  // Generate summary report
  console.log('\n📊 SUBSET CONVERSION SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total examples processed: ${SUBSET_EXAMPLES.length}`);
  console.log(`✅ Successful conversions: ${results.successful.length}`);
  console.log(`❌ Failed conversions: ${results.failed.length}`);

  const conversionRate = ((results.successful.length / SUBSET_EXAMPLES.length) * 100).toFixed(1);
  console.log(`📈 Conversion success rate: ${conversionRate}%`);

  // Test execution summary
  console.log('\n🧪 TEST EXECUTION SUMMARY');
  console.log('='.repeat(50));

  const testableProjects = results.testResults.filter(r => r.testResults);
  const successfulTests = testableProjects.filter(r => r.testResults.success);
  const failedTests = testableProjects.filter(r => !r.testResults.success);

  console.log(`Projects with tests run: ${testableProjects.length}`);
  console.log(`✅ Test execution success: ${successfulTests.length}`);
  console.log(`❌ Test execution failed: ${failedTests.length}`);

  if (testableProjects.length > 0) {
    const testSuccessRate = ((successfulTests.length / testableProjects.length) * 100).toFixed(1);
    console.log(`📈 Test success rate: ${testSuccessRate}%`);

    // Aggregate test statistics
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    successfulTests.forEach(project => {
      if (project.testResults.stats) {
        totalTests += project.testResults.stats.total;
        totalPassed += project.testResults.stats.passed;
        totalFailed += project.testResults.stats.failed;
        totalSkipped += project.testResults.stats.skipped;
      }
    });

    if (totalTests > 0) {
      console.log(`\n📊 AGGREGATE TEST RESULTS`);
      console.log('='.repeat(30));
      console.log(`Total tests executed: ${totalTests}`);
      console.log(`✅ Passed: ${totalPassed} (${((totalPassed / totalTests) * 100).toFixed(1)}%)`);
      console.log(`❌ Failed: ${totalFailed} (${((totalFailed / totalTests) * 100).toFixed(1)}%)`);
      console.log(`⏭️  Skipped: ${totalSkipped} (${((totalSkipped / totalTests) * 100).toFixed(1)}%)`);
    }
  }

  // List results
  if (results.failed.length > 0) {
    console.log('\n❌ FAILED CONVERSIONS:');
    results.failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  }

  if (failedTests.length > 0) {
    console.log('\n❌ FAILED TEST EXECUTIONS:');
    failedTests.forEach(f => console.log(`  - ${f.name}: ${f.testResults.error}`));
  }

  // Save detailed report
  const reportPath = path.join(CONVERSION_OUTPUT_PATH, 'subset-test-report.json');
  const detailedReport = {
    timestamp: new Date().toISOString(),
    subset: SUBSET_EXAMPLES,
    results,
    conversionRate: parseFloat(conversionRate)
  };

  fs.writeFileSync(reportPath, JSON.stringify(detailedReport, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  console.log('\n🎉 Subset conversion with test execution completed!');
  console.log(`📁 Converted projects are in: ${CONVERSION_OUTPUT_PATH}`);

  return results;
}

// Run if called directly
if (require.main === module) {
  convertSubsetWithTests().catch(console.error);
}

module.exports = { convertSubsetWithTests };