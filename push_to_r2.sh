#!/bin/bash
for file in libraryDefs/refined/*.graph.json; do
  wrangler r2 object put "graphs/$(basename "$file")" --file "$file"
  echo "Pushed $file to R2"
done