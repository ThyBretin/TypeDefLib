const ts = require("typescript");
const { extractFunctions } = require("./extract_functions");
const { extractEnums } = require("./extract_enums");
const { extractTypes } = require("./extract_types");
const { extractClasses } = require("./extract_classes");
const { extractConstants } = require("./extract_constants");
const { extractNamespaces } = require("./extract_namespaces");
const { extractJSDoc } = require("./extract_jsdoc");

function extractSignatures(dtsPath, libName, version) {
  const program = ts.createProgram([dtsPath], { allowJs: false });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(dtsPath);
  const defs = { 
    functions: [], 
    enums: [], 
    types: [], 
    classes: [], 
    constants: [], 
    namespaces: [], 
    version: version || "unknown" 
  };
  const seenFunctions = new Set();
  const visitedTypes = new Set();

  function processNode(node) {
    if (ts.isEnumDeclaration(node)) {
      const enumDef = extractEnums(checker, node);
      if (enumDef) defs.enums.push(enumDef);
    }
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      const typeDef = extractTypes(checker, node, visitedTypes);
      if (typeDef) defs.types.push(typeDef);
    }
    if (ts.isClassDeclaration(node)) {
      const classDef = extractClasses(checker, node);
      if (classDef) {
        defs.classes.push(classDef);
        defs.functions.push(...classDef.methods);
      }
    }
    if (ts.isModuleDeclaration(node)) {
      const namespaceDef = extractNamespaces(checker, node, sourceFile, seenFunctions, visitedTypes);
      if (namespaceDef) {
        defs.namespaces.push(namespaceDef);
        defs.functions.push(...namespaceDef.contents.functions);
        defs.enums.push(...namespaceDef.contents.enums);
        defs.types.push(...namespaceDef.contents.types);
        defs.classes.push(...namespaceDef.contents.classes);
        defs.constants.push(...namespaceDef.contents.constants);
      }
    }
    if (ts.isVariableStatement(node) && node.parent?.kind === ts.SyntaxKind.ModuleBlock) {
      node.declarationList.declarations.forEach(decl => {
        const symbol = checker.getSymbolAtLocation(decl.name);
        if (symbol) {
          console.log(`Module var: ${symbol.name}`);
          defs.functions.push(...extractFunctions(checker, symbol, sourceFile, "", seenFunctions));
          const varType = checker.getTypeOfSymbolAtLocation(symbol, decl);
          const varProps = varType.getProperties();
          console.log(`  ${symbol.name} has ${varProps.length} properties`);
          varProps.forEach(prop => {
            defs.functions.push(...extractFunctions(checker, prop, sourceFile, symbol.name, seenFunctions));
          });
        }
      });
    }
    if (ts.isVariableStatement(node) && node.parent?.kind === ts.SyntaxKind.SourceFile) {
      defs.constants.push(...extractConstants(checker, node));
    }
    if (ts.isExportAssignment(node) && node.expression) {
      const symbol = checker.getSymbolAtLocation(node.expression);
      if (symbol) {
        console.log(`Export assignment: ${symbol.name}`);
        defs.functions.push(...extractFunctions(checker, symbol, sourceFile, "", seenFunctions));
        const expType = checker.getTypeOfSymbolAtLocation(symbol, sourceFile);
        const expProps = expType.getProperties();
        console.log(`  ${symbol.name} has ${expProps.length} properties`);
        expProps.forEach(prop => {
          defs.functions.push(...extractFunctions(checker, prop, sourceFile, symbol.name, seenFunctions));
        });
        const decl = symbol.valueDeclaration || symbol.declarations?.[0];
        if (decl) defs.constants.push(...extractConstants(checker, decl, symbol));
      }
    }
  }

  if (sourceFile) {
    console.log(`Processing file: ${dtsPath}`);
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol) {
      const exports = checker.getExportsOfModule(moduleSymbol);
      console.log(`Found ${exports.length} top-level exports`);
      exports.forEach(exp => {
        console.log(`Export: ${exp.name}`);
        defs.functions.push(...extractFunctions(checker, exp, sourceFile, "", seenFunctions));
        const expType = checker.getTypeOfSymbolAtLocation(exp, sourceFile);
        const expProps = expType.getProperties();
        console.log(`  ${exp.name} has ${expProps.length} properties`);
        expProps.forEach(prop => {
          defs.functions.push(...extractFunctions(checker, prop, sourceFile, exp.name, seenFunctions));
        });
        const decl = exp.valueDeclaration || exp.declarations?.[0];
        if (decl) defs.constants.push(...extractConstants(checker, decl, exp));
      });

      // Treat file as a namespace if it’s the lib root
      const namespaceDef = {
        name: libName,
        contents: {
          functions: defs.functions.slice(),
          enums: defs.enums.slice(),
          types: defs.types.slice(),
          classes: defs.classes.slice(),
          constants: defs.constants.slice()
        },
        jsdoc: null,
        isExported: true
      };
      defs.namespaces.push(namespaceDef);
    }

    ts.forEachChild(sourceFile, processNode);
  }

  return defs;
}

module.exports = { extractSignatures };