import { it } from "vitest";
import { verifyQuotaStore } from "../../../tools/testing/rate-limit";
import { createMemoryQuotaStore } from "./index.js";
it("shares atomic quotas across clients", async () => {
  const store = createMemoryQuotaStore();
  await verifyQuotaStore(() => store);
});
