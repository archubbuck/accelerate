import {useSyncExternalStore} from "react";
import type {createTable} from "@accelerate/tables-core";
export function useTableSnapshot<T>(source:ReturnType<typeof createTable<T>>){return useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot);}
