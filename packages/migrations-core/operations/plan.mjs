import { planMigrations } from "../src/index.ts";

export async function plan({ input }) {
  try {
    const migrations = await planMigrations(
      input.manifest,
      input.history ?? [],
    );
    return {
      status: "success",
      data: {
        pending: migrations.map(({ id, checksum }) => ({ id, checksum })),
      },
    };
  } catch (error) {
    return {
      status: "failed",
      diagnostics: [
        {
          severity: "error",
          code: "INVALID_MIGRATION_PLAN",
          message: error.message,
        },
      ],
    };
  }
}
