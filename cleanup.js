const fs = require("fs").promises;
const path = require("path");

function cleanObject(obj) {
  if (Array.isArray(obj)) {
    return obj.filter(item => item !== null && item !== undefined && (typeof item !== "object" || Object.keys(item).length > 0))
      .map(cleanObject);
  }
  if (typeof obj === "object" && obj !== null) {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0) || (typeof value === "object" && Object.keys(value).length === 0)) {
        continue;
      }
      cleaned[key] = cleanObject(value);
    }
    return cleaned;
  }
  return obj;
}

function dedupeConstants(defs) {
  const seen = new Map();
  
  if (defs.constants) {
    defs.constants = defs.constants.filter(c => {
      if (seen.has(c.name)) {
        const existing = seen.get(c.name);
        if (c.jsdoc && !existing.jsdoc) existing.jsdoc = c.jsdoc;
        return false;
      }
      seen.set(c.name, c);
      return true;
    });
  }
  
  if (defs.namespaces) {
    defs.namespaces.forEach(ns => {
      if (ns.contents.constants) {
        ns.contents.constants = ns.contents.constants.filter(c => {
          if (seen.has(c.name)) {
            const existing = seen.get(c.name);
            if (c.jsdoc && !existing.jsdoc) existing.jsdoc = c.jsdoc;
            return false;
          }
          seen.set(c.name, c);
          return true;
        });
      }
    });
  }
  
  return defs;
}

async function cleanupAll() {
  console.log("Step 3: Cleaning signatures...");
  const libraries = JSON.parse(await fs.readFile("./libraries.json", "utf8"));
  await fs.mkdir("./libraryDefs/clean", { recursive: true });
  for (const lib of libraries) {
    const { name, version } = lib;
    const baseName = name.split("/").pop();
    const inputFile = `./libraryDefs/signatures/${baseName}-${version}.signatures.json`;
    const outputFile = `./libraryDefs/clean/${baseName}-${version}.cleaned.json`;
    
    if (!await fs.stat(inputFile).catch(() => false)) {
      console.error(`File not found: ${inputFile}`);
      continue;
    }
    if (await fs.stat(outputFile).catch(() => false)) {
      console.log(`Skipping ${inputFile}—${outputFile} already exists`);
      continue;
    }
    
    const json = JSON.parse(await fs.readFile(inputFile, "utf-8"));
    const deduped = dedupeConstants(json);
    const cleaned = cleanObject(deduped);
    await fs.writeFile(outputFile, JSON.stringify(cleaned, null, 2));
    console.log(`Cleaned ${inputFile} → ${outputFile}`);
  }
}

cleanupAll().catch(console.error);