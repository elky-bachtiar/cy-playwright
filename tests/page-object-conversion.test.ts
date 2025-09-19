import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { PageObjectAnalyzer } from '../src/services/page-object-analyzer';
import { PageObjectTransformer } from '../src/services/page-object-transformer';

// Mock file system operations
jest.mock('fs-extra');
const mockFs = fs as jest.Mocked<typeof fs>;
const mockReadFile = mockFs.readFile as jest.MockedFunction<typeof fs.readFile>;

describe('PageObjectAnalyzer', () => {
  let analyzer: PageObjectAnalyzer;
  const testFilePath = '/test/page.ts';

  beforeEach(() => {
    analyzer = new PageObjectAnalyzer();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Cypress Page Object Detection', () => {
    test('should identify simple Cypress page object class patterns', async () => {
      // Arrange - Simple login page pattern
      const pageObjectContent = `class CyLoginPage {
  visit() {
    cy.visit('/login');
  }

  fillEmail(email: string) {
    cy.get('[data-testid="input-emailadres"]').type(email);
  }

  clickLoginBtn() {
    cy.get('[data-testid="btn-login"]').click();
  }
}

export default CyLoginPage;`;

      mockReadFile.mockResolvedValue(pageObjectContent as any);

      // Act
      const result = await analyzer.analyzePageObject(testFilePath);

      // Assert
      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('CyLoginPage');
      expect(result.exportType).toBe('default');
      expect(result.methods).toHaveLength(3);
      expect(result.methods.map(m => m.name)).toEqual(['visit', 'fillEmail', 'clickLoginBtn']);
    });

    test('should identify complex page object with imports and mocking', async () => {
      // Arrange - Complex boeken page pattern
      const complexPageContent = `import {StubMapping} from "wiremock-rest-client/dist/model/stub-mapping.model";
import {MockUtil} from "@sta/wiremock-generator-ts";

class CyBoekenPage {
  boekenPage: string = 'boekenPage: string;'

  visit() {
    cy.visit('/boeken');
    cy.get('[data-testid="dd-sorteer"]').should('be.visible');
  }

  filterOpICTBoeken() {
    cy.get('[data-testid="cb-ICT"]').check();
  }

  async setupInitialMocks(): Promise<void> {
    await MockUtil.createAndStoreMapping(stub, this.boekenPage, WireMockMappingClient);
  }
}

export default CyBoekenPage;`;

      mockReadFile.mockResolvedValue(complexPageContent as any);

      // Act
      const result = await analyzer.analyzePageObject(testFilePath);

      // Assert
      expect(result.isPageObject).toBe(true);
      expect(result.className).toBe('CyBoekenPage');
      expect(result.hasImports).toBe(true);
      expect(result.imports).toHaveLength(2);
      expect(result.methods).toHaveLength(3);
      expect(result.hasMockingMethods).toBe(true);
      expect(result.properties).toHaveLength(1);
      expect(result.properties[0].name).toBe('boekenPage');
    });

    test('should detect different export patterns', async () => {
      const testCases = [
        {
          content: `class LoginPage {}\nexport default LoginPage;`,
          expectedExport: 'default'
        },
        {
          content: `export class LoginPage {}`,
          expectedExport: 'named'
        },
        {
          content: `class LoginPage {}\nexport { LoginPage };`,
          expectedExport: 'named'
        }
      ];

      for (const testCase of testCases) {
        mockReadFile.mockResolvedValue(testCase.content as any);

        const result = await analyzer.analyzePageObject(testFilePath);

        expect(result.exportType).toBe(testCase.expectedExport);
      }
    });
  });

  describe('Method Signature Extraction', () => {
    test('should extract visit method patterns', async () => {
      // Arrange
      const pageContent = `class TestPage {
  visit() {
    cy.visit('/test');
  }

  visitWithParams(params: any) {
    cy.visit('/test', params);
  }

  goto(url: string) {
    cy.visit(url);
  }
}`;

      mockReadFile.mockResolvedValue(pageContent as any);

      // Act
      const result = await analyzer.analyzePageObject(testFilePath);

      // Assert
      const visitMethods = result.methods.filter(m => m.isVisitMethod);
      expect(visitMethods).toHaveLength(3);
      expect(visitMethods.map(m => m.name)).toEqual(['visit', 'visitWithParams', 'goto']);

      // Check visit method details
      const simpleVisit = visitMethods.find(m => m.name === 'visit');
      expect(simpleVisit?.cypressCommands).toContain('cy.visit');
      expect(simpleVisit?.parameters).toHaveLength(0);
    });

    test('should extract input method patterns (fillEmail, type, etc.)', async () => {
      // Arrange
      const pageContent = `class TestPage {
  fillEmail(email: string) {
    cy.get('[data-testid="input-emailadres"]').type(email);
  }

  fillPwd(pwd: string) {
    cy.get('[data-testid="input-password"]').type(pwd);
  }

  enterText(selector: string, text: string) {
    cy.get(selector).clear().type(text);
  }

  selectOption(value: string) {
    cy.get('[data-testid="dropdown"]').select(value);
  }
}`;

      mockReadFile.mockResolvedValue(pageContent as any);

      // Act
      const result = await analyzer.analyzePageObject(testFilePath);

      // Assert
      const inputMethods = result.methods.filter(m => m.isInputMethod);
      expect(inputMethods).toHaveLength(4);

      const fillEmail = inputMethods.find(m => m.name === 'fillEmail');
      expect(fillEmail?.cypressCommands).toContain('cy.get');
      expect(fillEmail?.cypressCommands).toContain('.type');
      expect(fillEmail?.parameters).toHaveLength(1);
      expect(fillEmail?.parameters[0]).toEqual({ name: 'email', type: 'string' });
    });

    test('should extract click method patterns', async () => {
      // Arrange
      const pageContent = `class TestPage {
  clickLoginBtn() {
    cy.get('[data-testid="btn-login"]').click();
  }

  clickElement(selector: string) {
    cy.get(selector).click();
  }

  submitForm() {
    cy.get('form').submit();
  }

  doubleClickBtn() {
    cy.get('.btn').dblclick();
  }
}`;

      mockReadFile.mockResolvedValue(pageContent as any);

      // Act
      const result = await analyzer.analyzePageObject(testFilePath);

      // Assert
      const clickMethods = result.methods.filter(m => m.isClickMethod);
      expect(clickMethods).toHaveLength(4);

      const clickLogin = clickMethods.find(m => m.name === 'clickLoginBtn');
      expect(clickLogin?.cypressCommands).toContain('cy.get');
      expect(clickLogin?.cypressCommands).toContain('.click');
    });

    test('should extract composite method patterns (calling other methods)', async () => {
      // Arrange
      const pageContent = `class TestPage {
  fillEmail(email: string) {
    cy.get('[data-testid="input-emailadres"]').type(email);
  }

  fillPwd(pwd: string) {
    cy.get('[data-testid="input-password"]').type(pwd);
  }

  clickLoginBtn() {
    cy.get('[data-testid="btn-login"]').click();
  }

  fillLogin(emailadres: string, password: string) {
    this.fillEmail(emailadres);
    this.fillPwd(password);
    this.clickLoginBtn();
  }

  performLogin(credentials: {email: string, password: string}) {
    this.fillLogin(credentials.email, credentials.password);
  }
}`;

      mockReadFile.mockResolvedValue(pageContent as any);

      // Act
      const result = await analyzer.analyzePageObject(testFilePath);

      // Assert
      const compositeMethods = result.methods.filter(m => m.isCompositeMethod);
      expect(compositeMethods).toHaveLength(2);

      const fillLogin = compositeMethods.find(m => m.name === 'fillLogin');
      expect(fillLogin?.callsOtherMethods).toBe(true);
      expect(fillLogin?.calledMethods).toEqual(['fillEmail', 'fillPwd', 'clickLoginBtn']);
    });
  });

  describe('Cypress Command Detection', () => {
    test('should detect cy.get(), cy.visit(), cy.type(), cy.click() usage', async () => {
      // Arrange
      const pageContent = `class TestPage {
  complexMethod() {
    cy.visit('/test');
    cy.get('[data-testid="input"]').clear().type('test').should('have.value', 'test');
    cy.get('[data-testid="btn"]').click({force: true});
    cy.get('[data-testid="dropdown"]').select('option1');
    cy.get('[data-testid="checkbox"]').check();
    cy.contains('Submit').click();
    cy.wait(1000);
    cy.intercept('GET', '/api/test').as('testApi');
  }
}`;

      mockReadFile.mockResolvedValue(pageContent as any);

      // Act
      const result = await analyzer.analyzePageObject(testFilePath);

      // Assert
      const method = result.methods[0];
      expect(method.cypressCommands).toContain('cy.visit');
      expect(method.cypressCommands).toContain('cy.get');
      expect(method.cypressCommands).toContain('.type');
      expect(method.cypressCommands).toContain('.click');
      expect(method.cypressCommands).toContain('.select');
      expect(method.cypressCommands).toContain('.check');
      expect(method.cypressCommands).toContain('cy.contains');
      expect(method.cypressCommands).toContain('cy.wait');
      expect(method.cypressCommands).toContain('cy.intercept');

      expect(method.conversionComplexity).toBe('high');
    });

    test('should categorize method complexity based on Cypress usage', async () => {
      const testCases = [
        {
          content: `visit() { cy.visit('/'); }`,
          expectedComplexity: 'low'
        },
        {
          content: `fillForm() { cy.get('input').type('text'); }`,
          expectedComplexity: 'medium'
        },
        {
          content: `complexFlow() {
            cy.intercept('GET', '/api').as('api');
            cy.get('input').type('text').should('be.visible');
            cy.wait('@api').then((response) => {
              cy.get('.result').should('contain', response.body.data);
            });
          }`,
          expectedComplexity: 'high'
        }
      ];

      for (const testCase of testCases) {
        const pageContent = `class TestPage { ${testCase.content} }`;
        mockReadFile.mockResolvedValue(pageContent as any);

        const result = await analyzer.analyzePageObject(testFilePath);
        expect(result.methods[0].conversionComplexity).toBe(testCase.expectedComplexity);
      }
    });
  });
});

