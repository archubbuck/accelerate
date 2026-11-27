# Durable notification delivery

Use `@accelerate/messaging/notifications` for typed templates and delivery. Apply the existing jobs schema and `notificationSchema` from `@accelerate/messaging/notifications/postgres`. Construct the delivery service with a PostgreSQL store, trusted destination resolver, current recipient preferences and optional rate-limit policy.

```ts
const maxAttempts = 5;
const notifications = createNotificationDelivery({
  store: createPostgresNotificationStore(db),
  transports: { email, webhook },
  resolveDestination: resolvePreferredDestination,
  allowSend: checkRateLimit,
  maxAttempts,
});

worker.register(notificationJobName, (job, signal) =>
  notifications.process(job.payload.deliveryId, job.attempts, signal),
);
await notifications.schedule({ id: logicalDeliveryId, recipientId, channel: 'email', template, data });
```

Use a stable logical delivery ID. Scheduling commits delivery state and its queue job together. Retrying the same content is idempotent. A changed request using the same ID fails. Jobs carry only the delivery ID. Configure the worker's maximum attempts to match the delivery service. Failed attempts persist only generic category codes. The service rechecks preferences before each dispatch and exposes status without the stored recipient identifier or content.

The email transport accepts a caller-supplied provider and passes the stable delivery ID as the idempotency key. The webhook transport permits configured HTTPS origins, rejects redirects, and signs the timestamp, delivery ID and exact request body with HMAC-SHA-256. Verify the headers from the raw body using `verifyNotificationWebhook` from `@accelerate/messaging/notifications/webhook`, and persist processed delivery IDs at the receiving service. Timestamp validation bounds the replay window, while delivery ID deduplication prevents duplicate effects inside it.

A provider can receive a message before a worker records completion. Use providers that enforce the supplied idempotency key if duplicate delivery is unacceptable. Restrict database access to message content and recipient configuration, and apply retention to old deliveries.
