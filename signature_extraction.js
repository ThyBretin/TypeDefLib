const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const { getInstalledVersion } = require("./library_manager");

function extractSignatures(dtsPath, sourceFileName) {
  // Only include Lodash-related files
  const program = ts.createProgram([dtsPath], { allowJs: false });
  const sourceFile = program.getSourceFile(dtsPath);
  const defs = { functions: [], version: getInstalledVersion(sourceFileName) };

  function visit(node, file) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.getText(file);
      // Strict filter for Lodash functions
      if (name.startsWith("_") || name === "chain" || name === "tap") {
        defs.functions.push({
          name,
          parameters: node.parameters.map(p => ({
            name: p.name.getText(file),
            type: p.type ? p.type.getText(file) : "any",
            optional: !!p.questionToken
          })),
          returnType: node.type ? node.type.getText(file) : "any",
          isExported: node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) || false
        });
      }
    } else if (ts.isInterfaceDeclaration(node) && node.name.getText(file) === "LoDashStatic") {
      node.members.forEach(member => {
        if (ts.isMethodSignature(member) && member.name) {
          const name = member.name.getText(file);
          defs.functions.push({
            name,
            parameters: member.parameters.map(p => ({
              name: p.name.getText(file),
              type: p.type ? p.type.getText(file) : "any",
              optional: !!p.questionToken
            })),
            returnType: member.type ? member.type.getText(file) : "any",
            isExported: true
          });
        }
      });
    }
    ts.forEachChild(node, child => visit(child, file));
  }

  // Only process files in @types/lodash
  const lodashFiles = program.getSourceFiles().filter(f => 
    f.fileName.includes(`node_modules/@types/lodash`) && !f.fileName.includes("node_modules/@types/lodash/fp")
  );
  lodashFiles.forEach(file => {
    console.log(`Processing file: ${file.fileName}`);
    visit(file, file);
  });

  return defs;
}

function extractSignaturesForLibraries() {
  const libraries = JSON.parse(fs.readFileSync("./libraries.json", "utf-8"));
  libraries.forEach(lib => {
    const baseName = lib.name.split("/")[1];
    const dtsPath = path.resolve(`./node_modules/${lib.name}/index.d.ts`);
    if (!fs.existsSync(dtsPath)) {
      console.error(`No index.d.ts for ${lib.name}`);
      return;
    }
    const defs = extractSignatures(dtsPath, lib.name);
    const outputFile = `./libraryDefs/${baseName}-${defs.version}.signatures.json`;
    fs.writeFileSync(outputFile, JSON.stringify(defs, null, 2));
    console.log(`Signatures extracted for ${lib.name}`);
  });
}

module.exports = { extractSignaturesForLibraries };