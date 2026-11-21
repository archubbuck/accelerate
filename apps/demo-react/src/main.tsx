import React from "react";
import { createRoot } from "react-dom/client";
import { AuthorizationProvider } from "@accelerate/authorization-react";
import { App } from "./App";
import "./style.css";
const client = { async load() {
  const response = await fetch("/api/authorization/me", { credentials: "include" });
  if (!response.ok) throw new Error("Select an identity to load permissions");
  return response.json();
} };
createRoot(document.getElementById("root")!).render(<React.StrictMode><AuthorizationProvider client={client}><App /></AuthorizationProvider></React.StrictMode>);
