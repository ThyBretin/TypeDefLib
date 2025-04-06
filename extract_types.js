const ts = require("typescript");
const { extractJSDoc } = require("./extract_jsdoc");

function extractTypes(checker, node, visitedTypes = new Set()) {
  const symbol = checker.getSymbolAtLocation(node.name);
  if (!symbol) return null;
  const kind = ts.isTypeAliasDeclaration(node) ? "Type" : "Interface";
  console.log(`${kind}: ${symbol.name}`);
  if (visitedTypes.has(symbol.name)) return null;
  visitedTypes.add(symbol.name);

  const type = checker.getTypeAtLocation(node);
  let resolvedType = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
  const properties = type.getProperties().map(prop => ({
    name: prop.name,
    type: checker.typeToString(checker.getTypeOfSymbolAtLocation(prop, node)),
    optional: !!(prop.flags & ts.SymbolFlags.Optional)
  }));
  let extendsTypes = [];
  if (ts.isInterfaceDeclaration(node) && node.heritageClauses) {
    extendsTypes = node.heritageClauses
      .filter(h => h.token === ts.SyntaxKind.ExtendsKeyword)
      .flatMap(h => h.types.map(t => t.getText()));
  }
  if (type.aliasSymbol) {
    const aliasType = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
    const typeArgs = type.aliasTypeArguments;
    if (typeArgs?.length) {
      const baseName = type.aliasSymbol.name;
      resolvedType = `${baseName}<${typeArgs.map(t => checker.typeToString(t)).join(", ")}>`;
    } else {
      const constraint = type.getConstraint();
      if (constraint) {
        resolvedType = checker.typeToString(constraint, undefined, ts.TypeFormatFlags.NoTruncation);
      } else if (aliasType !== type) {
        resolvedType = checker.typeToString(aliasType, undefined, ts.TypeFormatFlags.NoTruncation);
      }
    }
  } else if (type.isUnionOrIntersection()) {
    resolvedType = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
  }
  return {
    name: symbol.name,
    type: resolvedType,
    properties,
    extends: extendsTypes,
    jsdoc: extractJSDoc(node),
    isExported: !!(symbol?.flags & ts.SymbolFlags.Export)
  };
}

module.exports = { extractTypes };