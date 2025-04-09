const ts = require("typescript");

function extractConstants(sourceFile, typeChecker) {
  const constants = [];

  function visit(node) {
    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach(decl => {
        if (decl.initializer && ts.isModifierLike(decl.modifiers?.find(mod => mod.kind === ts.SyntaxKind.ConstKeyword))) {
          const symbol = typeChecker.getSymbolAtLocation(decl.name);
          if (symbol) {
            const baseSymbol = symbol.declarations[0].parent.symbol || symbol;
            const fullName = baseSymbol.name === "_" ? `_.${symbol.name}` : `${baseSymbol.name}.${symbol.name}`;
            constants.push({
              name: fullName,
              value: decl.initializer.getText(),
              jsdoc: extractJsdoc(symbol)
            });
          }
        }
      });
    } else if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
      const symbol = typeChecker.getSymbolAtLocation(node.name);
      if (symbol && !node.initializer) return;
      const propType = typeChecker.getTypeAtLocation(node);
      const value = node.initializer?.getText();
      const isConstantLike = value || propType.isStringLiteral() || propType.isNumberLiteral() || symbol.name.toLowerCase() === "version";
      if (isConstantLike) {
        const baseSymbol = symbol.declarations[0].parent.symbol || symbol;
        const fullName = baseSymbol.name === "_" ? `_.${symbol.name}` : `${baseSymbol.name}.${symbol.name}`;
        constants.push({
          name: fullName,
          value: value || typeChecker.typeToString(propType),
          jsdoc: extractJsdoc(symbol)
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  function extractJsdoc(symbol) {
    const jsdoc = symbol?.getJsDocTags() || [];
    return jsdoc.length > 0 ? { description: jsdoc.map(tag => tag.text).join(" ") } : undefined;
  }

  visit(sourceFile);
  return constants;
}

module.exports = { extractConstants };