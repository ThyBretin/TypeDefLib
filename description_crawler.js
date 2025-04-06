const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function crawlWithPlaywright(url, functionNames) {
  console.log(`Crawling URL: ${url}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });

  const html = await page.content();
  console.log(`Page content length: ${html.length} characters`);

  const descriptions = {};
  for (const name of functionNames) {
    // Normalize: try raw name and underscore prefix
    const variants = [name.toLowerCase(), `_.${name.toLowerCase()}`];
    let desc = "No description found";
    for (const variant of variants) {
      try {
        desc = await page.evaluate(funcName => {
          // Lodash uses <h3 id="functionName"> followed by <p>
          const heading = document.querySelector(`h3[id="${funcName}"]`);
          if (!heading) return null;
          const p = heading.nextElementSibling?.tagName === "P" ? heading.nextElementSibling : null;
          return p ? p.textContent.trim() : null;
        }, variant);
        if (desc) break;
      } catch (e) {
        console.error(`Error fetching ${variant}:`, e.message);
      }
    }
    descriptions[name] = desc || "No description found";
    console.log(`Fetched description for ${name}: ${desc ? desc.substring(0, 50) + "..." : "Not found"}`);
  }

  await browser.close();
  return descriptions;
}

async function crawlDescriptionsForLibraries() {
  const libraries = JSON.parse(fs.readFileSync("./libraries.json", "utf-8"));
  for (const lib of libraries) {
    const baseName = lib.name.split("/")[1];
    const sigFile = fs.readdirSync("./libraryDefs")
      .filter(f => f.startsWith(`${baseName}-`) && f.endsWith(".signatures.json"))
      .sort()
      .pop();
    if (!sigFile) {
      console.error(`No signatures file for ${lib.name}`);
      continue;
    }
    const version = sigFile.match(/-(.+)\.signatures\.json$/)[1];
    const signatures = JSON.parse(fs.readFileSync(`./libraryDefs/${sigFile}`, "utf-8"));
    const functionNames = signatures.functions.map(f => f.name);
    const descFile = `./libraryDefs/${baseName}-${version}.descriptions.json`;

    const descriptions = await crawlWithPlaywright(lib.docSource, functionNames);
    fs.writeFileSync(descFile, JSON.stringify({ version, descriptions }, null, 2));
    console.log(`Descriptions crawled for ${lib.name}`);
  }
}

module.exports = { crawlDescriptionsForLibraries };