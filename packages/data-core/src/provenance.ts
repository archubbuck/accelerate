export interface ArtifactRef {
  id: string;
  version: string;
}

export type ArtifactMetadata = Readonly<Record<string, string | number | boolean | null>>;

export interface Artifact extends ArtifactRef {
  sha256: string;
  retrievedAt: string;
  source?: string;
  metadata?: ArtifactMetadata;
}

export type EvidenceReference =
  | { kind: "artifact"; artifact: ArtifactRef; passage?: { start: number; end: number } }
  | { kind: "missing"; reference: string; reason: string };

export interface Transformation {
  id: string;
  kind: string;
  version: string;
  recordedAt: string;
  inputs: readonly EvidenceReference[];
  outputs: readonly Artifact[];
  implementation?: { model?: string; prompt?: string; tools?: readonly string[] };
}

export interface ProvenanceRecord {
  artifact: Artifact;
  transformation?: Omit<Transformation, "outputs">;
  review?: { reviewerId: string; status: "accepted" | "rejected"; reviewedAt: string };
  redactedAt?: string;
}

const encoder = new TextEncoder();
export async function artifactSha256(content: string | Uint8Array): Promise<string> {
  const bytes = typeof content === "string" ? encoder.encode(content) : new Uint8Array(content);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function assertProvenanceId(value: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)) throw new TypeError("Invalid provenance identifier");
}

export function assertProvenanceDate(timestamp: string) {
  const time = new Date(timestamp);
  if (!Number.isFinite(time.getTime()) || time.toISOString() !== timestamp) throw new TypeError("Expected canonical UTC timestamp");
}

export function assertArtifact(artifact: Artifact) {
  assertProvenanceId(artifact.id);
  assertProvenanceId(artifact.version);
  assertProvenanceDate(artifact.retrievedAt);
  if (typeof artifact.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(artifact.sha256)
    || (artifact.source !== undefined && (typeof artifact.source !== "string" || artifact.source.length > 2048))) {
    throw new TypeError("Invalid provenance artifact");
  }
  if (Object.values(artifact.metadata ?? {}).some(value => value !== null && typeof value !== "string"
    && typeof value !== "boolean" && (typeof value !== "number" || !Number.isFinite(value)))) {
    throw new TypeError("Invalid artifact metadata");
  }
}

export function assertTransformation(transform: Transformation) {
  assertProvenanceId(transform.id);
  assertProvenanceId(transform.kind);
  assertProvenanceId(transform.version);
  assertProvenanceDate(transform.recordedAt);
  if (!transform.inputs.length || transform.inputs.length > 1000 || !transform.outputs.length || transform.outputs.length > 1000) {
    throw new RangeError("Invalid provenance transformation size");
  }
  const { model, prompt, tools } = transform.implementation ?? {};
  for (const version of [model, prompt, ...(tools ?? [])]) if (version !== undefined) assertProvenanceId(version);
  const outputs = new Set<string>();
  for (const artifact of transform.outputs) {
    assertArtifact(artifact);
    const identity = JSON.stringify([artifact.id, artifact.version]);
    if (outputs.has(identity)) throw new TypeError("Duplicate transformation output");
    outputs.add(identity);
  }
  for (const evidence of transform.inputs) {
    if (evidence.kind === "missing") {
      assertProvenanceId(evidence.reference);
      if (typeof evidence.reason !== "string" || !evidence.reason.trim() || evidence.reason.length > 1024) throw new TypeError("Invalid missing evidence reason");
      continue;
    }
    if (evidence.kind !== "artifact") throw new TypeError("Invalid provenance evidence");
    assertProvenanceId(evidence.artifact.id);
    assertProvenanceId(evidence.artifact.version);
    if (evidence.passage && (!Number.isSafeInteger(evidence.passage.start) || !Number.isSafeInteger(evidence.passage.end)
      || evidence.passage.start < 0 || evidence.passage.end <= evidence.passage.start)) {
      throw new TypeError("Invalid passage range");
    }
    if (outputs.has(JSON.stringify([evidence.artifact.id, evidence.artifact.version]))) throw new TypeError("Transformation cannot consume its own output");
  }
}
