# File storage

Documents uploaded into the Library are stored through a small `StorageDriver` interface
(`server/src/storage/types.ts`), so the app can run against a managed service by default and
switch to fully self-hosted storage with one env var — no code changes.

```ts
interface StorageDriver {
  upload(input: { buffer: Buffer; filename: string; contentType: string }): Promise<UploadedFile>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
```

Select the driver with `STORAGE_DRIVER` in `server/.env`:

## `uploadthing` (default — managed, fastest to run hosted)

[UploadThing](https://uploadthing.com) handles storage, CDN delivery, and signed URLs without
running any infrastructure yourself. Set `UPLOADTHING_TOKEN` (from the UploadThing dashboard) and
you're done. This is the right choice if you're running the hosted version of this app and don't
want to operate storage infrastructure.

## `s3` (self-hosted — any S3-compatible store)

Set `STORAGE_DRIVER=s3` plus `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE`. Because it targets the S3 API rather than one
vendor, this driver works unmodified against AWS S3, Cloudflare R2, MinIO, Garage, or any other
S3-compatible provider.

```
STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.example.com
S3_REGION=us-east-1
S3_BUCKET=script-documents
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=true
```

No application code changes are required to move between UploadThing and an S3-compatible store —
only these env vars.

## Status

Both drivers are implemented:

- `server/src/storage/uploadthing.ts` uses the UploadThing `UTApi` with `UPLOADTHING_TOKEN`.
- `server/src/storage/s3.ts` targets any S3-compatible endpoint via the AWS SDK.

Unit tests mock the SDKs. Verify UploadThing with a real token; verify S3 against your bucket
before enabling `STORAGE_DRIVER=s3` in production.
