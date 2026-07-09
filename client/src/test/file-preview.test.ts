import { describe, expect, it } from 'vitest';
import { detectPreviewKind, extensionOf, typeBadgeLabel } from '../lib/file-preview';

describe('file-preview', () => {
  it('detects markdown by extension and mime', () => {
    expect(detectPreviewKind({ name: 'notes.md' })).toBe('markdown');
    expect(detectPreviewKind({ name: 'x', mimeType: 'text/markdown' })).toBe('markdown');
    expect(extensionOf('folder/Readme.MD')).toBe('md');
    expect(typeBadgeLabel('Readme.md')).toBe('md');
  });

  it('detects pdf image docx and text', () => {
    expect(detectPreviewKind({ name: 'a.pdf' })).toBe('pdf');
    expect(detectPreviewKind({ name: 'a.png', mimeType: 'image/png' })).toBe('image');
    expect(
      detectPreviewKind({
        name: 'contract.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toBe('docx');
    expect(detectPreviewKind({ name: 'notes.txt' })).toBe('text');
    expect(detectPreviewKind({ name: 'legacy.doc' })).toBe('text');
  });
});
