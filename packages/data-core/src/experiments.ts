import { artifactSha256, assertProvenanceId, type ArtifactRef } from "./provenance.js";

export type ExperimentValue = null | boolean | number | string | readonly ExperimentValue[] | { readonly [key: string]: ExperimentValue };

export interface ExperimentArm {
  id: string;
  weight: number;
  control?: boolean;
  parameters: Readonly<Record<string, ExperimentValue>>;
}

export interface ExperimentSpec {
  id: string;
  version: string;
  seed: string;
  arms: readonly ExperimentArm[];
  metrics: readonly string[];
  datasets: readonly ArtifactRef[];
  codeVersion: string;
  configVersion: string;
}

export function validateExperiment(spec: ExperimentSpec) {
  for (const id of [spec.id, spec.version, spec.codeVersion, spec.configVersion]) assertProvenanceId(id);
  if (typeof spec.seed !== "string" || !spec.seed || spec.seed.length > 256 || spec.arms.length < 2 || spec.arms.length > 100
    || spec.arms.filter(arm => arm.control).length !== 1 || spec.metrics.length < 1) {
    throw new TypeError("Invalid experiment specification");
  }
  for (const arm of spec.arms) {
    assertProvenanceId(arm.id);
    if (!Number.isSafeInteger(arm.weight) || arm.weight < 1) throw new TypeError("Invalid experiment weight");
    JSON.stringify(arm.parameters, (_key, value) => {
      if (value === undefined || (typeof value === "number" && !Number.isFinite(value))
        || ["function", "symbol", "bigint"].includes(typeof value)) throw new TypeError("Invalid experiment parameter");
      return value;
    });
  }
  for (const metric of spec.metrics) assertProvenanceId(metric);
  for (const dataset of spec.datasets) {
    assertProvenanceId(dataset.id);
    assertProvenanceId(dataset.version);
  }
  if (new Set(spec.arms.map(arm => arm.id)).size !== spec.arms.length || new Set(spec.metrics).size !== spec.metrics.length) {
    throw new TypeError("Duplicate experiment arm or metric");
  }
}

export async function assignExperimentArm(spec: ExperimentSpec, subjectId: string): Promise<ExperimentArm> {
  validateExperiment(spec);
  assertProvenanceId(subjectId);
  const hash = await artifactSha256(JSON.stringify([spec.id, spec.version, spec.seed, subjectId]));
  const total = spec.arms.reduce((sum, arm) => sum + BigInt(arm.weight), 0n);
  let slot = BigInt("0x" + hash) % total;
  for (const arm of spec.arms) {
    if (slot < BigInt(arm.weight)) return structuredClone(arm);
    slot -= BigInt(arm.weight);
  }
  throw new Error("Experiment assignment failed");
}

export function compareExperimentMeans(controlMean: number | null, treatmentMean: number | null) {
  return controlMean === null || treatmentMean === null ? null : treatmentMean - controlMean;
}
