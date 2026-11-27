import { expect, it, vi } from "vitest";
import { issueApiKey } from "./index.js";
import { createServiceCredentials, type ServiceCredentialStore } from "./service.js";

const principal = { id: "svc_example", tenantId: "tenant-a", name: "Reconciler", active: true };
const clock = new Date("2026-01-01T00:00:00Z");
const expiry = new Date(clock.getTime() + 1000);

function fixture() {
  const key = issueApiKey(principal.id, clock, expiry);
  const credential = { ...key.record, permissions: ["transactions.read", "removed.permission"] };
  const store: ServiceCredentialStore = {
    findPrincipal: vi.fn(async () => principal),
    findCredential: vi.fn(async () => credential),
    getByPrefix: vi.fn(async () => [credential]),
    addPrincipal: vi.fn(),
    issue: vi.fn(async () => true),
    rotate: vi.fn(async () => true),
    revoke: vi.fn(async () => true),
    deactivate: vi.fn(async () => true),
    recordUse: vi.fn(async () => principal),
  };
  const service = createServiceCredentials({
    store, permissions: ["transactions.read"],
    authorize: async actor => actor === "operator", now: () => clock,
  });
  return { key, credential, store, service };
}

it("authenticates an independent principal with current credential permissions and no secret fields", async () => {
  const { service, store, key } = fixture();
  expect(await service.authenticate(`Bearer ${key.token}`)).toEqual({
    principal, credentialId: key.record.id, permissions: ["transactions.read"],
  });
  expect(store.recordUse).toHaveBeenCalledWith(key.record.id, clock);
  expect(await service.authenticate("Bearer invalid")).toBeUndefined();
  expect(store.getByPrefix).toHaveBeenCalledOnce();
  vi.mocked(store.recordUse).mockResolvedValueOnce(undefined);
  expect(await service.authenticate(`Bearer ${key.token}`)).toBeUndefined();
});

it("authorizes issuance and persists just the hash", async () => {
  const { service, store } = fixture();
  await expect(service.issue("other", principal.id, ["transactions.read"], expiry)).rejects.toThrow("not authorized");
  await expect(service.issue("operator", principal.id, ["transactions.write"], expiry)).rejects.toThrow("registered permissions");
  const created = await service.issue("operator", principal.id, ["transactions.read"], expiry);
  expect(store.issue).toHaveBeenCalledWith("operator", expect.objectContaining({
    id: created.credentialId, hash: expect.stringMatching(/^[a-f0-9]{64}$/), permissions: ["transactions.read"],
  }));
  expect(JSON.stringify(vi.mocked(store.issue).mock.calls)).not.toContain(created.token);
});
