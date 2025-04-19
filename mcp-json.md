# MCP JSON Implementation Guide for TypeScript Definitions

## Overview
This document outlines how to implement the Metadata Control Protocol (MCP) JSON format for TypeScript type definitions. This implementation creates a queryable type information system from parsed TypeScript declarations.

## Schema Design

### Root Structure
```
{
  "mcpVersion": string,
  "assetType": "typescript-definitions",
  "metadata": object,
  "definitions": object,
  "queryInterface": object
}
```

### Metadata Section
```
"metadata": {
  "libraryName": string,
  "version": string,
  "generatedAt": ISO8601 timestamp,
  "sourceFiles": string[]
}
```

### Definitions Section
```
"definitions": {
  "functions": Function[],
  "types": Type[],
  "interfaces": Interface[],
  "classes": Class[],
  "imports": Record<string, string>,
  "typeIndex": {
    [identifierName: string]: number | number[]
  }
}
```

### Query Interface
```
"queryInterface": {
  "byName": string,
  "byReturnType": string,
  "byParameter": string,
  [customQuery: string]: string
}
```

## Implementation Steps

1. **Parser Integration**
   - Process TypeScript AST output
   - Collect all type definitions and references
   - Normalize import paths

2. **Reference Normalization**
   - Extract common import paths to the imports section
   - Replace full paths with references to the imports

3. **Index Generation**
   - Build lookup indices for all type definitions
   - Group overloaded functions by name reference

4. **Query Path Definition**
   - Define standard query paths for common lookups
   - Document path parameters for filtering and navigation

5. **Serialization**
   - Format the collected data into the MCP JSON structure
   - Apply consistent serialization rules for special types

## Data Models

### Function Definition
```
{
  "name": string,
  "parameters": Parameter[],
  "returnType": string,
  "resolvedReturnType": string,
  "jsdoc": JsDocInfo | null,
  "isExported": boolean,
  "location": SourceLocation
}
```

### Parameter Definition
```
{
  "name": string,
  "type": string,
  "optional": boolean,
  "defaultValue": string | null
}
```

### JsDoc Information
```
{
  "description": string | null,
  "tags": JsDocTag[]
}
```

### Source Location
```
{
  "file": string,
  "line": number,
  "column": number | null
}
```

## Query Implementation

Implement a path-based query resolver that:
1. Parses query paths like `/function/{name}`
2. Returns the corresponding definition or filtered list
3. Supports parameter-based filtering
4. Handles reference resolution

## Best Practices

- Normalize types to avoid duplicating complex references
- Store full path information for accurate source mapping
- Generate indices for performance-critical lookups
- Maintain consistent versioning of your MCP schema