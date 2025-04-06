const ts = require("typescript");
const { extractFunctions } = require("./extract_functions");
const { extractEnums } = require("./extract_enums");
const { extractTypes } = require("./extract_types");
const { extractClasses } = require("./extract_classes");
const { extractConstants } = require("./extract_constants");
const { extractJSDoc } = require("./extract_jsdoc");

function extractNamespaces(checker, node, sourceFile, seenFunctions = new Set(), visitedTypes = new Set()) {
  if (!ts.isModuleDeclaration(node) || !node.body) return null;
  const symbol = checker.getSymbolAtLocation(node.name);
  if (!symbol) return null;
  console.log(`Namespace: ${symbol.name}`);

  const contents = { functions: [], enums: [], types: [], classes: [], constants: [] };
  if (ts.isModuleBlock(node.body)) {
    ts.forEachChild(node.body, child => {
      if (ts.isFunctionDeclaration(child)) {
        const fnSymbol = checker.getSymbolAtLocation(child.name);
        if (fnSymbol) contents.functions.push(...extractFunctions(checker, fnSymbol, sourceFile, symbol.name, seenFunctions));
      } else if (ts.isEnumDeclaration(child)) {
        const enumDef = extractEnums(checker, child);
        if (enumDef) contents.enums.push(enumDef);
      } else if (ts.isTypeAliasDeclaration(child) || ts.isInterfaceDeclaration(child)) {
        const typeDef = extractTypes(checker, child, visitedTypes);
        if (typeDef) contents.types.push(typeDef);
      } else if (ts.isClassDeclaration(child)) {
        const classDef = extractClasses(checker, child);
        if (classDef) {
          contents.classes.push(classDef);
          contents.functions.push(...classDef.methods);
        }
      } else if (ts.isVariableStatement(child)) {
        contents.constants.push(...extractConstants(checker, child));
      }
    });
  }

  return {
    name: symbol.name,
    contents,
    jsdoc: extractJSDoc(node),
    isExported: !!(symbol.flags & ts.SymbolFlags.Export)
  };
}

module.exports = { extractNamespaces };