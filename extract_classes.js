const { Project } = require("ts-morph");
const { extractJSDoc } = require("./extract_jsdoc");

function extractClasses(filePath) {
  const project = new Project({ addFilesFromTsConfig: false });
  const sourceFile = project.addSourceFileAtPath(filePath);
  return sourceFile.getClasses().map(cls => ({
    name: cls.getName(),
    constructors: cls.getConstructors().map(c => ({
      parameters: c.getParameters().map(p => ({
        name: p.getName(),
        type: p.getType().getText(),
        optional: typeof p.isOptional === 'function' ? p.isOptional() : false
      })),
      returnType: c.getReturnType().getText()
    })),
    methods: cls.getMethods().map(m => ({
      name: `${cls.getName()}.${m.getName()}`,
      parameters: m.getParameters().map(p => ({
        name: p.getName(),
        type: p.getType().getText(),
        optional: typeof p.isOptional === 'function' ? p.isOptional() : false
      })),
      returnType: m.getReturnType().getText(),
      jsdoc: extractJSDoc(m)
    })),
    properties: cls.getProperties().map(p => ({
      name: p.getName(),
      type: p.getType().getText(),
      optional: typeof p.isOptional === 'function' ? p.isOptional() : false
    })),
    extends: cls.getBaseClass()?.getName(),
    implements: cls.getImplements().map(i => i.getText()),
    jsdoc: extractJSDoc(cls),
    isExported: cls.isExported()
  }));
}

module.exports = { extractClasses };