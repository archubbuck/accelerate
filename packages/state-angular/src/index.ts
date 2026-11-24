import {signal,type DestroyRef} from "@angular/core";
import type {Store} from "@accelerate/state-core";
export function toStoreSignal<T>(source:Store<T>,destroyRef:DestroyRef){const value=signal(source.getSnapshot());const unsubscribe=source.subscribe(()=>value.set(source.getSnapshot()));destroyRef.onDestroy(unsubscribe);return value.asReadonly();}
