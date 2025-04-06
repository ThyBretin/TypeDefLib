const ts = require("typescript");
const { extractJSDoc } = require("./extract_jsdoc");

function extractClasses(checker, node) {
  const symbol = checker.getSymbolAtLocation(node.name);
  if (!symbol) return null;
  console.log(`Class: ${symbol.name}`);
  const type = checker.getTypeAtLocation(node);
  let constructors = type.getConstructSignatures();
  if (constructors.length === 0 && node.members.some(m => ts.isConstructorDeclaration(m))) {
    const ctor = node.members.find(m => ts.isConstructorDeclaration(m));
    const sig = checker.getSignatureFromDeclaration(ctor);
    if (sig) constructors = [sig];
  }
  const constructorDefs = constructors.map(sig => ({
    parameters: sig.parameters.map(p => ({
      name: p.name,
      type: checker.typeToString(checker.getTypeOfSymbolAtLocation(p, node)),
      optional: !!p.valueDeclaration?.questionToken
    })),
    returnType: checker.typeToString(sig.getReturnType())
  }));
  const methods = type.getProperties()
    .filter(prop => prop.valueDeclaration && ts.isMethodDeclaration(prop.valueDeclaration))
    .map(prop => {
      const decl = prop.valueDeclaration;
      const sigs = checker.getTypeOfSymbolAtLocation(prop, decl).getCallSignatures();
      return sigs.map(sig => ({
        name: `${symbol.name}.${prop.name}`,
        parameters: sig.parameters.map(p => ({
          name: p.name,
          type: checker.typeToString(checker.getTypeOfSymbolAtLocation(p, decl)),
          optional: !!p.valueDeclaration?.questionToken
        })),
        returnType: checker.typeToString(sig.getReturnType()),
        jsdoc: extractJSDoc(decl)
      }));
    }).flat();
  const properties = type.getProperties()
    .filter(prop => prop.valueDeclaration && !ts.isMethodDeclaration(prop.valueDeclaration))
    .map(prop => ({
      name: prop.name,
      type: checker.typeToString(checker.getTypeOfSymbolAtLocation(prop, node)),
      optional: !!(prop.flags & ts.SymbolFlags.Optional)
    }));
  const extendsClause = node.heritageClauses?.find(h => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.getText();
  const implementsClauses = node.heritageClauses
    ?.filter(h => h.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap(h => h.types.map(t => t.getText()));
  return {
    name: symbol.name,
    constructors: constructorDefs,
    methods,
    properties,
    extends: extendsClause,
    implements: implementsClauses || [],
    jsdoc: extractJSDoc(node),
    isExported: !!(symbol?.flags & ts.SymbolFlags.Export)
  };
}

module.exports = { extractClasses };