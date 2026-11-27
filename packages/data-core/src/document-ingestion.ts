import { artifactSha256, assertProvenanceDate, assertProvenanceId, type ArtifactMetadata } from "./provenance.js";
import { assertObjectSize, boundedObjectStream, type ObjectStore } from "./storage.js";

export interface DocumentSource {
  id: string;
  version: string;
  open(signal?: AbortSignal): Promise<{
    body: ReadableStream<Uint8Array>;
    size: number;
    contentType: string;
    retrievedAt: string;
    modifiedAt?: string;
    metadata?: ArtifactMetadata;
  }>;
}

export interface DocumentExtractor {
  id: string;
  version: string;
  accepts(contentType: string): boolean;
  extract(bytes: Uint8Array, signal?: AbortSignal): Promise<string>;
}

export interface DocumentChunk {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface IngestedDocument {
  id: string;
  sourceId: string;
  sourceVersion: string;
  extractorId: string;
  extractorVersion: string;
  rawKey: string;
  rawSha256: string;
  textSha256: string;
  contentType: string;
  retrievedAt: string;
  modifiedAt?: string;
  metadata?: ArtifactMetadata;
  chunks: readonly DocumentChunk[];
}

export interface DocumentStore {
  get(id: string): Promise<IngestedDocument | undefined>;
  save(document: IngestedDocument): Promise<IngestedDocument>;
}

export class DocumentIngestionError extends Error {
  constructor(readonly code: "UNSUPPORTED_TYPE" | "EXTRACTION_FAILED" | "OUTPUT_LIMIT" | "SOURCE_CHANGED") {
    super("Document ingestion failed");
    this.name = "DocumentIngestionError";
  }
}

export function chunkDocument(input: string, limit: number, maxChunks: number): DocumentChunk[] {
  if (!Number.isSafeInteger(limit) || limit < 2 || !Number.isSafeInteger(maxChunks) || maxChunks < 1) throw new RangeError("Invalid document chunk limits");
  const output: DocumentChunk[] = [];
  for (let start = 0; start < input.length;) {
    if (output.length >= maxChunks) throw new DocumentIngestionError("OUTPUT_LIMIT");
    let end = Math.min(start + limit, input.length);
    if (end < input.length) {
      const whitespace = input.lastIndexOf(" ", end - 1);
      const newline = input.lastIndexOf("\n", end - 1);
      const boundary = Math.max(whitespace, newline);
      if (boundary >= start + Math.ceil(limit / 2)) end = boundary + 1;
      else if (/^[\uDC00-\uDFFF]$/.test(input[end])) end--;
    }
    output.push({ index: output.length, start, end, text: input.slice(start, end) });
    start = end;
  }
  return output;
}

export const plainTextExtractor: DocumentExtractor = {
  id: "plain-text",
  version: "1",
  accepts: type => type === "text/plain" || type === "text/markdown",
  async extract(bytes) { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); },
};

export function createDocumentIngestion(options: {
  objects: ObjectStore;
  documents: DocumentStore;
  maxSourceBytes?: number;
  maxTextChars?: number;
  maxChunkChars?: number;
  maxChunks?: number;
}) {
  const sourceLimit = options.maxSourceBytes ?? 8 * 1024 * 1024;
  const textLimit = options.maxTextChars ?? 1024 * 1024;
  const chunkLimit = options.maxChunkChars ?? 1500;
  const maxChunks = options.maxChunks ?? 1000;
  for (const limit of [sourceLimit, textLimit]) if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("Invalid document ingestion limit");

  return async (source: DocumentSource, extractor: DocumentExtractor, signal?: AbortSignal): Promise<IngestedDocument> => {
    for (const value of [source.id, source.version, extractor.id, extractor.version]) assertProvenanceId(value);
    const id = await artifactSha256(JSON.stringify([source.id, source.version, extractor.id, extractor.version]));
    signal?.throwIfAborted();
    const existing = await options.documents.get(id);
    if (existing) return existing;
    const input = await source.open(signal);
    const contentType = input.contentType.split(";", 1)[0].trim().toLowerCase();
    try {
      assertObjectSize(input.size, sourceLimit);
      assertProvenanceDate(input.retrievedAt);
      if (input.modifiedAt !== undefined) assertProvenanceDate(input.modifiedAt);
      if (!extractor.accepts(contentType)) throw new DocumentIngestionError("UNSUPPORTED_TYPE");
    } catch (error) {
      await input.body.cancel().catch(() => undefined);
      throw error;
    }
    const bytes = new Uint8Array(await new Response(boundedObjectStream(input.body, input.size, signal)).arrayBuffer());
    const rawSha256 = await artifactSha256(bytes);
    let text: string;
    try { text = await extractor.extract(bytes.slice(), signal); }
    catch { signal?.throwIfAborted(); throw new DocumentIngestionError("EXTRACTION_FAILED"); }
    if (typeof text !== "string" || text.length > textLimit) throw new DocumentIngestionError("OUTPUT_LIMIT");
    const normalized = text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").normalize("NFC").trim();
    if (normalized.length > textLimit) throw new DocumentIngestionError("OUTPUT_LIMIT");
    const chunks = chunkDocument(normalized, chunkLimit, maxChunks);
    const textSha256 = await artifactSha256(normalized);
    const rawKey = "documents/raw/" + rawSha256;
    const stored = await options.objects.head(rawKey);
    if (stored && (stored.size !== bytes.byteLength || stored.sha256 !== rawSha256)) {
      throw new DocumentIngestionError("SOURCE_CHANGED");
    }
    if (!stored) {
      await options.objects.put({ key: rawKey, body: bytes, size: bytes.byteLength, sha256: rawSha256, signal });
    }
    signal?.throwIfAborted();
    return options.documents.save({
      id, sourceId: source.id, sourceVersion: source.version, extractorId: extractor.id, extractorVersion: extractor.version,
      rawKey, rawSha256, textSha256, contentType, retrievedAt: input.retrievedAt, modifiedAt: input.modifiedAt, metadata: input.metadata, chunks,
    });
  };
}
