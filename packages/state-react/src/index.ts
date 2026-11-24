import {useSyncExternalStore} from "react";
import type {Store} from "@accelerate/state-core";
export function useStoreSnapshot<T>(source:Store<T>){return useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot);}
