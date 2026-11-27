import { NotificationTransportError, type NotificationTransport } from "./notifications.js";

export function createEmailNotificationTransport(provider: {
  send(message: { to: string; subject: string; text: string; idempotencyKey: string; signal: AbortSignal }): Promise<void>;
}): NotificationTransport {
  return {
    async send(delivery, destination, signal) {
      signal.throwIfAborted();
      if (destination.channel !== "email" || destination.address.length > 320
        || !/^[^\s@<>]+@[^\s@<>]+$/.test(destination.address)) throw new NotificationTransportError(false);
      await provider.send({
        to: destination.address, subject: delivery.content.subject, text: delivery.content.text,
        idempotencyKey: delivery.id, signal,
      });
    },
  };
}
