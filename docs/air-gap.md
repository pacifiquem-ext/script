# Air-gap / data-sovereign profile (Org-P9b)

Run script without cloud AI or cloud OAuth. Infrastructure already self-hosts (Postgres, Redis,
Garage); AI and auth need the provider seams from Org-P8 / Org-P9b.

## Required env shape

```bash
STORAGE_DRIVER=s3
# Garage / MinIO / internal S3…
S3_ENDPOINT=…
S3_REGION=garage
S3_BUCKET=script
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_FORCE_PATH_STYLE=true

COMPLETION_PROVIDER=openai_compatible
COMPLETION_BASE_URL=http://llm-host:11434/v1   # Ollama OpenAI-compatible API
COMPLETION_MODEL=llama3.1
# COMPLETION_API_KEY= optional

EMBEDDING_PROVIDER=openai_compatible
EMBEDDING_BASE_URL=http://embed-host:8080/v1
EMBEDDING_MODEL=nomic-embed-text
# Must produce or pad to 1024 dims (EMBEDDING_DIMENSIONS)

LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----…"
LICENSE_ENFORCEMENT=true
# LICENSE_KEY= optional bootstrap

# Do not set cloud OAuth client IDs if fully air-gapped
# Optional OIDC to internal IdP:
# OIDC_ISSUER=https://idp.internal/...
# OIDC_CLIENT_ID=…
# OIDC_CLIENT_SECRET=…
# OIDC_REDIRECT_URL=https://script.internal/api/auth/sso/callback
```

## Honest limitations

- **Tool-calling**: openai_compatible completion degrades tools (no Anthropic tool loop). Chat still
  works with RAG context injection path; agent tools may be limited.
- **Embeddings dimensions**: column is 1024-d (Voyage). Self-hosted models should match or we
  pad/truncate (quality impact if truncated).
- **No cloud file import** without outbound OAuth.
- **Anthropic + Voyage** remain the quality default when network is allowed.

## GPU notes

| Tier       | Serving       | Notes                              |
| ---------- | ------------- | ---------------------------------- |
| Pilot      | Ollama        | Single-node, low concurrency       |
| Production | vLLM / SGLang | Size model to concurrent chat load |

Document your org’s model choice in the deploy runbook; do not hardcode new paid vendors into the
repo without a stop-and-ask decision.
