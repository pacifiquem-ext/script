import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import type { StorageDriver, UploadedFile } from './types';

function requireS3Config() {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_ENDPOINT || !S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error('S3_* environment variables are required when STORAGE_DRIVER=s3');
  }
  return {
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
}

function createClient() {
  const config = requireS3Config();
  return {
    config,
    client: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
}

function buildObjectUrl(endpoint: string, bucket: string, key: string, forcePathStyle: boolean) {
  const base = endpoint.replace(/\/$/, '');
  if (forcePathStyle) return `${base}/${bucket}/${key}`;
  const url = new URL(base);
  return `${url.protocol}//${bucket}.${url.host}/${key}`;
}

export function createS3Driver(): StorageDriver {
  return {
    async upload(input): Promise<UploadedFile> {
      const { client, config } = createClient();
      const key = `documents/${randomUUID()}-${input.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: input.contentType,
          ContentLength: input.buffer.byteLength,
        }),
      );
      return {
        key,
        url: buildObjectUrl(config.endpoint, config.bucket, key, config.forcePathStyle),
        size: input.buffer.byteLength,
        contentType: input.contentType,
      };
    },

    async getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
      const { client, config } = createClient();
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      });
    },

    async delete(key: string): Promise<void> {
      const { client, config } = createClient();
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
