# Spec Tasks

## Tasks

- [ ] 0. GitHub Repository Conversion Enhancement
  - [ ] 0.1 Enhance CLI to support --gitlab-url option for direct Gitlab repository conversion
  - [ ] 0.2 Implement full repository cloning to .conversion directory instead of temporary locations
  - [ ] 0.3 Modify conversion workflow to run within the cloned project directory
  - [ ] 0.4 Update CLI command structure to handle: `cypress-to-playwright-converter --gitlab-url <url> --output ./converted-project`
  - [ ] 0.5 Ensure converted Playwright project is created within the cloned repository directory
  - [ ] 0.6 Add cleanup options for temporary cloned repositories
  - [ ] 0.7 Update repository integration service to support in-project conversion workflow
  - [ ] 0.8 Verify conversion works with both cypress-example-kitchensink and helenanull/cypress-example

- [ ] 1. GitLab Repository Service Implementation
  - [ ] 1.1 Write tests for GitLab repository service
  - [ ] 1.2 Install @gitbeaker/node dependency for GitLab API integration
  - [ ] 1.3 Create GitLab repository service class with API client initialization
  - [ ] 1.4 Implement repository cloning functionality using GitLab API
  - [ ] 1.5 Add branch management and default branch detection
  - [ ] 1.6 Implement GitLab authentication with personal access tokens
  - [ ] 1.7 Add GitLab-specific error handling and rate limiting
  - [ ] 1.8 Verify all tests pass

- [ ] 2. URL Detection and Platform Routing
  - [ ] 2.1 Write tests for URL detection and platform routing
  - [ ] 2.2 Create URL parser to distinguish GitHub vs GitLab URLs
  - [ ] 2.3 Implement platform detection logic with regex patterns
  - [ ] 2.4 Create repository service factory for platform routing
  - [ ] 2.5 Add validation for supported GitLab URL formats
  - [ ] 2.6 Verify all tests pass

- [ ] 3. Repository Service Abstraction
  - [ ] 3.1 Write tests for unified repository interface
  - [ ] 3.2 Create common repository service interface
  - [ ] 3.3 Refactor existing GitHub service to implement interface
  - [ ] 3.4 Ensure GitLab service implements identical interface
  - [ ] 3.5 Add standardized response format mapping
  - [ ] 3.6 Verify all tests pass

- [ ] 4. API Endpoint Integration
  - [ ] 4.1 Write tests for unified conversion endpoints
  - [ ] 4.2 Update POST /api/convert to handle both platforms
  - [ ] 4.3 Add platform detection to conversion workflow
  - [ ] 4.4 Implement POST /api/validate-repository endpoint
  - [ ] 4.5 Update response schemas to include platform information
  - [ ] 4.6 Add GitLab-specific error handling in API layer
  - [ ] 4.7 Verify all tests pass

- [ ] 5. GitLab-Specific Features and Configuration
  - [ ] 5.1 Write tests for GitLab configuration parsing
  - [ ] 5.2 Implement .gitlab-ci.yml file detection and parsing
  - [ ] 5.3 Add GitLab merge request template recognition
  - [ ] 5.4 Handle GitLab-specific project metadata
  - [ ] 5.5 Integrate GitLab features with existing conversion pipeline
  - [ ] 5.6 Verify all tests pass