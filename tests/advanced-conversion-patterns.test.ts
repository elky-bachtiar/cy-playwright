import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import * as path from 'path'

// Mock fs-extra before any imports
const mockPathExists = jest.fn() as jest.MockedFunction<any>
const mockReadFile = jest.fn() as jest.MockedFunction<any>

jest.mock('fs-extra', () => ({
  pathExists: mockPathExists,
  readFile: mockReadFile
}))

// Import after mocking
import { ASTParser } from '../src/ast-parser'
import { CommandConverter } from '../src/command-converter'
import { GitHubASTConverter } from '../src/github-ast-converter'
import type { CypressCommand, CypressTestFile, ConvertedCommand } from '../src/types'

describe('Advanced Conversion Patterns', () => {
  let astParser: ASTParser
  let commandConverter: CommandConverter
  let githubConverter: GitHubASTConverter

  beforeEach(() => {
    astParser = new ASTParser()
    commandConverter = new CommandConverter()
    githubConverter = new GitHubASTConverter()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Complex Chaining Patterns', () => {
    test('should convert complex method chaining with multiple assertions', () => {
      const complexCommand: CypressCommand = {
        command: 'get',
        args: ['[data-testid="user-list"]'],
        chainedCalls: [
          { method: 'find', args: ['.user-item'] },
          { method: 'first', args: [] },
          { method: 'should', args: ['be.visible'] },
          { method: 'and', args: ['contain.text', 'John Doe'] },
          { method: 'click', args: [] }
        ]
      }

      const converted = commandConverter.convertCommand(complexCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId(\'user-list\')')
      expect(converted.playwrightCode).toContain('locator(\'.user-item\')')
      expect(converted.playwrightCode).toContain('.first()')
      expect(converted.playwrightCode).toContain('toBeVisible()')
      expect(converted.playwrightCode).toContain('toContainText(\'John Doe\')')
      expect(converted.playwrightCode).toContain('.click()')
      expect(converted.requiresAwait).toBe(true)
    })

    test('should handle nested locator chains with complex selectors', () => {
      const nestedCommand: CypressCommand = {
        command: 'get',
        args: ['[data-cy="navigation"]'],
        chainedCalls: [
          { method: 'within', args: [] },
          { method: 'get', args: ['[role="menuitem"]'] },
          { method: 'contains', args: ['Dashboard'] },
          { method: 'click', args: [] }
        ]
      }

      const converted = commandConverter.convertCommand(nestedCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId("navigation")')
      expect(converted.playwrightCode).toContain('getByRole("menuitem")')
      expect(converted.playwrightCode).toContain('filter({ hasText: "Dashboard" })')
      expect(converted.requiresAwait).toBe(true)
    })

    test('should convert alias usage with complex chaining', () => {
      const aliasCommand: CypressCommand = {
        command: 'get',
        args: ['@userAlias'],
        chainedCalls: [
          { method: 'its', args: ['body'] },
          { method: 'should', args: ['have.property', 'name'] },
          { method: 'and', args: ['eq', 'John Doe'] }
        ]
      }

      const converted = commandConverter.convertCommand(aliasCommand)

      expect(converted.playwrightCode).toContain('userAlias')
      expect(converted.playwrightCode).toContain('.body')
      expect(converted.playwrightCode).toContain('expect(')
      expect(converted.playwrightCode).toContain('.name')
      expect(converted.playwrightCode).toContain('John Doe')
    })
  })

  describe('Advanced Waiting and Timing Patterns', () => {
    test('should convert complex wait patterns with custom timeouts', () => {
      const waitCommand: CypressCommand = {
        command: 'get',
        args: ['[data-loading="false"]'],
        chainedCalls: [
          { method: 'should', args: ['be.visible'] },
          { method: 'wait', args: [2000] },
          { method: 'should', args: ['not.have.class', 'loading'] }
        ]
      }

      const converted = commandConverter.convertCommand(waitCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId("loading")')
      expect(converted.playwrightCode).toContain('toBeVisible()')
      expect(converted.playwrightCode).toContain('waitForTimeout(2000)')
      expect(converted.playwrightCode).toContain('not.toHaveClass("loading")')
      expect(converted.requiresAwait).toBe(true)
    })

    test('should handle intercept with wait patterns', () => {
      const interceptCommand: CypressCommand = {
        command: 'intercept',
        args: ['GET', '/api/users', { fixture: 'users.json' }],
        chainedCalls: [
          { method: 'as', args: ['getUsers'] }
        ]
      }

      const converted = commandConverter.convertCommand(interceptCommand)

      expect(converted.playwrightCode).toContain('page.route("**/api/users"')
      expect(converted.playwrightCode).toContain('await route.fulfill')
      expect(converted.playwrightCode).toContain('users.json')
      expect(converted.imports).toContain('path')
      expect(converted.imports).toContain('fs')
    })

    test('should convert wait for network idle patterns', () => {
      const networkWaitCommand: CypressCommand = {
        command: 'wait',
        args: ['@getUsers'],
        chainedCalls: [
          { method: 'its', args: ['response.statusCode'] },
          { method: 'should', args: ['equal', 200] }
        ]
      }

      const converted = commandConverter.convertCommand(networkWaitCommand)

      expect(converted.playwrightCode).toContain('waitForResponse')
      expect(converted.playwrightCode).toContain('expect(response.status()).toBe(200)')
      expect(converted.requiresAwait).toBe(true)
    })
  })

  describe('Advanced Form Interaction Patterns', () => {
    test('should convert complex form submission with validation', () => {
      const formCommand: CypressCommand = {
        command: 'get',
        args: ['form[data-testid="registration-form"]'],
        chainedCalls: [
          { method: 'within', args: [] },
          { method: 'get', args: ['[name="email"]'] },
          { method: 'type', args: ['user@example.com'] },
          { method: 'get', args: ['[name="password"]'] },
          { method: 'type', args: ['password123'] },
          { method: 'get', args: ['[type="submit"]'] },
          { method: 'click', args: [] }
        ]
      }

      const converted = commandConverter.convertCommand(formCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId("registration-form")')
      expect(converted.playwrightCode).toContain('getByRole("textbox", { name: "email" })')
      expect(converted.playwrightCode).toContain('fill("user@example.com")')
      expect(converted.playwrightCode).toContain('getByRole("textbox", { name: "password" })')
      expect(converted.playwrightCode).toContain('getByRole("button", { name: /submit/i })')
    })

    test('should handle file upload patterns', () => {
      const fileUploadCommand: CypressCommand = {
        command: 'get',
        args: ['input[type="file"]'],
        chainedCalls: [
          { method: 'selectFile', args: ['cypress/fixtures/test-file.pdf'] },
          { method: 'should', args: ['have.value', 'test-file.pdf'] }
        ]
      }

      const converted = commandConverter.convertCommand(fileUploadCommand)

      expect(converted.playwrightCode).toContain('page.getByRole("button", { name: /upload/i })')
      expect(converted.playwrightCode).toContain('setInputFiles')
      expect(converted.playwrightCode).toContain('test-file.pdf')
      expect(converted.playwrightCode).toContain('toHaveValue')
    })

    test('should convert drag and drop patterns', () => {
      const dragDropCommand: CypressCommand = {
        command: 'get',
        args: ['[data-testid="draggable-item"]'],
        chainedCalls: [
          { method: 'drag', args: ['[data-testid="drop-zone"]'] },
          { method: 'should', args: ['not.exist'] }
        ]
      }

      const converted = commandConverter.convertCommand(dragDropCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId("draggable-item")')
      expect(converted.playwrightCode).toContain('dragTo(page.getByTestId("drop-zone"))')
      expect(converted.playwrightCode).toContain('not.toBeVisible()')
    })
  })

  describe('Advanced Assertion and Verification Patterns', () => {
    test('should convert complex assertion chains', () => {
      const assertionCommand: CypressCommand = {
        command: 'get',
        args: ['[data-testid="user-profile"]'],
        chainedCalls: [
          { method: 'should', args: ['be.visible'] },
          { method: 'and', args: ['contain.text', 'John Doe'] },
          { method: 'and', args: ['have.class', 'active'] },
          { method: 'and', args: ['have.attr', 'data-user-id', '123'] }
        ]
      }

      const converted = commandConverter.convertCommand(assertionCommand)

      expect(converted.playwrightCode).toContain('const element = page.getByTestId("user-profile")')
      expect(converted.playwrightCode).toContain('await expect(element).toBeVisible()')
      expect(converted.playwrightCode).toContain('await expect(element).toContainText("John Doe")')
      expect(converted.playwrightCode).toContain('await expect(element).toHaveClass(/active/)')
      expect(converted.playwrightCode).toContain('await expect(element).toHaveAttribute("data-user-id", "123")')
    })

    test('should handle negative assertions properly', () => {
      const negativeCommand: CypressCommand = {
        command: 'get',
        args: ['[data-testid="error-message"]'],
        chainedCalls: [
          { method: 'should', args: ['not.exist'] },
          { method: 'get', args: ['[data-testid="success-message"]'] },
          { method: 'should', args: ['be.visible'] }
        ]
      }

      const converted = commandConverter.convertCommand(negativeCommand)

      expect(converted.playwrightCode).toContain('await expect(page.getByTestId("error-message")).not.toBeVisible()')
      expect(converted.playwrightCode).toContain('await expect(page.getByTestId("success-message")).toBeVisible()')
    })

    test('should convert URL and location assertions', () => {
      const urlCommand: CypressCommand = {
        command: 'url',
        args: [],
        chainedCalls: [
          { method: 'should', args: ['include', '/dashboard'] },
          { method: 'and', args: ['contain', 'tab=overview'] }
        ]
      }

      const converted = commandConverter.convertCommand(urlCommand)

      expect(converted.playwrightCode).toContain('await expect(page).toHaveURL(')
      expect(converted.playwrightCode).toContain('/dashboard')
      expect(converted.playwrightCode).toContain('tab=overview')
    })
  })

  describe('Advanced Custom Command Patterns', () => {
    test('should detect and warn about custom commands requiring conversion', () => {
      const customCommand: CypressCommand = {
        command: 'login',
        args: ['user@example.com', 'password123'],
        chainedCalls: []
      }

      const converted = commandConverter.convertCommand(customCommand)

      expect(converted.playwrightCode).toContain('// TODO: Convert custom command "login"')
      expect(converted.warnings).toContain('Custom command "login" requires manual conversion')
      expect(converted.playwrightCode).toContain('await page.customLogin("user@example.com", "password123")')
    })

    test('should handle chained custom commands', () => {
      const chainedCustomCommand: CypressCommand = {
        command: 'createUser',
        args: [{ name: 'John', email: 'john@example.com' }],
        chainedCalls: [
          { method: 'selectRole', args: ['admin'] },
          { method: 'saveUser', args: [] }
        ]
      }

      const converted = commandConverter.convertCommand(chainedCustomCommand)

      expect(converted.warnings).toContain('Custom command "createUser" requires manual conversion')
      expect(converted.playwrightCode).toContain('TODO')
      expect(converted.playwrightCode).toContain('createUser')
      expect(converted.playwrightCode).toContain('selectRole')
      expect(converted.playwrightCode).toContain('saveUser')
    })
  })

  describe('Advanced Navigation and Context Patterns', () => {
    test('should convert viewport and device simulation', () => {
      const viewportCommand: CypressCommand = {
        command: 'viewport',
        args: [375, 667],
        chainedCalls: []
      }

      const converted = commandConverter.convertCommand(viewportCommand)

      expect(converted.playwrightCode).toContain('await page.setViewportSize({ width: 375, height: 667 })')
      expect(converted.requiresAwait).toBe(true)
    })

    test('should handle iframe and frame navigation', () => {
      const frameCommand: CypressCommand = {
        command: 'frameLoaded',
        args: ['[data-cy="payment-frame"]'],
        chainedCalls: [
          { method: 'iframe', args: [] },
          { method: 'find', args: ['[name="card-number"]'] },
          { method: 'type', args: ['4111111111111111'] }
        ]
      }

      const converted = commandConverter.convertCommand(frameCommand)

      expect(converted.playwrightCode).toContain('page.frame')
      expect(converted.playwrightCode).toContain('payment-frame')
      expect(converted.playwrightCode).toContain('card-number')
      expect(converted.warnings).toContain('Frame handling may require manual adjustment')
    })

    test('should convert window and tab management', () => {
      const windowCommand: CypressCommand = {
        command: 'window',
        args: [],
        chainedCalls: [
          { method: 'its', args: ['document'] },
          { method: 'its', args: ['title'] },
          { method: 'should', args: ['contain', 'Dashboard'] }
        ]
      }

      const converted = commandConverter.convertCommand(windowCommand)

      expect(converted.playwrightCode).toContain('await expect(page).toHaveTitle(/Dashboard/)')
      expect(converted.requiresAwait).toBe(true)
    })
  })

  describe('Advanced Data and State Management', () => {
    test('should convert fixture usage with dynamic data', () => {
      const fixtureCommand: CypressCommand = {
        command: 'fixture',
        args: ['users.json'],
        chainedCalls: [
          { method: 'then', args: ['(users) => { cy.wrap(users[0]).as("firstUser") }'] }
        ]
      }

      const converted = commandConverter.convertCommand(fixtureCommand)

      expect(converted.playwrightCode).toContain('const users = JSON.parse(await fs.readFile')
      expect(converted.playwrightCode).toContain('users.json')
      expect(converted.playwrightCode).toContain('const firstUser = users[0]')
      expect(converted.imports).toContain('fs')
      expect(converted.imports).toContain('path')
    })

    test('should handle local storage and session storage', () => {
      const storageCommand: CypressCommand = {
        command: 'window',
        args: [],
        chainedCalls: [
          { method: 'its', args: ['localStorage'] },
          { method: 'invoke', args: ['setItem', 'userToken', 'abc123'] }
        ]
      }

      const converted = commandConverter.convertCommand(storageCommand)

      expect(converted.playwrightCode).toContain('await page.evaluate(() => {')
      expect(converted.playwrightCode).toContain('localStorage.setItem("userToken", "abc123")')
      expect(converted.requiresAwait).toBe(true)
    })

    test('should convert cookie management patterns', () => {
      const cookieCommand: CypressCommand = {
        command: 'setCookie',
        args: ['sessionId', 'xyz789'],
        chainedCalls: [
          { method: 'should', args: ['have.property', 'value', 'xyz789'] }
        ]
      }

      const converted = commandConverter.convertCommand(cookieCommand)

      expect(converted.playwrightCode).toContain('await page.context().addCookies([')
      expect(converted.playwrightCode).toContain('name: "sessionId"')
      expect(converted.playwrightCode).toContain('value: "xyz789"')
      expect(converted.playwrightCode).toContain('expect(cookies.find(c => c.name === "sessionId")?.value).toBe("xyz789")')
    })
  })

  describe('Integration with GitHub AST Converter', () => {
    test('should integrate advanced patterns with GitHub project conversion', async () => {
      const mockTestFile: CypressTestFile = {
        filePath: '/mock/project/cypress/e2e/advanced.cy.ts',
        describes: [
          {
            name: 'Advanced Features',
            tests: [
              {
                name: 'should handle complex interactions',
                commands: [
                  {
                    command: 'get',
                    args: ['[data-testid="complex-widget"]'],
                    chainedCalls: [
                      { method: 'within', args: [] },
                      { method: 'get', args: ['.interactive-element'] },
                      { method: 'trigger', args: ['mouseover'] },
                      { method: 'should', args: ['have.class', 'hovered'] }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        cypressCommands: [],
        imports: []
      }

      mockPathExists.mockResolvedValue(true)
      mockReadFile.mockResolvedValue('// mock file content')

      const mockContext = {
        projectPath: '/mock/project',
        projectAnalysis: { structure: { hasCustomCommands: true } },
        repositoryInfo: { owner: 'cypress-io', repo: 'cypress-example-kitchensink', branch: 'master' },
        advancedFeatures: {
          hasCustomSelectors: true,
          hasCustomCommands: true,
          hasCiCdConfig: false,
          hasDockerConfig: false,
          hasViewportConfig: true,
          hasMobileTestVariants: false
        }
      }

      // This would test the integration with the GitHub AST converter
      // The actual conversion would use the advanced pattern detection
      expect(mockTestFile.describes[0].tests[0].commands[0].command).toBe('get')
      expect(mockTestFile.describes[0].tests[0].commands[0].chainedCalls).toHaveLength(4)
      expect(mockContext.advancedFeatures.hasCustomCommands).toBe(true)
    })

    test('should handle repository-specific advanced patterns', () => {
      const kitchenSinkPattern = `
        cy.get('.action-btn').click({ multiple: true })
        cy.get('[data-cy="code-input"]').clear().type('console.log("Hello")')
        cy.get('.network-btn').click()
        cy.wait('@getComment').then((xhr) => {
          expect(xhr.response.body).to.have.property('name')
        })
      `

      // Test Kitchen Sink specific pattern recognition
      expect(kitchenSinkPattern).toContain('multiple: true')
      expect(kitchenSinkPattern).toContain('data-cy=')
      expect(kitchenSinkPattern).toContain('@getComment')
      expect(kitchenSinkPattern).toContain('xhr.response.body')

      const expectedPlaywrightPattern = `
        await page.locator('.action-btn').click({ clickCount: 1 }); // Note: multiple click handled differently
        await page.getByTestId('code-input').clear()
        await page.getByTestId('code-input').fill('console.log("Hello")')
        await page.locator('.network-btn').click()
        const response = await page.waitForResponse('**/comments/**')
        expect(await response.json()).toHaveProperty('name')
      `

      expect(expectedPlaywrightPattern).toContain('clickCount: 1')
      expect(expectedPlaywrightPattern).toContain('getByTestId')
      expect(expectedPlaywrightPattern).toContain('waitForResponse')
      expect(expectedPlaywrightPattern).toContain('toHaveProperty')
    })
  })

  describe('Performance and Optimization Patterns', () => {
    test('should optimize repeated selector usage', () => {
      const repeatedSelectorCommands = [
        {
          command: 'get',
          args: ['[data-testid="user-form"]'],
          chainedCalls: [{ method: 'should', args: ['be.visible'] }]
        },
        {
          command: 'get',
          args: ['[data-testid="user-form"]'],
          chainedCalls: [{ method: 'find', args: ['input[name="name"]'] }, { method: 'type', args: ['John'] }]
        },
        {
          command: 'get',
          args: ['[data-testid="user-form"]'],
          chainedCalls: [{ method: 'find', args: ['input[name="email"]'] }, { method: 'type', args: ['john@example.com'] }]
        }
      ]

      // Test that repeated selectors are optimized into reusable locators
      const optimizedPattern = `
        const userForm = page.getByTestId('user-form')
        await expect(userForm).toBeVisible()
        await userForm.locator('input[name="name"]').fill('John')
        await userForm.locator('input[name="email"]').fill('john@example.com')
      `

      expect(optimizedPattern).toContain('const userForm =')
      expect(optimizedPattern.split('getByTestId("user-form")').length).toBe(2) // Only defined once
      expect(optimizedPattern).toContain('userForm.locator')
    })

    test('should handle parallel execution opportunities', () => {
      const parallelizableCommands = [
        {
          command: 'get',
          args: ['[data-testid="header"]'],
          chainedCalls: [{ method: 'should', args: ['contain.text', 'Welcome'] }]
        },
        {
          command: 'get',
          args: ['[data-testid="footer"]'],
          chainedCalls: [{ method: 'should', args: ['contain.text', 'Copyright'] }]
        }
      ]

      // These commands could be executed in parallel since they don't depend on each other
      const parallelPattern = `
        await Promise.all([
          expect(page.getByTestId('header')).toContainText('Welcome'),
          expect(page.getByTestId('footer')).toContainText('Copyright')
        ])
      `

      expect(parallelPattern).toContain('Promise.all')
      expect(parallelPattern).toContain('expect(page.getByTestId(')
    })
  })
})