import { defineConfig, type ConfigShape, type ConfigValues } from "@accelerate/config-core";

/** Read environment values without modifying process.env. */
export function loadEnvironment<T extends ConfigShape>(
  shape: T,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  options: { prefix?: string } = {}
): ConfigValues<T> {
  const source: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) source[key] = environment[(options.prefix ?? "") + key];
  return defineConfig(shape, source);
}
