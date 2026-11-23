import { describe,it,expect,vi } from "vitest";
import { createPostgresJobQueue } from "./index.js";
describe("postgres jobs",()=>{it("enqueues with caller supplied id",async()=>{const query=vi.fn().mockResolvedValue({rows:[],rowCount:1});const queue=createPostgresJobQueue({query},()=>"generated");await expect(queue.enqueue("email",{to:"test"}, {id:"job-1"})).resolves.toBe("job-1");expect(query.mock.calls[0][1][0]).toBe("job-1");await expect(queue.enqueue("email",{}, {delayMs:-1})).rejects.toThrow();});});
