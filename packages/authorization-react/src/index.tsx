import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
export interface AuthorizationSnapshot { userId: string; roles: readonly string[]; permissions: readonly string[]; scopeKey?: string; }
export interface AuthorizationClient { load(scopeKey?: string): Promise<AuthorizationSnapshot>; }
type AuthorizationState = { status: "idle" | "loading" | "ready" | "error"; userId: string | null; permissions: readonly string[]; roles: readonly string[]; scopeKey?: string };
type AuthorizationContextValue = AuthorizationState & {
  can(permission: string): boolean;
  canAny(permissions: readonly string[]): boolean;
  canAll(permissions: readonly string[]): boolean;
  refresh(): Promise<void>;
  reset(): void;
};
const empty: AuthorizationState = { status: "idle", userId: null, permissions: [], roles: [] };
const Context = createContext<AuthorizationContextValue | null>(null);
export function AuthorizationProvider({ client, children, scopeKey }: { client: AuthorizationClient; children: ReactNode; scopeKey?: string }) {
  const [state, setState] = useState<AuthorizationState>(empty);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setState({ ...empty, status: "loading", scopeKey });
    try {
      const snapshot = scopeKey === undefined ? await client.load() : await client.load(scopeKey);
      if (request !== generation.current) return;
      if (!snapshot || snapshot.scopeKey !== scopeKey || typeof snapshot.userId !== "string" || !snapshot.userId.trim() || !Array.isArray(snapshot.roles) || !snapshot.roles.every((r: unknown) => typeof r === "string" && !!r.trim()) || !Array.isArray(snapshot.permissions) || !snapshot.permissions.every((p: unknown) => typeof p === "string" && !!p.trim())) {
        throw new Error("Invalid authorization snapshot");
      }
      setState({ status: "ready", userId: snapshot.userId, permissions: [...snapshot.permissions], roles: [...snapshot.roles], scopeKey });
    } catch (error) {
      if (request !== generation.current) return;
      setState({ ...empty, status: "error", scopeKey });
      throw error;
    }
  }, [client, scopeKey]);
  const reset = useCallback(() => {
    ++generation.current;
    setState(empty);
  }, []);
  useEffect(() => {
    void refresh().catch(() => undefined);
    return () => { ++generation.current; };
  }, [refresh]);
  const value = useMemo<AuthorizationContextValue>(() => {
    const current = state.scopeKey === scopeKey ? state : empty;
    const can = (permission: string) => current.status === "ready" && current.permissions.includes(permission);
    return { ...current, can, canAny: ps => current.status === "ready" && ps.some(can), canAll: ps => current.status === "ready" && ps.length > 0 && ps.every(can), refresh, reset };
  }, [state, scopeKey, refresh, reset]);
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
