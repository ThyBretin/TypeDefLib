const ts = require("typescript");

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
    jsdoc: extractJSDoc(node)
  };
}

function extractTypes(checker, node, visitedTypes = new Set()) {
  const symbol = checker.getSymbolAtLocation(node.name);
  if (!symbol) return null;
  const kind = ts.isTypeAliasDeclaration(node) ? "Type" : "Interface";
  console.log(`${kind}: ${symbol.name}`);
  if (visitedTypes.has(symbol.name)) return null; // Avoid cycles
  visitedTypes.add(symbol.name);

  const type = checker.getTypeAtLocation(node);
  let resolvedType = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
  if (type.aliasSymbol) {
    const baseType = type.aliasTypeArguments?.length
      ? checker.typeToString(type)
      : checker.typeToString(type.getConstraint() || type);
    resolvedType = baseType !== symbol.name ? baseType : resolvedType;
  }
  return {
    name: symbol.name,
    type: resolvedType,
    jsdoc: extractJSDoc(node)
  };
}

function extractClasses(checker, node) {
  const symbol = checker.getSymbolAtLocation(node.name);
  if (!symbol) return null;
  console.log(`Class: ${symbol.name}`);
  const type = checker.getTypeAtLocation(node);
  const constructors = type.getConstructSignatures().map(sig => ({
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
  return {
    name: symbol.name,
    constructors,
    methods,
    jsdoc: extractJSDoc(node)
  };
}

console.log("Exporting from core_extraction:", Object.keys(module.exports)); // Debug
module.exports = { extractFunctions, extractEnums, extractTypes, extractClasses, extractJSDoc };