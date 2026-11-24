import {it,expect,vi} from "vitest";import {createStore} from "./index.js";
it("notifies only on changes and supports unsubscribe",()=>{const store=createStore(1);const listener=vi.fn();const off=store.subscribe(listener);store.set(1);store.update(n=>n+1);expect(store.getSnapshot()).toBe(2);expect(listener).toHaveBeenCalledOnce();off();store.set(3);expect(listener).toHaveBeenCalledOnce();});
