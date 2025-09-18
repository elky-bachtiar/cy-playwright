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

export interface CypressCommand {
  command: string;
  args: (string | number | boolean)[];
  chainedCalls?: ChainedCall[];
  lineNumber?: number;
}

export interface ChainedCall {
  method: string;
  args: (string | number | boolean)[];
}

export interface CypressTest {
  name: string;
  commands: CypressCommand[];
  lineNumber?: number;
}

export interface CypressDescribe {
  name: string;
  tests: CypressTest[];
  describes?: CypressDescribe[];
  lineNumber?: number;
}

export interface ImportStatement {
  namedImports?: string[];
  defaultImport?: string;
  source: string;
}

export interface CypressTestFile {
  filePath: string;
  describes: CypressDescribe[];
  cypressCommands: CypressCommand[];
  imports?: ImportStatement[];
  customCommands?: CustomCommand[];
}

export interface CustomCommand {
  name: string;
  type: 'add' | 'overwrite';
  parameters: string[];
  body: string;
  lineNumber?: number;
}

export interface ASTParseResult {
  success: boolean;
  testFile?: CypressTestFile;
  customCommands?: CustomCommand[];
  error?: string;
}

export interface ConvertedCommand {
  playwrightCode: string;
  requiresAwait: boolean;
  imports?: string[];
  warnings?: string[];
}

export interface PlaywrightCode {
  code: string;
  imports: string[];
  warnings: string[];
}

export interface PageObjectMethod {
  className: string;
  methodName: string;
  parameters: string[];
  playwrightCode: string;
  imports: string[];
}

export interface CommandMapping {
  cypressCommand: string;
  playwrightEquivalent: string;
  requiresAwait: boolean;
  transformation?: (args: any[]) => string;
}

export interface AssertionMapping {
  cypressAssertion: string;
  playwrightAssertion: string;
  transformation?: (args: any[]) => string;
}

export interface ConversionContext {
  usesPageObject: boolean;
  pageObjectName?: string;
  imports: Set<string>;
  warnings: string[];
}