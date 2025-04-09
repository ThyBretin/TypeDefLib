const fs = require("fs").promises;
const path = require("path");

async function findDtsFiles(packageJsonPath) {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const libraries = [];
  const coreModules = new Set(["fs", "path", "os"]);
  const logs = [];

  for (const [name, version] of Object.entries(dependencies)) {
    if (coreModules.has(name)) {
      logs.push(`Skipping core module: ${name}`);
      continue;
    }

    const pkgPath = path.resolve(`./node_modules/${name}`);
    const pkgJsonPath = `${pkgPath}/package.json`;
    const isTypesPackage = name.startsWith("@types/");
    const actualName = isTypesPackage ? name.replace("@types/", "") : name;

    try {
      let pkgJson = {};
      if (await fs.stat(pkgJsonPath).catch(() => false)) {
        pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, "utf-8"));
      } else {
        logs.push(`No package.json found for ${name}, skipping`);
        continue;
      }

      let dtsPath = pkgJson.types || pkgJson.typings || "index.d.ts";
      dtsPath = path.resolve(pkgPath, dtsPath);

      if (isTypesPackage) {
        dtsPath = path.resolve(`./node_modules/${name}/index.d.ts`);
      }

      const installedVersion = pkgJson.version || version.replace(/^[\^~]/, "");
      if (await fs.stat(dtsPath).catch(() => false)) {
        libraries.push({ name: actualName, dtsPath, version: installedVersion });
        logs.push(`Found .d.ts for ${name}@${installedVersion}: ${dtsPath}`);
      } else {
        logs.push(`No direct .d.ts for ${name}@${installedVersion}, crawling...`);
        const files = await crawlDir(pkgPath, ".d.ts");
        if (files.length > 0) {
          libraries.push({ name: actualName, dtsPath: files[0], version: installedVersion });
          logs.push(`Fallback .d.ts for ${name}: ${files[0]}`);
        } else {
          logs.push(`No .d.ts found for ${name}@${installedVersion}`);
        }
      }
    } catch (e) {
      logs.push(`Error processing ${name}: ${e.message}`);
    }
  }

  return { libraries, logs };
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

async function main() {
  console.log("Step 1: Finding .d.ts files...");
  const { libraries, logs } = await findDtsFiles("./package.json");
  await fs.writeFile("./libraries.json", JSON.stringify(libraries, null, 2));
  console.log("Libraries found:", libraries);

  if (logs.length > 0) {
    console.log("\nSummary of Issues:");
    logs.forEach(log => console.log(`- ${log}`));
  } else {
    console.log("\nNo issues detected.");
  }
}

if (require.main === module) main().catch(console.error);

module.exports = { findDtsFiles };