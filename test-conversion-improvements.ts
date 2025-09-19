#!/usr/bin/env npx ts-node

import * as path from 'path';
import * as fs from 'fs-extra';
import { EnhancedConversionService } from './src/services/enhanced-conversion-service';
import { PageObjectAnalyzer } from './src/services/page-object-analyzer';
import { PageObjectTransformer } from './src/services/page-object-transformer';

async function main() {
  console.log('🚀 Testing Conversion Quality Improvements');
  console.log('=========================================');

  const testRepoPath = '/tmp/test-repo-1758269724';
  const outputPath = '/tmp/test-conversion-output';

  // Clean up previous output
  await fs.remove(outputPath);
  await fs.ensureDir(outputPath);

  // Test 1: Page Object Analysis
  console.log('\n📋 Test 1: Page Object Analysis');
  console.log('-------------------------------');

  const pageObjectAnalyzer = new PageObjectAnalyzer();

  try {
    const analysis = await pageObjectAnalyzer.analyzeProject(testRepoPath);
    console.log(`✅ Found ${analysis.pageObjectClasses.length} page object classes`);
    console.log(`✅ Has custom selectors: ${analysis.hasCustomSelectors}`);
    console.log(`✅ Has method chaining: ${analysis.hasMethodChaining}`);
    console.log(`✅ Complexity level: ${analysis.complexityLevel}`);

    for (const pageObject of analysis.pageObjectClasses) {
      console.log(`  📁 ${pageObject.name}:`);
      console.log(`    - Properties: ${pageObject.properties.length}`);
      console.log(`    - Methods: ${pageObject.methods.length}`);

      for (const property of pageObject.properties) {
        console.log(`    - Selector: ${property.name} (@${property.decorator.type}: "${property.decorator.value}")`);
      }
    }

    if (analysis.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      analysis.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

  } catch (error) {
    console.error('❌ Page object analysis failed:', error);
  }

  // Test 2: Page Object Transformation
  console.log('\n🔄 Test 2: Page Object Transformation');
  console.log('-----------------------------------');

  const pageObjectTransformer = new PageObjectTransformer();

  try {
    const analysis = await pageObjectAnalyzer.analyzeProject(testRepoPath);

    if (analysis.pageObjectClasses.length > 0) {
      const converted = pageObjectTransformer.transformMultiplePageObjects(
        analysis.pageObjectClasses,
        { preserveMethodChaining: true }
      );

      for (const convertedPageObject of converted) {
        console.log(`✅ Converted ${convertedPageObject.className}`);
        console.log(`   Output path: ${convertedPageObject.filePath}`);

        if (convertedPageObject.warnings.length > 0) {
          console.log('   ⚠️  Warnings:');
          convertedPageObject.warnings.forEach(warning => console.log(`     - ${warning}`));
        }

        // Save converted page object for inspection
        const outputFile = path.join(outputPath, 'pages', convertedPageObject.className + '.ts');
        await fs.ensureDir(path.dirname(outputFile));
        await fs.writeFile(outputFile, convertedPageObject.content);
        console.log(`   💾 Saved to: ${outputFile}`);
      }
    } else {
      console.log('ℹ️  No page objects found to convert');
    }

  } catch (error) {
    console.error('❌ Page object transformation failed:', error);
  }

  // Test 3: Enhanced Conversion Service
  console.log('\n🔧 Test 3: Enhanced Conversion Service');
  console.log('------------------------------------');

  const enhancedService = new EnhancedConversionService();

  try {
    const result = await enhancedService.convertProject({
      sourceDir: testRepoPath,
      outputDir: outputPath,
      preserveMethodChaining: true,
      convertPageObjects: true,
      deduplicateImports: true,
      transformImportPaths: true,
      convertTestStructure: true,
      verbose: true
    });

    console.log('✅ Enhanced conversion completed!');
    console.log(`   Total files: ${result.summary.totalFiles}`);
    console.log(`   Converted files: ${result.summary.convertedFiles}`);
    console.log(`   Page object files: ${result.summary.pageObjectFiles}`);
    console.log(`   Conversion rate: ${result.summary.conversionRate.toFixed(1)}%`);

    if (result.summary.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      result.summary.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    if (result.summary.errors.length > 0) {
      console.log('❌ Errors:');
      result.summary.errors.forEach(error => console.log(`   - ${error}`));
    }

    // Display converted files
    console.log('\n📁 Converted Files:');
    for (const file of result.convertedFiles) {
      console.log(`   ${file.type}: ${file.originalPath} → ${file.convertedPath}`);
    }

  } catch (error) {
    console.error('❌ Enhanced conversion failed:', error);
  }

  // Test 4: Check specific known issues
  console.log('\n🔍 Test 4: Checking Known Issues Resolution');
  console.log('------------------------------------------');

  try {
    // Check if converted test file exists and contains expected content
    const convertedTestPath = path.join(outputPath, 'e2e.spec.ts');
    if (await fs.pathExists(convertedTestPath)) {
      const convertedContent = await fs.readFile(convertedTestPath, 'utf-8');

      // Check for known issue fixes
      const checks = [
        {
          issue: 'Context blocks converted to test.describe',
          check: convertedContent.includes('test.describe'),
          status: convertedContent.includes('test.describe') ? '✅' : '❌'
        },
        {
          issue: 'Playwright imports added',
          check: convertedContent.includes("import { test, expect } from '@playwright/test'"),
          status: convertedContent.includes("import { test, expect } from '@playwright/test'") ? '✅' : '❌'
        },
        {
          issue: 'Cypress assertions converted',
          check: convertedContent.includes('await expect(') && !convertedContent.includes('.should('),
          status: convertedContent.includes('await expect(') && !convertedContent.includes('.should(') ? '✅' : '❌'
        },
        {
          issue: 'Page object imports updated',
          check: !convertedContent.includes("from '../pages/") || convertedContent.includes("from './pages/"),
          status: !convertedContent.includes("from '../pages/") ? '✅' : '❌'
        },
        {
          issue: 'File has substantial content (not just stub)',
          check: convertedContent.split('\n').length > 10,
          status: convertedContent.split('\n').length > 10 ? '✅' : '❌'
        }
      ];

      console.log('Issue resolution status:');
      checks.forEach(check => {
        console.log(`   ${check.status} ${check.issue}`);
      });

      console.log(`\n📄 Converted test file preview (first 20 lines):`);
      const lines = convertedContent.split('\n').slice(0, 20);
      lines.forEach((line, i) => console.log(`   ${(i + 1).toString().padStart(2)}: ${line}`));

    } else {
      console.log('❌ No converted test file found');
    }

    // Check for page object files
    const pageObjectsDir = path.join(outputPath, 'pages');
    if (await fs.pathExists(pageObjectsDir)) {
      const pageObjectFiles = await fs.readdir(pageObjectsDir);
      console.log(`\n📁 Page object files created: ${pageObjectFiles.length}`);
      pageObjectFiles.forEach(file => console.log(`   - ${file}`));

      // Check first page object file
      if (pageObjectFiles.length > 0) {
        const firstPageObjectPath = path.join(pageObjectsDir, pageObjectFiles[0]);
        const pageObjectContent = await fs.readFile(firstPageObjectPath, 'utf-8');

        console.log(`\n📄 Page object preview (${pageObjectFiles[0]}):`);
        const lines = pageObjectContent.split('\n').slice(0, 15);
        lines.forEach((line, i) => console.log(`   ${(i + 1).toString().padStart(2)}: ${line}`));
      }
    } else {
      console.log('❌ No page object files created');
    }

  } catch (error) {
    console.error('❌ Known issues check failed:', error);
  }

  console.log('\n🎯 Summary');
  console.log('==========');
  console.log('The conversion quality improvements test has completed.');
  console.log(`Output directory: ${outputPath}`);
  console.log('Check the files above to verify the known issues have been resolved.');
}

if (require.main === module) {
  main().catch(console.error);
}