import { describe, it, expect } from "vitest";
import { MemoryCache } from "./index.js";
describe("MemoryCache", () => {
 it("expires entries deterministically", async () => {
   let now = 100;
   const cache = new MemoryCache(() => now);
   await cache.set("key", "value", 10);
   expect(await cache.get("key")).toBe("value");
   now = 110;
   expect(await cache.get("key")).toBeUndefined();
 });
 it("supports deletion and clearing", async () => {
   const cache = new MemoryCache();
   await cache.set("a", 1);
   expect(await cache.delete("a")).toBe(true);
   expect(await cache.delete("a")).toBe(false);
   await cache.set("b", 2);
   await cache.clear();
   expect(await cache.get("b")).toBeUndefined();
 });
});
