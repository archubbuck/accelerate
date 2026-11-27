export type ObjectBody = Uint8Array | ReadableStream<Uint8Array>;

export interface StoredObject {
  key: string;
  size: number;
  contentType?: string;
  metadata: Readonly<Record<string, string>>;
  sha256?: string;
  etag?: string;
  lastModified?: Date;
}

export interface ObjectUpload {
  key: string;
  body: ObjectBody;
  size: number;
  contentType?: string;
  metadata?: Readonly<Record<string, string>>;
  sha256?: string;
  signal?: AbortSignal;
}

export interface ObjectStore {
  put(upload: ObjectUpload): Promise<StoredObject>;
  get(key: string, options?: { verifySha256?: string; signal?: AbortSignal }): Promise<{ object: StoredObject; body: ReadableStream<Uint8Array> } | undefined>;
  head(key: string): Promise<StoredObject | undefined>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: readonly StoredObject[]; cursor?: string }>;
  signedDownloadUrl?(key: string, expiresInSeconds: number): Promise<string>;
}

export class ObjectIntegrityError extends Error {
  constructor() { super("Object length or checksum did not match"); this.name = "ObjectIntegrityError"; }
}

export function assertObjectKey(key: string) {
  if (typeof key !== "string" || !key.length || key.length > 1024 || !/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(key)
    || key.split("/").some(segment => !segment || segment === "." || segment === "..")) {
    throw new TypeError("Invalid object key");
  }
}

export function objectListLimit(limit = 100): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("Invalid object page size");
  return limit;
}

export function assertObjectSize(bytes: number, limit: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit) throw new RangeError("Object exceeds configured size");
}

export function assertObjectChecksum(value: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError("Expected lowercase SHA-256 hex");
}

export function objectMetadata(upload: ObjectUpload) {
  const metadata = { ...upload.metadata };
  if (Object.entries(metadata).some(([key, value]) => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key) || key === "sha256"
    || typeof value !== "string" || value.length > 512 || /[^\x20-\x7e]/.test(value))) {
    throw new TypeError("Invalid object metadata");
  }
  if (Object.entries(metadata).reduce((sum, [key, value]) => sum + key.length + value.length, 0) > 1024) {
    throw new RangeError("Object metadata exceeds its size limit");
  }
  if (upload.contentType !== undefined && (!upload.contentType.length || /[^\x20-\x7e]/.test(upload.contentType))) {
    throw new TypeError("Invalid object content type");
  }
  return metadata;
}

export function boundedObjectStream(body: ObjectBody, length: number, signal?: AbortSignal) {
  let size = 0;
  const input = body instanceof Uint8Array ? new ReadableStream<Uint8Array>({
    start(controller) { if (body.byteLength) controller.enqueue(body); controller.close(); },
  }) : body;
  return input.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (!(chunk instanceof Uint8Array)) throw new TypeError("Object stream must contain bytes");
      size += chunk.byteLength;
      if (size > length) throw new ObjectIntegrityError();
      controller.enqueue(chunk);
    },
    flush() {
      if (size !== length) throw new ObjectIntegrityError();
    },
  }), { signal });
}
