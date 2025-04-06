Additional Things to Extract from .d.ts Files
Interface/Type Definitions  
Why: Many libraries (e.g., React, Lodash) define key interfaces or types (e.g., React.FC, Lodash.Chain). These shape how developers use the library and can enrich ParticleGraph’s understanding of props, data structures, and flows.

Fields:
name: Interface/type name (e.g., React.FC).

properties: Array of {name, type, optional} (e.g., {name: "children", type: "ReactNode", optional: true}).

extends: Parent interfaces (e.g., React.FC extends FunctionComponent).

isExported: Boolean.

ParticleGraph Benefit: Improves depends_on and props in Particles, and helps Graphs map how library types connect to repo code.

Class Definitions  
Why: Some libraries expose classes (e.g., Error in Node.js, custom utilities). Knowing their structure helps ParticleGraph infer object-oriented patterns.

Fields:
name: Class name.

methods: Array of function defs (like above: name, params, return type).

properties: Array of {name, type, optional}.

extends: Parent class.

implements: Interfaces implemented.

isExported: Boolean.

ParticleGraph Benefit: Enhances logic and flows in Particles, especially for repos using OOP.

Constants and Variables  
Why: Libraries often export constants or default values (e.g., React.version, PI in a math lib). These can clarify usage patterns.

Fields:
name: Constant/variable name.

type: Inferred type (e.g., string, number).

value: Literal value if present (e.g., "18.2.0" for React.version).

isExported: Boolean.

ParticleGraph Benefit: Adds detail to variables in Particles and helps xAI infer intent (e.g., version-specific behavior).

Namespaces/Modules  
Why: Libraries like @types/node use namespaces (e.g., fs, path). Capturing this structure helps ParticleGraph group related APIs.

Fields:
name: Namespace name (e.g., fs).

contents: Nested functions, interfaces, etc.

isExported: Boolean.

ParticleGraph Benefit: Improves tech_stack and depends_on in Graphs by showing modular dependencies.

JSDoc Comments  
Why: .d.ts files often include JSDoc with descriptions, examples, or deprecation notes. This is gold for xAI refinement and human-readable context.

Fields:
description: Main JSDoc text (e.g., “Creates a stateful value”).

params: Array of {name, description} from @param.

returns: Description from @returns.

deprecated: Boolean + message if @deprecated is present.

ParticleGraph Benefit: Feeds purpose and core_rules in Particles/SuperParticles, making xAI summaries smarter.

Enums  
Why: Enums (e.g., enum Direction { Up, Down }) define fixed options, which are common in libraries like @types/node or UI frameworks.

Fields:
name: Enum name.

members: Array of {name, value} (e.g., {name: "Up", value: 0}).

isExported: Boolean.

ParticleGraph Benefit: Enhances variables and business_rules in Particles, helping identify constrained inputs/outputs.

Type Aliases  
Why: Simple type aliases (e.g., type Callback = () => void) are common and clarify intent.

Fields:
name: Alias name.

type: Resolved type (e.g., () => void).

isExported: Boolean.

ParticleGraph Benefit: Improves props and flows by resolving shorthand types.

How This Helps ParticleGraph
Particles: Richer factual (hooks, calls, props) and inferred (purpose, flows, rules) fields. For example, knowing useState returns [T, (value: T) => void] helps map state flows.

Graphs: Better feature and files context by linking library APIs to repo usage (e.g., tech_stack gets precise hooks/components).

App Story: More accurate routes, data, and components by understanding library-driven patterns (e.g., React hooks or Node.js namespaces).

xAI Refinement: SuperParticles get smarter with JSDoc, enums, and interfaces feeding into natural language summaries.

