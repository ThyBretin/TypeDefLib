const fs = require("fs").promises;
const path = require("path");
const { extractFunctions } = require("./extract_functions");
const { extractTypes } = require("./extract_types");
const { extractEnums } = require("./extract_enums");
const { extractClasses } = require("./extract_classes");
const { extractConstants } = require("./extract_constants");
const { extractNamespaces } = require("./extract_namespaces");

async function extractSignatures(dtsPaths, libName, version) {
  const defs = {
    functions: [],
    enums: [],
    types: [],
    classes: [],
    constants: [],
    namespaces: [],
    version: version || "unknown"
  };

  for (const dtsPath of dtsPaths) {
    try {
      const fileDefs = {
        functions: extractFunctions(dtsPath),
        enums: extractEnums(dtsPath),
        types: extractTypes(dtsPath),
        classes: extractClasses(dtsPath),
        constants: extractConstants(dtsPath),
        namespaces: extractNamespaces(dtsPath)
      };

      const dedupeByName = (array, key) => {
        const seen = new Set();
        return array.filter(item => {
          const id = item[key];
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      };

      defs.functions.push(...dedupeByName(fileDefs.functions, "name"));
      defs.enums.push(...dedupeByName(fileDefs.enums, "name"));
      defs.types.push(...dedupeByName(fileDefs.types, "name"));
      defs.classes.push(...dedupeByName(fileDefs.classes, "name"));
      defs.constants.push(...dedupeByName(fileDefs.constants, "name"));
      defs.namespaces = fileDefs.namespaces; // Use single React namespace
    } catch (e) {
      console.error(`Failed to process ${dtsPath}: ${e.message}`);
      const errorLog = { file: dtsPath, libName, version, error: e.message, stack: e.stack, timestamp: new Date().toISOString() };
      await fs.appendFile("./libraryDefs/errors.json", JSON.stringify(errorLog) + "\n");
    }
  }

  const namespaceName = libName === "lodash" ? "_" : libName;
  defs.namespaces = [{
    name: namespaceName,
    contents: {
      functions: defs.functions,
      enums: defs.enums,
      types: defs.types,
      classes: defs.classes,
      constants: defs.constants
    },
    jsdoc: null,
    isExported: true
  }];

  // Only keep high-level progress and warnings/errors
  // Remove or comment out verbose logs
  // console.log(`Final defs: Functions=${defs.functions.length}, Types=${defs.types.length}, Namespaces=${defs.namespaces.length}`);
  return defs;
}

module.exports = { extractSignatures };