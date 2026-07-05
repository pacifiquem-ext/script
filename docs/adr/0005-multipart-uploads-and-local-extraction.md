---
status: accepted
---

# Multipart uploads through the API; local-first extraction with optional Unstructured

Document bytes enter via **`@fastify/multipart`** on the server (25MB default cap), then the
server writes through the `StorageDriver`. Presigned direct-to-storage uploads were deferred to
keep auth and workspace checks in one place for v1 doc sizes.

Text extraction is **local-first** (`pdf-parse`, `mammoth`, spreadsheet parsers, `tesseract.js`
where needed) with an **optional Unstructured API** escape hatch for difficult scans. Failure
sets `Document.status = failed` with a reason; success stores full text and proceeds to chunk +
embed (ADR 0001).
