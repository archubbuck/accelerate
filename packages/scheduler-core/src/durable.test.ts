import { expect, it } from "vitest";
import { decideSchedule, upcoming, type ScheduleDefinition } from "./index.js";
const fixture: ScheduleDefinition = {
  id: "a",
  startAt: 0,
  timing: { kind: "interval", everyMs: 10 },
  missed: { kind: "catch-up" },
  payload: null,
};
it("anchors interval slots, resumes backlogs and aggregates skipped slots", () => {
  const row = { definition: fixture, status: "active", nextAt: 20 } as const;
  expect(decideSchedule(row, 45)).toMatchObject({
    nextAt: 30,
    run: { id: "a:20" },
  });
  expect(
    decideSchedule(
      {
        ...row,
        definition: { ...fixture, missed: { kind: "skip", graceMs: 5 } },
      },
      45,
    ),
  ).toEqual({ nextAt: 40, skippedBefore: 40 });
  expect(upcoming({ ...fixture, timing: { kind: "once" } }, 1)).toEqual([]);
});
it("handles the spring gap and autumn fold in New York", () => {
  const def: ScheduleDefinition = {
    ...fixture,
    zone: "America/New_York",
    timing: { kind: "cron", expression: "30 2 * * *" },
  };
  const slots = (d: ScheduleDefinition, at: string) =>
    upcoming(d, Date.parse(at), 2).map((v) => new Date(v).toISOString());
  expect(slots(def, "2024-03-10T00:00Z")[0]).toBe("2024-03-11T06:30:00.000Z");
  expect(
    slots(
      {
        ...def,
        timing: { kind: "cron", expression: "30 2 * * *", gap: "offset" },
      },
      "2024-03-10T00:00Z",
    )[0],
  ).toBe("2024-03-10T07:30:00.000Z");
  expect(
    slots(
      {
        ...def,
        timing: { kind: "cron", expression: "30 1 * * *", overlap: "both" },
      },
      "2024-11-03T00:00Z",
    ),
  ).toEqual(["2024-11-03T05:30:00.000Z", "2024-11-03T06:30:00.000Z"]);
  expect(
    slots(
      { ...def, timing: { kind: "cron", expression: "30 1 * * *" } },
      "2024-11-03T00:00Z",
    )[1],
  ).toBe("2024-11-04T06:30:00.000Z");
});
it("excludes local dates and rejects invalid definitions", () => {
  const from = Date.parse("2024-03-10T05:00Z");
  expect(
    upcoming(
      {
        ...fixture,
        zone: "America/New_York",
        excludeDates: ["2024-03-10"],
        timing: { kind: "interval", everyMs: 1 },
      },
      from,
      1,
    ),
  ).toEqual([Date.parse("2024-03-11T04:00Z")]);
  for (const patch of [
    { zone: "bad/zone" },
    { timing: { kind: "interval", everyMs: 0 } },
    { excludeDates: ["2024-02-31"] },
    { payload: Infinity },
  ])
    expect(() =>
      upcoming({ ...fixture, ...patch } as ScheduleDefinition, 0),
    ).toThrow();
});
it("preserves both 01:45 occurrences during the half-hour Lord Howe overlap", () => {
  const def: ScheduleDefinition = {
    ...fixture,
    zone: "Australia/Lord_Howe",
    timing: { kind: "cron", expression: "45 1 * * *", overlap: "both" },
  };
  expect(upcoming(def, Date.parse("2024-04-06T12:00:00Z"), 2)).toEqual([
    Date.parse("2024-04-06T14:45:00Z"),
    Date.parse("2024-04-06T15:15:00Z"),
  ]);
});
