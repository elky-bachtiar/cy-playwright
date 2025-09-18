# Cypress to Playwright Converter

A powerful CLI tool that automatically converts Cypress test projects to Playwright, including test syntax, configuration, and project structure migration.

## Features

- **Automated Test Conversion**: Convert Cypress test files (.spec.js, .spec.ts, .cy.js, .cy.ts) to Playwright syntax
- **Smart Selector Optimization**: Automatically converts CSS selectors to Playwright's semantic locators (getByTestId, getByRole, etc.)
- **Configuration Migration**: Converts cypress.config.js to playwright.config.js with proper browser and viewport settings
- **Custom Command Conversion**: Transforms Cypress custom commands into Playwright Page Object Methods
- **AST-Based Parsing**: Uses TypeScript Compiler API for accurate code transformation
- **Command Mapping**: Comprehensive mapping of Cypress commands to Playwright equivalents
- **Assertion Conversion**: Converts Cypress assertions (should) to Playwright expect patterns
- **TypeScript Support**: Full TypeScript support with proper type definitions

## Installation

```bash
npm install -g cypress-to-playwright-converter
```

Or use directly with npx:

```bash
npx cypress-to-playwright-converter
```

## Usage

### Basic Usage

```bash
cypress-to-playwright-converter --source ./cypress-project --output ./playwright-project
```

### Options

- `--source, -s`: Source directory containing Cypress project (required)
- `--output, -o`: Output directory for converted Playwright project (required)

### Example

```bash
# Convert a Cypress project to Playwright
cypress-to-playwright-converter -s ./my-cypress-tests -o ./my-playwright-tests
```

## Conversion Examples

### Basic Commands

```javascript
// Cypress
cy.visit('/login')
cy.get('[data-testid="username"]').type('user@example.com')
cy.get('[data-testid="password"]').type('password123')
cy.get('[data-testid="submit"]').click()

// Converted to Playwright
await page.goto('/login')
await page.getByTestId('username').fill('user@example.com')
await page.getByTestId('password').fill('password123')
await page.getByTestId('submit').click()
```

### Assertions

```javascript
// Cypress
cy.get('.message').should('be.visible')
cy.get('.title').should('contain.text', 'Dashboard')
cy.url().should('include', '/dashboard')

// Converted to Playwright
await expect(page.locator('.message')).toBeVisible()
await expect(page.locator('.title')).toContainText('Dashboard')
await expect(page).toHaveURL(/.*\/dashboard.*/)
```

### Custom Commands to Page Objects

```javascript
// Cypress Custom Command
Cypress.Commands.add('login', (username, password) => {
  cy.get('[data-testid="username"]').type(username)
  cy.get('[data-testid="password"]').type(password)
  cy.get('[data-testid="submit"]').click()
})

// Converted to Playwright Page Object
class LoginPage {
  constructor(page) {
    this.page = page
  }

  async login(username, password) {
    await this.page.getByTestId('username').fill(username)
    await this.page.getByTestId('password').fill(password)
    await this.page.getByTestId('submit').click()
  }
}
```

## Project Structure

After conversion, your Playwright project will have the following structure:

```
playwright-project/
├── tests/                  # Converted test files
├── test-results/           # Test execution results
├── playwright-report/      # HTML test reports
├── playwright.config.js    # Playwright configuration
└── package.json           # Dependencies and scripts
```

## Supported Conversions

### Commands
- `cy.visit()` → `page.goto()`
- `cy.get()` → `page.locator()` or optimized semantic locators
- `cy.click()` → `locator.click()`
- `cy.type()` → `locator.fill()`
- `cy.contains()` → `page.getByText()`
- `cy.url()` → `page.url()`
- `cy.wait()` → `page.waitForTimeout()` or `page.waitForResponse()`
- `cy.intercept()` → `page.route()`

### Selectors
- `[data-testid="x"]` → `page.getByTestId('x')`
- `[role="button"]` → `page.getByRole('button')`
- `[aria-label="Close"]` → `page.getByLabel('Close')`
- `[placeholder="Search"]` → `page.getByPlaceholder('Search')`

### Assertions
- `should('be.visible')` → `toBeVisible()`
- `should('contain.text', 'text')` → `toContainText('text')`
- `should('have.length', 5)` → `toHaveCount(5)`
- `should('have.value', 'value')` → `toHaveValue('value')`

## Configuration Migration

The tool automatically converts Cypress configuration to Playwright:

```javascript
// cypress.config.js
export default {
  baseUrl: 'http://localhost:3000',
  viewportWidth: 1280,
  viewportHeight: 720,
  defaultCommandTimeout: 10000
}

// Converted to playwright.config.js
import { defineConfig } from '@playwright/test'

export default defineConfig({
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ]
})
```

## Development

### Prerequisites

- Node.js 18+
- TypeScript
- Jest (for testing)

### Setup

```bash
git clone https://github.com/your-org/cypress-to-playwright-converter
cd cypress-to-playwright-converter
npm install
```

### Testing

```bash
npm test           # Run all tests
npm run test:watch # Run tests in watch mode
npm run lint       # Run ESLint
npm run build      # Build TypeScript
```

### Project Structure

```
src/
├── cli.ts              # CLI interface and argument parsing
├── ast-parser.ts       # TypeScript AST parsing engine
├── command-converter.ts # Command mapping and conversion logic
├── types.ts            # TypeScript type definitions
└── index.ts           # Main entry point

tests/
├── cli.test.ts            # CLI tests
├── ast-parser.test.ts     # AST parser tests
└── command-converter.test.ts # Command converter tests
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history and changes.

## License

MIT License - see LICENSE file for details.

## Support

- 📖 [Documentation](https://github.com/your-org/cypress-to-playwright-converter/wiki)
- 🐛 [Issue Tracker](https://github.com/your-org/cypress-to-playwright-converter/issues)
- 💬 [Discussions](https://github.com/your-org/cypress-to-playwright-converter/discussions)

## Related Projects

- [Playwright](https://playwright.dev/) - Fast and reliable end-to-end testing
- [Cypress](https://www.cypress.io/) - Fast, easy and reliable testing for anything that runs in a browser
- [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript at scale