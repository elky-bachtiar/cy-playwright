import { Logger } from '../utils/logger';

export interface LocatorValidationResult {
  isValid: boolean;
  modernLocators: string[];
  legacySelectors: string[];
  brittleSelectors: string[];
  locatorScore: number;
  warnings: LocatorWarning[];
  suggestions: string[];
  testIdUsage: {
    good: string[];
    needsImprovement: string[];
  };
  accessibility: {
    semanticElements: number;
    roleBasedSelectors: number;
    labelBasedSelectors: number;
  };
}

export interface LocatorWarning {
  type: 'legacy_selector' | 'brittle_selector' | 'inaccessible_selector' | 'performance_concern';
  message: string;
  selector: string;
  line?: number;
  suggestion?: string;
}

export class LocatorStrategyValidator {
  private logger = new Logger('LocatorStrategyValidator');

  // Modern Playwright locator methods
  private modernLocatorMethods = new Set([
    'getByRole', 'getByTestId', 'getByLabel', 'getByText', 'getByTitle',
    'getByPlaceholder', 'getByAltText', 'getByDisplayValue'
  ]);

  // Patterns that indicate brittle selectors
  private brittlePatterns = [
    /nth-child\(\d+\)/,
    /nth-of-type\(\d+\)/,
    /:\s*first-child/,
    /:\s*last-child/,
    />\s*\w+:\s*nth-child/,
    /\w+-\w+-\w+-\d+/, // Auto-generated classes like MuiButton-root-123
    /^\.css-[a-z0-9]+/, // CSS modules classes
    /xpath=/
  ];

  // Semantic roles for accessibility
  private semanticRoles = new Set([
    'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
    'listbox', 'option', 'tab', 'tabpanel', 'dialog', 'alert',
    'banner', 'main', 'navigation', 'complementary', 'contentinfo'
  ]);

  validateLocators(testContent: string): LocatorValidationResult {
    this.logger.debug('Validating locator strategies in test content');

    const result: LocatorValidationResult = {
      isValid: true,
      modernLocators: [],
      legacySelectors: [],
      brittleSelectors: [],
      locatorScore: 0,
      warnings: [],
      suggestions: [],
      testIdUsage: {
        good: [],
        needsImprovement: []
      },
      accessibility: {
        semanticElements: 0,
        roleBasedSelectors: 0,
        labelBasedSelectors: 0
      }
    };

    try {
      // Parse and analyze locators
      this.analyzeModernLocators(testContent, result);
      this.analyzeLegacySelectors(testContent, result);
      this.analyzeBrittleSelectors(testContent, result);
      this.analyzeTestIdUsage(testContent, result);
      this.analyzeAccessibility(testContent, result);

      // Calculate overall score
      result.locatorScore = this.calculateLocatorScore(result);

      // Generate suggestions
      result.suggestions = this.generateSuggestions(result);

      // Determine validity
      result.isValid = result.warnings.filter(w => w.type === 'brittle_selector').length === 0;

    } catch (error) {
      this.logger.error('Locator validation failed:', error);
      result.isValid = false;
    }

    return result;
  }

