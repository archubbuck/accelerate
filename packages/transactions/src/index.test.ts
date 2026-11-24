import { expect,it,vi } from "vitest";
import { runTransaction } from "./index.js";
it("commits successful work",async()=>{const scope={commit:vi.fn(async()=>{}),rollback:vi.fn(async()=>{})};expect(await runTransaction(async()=>scope,async()=>42)).toBe(42);expect(scope.commit).toHaveBeenCalledOnce();expect(scope.rollback).not.toHaveBeenCalled();});
it("rolls back failed work",async()=>{const scope={commit:vi.fn(async()=>{}),rollback:vi.fn(async()=>{})};await expect(runTransaction(async()=>scope,async()=>{throw new Error("failed");})).rejects.toThrow("failed");expect(scope.rollback).toHaveBeenCalledOnce();});
