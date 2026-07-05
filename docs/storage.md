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

## `s3` (self-hosted — any S3-compatible store, including Garage)

Set `STORAGE_DRIVER=s3` plus `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE`. Because it targets the S3 API rather than one
vendor, this driver works unmodified against:

- **[Garage](https://garagehq.deuxfleurs.fr)** — a lightweight, self-hosted, S3-compatible object
  store designed to run on modest hardware. This is the recommended option for anyone
  self-hosting this app who wants storage they fully own, with no external account required.
- MinIO, AWS S3, Cloudflare R2, or any other S3-compatible provider.

### Running Garage for self-hosting

1. Deploy Garage (single binary or Docker — see the [Garage quickstart](https://garagehq.deuxfleurs.fr/documentation/quick-start/)).
2. Create a bucket and an access key through `garage` CLI.
3. Set in `server/.env`:
   ```
   STORAGE_DRIVER=s3
   S3_ENDPOINT=http://<your-garage-host>:3900
   S3_REGION=garage
   S3_BUCKET=script-documents
   S3_ACCESS_KEY_ID=<garage access key>
   S3_SECRET_ACCESS_KEY=<garage secret key>
   S3_FORCE_PATH_STYLE=true
   ```
4. Restart the server. No application code changes are required to move between the managed and
   self-hosted paths — only these env vars.

## Status

Both drivers are implemented:

- `server/src/storage/uploadthing.ts` uses the UploadThing `UTApi` with `UPLOADTHING_TOKEN`.
- `server/src/storage/s3.ts` targets any S3-compatible endpoint (Garage recommended) via the AWS SDK.

Unit tests mock the SDKs. Verify UploadThing with a real token via a manual upload once Library
upload routes land; verify S3/Garage with the env block above before enabling `STORAGE_DRIVER=s3`
in production.
