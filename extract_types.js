const { Project } = require("ts-morph");
const { extractJSDoc } = require("./extract_jsdoc");

function extractTypes(filePath) {
  const project = new Project({ addFilesFromTsConfig: false });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const types = [];

  sourceFile.getTypeAliases().forEach(ta => {
    const typeProps = ta.getType().getProperties();
    types.push({
      name: ta.getName(),
      type: ta.getTypeNode()?.getText() || "any",
      properties: typeProps.map(p => {
        const decls = p.getDeclarations();
        const isOptional = decls.length > 0 ? decls.some(d => d.hasQuestionToken?.() || d.getType().isOptional?.()) : false;
        return {
          name: p.getName(),
          type: p.getTypeAtLocation(sourceFile).getText(),
          optional: isOptional
        };
      }),
      jsdoc: extractJSDoc(ta),
      isExported: ta.isExported()
    });
  });

  sourceFile.getInterfaces().forEach(intf => {
    types.push({
      name: intf.getName(),
      type: intf.getText(),
      properties: intf.getProperties().map(p => ({
        name: p.getName(),
        type: p.getType().getText(),
        optional: p.hasQuestionToken()
      })),
      extends: intf.getBaseTypes().map(bt => bt.getText()),
      jsdoc: extractJSDoc(intf),
      isExported: intf.isExported()
    });
  });

  return types.sort((a, b) => {
    const aIsReact = a.name.includes("React") || a.name.includes("JSX") || a.jsdoc?.description?.toLowerCase().includes("react");
    const bIsReact = b.name.includes("React") || b.name.includes("JSX") || b.jsdoc?.description?.toLowerCase().includes("react");
    if (aIsReact && !bIsReact) return -1;
    if (!aIsReact && bIsReact) return 1;
    return a.name.localeCompare(b.name);
  });
}

module.exports = { extractTypes };