import * as fs from 'fs-extra';
import { Logger } from '../utils/logger';

export interface InheritancePattern {
  type: 'abstract' | 'inheritance' | 'multilevel' | 'mixin' | 'composition' | 'static' | 'generic' | 'property' | 'hybrid' | 'override';
  baseClass: string;
  derivedClasses: string[];
  methods: string[];
  properties: string[];
  complexity: 'low' | 'medium' | 'high';
  playwrightConversion: {
    strategy: string;
    code: string;
    notes: string[];
  };
}

export interface InheritanceAnalysisResult {
  patterns: InheritancePattern[];
  conversionRecommendations: string[];
  totalComplexity: 'low' | 'medium' | 'high';
  requiresManualReview: boolean;
}

export class InheritancePatternDetector {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('InheritancePatternDetector');
  }

  /**
   * Analyze file content for inheritance patterns
   */
  async analyzeInheritancePatterns(filePath: string): Promise<InheritanceAnalysisResult> {
    this.logger.info(`Analyzing inheritance patterns in: ${filePath}`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.analyzeContent(content);
    } catch (error) {
      this.logger.error('Error analyzing inheritance patterns:', error);
      return {
        patterns: [],
        conversionRecommendations: ['Error reading file for inheritance analysis'],
        totalComplexity: 'low',
        requiresManualReview: true
      };
    }
  }

  /**
   * Analyze content for inheritance patterns
   */
  analyzeContent(content: string): InheritanceAnalysisResult {
    const patterns: InheritancePattern[] = [];

    // Detect different inheritance patterns
    patterns.push(...this.detectAbstractPatterns(content));
    patterns.push(...this.detectInheritancePatterns(content));
    patterns.push(...this.detectMultiLevelPatterns(content));
    patterns.push(...this.detectMixinPatterns(content));
    patterns.push(...this.detectCompositionPatterns(content));
    patterns.push(...this.detectStaticMethodPatterns(content));
    patterns.push(...this.detectGenericPatterns(content));
    patterns.push(...this.detectPropertyPatterns(content));
    patterns.push(...this.detectHybridPatterns(content));
    patterns.push(...this.detectOverridePatterns(content));

    // Calculate overall complexity
    const totalComplexity = this.calculateTotalComplexity(patterns);

    // Generate conversion recommendations
    const conversionRecommendations = this.generateRecommendations(patterns);

    return {
      patterns,
      conversionRecommendations,
      totalComplexity,
      requiresManualReview: patterns.some(p => p.complexity === 'high')
    };
  }

  private detectAbstractPatterns(content: string): InheritancePattern[] {
    const patterns: InheritancePattern[] = [];

    // Look for abstract class patterns
    const abstractClassRegex = /abstract class (\w+)/g;
    let match;

    while ((match = abstractClassRegex.exec(content)) !== null) {
      const className = match[1];
      const methods = this.extractMethods(content, className);
      const properties = this.extractProperties(content, className);

      patterns.push({
        type: 'abstract',
        baseClass: className,
        derivedClasses: this.findDerivedClasses(content, className),
        methods,
        properties,
        complexity: 'medium',
        playwrightConversion: {
          strategy: 'Convert to Playwright base page class',
          code: `export abstract class Base${className} {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // Abstract methods converted to protected methods
}`,
          notes: ['Abstract classes should be converted to Playwright base page classes']
        }
      });
    }

    return patterns;
  }

  private detectInheritancePatterns(content: string): InheritancePattern[] {
    const patterns: InheritancePattern[] = [];

    // Look for class inheritance patterns
    const inheritanceRegex = /class (\w+) extends (\w+)/g;
    let match;

    while ((match = inheritanceRegex.exec(content)) !== null) {
      const [, derivedClass, baseClass] = match;
      const methods = this.extractMethods(content, derivedClass);
      const properties = this.extractProperties(content, derivedClass);

      patterns.push({
        type: 'inheritance',
        baseClass,
        derivedClasses: [derivedClass],
        methods,
        properties,
        complexity: 'medium',
        playwrightConversion: {
          strategy: 'Convert to Playwright page object inheritance',
          code: `export class ${derivedClass} extends Base${baseClass} {
  constructor(page: Page) {
    super(page);
  }

  // Inherited methods converted to Playwright actions
}`,
          notes: ['Class inheritance should be converted to Playwright page object patterns']
        }
      });
    }

    return patterns;
  }

  private detectMultiLevelPatterns(content: string): InheritancePattern[] {
    const patterns: InheritancePattern[] = [];

    // Detect multi-level inheritance chains
    const chainRegex = /class (\w+) extends (\w+)[\s\S]*?class (\w+) extends \1/g;
    let match;

    while ((match = chainRegex.exec(content)) !== null) {
      const [, middleClass, baseClass, derivedClass] = match;

      patterns.push({
        type: 'multilevel',
        baseClass,
        derivedClasses: [middleClass, derivedClass],
        methods: this.extractMethods(content, derivedClass),
        properties: this.extractProperties(content, derivedClass),
        complexity: 'high',
        playwrightConversion: {
          strategy: 'Flatten multi-level inheritance to composition',
          code: `export class ${derivedClass} {
  private baseFunctionality: Base${baseClass};
  private middleFunctionality: ${middleClass}Mixin;

  constructor(page: Page) {
    this.baseFunctionality = new Base${baseClass}(page);
    this.middleFunctionality = new ${middleClass}Mixin(page);
  }
}`,
          notes: ['Multi-level inheritance should be flattened to composition for better maintainability']
        }
      });
    }

    return patterns;
  }

  private detectMixinPatterns(content: string): InheritancePattern[] {
    const patterns: InheritancePattern[] = [];

    // Look for mixin patterns (Object.assign, mixins)
    const mixinRegex = /Object\.assign\((\w+)\.prototype,\s*(\w+)/g;
    let match;

    while ((match = mixinRegex.exec(content)) !== null) {
      const [, targetClass, mixinClass] = match;

      patterns.push({
        type: 'mixin',
        baseClass: targetClass,
        derivedClasses: [mixinClass],
        methods: this.extractMethods(content, mixinClass),
        properties: [],
        complexity: 'high',
        playwrightConversion: {
          strategy: 'Convert mixins to composition pattern',
          code: `export class ${targetClass} {
  private ${mixinClass.toLowerCase()}: ${mixinClass};

  constructor(page: Page) {
    this.${mixinClass.toLowerCase()} = new ${mixinClass}(page);
  }

  // Mixin methods delegated to composed object
}`,
          notes: ['Mixins should be converted to composition pattern for better type safety']
        }
      });
    }

    return patterns;
  }

  private detectCompositionPatterns(content: string): InheritancePattern[] {
    const patterns: InheritancePattern[] = [];

    // Look for composition patterns
    const compositionRegex = /class (\w+)[\s\S]*?this\.(\w+)\s*=\s*new\s+(\w+)/g;
    let match;

    while ((match = compositionRegex.exec(content)) !== null) {
      const [, className, propertyName, composedClass] = match;

      patterns.push({
        type: 'composition',
        baseClass: className,
        derivedClasses: [composedClass],
        methods: this.extractMethods(content, className),
        properties: [propertyName],
        complexity: 'medium',
        playwrightConversion: {
          strategy: 'Convert to Playwright composition pattern',
          code: `export class ${className} {
  private ${propertyName}: ${composedClass};

  constructor(page: Page) {
    this.${propertyName} = new ${composedClass}(page);
  }
}`,
          notes: ['Composition patterns work well with Playwright page objects']
        }
      });
    }

    return patterns;
  }

  private detectStaticMethodPatterns(content: string): InheritancePattern[] {
    const patterns: InheritancePattern[] = [];

    // Look for static method patterns
    const staticRegex = /static\s+(\w+)\s*\([^)]*\)/g;
    let match;
    const staticMethods: string[] = [];

    while ((match = staticRegex.exec(content)) !== null) {
      staticMethods.push(match[1]);
    }

    if (staticMethods.length > 0) {
      patterns.push({
        type: 'static',
        baseClass: 'StaticUtilities',
        derivedClasses: [],
        methods: staticMethods,
        properties: [],
        complexity: 'low',
        playwrightConversion: {
          strategy: 'Convert to Playwright utility functions',
          code: `// Static methods converted to utility functions
export const TestUtils = {
  ${staticMethods.map(method => `async ${method}(page: Page) {
    // Implementation here
  }`).join(',\n  ')}
};`,
          notes: ['Static methods should be converted to utility functions that accept page parameter']
        }
      });
    }

    return patterns;
  }

  private detectGenericPatterns(content: string): InheritancePattern[] {
    const patterns: InheritancePattern[] = [];

    // Look for generic class patterns
    const genericRegex = /class (\w+)<(\w+)>/g;
    let match;

    while ((match = genericRegex.exec(content)) !== null) {
      const [, className, genericType] = match;

      patterns.push({
        type: 'generic',
        baseClass: className,
        derivedClasses: [],
        methods: this.extractMethods(content, className),
        properties: [],
        complexity: 'medium',
        playwrightConversion: {
          strategy: 'Convert to strongly-typed Playwright page object',
          code: `export class ${className}<T = any> {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // Generic methods with proper typing
}`,
          notes: ['Generic classes should maintain type safety in Playwright conversion']
        }
      });
    }

    return patterns;
  }

  private detectPropertyPatterns(content: string): InheritancePattern[] {
    const patterns: InheritancePattern[] = [];

    // Look for property descriptor patterns
    const descriptorRegex = /Object\.defineProperty\((\w+)(?:\.prototype)?,\s*['"'](\w+)['"']/g;
    let match;
    const properties: string[] = [];

    while ((match = descriptorRegex.exec(content)) !== null) {
      properties.push(match[2]);
    }

    if (properties.length > 0) {
      patterns.push({
        type: 'property',
        baseClass: 'PropertyDescriptor',
        derivedClasses: [],
        methods: [],
        properties,
        complexity: 'medium',
        playwrightConversion: {
          strategy: 'Convert property descriptors to getters/setters',
          code: `// Property descriptors converted to modern syntax
${properties.map(prop => `get ${prop}() {
  // Implementation here
}

set ${prop}(value: any) {
  // Implementation here
}`).join('\n\n')}`,
          notes: ['Property descriptors should be converted to modern getter/setter syntax']
        }
      });
    }

    return patterns;
  }

  private detectHybridPatterns(content: string): InheritancePattern[] {
    const patterns: InheritancePattern[] = [];

    // Look for hybrid inheritance + composition patterns
    const hybridRegex = /class (\w+) extends (\w+)[\s\S]*?this\.(\w+)\s*=\s*new\s+(\w+)/g;
    let match;

    while ((match = hybridRegex.exec(content)) !== null) {
      const [, className, baseClass, propertyName, composedClass] = match;

      patterns.push({
        type: 'hybrid',
        baseClass,
        derivedClasses: [className, composedClass],
        methods: this.extractMethods(content, className),
        properties: [propertyName],
        complexity: 'high',
        playwrightConversion: {
          strategy: 'Convert hybrid pattern to pure composition',
          code: `export class ${className} {
  private base: Base${baseClass};
  private ${propertyName}: ${composedClass};

  constructor(page: Page) {
    this.base = new Base${baseClass}(page);
    this.${propertyName} = new ${composedClass}(page);
  }
}`,
          notes: ['Hybrid inheritance/composition should be converted to pure composition']
        }
      });
    }

    return patterns;
  }

  private detectOverridePatterns(content: string): InheritancePattern[] {
    const patterns: InheritancePattern[] = [];

    // Look for method override patterns
    const overrideRegex = /class (\w+) extends (\w+)[\s\S]*?(\w+)\s*\([^)]*\)\s*\{[\s\S]*?super\.\3/g;
    let match;

    while ((match = overrideRegex.exec(content)) !== null) {
      const [, className, baseClass, methodName] = match;

      patterns.push({
        type: 'override',
        baseClass,
        derivedClasses: [className],
        methods: [methodName],
        properties: [],
        complexity: 'medium',
        playwrightConversion: {
          strategy: 'Convert method overrides to composition',
          code: `export class ${className} {
  private base: Base${baseClass};

  constructor(page: Page) {
    this.base = new Base${baseClass}(page);
  }

  async ${methodName}() {
    // Custom logic before base call
    await this.base.${methodName}();
    // Custom logic after base call
  }
}`,
          notes: ['Method overrides should be converted to composition with explicit delegation']
        }
      });
    }

    return patterns;
  }

  private extractMethods(content: string, className: string): string[] {
    const methods: string[] = [];
    const classMatch = content.match(new RegExp(`class ${className}[\\s\\S]*?\\{([\\s\\S]*?)\\n\\s*\\}`, 'g'));

    if (classMatch) {
      const classBody = classMatch[0];
      const methodRegex = /(\w+)\s*\([^)]*\)\s*\{/g;
      let match;

      while ((match = methodRegex.exec(classBody)) !== null) {
        if (match[1] !== 'constructor') {
          methods.push(match[1]);
        }
      }
    }

    return methods;
  }

  private extractProperties(content: string, className: string): string[] {
    const properties: string[] = [];
    const classMatch = content.match(new RegExp(`class ${className}[\\s\\S]*?\\{([\\s\\S]*?)\\n\\s*\\}`, 'g'));

    if (classMatch) {
      const classBody = classMatch[0];
      const propertyRegex = /(?:private|protected|public)?\s+(\w+):\s*\w+/g;
      let match;

      while ((match = propertyRegex.exec(classBody)) !== null) {
        properties.push(match[1]);
      }
    }

    return properties;
  }

  private findDerivedClasses(content: string, baseClass: string): string[] {
    const derived: string[] = [];
    const regex = new RegExp(`class (\\w+) extends ${baseClass}`, 'g');
    let match;

    while ((match = regex.exec(content)) !== null) {
      derived.push(match[1]);
    }

    return derived;
  }

  private calculateTotalComplexity(patterns: InheritancePattern[]): 'low' | 'medium' | 'high' {
    if (patterns.length === 0) return 'low';

    const highComplexity = patterns.filter(p => p.complexity === 'high').length;
    const mediumComplexity = patterns.filter(p => p.complexity === 'medium').length;

    if (highComplexity > 0 || patterns.length > 5) return 'high';
    if (mediumComplexity > 0 || patterns.length > 2) return 'medium';
    return 'low';
  }

  private generateRecommendations(patterns: InheritancePattern[]): string[] {
    const recommendations: string[] = [];

    patterns.forEach(pattern => {
      switch (pattern.type) {
        case 'abstract':
          recommendations.push('Convert abstract classes to Playwright base page classes');
          break;
        case 'multilevel':
          recommendations.push('Flatten multi-level inheritance to composition for better maintainability');
          break;
        case 'mixin':
          recommendations.push('Convert mixins to composition pattern for better type safety');
          break;
        case 'hybrid':
          recommendations.push('Simplify hybrid patterns to pure composition');
          break;
        default:
          recommendations.push(`Consider refactoring ${pattern.type} pattern for Playwright compatibility`);
      }
    });

    return [...new Set(recommendations)]; // Remove duplicates
  }
}