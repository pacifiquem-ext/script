import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadFiles = vi.fn();
const deleteFiles = vi.fn();
const getSignedURL = vi.fn();

vi.mock('uploadthing/server', () => ({
  UTApi: class {
    uploadFiles = uploadFiles;
    deleteFiles = deleteFiles;
    getSignedURL = getSignedURL;
  },
}));

const send = vi.fn();
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = send;
  },
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  GetObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  DeleteObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async () => 'https://s3.example/signed'),
}));

describe('storage drivers', () => {
  beforeEach(() => {
    vi.resetModules();
    uploadFiles.mockReset();
    deleteFiles.mockReset();
    getSignedURL.mockReset();
    send.mockReset();
  });

  it('uploads via UploadThing driver', async () => {
    process.env.STORAGE_DRIVER = 'uploadthing';
    process.env.UPLOADTHING_TOKEN = 'test-token';
    uploadFiles.mockResolvedValue({
      data: {
        key: 'abc',
        url: 'https://ut.example/abc',
        ufsUrl: 'https://ut.example/abc',
        size: 4,
      },
    });
    getSignedURL.mockResolvedValue({ data: { url: 'https://ut.example/signed' } });

    const { createUploadThingDriver } = await import('../src/storage/uploadthing');
    const driver = createUploadThingDriver();
    const uploaded = await driver.upload({
      buffer: Buffer.from('test'),
      filename: 'doc.txt',
      contentType: 'text/plain',
    });
    expect(uploaded.key).toBe('abc');
    await expect(driver.getSignedDownloadUrl('abc')).resolves.toBe('https://ut.example/signed');
    await driver.delete('abc');
    expect(deleteFiles).toHaveBeenCalledWith('abc');
  });

  it('uploads via S3-compatible driver', async () => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_ENDPOINT = 'http://localhost:3900';
    process.env.S3_REGION = 'garage';
    process.env.S3_BUCKET = 'script';
    process.env.S3_ACCESS_KEY_ID = 'key';
    process.env.S3_SECRET_ACCESS_KEY = 'secret';
    process.env.S3_FORCE_PATH_STYLE = 'true';
    send.mockResolvedValue({});

    const { createS3Driver } = await import('../src/storage/s3');
    const driver = createS3Driver();
    const uploaded = await driver.upload({
      buffer: Buffer.from('test'),
      filename: 'doc.txt',
      contentType: 'text/plain',
    });
    expect(uploaded.key).toContain('documents/');
    expect(uploaded.url).toContain('http://localhost:3900/script/');
    await expect(driver.getSignedDownloadUrl(uploaded.key)).resolves.toBe(
      'https://s3.example/signed',
    );
    await driver.delete(uploaded.key);
    expect(send).toHaveBeenCalled();
  });
});
