import * as ts from 'typescript';
import fs from 'fs-extra';
import path from 'path';
import {
  CypressCommand,
  CypressTestFile,
  CypressDescribe,
  CypressTest,
  CustomCommand,
  ChainedCall,
  ImportStatement,
  ASTParseResult
} from './types';

export class ASTParser {
  private readonly cypressTestPatterns = [
    /\.cy\.(js|ts|jsx|tsx)$/,
    /\.spec\.(js|ts|jsx|tsx)$/,
    /\.test\.(js|ts|jsx|tsx)$/
  ];

  private readonly customCommandPatterns = [
    /commands?\.(js|ts)$/,
    /support.*commands?\.(js|ts)$/,
    /cypress.*commands?\.(js|ts)$/
  ];

  /**
   * Detect which files are Cypress test files based on naming patterns
   */
  detectCypressTestFiles(files: string[]): string[] {
    return files.filter(file =>
      this.cypressTestPatterns.some(pattern => pattern.test(file))
    );
  }

  /**
   * Detect which files contain custom commands
   */
  detectCustomCommandFiles(files: string[]): string[] {
    return files.filter(file => {
      const basename = path.basename(file);
      const fullPath = file.toLowerCase();

      return this.customCommandPatterns.some(pattern => pattern.test(basename)) ||
             fullPath.includes('commands') ||
             fullPath.includes('support');
    });
  }

  /**
   * Parse a Cypress test file and extract its structure and commands
   */
  async parseTestFile(filePath: string): Promise<CypressTestFile> {
    if (!await fs.pathExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const sourceCode = await fs.readFile(filePath, 'utf-8');
    const sourceFile = this.createSourceFile(filePath, sourceCode);

    const testFile: CypressTestFile = {
      filePath,
      describes: [],
      cypressCommands: [],
      imports: []
    };

    // Parse imports
    testFile.imports = this.extractImports(sourceFile);

    // Parse top-level describes and collect all Cypress commands
    const processedNodes = new Set<ts.Node>();

    this.visitNode(sourceFile, (node) => {
      if (this.isDescribeCall(node) && !processedNodes.has(node)) {
        // Only process top-level describes (not nested ones)
        let isTopLevel = true;
        let parent = node.parent;

        while (parent) {
          if (this.isDescribeCall(parent as any) && processedNodes.has(parent)) {
            isTopLevel = false;
            break;
          }
          parent = parent.parent;
        }

        if (isTopLevel) {
          const describe = this.parseDescribe(node);
          if (describe) {
            testFile.describes.push(describe);
            this.markProcessedDescribes(node, processedNodes);
          }
        }
      }

      if (this.isCypressCommand(node)) {
        const command = this.parseCypressCommand(node);
        if (command) {
          testFile.cypressCommands.push(command);
        }
      }
    });

    return testFile;
  }

  /**
   * Parse custom commands from a commands file
   */
  async parseCustomCommands(filePath: string): Promise<CustomCommand[]> {
    if (!await fs.pathExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const sourceCode = await fs.readFile(filePath, 'utf-8');
    const sourceFile = this.createSourceFile(filePath, sourceCode);

    const customCommands: CustomCommand[] = [];

    this.visitNode(sourceFile, (node) => {
      if (this.isCustomCommandCall(node)) {
        const command = this.parseCustomCommand(node);
        if (command) {
          customCommands.push(command);
        }
      }
    });

    return customCommands;
  }

  /**
   * Create TypeScript source file with proper error handling
   */
  private createSourceFile(filePath: string, sourceCode: string): ts.SourceFile {
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(filePath)
    );

    // Check for syntax errors
    const syntacticDiagnostics = (sourceFile as any).parseDiagnostics || [];
    if (syntacticDiagnostics.length > 0) {
      const errors = syntacticDiagnostics.map((diagnostic: ts.Diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      ).join('\n');
      throw new Error(`Syntax errors in ${filePath}:\n${errors}`);
    }

    return sourceFile;
  }

  /**
   * Determine the script kind based on file extension
   */
  private getScriptKind(filePath: string): ts.ScriptKind {
    const ext = path.extname(filePath);
    switch (ext) {
      case '.ts':
        return ts.ScriptKind.TS;
      case '.tsx':
        return ts.ScriptKind.TSX;
      case '.jsx':
        return ts.ScriptKind.JSX;
      case '.js':
      default:
        return ts.ScriptKind.JS;
    }
  }

  /**
   * Visit all nodes in the AST
   */
  private visitNode(node: ts.Node, callback: (node: ts.Node) => void): void {
    callback(node);
    ts.forEachChild(node, child => this.visitNode(child, callback));
  }

  /**
   * Extract import statements from the source file
   */
  private extractImports(sourceFile: ts.SourceFile): ImportStatement[] {
    const imports: ImportStatement[] = [];

    this.visitNode(sourceFile, (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const importStatement: ImportStatement = {
          source: node.moduleSpecifier.text
        };

        if (node.importClause) {
          if (node.importClause.name) {
            importStatement.defaultImport = node.importClause.name.text;
          }

          if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
            importStatement.namedImports = node.importClause.namedBindings.elements.map(
              element => element.name.text
            );
          }
        }

        imports.push(importStatement);
      }
    });

    return imports;
  }

