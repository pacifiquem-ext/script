# Backups

- **Postgres (Neon):** use Neon’s point-in-time recovery / branch backups from the console. Keep `DIRECT_URL` for restore operations that need session features.
- **Object storage:** enable versioning/lifecycle on the UploadThing project or S3/Garage bucket holding `documents/*`. Retain failed ingestion objects until `Document.status` is reconciled.
