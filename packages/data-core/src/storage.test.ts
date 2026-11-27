import { expect, it } from "vitest";
import { artifactSha256 } from "./provenance.js";
import { createMemoryObjectStore } from "./storage-memory.js";

it("stores bounded bytes, paginates, rejects bad lengths and isolates stored bytes", async () => {
  const store = createMemoryObjectStore({ maxObjectBytes: 8, maxStoredBytes: 32 });
  const bytes = new TextEncoder().encode("abc");
  const sha256 = await artifactSha256(bytes);
  await store.put({ key: "docs/a", body: new Response(bytes).body!, size: bytes.byteLength, sha256 });
  await store.put({ key: "docs/b", body: bytes, size: bytes.byteLength });
  bytes[0] = 0;
  const first = await store.list({ prefix: "docs/", limit: 1 });
  expect(first.objects[0].key).toBe("docs/a");
  expect((await store.list({ prefix: "docs/", cursor: first.cursor })).objects.map(object => object.key)).toEqual(["docs/b"]);
  const result = await store.get("docs/a", { verifySha256: sha256 });
  expect(await new Response(result!.body).text()).toBe("abc");
  await expect(store.put({ key: "invalid", body: bytes, size: 2 })).rejects.toMatchObject({ name: "ObjectIntegrityError" });
  await expect(store.put({ key: "../escape", body: bytes, size: 3 })).rejects.toThrow("Invalid object key");
  await store.delete("docs/a");
  expect(await store.head("docs/a")).toBeUndefined();
});
