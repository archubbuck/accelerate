import { validateAuditEvent, type AuditEvent } from "./index.js";

export interface IntegrityAuditEvent extends AuditEvent {
  readonly actorKind?: "human" | "service";
  readonly correlationId?: string;
  readonly causationId?: string;
}

export interface AuditCheckpoint {
  readonly stream: string;
  readonly sequence: number;
  readonly digest: string;
}

export interface IntegrityAuditRecord extends AuditCheckpoint {
  readonly previousDigest: string;
  readonly event: IntegrityAuditEvent;
}

const digestPattern = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();

export function auditGenesis(stream: string): AuditCheckpoint {
  if (typeof stream !== "string" || !stream || stream.trim() !== stream || stream.length > 256) {
    throw new TypeError("Invalid audit stream");
  }
  return { stream, sequence: 0, digest: "0".repeat(64) };
}

export function assertAuditCheckpoint(checkpoint: AuditCheckpoint) {
  auditGenesis(checkpoint.stream);
  if (!Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < 0 || !digestPattern.test(checkpoint.digest)
    || (checkpoint.sequence === 0 && checkpoint.digest !== auditGenesis(checkpoint.stream).digest)) {
    throw new TypeError("Invalid audit checkpoint");
  }
}

async function auditDigest(previous: AuditCheckpoint, event: IntegrityAuditEvent) {
  validateAuditEvent(event);
  const fields = [event.actorId, event.resourceId, event.correlationId, event.causationId];
  if (fields.some(value => value !== undefined && (typeof value !== "string" || !value.trim()))
    || (event.actorKind !== undefined && (!event.actorId || !["human", "service"].includes(event.actorKind)))) {
    throw new TypeError("Invalid audit attribution");
  }
  const metadata = Object.keys(event.metadata ?? {}).sort().map(key => {
    const value = event.metadata![key];
    if (value !== null && typeof value !== "string" && typeof value !== "boolean"
      && (typeof value !== "number" || !Number.isFinite(value))) throw new TypeError("Invalid audit metadata");
    return [key, value];
  });
  const payload = JSON.stringify([
    "accelerate-audit-v1", previous.stream, previous.sequence + 1, previous.digest,
    event.id, event.occurredAt.toISOString(), event.actorId ?? null, event.actorKind ?? null,
    event.action, event.resource, event.resourceId ?? null, event.outcome,
    event.correlationId ?? null, event.causationId ?? null, metadata,
  ]);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(payload)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createIntegrityAuditRecord(previous: AuditCheckpoint, event: IntegrityAuditEvent): Promise<IntegrityAuditRecord> {
  assertAuditCheckpoint(previous);
  if (previous.sequence === Number.MAX_SAFE_INTEGER) throw new RangeError("Audit sequence exhausted");
  const snapshot: IntegrityAuditEvent = {
    id: event.id, occurredAt: new Date(event.occurredAt), action: event.action, resource: event.resource,
    outcome: event.outcome, actorId: event.actorId, actorKind: event.actorKind,
    resourceId: event.resourceId, correlationId: event.correlationId, causationId: event.causationId,
    metadata: { ...event.metadata },
  };
  const digest = await auditDigest(previous, snapshot);
  return { stream: previous.stream, sequence: previous.sequence + 1, previousDigest: previous.digest, digest, event: snapshot };
}

export async function verifyIntegrityAudit(
  records: AsyncIterable<IntegrityAuditRecord> | Iterable<IntegrityAuditRecord>,
  start: AuditCheckpoint,
  head: AuditCheckpoint,
  anchor?: AuditCheckpoint,
): Promise<{ ok: true; head: AuditCheckpoint } | { ok: false; sequence: number; reason: "CHAIN" | "HEAD" | "ANCHOR" }> {
  assertAuditCheckpoint(start);
  assertAuditCheckpoint(head);
  if (anchor) {
    assertAuditCheckpoint(anchor);
    if (anchor.stream !== start.stream || anchor.sequence < start.sequence || anchor.sequence > head.sequence
      || (anchor.sequence === start.sequence && anchor.digest !== start.digest)) {
      return { ok: false, sequence: anchor.sequence, reason: "ANCHOR" };
    }
  }
  let previous = start;
  for await (const record of records) {
    try {
      const expected = await createIntegrityAuditRecord(previous, record.event);
      if (record.stream !== start.stream || record.sequence !== expected.sequence
        || record.previousDigest !== previous.digest || record.digest !== expected.digest) {
        return { ok: false, sequence: expected.sequence, reason: "CHAIN" };
      }
      if (anchor?.sequence === record.sequence && record.digest !== anchor.digest) {
        return { ok: false, sequence: anchor.sequence, reason: "ANCHOR" };
      }
      previous = { stream: record.stream, sequence: record.sequence, digest: record.digest };
    } catch {
      return { ok: false, sequence: previous.sequence + 1, reason: "CHAIN" };
    }
  }
  if (previous.sequence !== head.sequence || previous.digest !== head.digest || previous.stream !== head.stream) {
    return { ok: false, sequence: head.sequence, reason: "HEAD" };
  }
  return { ok: true, head };
}
