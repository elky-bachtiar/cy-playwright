# Cypress to Playwright Converter

A powerful CLI tool and web service that automatically converts Cypress test projects to Playwright, including test syntax, configuration, and project structure migration. Now supports direct GitHub repository conversion for seamless project migration.

## Features

### Core Conversion Engine
- **Automated Test Conversion**: Convert Cypress test files (.spec.js, .spec.ts, .cy.js, .cy.ts) to Playwright syntax
- **Smart Selector Optimization**: Automatically converts CSS selectors to Playwright's semantic locators (getByTestId, getByRole, etc.)
- **Configuration Migration**: Converts cypress.config.js to playwright.config.js with proper browser and viewport settings
- **Custom Command Conversion**: Transforms Cypress custom commands into Playwright Page Object Methods
- **AST-Based Parsing**: Uses TypeScript Compiler API for accurate code transformation
- **Command Mapping**: Comprehensive mapping of Cypress commands to Playwright equivalents
- **Assertion Conversion**: Converts Cypress assertions (should) to Playwright expect patterns
- **TypeScript Support**: Full TypeScript support with proper type definitions

### GitHub Repository Integration
- **Direct Repository Conversion**: Convert any public GitHub Cypress project by providing the repository URL
- **Advanced Pattern Recognition**: Detect and convert complex Cypress patterns including:
  - Centralized selector files (selectors.js, elements.js)
  - Custom command files (.cmd.js patterns)
  - Dynamic viewport configurations
  - Page Object Model implementations
- **CI/CD Configuration Migration**: Convert GitHub Actions, CircleCI, and AppVeyor configurations to Playwright equivalents
- **Docker Integration**: Handle Dockerfile and docker-compose.yml configurations for containerized testing
- **Project Packaging**: Generate downloadable zip files containing fully converted Playwright projects
- **Real-time Progress Tracking**: Monitor conversion progress with live status updates

## Installation

```bash
npm install -g cypress-to-playwright-converter
```

Or use directly with npx:

```bash
npx cypress-to-playwright-converter
```

## Usage

### CLI Usage

```bash
# Convert local Cypress project
cypress-to-playwright-converter --source ./cypress-project --output ./playwright-project

# Convert GitHub repository
cypress-to-playwright-converter --github-url https://github.com/helenanull/cypress-example --output ./converted-project
```

### Web API Usage

```bash
# Start conversion of GitHub repository
curl -X POST "https://api.example.com/api/convert/github" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/helenanull/cypress-example"}'

# Check conversion status
curl "https://api.example.com/api/convert/{conversion-id}/status"

# Download converted project
curl "https://api.example.com/api/convert/{conversion-id}/download" -o converted-project.zip
```

### Options

#### CLI Options
- `--source, -s`: Source directory containing Cypress project
- `--output, -o`: Output directory for converted Playwright project
- `--github-url, -g`: GitHub repository URL to convert
- `--branch, -b`: Specific branch to convert (defaults to main/master)

#### API Endpoints
- `POST /api/convert/github`: Start GitHub repository conversion
- `GET /api/convert/{id}/status`: Get conversion status
- `GET /api/convert/{id}/download`: Download converted project
- `GET /api/convert/{id}/report`: Get detailed conversion report

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

### GitHub Repository Conversion

```javascript
// Target Repository: helenanull/cypress-example
// Original Cypress selector file (cypress/selectors/login.js)
export const loginSelectors = {
  usernameInput: '[data-testid="username"]',
  passwordInput: '[data-testid="password"]',
  submitButton: '[data-testid="submit"]'
}

// Converted to Playwright Page Object with semantic locators
export class LoginPage {
  constructor(page) {
    this.page = page
  }

  get usernameInput() { return this.page.getByTestId('username') }
  get passwordInput() { return this.page.getByTestId('password') }
  get submitButton() { return this.page.getByTestId('submit') }

  async login(username, password) {
    await this.usernameInput.fill(username)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }
}
```

### Custom Commands to Page Objects

