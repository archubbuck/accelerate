/** Authentication identity and session contracts. Authorization remains a separate concern. */
export interface Identity { readonly id: string; readonly email?: string; readonly displayName?: string; }
export interface Session { readonly id: string; readonly identityId: string; readonly createdAt: Date; readonly expiresAt: Date; }
export interface SessionStore { get(id: string): Promise<Session | undefined>; put(session: Session): Promise<void>; revoke(id: string): Promise<void>; }
export interface IdentityStore { getById(id: string): Promise<Identity | undefined>; getByEmail(email: string): Promise<Identity | undefined>; }
export interface AuthenticationContext { readonly identity: Identity; readonly session: Session; }
export interface Clock { now(): Date; }
export const systemClock: Clock = { now: () => new Date() };
export function isSessionActive(session: Session, now = new Date()): boolean { return session.createdAt.getTime() <= now.getTime() && session.expiresAt.getTime() > now.getTime(); }
export function createAuthenticator(options: { identities: IdentityStore; sessions: SessionStore; clock?: Clock }) {
  const clock = options.clock ?? systemClock;
  return {
    async authenticate(sessionId: string): Promise<AuthenticationContext | undefined> {
      if (!sessionId) return undefined;
      const session = await options.sessions.get(sessionId);
      if (!session || !isSessionActive(session, clock.now())) return undefined;
      const identity = await options.identities.getById(session.identityId);
      return identity ? { identity, session } : undefined;
    },
    async revoke(sessionId: string): Promise<void> { await options.sessions.revoke(sessionId); }
  };
}
export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();
  async get(id: string) { const session = this.sessions.get(id); return session && { ...session }; }
  async put(session: Session) { if (!session.id || !session.identityId || !Number.isFinite(session.createdAt.getTime()) || !Number.isFinite(session.expiresAt.getTime()) || session.expiresAt <= session.createdAt) throw new TypeError("Invalid session"); this.sessions.set(session.id, { ...session }); }
  async revoke(id: string) { this.sessions.delete(id); }
}
