import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
export interface AuthorizationSnapshot { userId: string; roles: readonly string[]; permissions: readonly string[]; }
export interface AuthorizationClient { load(): Promise<AuthorizationSnapshot>; }
type AuthorizationState = { status: "idle" | "loading" | "ready" | "error"; userId: string | null; permissions: readonly string[]; roles: readonly string[] };
type AuthorizationContextValue = AuthorizationState & {
  can(permission: string): boolean;
  canAny(permissions: readonly string[]): boolean;
  canAll(permissions: readonly string[]): boolean;
  refresh(): Promise<void>;
  reset(): void;
};
const empty: AuthorizationState = { status: "idle", userId: null, permissions: [], roles: [] };
const Context = createContext<AuthorizationContextValue | null>(null);
export function AuthorizationProvider({ client, children }: { client: AuthorizationClient; children: ReactNode }) {
  const [state, setState] = useState<AuthorizationState>(empty);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setState({ ...empty, status: "loading" });
    try {
      const snapshot = await client.load();
      if (request !== generation.current) return;
      if (!snapshot || typeof snapshot.userId !== "string" || !snapshot.userId.trim() || !Array.isArray(snapshot.roles) || !snapshot.roles.every((r: unknown) => typeof r === "string" && !!r.trim()) || !Array.isArray(snapshot.permissions) || !snapshot.permissions.every((p: unknown) => typeof p === "string" && !!p.trim())) {
        throw new Error("Invalid authorization snapshot");
      }
      setState({ status: "ready", userId: snapshot.userId, permissions: [...snapshot.permissions], roles: [...snapshot.roles] });
    } catch (error) {
      if (request !== generation.current) return;
      setState({ ...empty, status: "error" });
      throw error;
    }
  }, [client]);
  const reset = useCallback(() => {
    ++generation.current;
    setState(empty);
  }, []);
  useEffect(() => {
    void refresh().catch(() => undefined);
    return () => { ++generation.current; };
  }, [refresh]);
  const value = useMemo<AuthorizationContextValue>(() => {
    const can = (permission: string) => state.status === "ready" && state.permissions.includes(permission);
    return { ...state, can, canAny: ps => state.status === "ready" && ps.some(can), canAll: ps => state.status === "ready" && ps.length > 0 && ps.every(can), refresh, reset };
  }, [state, refresh, reset]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuthorization() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthorizationProvider is missing");
  return value;
}
export function usePermission(permission: string) { return useAuthorization().can(permission); }
export function Can({ permission, anyOf, allOf, children, fallback = null }: {
  permission?: string; anyOf?: readonly string[]; allOf?: readonly string[];
  children: ReactNode; fallback?: ReactNode;
}) {
  const auth = useAuthorization();
  const allowed = permission ? auth.can(permission) : anyOf ? auth.canAny(anyOf) : allOf ? auth.canAll(allOf) : false;
  return <>{allowed ? children : fallback}</>;
}
