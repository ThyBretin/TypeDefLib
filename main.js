const fs = require("fs").promises;
const path = require("path");
const { extractSignatures } = require("./signature_extraction");
const { findDtsFiles } = require("./crawl");

async function main() {
  console.log("Step 1: Crawling libraries...");
  const libraries = await findDtsFiles("./package.json");

  console.log("Step 2: Starting extraction...");
  await fs.mkdir("./libraryDefs/signatures", { recursive: true });
  for (const lib of libraries) {
    const { name, dtsPath, version } = lib;
    const baseName = name.split("/").pop();
    const outputFile = `./libraryDefs/signatures/${baseName}-${version}.signatures.json`;
    
    if (await fs.stat(outputFile).catch(() => false)) {
      console.log(`Skipping ${name}—${outputFile} already exists`);
      continue;
    }
    
    if (!await fs.stat(dtsPath).catch(() => false)) {
      console.error(`No .d.ts file at ${dtsPath} for ${name}`);
      continue;
    }
    const defs = extractSignatures(dtsPath, name, version);
    await fs.writeFile(outputFile, JSON.stringify(defs, null, 2));
    console.log(`Signatures extracted for ${name}`);
  }
}

main().catch(console.error);