import { definePermissions } from "@accelerate/authorization-core";
export const registry = definePermissions({
  documents: { read: "Read documents", create: "Create documents", edit: "Edit documents", delete: "Delete documents", approve: "Approve documents" },
  reports: { read: "Read reports" },
  users: { read: "View users" },
  administration: { manage: "Manage roles and assignments", audit: "Read audit history" }
});
export type DemoPermission = (typeof registry.keys)[number];
export const people = [
  { id: "alice", name: "Alice", role: "viewer" },
  { id: "bob", name: "Bob", role: "editor" },
  { id: "carol", name: "Carol", role: "manager" },
  { id: "david", name: "David", role: "administrator" },
  { id: "erin", name: "Erin", role: "auditor" }
] as const;
export const grants: Record<string, readonly DemoPermission[]> = {
  viewer: ["documents.read"],
  editor: ["documents.read", "documents.create", "documents.edit"],
  manager: ["documents.read", "documents.create", "documents.edit", "documents.approve", "reports.read"],
  administrator: ["documents.read", "documents.create", "documents.edit", "documents.delete", "documents.approve", "reports.read", "users.read", "administration.manage", "administration.audit"],
  auditor: ["documents.read", "administration.audit"]
};
