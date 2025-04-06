const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function getInstalledVersion(packageName) {
  const pkgPath = path.resolve(`./node_modules/${packageName}/package.json`);
  return fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version : null;
}

function needsUpdate(packageName, latestOutput) {
  const installedVersion = getInstalledVersion(packageName);
  if (!installedVersion) return true;
  if (!fs.existsSync(latestOutput)) return true;
  const outputVersion = JSON.parse(fs.readFileSync(latestOutput, "utf-8")).version;
  return installedVersion !== outputVersion;
}

function updateLibrary(packageName) {
  console.log(`Updating ${packageName}...`);
  execSync(`npm install ${packageName} --no-save`, { stdio: "inherit" });
}

function manageLibraries() {
  const libraries = JSON.parse(fs.readFileSync("./libraries.json", "utf-8"));
  libraries.forEach(lib => {
    const outputFile = `./libraryDefs/${lib.name.split("/")[1]}-${getInstalledVersion(lib.name) || "latest"}.signatures.json`;
    if (needsUpdate(lib.name, outputFile)) {
      updateLibrary(lib.name);
    } else {
      console.log(`${lib.name} is up-to-date`);
    }
  });
}

if (!fs.existsSync("libraryDefs")) fs.mkdirSync("libraryDefs");

module.exports = { manageLibraries, getInstalledVersion };