# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

This repository is designed for converting Cypress test projects to Playwright. The conversion process involves migrating test syntax, configuration, and project structure from Cypress to Playwright.

## Common Commands

### Cypress Projects
- `npm run cy:open` - Open Cypress Test Runner
- `npm run cy:run` - Run Cypress tests in headless mode
- `npm run cy:run:chrome` - Run tests in Chrome browser
- `npm run cy:run:firefox` - Run tests in Firefox browser

### Playwright Projects
- `npx playwright test` - Run all Playwright tests
- `npx playwright test --ui` - Run tests in UI mode
- `npx playwright test --headed` - Run tests in headed mode
- `npx playwright test --project=chromium` - Run tests in specific browser
- `npx playwright codegen` - Generate test code
- `npx playwright show-report` - Show test report

### Conversion Process
- `npm run convert` - Convert Cypress tests to Playwright (if automated script exists)
- `npm run lint` - Lint converted test files
- `npm run test:validate` - Validate converted tests

## Cypress to Playwright Conversion Guide

### Key Architectural Differences

1. **Test Structure**:
   - Cypress: Uses `describe` and `it` blocks, commands are chainable
   - Playwright: Uses `test` blocks, actions are awaited

2. **Selectors**:
   - Cypress: `cy.get('[data-testid="submit"]')`
   - Playwright: `page.locator('[data-testid="submit"]')` or `page.getByTestId('submit')`

3. **Assertions**:
   - Cypress: `cy.get('.element').should('be.visible')`
   - Playwright: `await expect(page.locator('.element')).toBeVisible()`

### Common Command Mappings

| Cypress | Playwright |
|---------|------------|
| `cy.visit(url)` | `await page.goto(url)` |
| `cy.get(selector)` | `page.locator(selector)` |
| `cy.click()` | `await locator.click()` |
| `cy.type(text)` | `await locator.fill(text)` |
| `cy.should('be.visible')` | `await expect(locator).toBeVisible()` |
| `cy.should('contain.text', text)` | `await expect(locator).toContainText(text)` |
| `cy.wait(ms)` | `await page.waitForTimeout(ms)` |
| `cy.intercept()` | `await page.route()` |
| `cy.fixture(file)` | `JSON.parse(await fs.readFile(file))` |

### Configuration Migration

1. **cypress.config.js** → **playwright.config.js**:
   - `baseUrl` → `use.baseURL`
   - `viewportHeight/Width` → `use.viewport`
   - `defaultCommandTimeout` → `use.actionTimeout`

2. **Browser Configuration**:
   - Cypress: Configured in cypress.config.js
   - Playwright: Multiple projects in playwright.config.js for different browsers

### File Structure Conversion

1. **Test Files**:
   - Cypress: `cypress/e2e/**/*.cy.js`
   - Playwright: `tests/**/*.spec.js` or `e2e/**/*.spec.js`

2. **Support Files**:
   - Cypress: `cypress/support/` → Playwright: `tests/support/` or global setup
   - Custom commands → Page Object Models or fixtures

3. **Fixtures**:
   - Cypress: `cypress/fixtures/` → Playwright: `tests/fixtures/` or `test-data/`

### Conversion Strategy

1. **Phase 1: Setup**
   - Install Playwright: `npm init playwright@latest`
   - Configure playwright.config.js based on cypress.config.js
   - Set up test directory structure

2. **Phase 2: Test Migration**
   - Convert test syntax from Cypress commands to Playwright actions
   - Replace Cypress assertions with Playwright expect assertions
   - Update selectors to use Playwright locator strategies

3. **Phase 3: Advanced Features**
   - Convert custom commands to Page Object Models
   - Migrate intercepts to route handlers
   - Update fixture loading patterns

4. **Phase 4: Validation**
   - Run converted tests and fix failures
   - Update CI/CD configuration
   - Performance comparison and optimization

### Best Practices for Conversion

1. **Locator Strategy**: Prefer semantic locators (getByRole, getByText) over CSS selectors
2. **Page Object Pattern**: Convert Cypress custom commands to Playwright Page Objects
3. **Auto-waiting**: Leverage Playwright's auto-waiting instead of explicit waits
4. **Parallelization**: Take advantage of Playwright's built-in test parallelization
5. **Cross-browser Testing**: Utilize Playwright's multi-browser support

### Common Conversion Challenges

1. **Async/Await**: Cypress commands are automatically awaited, Playwright requires explicit await
2. **jQuery-style Chaining**: Convert Cypress command chains to Playwright locator actions
3. **Custom Commands**: Refactor into reusable functions or Page Object Methods
4. **Aliases**: Replace Cypress aliases with variables or Page Object properties
5. **Network Interception**: Migrate from cy.intercept() to page.route() patterns

### Testing Converted Code

- Run both Cypress and Playwright tests in parallel during transition
- Compare test execution times and reliability
- Validate test coverage remains consistent
- Use Playwright's trace viewer for debugging complex scenarios