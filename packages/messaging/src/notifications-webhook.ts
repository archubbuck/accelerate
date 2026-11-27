import { NotificationTransportError, type NotificationTransport } from "./notifications.js";

const encoder = new TextEncoder();
function hex(bytes: Uint8Array) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

async function signingKey(secret: string) {
  if (typeof secret !== "string" || encoder.encode(secret).byteLength < 32) throw new TypeError("Webhook signing secret must contain at least 32 bytes");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function signedBytes(timestamp: string, deliveryId: string, body: string) {
  return encoder.encode(JSON.stringify([timestamp, deliveryId, body]));
}

export async function verifyNotificationWebhook(options: {
  secret: string; timestamp: string; deliveryId: string; signature: string; body: string;
  now?: () => number; toleranceSeconds?: number;
}) {
  if (!/^v1=[0-9a-f]{64}$/.test(options.signature) || !/^\d{1,12}$/.test(options.timestamp)
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(options.deliveryId) || options.body.length > 100_000) return false;
  const tolerance = options.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(tolerance) || tolerance < 1 || tolerance > 900) throw new RangeError("Invalid webhook verification window");
  const now = Math.floor((options.now ?? Date.now)() / 1000);
  if (!Number.isFinite(now) || Math.abs(now - Number(options.timestamp)) > tolerance) return false;
  const digest = new Uint8Array(options.signature.slice(3).match(/../g)!.map(pair => Number.parseInt(pair, 16)));
  return crypto.subtle.verify("HMAC", await signingKey(options.secret), digest, signedBytes(options.timestamp, options.deliveryId, options.body));
}

export function createWebhookNotificationTransport(options: {
  allowedOrigins: readonly string[];
  secret: string;
  fetch?: typeof fetch;
  now?: () => number;
}): NotificationTransport {
  const origins = new Set(options.allowedOrigins.map(value => {
    const url = new URL(value);
    if (url.protocol !== "https:" || value !== url.origin) throw new TypeError("Webhook allowlist requires exact HTTPS origins");
    return url.origin;
  }));
  const fetcher = options.fetch ?? globalThis.fetch;
  return {
    async send(delivery, destination, signal) {
      signal.throwIfAborted();
      if (destination.channel !== "webhook" || destination.url.protocol !== "https:"
        || !origins.has(destination.url.origin) || destination.url.username || destination.url.password || destination.url.hash) {
        throw new NotificationTransportError(false);
      }
      const timestamp = String(Math.floor((options.now ?? Date.now)() / 1000));
      const body = JSON.stringify(delivery.content);
      const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(options.secret), signedBytes(timestamp, delivery.id, body)));
      const response = await fetcher(destination.url, {
        method: "POST", redirect: "manual", body, signal,
        headers: {
          "content-type": "application/json", "x-accelerate-timestamp": timestamp,
          "x-accelerate-delivery": delivery.id, "x-accelerate-signature": "v1=" + hex(signature),
        },
      });
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok) throw new NotificationTransportError(response.status === 429 || response.status >= 500);
    },
  };
}
