const ts = require("typescript");
const fs = require("fs");
const path = require("path");

function extractSignatures(dtsPath, libName, version) {
  const program = ts.createProgram([dtsPath], { allowJs: false });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(dtsPath);
  const defs = { functions: [], version: version || "unknown" };
  const seenFunctions = new Set();

  function extractFunctionFromSymbol(symbol, file, baseName = "") {
    const decl = symbol.valueDeclaration || symbol.declarations?.[0];
    if (!decl) {
      console.log(`No declaration for ${baseName ? `${baseName}.` : ""}${symbol.name}`);
      return;
    }

    const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
    const signatures = type.getCallSignatures();

    signatures.forEach(sig => {
      const name = baseName ? `${baseName}.${symbol.name}` : symbol.name;
      if (!seenFunctions.has(name)) {
        seenFunctions.add(name);
        defs.functions.push({
          name,
          parameters: sig.parameters.map(p => ({
            name: p.name,
            type: checker.typeToString(checker.getTypeOfSymbolAtLocation(p, file)),
            optional: !!p.valueDeclaration?.questionToken
          })),
          returnType: checker.typeToString(sig.getReturnType()),
          jsdoc: extractJSDoc(decl)
        });
      }
    });

    const props = type.getProperties();
    props.forEach(prop => {
      console.log(`  Property: ${baseName ? `${baseName}.` : ""}${prop.name}`);
      const propType = checker.getTypeOfSymbolAtLocation(prop, file);
      propType.getCallSignatures().forEach(sig => {
        const name = baseName ? `${baseName}.${prop.name}` : prop.name;
        if (!seenFunctions.has(name)) {
          seenFunctions.add(name);
          defs.functions.push({
            name,
            parameters: sig.parameters.map(p => ({
              name: p.name,
              type: checker.typeToString(checker.getTypeOfSymbolAtLocation(p, file)),
              optional: !!p.valueDeclaration?.questionToken
            })),
            returnType: checker.typeToString(sig.getReturnType()),
            jsdoc: extractJSDoc(prop.valueDeclaration)
          });
        }
      });
    });
  }

  function extractJSDoc(node) {
    const jsDoc = node?.jsDoc?.[0];
    if (!jsDoc) return null;
    const description = typeof jsDoc.comment === "string" ? jsDoc.comment : jsDoc.comment?.map(c => c.text).join(" ") || "";
    return {
      description,
      params: jsDoc.tags?.filter(t => t.tagName.text === "param").map(t => ({
        name: t.name?.text,
        description: typeof t.comment === "string" ? t.comment : t.comment?.map(c => c.text).join(" ")
      })),
      returns: typeof jsDoc.tags?.find(t => t.tagName.text === "returns")?.comment === "string" 
        ? jsDoc.tags?.find(t => t.tagName.text === "returns")?.comment 
        : jsDoc.tags?.find(t => t.tagName.text === "returns")?.comment?.map(c => c.text).join(" "),
      deprecated: !!jsDoc.tags?.find(t => t.tagName.text === "deprecated")
    };
  }

  if (sourceFile) {
    console.log(`Processing file: ${dtsPath}`);
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol) {
      const exports = checker.getExportsOfModule(moduleSymbol);
      console.log(`Found ${exports.length} top-level exports`);
      exports.forEach(exp => {
        console.log(`Export: ${exp.name}`);
        extractFunctionFromSymbol(exp, sourceFile);
        const expType = checker.getTypeOfSymbolAtLocation(exp, sourceFile);
        const expProps = expType.getProperties();
        console.log(`  ${exp.name} has ${expProps.length} properties`);
        expProps.forEach(prop => extractFunctionFromSymbol(prop, sourceFile, exp.name));
      });
    }

    ts.forEachChild(sourceFile, node => {
      if (ts.isModuleDeclaration(node) && node.body && ts.isModuleBlock(node.body)) {
        const symbol = checker.getSymbolAtLocation(node.name);
        if (symbol) {
          const exports = checker.getExportsOfModule(symbol);
          console.log(`Module "${node.name.text}" has ${exports.length} exports`);
          exports.forEach(exp => {
            console.log(`Module export: ${exp.name}`);
            extractFunctionFromSymbol(exp, sourceFile);
            const expType = checker.getTypeOfSymbolAtLocation(exp, sourceFile);
            const expProps = expType.getProperties();
            console.log(`  ${exp.name} has ${expProps.length} properties`);
            expProps.forEach(prop => extractFunctionFromSymbol(prop, sourceFile, exp.name));
          });
        }
      }
      if (ts.isVariableStatement(node) && node.parent?.kind === ts.SyntaxKind.ModuleBlock) {
        node.declarationList.declarations.forEach(decl => {
          const symbol = checker.getSymbolAtLocation(decl.name);
          if (symbol) {
            console.log(`Module var: ${symbol.name}`);
            extractFunctionFromSymbol(symbol, sourceFile);
            const varType = checker.getTypeOfSymbolAtLocation(symbol, decl);
            const varProps = varType.getProperties();
            console.log(`  ${symbol.name} has ${varProps.length} properties`);
            varProps.forEach(prop => extractFunctionFromSymbol(prop, sourceFile, symbol.name));
          }
        });
      }
      if (ts.isExportAssignment(node) && node.expression) {
        const symbol = checker.getSymbolAtLocation(node.expression);
        if (symbol) {
          console.log(`Export assignment: ${symbol.name}`);
          extractFunctionFromSymbol(symbol, sourceFile);
          const expType = checker.getTypeOfSymbolAtLocation(symbol, sourceFile);
          const expProps = expType.getProperties();
          console.log(`  ${symbol.name} has ${expProps.length} properties`);
          expProps.forEach(prop => extractFunctionFromSymbol(prop, sourceFile, symbol.name));
        }
      }
    });
  }

  return defs;
}

function extractSignaturesForLibraries(libraries) {
  libraries.forEach(lib => {
    const { name, dtsPath, version } = lib;
    if (!fs.existsSync(dtsPath)) {
      console.error(`No .d.ts file at ${dtsPath} for ${name}`);
      return;
    }
    const defs = extractSignatures(dtsPath, name, version);
    const baseName = name.split("/").pop();
    const outputFile = `./libraryDefs/${baseName}-${defs.version}.signatures.json`;
    fs.writeFileSync(outputFile, JSON.stringify(defs, null, 2));
    console.log(`Signatures extracted for ${name}`);
  });
}

module.exports = { extractSignaturesForLibraries };