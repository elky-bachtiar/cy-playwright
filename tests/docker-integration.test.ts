import { DockerConfigConverter } from '../src/docker-config-converter';
import { CypressProjectDetector } from '../src/cypress-project-detector';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Mock fs-extra
jest.mock('fs-extra');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock js-yaml
jest.mock('js-yaml');
const mockYaml = yaml as jest.Mocked<typeof yaml>;

describe('Docker Integration Conversion', () => {
  let dockerConverter: DockerConfigConverter;
  let projectDetector: CypressProjectDetector;
  let mockProjectPath: string;
  let mockOutputPath: string;

  beforeEach(() => {
    dockerConverter = new DockerConfigConverter();
    projectDetector = new CypressProjectDetector();
    mockProjectPath = '/mock/cypress/project';
    mockOutputPath = '/mock/playwright/project';

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default fs.existsSync behavior
    mockFs.existsSync.mockImplementation((filePath: string) => {
      const pathStr = filePath.toString();
      return pathStr.includes('Dockerfile') ||
             pathStr.includes('docker-compose') ||
             pathStr.includes('.dockerignore');
    });

    // Setup default fs.readFileSync behavior
    mockFs.readFileSync.mockImplementation((filePath: string) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('Dockerfile')) {
        return mockDockerfile;
      } else if (pathStr.includes('docker-compose.yml')) {
        return mockDockerCompose;
      } else if (pathStr.includes('.dockerignore')) {
        return mockDockerIgnore;
      }
      return '';
    });

    // Setup default yaml.load behavior
    mockYaml.load.mockImplementation((content: string) => {
      if (content.includes('cypress')) return mockParsedDockerCompose;
      return {};
    });

    // Setup default yaml.dump behavior
    mockYaml.dump.mockReturnValue(mockConvertedDockerComposeYaml);
  });

  const mockDockerfile = `
FROM cypress/included:13.6.2

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Install Chrome for Cypress
RUN apt-get update && apt-get install -y \\
    google-chrome-stable

# Set environment variables
ENV CYPRESS_CACHE_FOLDER=/root/.cache/Cypress
ENV CYPRESS_VERIFY_TIMEOUT=100000

# Run Cypress tests
CMD ["npm", "run", "cy:run"]
  `;

  const mockDockerCompose = `
version: '3.8'

services:
  cypress-tests:
    build: .
    environment:
      - CYPRESS_baseUrl=http://web:3000
      - CYPRESS_RECORD_KEY=\${CYPRESS_RECORD_KEY}
    volumes:
      - ./cypress/videos:/app/cypress/videos
      - ./cypress/screenshots:/app/cypress/screenshots
    depends_on:
      - web
    command: npm run cy:run

  web:
    image: nginx:alpine
    ports:
      - "3000:80"
    volumes:
      - ./dist:/usr/share/nginx/html

  database:
    image: postgres:13
    environment:
      POSTGRES_DB: testdb
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
    ports:
      - "5432:5432"
  `;

  const mockParsedDockerCompose = {
    version: '3.8',
    services: {
      'cypress-tests': {
        build: '.',
        environment: [
          'CYPRESS_baseUrl=http://web:3000',
          'CYPRESS_RECORD_KEY=${CYPRESS_RECORD_KEY}'
        ],
        volumes: [
          './cypress/videos:/app/cypress/videos',
          './cypress/screenshots:/app/cypress/screenshots'
        ],
        depends_on: ['web'],
        command: 'npm run cy:run'
      },
      web: {
        image: 'nginx:alpine',
        ports: ['3000:80'],
        volumes: ['./dist:/usr/share/nginx/html']
      },
      database: {
        image: 'postgres:13',
        environment: {
          POSTGRES_DB: 'testdb',
          POSTGRES_USER: 'testuser',
          POSTGRES_PASSWORD: 'testpass'
        },
        ports: ['5432:5432']
      }
    }
  };

  const mockConvertedDockerComposeYaml = `
version: '3.8'

services:
  playwright-tests:
    build: .
    environment:
      - PLAYWRIGHT_baseURL=http://web:3000
    volumes:
      - ./test-results:/app/test-results
      - ./playwright-report:/app/playwright-report
    depends_on:
      - web
    command: npx playwright test

  web:
    image: nginx:alpine
    ports:
      - "3000:80"
    volumes:
      - ./dist:/usr/share/nginx/html

  database:
    image: postgres:13
    environment:
      POSTGRES_DB: testdb
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
    ports:
      - "5432:5432"
  `;

  const mockDockerIgnore = `
node_modules
npm-debug.log
cypress/videos
cypress/screenshots
.git
.gitignore
README.md
.env
  `;

  describe('Docker Configuration Detection', () => {
    it('should detect Dockerfile in project', async () => {
      const dockerFiles = await dockerConverter.detectDockerFiles(mockProjectPath);

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        path.join(mockProjectPath, 'Dockerfile')
      );
      expect(dockerFiles).toContain(path.join(mockProjectPath, 'Dockerfile'));
    });

    it('should detect docker-compose files', async () => {
      const dockerFiles = await dockerConverter.detectDockerFiles(mockProjectPath);

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        path.join(mockProjectPath, 'docker-compose.yml')
      );
      expect(dockerFiles).toEqual(
        expect.arrayContaining([
          expect.stringContaining('docker-compose')
        ])
      );
    });

    it('should detect .dockerignore file', async () => {
      const dockerFiles = await dockerConverter.detectDockerFiles(mockProjectPath);

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        path.join(mockProjectPath, '.dockerignore')
      );
      expect(dockerFiles).toContain(path.join(mockProjectPath, '.dockerignore'));
    });

    it('should return empty array when no Docker files exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const dockerFiles = await dockerConverter.detectDockerFiles(mockProjectPath);

      expect(dockerFiles).toEqual([]);
    });
  });

  describe('Dockerfile Conversion', () => {
    it('should parse Dockerfile content correctly', () => {
      const dockerfileContent = dockerConverter.parseDockerfile(mockDockerfile);

      expect(dockerfileContent.baseImage).toBe('cypress/included:13.6.2');
      expect(dockerfileContent.commands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ instruction: 'FROM' }),
          expect.objectContaining({ instruction: 'WORKDIR' }),
          expect.objectContaining({ instruction: 'COPY' }),
          expect.objectContaining({ instruction: 'RUN' }),
          expect.objectContaining({ instruction: 'ENV' }),
          expect.objectContaining({ instruction: 'CMD' })
        ])
      );
    });

    it('should detect Cypress-specific Dockerfile patterns', () => {
      const isCypressDockerfile = dockerConverter.isCypressDockerfile(mockDockerfile);

      expect(isCypressDockerfile).toBe(true);
    });

    it('should reject non-Cypress Dockerfiles', () => {
      const genericDockerfile = `
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]
      `;

      const isCypressDockerfile = dockerConverter.isCypressDockerfile(genericDockerfile);

      expect(isCypressDockerfile).toBe(false);
    });

    it('should convert Cypress base image to Playwright', async () => {
      const convertedDockerfile = await dockerConverter.convertDockerfile(mockDockerfile);

      expect(convertedDockerfile).toContain('FROM mcr.microsoft.com/playwright:v1.40.0-focal');
      expect(convertedDockerfile).not.toContain('cypress/included');
    });

    it('should remove Cypress-specific environment variables', async () => {
      const convertedDockerfile = await dockerConverter.convertDockerfile(mockDockerfile);

      expect(convertedDockerfile).not.toContain('CYPRESS_CACHE_FOLDER');
      expect(convertedDockerfile).not.toContain('CYPRESS_VERIFY_TIMEOUT');
    });

    it('should replace Chrome installation with Playwright dependencies', async () => {
      const convertedDockerfile = await dockerConverter.convertDockerfile(mockDockerfile);

      expect(convertedDockerfile).not.toContain('google-chrome-stable');
      expect(convertedDockerfile).toContain('npx playwright install-deps');
    });

    it('should convert Cypress commands to Playwright', async () => {
      const convertedDockerfile = await dockerConverter.convertDockerfile(mockDockerfile);

      expect(convertedDockerfile).toContain('npx playwright test');
      expect(convertedDockerfile).not.toContain('cy:run');
    });

    it('should add Playwright-specific environment variables', async () => {
      const convertedDockerfile = await dockerConverter.convertDockerfile(
        mockDockerfile,
        { addPlaywrightEnvVars: true }
      );

      expect(convertedDockerfile).toContain('ENV PLAYWRIGHT_HTML_REPORT');
      expect(convertedDockerfile).toContain('ENV PLAYWRIGHT_BROWSERS_PATH');
    });
  });

  describe('Docker Compose Conversion', () => {
    it('should parse docker-compose.yml correctly', async () => {
      const composeConfig = await dockerConverter.parseDockerCompose(
        path.join(mockProjectPath, 'docker-compose.yml')
      );

      expect(mockFs.readFileSync).toHaveBeenCalled();
      expect(mockYaml.load).toHaveBeenCalled();
      expect(composeConfig).toEqual(mockParsedDockerCompose);
    });

    it('should detect Cypress services in docker-compose', () => {
      const isCypressCompose = dockerConverter.isCypressDockerCompose(mockParsedDockerCompose);

      expect(isCypressCompose).toBe(true);
    });

    it('should convert Cypress service to Playwright service', async () => {
      const convertedCompose = await dockerConverter.convertDockerCompose(
        mockParsedDockerCompose
      );

      expect(convertedCompose.services).toHaveProperty('playwright-tests');
      expect(convertedCompose.services).not.toHaveProperty('cypress-tests');
    });

    it('should convert Cypress environment variables to Playwright', async () => {
      const convertedCompose = await dockerConverter.convertDockerCompose(
        mockParsedDockerCompose
      );

      const playwrightService = convertedCompose.services['playwright-tests'];
      expect(playwrightService.environment).toEqual(
        expect.arrayContaining([
          'PLAYWRIGHT_baseURL=http://web:3000'
        ])
      );
      expect(playwrightService.environment).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining('CYPRESS_RECORD_KEY')
        ])
      );
    });

    it('should convert volume mappings from Cypress to Playwright', async () => {
      const convertedCompose = await dockerConverter.convertDockerCompose(
        mockParsedDockerCompose
      );

      const playwrightService = convertedCompose.services['playwright-tests'];
      expect(playwrightService.volumes).toEqual([
        './test-results:/app/test-results',
        './playwright-report:/app/playwright-report'
      ]);
    });

    it('should preserve non-Cypress services unchanged', async () => {
      const convertedCompose = await dockerConverter.convertDockerCompose(
        mockParsedDockerCompose
      );

      expect(convertedCompose.services.web).toEqual(mockParsedDockerCompose.services.web);
      expect(convertedCompose.services.database).toEqual(mockParsedDockerCompose.services.database);
    });

    it('should convert Cypress commands to Playwright commands', async () => {
      const convertedCompose = await dockerConverter.convertDockerCompose(
        mockParsedDockerCompose
      );

      const playwrightService = convertedCompose.services['playwright-tests'];
      expect(playwrightService.command).toBe('npx playwright test');
    });
  });

  describe('Container-based Test Execution Patterns', () => {
    it('should generate Dockerfile for Playwright container execution', async () => {
      const playwrightDockerfile = await dockerConverter.generatePlaywrightDockerfile({
        nodeVersion: '18',
        playwrightVersion: '1.40.0',
        workingDirectory: '/app',
        includeDevDependencies: true
      });

      expect(playwrightDockerfile).toContain('FROM mcr.microsoft.com/playwright:v1.40.0-focal');
      expect(playwrightDockerfile).toContain('WORKDIR /app');
      expect(playwrightDockerfile).toContain('npx playwright install-deps');
    });

    it('should generate docker-compose for Playwright test execution', async () => {
      const playwrightCompose = await dockerConverter.generatePlaywrightDockerCompose({
        serviceName: 'playwright-tests',
        baseUrl: 'http://web:3000',
        parallelExecution: true,
        workers: 4
      });

      expect(playwrightCompose.services['playwright-tests']).toBeDefined();
      expect(playwrightCompose.services['playwright-tests'].command).toContain('--workers=4');
    });

    it('should handle multi-browser container execution', async () => {
      const multiBrowserCompose = await dockerConverter.generateMultiBrowserDockerCompose({
        browsers: ['chromium', 'firefox', 'webkit'],
        baseUrl: 'http://web:3000'
      });

      expect(multiBrowserCompose.services).toHaveProperty('playwright-chromium');
      expect(multiBrowserCompose.services).toHaveProperty('playwright-firefox');
      expect(multiBrowserCompose.services).toHaveProperty('playwright-webkit');
    });

    it('should create container-based parallel execution strategy', async () => {
      const parallelCompose = await dockerConverter.generateParallelExecutionCompose({
        shardCount: 3,
        baseUrl: 'http://web:3000'
      });

      expect(parallelCompose.services).toHaveProperty('playwright-shard-1');
      expect(parallelCompose.services).toHaveProperty('playwright-shard-2');
      expect(parallelCompose.services).toHaveProperty('playwright-shard-3');

      const shard1 = parallelCompose.services['playwright-shard-1'];
      expect(shard1.command).toContain('--shard=1/3');
    });
  });

  describe('Service Dependency Configurations', () => {
    it('should preserve service dependencies in docker-compose', async () => {
      const convertedCompose = await dockerConverter.convertDockerCompose(
        mockParsedDockerCompose
      );

      const playwrightService = convertedCompose.services['playwright-tests'];
      expect(playwrightService.depends_on).toEqual(['web']);
    });

    it('should handle complex service dependency graphs', async () => {
      const complexCompose = {
        version: '3.8',
        services: {
          'cypress-tests': {
            build: '.',
            depends_on: ['web', 'database', 'redis'],
            command: 'npm run cy:run'
          },
          web: {
            build: './web',
            depends_on: ['database']
          },
          database: {
            image: 'postgres:13'
          },
          redis: {
            image: 'redis:alpine'
          }
        }
      };

      const convertedCompose = await dockerConverter.convertDockerCompose(complexCompose);

      const playwrightService = convertedCompose.services['playwright-tests'];
      expect(playwrightService.depends_on).toEqual(['web', 'database', 'redis']);
    });

    it('should convert health check configurations', async () => {
      const composeWithHealthCheck = {
        version: '3.8',
        services: {
          'cypress-tests': {
            build: '.',
            depends_on: {
              web: {
                condition: 'service_healthy'
              }
            },
            command: 'npm run cy:run'
          },
          web: {
            image: 'nginx:alpine',
            healthcheck: {
              test: ['CMD', 'curl', '-f', 'http://localhost:80'],
              interval: '30s',
              timeout: '10s',
              retries: 3
            }
          }
        }
      };

      const convertedCompose = await dockerConverter.convertDockerCompose(composeWithHealthCheck);

      const playwrightService = convertedCompose.services['playwright-tests'];
      expect(playwrightService.depends_on).toEqual({
        web: { condition: 'service_healthy' }
      });
    });
  });

  describe('Docker Environment Configuration', () => {
    it('should convert .dockerignore patterns', async () => {
      const convertedDockerIgnore = await dockerConverter.convertDockerIgnore(mockDockerIgnore);

      expect(convertedDockerIgnore).toContain('test-results');
      expect(convertedDockerIgnore).toContain('playwright-report');
      expect(convertedDockerIgnore).not.toContain('cypress/videos');
      expect(convertedDockerIgnore).not.toContain('cypress/screenshots');
    });

    it('should preserve generic Docker ignore patterns', async () => {
      const convertedDockerIgnore = await dockerConverter.convertDockerIgnore(mockDockerIgnore);

      expect(convertedDockerIgnore).toContain('node_modules');
      expect(convertedDockerIgnore).toContain('.git');
      expect(convertedDockerIgnore).toContain('.env');
    });

    it('should handle Docker build context optimization', async () => {
      const optimizedDockerfile = await dockerConverter.optimizeDockerBuildContext(
        mockDockerfile,
        { minimizeLayerSize: true, useMultiStage: true }
      );

      expect(optimizedDockerfile).toContain('# Multi-stage build');
      expect(optimizedDockerfile).toContain('FROM node:18-alpine as dependencies');
    });
  });

  describe('End-to-End Docker Configuration Conversion', () => {
    it('should convert complete Docker setup', async () => {
      const result = await dockerConverter.convertDockerConfiguration(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.success).toBe(true);
      expect(result.convertedFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'dockerfile' }),
          expect.objectContaining({ type: 'docker-compose' }),
          expect.objectContaining({ type: 'dockerignore' })
        ])
      );
    });

    it('should provide detailed conversion summary', async () => {
      const result = await dockerConverter.convertDockerConfiguration(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.summary).toMatchObject({
        dockerfilesConverted: expect.any(Number),
        composeFilesConverted: expect.any(Number),
        servicesConverted: expect.any(Number),
        conversionTimeMs: expect.any(Number)
      });
    });

    it('should handle Docker conversion errors gracefully', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      const result = await dockerConverter.convertDockerConfiguration(
        mockProjectPath,
        mockOutputPath
      );

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('File read error')
        ])
      );
    });

    it('should write converted Docker files to correct output paths', async () => {
      await dockerConverter.convertDockerConfiguration(mockProjectPath, mockOutputPath);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockOutputPath, 'Dockerfile'),
        expect.any(String),
        'utf8'
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockOutputPath, 'docker-compose.yml'),
        expect.any(String),
        'utf8'
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockOutputPath, '.dockerignore'),
        expect.any(String),
        'utf8'
      );
    });
  });
});