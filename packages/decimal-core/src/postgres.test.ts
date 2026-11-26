import { describe, expect, it } from "vitest";
import {
  databaseUrl,
  postgresFixture,
} from "../../../tools/testing/wave7-postgres";
import { amount } from "./index.js";

describe.skipIf(!databaseUrl)("PostgreSQL numeric serialization", () => {
  const { database } = postgresFixture();
  it("round trips decimal text through a PostgreSQL numeric column", async () => {
    const original = amount(
      "12345678901234567890123456.12345678901234567890",
      "USD",
      20,
      "halfEven",
    );
    await database.query(
      "CREATE TABLE decimal_values (value numeric, currency text, scale integer)",
    );
    await database.query("INSERT INTO decimal_values VALUES ($1,$2,$3)", [
      original.value,
      original.currency,
      original.scale,
    ]);
    const {
      rows: [row],
    } = await database.query<typeof original>(
      "SELECT value::text, currency, scale FROM decimal_values",
    );
    expect(amount(row.value, row.currency, row.scale, "halfEven")).toEqual(
      original,
    );
  });
});
