import { it, expect } from "vitest";
import { retry } from "./index.js";
it("retries failures", async () => {
 let attempts=0;
 const result=await retry(async () => { if (++attempts < 3) throw Error("retry"); return "ok"; }, {baseDelayMs:0});
 expect(result).toBe("ok"); expect(attempts).toBe(3);
});
it("respects attempt limit", async () => {
 await expect(retry(async () => {throw Error("fail");},{attempts:1})).rejects.toThrow("fail");
});
