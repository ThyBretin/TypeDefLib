const { Project, SyntaxKind } = require("ts-morph");
const { extractJSDoc } = require("./extract_jsdoc");

function extractConstants(filePath) {
  const project = new Project({ addFilesFromTsConfig: false });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const constants = [];
  sourceFile.getVariableStatements().forEach(stmt => {
    if (stmt.getKind() === SyntaxKind.VariableStatement && stmt.hasModifier("const")) {
      stmt.getDeclarations().forEach(decl => {
        constants.push({
          name: decl.getName(),
          value: decl.getInitializer()?.getText(),
          jsdoc: extractJSDoc(decl)
        });
      });
    }
  });
  return constants;
}

module.exports = { extractConstants };