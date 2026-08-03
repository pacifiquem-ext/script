# ADR 0012 — Memory source abstraction (beyond DocumentVersion)

## Status

Accepted — 2026-08-03

## Context

ADR 0001 / 0008 assume RAG chunks belong to a `DocumentVersion`. Calls, channel history, and work
items need the same embed → retrieve → cite path without forking retrieval four times.

## Decision

1. **`MemorySource`** — workspace-scoped row with `type` (`document` | `meeting` | …), `title`,
   and exactly one of `documentId` / `meetingId` (extensible later).
2. **`MemoryChunk`** — unified embedded segment table (1024-d vector). Fields:
   - always: `memorySourceId`, `sourceType`, `workspaceId`, `position`, `content`, `embedding`
   - document: `documentId`, `documentVersionId`, offsets/page
   - meeting: `meetingId`, `speaker`, `startMs`, `endMs`
3. **Document path preserved** — ingestion continues to write document version artifacts; it also
   upserts `MemorySource` + `MemoryChunk` for the **current ready version only** (ADR 0008).
   Existing `DocumentChunk` rows remain for transitional queries; new retrieval prefers
   `MemoryChunk`. A dual-write keeps document citation tests green.
4. **Citations** — `MessageCitation` gains optional `sourceType` and resolvable targets
   (`documentId`+`documentVersionId` and/or `meetingId`+`startMs`). Document-only clients ignore
   new fields.
5. **Search tools** — `search_library` remains document-only; `search_meetings` is meeting-only;
   a shared `searchMemory` helper powers both without breaking document citation shapes.

## Consequences

- One SQL similarity path parameterized by `sourceType` (or unrestricted for future “all memory”).
- Meetings (ADR 0013) plug in without a second vector system.
- Dual-write adds a small ingest cost until `DocumentChunk` can be deprecated in a later ADR.
