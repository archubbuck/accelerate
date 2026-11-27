import type { Database } from "@accelerate/data/core";
import { createPostgresJobQueue } from "@accelerate/messaging/jobs/postgres";
import { validateNotification, type DeliveryRecord, type DeliveryStatus, type NotificationDelivery, type NotificationStore } from "./notifications.js";

export const notificationJobName = "accelerate.notification.delivery";
export const notificationSchema = [
  `CREATE TABLE IF NOT EXISTS accelerate_notification_deliveries (
    id text PRIMARY KEY, payload jsonb NOT NULL, status text NOT NULL CHECK (status IN ('pending','sending','sent','suppressed','failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0), result text, updated_at timestamptz NOT NULL DEFAULT now()
  )`,
] as const;

export function createPostgresNotificationStore(db: Database): NotificationStore {
  return {
    schedule(input) {
      const delivery: NotificationDelivery = structuredClone(input);
      validateNotification(delivery);
      return db.transaction(async tx => {
        const payload = JSON.stringify(delivery);
        const result = await tx.query(
          "INSERT INTO accelerate_notification_deliveries (id,payload,status) VALUES ($1,$2::jsonb,'pending') ON CONFLICT DO NOTHING",
          [delivery.id, payload],
        );
        if (!result.rowCount) {
          const same = await tx.query("SELECT id FROM accelerate_notification_deliveries WHERE id=$1 AND payload=$2::jsonb",
            [delivery.id, payload]);
          if (!same.rowCount) throw new Error("Conflicting notification delivery ID");
          return false;
        }
        await createPostgresJobQueue(tx).enqueue(notificationJobName, { deliveryId: delivery.id }, { id: notificationJobName + ":" + delivery.id });
        return true;
      });
    },
    async claim(id, attempt) {
      const row = (await db.query<{ payload: NotificationDelivery; attempts: number }>(
        `UPDATE accelerate_notification_deliveries SET status='sending',attempts=$2,updated_at=now()
         WHERE id=$1 AND attempts<$2 AND status IN ('pending','sending') RETURNING payload,attempts`,
        [id, attempt],
      )).rows[0];
      return row && { ...row.payload, status: "sending", attempts: row.attempts };
    },
    async settle(id, attempt, status, result) {
      return (await db.query(
        `UPDATE accelerate_notification_deliveries SET status=$3,result=$4,updated_at=now()
         WHERE id=$1 AND attempts=$2 AND status='sending'`,
        [id, attempt, status, result],
      )).rowCount === 1;
    },
    async inspect(id) {
      interface Row { id: string; channel: DeliveryRecord["channel"]; templateId: string; status: DeliveryStatus; attempts: number; result: string | null }
      const row = (await db.query<Row>(
        `SELECT id,payload->>'channel' AS channel,payload->>'templateId' AS "templateId",status,attempts,result
         FROM accelerate_notification_deliveries WHERE id=$1`, [id],
      )).rows[0];
      return row && { ...row, result: row.result ?? undefined };
    },
  };
}
