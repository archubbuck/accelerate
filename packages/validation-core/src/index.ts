export interface ValidationIssue { readonly path: readonly (string | number)[]; readonly message: string; readonly code?: string; }
export type ValidationResult<T> = { success: true; data: T } | { success: false; issues: readonly ValidationIssue[] };
export interface Schema<T> { safeParse(input: unknown): ValidationResult<T>; }
export class ValidationError extends Error {
  readonly issues: readonly ValidationIssue[];
  constructor(issues: readonly ValidationIssue[]) { super("Validation failed"); this.name = "ValidationError"; this.issues = issues; }
}
export function validate<T>(schema: Schema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(result.issues);
  return result.data;
}
export function createSchema<T>(parser: (input: unknown) => ValidationResult<T>): Schema<T> {
  return { safeParse: parser };
}
export function string(options: { minLength?: number; maxLength?: number } = {}): Schema<string> {
  return createSchema(input => {
    if (typeof input !== "string") return { success: false, issues: [{ path: [], message: "Expected string", code: "invalid_type" }] };
    if (options.minLength !== undefined && input.length < options.minLength) return { success: false, issues: [{ path: [], message: "String is too short", code: "too_small" }] };
    if (options.maxLength !== undefined && input.length > options.maxLength) return { success: false, issues: [{ path: [], message: "String is too long", code: "too_big" }] };
    return { success: true, data: input };
  });
}
export function number(): Schema<number> {
  return createSchema(input => typeof input === "number" && Number.isFinite(input)
    ? { success: true, data: input }
    : { success: false, issues: [{ path: [], message: "Expected finite number", code: "invalid_type" }] });
}
export function boolean(): Schema<boolean> {
  return createSchema(input => typeof input === "boolean"
    ? { success: true, data: input }
    : { success: false, issues: [{ path: [], message: "Expected boolean", code: "invalid_type" }] });
}
export function object<T extends Record<string, unknown>>(shape: { [K in keyof T]: Schema<T[K]> }): Schema<T> {
  return createSchema(input => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) return { success: false, issues: [{ path: [], message: "Expected object", code: "invalid_type" }] };
    const data: Record<string, unknown> = {};
    const issues: ValidationIssue[] = [];
    for (const key of Object.keys(shape) as (keyof T & string)[]) {
      const result = shape[key].safeParse((input as Record<string, unknown>)[key]);
      if (result.success) data[key] = result.data;
      else issues.push(...result.issues.map(issue => ({ ...issue, path: [key, ...issue.path] })));
    }
    return issues.length ? { success: false, issues } : { success: true, data: data as T };
  });
}
