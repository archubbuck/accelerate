import { expect, it } from "vitest";
import { planMigrations } from "./index.js";

it("orders dependencies and validates immutable history", async () => {
  const one = { id: "a/1", statements: ["SELECT 1"] };
  const two = { id: "b/1", requires: ["a/1"], statements: ["SELECT 2"] };
  const plan = await planMigrations([two, one], []);
  expect(plan.map((m) => m.id)).toEqual(["a/1", "b/1"]);
  expect(await planMigrations([two], plan)).toEqual([]);
  await expect(planMigrations([two], [])).rejects.toThrow("Missing");
  await expect(
    planMigrations([{ ...one, statements: ["SELECT 3"] }], plan),
  ).rejects.toThrow("Changed");
  await expect(
    planMigrations([two, { ...one, requires: [two.id] }], []),
  ).rejects.toThrow("Cyclic");
});
