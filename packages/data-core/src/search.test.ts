import { expect, it } from "vitest";
import { createMemorySearchIndex } from "./search-memory.js";
import type { IndexedPassage } from "./search.js";

const prototype: IndexedPassage = {
  id: "open", tenantId: "one", visibility: "tenant", title: "Water report", text: "Water conditions",
  source: { id: "document", version: "1" }, passage: { start: 0, end: 16 }, tags: ["report"], embedding: [1, 0],
};

it("isolates tenants and restricted passages while combining lexical and semantic ranking", async () => {
  const index = createMemorySearchIndex();
  await index.upsert(prototype);
  await index.upsert({ ...prototype, id: "private", visibility: "restricted", audience: ["reviewers"] });
  await index.upsert({ ...prototype, id: "foreign", tenantId: "two" });
  const access = { tenantId: "one", principals: [] };
  expect(await index.get(access, "private")).toBeUndefined();
  expect((await index.search(access, { text: "water", tags: ["report"] })).hits.map(hit => hit.passage.id)).toEqual(["open"]);
  const query = { text: "water", embedding: [1, 0], limit: 1 };
  const reviewers = { tenantId: "one", principals: ["reviewers"] };
  const first = await index.search(reviewers, query);
  expect(first.hits[0]).toMatchObject({ passage: { id: "open", source: { id: "document" } }, score: 2 });
  expect((await index.search(reviewers, { ...query, cursor: first.cursor })).hits[0].passage.id).toBe("private");
  expect(await index.delete("one", "open")).toBe(true);
  expect((await index.search(access, { text: "water" })).hits).toEqual([]);
});
