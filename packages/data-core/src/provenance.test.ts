import { expect, it } from "vitest";
import { artifactSha256, assertTransformation } from "./provenance.js";

it("hashes artifact bytes and detects malformed evidence", async () => {
  const sha256 = await artifactSha256("abc");
  expect(sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const artifact = { id: "input", version: "1", sha256, retrievedAt: "2026-01-01T00:00:00.000Z" };
  const transform = {
    id: "transformation", kind: "parse", version: "1", recordedAt: artifact.retrievedAt,
    inputs: [{ kind: "artifact" as const, artifact, passage: { start: 1, end: 4 } }],
    outputs: [{ ...artifact, version: "2" }],
  };
  expect(() => assertTransformation(transform)).not.toThrow();
  expect(() => assertTransformation({ ...transform, outputs: [artifact] })).toThrow("own output");
  expect(() => assertTransformation({ ...transform, inputs: [{ ...transform.inputs[0], passage: { start: 4, end: 2 } }] }))
    .toThrow("passage range");
});
