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

    if (await fs.stat(pkgJsonPath).catch(() => false)) {
      const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, "utf-8"));
      mainDtsPath = pkgJson.types || pkgJson.typings || "index.d.ts";
      mainDtsPath = path.resolve(pkgPath, mainDtsPath);
      if (await fs.stat(mainDtsPath).catch(() => false)) {
        dtsFiles.push(mainDtsPath);
        logs.push(`Found main .d.ts: ${mainDtsPath}`);
      }
    }

    if (dtsFiles.length === 0 && (await fs.stat(typesPkgPath).catch(() => false))) {
      mainDtsPath = path.resolve(typesPkgPath, "index.d.ts");
      if (await fs.stat(mainDtsPath).catch(() => false)) {
        dtsFiles.push(mainDtsPath);
        logs.push(`Found main .d.ts in @types: ${mainDtsPath}`);
      }
      const allDtsFiles = await crawlDir(typesPkgPath, ".d.ts");
      dtsFiles = [...new Set([mainDtsPath, ...allDtsFiles.filter(f => f !== mainDtsPath)])];
      logs.push(`Crawled ${allDtsFiles.length} additional .d.ts files in @types/${packageName}`);
    } else if (dtsFiles.length > 0) {
      const allDtsFiles = await crawlDir(pkgPath, ".d.ts");
      dtsFiles = [...new Set([mainDtsPath, ...allDtsFiles.filter(f => f !== mainDtsPath)])];
      logs.push(`Crawled ${allDtsFiles.length} additional .d.ts files in ${packageName}`);
    }

    if (dtsFiles.length === 0) {
      const jsFiles = await crawlDir(pkgPath, ".js");
      if (jsFiles.length > 0) {
        logs.push(`No .d.ts found, using ${jsFiles.length} .js files for ${packageName}`);
        dtsFiles = jsFiles;
      }
    }

    if (dtsFiles.length > 100) {
      logs.push(`Large library detected: ${packageName} with ${dtsFiles.length} files`);
      // Only keep high-level progress and warnings/errors
      // Remove or comment out verbose logs
      // console.log(`Processing large library: ${packageName} (${dtsFiles.length} files)`);
    }

    logs.push(`Total found ${dtsFiles.length} files: ${dtsFiles.join(", ")}`);
    await fs.mkdir("./libraryDefs/dts_store", { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify({ files: dtsFiles }, null, 2));
    // console.log(`Stored files for ${packageName}-${version} to ${outputPath}`);
    return { dtsFiles, logs };
  } catch (e) {
    logs.push(`Error crawling ${packageName}: ${e.message}`);
    console.error(`Failed to crawl ${packageName}:`, e);
    return { dtsFiles: [], logs };
  }
}

async function crawlDir(dir, ext) {
  const results = [];
  try {
    const files = await fs.readdir(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        results.push(...(await crawlDir(fullPath, ext)));
      } else if (file.name.endsWith(ext)) {
        results.push(fullPath);
      }
    }
  } catch (e) {
    console.error(`Error reading dir ${dir}: ${e.message}`);
  }
  return results;
}

module.exports = { crawlDtsFiles };