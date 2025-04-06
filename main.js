const { manageLibraries } = require("./library_manager");
const { extractSignaturesForLibraries } = require("./signature_extraction");
const { crawlDescriptionsForLibraries } = require("./description_crawler");
const { mergeDataForLibraries } = require("./merge_function_data");

async function run() {
  try {
    console.log("Starting process...");
    console.log("Step 1: Managing libraries...");
    manageLibraries();
    console.log("Step 2: Extracting signatures...");
    extractSignaturesForLibraries();
    console.log("Step 3: Crawling descriptions...");
    await crawlDescriptionsForLibraries();
    console.log("Step 4: Merging data...");
    mergeDataForLibraries();
    console.log("Process complete!");
  } catch (err) {
    console.error("Process failed:", err.message);
    console.error(err.stack);
  }
}

run();