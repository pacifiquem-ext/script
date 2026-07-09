import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadFiles = vi.fn();
const deleteFiles = vi.fn();
const getSignedURL = vi.fn();
const generateSignedURL = vi.fn();

vi.mock('uploadthing/server', () => ({
  UTApi: class {
    uploadFiles = uploadFiles;
    deleteFiles = deleteFiles;
    getSignedURL = getSignedURL;
    generateSignedURL = generateSignedURL;
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
    generateSignedURL.mockReset();
    send.mockReset();
  });

  it('uploads via UploadThing driver and signs with generateSignedURL (v7 shape)', async () => {
    process.env.STORAGE_DRIVER = 'uploadthing';
    process.env.UPLOADTHING_TOKEN = 'test-token';
    uploadFiles.mockResolvedValue({
      data: {
        key: 'abc',
        url: 'https://ut.example/abc',
        ufsUrl: 'https://app.ufs.sh/f/abc',
        size: 4,
      },
    });
    generateSignedURL.mockResolvedValue({
      ufsUrl: 'https://app.ufs.sh/f/abc?expires=1&signature=hmac-sha256%3Ddeadbeef',
    });

    const { createUploadThingDriver } = await import('../src/storage/uploadthing');
    const driver = createUploadThingDriver();
    const uploaded = await driver.upload({
      buffer: Buffer.from('test'),
      filename: 'doc.txt',
      contentType: 'text/plain',
    });
    expect(uploaded.key).toBe('abc');
    expect(uploaded.url).toBe('https://app.ufs.sh/f/abc');
    await expect(driver.getSignedDownloadUrl('abc')).resolves.toContain('signature=');
    expect(generateSignedURL).toHaveBeenCalledWith('abc', { expiresIn: 3600 });
    expect(getSignedURL).not.toHaveBeenCalled();
    await driver.delete('abc');
    expect(deleteFiles).toHaveBeenCalledWith('abc');
  });

  it('falls back to getSignedURL v7 direct { url, ufsUrl } when generateSignedURL fails', async () => {
    process.env.STORAGE_DRIVER = 'uploadthing';
    process.env.UPLOADTHING_TOKEN = 'test-token';
    generateSignedURL.mockRejectedValue(new Error('local sign failed'));
    getSignedURL.mockResolvedValue({
      url: 'https://utfs.io/f/abc',
      ufsUrl: 'https://app.ufs.sh/f/abc',
    });

    const { createUploadThingDriver } = await import('../src/storage/uploadthing');
    const driver = createUploadThingDriver();
    await expect(driver.getSignedDownloadUrl('abc', 600)).resolves.toBe('https://app.ufs.sh/f/abc');
    expect(getSignedURL).toHaveBeenCalledWith('abc', { expiresIn: 600 });
  });

  it('parses legacy getSignedURL { data: { url } } shape', async () => {
    process.env.STORAGE_DRIVER = 'uploadthing';
    process.env.UPLOADTHING_TOKEN = 'test-token';
    generateSignedURL.mockRejectedValue(new Error('unavailable'));
    getSignedURL.mockResolvedValue({ data: { url: 'https://ut.example/signed' } });

    const { createUploadThingDriver, extractUploadThingUrl } =
      await import('../src/storage/uploadthing');
    expect(extractUploadThingUrl({ data: { url: 'https://ut.example/signed' } })).toBe(
      'https://ut.example/signed',
    );
    const driver = createUploadThingDriver();
    await expect(driver.getSignedDownloadUrl('abc')).resolves.toBe('https://ut.example/signed');
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
