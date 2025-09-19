import * as fs from 'fs-extra';
import * as path from 'path';
import * as ts from 'typescript';
import { Logger } from '../utils/logger';

export interface MethodParameter {
  name: string;
  type: string;
  isOptional?: boolean;
}

export interface MethodInfo {
  name: string;
  body: string;
  signature: string;
  parameters: MethodParameter[];
  returnType?: string;
  isAsync: boolean;
  isVisitMethod: boolean;
  isInputMethod: boolean;
  isClickMethod: boolean;
  isCompositeMethod: boolean;
  cypressCommands: string[];
  callsOtherMethods: boolean;
  calledMethods: string[];
  conversionComplexity: 'low' | 'medium' | 'high';
  requiresPage: boolean;
  isStatic: boolean;
  isGetter: boolean;
  isSetter: boolean;
  isAbstract: boolean;
  callsSuper: boolean;
}

export interface PropertyInfo {
  name: string;
  type: string;
  initialValue?: string;
  isPublic: boolean;
}

export interface ImportInfo {
  source: string;
  namedImports?: string[];
  defaultImport?: string;
  namespaceImport?: string;
}

export interface InheritanceInfo {
  hasInheritance: boolean;
  baseClass?: string;
  inheritanceChain: string[];
  implementsInterfaces: string[];
  isAbstract: boolean;
  hasSuper: boolean;
}

export interface CompositionInfo {
  hasComposition: boolean;
  composedObjects: Array<{
    propertyName: string;
    className: string;
    isPageObject: boolean;
  }>;
  circularReferences: string[];
}

export interface EdgeCaseInfo {
  hasDynamicMethods: boolean;
  dynamicMethodPatterns: string[];
  hasStaticMethods: boolean;
  staticMethods: string[];
  hasGettersSetters: boolean;
  getterSetterMethods: string[];
  hasGenericTypes: boolean;
  genericTypeParameters: string[];
  usesObjectDefineProperty: boolean;
}

export interface PageObjectAnalysisResult {
  isPageObject: boolean;
  className: string;
  exportType: 'default' | 'named' | 'none';
  hasImports: boolean;
  imports: ImportInfo[];
  hasConstructor: boolean;
  constructorParameters: MethodParameter[];
  properties: PropertyInfo[];
  methods: MethodInfo[];
  hasMockingMethods: boolean;
  hasComplexLogic: boolean;
  conversionDifficulty: 'easy' | 'medium' | 'hard';
  inheritanceInfo: InheritanceInfo;
  compositionInfo: CompositionInfo;
  edgeCaseInfo: EdgeCaseInfo;
}

export class PageObjectAnalyzer {
  private logger = new Logger('PageObjectAnalyzer');

  // Common Cypress page object patterns
  private readonly visitPatterns = ['visit', 'goto', 'navigate'];
  private readonly inputPatterns = ['fill', 'type', 'enter', 'input', 'set'];
  private readonly clickPatterns = ['click', 'press', 'tap', 'select', 'submit'];
  private readonly cypressCommands = [
    'cy.visit', 'cy.get', 'cy.contains', 'cy.type', 'cy.click', 'cy.should',
    'cy.wait', 'cy.intercept', 'cy.fixture', 'cy.then', 'cy.wrap', 'cy.log'
  ];

  async analyzePageObject(filePath: string): Promise<PageObjectAnalysisResult> {
    try {
      this.logger.debug(`Analyzing page object: ${filePath}`);

      const fileContent = await fs.readFile(filePath, 'utf8');
      const sourceFile = this.createSourceFile(filePath, fileContent);

      const analysis = this.extractPageObjectInfo(sourceFile);

      this.logger.debug(`Page object analysis complete for ${filePath}: ${analysis.isPageObject ? 'detected' : 'not detected'}`);
      return analysis;
    } catch (error) {
      this.logger.error(`Failed to analyze page object ${filePath}:`, error);
      throw error;
    }
  }

