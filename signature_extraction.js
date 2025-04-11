const ts = require("typescript");
const { extractEnums } = require("./extract_enums");
const { extractTypes } = require("./extract_types");
const { extractClasses } = require("./extract_classes");
const { extractConstants } = require("./extract_constants");
const { extractNamespaces } = require("./extract_namespaces");
const { extractJSDoc } = require("./extract_jsdoc");

function extractSignatures(dtsPaths, libName, version) { // Changed to accept array of paths
  const program = ts.createProgram(dtsPaths, { allowJs: false }); // Use all files
  const checker = program.getTypeChecker();
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

  function processNode(node, sourceFile) {
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
        console.log(`Namespace: ${namespaceDef.name}, Functions: ${namespaceDef.contents.functions.length}`);
        defs.namespaces.push(namespaceDef);
        defs.functions.push(...namespaceDef.contents.functions);
        defs.enums.push(...namespaceDef.contents.enums);
        defs.types.push(...namespaceDef.contents.types);
        defs.classes.push(...namespaceDef.contents.classes);
        defs.constants.push(...namespaceDef.contents.constants);
      }
    }
    if (ts.isVariableStatement(node)) {
      const constants = extractConstants(sourceFile, checker);
      console.log(`Constants: ${constants.length}`);
      defs.constants.push(...constants);
    }
  }

  // Process all source files
  for (const dtsPath of dtsPaths) {
    const sourceFile = program.getSourceFile(dtsPath);
    if (!sourceFile) continue;

    console.log(`Processing file: ${dtsPath}`);
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol) {
      const exports = checker.getExportsOfModule(moduleSymbol);
      console.log(`Found ${exports.length} top-level exports`);
      exports.forEach(exp => {
        console.log(`Export: ${exp.name}`);
        const expType = checker.getTypeOfSymbolAtLocation(exp, sourceFile);
        const expProps = expType.getProperties();
        console.log(`  ${exp.name} has ${expProps.length} properties`);
        
        expProps.forEach(prop => {
          const propDecl = prop.valueDeclaration || prop.declarations?.[0];
          if (!propDecl) return;
          const propType = checker.getTypeOfSymbolAtLocation(prop, propDecl);
          const signatures = propType.getCallSignatures();
          signatures.forEach(sig => {
            const name = exp.name === "_" ? `_.${prop.name}` : `${exp.name}.${prop.name}`;
            if (!seenFunctions.has(name)) {
              seenFunctions.add(name);
              defs.functions.push({
                name,
                parameters: sig.parameters.map(p => ({
                  name: p.name,
                  type: checker.typeToString(checker.getTypeOfSymbolAtLocation(p, sourceFile)),
                  optional: !!p.valueDeclaration?.questionToken
                })),
                returnType: checker.typeToString(sig.getReturnType()),
                jsdoc: extractJSDoc(propDecl)
              });
            }
          });
        });

        const decl = exp.valueDeclaration || exp.declarations?.[0];
        if (decl) {
          const constants = extractConstants(sourceFile, checker);
          console.log(`  Constants from ${exp.name}: ${constants.length}`);
          defs.constants.push(...constants);
        }
      });
    }

    ts.forEachChild(sourceFile, node => processNode(node, sourceFile));
  }

  // Consolidate namespaces
  const namespaceName = libName === "lodash" ? "_" : libName;
  const namespaceDef = {
    name: namespaceName,
    contents: {
      functions: defs.functions.slice(),
      enums: defs.enums.slice(),
      types: defs.types.slice(),
      classes: defs.classes.slice(),
      constants: defs.constants.slice()
    },
    jsdoc: null, // Could aggregate JSDoc if needed
    isExported: true
  };
  if (defs.functions.length > 0 || defs.namespaces.length > 0) {
    defs.namespaces = [namespaceDef];
  } else {
    defs.namespaces = defs.namespaces.filter(n => n.contents.functions.length > 0);
  }

  console.log(`Final defs: Functions=${defs.functions.length}, Namespaces=${defs.namespaces.length}`);
  return defs;
}

module.exports = { extractSignatures };