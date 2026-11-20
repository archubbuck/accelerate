import { computed, Directive, effect, EnvironmentProviders, inject, Injectable, InjectionToken, input, makeEnvironmentProviders, signal, TemplateRef, ViewContainerRef } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";

export interface AuthorizationSnapshot {
  userId: string;
  roles: readonly string[];
  permissions: readonly string[];
}
export interface AuthorizationConfig {
  endpoint?: string;
  loader?: () => Promise<AuthorizationSnapshot>;
}
export type AuthorizationStatus = "idle" | "loading" | "ready" | "error";
export const AUTHORIZATION_CONFIG = new InjectionToken<AuthorizationConfig>("ACCELERATE_AUTHORIZATION_CONFIG");

@Injectable()
export class AuthorizationService {
  private readonly config = inject(AUTHORIZATION_CONFIG);
  private readonly http = inject(HttpClient, { optional: true });
  private readonly state = signal<{ status: AuthorizationStatus; userId: string | null; permissions: readonly string[]; roles: readonly string[] }>({
    status: "idle", userId: null, permissions: [], roles: []
  });
  private requestVersion = 0;
  readonly status = computed(() => this.state().status);
  readonly userId = computed(() => this.state().userId);
  readonly permissions = computed(() => this.state().permissions);
  readonly roles = computed(() => this.state().roles);
  can(permission: string) { return computed(() => this.status() === "ready" && this.permissions().includes(permission)); }
  canAny(permissions: readonly string[]) { return computed(() => this.status() === "ready" && permissions.some(p => this.permissions().includes(p))); }
  canAll(permissions: readonly string[]) { return computed(() => this.status() === "ready" && permissions.length > 0 && permissions.every(p => this.permissions().includes(p))); }
  async refresh(): Promise<void> {
    const version = ++this.requestVersion;
    this.state.set({ status: "loading", userId: null, permissions: [], roles: [] });
    try {
      const snapshot = this.config.loader
        ? await this.config.loader()
        : await this.loadFromEndpoint();
      if (version !== this.requestVersion) return;
      if (!snapshot || typeof snapshot.userId !== "string" || !snapshot.userId.trim() ||
        !Array.isArray(snapshot.roles) || !snapshot.roles.every((role: unknown) => typeof role === "string" && !!role.trim()) ||
        !Array.isArray(snapshot.permissions) || !snapshot.permissions.every((permission: unknown) => typeof permission === "string" && !!permission.trim())) {
        throw new Error("Invalid authorization snapshot");
      }
      this.state.set({ status: "ready", userId: snapshot.userId, permissions: [...snapshot.permissions], roles: [...snapshot.roles] });
    } catch (error) {
      if (version !== this.requestVersion) return;
      this.state.set({ status: "error", userId: null, permissions: [], roles: [] });
      throw error;
    }
  }
  private loadFromEndpoint(): Promise<AuthorizationSnapshot> {
    if (!this.http) throw new Error("provideHttpClient() is required when using an authorization endpoint");
    return firstValueFrom(this.http.get<AuthorizationSnapshot>(this.config.endpoint!));
  }
  reset(): void {
    ++this.requestVersion;
    this.state.set({ status: "idle", userId: null, permissions: [], roles: [] });
  }
}
export function provideAuthorization(config: AuthorizationConfig): EnvironmentProviders {
  if (!config || (typeof config.loader !== "function" && (typeof config.endpoint !== "string" || !config.endpoint.trim()))) throw new Error("Authorization requires endpoint or loader");
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
