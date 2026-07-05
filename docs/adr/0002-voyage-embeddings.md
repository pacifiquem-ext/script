---
status: accepted
---

# Use Voyage AI voyage-3.5 at 1024 dimensions for chunk and query embeddings

Claude has no first-party embeddings API, so RAG requires a second vendor. We chose **Voyage AI**
(Anthropic's recommended embeddings partner) with model **`voyage-3.5`** and
**`output_dimension: 1024`** (the model default; Matryoshka also allows 256/512/2048).

This fixes `DocumentChunk.embedding` as `vector(1024)` in Postgres/pgvector and is recorded on each
`Document` via `embeddingModel` / `embeddingDimensions` so a later model change can target a
backfill job (ADR 0001) instead of guessing.

Rejected for v1: OpenAI `text-embedding-3-large` (extra major vendor, larger default vectors).
Env: `VOYAGE_API_KEY`.