  async analyzeMultiplePageObjects(filePaths: string[]): Promise<PageObjectAnalysisResult[]> {
    const results: PageObjectAnalysisResult[] = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.analyzePageObject(filePath);
        results.push(result);
      } catch (error) {
        this.logger.warn(`Skipping page object analysis for ${filePath}:`, error);
        results.push({
          isPageObject: false,
          className: '',
          exportType: 'none',
          hasImports: false,
          imports: [],
          hasConstructor: false,
          constructorParameters: [],
          properties: [],
          methods: [],
          hasMockingMethods: false,
          hasComplexLogic: false,
          conversionDifficulty: 'easy',
          inheritanceInfo: {
            hasInheritance: false,
            inheritanceChain: [],
            implementsInterfaces: [],
            isAbstract: false,
            hasSuper: false
          },
          compositionInfo: {
            hasComposition: false,
            composedObjects: [],
            circularReferences: []
          },
          edgeCaseInfo: {
            hasDynamicMethods: false,
            dynamicMethodPatterns: [],
            hasStaticMethods: false,
            staticMethods: [],
            hasGettersSetters: false,
            getterSetterMethods: [],
            hasGenericTypes: false,
            genericTypeParameters: [],
            usesObjectDefineProperty: false
          }
        });
      }
    }

    return results;
  }

  private createSourceFile(filePath: string, sourceCode: string): ts.SourceFile {
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(filePath)
    );

    const syntacticDiagnostics = (sourceFile as any).parseDiagnostics || [];
    if (syntacticDiagnostics.length > 0) {
      this.logger.warn(`Syntax errors in ${filePath}, continuing with best effort parsing`);
    }

    return sourceFile;
  }

  private getScriptKind(filePath: string): ts.ScriptKind {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts': return ts.ScriptKind.TS;
      case '.tsx': return ts.ScriptKind.TSX;
      case '.js': return ts.ScriptKind.JS;
      case '.jsx': return ts.ScriptKind.JSX;
      default: return ts.ScriptKind.TS;
    }
  }

  private extractPageObjectInfo(sourceFile: ts.SourceFile): PageObjectAnalysisResult {
    const analysis: PageObjectAnalysisResult = {
      isPageObject: false,
      className: '',
      exportType: 'none',
      hasImports: false,
      imports: [],
      hasConstructor: false,
      constructorParameters: [],
      properties: [],
      methods: [],
      hasMockingMethods: false,
      hasComplexLogic: false,
      conversionDifficulty: 'easy',
      inheritanceInfo: {
        hasInheritance: false,
        inheritanceChain: [],
        implementsInterfaces: [],
        isAbstract: false,
        hasSuper: false
      },
      compositionInfo: {
        hasComposition: false,
        composedObjects: [],
        circularReferences: []
      },
      edgeCaseInfo: {
        hasDynamicMethods: false,
        dynamicMethodPatterns: [],
        hasStaticMethods: false,
        staticMethods: [],
        hasGettersSetters: false,
        getterSetterMethods: [],
        hasGenericTypes: false,
        genericTypeParameters: [],
        usesObjectDefineProperty: false
      }
    };

    // Extract imports
    analysis.imports = this.extractImports(sourceFile);
    analysis.hasImports = analysis.imports.length > 0;

    // Find class declarations
    const classDeclaration = this.findClassDeclaration(sourceFile);
    if (!classDeclaration) {
      return analysis;
    }

    analysis.isPageObject = this.isPageObjectClass(classDeclaration);
    if (!analysis.isPageObject) {
      return analysis;
    }

    analysis.className = classDeclaration.name?.text || '';
    analysis.exportType = this.getExportType(sourceFile, classDeclaration);

    // Extract class members
    analysis.properties = this.extractProperties(classDeclaration);
    analysis.methods = this.extractMethods(classDeclaration);

    // Find constructor
    const constructor = this.findConstructor(classDeclaration);
    if (constructor) {
      analysis.hasConstructor = true;
      analysis.constructorParameters = this.extractParameters(constructor);
    }

    // Analyze edge case patterns
    analysis.inheritanceInfo = this.analyzeInheritance(classDeclaration, sourceFile);
    analysis.compositionInfo = this.analyzeComposition(analysis.properties, sourceFile);
    analysis.edgeCaseInfo = this.analyzeEdgeCases(classDeclaration, analysis.methods, constructor);

    // Analyze complexity
    analysis.hasMockingMethods = this.hasMockingMethods(analysis.methods);
    analysis.hasComplexLogic = this.hasComplexLogic(analysis.methods);
    analysis.conversionDifficulty = this.calculateConversionDifficulty(analysis);

    return analysis;
  }

  private extractImports(sourceFile: ts.SourceFile): ImportInfo[] {
    const imports: ImportInfo[] = [];

    const visitNode = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const importInfo = this.parseImportDeclaration(node);
        if (importInfo) {
          imports.push(importInfo);
        }
      }
      ts.forEachChild(node, visitNode);
    };

    visitNode(sourceFile);
    return imports;
  }

  private parseImportDeclaration(node: ts.ImportDeclaration): ImportInfo | null {
    const source = (node.moduleSpecifier as ts.StringLiteral).text;

    let defaultImport: string | undefined;
    let namedImports: string[] | undefined;
    let namespaceImport: string | undefined;

    if (node.importClause) {
      if (node.importClause.name) {
        defaultImport = node.importClause.name.text;
      }

      if (node.importClause.namedBindings) {
        if (ts.isNamespaceImport(node.importClause.namedBindings)) {
          namespaceImport = node.importClause.namedBindings.name.text;
        } else if (ts.isNamedImports(node.importClause.namedBindings)) {
          namedImports = node.importClause.namedBindings.elements.map(
            element => element.name.text
          );
        }
      }
    }

    return {
      source,
      defaultImport,
      namedImports,
      namespaceImport
    };
  }

  private findClassDeclaration(sourceFile: ts.SourceFile): ts.ClassDeclaration | null {
    let classDeclaration: ts.ClassDeclaration | null = null;

    const visitNode = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        classDeclaration = node;
        return; // Found the class, stop searching
      }
      ts.forEachChild(node, visitNode);
    };

    visitNode(sourceFile);
    return classDeclaration;
  }

  private isPageObjectClass(classDeclaration: ts.ClassDeclaration): boolean {
    const className = classDeclaration.name?.text || '';

    // Check if class name suggests it's a page object
    const pageObjectNamePatterns = [
      /page$/i, /Page$/, /^.*Page$/, /^Cy.*/, /^.*PageObject$/
    ];

    const hasPageObjectName = pageObjectNamePatterns.some(pattern => pattern.test(className));

    // Check if class has typical page object methods
    const methods = classDeclaration.members.filter(member => ts.isMethodDeclaration(member));
    const hasCypressUsage = methods.some(method => {
      const methodText = method.getFullText();
      return this.cypressCommands.some(cmd => methodText.includes(cmd));
    });

    return hasPageObjectName || hasCypressUsage;
  }

  private getExportType(sourceFile: ts.SourceFile, classDeclaration: ts.ClassDeclaration): 'default' | 'named' | 'none' {
    const className = classDeclaration.name?.text || '';

    // Check for export modifiers on class
    if (classDeclaration.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) {
      if (classDeclaration.modifiers?.some(mod => mod.kind === ts.SyntaxKind.DefaultKeyword)) {
        return 'default';
      }
      return 'named';
    }

    // Check for export statements
    const exportStatements = sourceFile.statements.filter(ts.isExportAssignment);
    if (exportStatements.some(stmt =>
      ts.isIdentifier(stmt.expression) && stmt.expression.text === className
    )) {
      return 'default';
    }

    const namedExports = sourceFile.statements.filter(ts.isExportDeclaration);
    if (namedExports.some(stmt =>
      stmt.exportClause && ts.isNamedExports(stmt.exportClause) &&
      stmt.exportClause.elements.some(element => element.name.text === className)
    )) {
      return 'named';
    }

    return 'none';
  }

  private extractProperties(classDeclaration: ts.ClassDeclaration): PropertyInfo[] {
    const properties: PropertyInfo[] = [];

    classDeclaration.members.forEach(member => {
      if (ts.isPropertyDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
        const property: PropertyInfo = {
          name: member.name.text,
          type: this.getTypeString(member.type),
          isPublic: !member.modifiers?.some(mod =>
            mod.kind === ts.SyntaxKind.PrivateKeyword ||
            mod.kind === ts.SyntaxKind.ProtectedKeyword
          )
        };

        if (member.initializer) {
          property.initialValue = member.initializer.getFullText().trim();
        }

        properties.push(property);
      }
    });

    return properties;
  }

  private extractMethods(classDeclaration: ts.ClassDeclaration): MethodInfo[] {
    const methods: MethodInfo[] = [];

    classDeclaration.members.forEach(member => {
      if ((ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member))
          && member.name && ts.isIdentifier(member.name)) {
        const methodInfo = this.analyzeMethod(member as ts.MethodDeclaration);
        methods.push(methodInfo);
      }
    });

    return methods;
  }

  private analyzeMethod(method: ts.MethodDeclaration): MethodInfo {
    const name = (method.name as ts.Identifier).text;
    const body = method.body?.getFullText() || '';
    const signature = this.getMethodSignature(method);
    const parameters = this.extractParameters(method);

    const cypressCommands = this.extractCypressCommands(body);
    const calledMethods = this.extractCalledMethods(body);

    const methodInfo: MethodInfo = {
      name,
      body: body.trim(),
      signature,
      parameters,
      returnType: this.getTypeString(method.type),
      isAsync: method.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AsyncKeyword) || false,
      isVisitMethod: this.isVisitMethod(name, body),
      isInputMethod: this.isInputMethod(name, body),
      isClickMethod: this.isClickMethod(name, body),
      isCompositeMethod: calledMethods.length > 0,
      cypressCommands,
      callsOtherMethods: calledMethods.length > 0,
      calledMethods,
      conversionComplexity: this.calculateMethodComplexity(cypressCommands, body),
      requiresPage: cypressCommands.length > 0,
      isStatic: method.modifiers?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword) || false,
      isGetter: ts.isGetAccessorDeclaration(method),
      isSetter: ts.isSetAccessorDeclaration(method),
      isAbstract: method.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AbstractKeyword) || false,
      callsSuper: body.includes('super.')
    };

    return methodInfo;
  }

  private getMethodSignature(method: ts.MethodDeclaration): string {
    const name = (method.name as ts.Identifier).text;
    const parameters = this.extractParameters(method);
    const paramString = parameters.map(p => `${p.name}: ${p.type}`).join(', ');
    const returnType = this.getTypeString(method.type);
    const asyncKeyword = method.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : '';

    return `${asyncKeyword}${name}(${paramString})${returnType ? ': ' + returnType : ''}`;
  }

  private extractParameters(method: ts.MethodDeclaration | ts.ConstructorDeclaration): MethodParameter[] {
    const parameters: MethodParameter[] = [];

    method.parameters.forEach(param => {
      if (ts.isIdentifier(param.name)) {
        parameters.push({
          name: param.name.text,
          type: this.getTypeString(param.type),
          isOptional: !!param.questionToken
        });
      }
    });

    return parameters;
  }

  private getTypeString(typeNode: ts.TypeNode | undefined): string {
    if (!typeNode) return 'any';
    return typeNode.getFullText().trim();
  }

  private extractCypressCommands(methodBody: string): string[] {
    const commands: string[] = [];

    this.cypressCommands.forEach(cmd => {
      if (methodBody.includes(cmd)) {
        commands.push(cmd);
      }
    });

    // Extract chained commands
    const chainedPatterns = ['.type', '.click', '.select', '.check', '.clear', '.should', '.contains'];
    chainedPatterns.forEach(pattern => {
      if (methodBody.includes(pattern)) {
        commands.push(pattern);
      }
    });

    return Array.from(new Set(commands)); // Remove duplicates
  }

  private extractCalledMethods(methodBody: string): string[] {
    const methods: string[] = [];
    const thisMethodCalls = methodBody.match(/this\.(\w+)\(/g);

    if (thisMethodCalls) {
      thisMethodCalls.forEach(call => {
        const methodName = call.match(/this\.(\w+)\(/)?.[1];
        if (methodName) {
          methods.push(methodName);
        }
      });
    }

    return Array.from(new Set(methods)); // Remove duplicates
  }

  private isVisitMethod(name: string, body: string): boolean {
    return this.visitPatterns.some(pattern => name.toLowerCase().includes(pattern)) ||
           body.includes('cy.visit');
  }

  private isInputMethod(name: string, body: string): boolean {
    return this.inputPatterns.some(pattern => name.toLowerCase().includes(pattern)) ||
           body.includes('.type') || body.includes('.clear') || body.includes('.select');
  }

  private isClickMethod(name: string, body: string): boolean {
    return this.clickPatterns.some(pattern => name.toLowerCase().includes(pattern)) ||
           body.includes('.click') || body.includes('.submit') || body.includes('.dblclick');
  }

  private calculateMethodComplexity(cypressCommands: string[], methodBody: string): 'low' | 'medium' | 'high' {
    const simpleCommands = ['cy.visit', 'cy.get', '.type', '.click'];
    const complexCommands = ['cy.intercept', 'cy.wait', '.then', '.should', 'cy.contains'];

    const hasComplexCommands = complexCommands.some(cmd => cypressCommands.includes(cmd));
    const hasMultipleChaining = (methodBody.match(/\./g) || []).length > 3;
    const hasConditionalLogic = methodBody.includes('if') || methodBody.includes('switch');

    if (hasComplexCommands || hasConditionalLogic) {
      return 'high';
    }

    if (cypressCommands.length > 2 || hasMultipleChaining) {
      return 'medium';
    }

    return 'low';
  }

  private findConstructor(classDeclaration: ts.ClassDeclaration): ts.ConstructorDeclaration | null {
    const constructor = classDeclaration.members.find(member => ts.isConstructorDeclaration(member));
    return constructor as ts.ConstructorDeclaration || null;
  }

  private hasMockingMethods(methods: MethodInfo[]): boolean {
    return methods.some(method =>
      method.name.includes('mock') ||
      method.name.includes('Mock') ||
      method.body.includes('MockUtil') ||
      method.body.includes('WireMock')
    );
  }

  private hasComplexLogic(methods: MethodInfo[]): boolean {
    return methods.some(method =>
      method.conversionComplexity === 'high' ||
      method.body.includes('Promise.all') ||
      method.body.includes('async') ||
      method.body.includes('await')
    );
  }

  private calculateConversionDifficulty(analysis: PageObjectAnalysisResult): 'easy' | 'medium' | 'hard' {
    const complexFactors = [
      analysis.hasMockingMethods,
      analysis.hasComplexLogic,
      analysis.methods.some(m => m.conversionComplexity === 'high'),
      analysis.methods.length > 10,
      analysis.properties.length > 5,
      analysis.inheritanceInfo.hasInheritance,
      analysis.compositionInfo.hasComposition,
      analysis.edgeCaseInfo.hasDynamicMethods,
      analysis.edgeCaseInfo.hasGenericTypes
    ];

    const complexCount = complexFactors.filter(Boolean).length;

    if (complexCount >= 4) return 'hard';
    if (complexCount >= 2) return 'medium';
    return 'easy';
  }

  private analyzeInheritance(classDeclaration: ts.ClassDeclaration, sourceFile: ts.SourceFile): InheritanceInfo {
    const inheritanceInfo: InheritanceInfo = {
      hasInheritance: false,
      inheritanceChain: [],
      implementsInterfaces: [],
      isAbstract: false,
      hasSuper: false
    };

    // Check if class is abstract
    inheritanceInfo.isAbstract = classDeclaration.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AbstractKeyword) || false;

    // Check for extends clause
    if (classDeclaration.heritageClauses) {
      for (const heritageClause of classDeclaration.heritageClauses) {
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
          inheritanceInfo.hasInheritance = true;
          heritageClause.types.forEach(type => {
            if (ts.isIdentifier(type.expression)) {
              const baseClass = type.expression.text;
              inheritanceInfo.baseClass = baseClass;
              inheritanceInfo.inheritanceChain.push(baseClass);
            }
          });
        } else if (heritageClause.token === ts.SyntaxKind.ImplementsKeyword) {
          heritageClause.types.forEach(type => {
            if (ts.isIdentifier(type.expression)) {
              inheritanceInfo.implementsInterfaces.push(type.expression.text);
            }
          });
        }
      }
    }

    // Check for super calls in methods
    inheritanceInfo.hasSuper = this.hasSuper(classDeclaration);

    return inheritanceInfo;
  }

  private analyzeComposition(properties: PropertyInfo[], sourceFile: ts.SourceFile): CompositionInfo {
    const compositionInfo: CompositionInfo = {
      hasComposition: false,
      composedObjects: [],
      circularReferences: []
    };

    // Analyze properties for composition patterns
    properties.forEach(property => {
      // Check if property is initialized with 'new' keyword (composition pattern)
      if (property.initialValue && property.initialValue.includes('new ')) {
        const classNameMatch = property.initialValue.match(/new\s+(\w+)/);
        if (classNameMatch) {
          const className = classNameMatch[1];
          compositionInfo.hasComposition = true;
          compositionInfo.composedObjects.push({
            propertyName: property.name,
            className: className,
            isPageObject: this.isPotentialPageObject(className)
          });
        }
      }
    });

    // TODO: Implement circular reference detection by analyzing all classes in the file
    // This would require analyzing multiple classes and their dependencies

    return compositionInfo;
  }

  private analyzeEdgeCases(classDeclaration: ts.ClassDeclaration, methods: MethodInfo[], constructor: ts.ConstructorDeclaration | null): EdgeCaseInfo {
    const edgeCaseInfo: EdgeCaseInfo = {
      hasDynamicMethods: false,
      dynamicMethodPatterns: [],
      hasStaticMethods: false,
      staticMethods: [],
      hasGettersSetters: false,
      getterSetterMethods: [],
      hasGenericTypes: false,
      genericTypeParameters: [],
      usesObjectDefineProperty: false
    };

    // Analyze static methods
    edgeCaseInfo.staticMethods = methods.filter(m => m.isStatic).map(m => m.name);
    edgeCaseInfo.hasStaticMethods = edgeCaseInfo.staticMethods.length > 0;

    // Analyze getters and setters
    edgeCaseInfo.getterSetterMethods = methods.filter(m => m.isGetter || m.isSetter).map(m => m.name);
    edgeCaseInfo.hasGettersSetters = edgeCaseInfo.getterSetterMethods.length > 0;

    // Analyze generic type parameters
    if (classDeclaration.typeParameters) {
      edgeCaseInfo.hasGenericTypes = true;
      edgeCaseInfo.genericTypeParameters = classDeclaration.typeParameters.map(param => param.name.text);
    }

    // Analyze dynamic method generation patterns
    if (constructor) {
      const constructorBody = constructor.body?.getFullText() || '';

      // Check for Object.defineProperty usage
      if (constructorBody.includes('Object.defineProperty')) {
        edgeCaseInfo.usesObjectDefineProperty = true;
        edgeCaseInfo.hasDynamicMethods = true;
        edgeCaseInfo.dynamicMethodPatterns.push('Object.defineProperty');
      }

      // Check for dynamic method assignment patterns
      const dynamicMethodRegex = /this\[['"`]?\w+['"`]?\]\s*=/g;
      const dynamicAssignments = constructorBody.match(dynamicMethodRegex);
      if (dynamicAssignments) {
        edgeCaseInfo.hasDynamicMethods = true;
        edgeCaseInfo.dynamicMethodPatterns.push('dynamic property assignment');
      }

      // Check for loop-based method generation
      if (constructorBody.includes('forEach') && constructorBody.includes('this[')) {
        edgeCaseInfo.hasDynamicMethods = true;
        edgeCaseInfo.dynamicMethodPatterns.push('loop-based method generation');
      }
    }

    return edgeCaseInfo;
  }

  private hasSuper(classDeclaration: ts.ClassDeclaration): boolean {
    let hasSuper = false;

    const visitNode = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        if (node.expression.expression.kind === ts.SyntaxKind.SuperKeyword) {
          hasSuper = true;
          return;
        }
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.SuperKeyword) {
        hasSuper = true;
        return;
      }
      ts.forEachChild(node, visitNode);
    };

    classDeclaration.members.forEach(member => {
      if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
        visitNode(member);
      }
    });

    return hasSuper;
  }

  private isPotentialPageObject(className: string): boolean {
    const pageObjectPatterns = [
      /page$/i, /Page$/, /^.*Page$/, /^Cy.*/, /^.*PageObject$/
    ];
    return pageObjectPatterns.some(pattern => pattern.test(className));
  }
}