export interface UploadedFile {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface StorageDriver {
  upload(input: { buffer: Buffer; filename: string; contentType: string }): Promise<UploadedFile>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
