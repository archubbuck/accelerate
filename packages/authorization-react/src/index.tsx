import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
export interface AuthorizationSnapshot { userId: string; roles: string[]; permissions: string[]; }
export interface AuthorizationClient { load(): Promise<AuthorizationSnapshot>; }
type AuthorizationState = { status: "idle" | "loading" | "ready" | "error"; permissions: readonly string[]; roles: readonly string[] };
type AuthorizationContextValue = AuthorizationState & {
  can(permission: string): boolean;
  canAny(permissions: readonly string[]): boolean;
  canAll(permissions: readonly string[]): boolean;
  refresh(): Promise<void>;
};
const Context = createContext<AuthorizationContextValue | null>(null);
export function AuthorizationProvider({ client, children }: { client: AuthorizationClient; children: ReactNode }) {
  const [state, setState] = useState<AuthorizationState>({ status: "idle", permissions: [], roles: [] });
  const refresh = useCallback(async () => {
    setState({ status: "loading", permissions: [], roles: [] });
    try {
      const snapshot = await client.load();
      setState({ status: "ready", permissions: snapshot.permissions, roles: snapshot.roles });
    } catch (error) {
      setState({ status: "error", permissions: [], roles: [] });
      throw error;
    }
  }, [client]);
  useEffect(() => {
    let active = true;
    setState({ status: "loading", permissions: [], roles: [] });
    client.load().then(snapshot => {
      if (active) setState({ status: "ready", permissions: snapshot.permissions, roles: snapshot.roles });
    }).catch(() => {
      if (active) setState({ status: "error", permissions: [], roles: [] });
    });
    return () => { active = false; };
  }, [client]);
  const value = useMemo<AuthorizationContextValue>(() => {
    const can = (permission: string) => state.status === "ready" && state.permissions.includes(permission);
    return { ...state, can, canAny: ps => ps.some(can), canAll: ps => ps.every(can), refresh };
  }, [state, refresh]);
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
