import { artifactSha256 } from "./provenance.js";
import {
  assertObjectChecksum, assertObjectKey, assertObjectSize, boundedObjectStream, objectListLimit, objectMetadata, ObjectIntegrityError,
  type ObjectStore, type StoredObject,
} from "./storage.js";

export function createMemoryObjectStore(options: { maxObjectBytes?: number; maxStoredBytes?: number; maxObjects?: number } = {}): ObjectStore {
  const maxObjectBytes = options.maxObjectBytes ?? 8 * 1024 * 1024;
  const maxStoredBytes = options.maxStoredBytes ?? 64 * 1024 * 1024;
  const maxObjects = options.maxObjects ?? 1000;
  assertObjectSize(maxStoredBytes, Number.MAX_SAFE_INTEGER);
  assertObjectSize(maxObjectBytes, maxStoredBytes);
  if (!Number.isSafeInteger(maxObjects) || maxObjects < 1) throw new RangeError("Invalid memory object limit");
  const objects = new Map<string, { object: StoredObject; bytes: Uint8Array }>();
  let occupied = 0;
  let staging = 0;

  return {
    async put(upload) {
      assertObjectKey(upload.key);
      assertObjectSize(upload.size, maxObjectBytes);
      const metadata = objectMetadata(upload);
      if (upload.sha256 !== undefined) assertObjectChecksum(upload.sha256);
      if (!objects.has(upload.key) && objects.size >= maxObjects) throw new RangeError("Memory object store is full");
      if (staging + occupied + upload.size > maxStoredBytes) throw new RangeError("Memory object store byte capacity exceeded");
      staging += upload.size;
      try {
        const bytes = new Uint8Array(upload.size);
        const reader = boundedObjectStream(upload.body, upload.size, upload.signal).getReader();
        try {
          let offset = 0;
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes.set(value, offset);
            offset += value.byteLength;
          }
        } finally { reader.releaseLock(); }
        const sha256 = await artifactSha256(bytes);
        if (upload.sha256 && upload.sha256 !== sha256) throw new ObjectIntegrityError();
        upload.signal?.throwIfAborted();
        const object = { key: upload.key, size: bytes.byteLength, contentType: upload.contentType, metadata, sha256, lastModified: new Date() };
        if (!objects.has(upload.key) && objects.size >= maxObjects) throw new RangeError("Memory object store is full");
        occupied += bytes.byteLength - (objects.get(upload.key)?.bytes.byteLength ?? 0);
        objects.set(upload.key, { object, bytes });
        return structuredClone(object);
      } finally { staging -= upload.size; }
    },
    async get(key, options = {}) {
      assertObjectKey(key);
      options.signal?.throwIfAborted();
      const data = objects.get(key);
      if (!data) return undefined;
      if (options.verifySha256 !== undefined) {
        assertObjectChecksum(options.verifySha256);
        if (data.object.sha256 !== options.verifySha256) throw new ObjectIntegrityError();
      }
      return {
        object: structuredClone(data.object),
        body: boundedObjectStream(data.bytes.slice(), data.bytes.byteLength, options.signal),
      };
    },
    async head(key) { assertObjectKey(key); return structuredClone(objects.get(key)?.object); },
    async delete(key) {
      assertObjectKey(key);
      const existing = objects.get(key);
      if (existing) occupied -= existing.bytes.byteLength;
      objects.delete(key);
    },
    async list(options = {}) {
      const prefix = options.prefix ?? "";
      if (prefix) assertObjectKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
      const limit = objectListLimit(options.limit);
      const items = [...objects.keys()].filter(key => key.startsWith(prefix) && (options.cursor === undefined || key > options.cursor)).sort();
      const page = items.slice(0, limit);
      return { objects: page.map(key => structuredClone(objects.get(key)!.object)), ...(items.length > limit ? { cursor: page.at(-1) } : {}) };
    },
  };
}
