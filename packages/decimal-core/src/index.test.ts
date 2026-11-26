import { expect, it } from "vitest";
import { amount, allocate, add, subtract, multiply } from "./index.js";

it("keeps precision across JSON, arithmetic and allocation", () => {
  const a = amount("9007199254740993000.005", "USD", 2, "halfEven");
  const cent = amount("0.01", "USD", 2, "halfUp");
  expect(add(JSON.parse(JSON.stringify(a)), cent).value).toBe(
    "9007199254740993000.01",
  );
  expect(subtract(add(a, cent), cent)).toEqual(a);
  expect(multiply(cent, "1.5", "halfEven").value).toBe("0.02");
  const split = allocate(amount("-1.00", "USD", 2, "halfUp"), [1n, 1n, 1n]);
  expect(split.map((a) => a.value)).toEqual(["-0.34", "-0.33", "-0.33"]);
  expect(() => add(a, { ...cent, currency: "EUR" })).toThrow();
  expect(() => amount("NaN", "USD", 2, "halfEven")).toThrow();
});

it("canonicalizes values rounded to zero", () => {
  const zero = amount("-0.004", "USD", 2, "halfEven");
  expect(zero.value).toBe("0.00");
  expect(add(zero, zero)).toEqual(zero);
});
