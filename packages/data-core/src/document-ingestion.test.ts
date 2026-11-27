import { expect, it, vi } from "vitest";
import { createDocumentIngestion, plainTextExtractor, type IngestedDocument } from "./document-ingestion.js";
import { createMemoryObjectStore } from "./storage-memory.js";

it("normalizes text, retains passage offsets, and skips completed extraction on retry", async () => {
  const records = new Map<string, IngestedDocument>();
  const objects = createMemoryObjectStore();
  const ingest = createDocumentIngestion({
    objects, documents: { get: async id => records.get(id), async save(document) { records.set(document.id, document); return document; } },
    maxChunkChars: 6,
  });
  const text = " a\r\nhello world ";
  const open = vi.fn(async () => ({
    body: new Response(text).body!, size: new TextEncoder().encode(text).byteLength,
    contentType: "text/plain; charset=utf-8", retrievedAt: "2026-01-01T00:00:00.000Z",
  }));
  const source = { id: "source", version: "1", open };
  const result = await ingest(source, plainTextExtractor);
  const normalized = "a\nhello world";
  expect(result.chunks.map(chunk => chunk.text).join("")).toBe(normalized);
  for (const chunk of result.chunks) expect(normalized.slice(chunk.start, chunk.end)).toBe(chunk.text);
  expect((await objects.head(result.rawKey))?.sha256).toBe(result.rawSha256);
  expect(await ingest(source, plainTextExtractor)).toEqual(result);
  expect(open).toHaveBeenCalledOnce();
});
