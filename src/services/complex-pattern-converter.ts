import * as fs from 'fs-extra';
import { Logger } from '../utils/logger';
import { ThenPatternTransformer } from './then-pattern-transformer';
import { WaitPatternTransformer } from './wait-pattern-transformer';
import { CustomCommandHandler } from './custom-command-handler';
import {
  ComplexPatternConversionResult,
  ConvertedThenPattern,
  ConvertedWaitPattern,
  ConvertedCustomCommand
} from '../types/pattern-conversion';

export class ComplexPatternConverter {
  private logger = new Logger('ComplexPatternConverter');
  private thenTransformer = new ThenPatternTransformer();
  private waitTransformer = new WaitPatternTransformer();
  private customCommandHandler = new CustomCommandHandler();

  public async convertComplexPatterns(cypressCode: string): Promise<ComplexPatternConversionResult> {
    this.logger.info('Starting comprehensive complex pattern conversion');

    try {
      let convertedCode = cypressCode;
      const detailedResults: Array<ConvertedThenPattern | ConvertedWaitPattern | ConvertedCustomCommand> = [];
      let totalPatterns = 0;
      let convertedPatterns = 0;
      let failedPatterns = 0;
      let manualReviewRequired = 0;
      const complexityDistribution = { low: 0, medium: 0, high: 0 };

      // Step 1: Convert cy.then() patterns
      const thenPatterns = this.extractThenPatterns(convertedCode);
      for (const pattern of thenPatterns) {
        const result = this.thenTransformer.convertThenPattern(pattern);
        detailedResults.push(result);
        totalPatterns++;

        if (result.conversionSuccess) {
          convertedPatterns++;
          convertedCode = convertedCode.replace(pattern, result.playwrightPattern);
        } else {
          failedPatterns++;
        }

        if (result.transformationMetadata.requiresManualReview) {
          manualReviewRequired++;
        }

        complexityDistribution[result.transformationMetadata.complexity]++;
      }

      // Step 2: Convert cy.wait() and cy.intercept() patterns
      const waitPatterns = this.extractWaitPatterns(convertedCode);
      for (const pattern of waitPatterns) {
        const result = this.waitTransformer.convertWaitPattern(pattern);
        detailedResults.push(result);
        totalPatterns++;

        if (result.conversionSuccess) {
          convertedPatterns++;
          convertedCode = convertedCode.replace(pattern, result.playwrightPattern);
        } else {
          failedPatterns++;
        }

        if (result.transformationMetadata.requiresManualReview) {
          manualReviewRequired++;
        }

        complexityDistribution[result.transformationMetadata.complexity]++;
      }

      // Step 3: Convert custom commands
      const customCommandPatterns = this.extractCustomCommandPatterns(convertedCode);
      for (const pattern of customCommandPatterns) {
        const result = this.customCommandHandler.convertCustomCommand(pattern);
        detailedResults.push(result);
        totalPatterns++;

        if (result.conversionSuccess) {
          convertedPatterns++;
          convertedCode = convertedCode.replace(pattern, result.playwrightEquivalent);
        } else {
          failedPatterns++;
        }

        if (result.transformationMetadata.requiresManualReview) {
          manualReviewRequired++;
        }

        complexityDistribution[result.transformationMetadata.complexity]++;
      }

      // Step 4: Add necessary imports
      convertedCode = this.addPlaywrightImports(convertedCode);

      // Step 5: Validate the final result
      const isValid = this.validateFinalCode(convertedCode);

      const conversionResult: ComplexPatternConversionResult = {
        originalCode: cypressCode,
        convertedCode,
        isValid,
        conversionSuccess: isValid && failedPatterns === 0,
        conversionSummary: {
          totalPatterns,
          convertedPatterns,
          failedPatterns,
          manualReviewRequired,
          complexityDistribution
        },
        conversionNotes: this.generateOverallNotes(detailedResults, totalPatterns, convertedPatterns),
        detailedResults
      };

      this.logger.info(`Complex pattern conversion completed: ${conversionResult.conversionSuccess ? 'SUCCESS' : 'PARTIAL'}`);

      if (totalPatterns > 0) {
        this.logger.info(`Conversion rate: ${Math.round((convertedPatterns / totalPatterns) * 100)}%`);
      } else {
        this.logger.info('No complex patterns found to convert');
      }

      return conversionResult;

    } catch (error) {
      this.logger.error('Error in complex pattern conversion:', error);
      return this.createFailureResult(cypressCode, `Conversion error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async convertFile(filePath: string): Promise<ComplexPatternConversionResult> {
    this.logger.info(`Converting file: ${filePath}`);

    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      return await this.convertComplexPatterns(fileContent);
    } catch (error) {
      this.logger.error(`Error reading file ${filePath}:`, error);
      return this.createFailureResult('', `File read error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private extractThenPatterns(code: string): string[] {
    const patterns: string[] = [];

    // Extract cy.get().then() patterns
    const thenMatches = code.match(/cy\.[^.]+\([^)]*\)\.then\s*\([^{]*\{[^}]*\}/g);
    if (thenMatches) {
      patterns.push(...thenMatches);
    }

    // Extract more complex nested patterns
    const nestedMatches = code.match(/cy\.[^.]+\([^)]*\)\.then\s*\([^{]*\{[\s\S]*?\}\s*\)/g);
    if (nestedMatches) {
      patterns.push(...nestedMatches.filter(match => !patterns.includes(match)));
    }

    return patterns;
  }

  private extractWaitPatterns(code: string): string[] {
    const patterns: string[] = [];

    // Extract cy.intercept() patterns
    const interceptMatches = code.match(/cy\.intercept\([^)]*\)[^;]*;?/g);
    if (interceptMatches) {
      patterns.push(...interceptMatches);
    }

    // Extract cy.wait() patterns
    const waitMatches = code.match(/cy\.wait\([^)]*\)[^;]*;?/g);
    if (waitMatches) {
      patterns.push(...waitMatches);
    }

    // Extract cy.wait().then() patterns
    const waitThenMatches = code.match(/cy\.wait\([^)]*\)\.then\s*\([^{]*\{[\s\S]*?\}\s*\)/g);
    if (waitThenMatches) {
      patterns.push(...waitThenMatches.filter(match => !patterns.some(p => p.includes(match))));
    }

    return patterns;
  }

  private extractCustomCommandPatterns(code: string): string[] {
    const patterns: string[] = [];

    // Extract custom command calls
    const customCommandMatches = code.match(/cy\.\w+\([^)]*\)(?!\.(then|should|and|its|invoke))/g);
    if (customCommandMatches) {
      // Filter out standard Cypress commands
      const standardCommands = [
        'get', 'visit', 'click', 'type', 'should', 'expect', 'contains',
        'wait', 'intercept', 'then', 'and', 'wrap', 'as', 'its', 'invoke',
        'clear', 'check', 'uncheck', 'select', 'focus', 'blur', 'submit',
        'reload', 'go', 'url', 'title', 'window', 'document', 'log'
      ];

      const customCommands = customCommandMatches.filter(match => {
        const commandName = match.match(/cy\.(\w+)\(/)?.[1];
        return commandName && !standardCommands.includes(commandName);
      });

      patterns.push(...customCommands);
    }

    return patterns;
  }

  private addPlaywrightImports(code: string): string {
    // Check if Playwright imports are already present
    if (code.includes("import { Page } from '@playwright/test'") ||
        code.includes("import { test, expect } from '@playwright/test'")) {
      return code;
    }

    // Add Playwright imports at the top
    const playwrightImport = "import { Page } from '@playwright/test';\n";

    // Find existing imports and add after them, or add at the beginning
    const importMatch = code.match(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm);
    if (importMatch) {
      const lastImport = importMatch[importMatch.length - 1];
      const lastImportIndex = code.lastIndexOf(lastImport) + lastImport.length;
      return code.slice(0, lastImportIndex) + playwrightImport + code.slice(lastImportIndex);
    } else {
      return playwrightImport + code;
    }
  }

  private validateFinalCode(code: string): boolean {
    try {
      // Basic validation checks
      if (!code || code.trim().length === 0) {
        return false;
      }

      // Check for obvious syntax errors
      const bracketBalance = this.checkBracketBalance(code);
      if (!bracketBalance) {
        return false;
      }

      // Check for malformed patterns
      if (code.includes('cy.get(\'[data-testid="incomplete"')) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Code validation failed:', error);
      return false;
    }
  }

  private checkBracketBalance(code: string): boolean {
    const brackets = { '(': 0, '[': 0, '{': 0 };

    for (const char of code) {
      if (char === '(') brackets['(']++;
      else if (char === ')') brackets['(']--;
      else if (char === '[') brackets['[']++;
      else if (char === ']') brackets['[']--;
      else if (char === '{') brackets['{']++;
      else if (char === '}') brackets['{']--;
    }

    return brackets['('] === 0 && brackets['['] === 0 && brackets['{'] === 0;
  }

  private generateOverallNotes(
    detailedResults: Array<ConvertedThenPattern | ConvertedWaitPattern | ConvertedCustomCommand>,
    totalPatterns: number,
    convertedPatterns: number
  ): string[] {
    const notes: string[] = [];

    if (totalPatterns === 0) {
      notes.push('No complex patterns detected in the code');
      return notes;
    }

    const successRate = Math.round((convertedPatterns / totalPatterns) * 100);
    notes.push(`Complex pattern conversion completed with ${successRate}% success rate`);

    // Pattern type breakdown
    const thenPatterns = detailedResults.filter(r => 'transformationMetadata' in r && 'nestingLevel' in r.transformationMetadata);
    const waitPatterns = detailedResults.filter(r => 'transformationMetadata' in r && 'usesRequestInterception' in r.transformationMetadata);
    const customCommands = detailedResults.filter(r => 'transformationMetadata' in r && 'strategy' in r.transformationMetadata);

    if (thenPatterns.length > 0) {
      notes.push(`Converted ${thenPatterns.length} cy.then() patterns`);
    }
    if (waitPatterns.length > 0) {
      notes.push(`Converted ${waitPatterns.length} cy.wait()/cy.intercept() patterns`);
    }
    if (customCommands.length > 0) {
      notes.push(`Converted ${customCommands.length} custom command patterns`);
    }

    // Manual review requirements
    const manualReviewCount = detailedResults.filter(r =>
      r.transformationMetadata.requiresManualReview
    ).length;

    if (manualReviewCount > 0) {
      notes.push(`${manualReviewCount} patterns require manual review`);
    }

    // High complexity patterns
    const highComplexityCount = detailedResults.filter(r =>
      r.transformationMetadata.complexity === 'high'
    ).length;

    if (highComplexityCount > 0) {
      notes.push(`${highComplexityCount} high-complexity patterns detected`);
    }

    // Check for malformed code
    if (detailedResults.some(r => !r.isValid)) {
      notes.push('Malformed code detected in some patterns');
    }

    // Add success indicators
    if (successRate >= 85) {
      notes.push('Excellent conversion rate achieved');
    } else if (successRate >= 70) {
      notes.push('Good conversion rate achieved');
    } else if (successRate < 50) {
      notes.push('Low conversion rate - manual intervention recommended');
    }

    return notes;
  }

  private createFailureResult(originalCode: string, errorMessage: string): ComplexPatternConversionResult {
    return {
      originalCode,
      convertedCode: `// CONVERSION FAILED: ${errorMessage}\n${originalCode}`,
      isValid: false,
      conversionSuccess: false,
      conversionSummary: {
        totalPatterns: 0,
        convertedPatterns: 0,
        failedPatterns: 1,
        manualReviewRequired: 1,
        complexityDistribution: { low: 0, medium: 0, high: 1 }
      },
      conversionNotes: [errorMessage],
      detailedResults: []
    };
  }
}