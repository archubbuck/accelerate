// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { AuthorizationProvider, Can, useAuthorization, type AuthorizationClient, type AuthorizationSnapshot } from "./index.js";

afterEach(cleanup);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const snapshot = (permissions: string[]): AuthorizationSnapshot => ({ userId: "user", roles: ["reader"], permissions });
function Controls() {
  const auth = useAuthorization();
  return createElement("div", null,
    createElement("span", { "data-testid": "status" }, auth.status),
    createElement("button", { onClick: () => auth.reset() }, "Reset"),
    createElement("button", { onClick: () => { void auth.refresh().catch(() => undefined); } }, "Refresh"),
    createElement(Can, { permission: "documents.read", fallback: createElement("span", null, "Denied") }, "Allowed"),
    createElement(Can, { allOf: [], fallback: createElement("span", null, "All denied") }, "All allowed")
  );
}
function mount(client: AuthorizationClient) {
  return render(createElement(AuthorizationProvider, { client, children: createElement(Controls) }));
}
describe("React authorization provider", () => {
  it("denies until ready and revokes visibility after reset", async () => {
    const pending = deferred<AuthorizationSnapshot>();
    mount({ load: () => pending.promise });
    expect(screen.getByText("Denied")).toBeTruthy();
    expect(screen.getByText("All denied")).toBeTruthy();
    await act(async () => pending.resolve(snapshot(["documents.read"])));
    expect(screen.getByText("Allowed")).toBeTruthy();
    expect(screen.getByText("All denied")).toBeTruthy();
    await act(async () => screen.getByText("Reset").click());
    expect(screen.getByText("Denied")).toBeTruthy();
    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(screen.getByText("All denied")).toBeTruthy();
  });
  it("fails closed on malformed snapshots", async () => {
    mount({ load: vi.fn(async () => ({ userId: "user", roles: ["reader"], permissions: [null] } as unknown as AuthorizationSnapshot)) });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    expect(screen.getByText("Denied")).toBeTruthy();
  });
  it("rejects whitespace-only role and permission identifiers", async () => {
    mount({ load: async () => ({ userId: "user", roles: [" "], permissions: ["documents.read"] }) });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    expect(screen.getByText("Denied")).toBeTruthy();
  });
  it("ignores stale results after reset", async () => {
    const pending = deferred<AuthorizationSnapshot>();
    mount({ load: () => pending.promise });
    await act(async () => screen.getByText("Reset").click());
    await act(async () => pending.resolve(snapshot(["documents.read"])));
    expect(screen.getByText("Denied")).toBeTruthy();
  });
  it("keeps latest refresh when requests complete out of order", async () => {
    const first = deferred<AuthorizationSnapshot>();
    const second = deferred<AuthorizationSnapshot>();
    const load = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    mount({ load });
    await act(async () => screen.getByText("Refresh").click());
    await act(async () => second.resolve(snapshot([])));
    await act(async () => first.resolve(snapshot(["documents.read"])));
    expect(screen.getByText("Denied")).toBeTruthy();
    expect(screen.getByTestId("status").textContent).toBe("ready");
  });
});

it("hides old-scope permissions immediately and rejects a mis-scoped snapshot", async () => {
  const second = deferred<AuthorizationSnapshot>();
  const client = { load: vi.fn().mockResolvedValueOnce({ ...snapshot(["documents.read"]), scopeKey: "tenant-a" })
    .mockImplementationOnce(() => second.promise) };
  const view = (scopeKey: string) => createElement(AuthorizationProvider, { client, scopeKey, children: createElement(Controls) });
  const mounted = render(view("tenant-a"));
  await waitFor(() => expect(screen.getByText("Allowed")).toBeTruthy());
  mounted.rerender(view("tenant-b"));
  expect(screen.getByText("Denied")).toBeTruthy();
  await act(async () => second.resolve({ ...snapshot(["documents.read"]), scopeKey: "tenant-a" }));
  expect(screen.getByText("Denied")).toBeTruthy();
  expect(screen.getByTestId("status").textContent).toBe("error");
  expect(client.load).toHaveBeenLastCalledWith("tenant-b");
});
