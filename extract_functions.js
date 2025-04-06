const ts = require("typescript");
const { extractJSDoc } = require("./extract_jsdoc");

function extractFunctions(checker, symbol, file, baseName = "", seenFunctions = new Set()) {
  const decl = symbol.valueDeclaration || symbol.declarations?.[0];
  if (!decl) return [];

  const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
  const signatures = type.getCallSignatures();
  const functions = [];

  signatures.forEach(sig => {
    const name = baseName ? `${baseName}.${symbol.name}` : symbol.name;
    if (!seenFunctions.has(name)) {
      seenFunctions.add(name);
      functions.push({
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
        functions.push({
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

  return functions;
}

module.exports = { extractFunctions };