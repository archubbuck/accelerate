import { expect, it, vi } from "vitest";
import { createNotificationDelivery, NotificationTransportError, type DeliveryRecord, type NotificationStore } from "./notifications.js";
import { createEmailNotificationTransport } from "./notifications-email.js";
import { createWebhookNotificationTransport, verifyNotificationWebhook } from "./notifications-webhook.js";

const delivery: DeliveryRecord = {
  id: "delivery-1", recipientId: "recipient", channel: "email", templateId: "template",
  content: { subject: "Update", text: "Delivered" }, status: "sending", attempts: 1,
};

it("rechecks preferences, passes an idempotency key, and records sanitized retry status", async () => {
  const store: NotificationStore = { schedule: vi.fn(), claim: vi.fn(async () => delivery), settle: vi.fn(async () => true), inspect: vi.fn() };
  const send = vi.fn().mockRejectedValueOnce(new Error("recipient-secret")).mockResolvedValueOnce(undefined);
  const service = createNotificationDelivery({
    store, maxAttempts: 2, transports: { email: createEmailNotificationTransport({ send }) },
    resolveDestination: async () => ({ channel: "email", address: "test@example.com" }),
  });
  const signal = new AbortController().signal;
  await expect(service.process(delivery.id, 1, signal)).rejects.toBeInstanceOf(NotificationTransportError);
  expect(store.settle).toHaveBeenCalledWith(delivery.id, 1, "pending", "retryable-transport-error");
  expect(JSON.stringify(vi.mocked(store.settle).mock.calls)).not.toContain("recipient-secret");
  await service.process(delivery.id, 2, signal);
  expect(store.settle).toHaveBeenCalledWith(delivery.id, 2, "sent", "delivered");
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ idempotencyKey: delivery.id, to: "test@example.com" }));
});

it("signs exact webhook content and rejects tampering, expired timestamps and untrusted origins", async () => {
  const now = () => 1_000_000_000;
  const secret = "0123456789abcdef".repeat(3);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  const webhook = createWebhookNotificationTransport({ allowedOrigins: ["https://trusted.example"], secret, fetch: fetcher, now });
  const signal = new AbortController().signal;
  await webhook.send({ ...delivery, channel: "webhook" }, { channel: "webhook", url: new URL("https://trusted.example/notice") }, signal);
  const init = fetcher.mock.calls[0][1]!;
  const headers = new Headers(init.headers);
  const verification = {
    secret, now, body: String(init.body), deliveryId: headers.get("x-accelerate-delivery")!,
    timestamp: headers.get("x-accelerate-timestamp")!, signature: headers.get("x-accelerate-signature")!,
  };
  expect(init.redirect).toBe("manual");
  expect(await verifyNotificationWebhook(verification)).toBe(true);
  expect(await verifyNotificationWebhook({ ...verification, body: "tampered" })).toBe(false);
  expect(await verifyNotificationWebhook({ ...verification, now: () => now() + 301_000 })).toBe(false);
  await expect(webhook.send(delivery, { channel: "webhook", url: new URL("https://untrusted.example/") }, signal))
    .rejects.toMatchObject({ retryable: false });
  expect(fetcher).toHaveBeenCalledOnce();
});
