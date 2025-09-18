// Request and Response types for the API

export interface ConversionRequest {
  repositoryUrl: string;
  outputPath?: string;
  options?: ConversionOptions;
  accessToken?: string;
  branch?: string;
  userEmail?: string;
}

export interface ConversionOptions {
  preserveStructure?: boolean;
  generateTypes?: boolean;
  optimizeSelectors?: boolean;
  includeExamples?: boolean;
  targetPlaywrightVersion?: string;
  customMappings?: Record<string, string>;
  excludePatterns?: string[];
  includePatterns?: string[];
}

export interface ConversionStartResponse {
  jobId: string;
  status: 'queued' | 'started';
  estimatedDuration?: number;
  queuePosition?: number;
  message: string;
}

export interface ConversionStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep: string;
  filesProcessed: number;
  totalFiles: number;
  startTime: string;
  estimatedCompletion?: string;
  completionTime?: string;
  failureTime?: string;
  downloadUrl?: string;
  error?: string;
  errorCode?: string;
  validationResults?: ValidationResults;
  warnings?: ConversionWarning[];
}

export interface ValidationResults {
  testsConverted: number;
  warningsCount: number;
  errorsCount: number;
  compatibilityScore: number;
  recommendations: string[];
}

export interface ConversionWarning {
  type: 'warning' | 'info' | 'error';
  category: string;
  message: string;
  file?: string;
  lineNumber?: number;
  severity: 'low' | 'medium' | 'high';
  suggestion?: string;
}

export interface DownloadInfo {
  filename: string;
  size: number;
  contentType: string;
  lastModified: string;
}

export interface ConversionLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  details?: any;
  file?: string;
  lineNumber?: number;
}

export interface ConversionLogs {
  entries: ConversionLogEntry[];
  total: number;
}

export interface ListConversionsRequest {
  status?: string;
  limit: number;
  offset: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface ListConversionsResponse {
  items: ConversionSummary[];
  total: number;
}

export interface ConversionSummary {
  jobId: string;
  repositoryUrl: string;
  status: string;
  progress: number;
  createdAt: string;
  completedAt?: string;
  duration?: number;
  filesConverted?: number;
  totalFiles?: number;
}

// Repository types
export interface RepositoryValidation {
  valid: boolean;
  cypressVersion?: string;
  testFiles?: string[];
  configFiles?: string[];
  supportFiles?: string[];
  fixtureFiles?: string[];
  pluginFiles?: string[];
  customCommands?: CustomCommandInfo[];
  estimatedConversionTime?: number;
  complexity?: 'low' | 'medium' | 'high';
  potentialIssues?: ConversionWarning[];
  reason?: string;
  suggestions?: string[];
}

export interface CustomCommandInfo {
  name: string;
  file: string;
  lineNumber?: number;
  parameters?: string[];
  complexity: 'low' | 'medium' | 'high';
  description?: string;
}

export interface RepositoryAnalysis {
  repositoryInfo: RepositoryInfo;
  cypressInfo: CypressProjectInfo;
  patterns: ProjectPatterns;
  complexity: ComplexityAnalysis;
  conversionEstimate: ConversionEstimate;
}

export interface RepositoryInfo {
  name: string;
  owner: string;
  description?: string;
  language: string;
  size: number;
  stars: number;
  forks: number;
  openIssues: number;
  lastUpdated: string;
  private?: boolean;
  license?: string;
  topics?: string[];
}

export interface CypressProjectInfo {
  version: string;
  configFile: string;
  testFiles: string[];
  supportFiles: string[];
  fixtureFiles: string[];
  pluginFiles: string[];
  screenshotPath?: string;
  videosPath?: string;
  downloadsPath?: string;
}

export interface ProjectPatterns {
  customCommands: CustomCommandInfo[];
  selectorPatterns: SelectorPatterns;
  pageObjects: PageObjectInfo[];
  viewportConfigurations: ViewportConfig[];
  interceptPatterns: InterceptPattern[];
  taskPatterns: TaskPattern[];
}

export interface SelectorPatterns {
  dataTestIds: number;
  classes: number;
  ids: number;
  attributes: number;
  xpath: number;
  centralized: boolean;
  selectorFiles: string[];
}

export interface PageObjectInfo {
  file: string;
  className: string;
  methods: string[];
  complexity: 'low' | 'medium' | 'high';
  selectorCount: number;
}

export interface ViewportConfig {
  width: number;
  height: number;
  name?: string;
  deviceScaleFactor?: number;
}

export interface InterceptPattern {
  method: string;
  url: string;
  alias?: string;
  file: string;
  lineNumber: number;
}

export interface TaskPattern {
  name: string;
  file: string;
  complexity: 'low' | 'medium' | 'high';
  parameters: string[];
}

export interface ComplexityAnalysis {
  overall: 'low' | 'medium' | 'high';
  testFiles: 'low' | 'medium' | 'high';
  customCommands: 'low' | 'medium' | 'high';
  selectors: 'low' | 'medium' | 'high';
  hooks: 'low' | 'medium' | 'high';
  score: number;
  factors: ComplexityFactor[];
}

export interface ComplexityFactor {
  factor: string;
  impact: 'low' | 'medium' | 'high';
  description: string;
  count?: number;
}

export interface ConversionEstimate {
  estimatedTime: number;
  confidence: 'low' | 'medium' | 'high';
  potentialIssues: ConversionWarning[];
  recommendations: string[];
  blockers?: string[];
}

// GitHub service types
export interface GitHubSearchRequest {
  query: string;
  language?: string;
  stars?: string;
  size?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page: number;
  perPage: number;
}

export interface GitHubSearchResponse {
  totalCount: number;
  repositories: GitHubRepository[];
  page: number;
  perPage: number;
  hasMore: boolean;
}

export interface GitHubRepository {
  name: string;
  fullName: string;
  description?: string;
  stars: number;
  language: string;
  lastUpdated: string;
  cypressVersion?: string;
  testCount?: number;
  complexity?: 'low' | 'medium' | 'high';
  url: string;
  topics?: string[];
}

export interface TrendingRepository extends GitHubRepository {
  starsToday: number;
  category: string;
}

export interface TrendingResponse {
  repositories: TrendingRepository[];
  period: string;
  lastUpdated: string;
}

export interface AccessValidation {
  accessible: boolean;
  permissions: {
    read: boolean;
    write: boolean;
    admin: boolean;
  };
  repositoryInfo?: RepositoryInfo;
  error?: string;
}

export interface BranchInfo {
  name: string;
  sha: string;
  protected: boolean;
  default: boolean;
  lastCommit?: {
    sha: string;
    message: string;
    author: string;
    date: string;
  };
}

export interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  sha?: string;
  lastModified?: string;
  children?: FileTreeItem[];
}

