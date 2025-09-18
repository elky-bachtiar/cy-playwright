# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-18-github-project-converter/spec.md

> Created: 2025-09-18
> Version: 1.0.0

## Technical Requirements

### System Architecture
- **Frontend**: React.js with TypeScript for type safety
- **Backend**: Node.js with Express.js framework
- **File Processing**: Enhanced AST parser built on existing engine
- **Storage**: Temporary file system storage with cleanup mechanisms
- **Queue Management**: Bull Queue with Redis for job processing
- **GitHub Integration**: GitHub API v4 (GraphQL) for repository operations
- **CI/CD Processing**: YAML parsers for GitHub Actions, CircleCI, AppVeyor configurations
- **Container Integration**: Docker API integration for containerized conversion environments
- **Script Analysis**: Advanced package.json and shell script parsing capabilities

### Core Components

#### 1. Repository Analysis Engine
```typescript
interface RepositoryAnalyzer {
  validateRepository(url: string): Promise<RepositoryValidation>
  cloneRepository(url: string, jobId: string): Promise<CloneResult>
  analyzeProject(projectPath: string): Promise<ProjectAnalysis>
  detectPatterns(projectPath: string): Promise<PatternDetection>
}

interface ProjectAnalysis {
  cypressVersion: string
  testFiles: string[]
  configFiles: string[]
  supportFiles: string[]
  fixtureFiles: string[]
  customCommands: CustomCommand[]
  selectorPatterns: SelectorPattern[]
  viewportConfigs: ViewportConfig[]
}
```

#### 2. Enhanced AST Conversion Engine
```typescript
interface EnhancedConverter extends BaseASTConverter {
  convertCentralizedSelectors(selectorFiles: string[]): Promise<ConversionResult>
  convertCustomCommands(commandFiles: string[]): Promise<ConversionResult>
  convertViewportConfigs(configs: ViewportConfig[]): Promise<ConversionResult>
  convertPageObjects(pageObjectFiles: string[]): Promise<ConversionResult>
}
```

#### 3. Pattern Recognition System
```typescript
interface PatternDetector {
  detectSelectorCentralization(projectPath: string): SelectorCentralization
  detectCustomCommandPatterns(projectPath: string): CustomCommandPattern[]
  detectViewportStrategies(projectPath: string): ViewportStrategy[]
  detectPageObjectPatterns(projectPath: string): PageObjectPattern[]
  detectCICDConfigurations(projectPath: string): CICDConfiguration[]
  detectDockerConfigurations(projectPath: string): DockerConfiguration[]
  detectPluginUsage(projectPath: string): PluginUsagePattern[]
  detectScriptPatterns(packageJsonPath: string): ScriptPattern[]
}
```

#### 4. Validation Engine
```typescript
interface ValidationEngine {
  validateConversion(originalPath: string, convertedPath: string): Promise<ValidationResult>
  runDesktopTests(projectPath: string): Promise<TestResult>
  runMobileTests(projectPath: string): Promise<TestResult>
  validateDependencies(projectPath: string): Promise<DependencyValidation>
}
```

### Advanced Pattern Handling

#### Centralized Selectors
- Detect selector files (selectors.js, elements.js, etc.)
- Convert to Playwright locator constants
- Maintain selector organization and naming
- Generate TypeScript definitions for type safety

#### Custom Commands (.cmd.js)
- Parse custom command definitions
- Convert to Page Object Model methods
- Maintain parameter signatures and return types
- Generate proper TypeScript interfaces

#### Dynamic Viewports
- Analyze viewport configuration patterns
- Convert to Playwright project configurations
- Maintain mobile/desktop test variants
- Generate responsive test strategies

#### Page Object Models
- Detect existing POM implementations
- Enhance with Playwright best practices
- Convert element interactions to locator-based
- Maintain abstraction levels

### File Processing Pipeline

#### 1. Repository Acquisition
```bash
# Clone repository to temporary directory
git clone --depth 1 <repository-url> /tmp/conversions/<job-id>/source

# Analyze project structure
npm install --prefix /tmp/conversions/<job-id>/source
```

#### 2. Pattern Analysis
```typescript
const analysis = await analyzeProject(sourcePath)
const patterns = await detectPatterns(sourcePath)
const conversionPlan = generateConversionPlan(analysis, patterns)
```

#### 3. AST Conversion
```typescript
for (const file of conversionPlan.files) {
  const ast = parseFile(file.path)
  const convertedAST = await convertWithPatterns(ast, file.patterns)
  await writeConvertedFile(convertedAST, file.outputPath)
}
```

#### 4. Project Generation
```typescript
await generatePlaywrightConfig(conversionPlan.config)
await generatePackageJson(conversionPlan.dependencies)
await generateTypeDefinitions(conversionPlan.types)
await validateProject(outputPath)
```

### Error Handling and Recovery

#### Repository Validation
- Invalid URL detection and user feedback
- Private repository handling with clear messaging
- Non-Cypress project detection and guidance
- Large repository size limits and warnings

#### Conversion Error Recovery
- Partial conversion success with detailed reporting
- Fallback strategies for unsupported patterns
- Manual intervention hints for complex cases
- Rollback mechanisms for failed conversions

#### Resource Management
- Temporary file cleanup after job completion
- Memory usage monitoring during large conversions
- Timeout handling for long-running operations
- Queue management for concurrent conversions

## Approach

### Development Strategy
1. **Foundation**: Extend existing AST conversion engine with GitHub integration
2. **Pattern Recognition**: Build comprehensive pattern detection library
3. **Validation Framework**: Implement multi-viewport testing validation
4. **API Development**: Create RESTful endpoints with real-time updates
5. **Frontend Integration**: Build intuitive web interface with progress tracking

### Quality Assurance
- Comprehensive test suite covering all pattern types
- Integration tests with real GitHub repositories
- Performance benchmarking with large projects
- User acceptance testing with various project structures

## External Dependencies

### GitHub Integration
- **GitHub API**: Repository access and analysis
- **Git CLI**: Repository cloning and file operations
- **GitHub Actions**: Optional CI/CD integration for validation
- **@octokit/rest**: GitHub API client for repository operations

### Processing Libraries
- **@babel/parser**: Enhanced AST parsing capabilities
- **@babel/traverse**: AST tree traversal and manipulation
- **@babel/generator**: Code generation from modified ASTs
- **jscodeshift**: Advanced code transformation utilities
- **js-yaml**: YAML parsing for CI/CD configuration files
- **dockerode**: Docker API client for container operations
- **semver**: Version parsing and dependency management

### Testing and Validation
- **Playwright**: Test execution and validation
- **Jest**: Unit testing framework
- **Puppeteer**: Fallback browser automation for validation
- **Docker**: Containerized test environments

### Infrastructure
- **Redis**: Job queue and caching
- **Bull**: Queue management and job processing
- **Winston**: Comprehensive logging
- **Multer**: File upload handling
- **Archiver**: Zip file generation for downloads