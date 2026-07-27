export const EMBEDDING_PROVIDER = 'voyage' as const;
export const EMBEDDING_MODEL = 'voyage-3.5' as const;
export const EMBEDDING_DIMENSIONS = 1024 as const;
export const VOYAGE_EMBED_BATCH_SIZE = 128 as const;

export const CHAT_MODEL = 'claude-sonnet-4-6' as const;
export const CHAT_MAX_TOKENS = 1200 as const;
export const CHAT_TEMPERATURE = 0 as const;
export const CHAT_HISTORY_MESSAGE_LIMIT = 20 as const;
export const RAG_TOP_K = 8 as const;
export const RAG_MIN_SIMILARITY = 0.2 as const;

/** Smaller windows keep RAG citations tight enough to read in the document canvas. */
export const CHUNK_SIZE_CHARS = 480 as const;
export const CHUNK_OVERLAP_CHARS = 80 as const;
/** Max characters to highlight for a single citation jump (paragraph-level focus). */
export const MAX_CITATION_HIGHLIGHT_CHARS = 320 as const;

export const CHAT_CREDIT_COST = 1 as const;
export const INGESTION_CREDIT_COST = 1 as const;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export const COOKIE_ACCESS_TOKEN = 'script_access';
export const COOKIE_REFRESH_TOKEN = 'script_refresh';
export const COOKIE_WORKSPACE_ID = 'script_workspace';

export const WORKSPACE_HEADER = 'x-workspace-id';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
