import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import { PageObjectAnalyzer } from '../src/services/page-object-analyzer';

// Mock file system operations
jest.mock('fs-extra');
const mockFs = fs as jest.Mocked<typeof fs>;
const mockReadFile = mockFs.readFile as jest.MockedFunction<typeof fs.readFile>;

describe('PageObjectAnalyzer - Inheritance Pattern Detection', () => {
  let analyzer: PageObjectAnalyzer;
  const testFilePath = '/test/inheritance-page.ts';

  beforeEach(() => {
    analyzer = new PageObjectAnalyzer();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Abstract Base Class Patterns', () => {
    test('should detect abstract base class with protected methods', async () => {
      const abstractPageContent = `abstract class BasePage {
  protected abstract getPageUrl(): string;
  protected abstract getPageTitle(): string;

  visit() {
    cy.visit(this.getPageUrl());
  }

  protected waitForLoad() {
    cy.get('[data-testid="spinner"]').should('not.exist');
  }

  verifyPageTitle() {
    cy.title().should('contain', this.getPageTitle());
  }
}`;

      mockReadFile.mockResolvedValue(abstractPageContent as any);

      const result = await analyzer.analyzePageObject(testFilePath);

      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('BasePage');
      expect(result.methods).toHaveLength(3);
      expect(result.methods.map(m => m.name)).toEqual(['visit', 'waitForLoad', 'verifyPageTitle']);
      expect(result.methods.some(m => m.body.includes('this.getPageUrl()'))).toBe(true);
      expect(result.methods.some(m => m.body.includes('this.getPageTitle()'))).toBe(true);
    });

    test('should detect inheritance chain with extends keyword', async () => {
      const inheritanceContent = `abstract class BasePage {
  protected abstract getPageUrl(): string;

  visit() {
    cy.visit(this.getPageUrl());
  }
}

class LoginPage extends BasePage {
  protected getPageUrl(): string {
    return '/login';
  }

  fillEmail(email: string) {
    cy.get('[data-testid="email"]').type(email);
  }

  fillPassword(password: string) {
    cy.get('[data-testid="password"]').type(password);
  }

  clickSubmit() {
    cy.get('[data-testid="submit"]').click();
  }
}`;

      mockReadFile.mockResolvedValue(inheritanceContent as any);

      const result = await analyzer.analyzePageObject(testFilePath);

      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('LoginPage'); // Should detect the concrete class
      expect(result.methods).toHaveLength(4);
      expect(result.methods.map(m => m.name)).toEqual(['getPageUrl', 'fillEmail', 'fillPassword', 'clickSubmit']);
    });

    test('should detect multiple inheritance levels', async () => {
      const multiLevelContent = `abstract class BasePage {
  visit() {
    cy.visit(this.getUrl());
  }
  abstract getUrl(): string;
}

abstract class FormPage extends BasePage {
  protected fillField(selector: string, value: string) {
    cy.get(selector).clear().type(value);
  }

  protected clickButton(selector: string) {
    cy.get(selector).click();
  }
}

class LoginFormPage extends FormPage {
  getUrl(): string {
    return '/login';
  }

  fillCredentials(email: string, password: string) {
    this.fillField('[data-testid="email"]', email);
    this.fillField('[data-testid="password"]', password);
  }

  submit() {
    this.clickButton('[data-testid="submit"]');
  }
}`;

      mockReadFile.mockResolvedValue(multiLevelContent as any);

      const result = await analyzer.analyzePageObject(testFilePath);

      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('LoginFormPage'); // Should detect the most concrete class
      expect(result.methods).toHaveLength(3);
      expect(result.methods.some(m => m.callsOtherMethods)).toBe(true);
      expect(result.methods.find(m => m.name === 'fillCredentials')?.calledMethods).toContain('fillField');
      expect(result.methods.find(m => m.name === 'submit')?.calledMethods).toContain('clickButton');
    });
  });

  describe('Mixin and Interface Patterns', () => {
    test('should detect mixin pattern with multiple concerns', async () => {
      const mixinContent = `interface Loggable {
  log(message: string): void;
}

interface Mockable {
  setupMocks(): Promise<void>;
}

class BasePage implements Loggable, Mockable {
  log(message: string): void {
    cy.log(message);
  }

  async setupMocks(): Promise<void> {
    cy.intercept('GET', '/api/data', { fixture: 'data.json' });
  }

  visit(url: string) {
    cy.visit(url);
  }
}

class LoginPage extends BasePage {
  visit() {
    super.visit('/login');
    this.log('Visiting login page');
  }

  fillForm(email: string, password: string) {
    cy.get('[data-testid="email"]').type(email);
    cy.get('[data-testid="password"]').type(password);
  }
}`;

      mockReadFile.mockResolvedValue(mixinContent as any);

      const result = await analyzer.analyzePageObject(testFilePath);

      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('LoginPage');
      expect(result.methods).toHaveLength(2);
      expect(result.methods.some(m => m.body.includes('super.visit'))).toBe(true);
      expect(result.methods.some(m => m.body.includes('this.log'))).toBe(true);
    });

    test('should detect composition over inheritance pattern', async () => {
      const compositionContent = `class NavigationHelper {
  goToHome() {
    cy.get('[data-testid="home-link"]').click();
  }

  goToProfile() {
    cy.get('[data-testid="profile-link"]').click();
  }
}

class FormHelper {
  fillInput(selector: string, value: string) {
    cy.get(selector).clear().type(value);
  }

  clickButton(selector: string) {
    cy.get(selector).click();
  }
}

class ComplexPage {
  private navigation = new NavigationHelper();
  private form = new FormHelper();

  visit() {
    cy.visit('/complex');
  }

  navigateToProfile() {
    this.navigation.goToProfile();
  }

  fillLoginForm(email: string, password: string) {
    this.form.fillInput('[data-testid="email"]', email);
    this.form.fillInput('[data-testid="password"]', password);
    this.form.clickButton('[data-testid="submit"]');
  }
}`;

      mockReadFile.mockResolvedValue(compositionContent as any);

      const result = await analyzer.analyzePageObject(testFilePath);

      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('ComplexPage');
      expect(result.properties).toHaveLength(2);
      expect(result.properties.map(p => p.name)).toEqual(['navigation', 'form']);
      expect(result.methods).toHaveLength(3);
      expect(result.methods.some(m => m.body.includes('this.navigation.'))).toBe(true);
      expect(result.methods.some(m => m.body.includes('this.form.'))).toBe(true);
    });
  });

  describe('Static Method and Utility Patterns', () => {
    test('should detect static utility methods', async () => {
      const staticMethodContent = `class PageUtilities {
  static waitForElementToDisappear(selector: string) {
    cy.get(selector).should('not.exist');
  }

  static waitForPageLoad() {
    cy.get('[data-testid="loading"]').should('not.exist');
    cy.get('body').should('be.visible');
  }

  visit() {
    cy.visit('/utilities');
    PageUtilities.waitForPageLoad();
  }

  performAction() {
    cy.get('[data-testid="action"]').click();
    PageUtilities.waitForElementToDisappear('[data-testid="modal"]');
  }
}`;

      mockReadFile.mockResolvedValue(staticMethodContent as any);

      const result = await analyzer.analyzePageObject(testFilePath);

      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('PageUtilities');
      expect(result.methods).toHaveLength(4);
      expect(result.methods.filter(m => m.name.startsWith('waitFor'))).toHaveLength(2);
      expect(result.methods.some(m => m.body.includes('PageUtilities.waitForPageLoad()'))).toBe(true);
      expect(result.methods.some(m => m.body.includes('PageUtilities.waitForElementToDisappear'))).toBe(true);
    });

    test('should detect generic type parameters', async () => {
      const genericContent = `interface PageData<T> {
  data: T;
}

class GenericPage<T> implements PageData<T> {
  data: T;

  constructor(data: T) {
    this.data = data;
  }

  visit() {
    cy.visit('/generic');
  }

  handleData(processor: (data: T) => void) {
    processor(this.data);
    cy.log('Data processed');
  }

  fillForm(formData: Partial<T>) {
    cy.get('[data-testid="form"]').within(() => {
      Object.keys(formData).forEach(key => {
        cy.get(\`[data-testid="\${key}"]\`).type(String(formData[key as keyof T]));
      });
    });
  }
}

class UserPage extends GenericPage<{name: string, email: string}> {
  fillUserForm(name: string, email: string) {
    this.fillForm({ name, email });
  }
}`;

      mockReadFile.mockResolvedValue(genericContent as any);

      const result = await analyzer.analyzePageObject(testFilePath);

      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('UserPage');
      expect(result.hasConstructor).toBe(false); // UserPage doesn't have explicit constructor
      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].name).toBe('fillUserForm');
      expect(result.methods[0].callsOtherMethods).toBe(true);
      expect(result.methods[0].calledMethods).toContain('fillForm');
    });
  });

  describe('Getter and Setter Patterns', () => {
    test('should detect ES6 getter and setter methods', async () => {
      const getterSetterContent = `class PropertyPage {
  private _currentUrl: string = '';
  private _isLoaded: boolean = false;

  visit() {
    cy.visit('/property');
  }

  get currentUrl(): string {
    cy.url().then(url => {
      this._currentUrl = url;
    });
    return this._currentUrl;
  }

  set searchTerm(term: string) {
    cy.get('[data-testid="search"]').clear().type(term);
  }

  get isPageLoaded(): boolean {
    cy.get('[data-testid="content"]').should('be.visible').then(() => {
      this._isLoaded = true;
    });
    return this._isLoaded;
  }

  get headerText() {
    return cy.get('[data-testid="header"]').invoke('text');
  }
}`;

      mockReadFile.mockResolvedValue(getterSetterContent as any);

      const result = await analyzer.analyzePageObject(testFilePath);

      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('PropertyPage');
      expect(result.properties).toHaveLength(2);
      expect(result.properties.map(p => p.name)).toEqual(['_currentUrl', '_isLoaded']);
      expect(result.methods).toHaveLength(5);
      expect(result.methods.map(m => m.name)).toEqual(['visit', 'currentUrl', 'searchTerm', 'isPageLoaded', 'headerText']);
    });

    test('should detect property descriptor patterns', async () => {
      const descriptorContent = `class DescriptorPage {
  visit() {
    cy.visit('/descriptor');
  }

  constructor() {
    Object.defineProperty(this, 'dynamicProperty', {
      get() {
        return cy.get('[data-testid="dynamic"]').invoke('text');
      },
      set(value: string) {
        cy.get('[data-testid="dynamic"]').clear().type(value);
      },
      enumerable: true,
      configurable: true
    });
  }

  setupDynamicMethods() {
    const methods = ['click', 'hover', 'focus'];
    methods.forEach(method => {
      Object.defineProperty(this, \`dynamic\${method.charAt(0).toUpperCase() + method.slice(1)}\`, {
        value: (selector: string) => {
          cy.get(selector)[\`\${method}\`]();
        },
        writable: false,
        enumerable: true
      });
    });
  }
}`;

      mockReadFile.mockResolvedValue(descriptorContent as any);

      const result = await analyzer.analyzePageObject(testFilePath);

      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('DescriptorPage');
      expect(result.hasConstructor).toBe(true);
      expect(result.methods).toHaveLength(2);
      expect(result.methods.map(m => m.name)).toEqual(['visit', 'setupDynamicMethods']);
      expect(result.methods.some(m => m.body.includes('Object.defineProperty'))).toBe(true);
    });
  });

  describe('Complex Edge Cases', () => {
    test('should handle class with both inheritance and composition', async () => {
      const hybridContent = `abstract class BaseFormPage {
  abstract getFormSelector(): string;

  protected submitForm() {
    cy.get(this.getFormSelector()).submit();
  }
}

class ValidationHelper {
  validateRequired(selector: string) {
    cy.get(selector).should('have.attr', 'required');
  }
}

class AdvancedLoginPage extends BaseFormPage {
  private validator = new ValidationHelper();

  getFormSelector(): string {
    return '[data-testid="login-form"]';
  }

  visit() {
    cy.visit('/advanced-login');
  }

  validateForm() {
    this.validator.validateRequired('[data-testid="email"]');
    this.validator.validateRequired('[data-testid="password"]');
  }

  login(email: string, password: string) {
    cy.get('[data-testid="email"]').type(email);
    cy.get('[data-testid="password"]').type(password);
    this.submitForm();
  }
}`;

      mockReadFile.mockResolvedValue(hybridContent as any);

      const result = await analyzer.analyzePageObject(testFilePath);

      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('AdvancedLoginPage');
      expect(result.properties).toHaveLength(1);
      expect(result.properties[0].name).toBe('validator');
      expect(result.methods).toHaveLength(4);
      expect(result.methods.some(m => m.callsOtherMethods && m.calledMethods.includes('submitForm'))).toBe(true);
      expect(result.methods.some(m => m.body.includes('this.validator.'))).toBe(true);
    });

    test('should detect method overriding patterns', async () => {
      const overrideContent = `class BasePage {
  visit() {
    cy.visit('/base');
    this.waitForLoad();
  }

  protected waitForLoad() {
    cy.get('[data-testid="loader"]').should('not.exist');
  }

  protected performPostVisitActions() {
    // Base implementation
    cy.log('Base post-visit actions');
  }
}

class SpecializedPage extends BasePage {
  visit() {
    super.visit();
    this.performPostVisitActions();
    cy.get('[data-testid="special-element"]').should('be.visible');
  }

  protected waitForLoad() {
    // Override with specialized loading
    super.waitForLoad();
    cy.get('[data-testid="special-loader"]').should('not.exist');
    cy.wait(1000); // Additional wait for special page
  }

  protected performPostVisitActions() {
    super.performPostVisitActions();
    cy.get('[data-testid="analytics"]').click();
  }
}`;

      mockReadFile.mockResolvedValue(overrideContent as any);

      const result = await analyzer.analyzePageObject(testFilePath);

      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('SpecializedPage');
      expect(result.methods).toHaveLength(3);
      expect(result.methods.every(m => m.body.includes('super.'))).toBe(true);
      expect(result.methods.some(m => m.conversionComplexity === 'high')).toBe(true);
    });
  });
});