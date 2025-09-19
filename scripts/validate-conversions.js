#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONVERSION_OUTPUT_PATH = '/tmp/cypress-conversions';

async function validateConversions() {
  console.log('🔍 Validating converted Playwright projects...');

  if (!fs.existsSync(CONVERSION_OUTPUT_PATH)) {
    console.log('❌ Conversion output directory does not exist');
    return;
  }

  const projectDirs = fs.readdirSync(CONVERSION_OUTPUT_PATH)
    .filter(name => {
      const projectPath = path.join(CONVERSION_OUTPUT_PATH, name);
      return fs.statSync(projectPath).isDirectory() &&
             name !== 'node_modules' &&
             !name.startsWith('.');
    });

  console.log(`📁 Found ${projectDirs.length} converted projects`);

  const results = {
    syntaxValid: [],
    syntaxInvalid: [],
    testExecutable: [],
    testFailed: [],
    summary: {
      totalProjects: projectDirs.length,
      syntaxCheckPassed: 0,
      testExecutionPassed: 0
    }
  };

  for (let i = 0; i < projectDirs.length; i++) {
    const projectName = projectDirs[i];
    const projectPath = path.join(CONVERSION_OUTPUT_PATH, projectName);

    console.log(`\n[${i + 1}/${projectDirs.length}] Validating: ${projectName}`);

    // Check if project has test files
    const testsDir = path.join(projectPath, 'tests');
    if (!fs.existsSync(testsDir)) {
      console.log('  ⏭️  No tests directory found');
      continue;
    }

    const testFiles = fs.readdirSync(testsDir)
      .filter(f => f.endsWith('.spec.js') || f.endsWith('.spec.ts'))
      .map(f => path.join(testsDir, f));

    if (testFiles.length === 0) {
      console.log('  ⏭️  No test files found');
      continue;
    }

    console.log(`  📄 Found ${testFiles.length} test files`);

    // 1. Syntax validation
    let syntaxValid = true;
    const syntaxErrors = [];

    for (const testFile of testFiles) {
      try {
        const content = fs.readFileSync(testFile, 'utf8');

        // Basic syntax checks
        const issues = [];

        // Check for unmatched quotes in strings
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          // Check for unterminated strings (basic check)
          if (line.includes("'() => {") && !line.includes("'}")) {
            issues.push(`Line ${index + 1}: Possible unterminated string`);
          }

          // Check for missing quotes around URLs
          if (line.includes('await page.goto(') && !line.includes("'") && !line.includes('"')) {
            issues.push(`Line ${index + 1}: Missing quotes in page.goto()`);
          }
        });

        if (issues.length > 0) {
          syntaxErrors.push({ file: path.basename(testFile), issues });
          syntaxValid = false;
        }

      } catch (error) {
        syntaxErrors.push({ file: path.basename(testFile), issues: [error.message] });
        syntaxValid = false;
      }
    }

    if (syntaxValid) {
      console.log('  ✅ Syntax validation passed');
      results.syntaxValid.push(projectName);
      results.summary.syntaxCheckPassed++;
    } else {
      console.log('  ❌ Syntax validation failed');
      syntaxErrors.forEach(error => {
        console.log(`    📄 ${error.file}:`);
        error.issues.forEach(issue => console.log(`      - ${issue}`));
      });
      results.syntaxInvalid.push({ name: projectName, errors: syntaxErrors });
    }

    // 2. Test execution (only if syntax is valid)
    if (syntaxValid) {
      try {
        console.log('  🧪 Attempting test execution...');

        // Check if package.json exists
        const packageJsonPath = path.join(projectPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
          console.log('    ⚠️  No package.json found, skipping test execution');
          continue;
        }

        // Try to run syntax check first using Node.js
        try {
          for (const testFile of testFiles) {
            execSync(`node -c "${testFile}"`, {
              cwd: projectPath,
              stdio: 'pipe',
              timeout: 10000
            });
          }
          console.log('    ✅ Node.js syntax check passed');
        } catch (nodeError) {
          console.log('    ❌ Node.js syntax check failed');
          results.testFailed.push({
            name: projectName,
            error: 'Node.js syntax check failed',
            details: nodeError.message.split('\n')[0]
          });
          continue;
        }

        // Install dependencies if node_modules doesn't exist
        if (!fs.existsSync(path.join(projectPath, 'node_modules'))) {
          console.log('    📦 Installing dependencies...');
          execSync('npm install', {
            cwd: projectPath,
            stdio: 'pipe',
            timeout: 60000
          });
        }

        // Try dry run first (just check if Playwright can parse the files)
        execSync('npx playwright test --list', {
          cwd: projectPath,
          stdio: 'pipe',
          timeout: 30000
        });

        console.log('    ✅ Playwright can parse test files');
        results.testExecutable.push(projectName);
        results.summary.testExecutionPassed++;

      } catch (testError) {
        const errorMsg = testError.message.split('\n')[0];
        console.log(`    ❌ Test execution failed: ${errorMsg}`);
        results.testFailed.push({
          name: projectName,
          error: errorMsg
        });
      }
    }
  }

  // Generate summary
  console.log('\n📊 VALIDATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total projects validated: ${results.summary.totalProjects}`);
  console.log(`✅ Syntax validation passed: ${results.summary.syntaxCheckPassed}`);
  console.log(`❌ Syntax validation failed: ${results.syntaxInvalid.length}`);
  console.log(`🧪 Test execution ready: ${results.summary.testExecutionPassed}`);
  console.log(`❌ Test execution failed: ${results.testFailed.length}`);

  const syntaxSuccessRate = results.summary.totalProjects > 0
    ? ((results.summary.syntaxCheckPassed / results.summary.totalProjects) * 100).toFixed(1)
    : 0;

  const testSuccessRate = results.summary.syntaxCheckPassed > 0
    ? ((results.summary.testExecutionPassed / results.summary.syntaxCheckPassed) * 100).toFixed(1)
    : 0;

  console.log(`📈 Syntax success rate: ${syntaxSuccessRate}%`);
  console.log(`📈 Test execution readiness: ${testSuccessRate}%`);

  // Detailed results
  if (results.syntaxInvalid.length > 0) {
    console.log('\n❌ PROJECTS WITH SYNTAX ISSUES:');
    results.syntaxInvalid.forEach(project => {
      console.log(`  - ${project.name}`);
    });
  }

  if (results.testFailed.length > 0) {
    console.log('\n❌ PROJECTS WITH TEST EXECUTION ISSUES:');
    results.testFailed.forEach(project => {
      console.log(`  - ${project.name}: ${project.error}`);
    });
  }

  if (results.testExecutable.length > 0) {
    console.log('\n✅ PROJECTS READY FOR TEST EXECUTION:');
    results.testExecutable.forEach(project => {
      console.log(`  - ${project}`);
    });
  }

  // Save detailed report
  const reportPath = path.join(CONVERSION_OUTPUT_PATH, 'validation-report.json');
  const detailedReport = {
    timestamp: new Date().toISOString(),
    summary: results.summary,
    syntaxSuccessRate: parseFloat(syntaxSuccessRate),
    testSuccessRate: parseFloat(testSuccessRate),
    results
  };

  fs.writeFileSync(reportPath, JSON.stringify(detailedReport, null, 2));
  console.log(`\n📄 Detailed validation report saved to: ${reportPath}`);

  return results;
}

// Run if called directly
if (require.main === module) {
  validateConversions().catch(console.error);
}

module.exports = { validateConversions };