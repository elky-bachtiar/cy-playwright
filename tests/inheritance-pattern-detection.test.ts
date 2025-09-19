import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { InheritancePatternDetector, InheritancePattern } from '../src/services/inheritance-pattern-detector';
import * as fs from 'fs-extra';

// Mock fs-extra
jest.mock('fs-extra');
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

describe('InheritancePatternDetector', () => {
  let detector: InheritancePatternDetector;

  beforeEach(() => {
    detector = new InheritancePatternDetector();
    jest.clearAllMocks();
  });

  describe('Abstract Class Detection', () => {
    test('should detect abstract class patterns', async () => {
      // Arrange
      const abstractPageContent = `
        abstract class BasePage {
          protected page: any;

          constructor(page: any) {
            this.page = page;
          }

          abstract navigate(): void;

          protected waitForElement(selector: string) {
            return this.page.waitForSelector(selector);
          }
        }

        class LoginPage extends BasePage {
          navigate() {
            return this.page.goto('/login');
          }
        }
      `;

      mockReadFile.mockResolvedValue(abstractPageContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.patterns).toHaveLength(2); // Abstract + inheritance

      const abstractPattern = result.patterns.find(p => p.type === 'abstract');
      expect(abstractPattern).toBeDefined();
      expect(abstractPattern?.baseClass).toBe('BasePage');
      expect(abstractPattern?.methods).toContain('waitForElement');
      expect(abstractPattern?.complexity).toBe('medium');
      expect(abstractPattern?.playwrightConversion.strategy).toContain('Convert to Playwright base page class');
    });
  });

  describe('Simple Inheritance Detection', () => {
    test('should detect basic inheritance patterns', async () => {
      // Arrange
      const inheritanceContent = `
        class BasePage {
          constructor(page) {
            this.page = page;
          }

          async clickButton(selector) {
            await this.page.click(selector);
          }
        }

        class LoginPage extends BasePage {
          async login(username, password) {
            await this.clickButton('#login-btn');
          }
        }
      `;

      mockReadFile.mockResolvedValue(inheritanceContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.patterns).toHaveLength(1);

      const pattern = result.patterns[0];
      expect(pattern.type).toBe('inheritance');
      expect(pattern.baseClass).toBe('BasePage');
      expect(pattern.derivedClasses).toContain('LoginPage');
      expect(pattern.methods).toContain('login');
      expect(pattern.complexity).toBe('medium');
    });
  });

  describe('Multi-level Inheritance Detection', () => {
    test('should detect multi-level inheritance chains', async () => {
      // Arrange
      const multiLevelContent = `
        class BasePage {
          constructor(page) { this.page = page; }
        }

        class FormPage extends BasePage {
          async fillForm() { /* implementation */ }
        }

        class LoginFormPage extends FormPage {
          async submitLogin() { /* implementation */ }
        }
      `;

      mockReadFile.mockResolvedValue(multiLevelContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.patterns).toHaveLength(2); // Two inheritance relationships

      const patterns = result.patterns.filter(p => p.type === 'inheritance');
      expect(patterns).toHaveLength(2);
      expect(patterns.some(p => p.baseClass === 'BasePage' && p.derivedClasses.includes('FormPage'))).toBe(true);
      expect(patterns.some(p => p.baseClass === 'FormPage' && p.derivedClasses.includes('LoginFormPage'))).toBe(true);
    });
  });

  describe('Mixin Pattern Detection', () => {
    test('should detect mixin patterns', async () => {
      // Arrange
      const mixinContent = `
        class BasePage {
          constructor(page) { this.page = page; }
        }

        const ClickableMixin = {
          click: function(selector) {
            return this.page.click(selector);
          }
        };

        Object.assign(BasePage.prototype, ClickableMixin);
      `;

      mockReadFile.mockResolvedValue(mixinContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.patterns).toHaveLength(1);

      const pattern = result.patterns[0];
      expect(pattern.type).toBe('mixin');
      expect(pattern.baseClass).toBe('BasePage');
      expect(pattern.derivedClasses).toContain('ClickableMixin');
      expect(pattern.complexity).toBe('high');
      expect(pattern.playwrightConversion.strategy).toContain('Convert mixins to composition pattern');
    });
  });

  describe('Composition Pattern Detection', () => {
    test('should detect composition patterns', async () => {
      // Arrange
      const compositionContent = `
        class LoginPage {
          constructor(page) {
            this.page = page;
            this.formHelper = new FormHelper(page);
            this.navigationHelper = new NavigationHelper(page);
          }

          async login(username, password) {
            await this.formHelper.fillForm({ username, password });
            await this.navigationHelper.goTo('/dashboard');
          }
        }

        class FormHelper {
          constructor(page) { this.page = page; }
          async fillForm(data) { /* implementation */ }
        }
      `;

      mockReadFile.mockResolvedValue(compositionContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.patterns).toHaveLength(2); // Two composition relationships

      const patterns = result.patterns.filter(p => p.type === 'composition');
      expect(patterns).toHaveLength(2);
      expect(patterns.some(p => p.derivedClasses.includes('FormHelper'))).toBe(true);
      expect(patterns.some(p => p.derivedClasses.includes('NavigationHelper'))).toBe(true);
    });
  });

  describe('Static Method Detection', () => {
    test('should detect static method patterns', async () => {
      // Arrange
      const staticMethodContent = `
        class TestUtils {
          static async waitForCondition(condition, timeout = 5000) {
            // implementation
          }

          static generateTestData() {
            return { id: Math.random() };
          }

          static async cleanup() {
            // cleanup implementation
          }
        }
      `;

      mockReadFile.mockResolvedValue(staticMethodContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.patterns).toHaveLength(1);

      const pattern = result.patterns[0];
      expect(pattern.type).toBe('static');
      expect(pattern.baseClass).toBe('StaticUtilities');
      expect(pattern.methods).toContain('waitForCondition');
      expect(pattern.methods).toContain('generateTestData');
      expect(pattern.methods).toContain('cleanup');
      expect(pattern.complexity).toBe('low');
    });
  });

  describe('Generic Class Detection', () => {
    test('should detect generic class patterns', async () => {
      // Arrange
      const genericContent = `
        class Repository<T> {
          private items: T[] = [];

          constructor(private page: any) {}

          async add(item: T): Promise<void> {
            this.items.push(item);
          }

          async findById(id: string): Promise<T | undefined> {
            return this.items.find(item => (item as any).id === id);
          }
        }

        interface User {
          id: string;
          name: string;
        }

        const userRepo = new Repository<User>(page);
      `;

      mockReadFile.mockResolvedValue(genericContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.patterns).toHaveLength(1);

      const pattern = result.patterns[0];
      expect(pattern.type).toBe('generic');
      expect(pattern.baseClass).toBe('Repository');
      expect(pattern.methods).toContain('add');
      expect(pattern.methods).toContain('findById');
      expect(pattern.complexity).toBe('medium');
    });
  });

  describe('Property Descriptor Detection', () => {
    test('should detect property descriptor patterns', async () => {
      // Arrange
      const getterSetterContent = `
        class PageObject {
          constructor(page) {
            this.page = page;
          }
        }

        Object.defineProperty(PageObject.prototype, 'title', {
          get: function() {
            return this.page.title();
          }
        });

        Object.defineProperty(PageObject.prototype, 'url', {
          get: function() {
            return this.page.url();
          }
        });
      `;

      mockReadFile.mockResolvedValue(getterSetterContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.patterns).toHaveLength(1);

      const pattern = result.patterns[0];
      expect(pattern.type).toBe('property');
      expect(pattern.baseClass).toBe('PropertyDescriptor');
      expect(pattern.properties).toContain('title');
      expect(pattern.properties).toContain('url');
      expect(pattern.complexity).toBe('medium');
    });
  });

  describe('Hybrid Pattern Detection', () => {
    test('should detect hybrid inheritance and composition patterns', async () => {
      // Arrange
      const hybridContent = `
        class BasePage {
          constructor(page) { this.page = page; }
          async navigate() { /* implementation */ }
        }

        class LoginPage extends BasePage {
          constructor(page) {
            super(page);
            this.validator = new FormValidator(page);
            this.logger = new Logger();
          }

          async login(credentials) {
            await this.validator.validate(credentials);
            await super.navigate();
          }
        }
      `;

      mockReadFile.mockResolvedValue(hybridContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.patterns).toHaveLength(3); // inheritance + 2 composition

      const hybridPattern = result.patterns.find(p => p.type === 'hybrid');
      expect(hybridPattern).toBeDefined();
      expect(hybridPattern?.baseClass).toBe('BasePage');
      expect(hybridPattern?.derivedClasses).toContain('LoginPage');
      expect(hybridPattern?.complexity).toBe('high');
    });
  });

  describe('Method Override Detection', () => {
    test('should detect method override patterns', async () => {
      // Arrange
      const overrideContent = `
        class BasePage {
          async navigate() {
            await this.page.goto('/');
          }
        }

        class LoginPage extends BasePage {
          async navigate() {
            console.log('Navigating to login page');
            await super.navigate();
            await this.page.goto('/login');
          }
        }
      `;

      mockReadFile.mockResolvedValue(overrideContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.patterns).toHaveLength(2); // inheritance + override

      const overridePattern = result.patterns.find(p => p.type === 'override');
      expect(overridePattern).toBeDefined();
      expect(overridePattern?.methods).toContain('navigate');
      expect(overridePattern?.complexity).toBe('medium');
    });
  });

  describe('Complex Analysis', () => {
    test('should calculate total complexity correctly', async () => {
      // Arrange
      const complexContent = `
        abstract class BasePage {
          abstract navigate(): void;
        }

        class LoginPage extends BasePage {
          constructor(page) {
            super();
            this.helper = new Helper(page);
          }

          navigate() {
            super.navigate();
          }
        }

        Object.assign(LoginPage.prototype, SomeMixin);
      `;

      mockReadFile.mockResolvedValue(complexContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.totalComplexity).toBe('high');
      expect(result.requiresManualReview).toBe(true);
      expect(result.conversionRecommendations).toContain('Convert abstract classes to Playwright base page classes');
    });

    test('should provide comprehensive conversion recommendations', async () => {
      // Arrange
      const complexContent = `
        abstract class BasePage { abstract test(): void; }
        class Child extends BasePage { test() {} }
        class GrandChild extends Child { }
        Object.assign(Child.prototype, Mixin);
      `;

      mockReadFile.mockResolvedValue(complexContent);

      // Act
      const result = await detector.analyzeInheritancePatterns('/test/file.ts');

      // Assert
      expect(result.conversionRecommendations).toContain('Convert abstract classes to Playwright base page classes');
      expect(result.conversionRecommendations).toContain('Convert mixins to composition pattern for better type safety');
      expect(result.requiresManualReview).toBe(true);
    });
  });
});