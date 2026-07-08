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

### Local / self-hosted Garage via Docker Compose

This project’s recommended self-hosted store is **[Garage](https://garagehq.deuxfleurs.fr)**.
`pnpm deps:up` starts `dxflrs/garage:v2.3.0` in single-node mode with
`--single-node --default-bucket`, using `docker/garage/garage.toml` and `GARAGE_DEFAULT_*`
credentials (see [`docs/local-infra.md`](./local-infra.md) and `.env.docker.example`).

```
STORAGE_DRIVER=s3
S3_ENDPOINT=http://127.0.0.1:3900
S3_REGION=garage
S3_BUCKET=script-documents
S3_ACCESS_KEY_ID=GK7f3a9c2e1b8d4f0a6c5e9b2d8f1a3c7e
S3_SECRET_ACCESS_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
S3_FORCE_PATH_STYLE=true
```

Inside the Compose network use `http://garage:3900`. Verify with
`docker compose exec garage /garage status` and `/garage bucket list`.

For a multi-node production cluster, follow the
[Garage real-world cookbook](https://garagehq.deuxfleurs.fr/documentation/cookbook/real-world/) and
point the same `S3_*` variables at that endpoint (rotate dev secrets first). No application code
changes are required to move between managed UploadThing and Garage — only these env vars.

## Status

Both drivers are implemented:

- `server/src/storage/uploadthing.ts` uses the UploadThing `UTApi` with `UPLOADTHING_TOKEN`.
- `server/src/storage/s3.ts` targets any S3-compatible endpoint (**Garage** is the project default
  self-host option, wired in `docker-compose.yml`) via the AWS SDK.

Unit tests mock the SDKs. Verify UploadThing with a real token for the managed path; verify Garage
with `pnpm deps:garage` and the env block above before enabling `STORAGE_DRIVER=s3` in production.
