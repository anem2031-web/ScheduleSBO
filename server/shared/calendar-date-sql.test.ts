import { describe, expect, it } from "vitest";
import { and } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { shiftAssignments } from "../../drizzle/schema";
import { calendarEquals, calendarOnOrAfter, calendarOnOrBefore } from "./calendar-date-sql";

describe("MySQL civil-date query boundaries", () => {
  const dialect = new MySqlDialect();
  it("binds a one-day inclusive range as date strings, never local 03:00 Date objects", () => {
    const day = new Date("2026-10-19T00:00:00Z");
    const statement = and(calendarOnOrAfter(shiftAssignments.workDate, day), calendarOnOrBefore(shiftAssignments.workDate, day));
    expect(dialect.sqlToQuery(statement!).params).toEqual(["2026-10-19", "2026-10-19"]);
  });
  it("uses the same civil day for equality checks and both ends across months", () => {
    expect(dialect.sqlToQuery(calendarEquals(shiftAssignments.workDate, new Date("2026-10-19T00:00:00Z"))).params).toEqual(["2026-10-19"]);
    const range = and(calendarOnOrAfter(shiftAssignments.workDate, "2026-10-19"), calendarOnOrBefore(shiftAssignments.workDate, "2026-11-12"));
    expect(dialect.sqlToQuery(range!).params).toEqual(["2026-10-19", "2026-11-12"]);
  });
});