  /**
   * Check if a node is a describe call
   */
  private isDescribeCall(node: ts.Node): node is ts.CallExpression {
    return ts.isCallExpression(node) &&
           ts.isIdentifier(node.expression) &&
           node.expression.text === 'describe';
  }

  /**
   * Check if a node is an it/test call
   */
  private isTestCall(node: ts.Node): node is ts.CallExpression {
    return ts.isCallExpression(node) &&
           ts.isIdentifier(node.expression) &&
           (node.expression.text === 'it' || node.expression.text === 'test');
  }

  /**
   * Check if a node is a Cypress command
   */
  private isCypressCommand(node: ts.Node): node is ts.CallExpression {
    if (!ts.isCallExpression(node)) return false;

    // Check for cy.command() pattern
    if (ts.isPropertyAccessExpression(node.expression)) {
      return ts.isIdentifier(node.expression.expression) &&
             node.expression.expression.text === 'cy';
    }

    return false;
  }

  /**
   * Check if a node is a custom command definition
   */
  private isCustomCommandCall(node: ts.Node): node is ts.CallExpression {
    if (!ts.isCallExpression(node)) return false;

    // Check for Cypress.Commands.add() or Cypress.Commands.overwrite()
    if (ts.isPropertyAccessExpression(node.expression)) {
      const methodCall = node.expression;
      if (ts.isPropertyAccessExpression(methodCall.expression)) {
        const commandsAccess = methodCall.expression;
        if (ts.isIdentifier(commandsAccess.expression) &&
            commandsAccess.expression.text === 'Cypress' &&
            ts.isIdentifier(commandsAccess.name) &&
            commandsAccess.name.text === 'Commands' &&
            ts.isIdentifier(methodCall.name) &&
            (methodCall.name.text === 'add' || methodCall.name.text === 'overwrite')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Parse a describe block
   */
  private parseDescribe(node: ts.CallExpression): CypressDescribe | null {
    if (node.arguments.length < 2) return null;

    const nameArg = node.arguments[0];
    if (!ts.isStringLiteral(nameArg)) return null;

    const describe: CypressDescribe = {
      name: nameArg.text,
      tests: [],
      describes: [],
      lineNumber: this.getLineNumber(node)
    };

    const bodyArg = node.arguments[1];
    if (ts.isArrowFunction(bodyArg) || ts.isFunctionExpression(bodyArg)) {
      if (bodyArg.body && ts.isBlock(bodyArg.body)) {
        // Only look at direct children of this describe block
        for (const statement of bodyArg.body.statements) {
          if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
            const callExpr = statement.expression;

            if (this.isDescribeCall(callExpr)) {
              const nestedDescribe = this.parseDescribe(callExpr);
              if (nestedDescribe) {
                describe.describes!.push(nestedDescribe);
              }
            } else if (this.isTestCall(callExpr)) {
              const test = this.parseTest(callExpr);
              if (test) {
                describe.tests.push(test);
              }
            }
          }
        }
      }
    }

    return describe;
  }

  /**
   * Parse a test (it/test) block
   */
  private parseTest(node: ts.CallExpression): CypressTest | null {
    if (node.arguments.length < 2) return null;

    const nameArg = node.arguments[0];
    if (!ts.isStringLiteral(nameArg)) return null;

    const test: CypressTest = {
      name: nameArg.text,
      commands: [],
      lineNumber: this.getLineNumber(node)
    };

    const bodyArg = node.arguments[1];
    if (ts.isArrowFunction(bodyArg) || ts.isFunctionExpression(bodyArg)) {
      if (bodyArg.body && ts.isBlock(bodyArg.body)) {
        this.visitNode(bodyArg.body, (child) => {
          if (this.isCypressCommand(child)) {
            const command = this.parseCypressCommand(child);
            if (command) {
              test.commands.push(command);
            }
          }
        });
      }
    }

    return test;
  }

  /**
   * Parse a Cypress command
   */
  private parseCypressCommand(node: ts.CallExpression): CypressCommand | null {
    if (!ts.isPropertyAccessExpression(node.expression)) return null;

    const command: CypressCommand = {
      command: node.expression.name.text,
      args: this.extractArguments(node),
      lineNumber: this.getLineNumber(node)
    };

    // Check for chained calls
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent) && ts.isCallExpression(parent.parent)) {
      command.chainedCalls = this.extractChainedCalls(parent.parent);
    }

    return command;
  }

  /**
   * Parse custom command definition
   */
  private parseCustomCommand(node: ts.CallExpression): CustomCommand | null {
    if (node.arguments.length < 2) return null;

    const nameArg = node.arguments[0];
    if (!ts.isStringLiteral(nameArg)) return null;

    const functionArg = node.arguments[1];
    if (!ts.isArrowFunction(functionArg) && !ts.isFunctionExpression(functionArg)) return null;

    const type = ts.isPropertyAccessExpression(node.expression) &&
                 ts.isIdentifier(node.expression.name) &&
                 node.expression.name.text === 'overwrite' ? 'overwrite' : 'add';

    const parameters: string[] = [];
    if (functionArg.parameters) {
      for (const param of functionArg.parameters) {
        if (ts.isIdentifier(param.name)) {
          parameters.push(param.name.text);
        }
      }
    }

    const body = functionArg.body ? functionArg.body.getFullText().trim() : '';

    return {
      name: nameArg.text,
      type,
      parameters,
      body,
      lineNumber: this.getLineNumber(node)
    };
  }

  /**
   * Extract arguments from a call expression
   */
  private extractArguments(node: ts.CallExpression): (string | number | boolean)[] {
    return node.arguments.map(arg => {
      if (ts.isStringLiteral(arg)) return arg.text;
      if (ts.isNumericLiteral(arg)) return parseFloat(arg.text);
      if (arg.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (arg.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (ts.isIdentifier(arg)) return arg.text;
      return arg.getFullText().trim();
    });
  }

  /**
   * Extract chained method calls
   */
  private extractChainedCalls(node: ts.CallExpression): ChainedCall[] {
    const chains: ChainedCall[] = [];
    let current = node;

    while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
      chains.push({
        method: current.expression.name.text,
        args: this.extractArguments(current)
      });

      // Check if there's another chained call
      const parent = current.parent;
      if (ts.isPropertyAccessExpression(parent) && ts.isCallExpression(parent.parent)) {
        current = parent.parent;
      } else {
        break;
      }
    }

    return chains;
  }

  /**
   * Mark all describe nodes within a tree as processed to avoid double-processing
   */
  private markProcessedDescribes(node: ts.Node, processedNodes: Set<ts.Node>): void {
    this.visitNode(node, (child) => {
      if (this.isDescribeCall(child)) {
        processedNodes.add(child);
      }
    });
  }

  /**
   * Get line number of a node
   */
  private getLineNumber(node: ts.Node): number {
    const sourceFile = node.getSourceFile();
    return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  }
}