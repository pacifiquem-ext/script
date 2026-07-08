import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: '  docx body  ' })),
  },
}));

vi.mock('xlsx', () => ({
  read: vi.fn(() => ({
    SheetNames: ['Sheet1'],
    Sheets: { Sheet1: { A1: { v: 1 } } },
  })),
  utils: {
    sheet_to_csv: vi.fn(() => 'a,b\n1,2'),
  },
}));

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async () => ({
    recognize: vi.fn(async () => ({ data: { text: ' OCR text ' } })),
    terminate: vi.fn(async () => undefined),
  })),
}));

import { extractText } from '../src/modules/jobs/extract';

describe('extractText formats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts docx by extension', async () => {
    const result = await extractText(Buffer.from('x'), 'application/octet-stream', 'a.docx');
    expect(result.text).toContain('docx body');
  });

  it('extracts xlsx spreadsheets', async () => {
    const result = await extractText(
      Buffer.from('x'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'a.xlsx',
    );
    expect(result.text).toContain('Sheet1');
    expect(result.pageCount).toBe(1);
  });

  it('extracts images via tesseract', async () => {
    const result = await extractText(Buffer.from('img'), 'image/png', 'scan.png');
    expect(result.text).toContain('OCR text');
    expect(result.pageCount).toBe(1);
  });
});
