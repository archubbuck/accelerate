import { createRateLimiter } from "../src/index.ts";

export async function preview({ input }) {
  try {
    let state = [],
      now = 0;
    const limiter = createRateLimiter({
      async update(_partition, fn) {
        const mutation = fn(state, now);
        if (mutation.state) state = mutation.state;
        return mutation.value;
      },
    });
    if (
      !Array.isArray(input.times) ||
      input.times.length < 1 ||
      input.times.length > 1000
    )
      throw new RangeError("Expected 1–1000 timestamps");
    const decisions = [];
    for (const at of input.times) {
      if (!Number.isSafeInteger(at) || at < now || at > 8640000000000000)
        throw new RangeError("Expected ordered epoch milliseconds");
      now = at;
      const { allowed, retryAfterMs, quotas } = await limiter.consume({
        partition: "preview",
        rules: input.rules,
      });
      decisions.push({ allowed, retryAfterMs, quotas });
    }
    return { status: "success", data: { decisions } };
  } catch (error) {
    return {
      status: "failed",
      diagnostics: [
        {
          severity: "error",
          code: "INVALID_QUOTA_PREVIEW",
          message: error.message,
        },
      ],
    };
  }
}
