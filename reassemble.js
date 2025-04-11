const fs = require("fs").promises;

async function reassembleChunks(chunkFiles, outputFile, baseName, version) {
  const merged = { functions: [], enums: [], types: [], classes: [], constants: [], namespaces: [], version: null };
  const namespaceMap = new Map();
  const sections = ["functions", "enums", "types", "classes", "constants", "namespaces"];

  const mergeArraysDeep = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
      if (Array.isArray(value) && Array.isArray(target[key])) {
        target[key] = [...new Set([...target[key], ...value])];
      } else if (typeof value === "object" && value !== null && target[key]) {
        mergeArraysDeep(target[key], value);
      } else {
        target[key] = value;
      }
    }
  };

  for (const file of chunkFiles) {
    const chunk = JSON.parse(await fs.readFile(file, "utf-8"));
    for (const [key, value] of Object.entries(chunk)) {
      if (key === "version" && value && !merged.version) {
        merged.version = value;
      } else if (key === "namespaces" && Array.isArray(value)) {
        for (const ns of value) {
          const nsName = ns.name || baseName;
          if (!namespaceMap.has(nsName)) {
            namespaceMap.set(nsName, { 
              name: nsName, 
              contents: { functions: [], enums: [], types: [], classes: [], constants: [] },
              jsdoc: null,
              isExported: false
            });
          }
          const targetNs = namespaceMap.get(nsName);
          mergeArraysDeep(targetNs, ns);
        }
      } else if (sections.includes(key) && Array.isArray(value)) {
        merged[key] = merged[key].concat(value);
      }
    }
  }

  merged.namespaces = Array.from(namespaceMap.values());
  await fs.writeFile(outputFile, JSON.stringify(merged, null, 2));
  console.log(`Reassembled → ${outputFile}, namespaces merged: ${merged.namespaces.length}, version: ${merged.version}`);
}

module.exports = { reassembleChunks };