```javascript
// Cypress Custom Command (.cmd.js file)
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
│   ├── e2e/               # End-to-end tests
│   ├── page-objects/      # Converted custom commands as page objects
│   └── fixtures/          # Test data and fixtures
├── test-results/           # Test execution results
├── playwright-report/      # HTML test reports
├── playwright.config.js    # Converted Playwright configuration
├── package.json           # Updated dependencies and scripts
├── .github/workflows/      # Converted CI/CD configurations
├── docker-compose.yml      # Converted Docker configurations (if applicable)
└── docs/                  # Conversion report and migration guide
    ├── conversion-report.md
    └── migration-guide.md
```

## Target Repository Support

This converter has been specifically tested and optimized for:

### helenanull/cypress-example
- Centralized selector files in `cypress/selectors/`
- Custom command files with `.cmd.js` extensions
- Cross-browser test configurations
- Dynamic viewport and device testing

### cypress-io/cypress-example-kitchensink
- Comprehensive Cypress API usage patterns
- Multiple CI/CD configurations (GitHub Actions, CircleCI, AppVeyor)
- Docker integration and containerized testing
- Advanced plugin ecosystem usage
- Educational test patterns with extensive commenting

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
- `cy.fixture()` → `JSON.parse(await fs.readFile())`
- Custom commands → Page Object Methods

### Selectors & Advanced Patterns
- `[data-testid="x"]` → `page.getByTestId('x')`
- `[role="button"]` → `page.getByRole('button')`
- `[aria-label="Close"]` → `page.getByLabel('Close')`
- `[placeholder="Search"]` → `page.getByPlaceholder('Search')`
- Centralized selector files → Page Object locator methods
- Selector aliases → Page Object getter properties

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
- Docker (for containerized testing)

### Setup

```bash
git clone https://github.com/your-org/cypress-to-playwright-converter
cd cypress-to-playwright-converter
npm install
```

### Testing

```bash
npm test                    # Run all tests
npm run test:watch          # Run tests in watch mode
npm run test:integration    # Run integration tests with target repositories
npm run lint                # Run ESLint
npm run build               # Build TypeScript
npm run dev                 # Start development server with API
```

### Project Structure

```
src/
├── cli/                    # CLI interface and argument parsing
│   ├── cli.ts
│   └── github-cli.ts
├── core/                   # Core conversion engine
│   ├── ast-parser.ts       # TypeScript AST parsing engine
│   ├── command-converter.ts # Command mapping and conversion logic
│   └── pattern-detector.ts # Advanced pattern recognition
├── github/                 # GitHub integration
│   ├── repository.ts       # Repository cloning and management
│   ├── analyzer.ts         # Project structure analysis
│   └── validator.ts        # Repository validation
├── api/                    # REST API server
│   ├── routes/
│   ├── middleware/
│   └── services/
├── converters/             # Specialized converters
│   ├── ci-cd/              # CI/CD pipeline converters
│   ├── selectors/          # Selector pattern converters
│   └── commands/           # Custom command converters
├── types.ts                # TypeScript type definitions
└── index.ts               # Main entry point

tests/
├── unit/                   # Unit tests
├── integration/            # Integration tests with target repos
├── fixtures/               # Test data and sample projects
└── e2e/                   # End-to-end API tests
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history and changes.

## License

MIT License - see LICENSE file for details.

## API Reference

### Conversion Status Response

```json
{
  "id": "conv_123456",
  "status": "completed",
  "progress": 100,
  "repository": "helenanull/cypress-example",
  "branch": "main",
  "conversionReport": {
    "testsConverted": 45,
    "commandsConverted": 234,
    "selectorsOptimized": 67,
    "customCommandsConverted": 12,
    "ciConfigurationsConverted": 2
  },
  "downloadUrl": "https://api.example.com/api/convert/conv_123456/download",
  "reportUrl": "https://api.example.com/api/convert/conv_123456/report"
}
```

## Support

- 📖 [Documentation](https://github.com/your-org/cypress-to-playwright-converter/wiki)
- 🐛 [Issue Tracker](https://github.com/your-org/cypress-to-playwright-converter/issues)
- 💬 [Discussions](https://github.com/your-org/cypress-to-playwright-converter/discussions)
- 🚀 [API Documentation](https://api-docs.example.com)

## Related Projects

- [Playwright](https://playwright.dev/) - Fast and reliable end-to-end testing
- [Cypress](https://www.cypress.io/) - Fast, easy and reliable testing for anything that runs in a browser
- [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript at scale