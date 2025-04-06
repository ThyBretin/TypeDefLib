const fs = require("fs");
const path = require("path");
const { extractSignatures } = require("./signature_extraction");

console.log("Step 1: Reading libraries...");
const libraries = JSON.parse(fs.readFileSync("./libraries.json", "utf8"));

console.log("Step 2: Starting extraction...");
if (!fs.existsSync("./libraryDefs")) {
  fs.mkdirSync("./libraryDefs"); // Create dir if missing
}
libraries.forEach(lib => {
  const { name, dtsPath, version } = lib;
  if (!fs.existsSync(dtsPath)) {
    console.error(`No .d.ts file at ${dtsPath} for ${name}`);
    return;
  }
  const defs = extractSignatures(dtsPath, name, version);
  const baseName = name.split("/").pop();
  const outputFile = `./libraryDefs/${baseName}-${defs.version}.signatures.json`;
  fs.writeFileSync(outputFile, JSON.stringify(defs, null, 2));
  console.log(`Signatures extracted for ${name}`);
});