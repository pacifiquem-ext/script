export type PreviewKind =
  'markdown' | 'pdf' | 'image' | 'docx' | 'text' | 'spreadsheet' | 'unknown';

const IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
]);

const TEXT_MIME = new Set([
  'text/plain',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
  'application/xml',
  'text/xml',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
]);

export function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function detectPreviewKind(input: { name: string; mimeType?: string | null }): PreviewKind {
  const mime = (input.mimeType ?? '').toLowerCase();
  const ext = extensionOf(input.name);

  if (
    mime === 'text/markdown' ||
    mime === 'text/x-markdown' ||
    ext === 'md' ||
    ext === 'markdown' ||
    ext === 'mdx'
  ) {
    return 'markdown';
  }

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';

  if (
    IMAGE_MIME.has(mime) ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext)
  ) {
    return 'image';
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    return 'docx';
  }

  // Legacy .doc has no reliable browser converter — treat as text from extraction.
  if (mime === 'application/msword' || ext === 'doc') return 'text';

  if (
    mime.includes('spreadsheet') ||
    mime === 'application/vnd.ms-excel' ||
    ['xls', 'xlsx', 'csv', 'tsv'].includes(ext)
  ) {
    return ext === 'csv' || ext === 'tsv' || mime === 'text/csv' ? 'text' : 'spreadsheet';
  }

  if (
    TEXT_MIME.has(mime) ||
    ['txt', 'log', 'json', 'xml', 'yml', 'yaml', 'html', 'htm'].includes(ext)
  ) {
    return 'text';
  }

  return 'unknown';
}

export function typeBadgeLabel(name: string, mimeType?: string | null): string {
  const ext = extensionOf(name);
  if (ext) return ext;
  const kind = detectPreviewKind({ name, mimeType });
  if (kind === 'unknown') return 'file';
  return kind;
}
