const { Project, SyntaxKind } = require("ts-morph");
const { extractJSDoc } = require("./extract_jsdoc");

function extractFunctions(filePath) {
  const project = new Project({ addFilesFromTsConfig: false });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const functions = [];

  if (filePath.endsWith(".js")) {
    return sourceFile.getFunctions().map(fn => ({
      name: fn.getName() || "anonymous",
      parameters: fn.getJsDocs().flatMap(doc => doc.getTags().filter(t => t.getTagName() === "param")).map(p => ({
        name: p.getCommentText() || "unknown",
        type: "any",
        optional: false
      })),
      returnType: fn.getJsDocs().find(doc => doc.getTags().some(t => t.getTagName() === "returns"))?.getCommentText() || "any",
      jsdoc: extractJSDoc(fn)
    }));
  }

  sourceFile.forEachDescendant(node => {
    let fn;
    let name = "anonymous";

    if (node.getKind() === SyntaxKind.FunctionDeclaration) {
      fn = node;
      name = fn.getName() || "anonymous";
    } else if (node.getKind() === SyntaxKind.FunctionType) {
      fn = node;
      const parent = node.getParent();
      if (parent && parent.getKind() === SyntaxKind.TypeAliasDeclaration) {
        name = parent.getName() || "anonymous";
      }
    } else if (node.getKind() === SyntaxKind.TypeAliasDeclaration) {
      const typeNode = node.getTypeNode();
      if (typeNode && typeNode.getKind() === SyntaxKind.FunctionType) {
        fn = typeNode;
        name = node.getName() || "anonymous";
      }
    }

    if (fn) {
      const jsdoc = extractJSDoc(fn);
      if (
        name !== "Destructor" &&
        (jsdoc?.description?.toLowerCase().includes("react") ||
          name.startsWith("use") ||
          ["createElement", "render", "memo", "forwardRef", "cloneElement"].includes(name))
      ) {
        functions.push({
          name,
          parameters: fn.getParameters().map(p => ({
            name: p.getName() || "arg",
            type: p.getType().getText() || "any",
            optional: p.hasQuestionToken() || false
          })),
          returnType: fn.getReturnType?.().getText() || "any",
          jsdoc,
          isExported: fn.isExported?.() || node.isExported?.() || false
        });
      }
      // Only keep high-level progress and warnings/errors
      // Remove or comment out verbose logs
      // console.log("Function:", name, jsdoc);
    }
  });

  return functions;
}

module.exports = { extractFunctions };