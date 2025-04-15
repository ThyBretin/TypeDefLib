const { Project } = require("ts-morph");
const { extractJSDoc } = require("./extract_jsdoc");

function extractNamespaces(filePath) {
  const project = new Project({ addFilesFromTsConfig: false });
  const sourceFile = project.addSourceFileAtPath(filePath);
  return [{
    name: "React",
    contents: {
      functions: [],
      enums: [],
      types: [],
      classes: [],
      constants: []
    },
    jsdoc: extractJSDoc(sourceFile),
    isExported: true
  }];
}

module.exports = { extractNamespaces };