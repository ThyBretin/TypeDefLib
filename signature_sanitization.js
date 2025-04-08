const fs = require("fs").promises;
const path = require("path");

function cleanObject(obj) {
  if (Array.isArray(obj)) {
    return obj.filter(item => item !== null && item !== undefined).map(cleanObject);
  }
  if (typeof obj === "object" && obj !== null) {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined || value === "") continue;
      const cleanedValue = cleanObject(value);
      if (cleanedValue !== null && (Array.isArray(cleanedValue) || Object.keys(cleanedValue).length > 0)) {
        cleaned[key] = cleanedValue;
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  }
  return obj;
}

function sanitizeString(str) {
  if (typeof str !== "string") return str;
  return str.replace(/['"]+/g, "").trim();
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
      if (ns.contents?.constants) {
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

function validateJson(json, fileName) {
  try {
    const cloned = JSON.parse(JSON.stringify(json));
    const required = ["version"];
    const missing = required.filter(key => !(key in json));
    if (missing.length) throw new Error(`Missing required fields: ${missing.join(", ")}`);
    return true;
  } catch (e) {
    console.error(`Invalid JSON in ${fileName}: ${e.message}`);
    return false;
  }
}

async function sanitizeChunk(inputFile, outputFile) {
  const json = JSON.parse(await fs.readFile(inputFile, "utf-8"));
  if (!validateJson(json, inputFile)) throw new Error(`Skipping ${inputFile} due to invalid JSON`);

  const sanitized = JSON.parse(JSON.stringify(json, (key, value) => sanitizeString(value)));
  const deduped = dedupeConstants(sanitized);
  const cleaned = cleanObject(deduped);

  if (!cleaned || Object.keys(cleaned).length === 0) {
    console.warn(`Nothing left after sanitizing ${inputFile}`);
    return;
  }

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(cleaned, null, 2));
  console.log(`Sanitized ${inputFile} → ${outputFile}`);
}

async function cleanupAll() {
  console.log("Step 3: Sanitizing chunks...");
  const splitedDir = "./libraryDefs/splited";
  const files = await fs.readdir(splitedDir);
  for (const file of files) {
    if (file.endsWith(".chunk.json")) {
      const inputFile = `${splitedDir}/${file}`;
      const outputFile = `./libraryDefs/cleaned/${file.replace(".chunk.json", ".sanitized.json")}`;
      if (!await fs.stat(outputFile).catch(() => false)) {
        await sanitizeChunk(inputFile, outputFile);
      }
    }
  }
}

if (require.main === module) cleanupAll().catch(console.error);