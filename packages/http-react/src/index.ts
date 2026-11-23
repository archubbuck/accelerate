import { createContext, createElement, useContext, type ReactNode } from "react";
import type { HttpTransport } from "@accelerate/http-core";
const Context = createContext<HttpTransport | null>(null);
export function HttpProvider({ client, children }: { client: HttpTransport; children: ReactNode }) {
  return createElement(Context.Provider, { value: client }, children);
}
export function useHttpClient(): HttpTransport {
  const client = useContext(Context);
  if (!client) throw new Error("HttpProvider is missing");
  return client;
}
