import { assertProvenanceId, type ArtifactRef } from "./provenance.js";

export interface IndexedPassage {
  id: string;
  tenantId: string;
  visibility: "tenant" | "restricted";
  audience?: readonly string[];
  title: string;
  text: string;
  tags?: readonly string[];
  source: ArtifactRef;
  passage: { start: number; end: number };
  embedding?: readonly number[];
}

export interface SearchAccess { tenantId: string; principals: readonly string[] }

export interface SearchQuery {
  text?: string;
  embedding?: readonly number[];
  tags?: readonly string[];
  limit?: number;
  cursor?: { score: number; id: string };
}

export type SearchPassage = Omit<IndexedPassage, "tenantId" | "visibility" | "audience" | "embedding">;
export interface SearchHit { score: number; passage: SearchPassage }

export interface SearchIndex {
  upsert(passage: IndexedPassage): Promise<void>;
  delete(tenantId: string, id: string): Promise<boolean>;
  get(access: SearchAccess, id: string): Promise<SearchPassage | undefined>;
  search(access: SearchAccess, query: SearchQuery): Promise<{ hits: readonly SearchHit[]; cursor?: SearchQuery["cursor"] }>;
}

export function normalizeEmbedding(vector: readonly number[] | undefined) {
  if (vector === undefined) return undefined;
  if (!vector.length || vector.length > 2048 || vector.some(value => !Number.isFinite(value))) throw new TypeError("Invalid search embedding");
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length === 0) throw new TypeError("Invalid search embedding norm");
  return vector.map(value => value / length);
}

export function parseSearchTerms(text = "") {
  if (typeof text !== "string" || text.length > 2048) throw new TypeError("Invalid search query");
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
}

export function validateSearchAccess(access: SearchAccess) {
  assertProvenanceId(access.tenantId);
  if (!Array.isArray(access.principals) || access.principals.length > 1000) throw new RangeError("Invalid search audience");
  access.principals.forEach(assertProvenanceId);
}

export function prepareSearchPassage(input: IndexedPassage) {
  for (const id of [input.id, input.tenantId, input.source.id, input.source.version]) assertProvenanceId(id);
  const audience = [...new Set(input.audience ?? [])], tags = [...new Set(input.tags ?? [])];
  if (audience.length > 1000 || tags.length > 100 || !["tenant", "restricted"].includes(input.visibility)
    || (input.visibility === "restricted" && !audience.length)) throw new RangeError("Invalid search passage policy");
  audience.forEach(assertProvenanceId);
  tags.forEach(assertProvenanceId);
  if (typeof input.title !== "string" || input.title.length > 2000 || typeof input.text !== "string" || input.text.length > 65_536
    || !Number.isSafeInteger(input.passage.start) || !Number.isSafeInteger(input.passage.end)
    || input.passage.start < 0 || input.passage.end <= input.passage.start) throw new TypeError("Invalid search passage");
  return {
    id: input.id, tenantId: input.tenantId, visibility: input.visibility, title: input.title, text: input.text, audience, tags,
    source: { id: input.source.id, version: input.source.version },
    passage: { start: input.passage.start, end: input.passage.end }, embedding: normalizeEmbedding(input.embedding),
  };
}

export function prepareSearchQuery(query: SearchQuery) {
  const terms = parseSearchTerms(query.text);
  const embedding = normalizeEmbedding(query.embedding);
  const limit = query.limit ?? 25;
  const tags = [...new Set(query.tags ?? [])];
  if ((!terms.length && !embedding) || tags.length > 100 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Invalid search request");
  }
  tags.forEach(assertProvenanceId);
  if (query.cursor) {
    assertProvenanceId(query.cursor.id);
    if (!Number.isFinite(query.cursor.score) || query.cursor.score <= 0) throw new TypeError("Invalid search cursor");
  }
  return { terms, embedding, tags, limit, cursor: query.cursor };
}

export function publicSearchPassage({ id, title, text, tags, source, passage }: IndexedPassage): SearchPassage {
  return structuredClone({ id, title, text, tags, source, passage });
}

export function searchPage(hits: readonly SearchHit[], limit: number) {
  const page = hits.slice(0, limit);
  const last = page.at(-1);
  return { hits: page, ...(last && hits.length > limit ? { cursor: { id: last.passage.id, score: last.score } } : {}) };
}
