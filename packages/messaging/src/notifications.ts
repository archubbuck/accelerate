export type DeliveryChannel = "email" | "webhook";
export type DeliveryStatus = "pending" | "sending" | "sent" | "suppressed" | "failed";

export interface NotificationContent {
  subject: string;
  text: string;
  data?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface NotificationTemplate<Input> {
  id: string;
  render(input: Input): NotificationContent;
}

export interface NotificationDelivery {
  id: string;
  recipientId: string;
  channel: DeliveryChannel;
  templateId: string;
  content: NotificationContent;
}

export interface DeliveryRecord extends NotificationDelivery {
  status: DeliveryStatus;
  attempts: number;
  result?: string;
}

export interface NotificationStore {
  schedule(delivery: NotificationDelivery): Promise<boolean>;
  claim(id: string, attempt: number): Promise<DeliveryRecord | undefined>;
  settle(id: string, attempt: number, status: Exclude<DeliveryStatus, "sending">, result: string): Promise<boolean>;
  inspect(id: string): Promise<Omit<DeliveryRecord, "content" | "recipientId"> | undefined>;
}

export type NotificationDestination =
  | { channel: "email"; address: string }
  | { channel: "webhook"; url: URL };

export interface NotificationTransport {
  send(delivery: NotificationDelivery, destination: NotificationDestination, signal: AbortSignal): Promise<void>;
}

export class NotificationTransportError extends Error {
  constructor(readonly retryable: boolean) { super("Notification transport failed"); this.name = "NotificationTransportError"; }
}

function id(value: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)) throw new TypeError("Invalid notification identifier");
}

export function validateNotification(delivery: NotificationDelivery) {
  for (const value of [delivery.id, delivery.recipientId, delivery.templateId]) id(value);
  if (!["email", "webhook"].includes(delivery.channel)) throw new TypeError("Invalid notification channel");
  const { subject, text, data } = delivery.content;
  if (typeof subject !== "string" || !subject.trim() || subject.length > 998 || /[\r\n\0]/.test(subject)
    || typeof text !== "string" || text.length > 65_536) throw new TypeError("Invalid notification content");
  if (Object.values(data ?? {}).some(value => value !== null && typeof value !== "string"
    && typeof value !== "boolean" && (typeof value !== "number" || !Number.isFinite(value)))) throw new TypeError("Invalid notification metadata");
  if (JSON.stringify(data ?? {}).length > 16_384) throw new RangeError("Notification metadata exceeds its limit");
}

export function createNotificationDelivery(options: {
  store: NotificationStore;
  transports: Partial<Record<DeliveryChannel, NotificationTransport>>;
  /** Resolve the current channel preference and destination from trusted recipient configuration. */
  resolveDestination: (recipientId: string, channel: DeliveryChannel) => Promise<NotificationDestination | undefined>;
  allowSend?: (recipientId: string, channel: DeliveryChannel) => Promise<boolean>;
  maxAttempts?: number;
  timeoutMs?: number;
}) {
  const maxAttempts = options.maxAttempts ?? 5;
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new RangeError("Invalid notification worker options");
  const { store } = options;

  return {
    schedule<Input>(input: { id: string; recipientId: string; channel: DeliveryChannel; template: NotificationTemplate<Input>; data: Input }) {
      const delivery = {
        id: input.id, recipientId: input.recipientId, channel: input.channel, templateId: input.template.id,
        content: input.template.render(input.data),
      };
      validateNotification(delivery);
      return store.schedule(delivery);
    },
    inspect: (deliveryId: string) => store.inspect(deliveryId),
    async process(deliveryId: string, attempt: number, signal: AbortSignal) {
      id(deliveryId);
      if (!Number.isSafeInteger(attempt) || attempt < 1) throw new TypeError("Invalid delivery attempt");
      signal.throwIfAborted();
      const delivery = await store.claim(deliveryId, attempt);
      if (!delivery) return;
      if (attempt > maxAttempts) {
        await store.settle(deliveryId, attempt, "failed", "attempts-exhausted");
        return;
      }
      let outcome: Exclude<DeliveryStatus, "sending"> = "sent";
      let result = "delivered";
      try {
        const destination = await options.resolveDestination(delivery.recipientId, delivery.channel);
        const transport = options.transports[delivery.channel];
        if (!destination) {
          outcome = "suppressed";
          result = "recipient-preference";
        } else if (!transport || destination.channel !== delivery.channel) {
          outcome = "failed";
          result = "channel-unavailable";
        } else {
          if (options.allowSend && !await options.allowSend(delivery.recipientId, delivery.channel)) {
            throw new NotificationTransportError(true);
          }
          const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
          deadline.throwIfAborted();
          await transport.send(delivery, destination, deadline);
        }
      } catch (error) {
        const retryable = !(error instanceof NotificationTransportError) || error.retryable;
        outcome = retryable && attempt < maxAttempts ? "pending" : "failed";
        result = retryable ? "retryable-transport-error" : "permanent-transport-error";
      }
      const committed = await store.settle(deliveryId, attempt, outcome, result);
      if (committed && outcome === "pending") throw new NotificationTransportError(true);
    },
  };
}
