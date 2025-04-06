const ts = require("typescript");
const { extractJSDoc } = require("./extract_jsdoc");

function extractEnums(checker, node) {
  const symbol = checker.getSymbolAtLocation(node.name);
  if (!symbol) return null;
  console.log(`Enum: ${symbol.name}`);
  return {
    name: symbol.name,
    members: node.members.map(m => ({
      name: m.name.getText(),
      value: m.initializer ? m.initializer.getText() : undefined
    })),
    jsdoc: extractJSDoc(node),
    isExported: !!(symbol?.flags & ts.SymbolFlags.Export)
  };
}

module.exports = { extractEnums };