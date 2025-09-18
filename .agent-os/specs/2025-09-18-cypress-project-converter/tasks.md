# Spec Tasks

## Tasks

- [x] 1. Set up project foundation and CLI interface
  - [x] 1.1 Write tests for CLI argument parsing and project structure
  - [x] 1.2 Initialize TypeScript project with proper configuration
  - [x] 1.3 Install and configure dependencies (commander, fs-extra, @typescript-eslint/typescript-estree)
  - [x] 1.4 Create CLI entry point with basic command structure
  - [x] 1.5 Implement project directory validation and scanning
  - [x] 1.6 Verify all tests pass

- [x] 2. Build AST parsing engine for Cypress files
  - [x] 2.1 Write tests for TypeScript AST parsing and file detection
  - [x] 2.2 Implement Cypress test file scanner (.spec.js, .spec.ts, .cy.js, .cy.ts)
  - [x] 2.3 Create AST parser using TypeScript Compiler API
  - [x] 2.4 Build Cypress command extraction from syntax trees
  - [x] 2.5 Implement custom command detection and parsing
  - [x] 2.6 Verify all tests pass
  - [ ] 2.7 Add support for centralized selector file parsing (cypress/selectors/)
  - [ ] 2.8 Extend scanner to detect .cmd.js custom command files
  - [ ] 2.9 Parse dynamic viewport and device configuration patterns

- [x] 3. Create command mapping and conversion system
  - [x] 3.1 Write tests for Cypress to Playwright command mapping
  - [x] 3.2 Implement core command mapping tables (cy.get → page.locator, cy.click → locator.click)
  - [x] 3.3 Build assertion conversion system (should → expect)
  - [x] 3.4 Create async/await pattern injection for Playwright syntax
  - [x] 3.5 Implement custom command to page object conversion
  - [x] 3.6 Verify all tests pass
  - [ ] 3.7 Implement selector-to-locator mapping system for centralized selectors
  - [ ] 3.8 Add device-specific command mapping for mobile/desktop variants
  - [ ] 3.9 Handle .cmd.js custom command to page object conversion

- [x] 4. Develop configuration migration system
  - [x] 4.1 Write tests for configuration file parsing and conversion
  - [x] 4.2 Parse cypress.config.js and extract settings
  - [x] 4.3 Map Cypress configuration to Playwright equivalents
  - [x] 4.4 Generate playwright.config.js with proper browser and viewport settings
  - [x] 4.5 Handle environment variables and custom configuration
  - [x] 4.6 Verify all tests pass
  - [ ] 4.7 Implement dynamic viewport configuration detection and parsing
  - [ ] 4.8 Map Cypress viewport configs to Playwright device emulation
  - [ ] 4.9 Parse environment-based configuration files and .env files
  - [ ] 4.10 Generate multi-environment Playwright configuration files

- [x] 5. Implement project structure generation and file output
  - [x] 5.1 Write tests for Playwright project structure creation
  - [x] 5.2 Create Playwright directory structure (tests/, test-results/, playwright-report/)
  - [x] 5.3 Generate converted test files with proper imports and syntax
  - [x] 5.4 Create page object files from custom commands
  - [x] 5.5 Implement file writing with error handling and validation
  - [x] 5.6 Add conversion summary and report generation
  - [x] 5.7 Verify all tests pass and end-to-end conversion works
  - [ ] 5.8 Generate mobile/desktop test variants and separate projects
  - [ ] 5.9 Organize selector files in appropriate Playwright structure
  - [ ] 5.10 Create multi-device project configuration files