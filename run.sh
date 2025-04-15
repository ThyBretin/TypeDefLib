#!/bin/bash
echo "Starting TypeDefLib pipeline..."
node dts_finder.js && node main.js && node signature_chunk.js && node signature_sanitization.js && node signature_refinement.js
echo "Pipeline completed. Check libraryDefs/errors.json and libraryDefs/forced_splits.json for issues."