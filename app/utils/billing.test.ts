// Run: node --experimental-strip-types --test app/utils/billing.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { DAILY_FIXED_COST, specialDinnerDays, specialDinnerTotal } from "./billing.ts";

test("reproduces the worked example from the mess billing email", () => {
  // "a standard 30-day month with 4 Special Dinner days" → 6,660 + 140 = 6,800
  const base = 30 * DAILY_FIXED_COST;
  assert.equal(base, 6660, "base subtotal");

  const special = specialDinnerTotal(30, 30);
  assert.equal(special, 140, "special dinner extra");
  assert.equal(base + special, 6800, "total estimated bill");

  // Advance credit of 3,000 leaves 3,800 out of pocket.
  assert.equal(Math.max(base + special - 3000, 0), 3800);
});

test("bills all four nights for any full month", () => {
  assert.equal(specialDinnerDays(31, 31), 4);
  assert.equal(specialDinnerDays(30, 30), 4);
  assert.equal(specialDinnerDays(28, 28), 4);
});

test("prorates part-months instead of charging the full four", () => {
  // Mess started 15 June → 16 of 30 days counted.
  assert.equal(specialDinnerDays(16, 30), 2);
  // Current month, 9 days elapsed of 31.
  assert.equal(specialDinnerDays(9, 31), 1);
  assert.equal(specialDinnerTotal(9, 31), 35);
});

test("charges nothing for a month with no counted days", () => {
  assert.equal(specialDinnerDays(0, 31), 0);
  assert.equal(specialDinnerTotal(0, 31), 0);
});
