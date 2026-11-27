import { expect, it, vi } from "vitest";
import {
  composeMiddleware,
  HttpValidationError,
  redactHttpHeaders,
  withAuthorization,
  withCorrelationId,
  withHttpDeadline,
  withHttpValidation,
  type HttpRequest,
} from "./index.js";

it("propagates correlation, credentials and deadlines in middleware order", async () => {
  const request = { method: "POST", url: "/", headers: { Authorization: "outdated", "X-Request-Id": "caller" } };
  const token = vi.fn(async () => "Bearer secret");
  let received: HttpRequest | undefined;
  const transport = composeMiddleware({
    async send<T>(input: HttpRequest) {
      received = input;
      return { status: 200, headers: { "X-Request-Id": "other" }, body: undefined as T };
    },
  }, [withCorrelationId(), withAuthorization(token), withHttpDeadline(2000)]);
  const result = await transport.send(request);
  expect(token.mock.calls).toHaveLength(1);
  expect(received?.headers).toEqual({ authorization: "Bearer secret", "x-request-id": "caller" });
  expect(received?.signal?.aborted).toBe(false);
  expect(result.headers).toEqual({ "x-request-id": "caller" });
  expect(request.headers.Authorization).toBe("outdated");
});

it("rejects bad bodies with directional typed errors", async () => {
  const middleware = withHttpValidation({
    request: { safeParse: value => typeof value === "string" ? { success: true, data: value.trim() } : { success: false, issues: ["type"] } },
    response: { safeParse: () => ({ success: false, error: { issues: ["response"] } }) },
  });
  const next = vi.fn(async () => ({ status: 200, headers: {}, body: null }));
  const request = { method: "POST", url: "/" };
  await expect(middleware({ ...request, body: 7 }, next)).rejects.toBeInstanceOf(HttpValidationError);
  expect(next).not.toHaveBeenCalled();
  await expect(middleware({ ...request, body: " text " }, next)).rejects.toMatchObject({ direction: "response", issues: ["response"] });
  expect(next).toHaveBeenCalledWith({ ...request, body: "text" });
});

it("preserves caller abort reasons and redacts headers case-insensitively", async () => {
  const reason = new Error("caller");
  const next = vi.fn();
  await expect(withHttpDeadline(1000)({ method: "GET", url: "/", signal: AbortSignal.abort(reason) }, next)).rejects.toBe(reason);
  expect(next).not.toHaveBeenCalled();
  expect(redactHttpHeaders({ AUTHORIZATION: "secret", Cookie: "session", "X-Custom": "key", Accept: "json" }, ["x-custom"]))
    .toEqual({ AUTHORIZATION: "[REDACTED]", Cookie: "[REDACTED]", "X-Custom": "[REDACTED]", Accept: "json" });
});
