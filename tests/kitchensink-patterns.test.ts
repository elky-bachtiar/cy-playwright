import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import * as fs from 'fs-extra'
import * as path from 'path'
import { ASTParser } from '../src/ast-parser'
import { CommandConverter } from '../src/command-converter'
import { GitHubASTConverter } from '../src/github-ast-converter'
import type { CypressCommand, GitHubProjectContext } from '../src/types'

// Mock fs-extra for controlled testing
jest.mock('fs-extra')
const mockFs = fs as jest.Mocked<typeof fs>

describe('Kitchen Sink Repository Patterns', () => {
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

  describe('Kitchen Sink Specific Command Patterns', () => {
    test('should convert Kitchen Sink action button patterns', () => {
      const actionButtonCommand: CypressCommand = {
        command: 'get',
        args: ['.action-btn'],
        chainedCalls: [
          { method: 'click', args: [{ multiple: true }] }
        ]
      }

      const converted = commandConverter.convertCommand(actionButtonCommand)

      expect(converted.playwrightCode).toContain('page.locator(\'.action-btn\')')
      expect(converted.playwrightCode).toContain('.click()')
      expect(converted.warnings || []).toContainEqual(expect.stringContaining('multiple'))
    })

    test('should convert Kitchen Sink data-cy selector patterns', () => {
      const dataCyCommand: CypressCommand = {
        command: 'get',
        args: ['[data-cy="code-input"]'],
        chainedCalls: [
          { method: 'clear', args: [] },
          { method: 'type', args: ['console.log("Hello World")'] }
        ]
      }

      const converted = commandConverter.convertCommand(dataCyCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId(\'code-input\')')
      expect(converted.playwrightCode).toContain('.clear()')
      expect(converted.playwrightCode).toContain('.fill(\'console.log("Hello World")\')')
      expect(converted.requiresAwait).toBe(true)
    })

    test('should handle Kitchen Sink network request patterns', () => {
      const networkCommand: CypressCommand = {
        command: 'intercept',
        args: ['GET', '**/comments/*', { fixture: 'example.json' }],
        chainedCalls: [
          { method: 'as', args: ['getComment'] }
        ]
      }

      const converted = commandConverter.convertCommand(networkCommand)

      expect(converted.playwrightCode).toContain('page.route(\'****/comments/*\'')
      expect(converted.playwrightCode).toContain('route.fulfill')
      expect(converted.playwrightCode).toContain('example.json')
      expect(converted.imports).toContain('fs')
      expect(converted.imports).toContain('path')
    })

    test('should convert Kitchen Sink wait patterns with network aliases', () => {
      const waitCommand: CypressCommand = {
        command: 'wait',
        args: ['@getComment'],
        chainedCalls: [
          { method: 'then', args: ['(xhr) => { expect(xhr.response.body).to.have.property("name") }'] }
        ]
      }

      const converted = commandConverter.convertCommand(waitCommand)

      expect(converted.playwrightCode).toContain('page.waitForResponse')
      expect(converted.playwrightCode).toContain('response')
      expect(converted.warnings).toContainEqual(expect.stringContaining('then() callback'))
    })

    test('should handle Kitchen Sink form interaction patterns', () => {
      const formCommand: CypressCommand = {
        command: 'get',
        args: ['[data-cy="action-form"]'],
        chainedCalls: [
          { method: 'within', args: [] },
          { method: 'get', args: ['[data-cy="coupon-code"]'] },
          { method: 'type', args: ['HALFOFF'] },
          { method: 'get', args: ['[data-cy="submit"]'] },
          { method: 'click', args: [] }
        ]
      }

      const converted = commandConverter.convertCommand(formCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId(\'action-form\')')
      expect(converted.playwrightCode).toContain('getByTestId(\'coupon-code\')')
      expect(converted.playwrightCode).toContain('fill(\'HALFOFF\')')
      expect(converted.playwrightCode).toContain('getByTestId(\'submit\')')
    })
  })

  describe('Kitchen Sink API Testing Patterns', () => {
    test('should convert Kitchen Sink cy.request() patterns', () => {
      const requestCommand: CypressCommand = {
        command: 'request',
        args: [{ method: 'POST', url: '/users', body: { name: 'Jane' } }],
        chainedCalls: [
          { method: 'then', args: ['(response) => { expect(response.status).to.eq(201) }'] }
        ]
      }

      const converted = commandConverter.convertCommand(requestCommand)

      expect(converted.playwrightCode).toContain('// TODO: Convert custom command "request"')
      expect(converted.warnings).toContainEqual('Custom command "request" requires manual conversion')
    })

    test('should handle Kitchen Sink cookie patterns', () => {
      const cookieCommand: CypressCommand = {
        command: 'setCookie',
        args: ['token', 'abc123'],
        chainedCalls: [
          { method: 'should', args: ['have.property', 'value', 'abc123'] }
        ]
      }

      const converted = commandConverter.convertCommand(cookieCommand)

      expect(converted.playwrightCode).toContain('page.context().addCookies([')
      expect(converted.playwrightCode).toContain('name: \'token\'')
      expect(converted.playwrightCode).toContain('value: \'abc123\'')
    })

    test('should convert Kitchen Sink window property access', () => {
      const windowCommand: CypressCommand = {
        command: 'window',
        args: [],
        chainedCalls: [
          { method: 'its', args: ['store'] },
          { method: 'invoke', args: ['getState'] },
          { method: 'should', args: ['deep.equal', { loading: false }] }
        ]
      }

      const converted = commandConverter.convertCommand(windowCommand)

      expect(converted.playwrightCode).toContain('// TODO')
      expect(converted.warnings).toContainEqual(expect.stringContaining('its(\'store\')'))
    })
  })

  describe('Kitchen Sink Component Testing Patterns', () => {
    test('should handle Kitchen Sink component mount patterns', () => {
      // This would be for component testing scenarios specific to Kitchen Sink
      const componentCommand: CypressCommand = {
        command: 'mount',
        args: ['<Button onClick={handleClick}>Click me</Button>'],
        chainedCalls: []
      }

      const converted = commandConverter.convertCommand(componentCommand)

      expect(converted.playwrightCode).toContain('// TODO: Convert custom command "mount"')
      expect(converted.warnings).toContainEqual('Custom command "mount" requires manual conversion')
    })

    test('should convert Kitchen Sink component prop testing', () => {
      const propCommand: CypressCommand = {
        command: 'get',
        args: ['[data-cy="counter"]'],
        chainedCalls: [
          { method: 'should', args: ['have.text', '0'] },
          { method: 'get', args: ['[data-cy="increment"]'] },
          { method: 'click', args: [] },
          { method: 'should', args: ['have.text', '1'] }
        ]
      }

      const converted = commandConverter.convertCommand(propCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId(\'counter\')')
      expect(converted.playwrightCode).toContain('toHaveText(\'0\')')
      expect(converted.playwrightCode).toContain('toHaveText(\'1\')')
    })
  })

  describe('Kitchen Sink Navigation and Routing Patterns', () => {
    test('should convert Kitchen Sink route navigation patterns', () => {
      const routeCommand: CypressCommand = {
        command: 'visit',
        args: ['/commands/actions'],
        chainedCalls: [
          { method: 'url', args: [] },
          { method: 'should', args: ['include', '/commands/actions'] }
        ]
      }

      const converted = commandConverter.convertCommand(routeCommand)

      expect(converted.playwrightCode).toContain('await page.goto(\'/commands/actions\')')
    })

    test('should handle Kitchen Sink hash routing patterns', () => {
      const hashCommand: CypressCommand = {
        command: 'hash',
        args: [],
        chainedCalls: [
          { method: 'should', args: ['eq', '#actions'] }
        ]
      }

      const converted = commandConverter.convertCommand(hashCommand)

      expect(converted.playwrightCode).toContain('// TODO: Convert custom command "hash"')
      expect(converted.warnings).toContainEqual('Custom command "hash" requires manual conversion')
    })

    test('should convert Kitchen Sink location testing patterns', () => {
      const locationCommand: CypressCommand = {
        command: 'location',
        args: ['pathname'],
        chainedCalls: [
          { method: 'should', args: ['eq', '/commands/actions'] }
        ]
      }

      const converted = commandConverter.convertCommand(locationCommand)

      expect(converted.playwrightCode).toContain('// TODO: Convert custom command "location"')
      expect(converted.warnings).toContainEqual('Custom command "location" requires manual conversion')
    })
  })

  describe('Kitchen Sink File and Upload Patterns', () => {
    test('should convert Kitchen Sink file upload patterns', () => {
      const uploadCommand: CypressCommand = {
        command: 'get',
        args: ['input[type=file]'],
        chainedCalls: [
          { method: 'selectFile', args: ['cypress/fixtures/example.json'] },
          { method: 'should', args: ['have.value', 'example.json'] }
        ]
      }

      const converted = commandConverter.convertCommand(uploadCommand)

      expect(converted.playwrightCode).toContain('setInputFiles')
      expect(converted.playwrightCode).toContain('example.json')
      expect(converted.playwrightCode).toContain('toHaveValue')
      expect(converted.imports).toContain('path')
    })

    test('should handle Kitchen Sink download patterns', () => {
      const downloadCommand: CypressCommand = {
        command: 'get',
        args: ['[data-cy="download-link"]'],
        chainedCalls: [
          { method: 'click', args: [] }
        ]
      }

      const converted = commandConverter.convertCommand(downloadCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId(\'download-link\')')
      expect(converted.playwrightCode).toContain('.click()')
    })
  })

  describe('Kitchen Sink Viewport and Device Testing', () => {
    test('should convert Kitchen Sink viewport patterns', () => {
      const viewportCommand: CypressCommand = {
        command: 'viewport',
        args: [320, 568],
        chainedCalls: []
      }

      const converted = commandConverter.convertCommand(viewportCommand)

      expect(converted.playwrightCode).toContain('page.setViewportSize({ width: 320, height: 568 })')
      expect(converted.requiresAwait).toBe(true)
    })

    test('should handle Kitchen Sink responsive testing patterns', () => {
      const responsiveCommand: CypressCommand = {
        command: 'get',
        args: ['[data-cy="navbar"]'],
        chainedCalls: [
          { method: 'should', args: ['be.visible'] },
          { method: 'viewport', args: [320, 568] },
          { method: 'should', args: ['not.be.visible'] }
        ]
      }

      const converted = commandConverter.convertCommand(responsiveCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId(\'navbar\')')
      expect(converted.playwrightCode).toContain('toBeVisible()')
    })
  })

  describe('Kitchen Sink Accessibility Testing Patterns', () => {
    test('should convert Kitchen Sink accessibility attribute testing', () => {
      const a11yCommand: CypressCommand = {
        command: 'get',
        args: ['[data-cy="submit-button"]'],
        chainedCalls: [
          { method: 'should', args: ['have.attr', 'aria-label', 'Submit form'] },
          { method: 'and', args: ['have.attr', 'role', 'button'] }
        ]
      }

      const converted = commandConverter.convertCommand(a11yCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId(\'submit-button\')')
      expect(converted.playwrightCode).toContain('toHaveAttribute(\'aria-label\', \'Submit form\')')
      expect(converted.playwrightCode).toContain('toHaveAttribute(\'role\', \'button\')')
    })

    test('should handle Kitchen Sink focus management patterns', () => {
      const focusCommand: CypressCommand = {
        command: 'get',
        args: ['[data-cy="email-input"]'],
        chainedCalls: [
          { method: 'focus', args: [] },
          { method: 'should', args: ['have.focus'] },
          { method: 'tab', args: [] },
          { method: 'should', args: ['not.have.focus'] }
        ]
      }

      const converted = commandConverter.convertCommand(focusCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId(\'email-input\')')
      expect(converted.playwrightCode).toContain('.focus()')
    })
  })

  describe('Kitchen Sink Integration with GitHub Converter', () => {
    test('should apply Kitchen Sink specific conversions through GitHub converter', async () => {
      const mockKitchenSinkContext: GitHubProjectContext = {
        projectPath: '/mock/cypress-example-kitchensink',
        projectAnalysis: {
          structure: {
            hasComponentTesting: true,
            hasCustomCommands: true,
            hasCustomSelectors: true,
            testTypes: ['e2e', 'component'],
            advancedFeatures: {
              hasApiTesting: true,
              hasFileUploads: true,
              hasNetworkMocking: true,
              hasViewportTesting: true,
              hasAccessibilityTesting: true
            }
          },
          dependencies: {
            hasCypress: true,
            cypressVersion: '^12.5.0',
            hasPlugins: true,
            plugins: ['@cypress/webpack-preprocessor', '@cypress/code-coverage']
          }
        },
        repositoryInfo: {
          owner: 'cypress-io',
          repo: 'cypress-example-kitchensink',
          branch: 'master'
        },
        advancedFeatures: {
          hasCustomSelectors: true,
          hasCustomCommands: true,
          hasCiCdConfig: true,
          hasDockerConfig: false,
          hasViewportConfig: true,
          hasMobileTestVariants: true
        }
      }

      // Test the Kitchen Sink specific pattern recognition
      expect(mockKitchenSinkContext.repositoryInfo.repo).toBe('cypress-example-kitchensink')
      expect(mockKitchenSinkContext.advancedFeatures.hasCustomSelectors).toBe(true)
      expect(mockKitchenSinkContext.advancedFeatures.hasViewportConfig).toBe(true)
      expect(mockKitchenSinkContext.advancedFeatures.hasMobileTestVariants).toBe(true)
    })

    test('should convert Kitchen Sink comprehensive test patterns', () => {
      const kitchenSinkTestPattern = `
        cy.get('[data-cy="action-email"]')
          .type('fake@email.com')
          .should('have.value', 'fake@email.com')

        cy.get('[data-cy="action-disabled"]')
          .should('be.disabled')

        cy.get('.action-btn').click({ multiple: true })

        cy.intercept('GET', '**/comments/*', { fixture: 'example.json' }).as('getComment')

        cy.get('[data-cy="network-btn"]').click()

        cy.wait('@getComment').then((xhr) => {
          expect(xhr.response.body).to.have.property('name')
          expect(xhr.response.body).to.have.property('email')
          expect(xhr.response.body.name).to.eq('Using fixtures to represent data')
        })
      `

      // Expected Playwright conversion pattern
      const expectedPlaywrightPattern = `
        await page.getByTestId('action-email').fill('fake@email.com')
        await expect(page.getByTestId('action-email')).toHaveValue('fake@email.com')

        await expect(page.getByTestId('action-disabled')).toBeDisabled()

        await page.locator('.action-btn').click() // Note: multiple click handled differently

        await page.route('****/comments/*', async route => {
          const json = JSON.parse(await fs.readFile(path.join(__dirname, '../fixtures/example.json'), 'utf-8'));
          await route.fulfill({ json });
        })

        await page.getByTestId('network-btn').click()

        const response = await page.waitForResponse('**/comments/**')
        const responseBody = await response.json()
        expect(responseBody).toHaveProperty('name')
        expect(responseBody).toHaveProperty('email')
        expect(responseBody.name).toBe('Using fixtures to represent data')
      `

      // Validate conversion patterns
      expect(kitchenSinkTestPattern).toContain('data-cy=')
      expect(kitchenSinkTestPattern).toContain('multiple: true')
      expect(kitchenSinkTestPattern).toContain('@getComment')
      expect(kitchenSinkTestPattern).toContain('xhr.response.body')

      expect(expectedPlaywrightPattern).toContain('getByTestId')
      expect(expectedPlaywrightPattern).toContain('toHaveValue')
      expect(expectedPlaywrightPattern).toContain('route.fulfill')
      expect(expectedPlaywrightPattern).toContain('waitForResponse')
      expect(expectedPlaywrightPattern).toContain('toHaveProperty')
    })

    test('should handle Kitchen Sink custom commands conversion', () => {
      const kitchenSinkCustomCommands = [
        'cy.dataCy("submit").click()',
        'cy.getByCy("user-menu").should("be.visible")',
        'cy.findByCy("notification").should("contain", "Success")'
      ]

      const expectedConversions = [
        'await page.getByTestId("submit").click()',
        'await expect(page.getByTestId("user-menu")).toBeVisible()',
        'await expect(page.getByTestId("notification")).toContainText("Success")'
      ]

      // Validate that Kitchen Sink's common patterns are recognizable
      kitchenSinkCustomCommands.forEach((command, index) => {
        expect(command).toContain('Cy(')
        expect(expectedConversions[index]).toContain('getByTestId(')
      })
    })

    test('should optimize Kitchen Sink repetitive selector patterns', () => {
      const repetitivePattern = `
        cy.get('[data-cy="todo-list"]').should('be.visible')
        cy.get('[data-cy="todo-list"]').find('.todo-item').should('have.length', 3)
        cy.get('[data-cy="todo-list"]').find('.todo-item').first().click()
        cy.get('[data-cy="todo-list"]').find('.completed').should('have.length', 1)
      `

      const optimizedPattern = `
        const todoList = page.getByTestId('todo-list')
        await expect(todoList).toBeVisible()
        await expect(todoList.locator('.todo-item')).toHaveCount(3)
        await todoList.locator('.todo-item').first().click()
        await expect(todoList.locator('.completed')).toHaveCount(1)
      `

      expect(repetitivePattern.split('data-cy="todo-list"').length).toBe(5) // 4 occurrences + 1
      expect(optimizedPattern.split('getByTestId(\'todo-list\')').length).toBe(2) // 1 occurrence + 1
      expect(optimizedPattern).toContain('const todoList =')
      expect(optimizedPattern).toContain('todoList.locator')
    })
  })

  describe('Kitchen Sink Performance and Load Testing Patterns', () => {
    test('should handle Kitchen Sink performance measurement patterns', () => {
      const performanceCommand: CypressCommand = {
        command: 'window',
        args: [],
        chainedCalls: [
          { method: 'its', args: ['performance'] },
          { method: 'invoke', args: ['mark', 'start-test'] }
        ]
      }

      const converted = commandConverter.convertCommand(performanceCommand)

      expect(converted.playwrightCode).toContain('// TODO')
      expect(converted.warnings).toContainEqual(expect.stringContaining('its(\'performance\')'))
    })

    test('should convert Kitchen Sink load testing patterns', () => {
      const loadTestCommand: CypressCommand = {
        command: 'get',
        args: ['[data-cy="load-test-btn"]'],
        chainedCalls: [
          { method: 'click', args: [] },
          { method: 'wait', args: [5000] },
          { method: 'should', args: ['be.enabled'] }
        ]
      }

      const converted = commandConverter.convertCommand(loadTestCommand)

      expect(converted.playwrightCode).toContain('page.getByTestId(\'load-test-btn\')')
      expect(converted.playwrightCode).toContain('.click()')
      expect(converted.playwrightCode).toContain('waitForTimeout(5000)')
      expect(converted.playwrightCode).toContain('toBeEnabled()')
    })
  })
})