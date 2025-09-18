# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-18-github-project-converter/spec.md

> Created: 2025-09-18
> Version: 1.0.0

## Endpoints

### Repository Operations

#### `POST /api/repositories/validate`
Validate a GitHub repository URL and check if it contains a valid Cypress project.

**Request Body:**
```json
{
  "repositoryUrl": "https://github.com/helenanull/cypress-example",
  "branch": "main"
}
```

**Response:**
```json
{
  "valid": true,
  "repository": {
    "owner": "helenanull",
    "name": "cypress-example",
    "branch": "main",
    "lastCommit": "abc123def456",
    "size": 1024000
  },
  "cypressProject": {
    "detected": true,
    "version": "12.17.4",
    "configFile": "cypress.config.js",
    "testCount": 15,
    "supportFiles": 3,
    "fixtureFiles": 8
  },
  "patterns": {
    "centralizedSelectors": true,
    "customCommands": true,
    "pageObjects": true,
    "dynamicViewports": true
  }
}
```

#### `GET /api/repositories/{owner}/{repo}/analysis`
Get detailed analysis of a repository's Cypress project structure.

**Response:**
```json
{
  "projectStructure": {
    "testFiles": [
      "cypress/e2e/login.cy.js",
      "cypress/e2e/dashboard.cy.js"
    ],
    "supportFiles": [
      "cypress/support/commands.js",
      "cypress/support/selectors.js"
    ],
    "fixtureFiles": [
      "cypress/fixtures/users.json",
      "cypress/fixtures/testdata.json"
    ]
  },
  "detectedPatterns": [
    {
      "type": "centralized-selectors",
      "files": ["cypress/support/selectors.js"],
      "complexity": "medium"
    },
    {
      "type": "custom-commands",
      "files": ["cypress/support/login.cmd.js"],
      "complexity": "high"
    }
  ],
  "conversionComplexity": "medium",
  "estimatedDuration": 180
}
```

### Conversion Management

#### `POST /api/conversions`
Start a new conversion job for a GitHub repository.

**Request Body:**
```json
{
  "repositoryUrl": "https://github.com/helenanull/cypress-example",
  "branch": "main",
  "options": {
    "includeValidation": true,
    "mobileViewport": true,
    "generateTypes": true,
    "preserveStructure": false
  },
  "notificationEmail": "developer@example.com"
}
```

**Response:**
```json
{
  "jobId": "conv_1234567890abcdef",
  "status": "queued",
  "estimatedDuration": 180,
  "createdAt": "2025-09-18T10:30:00Z",
  "repositoryInfo": {
    "owner": "helenanull",
    "name": "cypress-example",
    "branch": "main"
  }
}
```

#### `GET /api/conversions/{jobId}/status`
Get the current status of a conversion job.

**Response:**
```json
{
  "jobId": "conv_1234567890abcdef",
  "status": "processing",
  "progress": {
    "currentStep": "ast-conversion",
    "completedSteps": ["repository-clone", "pattern-analysis"],
    "totalSteps": 6,
    "percentage": 50
  },
  "details": {
    "filesProcessed": 12,
    "totalFiles": 24,
    "currentFile": "cypress/e2e/dashboard.cy.js",
    "patterns": {
      "converted": 3,
      "total": 5
    }
  },
  "startedAt": "2025-09-18T10:30:05Z",
  "estimatedCompletion": "2025-09-18T10:33:05Z"
}
```

#### `GET /api/conversions/{jobId}/result`
Get the result of a completed conversion job.

**Response:**
```json
{
  "jobId": "conv_1234567890abcdef",
  "status": "completed",
  "result": {
    "success": true,
    "downloadUrl": "/api/conversions/conv_1234567890abcdef/download",
    "downloadExpires": "2025-09-25T10:35:00Z",
    "statistics": {
      "filesConverted": 24,
      "testsConverted": 15,
      "patternsHandled": 5,
      "validationResults": {
        "desktop": {
          "passed": 14,
          "failed": 1,
          "skipped": 0
        },
        "mobile": {
          "passed": 13,
          "failed": 2,
          "skipped": 0
        }
      }
    },
    "warnings": [
      "Some custom commands required manual review",
      "Mobile viewport tests need adjustment"
    ]
  },
  "completedAt": "2025-09-18T10:35:00Z"
}
```

#### `GET /api/conversions/{jobId}/download`
Download the converted Playwright project as a zip file.

**Response:** Binary zip file with headers:
```
Content-Type: application/zip
Content-Disposition: attachment; filename="cypress-example-playwright.zip"
Content-Length: 2048000
```

#### `DELETE /api/conversions/{jobId}`
Cancel a running conversion job or delete completed job data.

**Response:**
```json
{
  "jobId": "conv_1234567890abcdef",
  "status": "cancelled",
  "message": "Conversion job cancelled and resources cleaned up"
}
```