describe('PageObjectTransformer', () => {
  let transformer: PageObjectTransformer;

  beforeEach(() => {
    transformer = new PageObjectTransformer();
    jest.clearAllMocks();
  });

  describe('Playwright Page Object Generation', () => {
    test('should convert cy.visit() to page.goto() in visit methods', () => {
      // Arrange
      const cypressMethod = {
        name: 'visit',
        body: "cy.visit('/login');",
        isVisitMethod: true,
        cypressCommands: ['cy.visit'],
        parameters: []
      };

      // Act
      const result = transformer.convertVisitMethod(cypressMethod);

      // Assert
      expect(result.body).toBe("await page.goto('/login');");
      expect(result.isAsync).toBe(true);
      expect(result.requiresPage).toBe(true);
    });

    test('should convert cy.get().type() to page.locator().fill()', () => {
      // Arrange
      const cypressMethod = {
        name: 'fillEmail',
        body: `cy.get('[data-testid="input-emailadres"]').type(email);`,
        isInputMethod: true,
        cypressCommands: ['cy.get', '.type'],
        parameters: [{ name: 'email', type: 'string' }]
      };

      // Act
      const result = transformer.convertInputMethod(cypressMethod);

      // Assert
      expect(result.body).toBe(`await page.locator('[data-testid="input-emailadres"]').fill(email);`);
      expect(result.isAsync).toBe(true);
      expect(result.requiresPage).toBe(true);
    });

    test('should convert cy.get().click() to page.locator().click()', () => {
      // Arrange
      const cypressMethod = {
        name: 'clickLoginBtn',
        body: `cy.get('[data-testid="btn-login"]').click();`,
        isClickMethod: true,
        cypressCommands: ['cy.get', '.click'],
        parameters: []
      };

      // Act
      const result = transformer.convertClickMethod(cypressMethod);

      // Assert
      expect(result.body).toBe(`await page.locator('[data-testid="btn-login"]').click();`);
      expect(result.isAsync).toBe(true);
      expect(result.requiresPage).toBe(true);
    });

    test('should preserve method chaining in composite methods', () => {
      // Arrange
      const cypressMethod = {
        name: 'fillLogin',
        body: `this.fillEmail(emailadres);
    this.fillPwd(password);
    this.clickLoginBtn();`,
        isCompositeMethod: true,
        callsOtherMethods: true,
        calledMethods: ['fillEmail', 'fillPwd', 'clickLoginBtn'],
        parameters: [
          { name: 'emailadres', type: 'string' },
          { name: 'password', type: 'string' }
        ]
      };

      // Act
      const result = transformer.convertCompositeMethod(cypressMethod);

      // Assert
      expect(result.body).toBe(`await this.fillEmail(emailadres);
    await this.fillPwd(password);
    await this.clickLoginBtn();`);
      expect(result.isAsync).toBe(true);
      expect(result.requiresPage).toBe(true);
    });

    test('should inject page parameter into class constructor', () => {
      // Arrange
      const pageObjectInfo = {
        className: 'CyLoginPage',
        hasConstructor: false,
        properties: [],
        methods: []
      };

      // Act
      const result = transformer.injectPageParameter(pageObjectInfo);

      // Assert
      expect(result.modifiedClass).toContain('constructor(private page: Page)');
      expect(result.hasPageParameter).toBe(true);
      expect(result.needsPlaywrightImport).toBe(true);
    });

    test('should convert class methods to async with await statements', () => {
      // Arrange
      const pageObjectInfo = {
        className: 'LoginPage',
        methods: [
          {
            name: 'visit',
            body: "cy.visit('/login');",
            isAsync: false,
            requiresPage: true
          },
          {
            name: 'fillEmail',
            body: `cy.get('[data-testid="input"]').type(email);`,
            isAsync: false,
            requiresPage: true,
            parameters: [{ name: 'email', type: 'string' }]
          }
        ]
      };

      // Act
      const result = transformer.convertToAsyncMethods(pageObjectInfo);

      // Assert
      expect(result.methods[0].signature).toBe('async visit()');
      expect(result.methods[1].signature).toBe('async fillEmail(email: string)');
      expect(result.allMethodsAsync).toBe(true);
    });
  });

  describe('Page Object Integration', () => {
    test('should generate complete Playwright page object class', () => {
      // Arrange
      const cypressPageObject = {
        isPageObject: true,
        className: 'CyLoginPage',
        exportType: 'default' as const,
        hasImports: false,
        imports: [],
        hasConstructor: false,
        constructorParameters: [],
        properties: [],
        methods: [
          {
            name: 'visit',
            signature: 'visit()',
            body: "cy.visit('/login');",
            isVisitMethod: true,
            isInputMethod: false,
            isClickMethod: false,
            isCompositeMethod: false,
            callsOtherMethods: false,
            calledMethods: [],
            cypressCommands: ['cy.visit'],
            conversionComplexity: 'low' as const,
            parameters: [],
            isAsync: false,
            requiresPage: false,
            isStatic: false,
            isGetter: false,
            isSetter: false,
            isAbstract: false,
            callsSuper: false
          },
          {
            name: 'fillEmail',
            signature: 'fillEmail(email: string)',
            body: `cy.get('[data-testid="input-emailadres"]').type(email);`,
            isVisitMethod: false,
            isInputMethod: true,
            isClickMethod: false,
            isCompositeMethod: false,
            callsOtherMethods: false,
            calledMethods: [],
            cypressCommands: ['cy.get', '.type'],
            conversionComplexity: 'medium' as const,
            parameters: [{ name: 'email', type: 'string' }],
            isAsync: false,
            requiresPage: false,
            isStatic: false,
            isGetter: false,
            isSetter: false,
            isAbstract: false,
            callsSuper: false
          },
          {
            name: 'clickLoginBtn',
            signature: 'clickLoginBtn()',
            body: `cy.get('[data-testid="btn-login"]').click();`,
            isVisitMethod: false,
            isInputMethod: false,
            isClickMethod: true,
            isCompositeMethod: false,
            callsOtherMethods: false,
            calledMethods: [],
            cypressCommands: ['cy.get', '.click'],
            conversionComplexity: 'medium' as const,
            parameters: [],
            isAsync: false,
            requiresPage: false,
            isStatic: false,
            isGetter: false,
            isSetter: false,
            isAbstract: false,
            callsSuper: false
          }
        ],
        hasMockingMethods: false,
        hasComplexLogic: false,
        conversionDifficulty: 'easy' as const,
        inheritanceInfo: {
          hasInheritance: false,
          inheritanceChain: [],
          implementsInterfaces: [],
          isAbstract: false,
          hasSuper: false
        },
        compositionInfo: {
          hasComposition: false,
          composedObjects: [],
          circularReferences: []
        },
        edgeCaseInfo: {
          hasDynamicMethods: false,
          dynamicMethodPatterns: [],
          hasStaticMethods: false,
          staticMethods: [],
          hasGettersSetters: false,
          getterSetterMethods: [],
          hasGenericTypes: false,
          genericTypeParameters: [],
          usesObjectDefineProperty: false
        }
      };

      // Act
      const result = transformer.generatePlaywrightPageObject(cypressPageObject);

      // Assert
      expect(result.generatedCode).toContain('import { Page } from \'@playwright/test\';');
      expect(result.generatedCode).toContain('class CyLoginPage {');
      expect(result.generatedCode).toContain('constructor(private page: Page)');
      expect(result.generatedCode).toContain('async visit()');
      expect(result.generatedCode).toContain('await page.goto(\'/login\');');
      expect(result.generatedCode).toContain('async fillEmail(email: string)');
      expect(result.generatedCode).toContain('await page.locator(\'[data-testid="input-emailadres"]\').fill(email);');
      expect(result.generatedCode).toContain('export default CyLoginPage;');
      expect(result.isValid).toBe(true);
    });
  });
});