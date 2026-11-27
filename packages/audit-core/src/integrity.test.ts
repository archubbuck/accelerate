import { expect, it } from "vitest";
import { auditGenesis, createIntegrityAuditRecord, verifyIntegrityAudit, type IntegrityAuditEvent } from "./integrity.js";

const genesis = auditGenesis("test");
const event: IntegrityAuditEvent = {
  id: "first", occurredAt: new Date("2026-01-01T00:00:00Z"), actorId: "worker",
  actorKind: "service", action: "posted", resource: "invoice", correlationId: "request",
  causationId: "job", outcome: "success", metadata: { source: "api", attempt: 1 },
};

it("hashes deterministically and detects content changes, gaps and an inconsistent external anchor", async () => {
  const first = await createIntegrityAuditRecord(genesis, event);
  const reordered = await createIntegrityAuditRecord(genesis, { ...event, metadata: { attempt: 1, source: "api" } });
  expect(first.digest).toBe(reordered.digest);
  const second = await createIntegrityAuditRecord(first, { ...event, id: "next" });
  expect(await verifyIntegrityAudit([first, second], genesis, second, first)).toMatchObject({ ok: true });
  expect(await verifyIntegrityAudit([first], genesis, second)).toEqual({ ok: false, sequence: 2, reason: "HEAD" });
  expect(await verifyIntegrityAudit([second], genesis, second)).toEqual({ ok: false, sequence: 1, reason: "CHAIN" });
  expect(await verifyIntegrityAudit([{ ...first, event: { ...event, actorId: "changed" } }, second], genesis, second))
    .toEqual({ ok: false, sequence: 1, reason: "CHAIN" });

  const forged = await createIntegrityAuditRecord(genesis, { ...event, actorId: "changed" });
  const rebuilt = await createIntegrityAuditRecord(forged, { ...event, id: "next" });
  expect(await verifyIntegrityAudit([forged, rebuilt], genesis, rebuilt, first))
    .toEqual({ ok: false, sequence: 1, reason: "ANCHOR" });
});