  private analyzeModernLocators(content: string, result: LocatorValidationResult): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Find modern locator methods
      for (const method of this.modernLocatorMethods) {
        const regex = new RegExp(`page\\.${method}\\(`, 'g');
        const matches = line.match(regex);

        if (matches) {
          if (!result.modernLocators.includes(method)) {
            result.modernLocators.push(method);
          }

          // Count specific types for accessibility analysis
          if (method === 'getByRole') {
            result.accessibility.roleBasedSelectors++;
            this.analyzeRoleUsage(line, result);
          }

          if (method === 'getByLabel') {
            result.accessibility.labelBasedSelectors++;
          }
        }
      }
    }
  }

  private analyzeLegacySelectors(content: string, result: LocatorValidationResult): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Find page.locator() calls with CSS selectors
      const locatorMatches = line.match(/page\.locator\(['"`]([^'"`]+)['"`]\)/g);

      if (locatorMatches) {
        for (const match of locatorMatches) {
          const selector = match.match(/['"`]([^'"`]+)['"`]/)?.[1];

          if (selector) {
            // Check if it's a legacy CSS selector
            if (this.isLegacySelector(selector)) {
              result.legacySelectors.push(selector);

              result.warnings.push({
                type: 'legacy_selector',
                message: `Legacy CSS selector detected: ${selector}`,
                selector,
                line: lineNumber,
                suggestion: this.suggestModernAlternative(selector)
              });
            }
          }
        }
      }
    }
  }

  private analyzeBrittleSelectors(content: string, result: LocatorValidationResult): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Find all selector strings
      const selectorMatches = line.match(/(?:locator|getBy\w+)\(['"`]([^'"`]+)['"`]\)/g);

      if (selectorMatches) {
        for (const match of selectorMatches) {
          const selector = match.match(/['"`]([^'"`]+)['"`]/)?.[1];

          if (selector && this.isBrittleSelector(selector)) {
            result.brittleSelectors.push(selector);

            result.warnings.push({
              type: 'brittle_selector',
              message: `Potentially brittle selector: ${selector}`,
              selector,
              line: lineNumber,
              suggestion: 'Consider using semantic locators like getByRole or getByTestId'
            });
          }
        }
      }

      // Check for xpath selectors
      if (line.includes('xpath=')) {
        const xpathMatch = line.match(/xpath=([^'"`\)]+)/);
        if (xpathMatch) {
          const xpath = xpathMatch[1];
          result.brittleSelectors.push(xpath);

          result.warnings.push({
            type: 'brittle_selector',
            message: `XPath selector detected: ${xpath}`,
            selector: xpath,
            line: lineNumber,
            suggestion: 'Replace XPath with semantic locators when possible'
          });
        }
      }
    }
  }

  private analyzeTestIdUsage(content: string, result: LocatorValidationResult): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Find getByTestId usage
      const testIdMatches = line.match(/getByTestId\(['"`]([^'"`]+)['"`]\)/g);

      if (testIdMatches) {
        for (const match of testIdMatches) {
          const testId = match.match(/['"`]([^'"`]+)['"`]/)?.[1];

          if (testId) {
            if (this.isSemanticTestId(testId)) {
              result.testIdUsage.good.push(testId);
            } else {
              result.testIdUsage.needsImprovement.push(testId);

              result.warnings.push({
                type: 'inaccessible_selector',
                message: `Non-semantic test ID: ${testId}`,
                selector: testId,
                line: lineNumber,
                suggestion: 'Use descriptive test IDs that indicate element purpose'
              });
            }
          }
        }
      }

      // Find data-testid in locator calls (suggest getByTestId)
      const dataTestIdMatches = line.match(/locator\(['"`]\[data-testid="([^"]+)"\]['"`]\)/g);

      if (dataTestIdMatches) {
        for (const match of dataTestIdMatches) {
          const testId = match.match(/data-testid="([^"]+)"/)?.[1];

          if (testId) {
            result.suggestions.push('Use getByTestId instead of locator with data-testid');
          }
        }
      }
    }
  }

  private analyzeAccessibility(content: string, result: LocatorValidationResult): void {
    // Count semantic HTML elements used in selectors
    const semanticElements = ['button', 'input', 'form', 'nav', 'main', 'header', 'footer', 'section', 'article'];

    for (const element of semanticElements) {
      const regex = new RegExp(`locator\\(['"\`]${element}[^'"\`]*['"\`]\\)`, 'g');
      const matches = content.match(regex);

      if (matches) {
        result.accessibility.semanticElements += matches.length;
      }
    }

    // Additional accessibility analysis could include:
    // - ARIA attributes usage
    // - Label association patterns
    // - Focus management indicators
  }

  private analyzeRoleUsage(line: string, result: LocatorValidationResult): void {
    // Extract role from getByRole calls
    const roleMatch = line.match(/getByRole\(['"`](\w+)['"`]/);

    if (roleMatch) {
      const role = roleMatch[1];

      if (this.semanticRoles.has(role)) {
        result.accessibility.semanticElements++;
      }
    }
  }

  private isLegacySelector(selector: string): boolean {
    // CSS selectors that are considered legacy/brittle
    const legacyPatterns = [
      /^#\w+/, // ID selectors
      /^\.\w+/, // Simple class selectors
      /^[a-z]+\[/, // Tag with attribute selectors
      />\s*[a-z]+/, // Direct child selectors
      /\s+[a-z]+$/, // Descendant selectors
    ];

    return legacyPatterns.some(pattern => pattern.test(selector));
  }

  private isBrittleSelector(selector: string): boolean {
    return this.brittlePatterns.some(pattern => pattern.test(selector));
  }

  private isSemanticTestId(testId: string): boolean {
    // Good test IDs are descriptive and indicate purpose
    const semanticIndicators = [
      'button', 'btn', 'submit', 'cancel', 'save', 'delete', 'edit',
      'input', 'field', 'form', 'modal', 'dialog', 'menu', 'nav',
      'header', 'footer', 'sidebar', 'content', 'main', 'search',
      'filter', 'sort', 'pagination', 'card', 'item', 'list'
    ];

    // Bad test IDs are generic or numbered
    const nonSemanticPatterns = [
      /^(btn|div|span|item)\d+$/,
      /^(test|elem|comp)\d+$/,
      /^\d+$/,
      /^[a-z]{1,3}\d+$/
    ];

    // Check for non-semantic patterns first
    if (nonSemanticPatterns.some(pattern => pattern.test(testId))) {
      return false;
    }

    // Check for semantic indicators
    const testIdLower = testId.toLowerCase();
    return semanticIndicators.some(indicator => testIdLower.includes(indicator));
  }

  private suggestModernAlternative(selector: string): string {
    if (selector.startsWith('#')) {
      return 'Consider using getByTestId if this is a test identifier';
    }

    if (selector.includes('button')) {
      return 'Use getByRole("button") for better semantics';
    }

    if (selector.includes('input')) {
      return 'Use getByLabel or getByPlaceholder for form inputs';
    }

    if (selector.includes('text')) {
      return 'Use getByText for text content';
    }

    return 'Consider using semantic locators like getByRole, getByLabel, or getByTestId';
  }

  private calculateLocatorScore(result: LocatorValidationResult): number {
    const totalLocators = result.modernLocators.length +
                         result.legacySelectors.length +
                         result.brittleSelectors.length;

    if (totalLocators === 0) return 100;

    const modernWeight = 3;
    const legacyPenalty = 1;
    const brittlePenalty = 2;

    const score = (
      (result.modernLocators.length * modernWeight) -
      (result.legacySelectors.length * legacyPenalty) -
      (result.brittleSelectors.length * brittlePenalty)
    ) / (totalLocators * modernWeight) * 100;

    return Math.max(0, Math.min(100, score));
  }

  private generateSuggestions(result: LocatorValidationResult): string[] {
    const suggestions: string[] = [];

    if (result.legacySelectors.length > 0) {
      suggestions.push('Replace CSS selectors with semantic locators for better maintainability');
    }

    if (result.brittleSelectors.length > 0) {
      suggestions.push('Avoid brittle selectors like nth-child and auto-generated classes');
    }

    if (result.modernLocators.length === 0) {
      suggestions.push('Use modern Playwright locators like getByRole, getByTestId, and getByLabel');
    }

    if (result.accessibility.roleBasedSelectors === 0) {
      suggestions.push('Use getByRole for semantic elements to improve accessibility');
    }

    if (result.testIdUsage.needsImprovement.length > 0) {
      suggestions.push('Use descriptive test IDs that indicate element purpose');
    }

    if (result.accessibility.semanticElements === 0) {
      suggestions.push('Target semantic HTML elements when possible');
    }

    return suggestions;
  }
}