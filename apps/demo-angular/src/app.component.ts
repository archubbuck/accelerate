import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { AuthCanDirective, AuthorizationService } from "@accelerate/authorization-angular";
type Person = { id: string; name: string; role: string };
type Document = { id: string; title: string; body: string; status: string };
type Admin = { roles: { id: string; key: string; active: boolean }[]; grants: { role_id: string; permission_key: string }[]; assignments: { user_id: string; role_id: string }[] };
@Component({
  selector: "app-root", standalone: true, imports: [CommonModule, AuthCanDirective],
  template: `
  <div class="shell"><aside><h1>◈ AccessLab</h1><p>Angular · published npm packages</p><nav><button *ngFor="let item of tabs" (click)="tab.set(item)" [class.selected]="tab() === item">{{item}}</button></nav><small>The API enforces permissions independently of this UI.</small></aside>
  <main><header><div><h2>{{tab() | titlecase}}</h2><span>Explore dynamic RBAC decisions</span></div><label>Demo identity <select #identity [value]="auth.userId() ?? ''" (change)="switchUser(identity.value)"><option value="">Choose a user</option><option *ngFor="let person of users()" [value]="person.id">{{person.name}} · {{person.role}}</option></select></label></header>
  <p *ngIf="message()" class="notice" role="status">{{message()}} <button (click)="message.set('')">×</button></p>
  <section class="summary"><div><strong>Status</strong><span>{{auth.status()}}</span></div><div><strong>User</strong><span>{{auth.userId() || 'Not selected'}}</span></div><div><strong>Roles</strong><span>{{auth.roles().join(', ') || 'None'}}</span></div><div><strong>Permissions</strong><span>{{auth.permissions().length}}</span></div></section>
  <section *ngIf="tab() === 'documents'" class="card"><h3>Document workspace</h3><button *authCan="'documents.create'" (click)="create()">+ New document</button><div class="grid"><article *ngFor="let doc of documents()"><small>{{doc.status}}</small><h3>{{doc.title}}</h3><p>{{doc.body}}</p><button *authCan="'documents.edit'" (click)="edit(doc)">Edit</button><button *authCan="'documents.approve'" (click)="perform('/documents/'+doc.id+'/approve','POST')">Approve</button><button *authCan="'documents.delete'" (click)="perform('/documents/'+doc.id,'DELETE')">Delete</button></article></div><p *ngIf="!can('documents.read')">Choose an identity with document access.</p></section>
  <section *ngIf="tab() === 'permissions'" class="card"><h3>Effective permission matrix</h3><table><thead><tr><th>Permission</th><th>Description</th><th>Access</th></tr></thead><tbody><tr *ngFor="let item of catalog() | keyvalue"><td><code>{{item.key}}</code></td><td>{{item.value}}</td><td [class.yes]="can(item.key)" [class.no]="!can(item.key)">{{can(item.key) ? 'Allowed' : 'Denied'}}</td></tr></tbody></table><h3>Decision inspector</h3><select #permission><option *ngFor="let item of catalog() | keyvalue" [value]="item.key">{{item.key}}</option></select><button (click)="evaluate(permission.value)">Evaluate</button><pre *ngIf="decision()">{{decision() | json}}</pre></section>
  <section *ngIf="tab() === 'administration'" class="card"><h3>Roles and grants</h3><ng-container *ngIf="admin() as state; else denied"><article *ngFor="let role of state.roles"><h3>{{role.key}} · {{role.active ? 'Active' : 'Inactive'}}</h3><p><ng-container *ngFor="let grant of state.grants"><span *ngIf="grant.role_id === role.id">{{grant.permission_key}} · </span></ng-container></p><button (click)="perform('/admin/roles/'+role.id+'/status','PATCH',{active:!role.active})">{{role.active ? 'Deactivate' : 'Activate'}}</button><button (click)="grant(role.id)">Grant</button><button (click)="revoke(role.id)">Revoke</button></article><h3>User assignments</h3><article *ngFor="let person of users()">{{person.name}} <span *ngFor="let assignment of state.assignments"><span *ngIf="assignment.user_id === person.id">{{assignment.role_id}} </span></span><button (click)="assign(person.id)">Assign</button><button (click)="unassign(person.id)">Remove</button></article></ng-container><ng-template #denied>Administrator access required.</ng-template></section>
  <section *ngIf="tab() === 'audit'" class="card"><h3>Administrative audit trail</h3><pre *ngIf="can('administration.audit'); else deniedAudit">{{audit() | json}}</pre><ng-template #deniedAudit>Audit access required.</ng-template></section>
  </main></div>`
})
export class AppComponent implements OnInit {
  readonly auth = inject(AuthorizationService);
  private readonly http = inject(HttpClient);
  readonly tabs = ["documents", "permissions", "administration", "audit"];
  readonly tab = signal("documents");
  readonly users = signal<Person[]>([]);
  readonly documents = signal<Document[]>([]);
  readonly catalog = signal<Record<string,string>>({});
  readonly admin = signal<Admin | null>(null);
  readonly audit = signal<unknown[]>([]);
  readonly decision = signal<unknown>(null);
  readonly message = signal("");
  can(permission: string) { return this.auth.status() === "ready" && this.auth.permissions().includes(permission); }
  private request<T>(path: string, method = "GET", body?: unknown) { return firstValueFrom(this.http.request<T>(method, "/api"+path, { body, withCredentials: true })); }
  async ngOnInit() {
    try { this.users.set(await this.request<Person[]>("/demo/users")); } catch(e) { this.message.set(String(e)); }
    // Permission descriptions require a selected identity.
    try { await this.auth.refresh(); await this.reload(); } catch { /* no session yet */ }
  }
  async switchUser(userId: string) {
    if (!userId) return;
    try { await this.request("/demo/session","POST",{userId}); await this.auth.refresh(); await this.reload(); this.message.set(""); }
    catch(e) { this.message.set(String(e)); }
  }
  async reload() {
    try {
      this.catalog.set(await this.request<Record<string,string>>("/authorization/permissions"));
      this.documents.set(this.can("documents.read") ? await this.request<Document[]>("/documents") : []);
      this.admin.set(this.can("administration.manage") ? await this.request<Admin>("/admin/roles") : null);
      this.audit.set(this.can("administration.audit") ? await this.request<unknown[]>("/admin/audit") : []);
    } catch(e) { this.message.set(String(e)); }
  }
  async perform(path: string, method: string, body?: unknown) {
    try { await this.request(path,method,body); await this.auth.refresh(); await this.reload(); this.message.set("Operation completed"); }
    catch(e) { this.message.set(String(e)); }
  }
  create() { const title=prompt("Document title"); if(title)void this.perform("/documents","POST",{title}); }
  edit(doc: Document) { const title=prompt("Rename document",doc.title); if(title)void this.perform("/documents/"+doc.id,"PATCH",{title,body:doc.body}); }
  grant(id: string) { const permission=prompt("Permission to grant"); if(permission)void this.perform("/admin/roles/"+id+"/permissions","POST",{permission}); }
  revoke(id: string) { const permission=prompt("Permission to revoke"); if(permission)void this.perform("/admin/roles/"+id+"/permissions/"+encodeURIComponent(permission),"DELETE"); }
  assign(id: string) { const roleId=prompt("Role ID to assign"); if(roleId)void this.perform("/admin/users/"+id+"/roles","POST",{roleId}); }
  unassign(id: string) { const roleId=prompt("Role ID to remove"); if(roleId)void this.perform("/admin/users/"+id+"/roles/"+encodeURIComponent(roleId),"DELETE"); }
  async evaluate(permission: string) { try { this.decision.set(await this.request("/authorization/evaluate","POST",{permission})); } catch(e) { this.message.set(String(e)); } }
}
