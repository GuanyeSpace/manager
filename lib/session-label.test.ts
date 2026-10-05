import assert from "node:assert/strict";
import { test } from "node:test";
import { displaySessionLabel } from "./session-label";

test("automatic labels use actual start in Shanghai, including corrected dates and midnight", () => {
  const label = "2026-10-05 23:40 场";
  assert.equal(displaySessionLabel(label, new Date("2026-10-05T16:03:59Z")), "2026-10-06 00:03 场");
  assert.equal(displaySessionLabel(label, new Date("2026-10-06T12:18:00Z")), "2026-10-06 20:18 场");
  assert.equal(label, "2026-10-05 23:40 场");
});
test("unstarted and custom names retain stored text", () => {
  for (const label of ["2026-10-05 23:40 场", "晚上场", "2026-10-05 23:40 场补录"]) assert.equal(displaySessionLabel(label, null), label);
  for (const label of ["晚上场", "2026-10-05 23:40 场补录"]) assert.equal(displaySessionLabel(label, new Date()), label);
});
