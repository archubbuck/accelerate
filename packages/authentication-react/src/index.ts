import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthenticationContext } from "@accelerate/authentication-core";
export interface AuthenticationClient { getContext(): Promise<AuthenticationContext | undefined>; signOut(): Promise<void>; }
export interface AuthenticationState { readonly context?: AuthenticationContext; readonly loading: boolean; readonly error?: Error; readonly refresh: () => Promise<void>; readonly signOut: () => Promise<void>; }
const Context = createContext<AuthenticationState | undefined>(undefined);
export function AuthenticationProvider(props: { client: AuthenticationClient; children: ReactNode }) {
  const [context, setContext] = useState<AuthenticationContext | undefined>(); const [loading, setLoading] = useState(true); const [error, setError] = useState<Error | undefined>();
  useEffect(() => { let active = true; setLoading(true); setContext(undefined); setError(undefined); props.client.getContext().then(value => { if (active) setContext(value); }, cause => { if (active) setError(cause instanceof Error ? cause : new Error(String(cause))); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [props.client]);
  async function refresh() { setLoading(true); setError(undefined); try { setContext(await props.client.getContext()); } catch (cause) { setError(cause instanceof Error ? cause : new Error(String(cause))); throw cause; } finally { setLoading(false); } }
  async function signOut() { await props.client.signOut(); setContext(undefined); }
  return createElement(Context.Provider, { value: { context, loading, error, refresh, signOut } }, props.children);
}
export function useAuthentication(): AuthenticationState { const state = useContext(Context); if (!state) throw new Error("useAuthentication requires AuthenticationProvider"); return state; }
