import type { Database } from "@accelerate/data-core";
import { assertProvenanceId } from "@accelerate/data-core/provenance";
import {
  prepareSearchPassage, prepareSearchQuery, publicSearchPassage, searchPage, validateSearchAccess,
  type IndexedPassage, type SearchIndex,
} from "@accelerate/data-core/search";

export const searchSchema = [
  `CREATE TABLE IF NOT EXISTS accelerate_search_passages (
    tenant_id text NOT NULL, id text NOT NULL COLLATE "C",
    visibility text NOT NULL CHECK (visibility IN ('tenant','restricted')),
    audience text[] NOT NULL, tags text[] NOT NULL,
    document jsonb NOT NULL,
    lexemes tsvector GENERATED ALWAYS AS (to_tsvector('simple', (document->>'title') || ' ' || (document->>'text'))) STORED,
    embedding double precision[], PRIMARY KEY (tenant_id,id)
  )`,
  `CREATE INDEX IF NOT EXISTS accelerate_search_passages_lexemes ON accelerate_search_passages USING gin(lexemes)`,
] as const;

export function createPostgresSearchIndex(db: Database): SearchIndex {
  return {
    async upsert(input) {
      const { id, tenantId, visibility, audience, tags, embedding, ...passage } = prepareSearchPassage(input);
      await db.query(
        `INSERT INTO accelerate_search_passages (tenant_id,id,visibility,audience,tags,document,embedding)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         ON CONFLICT (tenant_id,id) DO UPDATE SET visibility=EXCLUDED.visibility,audience=EXCLUDED.audience,
           tags=EXCLUDED.tags,document=EXCLUDED.document,embedding=EXCLUDED.embedding`,
        [tenantId, id, visibility, audience, tags, JSON.stringify({ ...passage, id, tags }), embedding ?? null],
      );
    },
    async delete(tenantId, id) {
      assertProvenanceId(tenantId);
      assertProvenanceId(id);
      return (await db.query("DELETE FROM accelerate_search_passages WHERE tenant_id=$1 AND id=$2", [tenantId, id])).rowCount === 1;
    },
    async get(access, id) {
      validateSearchAccess(access);
      assertProvenanceId(id);
      const row = (await db.query<{ document: IndexedPassage }>(
        `SELECT document FROM accelerate_search_passages
         WHERE tenant_id=$1 AND id=$2 AND (visibility='tenant' OR audience && $3::text[])`,
        [access.tenantId, id, access.principals],
      )).rows[0];
      return row && publicSearchPassage(row.document);
    },
    async search(access, query) {
      validateSearchAccess(access);
      const { terms, embedding, tags, limit, cursor } = prepareSearchQuery(query);
      const { rows } = await db.query<{ document: IndexedPassage; score: number }>(
        `WITH ranked AS (
           SELECT id,document,
             CASE WHEN cardinality($3::text[]) > 0 AND lexemes @@ plainto_tsquery('simple', array_to_string($3,' '))
               THEN 1 + ts_rank(lexemes, plainto_tsquery('simple', array_to_string($3,' ')))::double precision
               ELSE 0::double precision END +
             CASE WHEN $4::double precision[] IS NOT NULL AND cardinality(embedding)=cardinality($4)
               THEN GREATEST(0, (SELECT SUM(value*q) FROM unnest(embedding,$4) AS v(value,q))) ELSE 0 END AS score
           FROM accelerate_search_passages
           WHERE tenant_id=$1 AND (visibility='tenant' OR audience && $2::text[]) AND tags @> $5::text[]
             AND ($4::double precision[] IS NOT NULL OR lexemes @@ plainto_tsquery('simple', array_to_string($3,' ')))
         )
         SELECT document,score FROM ranked WHERE score > 0
           AND ($6::double precision IS NULL OR score < $6 OR (score=$6 AND id > $7))
         ORDER BY score DESC,id LIMIT $8`,
        [access.tenantId, access.principals, terms, embedding ?? null, tags, cursor?.score ?? null, cursor?.id ?? null, limit + 1],
      );
      return searchPage(rows.map(row => ({ passage: publicSearchPassage(row.document), score: row.score })), limit);
    },
  };
}
