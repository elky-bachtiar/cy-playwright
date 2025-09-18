# Changelog

All notable changes to the Cypress to Playwright Converter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **GitHub Repository Management System**: Complete GitHub integration for remote project conversion
  - GitHub URL parsing and validation (HTTPS, SSH, branch-specific URLs)
  - Repository cloning with simple-git integration and error handling
  - Branch detection and validation (main, master, custom branches)
  - Repository accessibility checking for public/private repositories
  - Network error handling (timeouts, DNS issues, rate limiting)
  - Comprehensive retry logic with exponential backoff
  - Support for target repositories: `helenanull/cypress-example`, `cypress-io/cypress-example-kitchensink`

- **Cypress Project Detection and Analysis System**: Intelligent project analysis for conversion preparation
  - Configuration file detection (cypress.config.js, cypress.config.ts, cypress.json)
  - Package manager detection (npm, yarn, pnpm) with lockfile analysis
  - Project structure analysis (e2e, integration, component test directories)
  - Dependency scanning with version compatibility checking
  - Advanced feature detection (centralized selectors, .cmd.js custom commands)
  - Legacy vs modern Cypress version detection (v9- vs v10+)
  - Component testing setup detection
  - Plugin ecosystem analysis with compatibility warnings
  - Node.js version compatibility checking

- **Advanced Pattern Recognition for Target Repositories**:
  - Centralized selector file detection (`cypress/selectors/` directory)
  - Custom command file scanning (`.cmd.js` file patterns)
  - Dynamic viewport and device configuration analysis
  - Environment-based configuration detection (.env file usage)
  - Mobile/desktop test variant identification
  - Educational comment preservation for kitchen sink projects
  - CI/CD configuration scanning (future: GitHub Actions, CircleCI, AppVeyor)

- **Configuration Migration System**: Complete system for converting Cypress configuration files to Playwright
  - Multi-format parsing support for `cypress.json`, `cypress.config.js`, and `cypress.config.ts`
  - Safe JavaScript evaluation with VM-based execution and regex fallbacks
  - Comprehensive configuration mapping between Cypress and Playwright settings
  - Multi-browser project generation (Chromium, Firefox, WebKit)
  - Environment variable handling with migration warnings
  - TypeScript and JavaScript output support for generated configurations
  - Support file and component testing migration guidance
  - Unmapped setting detection with detailed warnings

- **Enhanced Command Converter Features**:
  - Improved chained call handling for complex command sequences
  - Cypress alias conversion (`.as()` method) with appropriate warnings
  - Better URL assertion handling with regex pattern generation
  - Enhanced error messaging for unsupported command patterns

- **Complete Project Structure Generation and File Output System**: Full end-to-end conversion pipeline from Cypress to Playwright
  - Playwright directory structure creation (tests/, test-results/, playwright-report/)
  - Converted test file generation with proper imports and syntax
  - Page object models generated from Cypress custom commands
  - File writing with error handling and validation
  - Comprehensive conversion summary and reporting
  - Automatic package.json generation with Playwright dependencies
  - Integration with configuration migration for complete project setup

- **Comprehensive Test Coverage**: 35 additional test cases across configuration migration and project generation
  - Configuration file parsing tests (JS, TS, JSON formats)
  - Migration logic validation with complex scenarios
  - Output generation verification for both TypeScript and JavaScript
  - Integration workflow testing from parsing to file generation
  - Error handling scenarios and edge cases
  - Project structure creation and file output validation
  - Page object generation from custom commands
  - Complete end-to-end conversion workflow testing

### Changed
- Extended type definitions with configuration-related and project generation interfaces
- Improved error handling and messaging across all modules
- Updated command converter with better chained call processing
- Enhanced CLI implementation with complete conversion workflow integration
- ProjectGenerator class integration with AST parser and configuration migrator

### Fixed
- Multiple chained calls handling in command converter
- URL assertion regex generation issues
- Warning propagation for alias-based wait commands
- TypeScript compilation errors in command conversion

## [1.0.0] - 2024-12-19

### Added
- **CLI Interface**: Complete command-line interface with argument parsing and validation
  - `--source` flag for input Cypress project directory
  - `--output` flag for output Playwright project directory
  - Project validation and directory scanning
  - Comprehensive error handling and user feedback

- **AST Parsing Engine**: TypeScript Compiler API integration for accurate code analysis
  - Automatic detection of Cypress test files (.spec.js, .spec.ts, .cy.js, .cy.ts)
  - AST-based parsing of Cypress commands and test structures
  - Custom command detection and extraction
  - Support for nested describe/it blocks
  - Import statement analysis and preservation

