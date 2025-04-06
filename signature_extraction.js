const ts = require("typescript");
const { extractFunctions, extractEnums, extractTypes, extractClasses, extractJSDoc } = require("./core_extraction");

console.log("Imported extractJSDoc:", typeof extractJSDoc); // Debug

function extractSignatures(dtsPath, libName, version) {
  const program = ts.createProgram([dtsPath], { allowJs: false });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(dtsPath);
  const defs = { functions: [], enums: [], types: [], classes: [], version: version || "unknown" };
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
    if (ts.isModuleDeclaration(node) && node.body) {
      const symbol = checker.getSymbolAtLocation(node.name);
      if (symbol) {
        console.log(`Module "${node.name.text}"`);
        if (ts.isModuleBlock(node.body)) {
          const exports = checker.getExportsOfModule(symbol);
          console.log(`Module "${node.name.text}" has ${exports.length} exports`);
          exports.forEach(exp => {
            console.log(`Module export: ${exp.name}`);
            defs.functions.push(...extractFunctions(checker, exp, sourceFile, "", seenFunctions));
            const expType = checker.getTypeOfSymbolAtLocation(exp, sourceFile);
            const expProps = expType.getProperties();
            console.log(`  ${exp.name} has ${expProps.length} properties`);
            expProps.forEach(prop => {
              defs.functions.push(...extractFunctions(checker, prop, sourceFile, exp.name, seenFunctions));
            });
          });
          exports.forEach(exp => {
            const expType = checker.getTypeOfSymbolAtLocation(exp, sourceFile);
            if (expType.aliasSymbol || expType.getProperties().length === 0) {
              const typeDef = {
                name: exp.name,
                type: checker.typeToString(expType, undefined, ts.TypeFormatFlags.NoTruncation),
                jsdoc: extractJSDoc(exp.valueDeclaration || exp.declarations?.[0])
              };
              if (!visitedTypes.has(typeDef.name)) {
                visitedTypes.add(typeDef.name);
                defs.types.push(typeDef);
              }
            }
          });
        }
        ts.forEachChild(node.body, processNode);
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
      });
    }

    ts.forEachChild(sourceFile, processNode);
  }

  return defs;
}

module.exports = { extractSignatures };