import { InjectionToken, Injectable, inject, signal } from "@angular/core";
import type { AuthenticationContext } from "@accelerate/authentication-core";
export interface AuthenticationClient { getContext(): Promise<AuthenticationContext | undefined>; signOut(): Promise<void>; }
export const AUTHENTICATION_CLIENT = new InjectionToken<AuthenticationClient>("ACCELERATE_AUTHENTICATION_CLIENT");
@Injectable({ providedIn: "root" })
export class AuthenticationService {
  private readonly client = inject(AUTHENTICATION_CLIENT);
  readonly context = signal<AuthenticationContext | undefined>(undefined);
  readonly loading = signal(false);
  readonly error = signal<Error | undefined>(undefined);
  async refresh(): Promise<void> { this.loading.set(true); this.error.set(undefined); try { this.context.set(await this.client.getContext()); } catch (cause) { this.error.set(cause instanceof Error ? cause : new Error(String(cause))); throw cause; } finally { this.loading.set(false); } }
  async signOut(): Promise<void> { await this.client.signOut(); this.context.set(undefined); }
}
