const fs = require("fs").promises;
const path = require("path");

async function crawlDtsFiles(packageName, version) {
  const pkgPath = path.resolve(`./node_modules/${packageName}`);
  const pkgJsonPath = `${pkgPath}/package.json`;
  const outputPath = `./libraryDefs/dts_store/${packageName}-${version}.json`;
  const logs = [];

  try {
    const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, "utf-8"));
    let dtsFiles = [];
    let mainDtsPath = pkgJson.types || pkgJson.typings || "index.d.ts";
    mainDtsPath = path.resolve(pkgPath, mainDtsPath);

    if (await fs.stat(mainDtsPath).catch(() => false)) {
      dtsFiles.push(mainDtsPath);
      logs.push(`Found main .d.ts: ${mainDtsPath}`);
    }

    const allDtsFiles = await crawlDir(pkgPath, ".d.ts");
    dtsFiles = [...new Set([mainDtsPath, ...allDtsFiles.filter(f => f !== mainDtsPath)])];
    logs.push(`Found ${dtsFiles.length} .d.ts files: ${dtsFiles.join(", ")}`);

    await fs.mkdir("./libraryDefs/dts_store", { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify({ files: dtsFiles }, null, 2));
    console.log(`Stored .d.ts files for ${packageName}-${version} to ${outputPath}`);
    return { dtsFiles, logs };
  } catch (e) {
    logs.push(`Error crawling ${packageName}: ${e.message}`);
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