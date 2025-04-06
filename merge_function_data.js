const fs = require("fs");

function mergeDataForLibraries() {
  const libraries = JSON.parse(fs.readFileSync("./libraries.json", "utf-8"));
  libraries.forEach(lib => {
    const baseName = lib.name.split("/")[1];
    const sigFile = fs.readdirSync("./libraryDefs")
      .filter(f => f.startsWith(`${baseName}-`) && f.endsWith(".signatures.json"))
      .sort()
      .pop();
    if (!sigFile) return;

    const version = sigFile.match(/-(.+)\.signatures\.json$/)[1];
    const descFile = `./libraryDefs/${baseName}-${version}.descriptions.json`;
    if (!fs.existsSync(descFile)) {
      console.error(`No descriptions file for ${lib.name}`);
      return;
    }

    const signatures = JSON.parse(fs.readFileSync(`./libraryDefs/${sigFile}`, "utf-8"));
    const { descriptions } = JSON.parse(fs.readFileSync(descFile, "utf-8"));

    const mergedDefs = {
      version,
      functions: signatures.functions.map(func => ({
        ...func,
        description: descriptions[func.name] || "No description available"
      }))
    };

    const outputFile = `./libraryDefs/${baseName}-${version}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(mergedDefs, null, 2));
    console.log(`Merged data for ${lib.name}`);
  });
}

module.exports = { mergeDataForLibraries };