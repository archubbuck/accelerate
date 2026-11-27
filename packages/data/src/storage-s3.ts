import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import {
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand,
  type HeadObjectCommandOutput, type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  assertObjectChecksum, assertObjectKey, assertObjectSize, boundedObjectStream, objectListLimit, objectMetadata, ObjectIntegrityError,
  type ObjectStore, type StoredObject,
} from "@accelerate/data/storage";

function missing(error: unknown) {
  return typeof error === "object" && error !== null && "$metadata" in error
    && (error.$metadata as { httpStatusCode?: number })?.httpStatusCode === 404;
}

function details(key: string, response: HeadObjectCommandOutput, maxBytes: number): StoredObject {
  const size = response.ContentLength ?? NaN;
  assertObjectSize(size, maxBytes);
  const { sha256, ...metadata } = response.Metadata ?? {};
  return { key, size, contentType: response.ContentType, etag: response.ETag, lastModified: response.LastModified, metadata, sha256 };
}

export function createS3ObjectStore(options: {
  client: S3Client; bucket: string; namespace: string; maxObjectBytes: number;
}): ObjectStore {
  assertObjectKey(options.namespace);
  if (!options.bucket.trim()) throw new TypeError("Missing object bucket");
  assertObjectSize(options.maxObjectBytes, Number.MAX_SAFE_INTEGER);
  const { client, maxObjectBytes, bucket: Bucket } = options;
  const prefix = options.namespace + "/";
  const keyFor = (key: string) => {
    assertObjectKey(key);
    if (prefix.length + key.length > 1024) throw new RangeError("Object key exceeds the storage limit");
    return prefix + key;
  };
  return {
    async put(upload) {
      const Key = keyFor(upload.key);
      assertObjectSize(upload.size, maxObjectBytes);
      const metadata = objectMetadata(upload);
      if (upload.sha256 !== undefined) assertObjectChecksum(upload.sha256);
      const body = boundedObjectStream(upload.body, upload.size, upload.signal);
      const readable = Readable.fromWeb(body as NodeReadableStream<Uint8Array>);
      try {
        const output = await client.send(new PutObjectCommand({
          Bucket, Key, Body: readable, ContentType: upload.contentType, ContentLength: upload.size,
          Metadata: { ...metadata, ...(upload.sha256 ? { sha256: upload.sha256 } : {}) },
          ...(upload.sha256 ? { ChecksumSHA256: Buffer.from(upload.sha256, "hex").toString("base64") } : {}),
        }), { abortSignal: upload.signal });
        return { key: upload.key, size: upload.size, contentType: upload.contentType, metadata, sha256: upload.sha256, etag: output.ETag };
      } finally { readable.destroy(); }
    },
    async get(key, readOptions = {}) {
      const Key = keyFor(key);
      if (readOptions.verifySha256 !== undefined) assertObjectChecksum(readOptions.verifySha256);
      let response;
      try { response = await client.send(new GetObjectCommand({ Bucket, Key }), { abortSignal: readOptions.signal }); }
      catch (error) { if (missing(error)) return undefined; throw error; }
      if (!response.Body) throw new Error("Object response has no stream");
      const stream = response.Body.transformToWebStream();
      let object;
      try { object = details(key, response, maxObjectBytes); }
      catch (error) { await stream.cancel().catch(() => undefined); throw error; }
      const bounded = boundedObjectStream(stream, object.size, readOptions.signal);
      const checksum = readOptions.verifySha256;
      if (!checksum) return { object, body: bounded };
      const digest = createHash("sha256");
      const body = bounded.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) { digest.update(chunk); controller.enqueue(chunk); },
        flush() { if (digest.digest("hex") !== checksum) throw new ObjectIntegrityError(); },
      }));
      return { object, body };
    },
    async head(key) {
      try { return details(key, await client.send(new HeadObjectCommand({ Bucket, Key: keyFor(key) })), maxObjectBytes); }
      catch (error) { if (missing(error)) return undefined; throw error; }
    },
    async delete(key) { await client.send(new DeleteObjectCommand({ Bucket, Key: keyFor(key) })); },
    async list(listOptions = {}) {
      const search = listOptions.prefix ?? "";
      if (search) keyFor(search.endsWith("/") ? search.slice(0, -1) : search);
      const response = await client.send(new ListObjectsV2Command({
        Bucket, Prefix: prefix + search, ContinuationToken: listOptions.cursor, MaxKeys: objectListLimit(listOptions.limit),
      }));
      const objects: StoredObject[] = (response.Contents ?? []).flatMap(item => item.Key?.startsWith(prefix + search) && item.Size !== undefined
        ? [{ key: item.Key.slice(prefix.length), size: item.Size, etag: item.ETag, lastModified: item.LastModified, metadata: {} }] : []);
      return { objects, cursor: response.NextContinuationToken };
    },
    async signedDownloadUrl(key, expiresInSeconds) {
      if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 900) {
        throw new RangeError("Invalid signed URL expiry");
      }
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: keyFor(key) }), { expiresIn: expiresInSeconds });
    },
  };
}
