import { expect, it } from "vitest";
import { assignExperimentArm, compareExperimentMeans, validateExperiment, type ExperimentSpec } from "./experiments.js";

const spec: ExperimentSpec = {
  id: "trial", version: "v1", seed: "seed", datasets: [{ id: "dataset", version: "v2" }],
  codeVersion: "commit", configVersion: "settings-v1", metrics: ["latency"],
  arms: [{ id: "control", weight: 1, control: true, parameters: {} }, { id: "treatment", weight: 3, parameters: { fast: true } }],
};

it("deterministically assigns weighted treatment arms and validates experiment definitions", async () => {
  const subjects = Array.from({ length: 50 }, (_, i) => "subject-" + i);
  const assigned = await Promise.all(subjects.map(subject => assignExperimentArm(spec, subject)));
  expect(await Promise.all(subjects.map(subject => assignExperimentArm(structuredClone(spec), subject)))).toEqual(assigned);
  expect(new Set(assigned.map(arm => arm.id))).toEqual(new Set(["control", "treatment"]));
  expect(() => validateExperiment({ ...spec, metrics: ["latency", "latency"] })).toThrow("Duplicate");
  expect(compareExperimentMeans(4, 6)).toBe(2);
  expect(compareExperimentMeans(null, 6)).toBeNull();
});