### Job Management

#### `GET /api/conversions`
List conversion jobs with filtering and pagination.

**Query Parameters:**
- `status`: Filter by job status (queued, processing, completed, failed, cancelled)
- `limit`: Number of results per page (default: 20, max: 100)
- `offset`: Pagination offset
- `repository`: Filter by repository name

**Response:**
```json
{
  "jobs": [
    {
      "jobId": "conv_1234567890abcdef",
      "status": "completed",
      "repository": "helenanull/cypress-example",
      "createdAt": "2025-09-18T10:30:00Z",
      "completedAt": "2025-09-18T10:35:00Z",
      "duration": 300
    }
  ],
  "pagination": {
    "total": 156,
    "limit": 20,
    "offset": 0,
    "hasNext": true
  }
}
```

#### `GET /api/conversions/stats`
Get conversion statistics and system health.

**Response:**
```json
{
  "system": {
    "status": "healthy",
    "queueLength": 3,
    "activeJobs": 2,
    "availableWorkers": 5
  },
  "statistics": {
    "totalConversions": 1247,
    "successRate": 94.2,
    "averageDuration": 165,
    "popularRepositories": [
      "cypress-io/cypress-example-kitchensink",
      "helenanull/cypress-example",
      "bahmutov/cypress-examples"
    ]
  }
}
```

### WebSocket Events

#### Connection: `/ws/conversions/{jobId}`
Real-time updates for conversion job progress.

**Events:**
```json
// Job started
{
  "event": "job-started",
  "jobId": "conv_1234567890abcdef",
  "timestamp": "2025-09-18T10:30:05Z"
}

// Progress update
{
  "event": "progress",
  "jobId": "conv_1234567890abcdef",
  "step": "ast-conversion",
  "progress": 45,
  "message": "Converting cypress/e2e/login.cy.js",
  "timestamp": "2025-09-18T10:31:30Z"
}

// Job completed
{
  "event": "job-completed",
  "jobId": "conv_1234567890abcdef",
  "downloadUrl": "/api/conversions/conv_1234567890abcdef/download",
  "timestamp": "2025-09-18T10:35:00Z"
}

// Job failed
{
  "event": "job-failed",
  "jobId": "conv_1234567890abcdef",
  "error": "Repository not accessible",
  "timestamp": "2025-09-18T10:31:00Z"
}
```

## Controllers

### RepositoryController
```typescript
class RepositoryController {
  async validateRepository(req: Request, res: Response): Promise<void>
  async analyzeRepository(req: Request, res: Response): Promise<void>
  private async fetchRepositoryInfo(url: string): Promise<RepositoryInfo>
  private async detectCypressProject(repoPath: string): Promise<CypressDetection>
}
```

### ConversionController
```typescript
class ConversionController {
  async createConversion(req: Request, res: Response): Promise<void>
  async getConversionStatus(req: Request, res: Response): Promise<void>
  async getConversionResult(req: Request, res: Response): Promise<void>
  async downloadConversion(req: Request, res: Response): Promise<void>
  async cancelConversion(req: Request, res: Response): Promise<void>
  async listConversions(req: Request, res: Response): Promise<void>
  async getConversionStats(req: Request, res: Response): Promise<void>
}
```

### WebSocketController
```typescript
class WebSocketController {
  async handleConnection(socket: WebSocket, jobId: string): Promise<void>
  async broadcastProgress(jobId: string, progress: ProgressUpdate): Promise<void>
  async broadcastCompletion(jobId: string, result: ConversionResult): Promise<void>
  async broadcastError(jobId: string, error: ConversionError): Promise<void>
}
```

### ValidationController
```typescript
class ValidationController {
  async validateConvertedProject(projectPath: string): Promise<ValidationResult>
  async runDesktopTests(projectPath: string): Promise<TestResult>
  async runMobileTests(projectPath: string): Promise<TestResult>
  async generateValidationReport(results: ValidationResult[]): Promise<ValidationReport>
}
```

## Error Responses

### Standard Error Format
```json
{
  "error": {
    "code": "INVALID_REPOSITORY",
    "message": "The provided repository URL is not accessible or does not contain a valid Cypress project",
    "details": {
      "repositoryUrl": "https://github.com/invalid/repo",
      "cause": "Repository not found"
    },
    "timestamp": "2025-09-18T10:30:00Z"
  }
}
```

### Error Codes
- `INVALID_REPOSITORY`: Repository URL is invalid or inaccessible
- `CONVERSION_FAILED`: Conversion process encountered an error
- `JOB_NOT_FOUND`: Requested conversion job does not exist
- `DOWNLOAD_EXPIRED`: Download link has expired
- `RATE_LIMIT_EXCEEDED`: Too many requests from client
- `SYSTEM_OVERLOAD`: System is temporarily unavailable
- `VALIDATION_FAILED`: Converted project failed validation tests