import Big from "big.js";

export type Rounding = "towardZero" | "halfUp" | "halfEven" | "awayFromZero";
const modes = {
  towardZero: 0,
  halfUp: 1,
  halfEven: 2,
  awayFromZero: 3,
} as const;
export interface Amount {
  value: string;
  scale: number;
  currency: string;
}

export function amount(
  value: string,
  currency: string,
  scale: number,
  rounding: Rounding,
): Amount {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value))
    throw new TypeError("Expected a finite decimal string");
  if (!/^[A-Z]{3}$/.test(currency))
    throw new TypeError("Expected a currency code");
  if (
    !Number.isInteger(scale) ||
    scale < 0 ||
    scale > 1000 ||
    !Object.hasOwn(modes, rounding)
  )
    throw new RangeError("Invalid decimal policy");
  const rounded = new Big(value).round(scale, modes[rounding]);
  return { value: rounded.toFixed(scale), currency, scale };
}

function read(a: Amount): Big {
  if (amount(a.value, a.currency, a.scale, "towardZero").value !== a.value)
    throw new TypeError("Expected a canonical amount");
  return new Big(a.value);
}
function compatible(a: Amount, b: Amount) {
  if (a.currency !== b.currency || a.scale !== b.scale)
    throw new RangeError("Currency or scale mismatch");
}
export function add(a: Amount, b: Amount): Amount {
  compatible(a, b);
  return { ...a, value: read(a).plus(read(b)).toFixed(a.scale) };
}
export function subtract(a: Amount, b: Amount): Amount {
  compatible(a, b);
  return { ...a, value: read(a).minus(read(b)).toFixed(a.scale) };
}
export function multiply(
  a: Amount,
  factor: string,
  rounding: Rounding,
): Amount {
  return amount(
    read(a).times(new Big(factor)).toFixed(),
    a.currency,
    a.scale,
    rounding,
  );
}

/** Largest-remainder allocation in integer minor units. Equal remainders favor input order. */
export function allocate(a: Amount, weights: readonly bigint[]): Amount[] {
  const units = BigInt(read(a).abs().toFixed(a.scale).replace(".", ""));
  const total = weights.reduce((sum, w) => sum + w, 0n);
  if (total <= 0n || weights.some((w) => w < 0n))
    throw new RangeError("Invalid allocation weights");
  const parts = weights.map((w) => (units * w) / total);
  const residual = units - parts.reduce((sum, part) => sum + part, 0n);
  const ranked = weights
    .map((w, i) => ({ i, remainder: (units * w) % total }))
    .sort((x, y) =>
      x.remainder > y.remainder
        ? -1
        : x.remainder < y.remainder
          ? 1
          : x.i - y.i,
    );
  for (const { i } of ranked.slice(0, Number(residual))) parts[i]++;
  return parts.map((part) => {
    const digits = part.toString().padStart(a.scale + 1, "0");
    const value = a.scale
      ? digits.slice(0, -a.scale) + "." + digits.slice(-a.scale)
      : digits;
    return {
      ...a,
      value: a.value.startsWith("-") && part ? "-" + value : value,
    };
  });
}
