import { computed, Directive, effect, EnvironmentProviders, inject, Injectable, InjectionToken, input, makeEnvironmentProviders, TemplateRef, ViewContainerRef } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";

export interface AuthorizationSnapshot { userId: string; roles: string[]; permissions: string[]; }
export interface AuthorizationConfig {
  endpoint?: string;
  loader?: () => Promise<AuthorizationSnapshot>;
}
export const AUTHORIZATION_CONFIG = new InjectionToken<AuthorizationConfig>("DEVKIT_AUTHORIZATION_CONFIG");
@Injectable()
export class AuthorizationService {
  private readonly config = inject(AUTHORIZATION_CONFIG);
  private readonly http = inject(HttpClient);
  private readonly state = signalState();
  readonly status = computed(() => this.state().status);
  readonly permissions = computed(() => this.state().permissions);
  readonly roles = computed(() => this.state().roles);
  can(permission: string) { return computed(() => this.status() === "ready" && this.permissions().includes(permission)); }
  canAny(permissions: readonly string[]) { return computed(() => this.status() === "ready" && permissions.some(p => this.permissions().includes(p))); }
  canAll(permissions: readonly string[]) { return computed(() => this.status() === "ready" && permissions.every(p => this.permissions().includes(p))); }
  async refresh() {
    this.state.set({ status: "loading", permissions: [], roles: [] });
    try {
      const snapshot = this.config.loader
        ? await this.config.loader()
        : await firstValueFrom(this.http.get<AuthorizationSnapshot>(this.config.endpoint!));
      this.state.set({ status: "ready", permissions: snapshot.permissions, roles: snapshot.roles });
    } catch (error) {
      this.state.set({ status: "error", permissions: [], roles: [] });
      throw error;
    }
  }
  reset() { this.state.set({ status: "idle", permissions: [], roles: [] }); }
}
import { signal } from "@angular/core";
function signalState() {
  return signal<{ status: "idle" | "loading" | "ready" | "error"; permissions: string[]; roles: string[] }>({
    status: "idle", permissions: [], roles: []
  });
}
export function provideAuthorization(config: AuthorizationConfig): EnvironmentProviders {
  if (!config.loader && !config.endpoint) throw new Error("Authorization requires endpoint or loader");
  return makeEnvironmentProviders([
    { provide: AUTHORIZATION_CONFIG, useValue: config },
    AuthorizationService
  ]);
}
@Directive({ selector: "[authCan]", standalone: true })
export class AuthCanDirective {
  readonly authCan = input.required<string>();
  private readonly auth = inject(AuthorizationService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly view = inject(ViewContainerRef);
  private visible = false;
  constructor() {
    effect(() => {
      const allowed = this.auth.status() === "ready" && this.auth.permissions().includes(this.authCan());
      if (allowed && !this.visible) { this.view.createEmbeddedView(this.template); this.visible = true; }
      else if (!allowed && this.visible) { this.view.clear(); this.visible = false; }
    });
  }
}
