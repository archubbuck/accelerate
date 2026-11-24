import {signal,type DestroyRef} from "@angular/core";
import type {createTable} from "@accelerate/tables-core";
export function toTableSignal<T>(source:ReturnType<typeof createTable<T>>,destroyRef:DestroyRef){const value=signal(source.getSnapshot());const unsubscribe=source.subscribe(()=>value.set(source.getSnapshot()));destroyRef.onDestroy(unsubscribe);return value.asReadonly();}
