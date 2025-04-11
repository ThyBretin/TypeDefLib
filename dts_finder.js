const fs = require("fs").promises;
const path = require("path");

async function crawlDtsFiles(packageName, version) {
  const pkgPath = path.resolve(`./node_modules/${packageName}`);
  const typesPkgPath = path.resolve(`./node_modules/@types/${packageName}`);
  const pkgJsonPath = `${pkgPath}/package.json`;
  const outputPath = `./libraryDefs/dts_store/${packageName}-${version}.json`;
  const logs = [];

  try {
    let dtsFiles = [];
    let mainDtsPath;

    // Check package.json first
    if (await fs.stat(pkgJsonPath).catch(() => false)) {
      const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, "utf-8"));
      mainDtsPath = pkgJson.types || pkgJson.typings || "index.d.ts";
      mainDtsPath = path.resolve(pkgPath, mainDtsPath);
      if (await fs.stat(mainDtsPath).catch(() => false)) {
        dtsFiles.push(mainDtsPath);
        logs.push(`Found main .d.ts: ${mainDtsPath}`);
      }
    }

    // Fallback to @types/ if no main .d.ts found
    if (dtsFiles.length === 0 && (await fs.stat(typesPkgPath).catch(() => false))) {
      mainDtsPath = path.resolve(typesPkgPath, "index.d.ts");
      if (await fs.stat(mainDtsPath).catch(() => false)) {
        dtsFiles.push(mainDtsPath);
        logs.push(`Found main .d.ts in @types: ${mainDtsPath}`);
      }
    }

    // Crawl all .d.ts files (including submodules)
    const searchPath = dtsFiles.length > 0 ? pkgPath : typesPkgPath;
    const allDtsFiles = await crawlDir(searchPath, ".d.ts");
    dtsFiles = [...new Set([mainDtsPath, ...allDtsFiles.filter(f => f !== mainDtsPath)])];
    logs.push(`Found ${dtsFiles.length} .d.ts files: ${dtsFiles.join(", ")}`);

    await fs.mkdir("./libraryDefs/dts_store", { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify({ files: dtsFiles }, null, 2));
    console.log(`Stored .d.ts files for ${packageName}-${version} to ${outputPath}`);
    return { dtsFiles, logs };
  } catch (e) {
    logs.push(`Error crawling ${packageName}: ${e.message}`);
    console.error(`Failed to crawl ${packageName}:`, e);
    return { dtsFiles: [], logs };
  }
}

async function crawlDir(dir, ext) {
  const results = [];
  const files = await fs.readdir(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results.push(...(await crawlDir(fullPath, ext)));
    } else if (file.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

module.exports = { crawlDtsFiles };