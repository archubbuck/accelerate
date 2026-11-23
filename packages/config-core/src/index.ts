export interface ConfigField<T> { parse(value: unknown, key: string): T; defaultValue?: T; }
export type ConfigShape = Record<string, ConfigField<unknown>>;
export type ConfigValues<T extends ConfigShape> = { readonly [K in keyof T]: T[K] extends ConfigField<infer V> ? V : never };
export class ConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) { super("Invalid configuration: " + issues.join("; ")); this.name = "ConfigurationError"; }
}
export function defineConfig<T extends ConfigShape>(shape: T, source: Readonly<Record<string, unknown>>): ConfigValues<T> {
  const output: Record<string, unknown> = {};
  const issues: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    const value = source[key] === undefined ? field.defaultValue : source[key];
    try {
      if (value === undefined) throw new Error("is required");
      output[key] = field.parse(value, key);
    } catch (error) { issues.push(key + ": " + (error instanceof Error ? error.message : String(error))); }
  }
  if (issues.length) throw new ConfigurationError(issues);
  return Object.freeze(output) as ConfigValues<T>;
}
export const configField = {
  string: (defaultValue?: string): ConfigField<string> => ({ defaultValue, parse(value) {
    if (typeof value !== "string" || !value.trim()) throw new Error("must be a nonempty string");
    return value;
  } }),
  number: (defaultValue?: number): ConfigField<number> => ({ defaultValue, parse(value) {
    if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) throw new Error("must be a finite number");
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error("must be a finite number");
    return parsed;
  } }),
  boolean: (defaultValue?: boolean): ConfigField<boolean> => ({ defaultValue, parse(value) {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    throw new Error("must be true or false");
  } })
};
