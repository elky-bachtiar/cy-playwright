export interface CliArguments {
  source: string;
  output: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface CypressProjectValidation extends ValidationResult {
  configPath?: string;
  projectRoot?: string;
}

export interface DirectoryValidation extends ValidationResult {
  isWritable?: boolean;
  path?: string;
}

export interface TestFileScanResult {
  testFiles: string[];
  configFiles: string[];
  supportFiles: string[];
  customCommandFiles: string[];
}

export interface ConversionOptions {
  sourceDir: string;
  outputDir: string;
  preserveStructure?: boolean;
  generatePageObjects?: boolean;
  verbose?: boolean;
}