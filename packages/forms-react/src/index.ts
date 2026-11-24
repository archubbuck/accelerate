import {useSyncExternalStore} from "react";
import type {createForm} from "@accelerate/forms-core";
export function useFormSnapshot<T extends object>(source:ReturnType<typeof createForm<T>>){return useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot);}
