const fs = require("fs").promises;
const path = require("path");

async function findDtsFiles(packageJsonPath) {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const libraries = [];

  for (const [name, version] of Object.entries(dependencies)) {
    let pkgPath = path.resolve(`./node_modules/${name}`);
    let pkgJsonPath = `${pkgPath}/package.json`;
    let isTypesPackage = name.startsWith("@types/");
    let actualName = isTypesPackage ? name.replace("@types/", "") : name;

    try {
      let pkgJson = {};
      if (await fs.stat(pkgJsonPath).catch(() => false)) {
        pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, "utf8"));
      }

      let dtsPath = pkgJson.types || pkgJson.typings || "index.d.ts";
      dtsPath = path.resolve(pkgPath, dtsPath);

      if (isTypesPackage) {
        dtsPath = path.resolve(`./node_modules/${name}/index.d.ts`);
      }

      if (await fs.stat(dtsPath).catch(() => false)) {
        libraries.push({ name: actualName, dtsPath, version: pkgJson.version || version.replace("^", "") });
      } else {
        const files = await crawlDir(pkgPath, ".d.ts");
        if (files.length) {
          libraries.push({ name: actualName, dtsPath: files[0], version: pkgJson.version || version.replace("^", "") });
          console.log(`Fallback .d.ts for ${name}: ${files[0]}`);
        } else {
          console.error(`No .d.ts found for ${name}`);
        }
      }
    } catch (e) {
      console.error(`Error processing ${name}: ${e.message}`);
    }
  }
  
  return libraries;
}

async function crawlDir(dir, ext) {
  let results = [];
  const files = await fs.readdir(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(await crawlDir(fullPath, ext));
    } else if (file.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function main() {
  const libraries = await findDtsFiles("./package.json");
  await fs.writeFile("./libraries.json", JSON.stringify(libraries, null, 2));
  console.log("Libraries found:", libraries);
}

if (require.main === module) main().catch(console.error);

module.exports = { findDtsFiles };