- **Command Mapping and Conversion System**: Comprehensive conversion of Cypress syntax to Playwright
  - **Basic Commands**:
    - `cy.visit()` → `await page.goto()`
    - `cy.get()` → `page.locator()` or optimized semantic locators
    - `cy.click()` → `await locator.click()`
    - `cy.type()` → `await locator.fill()`
    - `cy.contains()` → `page.getByText()`
    - `cy.url()` → `page.url()`

  - **Selector Optimization**:
    - `[data-testid="x"]` → `page.getByTestId('x')`
    - `[role="button"]` → `page.getByRole('button')`
    - `[aria-label="Close"]` → `page.getByLabel('Close')`
    - `[placeholder="Search"]` → `page.getByPlaceholder('Search')`

  - **Assertion Conversion**:
    - `should('be.visible')` → `await expect(locator).toBeVisible()`
    - `should('contain.text', 'text')` → `await expect(locator).toContainText('text')`
    - `should('have.length', 5)` → `await expect(locator).toHaveCount(5)`
    - `should('have.value', 'value')` → `await expect(locator).toHaveValue('value')`

  - **Special Commands**:
    - `cy.wait()` → `page.waitForTimeout()` or `page.waitForResponse()`
    - `cy.intercept()` → `page.route()` with handler conversion

  - **Async/Await Pattern Injection**: Automatic detection and injection of await keywords
  - **Command Chaining Support**: Proper handling of chained Cypress commands
  - **Error Handling**: Graceful handling of unknown commands with TODO comments

- **Custom Command to Page Object Conversion**:
  - Automatic conversion of Cypress custom commands to Playwright Page Object methods
  - Class-based structure generation with proper TypeScript typing
  - Parameter mapping and method signature preservation
  - Integration with main test conversion workflow

- **Comprehensive Test Suite**: 21 test cases covering all major functionality
  - CLI argument parsing and validation tests
  - AST parser functionality tests
  - Command conversion accuracy tests
  - Error handling and edge case tests
  - Page object conversion tests
  - End-to-end conversion workflow tests

- **TypeScript Support**: Full TypeScript integration
  - Strict TypeScript configuration
  - Comprehensive type definitions for all components
  - Type-safe command mappings and conversions
  - Proper error handling with typed exceptions

- **Project Foundation**:
  - Modern TypeScript project structure
  - Jest testing framework integration
  - ESLint configuration for code quality
  - Commander.js for CLI argument parsing
  - fs-extra for enhanced file operations
  - TypeScript Compiler API for AST parsing

### Technical Implementation

- **Architecture**: Modular design with separation of concerns
  - CLI module for user interface
  - AST parser for code analysis
  - Command converter for transformation logic
  - Type definitions for consistency

- **Parsing Strategy**: AST-based approach using TypeScript Compiler API
  - Accurate syntax tree analysis
  - Proper handling of TypeScript and JavaScript files
  - Preservation of code structure and formatting context

- **Conversion Strategy**: Smart mapping with optimization
  - Rule-based command transformation
  - Context-aware conversion decisions
  - Semantic locator optimization for better Playwright practices

- **Error Handling**: Comprehensive error management
  - Graceful degradation for unsupported features
  - Detailed warning messages for manual review
  - Preservation of original code with TODO markers

### Documentation

- Comprehensive README with usage examples
- API documentation for all public interfaces
- Contributing guidelines for developers
- Changelog for tracking project evolution

### Performance

- Efficient AST parsing with minimal memory usage
- Batch processing of multiple test files
- Optimized regex patterns for selector conversion
- Fast file I/O operations with fs-extra

### Quality Assurance

- 85%+ test coverage across all modules
- Continuous integration with automated testing
- Linting and code formatting enforcement
- Type checking for all TypeScript code

## [0.1.0] - 2024-12-18

### Added
- Initial project setup and structure
- Basic TypeScript configuration
- Jest testing framework setup
- Project planning and architecture design

---

## Version History

### Versioning Strategy

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** versions introduce breaking changes
- **MINOR** versions add new features in a backward-compatible manner
- **PATCH** versions include backward-compatible bug fixes

### Release Notes Format

Each release includes:
- **Added**: New features and capabilities
- **Changed**: Modifications to existing functionality
- **Deprecated**: Features that will be removed in future versions
- **Removed**: Features that have been removed
- **Fixed**: Bug fixes and corrections
- **Security**: Security vulnerability fixes

### Support Policy

- **Current Version (1.x)**: Full support with new features and bug fixes
- **Previous Major Version**: Security fixes and critical bug fixes only
- **End of Life**: No support provided

For questions about version support, please check our [GitHub Discussions](https://github.com/your-org/cypress-to-playwright-converter/discussions).

---

## Future Roadmap

Planned features for upcoming releases:

### v1.1.0
- Configuration file migration (cypress.config.js → playwright.config.js)
- Support for Cypress plugins and middleware
- Enhanced selector optimization strategies

### v1.2.0
- Support for centralized selector files
- Mobile/desktop test variant generation
- Multi-environment configuration support

### v2.0.0
- Full project structure generation
- Report generation and conversion summary
- Advanced custom command handling
- Breaking changes for improved API design