export interface FileContent {
  name: string;
  path: string;
  content: string;
  encoding: string;
  size: number;
  sha: string;
  lastModified: string;
  language?: string;
}

// Health and metrics types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: ServiceHealth;
}

export interface ServiceHealth {
  database: {
    status: 'healthy' | 'unhealthy';
    details?: any;
    error?: string;
  };
  redis: {
    status: 'healthy' | 'unhealthy';
    details?: any;
    error?: string;
  };
  fileSystem: {
    status: 'healthy' | 'unhealthy';
    details?: any;
    error?: string;
  };
}

export interface DetailedHealthStatus extends HealthStatus {
  environment: string;
  nodeVersion: string;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  metrics: {
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
    averageProcessingTime: number;
  };
}

export interface ReadinessStatus {
  status: 'ready' | 'not ready';
  timestamp: string;
  checks: {
    database: { status: 'pass' | 'fail'; error?: string };
    redis: { status: 'pass' | 'fail'; error?: string };
    fileSystem: { status: 'pass' | 'fail'; error?: string };
  };
}

export interface LivenessStatus {
  status: 'alive';
  timestamp: string;
  uptime: number;
}

export interface ApplicationMetrics {
  conversions: {
    total: number;
    successful: number;
    failed: number;
    inProgress: number;
    successRate: number;
  };
  performance: {
    averageConversionTime: number;
    medianConversionTime: number;
    p95ConversionTime: number;
    p99ConversionTime: number;
  };
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    diskUsage: number;
    activeConnections: number;
  };
  queues: {
    conversionQueue: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
  };
  history?: {
    conversionsPerHour: MetricDataPoint[];
    averageResponseTime: MetricDataPoint[];
  };
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
}

// Error types
export interface ApiErrorResponse {
  error: string;
  code: string;
  timestamp: string;
  path: string;
  method: string;
  requestId: string;
  details?: any;
  stack?: string;
  correlationId?: string;
}

export interface ValidationErrorResponse extends ApiErrorResponse {
  field: string;
  value: any;
  validationErrors?: any[];
}