---
status: accepted
---

# Share Zod schemas and DTO types via packages/shared (@script/shared)

Client and server must not hand-duplicate request/response shapes. We added a pnpm workspace
package **`@script/shared`** that owns Zod schemas, inferred types, pagination helpers, embedding
constants, and the API error envelope. The server validates with these schemas; the client
imports types and parses error bodies. The package compiles to CommonJS `dist/` so the CJS server
and Vite client both consume one build artifact.

Rejected: exporting types from `@script/server` into the browser (risk of pulling Node-only code);
duplicating thin interfaces on the client (rots immediately).
