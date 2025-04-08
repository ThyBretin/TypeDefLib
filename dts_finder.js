const fs = require("fs").promises;
const path = require("path");
const { execSync } = require("child_process");

async function findDtsFiles(packageJsonPath) {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const libraries = [];
  const coreModules = new Set(["fs", "path", "os"]);
  const logs = []; // Collect logs here

  for (const [name, version] of Object.entries(dependencies)) {
    if (coreModules.has(name)) {
      logs.push(`Skipping core module: ${name}`);
      continue;
    }

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

      if (!(await fs.stat(dtsPath).catch(() => false))) {
        const typesPkg = `@types/${actualName}`;
        logs.push(`No .d.ts found for ${name}, trying ${typesPkg}...`);
        try {
          execSync(`npm install ${typesPkg} --save-dev --no-audit`, { stdio: "inherit" });
          dtsPath = path.resolve(`./node_modules/${typesPkg}/index.d.ts`);
          logs.push(`Installed ${typesPkg}`);
        } catch (e) {
          logs.push(`Failed to auto-install ${typesPkg}: ${e.message}`);
        }
      }

      if (await fs.stat(dtsPath).catch(() => false)) {
        libraries.push({ name: actualName, dtsPath, version: pkgJson.version || version.replace("^", "") });
      } else {
        const files = await crawlDir(pkgPath, ".d.ts");
        if (files.length) {
          libraries.push({ name: actualName, dtsPath: files[0], version: pkgJson.version || version.replace("^", "") });
          logs.push(`Fallback .d.ts for ${name}: ${files[0]}`);
        } else {
          logs.push(`No .d.ts found for ${name} after crawl. Install ${typesPkg} manually if needed.`);
        }
      }
    } catch (e) {
      logs.push(`Error processing ${name}: ${e.message}`);
    }
  }

  return { libraries, logs };
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
  console.log("Step 1: Crawling libraries...");
  const { libraries, logs } = await findDtsFiles("./package.json");
  await fs.writeFile("./libraries.json", JSON.stringify(libraries, null, 2));
  console.log("Libraries found:", libraries);

  // Print log summary
  if (logs.length > 0) {
    console.log("\nSummary of Issues:");
    logs.forEach(log => console.log(`- ${log}`));
  } else {
    console.log("\nNo issues detected.");
  }
}

if (require.main === module) main().catch(console.error);

module.exports = { findDtsFiles };