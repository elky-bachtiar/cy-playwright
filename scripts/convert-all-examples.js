#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXAMPLES_REPO_PATH = '/tmp/cypress-example-recipes';
const CONVERSION_OUTPUT_PATH = '/tmp/cypress-conversions';

async function convertAllExamples() {
  console.log('🚀 Starting mass conversion of Cypress examples...');

  // Clone the repository if it doesn't exist
  if (!fs.existsSync(EXAMPLES_REPO_PATH)) {
    console.log('📥 Cloning cypress-example-recipes repository...');
    execSync(`git clone https://github.com/cypress-io/cypress-example-recipes.git ${EXAMPLES_REPO_PATH}`);
  }

  // Create output directory
  if (!fs.existsSync(CONVERSION_OUTPUT_PATH)) {
    fs.mkdirSync(CONVERSION_OUTPUT_PATH, { recursive: true });
  }

  // Find all example directories
  const examplesDir = path.join(EXAMPLES_REPO_PATH, 'examples');
  const exampleNames = fs.readdirSync(examplesDir)
    .filter(name => {
      const examplePath = path.join(examplesDir, name);
      return fs.statSync(examplePath).isDirectory();
    });

  console.log(`📁 Found ${exampleNames.length} example directories`);

  const results = {
    successful: [],
    failed: [],
    skipped: [],
    testResults: []
  };

  // Process each example
  for (let i = 0; i < exampleNames.length; i++) {
    const exampleName = exampleNames[i];
    const sourcePath = path.join(examplesDir, exampleName);
    const outputPath = path.join(CONVERSION_OUTPUT_PATH, exampleName);

    console.log(`\n[${i + 1}/${exampleNames.length}] Processing: ${exampleName}`);

    // Check if example has Cypress files
    const cypressDir = path.join(sourcePath, 'cypress');
    const hasConfig = fs.existsSync(path.join(sourcePath, 'cypress.config.js')) ||
                     fs.existsSync(path.join(sourcePath, 'cypress.config.ts')) ||
                     fs.existsSync(path.join(sourcePath, 'cypress.json'));

    if (!fs.existsSync(cypressDir) && !hasConfig) {
      console.log(`  ⏭️  Skipping - No Cypress files detected`);
      results.skipped.push(exampleName);
      continue;
    }

    try {
      // Run conversion
      const cliPath = path.join(__dirname, '../src/cli.ts');
      const command = `npx tsx "${cliPath}" convert --source "${sourcePath}" --output "${outputPath}" --verbose`;

      console.log(`  🔄 Converting...`);
      execSync(command, {
        stdio: 'pipe',
        timeout: 120000 // 2 minute timeout per project
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
            execSync('npm install', {
              cwd: outputPath,
              stdio: 'pipe',
              timeout: 60000
            });
          }

          // Run Playwright tests
          const testOutput = execSync('npx playwright test --reporter=json', {
            cwd: outputPath,
            stdio: 'pipe',
            timeout: 180000, // 3 minute timeout for tests
            encoding: 'utf8'
          });

          // Parse test results
          const testReport = JSON.parse(testOutput);
          const testStats = {
            total: testReport.suites?.reduce((acc, suite) => acc + (suite.specs?.length || 0), 0) || 0,
            passed: 0,
            failed: 0,
            skipped: 0
          };

          // Count test outcomes
          testReport.suites?.forEach(suite => {
            suite.specs?.forEach(spec => {
              spec.tests?.forEach(test => {
                if (test.status === 'passed') testStats.passed++;
                else if (test.status === 'failed') testStats.failed++;
                else testStats.skipped++;
              });
            });
          });

          conversionResult.testResults = {
            success: true,
            stats: testStats,
            duration: testReport.stats?.duration || 0
          };

          console.log(`  ✅ Tests passed: ${testStats.passed}/${testStats.total} tests`);
          if (testStats.failed > 0) {
            console.log(`  ⚠️  Failed tests: ${testStats.failed}`);
          }

        } catch (testError) {
          console.log(`  ❌ Test execution failed: ${testError.message.split('\n')[0]}`);
          conversionResult.testResults = {
            success: false,
            error: testError.message.split('\n')[0]
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
      console.log(`  ❌ Failed - ${error.message}`);
      results.failed.push({
        name: exampleName,
        error: error.message
      });
    }
  }

  // Generate summary report
  console.log('\n📊 CONVERSION SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total examples processed: ${exampleNames.length}`);
  console.log(`✅ Successful conversions: ${results.successful.length}`);
  console.log(`❌ Failed conversions: ${results.failed.length}`);
  console.log(`⏭️  Skipped (no Cypress): ${results.skipped.length}`);

  const conversionRate = ((results.successful.length / (exampleNames.length - results.skipped.length)) * 100).toFixed(1);
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

  // Save detailed report
  const reportPath = path.join(CONVERSION_OUTPUT_PATH, 'conversion-report.json');
  const detailedReport = {
    timestamp: new Date().toISOString(),
    total: exampleNames.length,
    results,
    conversionRate: parseFloat(conversionRate)
  };

  fs.writeFileSync(reportPath, JSON.stringify(detailedReport, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  // List failed conversions for debugging
  if (results.failed.length > 0) {
    console.log('\n❌ FAILED CONVERSIONS:');
    results.failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  }

  // List failed test executions
  if (failedTests.length > 0) {
    console.log('\n❌ FAILED TEST EXECUTIONS:');
    failedTests.forEach(f => console.log(`  - ${f.name}: ${f.testResults.error}`));
  }

  console.log('\n🎉 Mass conversion completed!');
  console.log(`📁 Converted projects are in: ${CONVERSION_OUTPUT_PATH}`);
}

// Run if called directly
if (require.main === module) {
  convertAllExamples().catch(console.error);
}

module.exports = { convertAllExamples };