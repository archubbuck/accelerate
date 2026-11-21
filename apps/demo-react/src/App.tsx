import { useEffect, useState } from "react";
import { Can, useAuthorization } from "@accelerate/authorization-react";
type Person = { id: string; name: string; role: string };
type Document = { id: string; title: string; body: string; status: string };
type Decision = { allowed: boolean; permission: string; reason: string; matchedRoles: string[] };
type AdminState = { roles: { id: string; key: string; active: boolean }[]; grants: { role_id: string; permission_key: string }[]; assignments: { user_id: string; role_id: string }[] };
const api = async (path: string, init?: RequestInit) => {
  const response = await fetch("/api" + path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
};
const json = (method: string, data?: unknown): RequestInit => ({ method, body: data === undefined ? undefined : JSON.stringify(data) });
export function App() {
  const auth = useAuthorization();
  const [users, setUsers] = useState<Person[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [catalog, setCatalog] = useState<Record<string,string>>({});
  const [permission, setPermission] = useState("documents.approve");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [admin, setAdmin] = useState<AdminState | null>(null);
  const [audit, setAudit] = useState<unknown[]>([]);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("documents");
  useEffect(() => { void api("/demo/users").then(setUsers).catch(e => setMessage(String(e))); void api("/authorization/permissions").then(setCatalog).catch(() => {}); }, []);
  useEffect(() => { if (auth.status !== "ready") { setDocuments([]); setAdmin(null); return; } void reload(); }, [auth.status, auth.userId, auth.permissions.join(",")]);
  async function reload() {
    try {
      setCatalog(await api("/authorization/permissions"));
      if (auth.can("documents.read")) setDocuments(await api("/documents"));
      if (auth.can("administration.manage")) setAdmin(await api("/admin/roles"));
      if (auth.can("administration.audit")) setAudit(await api("/admin/audit"));
    } catch (e) { setMessage(String(e)); }
  }
  async function action(fn: () => Promise<unknown>) {
    try { await fn(); setMessage("Operation completed"); await auth.refresh(); await reload(); }
    catch (e) { setMessage(String(e)); }
  }
  async function switchUser(userId: string) {
    try { await api("/demo/session", json("POST", { userId })); await auth.refresh(); setDecision(null); setMessage(""); }
    catch (e) { setMessage(String(e)); }
  }
  return <div className="shell">
    <aside><h1>◈ AccessLab</h1><p>React · published npm packages</p><nav>{["documents","permissions","administration","audit"].map(name => <button key={name} className={tab === name ? "selected" : ""} onClick={() => setTab(name)}>{name}</button>)}</nav><small>Authorization is enforced by the API, not by hidden buttons.</small></aside>
    <main><header><div><h2>{tab[0].toUpperCase()+tab.slice(1)}</h2><span className="muted">Explore dynamic RBAC decisions</span></div><label>Demo identity <select value={auth.userId ?? ""} onChange={e => void switchUser(e.target.value)}><option value="">Choose a user</option>{users.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label></header>
      {message && <p className="notice" role="status">{message} <button onClick={() => setMessage("")}>×</button></p>}
      <section className="summary"><div><strong>Status</strong><span>{auth.status}</span></div><div><strong>User</strong><span>{auth.userId ?? "Not selected"}</span></div><div><strong>Roles</strong><span>{auth.roles.join(", ") || "None"}</span></div><div><strong>Permissions</strong><span>{auth.permissions.length}</span></div></section>
      {tab === "documents" && <section className="card"><h3>Document workspace</h3><Can permission="documents.create"><button onClick={() => { const title = prompt("Document title"); if (title) void action(() => api("/documents", json("POST", { title }))); }}>+ New document</button></Can><div className="grid">{documents.map(doc => <article key={doc.id}><span className="tag">{doc.status}</span><h3>{doc.title}</h3><p>{doc.body}</p><Can permission="documents.edit"><button onClick={() => { const title = prompt("Rename document",doc.title); if (title) void action(() => api("/documents/"+doc.id,json("PATCH",{title,body:doc.body}))); }}>Edit</button></Can><Can permission="documents.approve"><button onClick={() => void action(() => api("/documents/"+doc.id+"/approve",json("POST")))}>Approve</button></Can><Can permission="documents.delete"><button onClick={() => void action(() => api("/documents/"+doc.id,json("DELETE")))}>Delete</button></Can></article>)}</div>{!auth.can("documents.read") && <p>Choose an identity with document access.</p>}</section>}
      {tab === "permissions" && <section className="card"><h3>Effective permission matrix</h3><table><thead><tr><th>Permission</th><th>Description</th><th>Access</th></tr></thead><tbody>{Object.entries(catalog).map(([key,desc]) => <tr key={key}><td><code>{key}</code></td><td>{desc}</td><td className={auth.can(key) ? "yes" : "no"}>{auth.can(key) ? "Allowed" : "Denied"}</td></tr>)}</tbody></table><h3>Decision inspector</h3><select value={permission} onChange={e => setPermission(e.target.value)}>{Object.keys(catalog).map(p => <option key={p}>{p}</option>)}</select> <button onClick={() => void action(async () => setDecision(await api("/authorization/evaluate",json("POST",{permission}))))}>Evaluate</button>{decision && <pre>{JSON.stringify(decision,null,2)}</pre>}</section>}
      {tab === "administration" && <section className="card"><h3>Roles and grants</h3>{admin ? <><button onClick={() => { const key = prompt("New role key"); if (key?.trim()) void action(() => api("/admin/roles", json("POST", { id: key.trim(), key: key.trim(), name: key.trim() }))); }}>+ Create role</button>{admin.roles.map(role => <article key={role.id}><h3>{role.key} · {role.active ? "Active" : "Inactive"}</h3><p>{admin.grants.filter(g => g.role_id === role.id).map(g => g.permission_key).join(", ") || "No grants"}</p><button onClick={() => void action(() => api("/admin/roles/"+role.id+"/status",json("PATCH",{active:!role.active})))}>{role.active ? "Deactivate" : "Activate"}</button><button onClick={() => { const permission = prompt("Permission to grant"); if (permission) void action(() => api("/admin/roles/"+role.id+"/permissions",json("POST",{permission}))); }}>Grant permission</button><button onClick={() => { const permission = prompt("Permission to revoke"); if (permission) void action(() => api("/admin/roles/"+role.id+"/permissions/"+encodeURIComponent(permission),json("DELETE"))); }}>Revoke permission</button></article>)}<h3>User assignments</h3>{users.map(p => <article key={p.id}>{p.name}: {admin.assignments.filter(a=>a.user_id===p.id).map(a=>a.role_id).join(", ")} <button onClick={() => {const roleId=prompt("Role ID to assign");if(roleId)void action(()=>api("/admin/users/"+p.id+"/roles",json("POST",{roleId})));}}>Assign</button><button onClick={() => {const roleId=prompt("Role ID to remove");if(roleId)void action(()=>api("/admin/users/"+p.id+"/roles/"+encodeURIComponent(roleId),json("DELETE")));}}>Remove</button></article>)}</> : <p>Administrator access required.</p>}</section>}
      {tab === "audit" && <section className="card"><h3>Administrative audit trail</h3>{auth.can("administration.audit") ? <pre>{JSON.stringify(audit,null,2)}</pre> : <p>Audit access required.</p>}</section>}
    </main></div>;
}
