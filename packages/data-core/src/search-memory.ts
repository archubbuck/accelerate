import { assertProvenanceId } from "./provenance.js";
import {
  prepareSearchPassage, prepareSearchQuery, publicSearchPassage, searchPage, validateSearchAccess,
  type IndexedPassage, type SearchAccess, type SearchHit, type SearchIndex,
} from "./search.js";

export function createMemorySearchIndex(): SearchIndex {
  const scopes = new Map<string, Map<string, IndexedPassage>>();
  const allows = (passage: IndexedPassage, access: SearchAccess) =>
    passage.visibility === "tenant" || !!passage.audience?.some(id => access.principals.includes(id));
  return {
    async upsert(input) {
      const passage = prepareSearchPassage(input);
      const tenant = scopes.get(passage.tenantId) ?? new Map();
      tenant.set(passage.id, passage);
      scopes.set(passage.tenantId, tenant);
    },
    async delete(tenantId, id) {
      assertProvenanceId(tenantId);
      assertProvenanceId(id);
      return scopes.get(tenantId)?.delete(id) ?? false;
    },
    async get(access, id) {
      validateSearchAccess(access);
      assertProvenanceId(id);
      const passage = scopes.get(access.tenantId)?.get(id);
      return passage && allows(passage, access) ? publicSearchPassage(passage) : undefined;
    },
    async search(access, query) {
      validateSearchAccess(access);
      const { terms, embedding, tags, limit, cursor } = prepareSearchQuery(query);
      const hits: SearchHit[] = [];
      for (const entry of scopes.get(access.tenantId)?.values() ?? []) {
        if (!allows(entry, access) || !tags.every(tag => entry.tags?.includes(tag))) continue;
        const words: readonly string[] = (entry.title + " " + entry.text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
        const lexical = terms.length && terms.every(term => words.includes(term)) ? 1 : 0;
        const vector = embedding && entry.embedding?.length === embedding.length
          ? Math.max(0, embedding.reduce((sum, value, i) => sum + value * entry.embedding![i], 0)) : 0;
        const score = lexical + vector;
        if (!score || (cursor && (score > cursor.score || (score === cursor.score && entry.id <= cursor.id)))) continue;
        hits.push({ score, passage: publicSearchPassage(entry) });
      }
      hits.sort((a, b) => b.score - a.score || (a.passage.id === b.passage.id ? 0 : a.passage.id < b.passage.id ? -1 : 1));
      return searchPage(hits, limit);
    },
  };
}
