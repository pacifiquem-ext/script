export const EMBEDDING_PROVIDER = 'voyage' as const;
export const EMBEDDING_MODEL = 'voyage-3.5' as const;
export const EMBEDDING_DIMENSIONS = 1024 as const;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export const COOKIE_ACCESS_TOKEN = 'script_access';
export const COOKIE_REFRESH_TOKEN = 'script_refresh';
export const COOKIE_WORKSPACE_ID = 'script_workspace';

export const WORKSPACE_HEADER = 'x-workspace-id';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
