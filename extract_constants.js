const ts = require("typescript");
const { extractJSDoc } = require("./extract_jsdoc");

function extractConstants(checker, node, baseSymbol = null, version = "unknown") {
  const constantsMap = new Map();
  
  if (node && ts.isVariableStatement(node)) {
    node.declarationList.declarations.forEach(decl => {
      const symbol = checker.getSymbolAtLocation(decl.name);
      if (symbol) {
        const value = decl.initializer ? decl.initializer.getText() : undefined;
        console.log(`Constant: ${symbol.name}`);
        constantsMap.set(symbol.name, {
          name: symbol.name,
          type: checker.typeToString(checker.getTypeAtLocation(decl)),
          value,
          jsdoc: extractJSDoc(decl),
          isExported: !!(symbol.flags & ts.SymbolFlags.Export)
        });
      }
    });
  }

  if (baseSymbol) {
    const decl = baseSymbol.valueDeclaration || baseSymbol.declarations?.[0];
    if (decl) {
      const type = checker.getTypeOfSymbolAtLocation(baseSymbol, decl);
      type.getProperties().forEach(prop => {
        const propDecl = prop.valueDeclaration;
        const value = propDecl && (ts.isPropertySignature(propDecl) || ts.isPropertyDeclaration(propDecl)) && propDecl.initializer 
          ? propDecl.initializer.getText() 
          : (prop.name.toLowerCase() === "version" ? `"${version}"` : undefined);
        const propType = checker.getTypeOfSymbolAtLocation(prop, propDecl || decl);
        const isConstantLike = value || propType.isStringLiteral() || propType.isNumberLiteral() || prop.name.toLowerCase() === "version";
        if (isConstantLike) {
          const fullName = baseSymbol.name === "_" ? `_.${prop.name}` : 
                          baseSymbol.name === "default" && prop.name === "VERSION" ? "axios.VERSION" : 
                          `${baseSymbol.name}.${prop.name}`;
          console.log(`Constant: ${fullName}`);
          const existing = constantsMap.get(fullName);
          if (!existing) {
            constantsMap.set(fullName, {
              name: fullName,
              type: checker.typeToString(propType),
              value: value || (propType.isLiteral() ? propType.value.toString() : undefined),
              jsdoc: extractJSDoc(propDecl),
              isExported: !!(prop.flags & ts.SymbolFlags.Export)
            });
          } else if (!existing.jsdoc && extractJSDoc(propDecl)) {
            existing.jsdoc = extractJSDoc(propDecl); // Update with JSDoc if missing
          }
        }
      });
    }
  }

  return Array.from(constantsMap.values());
}

module.exports = { extractConstants };