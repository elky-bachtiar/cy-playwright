export interface ThenPatternAnalysis {
  hasThenCallback: boolean;
  isNested: boolean;
  callbackParameter: string;
  callbackBody: string;
  chainedOperations: string[];
  complexity: 'low' | 'medium' | 'high';
  usesJQueryMethods: boolean;
  usesCustomCommands: boolean;
  hasConditionalLogic: boolean;
}

export interface ConvertedThenPattern {
  originalPattern: string;
  playwrightPattern: string;
  isValid: boolean;
  conversionSuccess: boolean;
  conversionNotes: string[];
  transformationMetadata: {
    complexity: 'low' | 'medium' | 'high';
    requiresManualReview: boolean;
    nestingLevel: number;
    estimatedConversionTime: number;
  };
}

export interface WaitPatternAnalysis {
  hasWaitCommand: boolean;
  aliasName?: string;
  waitType: 'alias' | 'time' | 'intercept' | 'unknown';
  hasChainedThen: boolean;
  extractsRequestData: boolean;
  complexity: 'low' | 'medium' | 'high';
}

export interface ConvertedWaitPattern {
  originalPattern: string;
  playwrightPattern: string;
  isValid: boolean;
  conversionSuccess: boolean;
  conversionNotes: string[];
  transformationMetadata: {
    complexity: 'low' | 'medium' | 'high';
    requiresManualReview: boolean;
    usesRequestInterception: boolean;
  };
}

export interface CustomCommandAnalysis {
  commandName: string;
  parameters: Array<{
    name: string;
    type: string;
    isOptional: boolean;
  }>;
  isChainable: boolean;
  hasPlaywrightEquivalent: boolean;
  conversionStrategy: 'direct' | 'utility' | 'pageObject' | 'manual';
  complexity: 'low' | 'medium' | 'high';
}

export interface ConvertedCustomCommand {
  originalCommand: string;
  playwrightEquivalent: string;
  isValid: boolean;
  conversionSuccess: boolean;
  conversionNotes: string[];
  transformationMetadata: {
    complexity: 'low' | 'medium' | 'high';
    requiresManualReview: boolean;
    strategy: 'direct' | 'utility' | 'pageObject' | 'manual';
    generatedUtilityFunction?: string;
  };
}

export interface ComplexPatternConversionResult {
  originalCode: string;
  convertedCode: string;
  isValid: boolean;
  conversionSuccess: boolean;
  conversionSummary: {
    totalPatterns: number;
    convertedPatterns: number;
    failedPatterns: number;
    manualReviewRequired: number;
    complexityDistribution: {
      low: number;
      medium: number;
      high: number;
    };
  };
  conversionNotes: string[];
  detailedResults: Array<ConvertedThenPattern | ConvertedWaitPattern | ConvertedCustomCommand>;
}

// Types for API Mocking and Route Conversion (Task 4)
export interface InterceptPattern {
  method: string;
  url: string;
  isRegex: boolean;
  hasWildcard: boolean;
  hasDoubleWildcard: boolean;
  hasParameters: boolean;
  hasQueryParams: boolean;
  hasDynamicUrl: boolean;
  urlPattern: string;
  hasAlias: boolean;
  alias?: string;
  hasResponse: boolean;
  responseType?: 'fixture' | 'inline' | 'function';
  fixture?: string;
  statusCode?: number;
  responseBody?: string;
  hasHeaders: boolean;
  headers?: string[];
  hasDelay: boolean;
  delay?: number;
  hasThrottling: boolean;
  throttleKbps?: number;
  isDynamic: boolean;
  usesRequestData: boolean;
  usesRequestBody: boolean;
  hasConditionalLogic: boolean;
  modifiesResponse: boolean;
  usesContinue: boolean;
  isValid: boolean;
  isInLoop: boolean;
}

export interface AliasUsage {
  alias: string;
  hasInspection: boolean;
  inspectionCode?: string;
}

export interface InterceptDetectionResult {
  patterns: InterceptPattern[];
  aliasUsages: AliasUsage[];
  contextInfo: {
    hasBeforeEach: boolean;
    hasMultipleTests: boolean;
  };
  scopeInfo: {
    beforeEachIntercepts: InterceptPattern[];
    testLevelIntercepts: InterceptPattern[];
  };
  errors: string[];
  complexity: 'low' | 'medium' | 'high';
  conversionDifficulty: 'easy' | 'medium' | 'hard';
  recommendations: InterceptRecommendation[];
}

export interface InterceptRecommendation {
  type: 'fixture_replacement' | 'function_simplification' | 'regex_conversion' | 'alias_management';
  message: string;
  priority: 'low' | 'medium' | 'high';
}

export interface RouteConversion {
  originalIntercept: string;
  playwrightRoute: string;
  isValid: boolean;
  conversionSuccess: boolean;
  conversionNotes: string[];
  requiresCleanup: boolean;
  variableName?: string;
}

export interface WireMockIntegrationInfo {
  hasWireMock: boolean;
  wireMockImports: string[];
  mockUtilUsage: boolean;
  stubMappings: string[];
  integrationComplexity: 'low' | 'medium' | 'high';
}

export interface APIConversionResult {
  originalCode: string;
  convertedCode: string;
  isValid: boolean;
  conversionSuccess: boolean;
  interceptPatterns: InterceptPattern[];
  routeConversions: RouteConversion[];
  wireMockInfo: WireMockIntegrationInfo;
  conversionSummary: {
    totalIntercepts: number;
    convertedRoutes: number;
    failedConversions: number;
    preservedWireMock: number;
  };
  conversionNotes: string[];
}