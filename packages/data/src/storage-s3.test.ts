import { expect, it, vi } from "vitest";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createS3ObjectStore } from "./storage-s3.js";

const sha256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

it("streams bounded uploads and verified downloads inside the S3 namespace", async () => {
  const send = vi.fn(async command => {
    if (command instanceof PutObjectCommand) {
      expect(command.input.Key).toBe("scope/docs/item");
      expect(command.input.ContentLength).toBe(3);
      expect(command.input.ChecksumSHA256).toBe(Buffer.from(sha256, "hex").toString("base64"));
      const chunks: Buffer[] = [];
      for await (const value of command.input.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(value));
      expect(Buffer.concat(chunks).toString()).toBe("abc");
      return { ETag: "etag" };
    }
    if (command instanceof GetObjectCommand) return {
      ContentLength: 3, Body: { transformToWebStream: () => new Response("abc").body! },
    };
    if (command instanceof ListObjectsV2Command) return {
      Contents: [{ Key: "scope/docs/item", Size: 3 }, { Key: "other/docs/item", Size: 3 }],
    };
    throw new Error("Unexpected S3 test command");
  });
  const store = createS3ObjectStore({ client: { send } as unknown as S3Client, bucket: "test", namespace: "scope", maxObjectBytes: 20 });
  expect((await store.put({ key: "docs/item", body: new Response("abc").body!, size: 3, sha256 })).etag).toBe("etag");
  const item = await store.get("docs/item", { verifySha256: sha256 });
  expect(await new Response(item!.body).text()).toBe("abc");
  const bad = await store.get("docs/item", { verifySha256: "0".repeat(64) });
  await expect(new Response(bad!.body).text()).rejects.toMatchObject({ name: "ObjectIntegrityError" });
  expect((await store.list({ prefix: "docs/" })).objects.map(object => object.key)).toEqual(["docs/item"]);
  await expect(store.signedDownloadUrl!("docs/item", 901)).rejects.toThrow("expiry");
});
