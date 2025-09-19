# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-18-gitlab-project-converter/spec.md

## Endpoints

### POST /api/convert

**Purpose:** Unified conversion endpoint that accepts both GitHub and GitLab repository URLs
**Parameters:**
- `repositoryUrl` (string): GitHub or GitLab repository URL
- `authToken` (string, optional): Personal access token for private repositories
- `targetBranch` (string, optional): Specific branch to convert (defaults to default branch)
**Response:**
```json
{
  "conversionId": "string",
  "status": "processing|completed|failed",
  "platform": "github|gitlab",
  "repositoryInfo": {
    "name": "string",
    "owner": "string",
    "branch": "string",
    "isPrivate": "boolean"
  },
  "downloadUrl": "string"
}
```
**Errors:** 400 (Invalid URL), 401 (Authentication required), 403 (Access denied), 404 (Repository not found)

### GET /api/convert/:conversionId

**Purpose:** Check conversion status and retrieve results
**Parameters:**
- `conversionId` (string): Unique conversion identifier
**Response:**
```json
{
  "conversionId": "string",
  "status": "processing|completed|failed",
  "progress": "number",
  "downloadUrl": "string",
  "error": "string"
}
```
**Errors:** 404 (Conversion not found)

### POST /api/validate-repository

**Purpose:** Validate repository URL and check accessibility before conversion
**Parameters:**
- `repositoryUrl` (string): Repository URL to validate
- `authToken` (string, optional): Authentication token
**Response:**
```json
{
  "isValid": "boolean",
  "platform": "github|gitlab",
  "isAccessible": "boolean",
  "requiresAuth": "boolean",
  "repositoryInfo": {
    "name": "string",
    "owner": "string",
    "defaultBranch": "string",
    "isPrivate": "boolean",
    "hasCypressTests": "boolean"
  }
}
```
**Errors:** 400 (Invalid URL format), 401 (Authentication required), 404 (Repository not found)