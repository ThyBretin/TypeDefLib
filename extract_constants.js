const ts = require("typescript");
const { extractJSDoc } = require("./extract_jsdoc");

function extractConstants(checker, node, baseSymbol = null) {
  const constants = [];
  
  // Top-level variable statements
  if (node && ts.isVariableStatement(node)) {
    node.declarationList.declarations.forEach(decl => {
      const symbol = checker.getSymbolAtLocation(decl.name);
      if (symbol) {
        const value = decl.initializer ? decl.initializer.getText() : undefined;
        console.log(`Constant: ${symbol.name}`);
        constants.push({
          name: symbol.name,
          type: checker.typeToString(checker.getTypeAtLocation(decl)),
          value,
          jsdoc: extractJSDoc(decl),
          isExported: !!(symbol.flags & ts.SymbolFlags.Export)
        });
      }
    });
  }

  // Properties of a base symbol (e.g., _.VERSION)
  if (baseSymbol) {
    const decl = baseSymbol.valueDeclaration || baseSymbol.declarations?.[0];
    if (decl) {
      const type = checker.getTypeOfSymbolAtLocation(baseSymbol, decl);
      type.getProperties().forEach(prop => {
        const propDecl = prop.valueDeclaration;
        const value = propDecl && (ts.isPropertySignature(propDecl) || ts.isPropertyDeclaration(propDecl)) && propDecl.initializer 
          ? propDecl.initializer.getText() 
          : undefined;
        if (value) {
          console.log(`Constant: ${baseSymbol.name}.${prop.name}`);
          constants.push({
            name: `${baseSymbol.name}.${prop.name}`,
            type: checker.typeToString(checker.getTypeOfSymbolAtLocation(prop, propDecl)),
            value,
            jsdoc: extractJSDoc(propDecl),
            isExported: !!(prop.flags & ts.SymbolFlags.Export)
          });
        }
      });
    }
  }

  return constants;
}

module.exports = { extractConstants };