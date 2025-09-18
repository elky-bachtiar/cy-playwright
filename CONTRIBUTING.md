# Contributing to Cypress to Playwright Converter

Thank you for your interest in contributing to the Cypress to Playwright Converter! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing Guidelines](#testing-guidelines)
- [Code Style Guidelines](#code-style-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)

## Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Git
- TypeScript knowledge
- Familiarity with Cypress and Playwright

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/cypress-to-playwright-converter
   cd cypress-to-playwright-converter
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Tests**
   ```bash
   npm test
   ```

4. **Build Project**
   ```bash
   npm run build
   ```

## Project Structure

```
cypress-to-playwright-converter/
├── src/                    # Source code
│   ├── cli.ts             # CLI interface and argument parsing
│   ├── ast-parser.ts      # TypeScript AST parsing engine
│   ├── command-converter.ts # Command mapping and conversion logic
│   ├── types.ts           # TypeScript type definitions
│   └── index.ts           # Main entry point
├── tests/                 # Test files
│   ├── cli.test.ts        # CLI tests
│   ├── ast-parser.test.ts # AST parser tests
│   └── command-converter.test.ts # Command converter tests
├── docs/                  # Documentation
├── examples/              # Example projects
└── scripts/               # Build and utility scripts
```

### Key Components

- **CLI Module** (`src/cli.ts`): Handles command-line interface, argument parsing, and project validation
- **AST Parser** (`src/ast-parser.ts`): Uses TypeScript Compiler API to parse and analyze Cypress test files
- **Command Converter** (`src/command-converter.ts`): Core conversion logic for transforming Cypress commands to Playwright
- **Type Definitions** (`src/types.ts`): TypeScript interfaces and types used throughout the project

## Development Workflow

### 1. Issue-First Development

- Check existing issues before starting work
- Create an issue for new features or bugs
- Reference the issue number in your commits and PR

### 2. Branch Naming

- `feature/issue-number-short-description` for new features
- `fix/issue-number-short-description` for bug fixes
- `docs/short-description` for documentation updates
- `test/short-description` for test improvements

### 3. Development Process

1. Create a feature branch from `main`
2. Make your changes
3. Add/update tests
4. Run the test suite
5. Update documentation if needed
6. Submit a pull request

## Testing Guidelines

### Test Structure

We use Jest for testing with the following test categories:

- **Unit Tests**: Test individual functions and methods
- **Integration Tests**: Test component interactions
- **End-to-End Tests**: Test full conversion workflows

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --testPathPattern=ast-parser.test.ts

# Run specific test case
npm test -- --testNamePattern="should parse cypress commands"
```

### Writing Tests

1. **Test File Naming**: `*.test.ts` for test files
2. **Test Structure**: Use `describe` and `it` blocks for organization
3. **Test Data**: Create realistic test data that represents actual Cypress projects
4. **Assertions**: Use Jest matchers for clear and descriptive assertions

Example test structure:

```typescript
describe('CommandConverter', () => {
  let converter: CommandConverter;

  beforeEach(() => {
    converter = new CommandConverter();
  });

  describe('basic command mapping', () => {
    it('should convert cy.visit to page.goto', () => {
      const cypressCommand = { command: 'visit', args: ['/login'] };
      const result = converter.convertCommand(cypressCommand);

      expect(result.playwrightCode).toBe("await page.goto('/login')");
      expect(result.requiresAwait).toBe(true);
    });
  });
});
```

### Test Coverage

- Maintain test coverage above 80%
- All new features must include tests
- Bug fixes should include regression tests

## Code Style Guidelines

### TypeScript Guidelines

- Use strict TypeScript configuration
- Prefer interfaces over types for object shapes
- Use explicit return types for public methods
- Avoid `any` types - use proper typing

### Code Formatting

We use ESLint and Prettier for code formatting:

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Naming Conventions

- **Variables/Functions**: camelCase (`convertCommand`, `testFilePath`)
- **Classes**: PascalCase (`CommandConverter`, `ASTParser`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_TIMEOUT`, `SUPPORTED_EXTENSIONS`)
- **Files**: kebab-case (`command-converter.ts`, `ast-parser.ts`)

### Code Organization

- Keep functions small and focused (< 20 lines when possible)
- Use descriptive variable and function names
- Add JSDoc comments for public APIs
- Group related functionality in classes
- Separate concerns (parsing, conversion, output)

## Commit Message Guidelines

We follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks

### Examples

```
feat(converter): add support for cy.intercept command conversion

- Implement route handler conversion
- Add network request mocking support
- Update command mapping tables

Closes #123
```

```
fix(parser): handle nested describe blocks correctly

- Fix AST traversal for nested test structures
- Add proper scope tracking
- Include regression test

Fixes #456
```

## Pull Request Process

### Before Submitting

1. **Run Tests**: Ensure all tests pass
2. **Run Linting**: Fix any linting errors
3. **Update Documentation**: Update README or docs if needed
4. **Test Manually**: Test your changes with real Cypress projects
5. **Check Coverage**: Maintain or improve test coverage

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] Added tests for new functionality
- [ ] Tested with sample Cypress projects

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console errors or warnings

## Related Issues
Closes #123
```

### Review Process

1. At least one maintainer review required
2. All CI checks must pass
3. No merge conflicts
4. Up-to-date with main branch

## Release Process

### Version Numbering

We follow [Semantic Versioning (SemVer)](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create release PR
4. Tag release after merge
5. Publish to npm

## Getting Help

### Resources

- 📖 [Project Documentation](./README.md)
- 🐛 [Issue Tracker](https://github.com/your-org/cypress-to-playwright-converter/issues)
- 💬 [Discussions](https://github.com/your-org/cypress-to-playwright-converter/discussions)

### Questions?

- Create a discussion for general questions
- Open an issue for bugs or feature requests
- Check existing issues and discussions first

## Recognition

Contributors are recognized in:

- README.md contributors section
- Release notes
- Annual contributor highlights

Thank you for contributing to making test migration easier for the community! 🚀