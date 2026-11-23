import { describe, it, expect } from "vitest";
import { createFixtureFactory, seededRandom } from "./index.js";
describe("fixture factory", () => {
  it("produces deterministic sequences and resets", () => {
    const factory = createFixtureFactory(({ sequence, seed }) => ({ id: seed + sequence, name: "example" }), { seed: 4 });
    expect(factory.buildMany(2).map(x => x.id)).toEqual([4, 5]);
    factory.reset();
    expect(factory.build({ name: "override" })).toEqual({ id: 4, name: "override" });
  });
  it("rejects invalid counts", () => expect(() => createFixtureFactory(() => ({})).buildMany(-1)).toThrow());
  it("replays seeded randomness", () => expect(seededRandom(123)()).toBe(seededRandom(123)()));
});
