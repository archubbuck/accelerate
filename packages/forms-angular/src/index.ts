import {signal,type DestroyRef} from "@angular/core";
import type {createForm} from "@accelerate/forms-core";
export function toFormSignal<T extends object>(source:ReturnType<typeof createForm<T>>,destroyRef:DestroyRef){const value=signal(source.getSnapshot());const unsubscribe=source.subscribe(()=>value.set(source.getSnapshot()));destroyRef.onDestroy(unsubscribe);return value.asReadonly();}
