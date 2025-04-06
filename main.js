const { extractSignaturesForLibraries } = require("./signature_extraction");
const fs = require("fs");

console.log("Step 1: Reading libraries...");
const libraries = JSON.parse(fs.readFileSync("./libraries.json", "utf8"));

console.log("Step 2: Starting extraction...");
extractSignaturesForLibraries(libraries);