const { Project } = require("ts-morph");
const { extractJSDoc } = require("./extract_jsdoc");

function extractEnums(filePath) {
  const project = new Project({ addFilesFromTsConfig: false });
  const sourceFile = project.addSourceFileAtPath(filePath);
  return sourceFile.getEnums().map(enumDecl => ({
    name: enumDecl.getName(),
    members: enumDecl.getMembers().map(m => ({
      name: m.getName(),
      value: m.getInitializer()?.getText()
    })),
    jsdoc: extractJSDoc(enumDecl),
    isExported: enumDecl.isExported()
  }));
}

module.exports = { extractEnums };