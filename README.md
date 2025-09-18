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
- **Interactive Branch Selection**: Choose from any available branch after cloning the repository
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
cy2pw convert --source ./cypress-project --output ./playwright-project

# Convert GitHub repository with interactive project selection
cy2pw convert-github --github-url https://github.com/cypress-io/cypress-example-recipes.git --verbose

# Convert specific GitHub repository
cy2pw convert-github --github-url https://github.com/helenanull/cypress-example --output ./converted-project
```

### Interactive Project Selection

When converting repositories with multiple Cypress projects (like cypress-example-recipes), the CLI will:

1. **Clone the entire repository** to `.conversion` directory
2. **Branch selection** - Choose which branch to work with:

```
🌿 Found 5 available branches:
❯   circle-config-1 (current)
    cypress-6.6.0
    cypress-8.0.0
    main
    upgrade-10
  ❌ Cancel conversion
```

3. **Scan for all Cypress projects** recursively
4. **Present an interactive menu** showing detected projects with confidence scores:

```
🔍 Found 167 potential Cypress projects:
❯ 🟢 examples/stubbing-spying__intercept 📄 (20 tests)
  🟢 examples/blogs__element-coverage 📄 (11 tests)
  🟢 examples/server-communication__xhr-assertions 📄 (8 tests)
  🔴 examples/ ❌ (multiple sub-projects)
  ❌ Cancel conversion
```

5. **Convert selected project** within the cloned repository structure

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

### CLI Commands

#### `convert` - Local Project Conversion
Convert a local Cypress project to Playwright:

```bash
cy2pw convert [options]
```

**Options:**
- `--source, -s <path>`: Source Cypress project directory (required)
- `--output, -o <path>`: Output directory for Playwright project (required)
- `--preserve-structure`: Preserve original directory structure (default: false)
- `--generate-page-objects`: Generate page object models from custom commands (default: true)
- `--verbose, -v`: Enable verbose logging (default: false)

#### `convert-github` - GitHub Repository Conversion
Clone and convert a Cypress project from GitHub:

```bash
cy2pw convert-github [options]
```

**Options:**
- `--github-url <url>`: GitHub repository URL to clone and convert (required)
- `--output, -o <path>`: Output directory for converted Playwright project (default: "./playwright-project")
- `--preserve-structure`: Preserve original directory structure (default: false)
- `--generate-page-objects`: Generate page object models from custom commands (default: true)
- `--verbose, -v`: Enable verbose logging (default: false)

**Repository Structure Support:**
- **Single Project Repos**: Automatically detects and converts the main Cypress project
- **Multi-Project Repos**: Provides interactive selection menu for choosing specific projects
- **Complex Repos**: Handles repositories like `cypress-example-recipes` with 100+ example projects

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

### GitHub Repository Conversion Examples

#### Real-World Repository: cypress-example-recipes

```bash
# Convert multi-project repository with interactive selection
cy2pw convert-github --github-url https://github.com/cypress-io/cypress-example-recipes.git --verbose

# Output: Interactive menu with 167 projects found
🔍 Found 167 potential Cypress projects:
❯ 🟢 examples/stubbing-spying__intercept 📄 (20 tests)     # HIGH confidence
  🟢 examples/blogs__element-coverage 📄 (11 tests)        # HIGH confidence
  🟢 examples/server-communication__xhr-assertions 📄 (8 tests)  # HIGH confidence
  🔴 examples/ ❌ (multiple sub-projects)                   # LOW confidence
  ❌ Cancel conversion

# Selected project converted in-place:
# .conversion/cypress-io-cypress-example-recipes/examples/stubbing-spying__intercept/playwright-project/
```

#### Single Project Repository: helenanull/cypress-example

```bash
# Convert repository with branch selection
cy2pw convert-github --github-url https://github.com/helenanull/cypress-example --verbose

# Output: Shows branch selection before project conversion
🌿 Found 5 available branches:
❯   circle-config-1 (current)
    cypress-6.6.0
    cypress-8.0.0
    main
    upgrade-10
  ❌ Cancel conversion

✅ Found single Cypress project: .
   Config: ✅ | Tests: 8 | Confidence: high
🔄 Starting conversion within cloned project...
```

#### Selector File Conversion

```javascript
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

This converter has been specifically tested and optimized for various repository structures:

### 🎯 Supported Repository Types

#### Single Project Repositories
- **helenanull/cypress-example**: Simple Cypress project with 8 tests
- **Basic structure**: Standard `cypress/` directory with config file
- **Automatic detection**: No user interaction required

#### Multi-Project Repositories
- **cypress-io/cypress-example-recipes**: 167 example projects
- **Interactive selection**: Smart project discovery with confidence scoring
- **Complex structure**: Nested examples in `examples/` subdirectories

#### Advanced Repositories
- **cypress-io/cypress-example-kitchensink**: Comprehensive API showcase
- **Enterprise repos**: Monorepos with multiple test suites
- **Tutorial repos**: Educational projects with multiple examples

### 🔍 Project Detection Features

#### Confidence Scoring System
- **🟢 HIGH**: Has `cypress.config.js` + test files
- **🟡 MEDIUM**: Has config file OR (cypress directory + tests)
- **🔴 LOW**: Has test files or cypress directory only

#### Smart Project Ranking
- Projects sorted by confidence level and test count
- Best candidates presented first in interactive menu
- Automatic single-project detection for simple repositories

#### Repository Structure Examples

```
# Simple Repository (auto-detected)
cypress-project/
├── cypress.config.js
├── cypress/
│   └── e2e/
└── package.json

# Multi-Project Repository (interactive selection)
cypress-example-recipes/
├── examples/
│   ├── stubbing-spying__intercept/     # 20 tests (HIGH)
│   ├── blogs__element-coverage/        # 11 tests (HIGH)
│   ├── server-communication__xhr/      # 8 tests (HIGH)
│   └── fundamentals__fixtures/         # 6 tests (HIGH)
└── package.json
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
npm run build  # Build CLI components
```

### Testing

```bash
npm test                    # Run all tests
npm run test:watch          # Run tests in watch mode
npm run test:integration    # Run integration tests with target repositories
npm run lint                # Run ESLint
npm run build               # Build CLI components
npm run build:full          # Build entire project including API
npm run clean               # Clean build directory
npm run dev                 # Start development server with API

# Test CLI commands locally
node dist/cli.js convert --help
node dist/cli.js convert-github --help
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