import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import {
  schedulePeriods,
  shiftTemplates,
  shiftAssignments,
  timeBalances,
  scheduleExceptions,
} from "../../../drizzle/schema";

/**
 * اختبارات انحدار لنموذج بيانات الجداول المعتمد (S1).
 * تضمن بقاء الحالات والقيود الأساسية كما اعتُمدت.
 */
describe("Schedule data model (S1)", () => {
  it("schedule_periods has approved status enum", () => {
    const cfg = getTableConfig(schedulePeriods);
    const status = cfg.columns.find((c) => c.name === "status") as any;
    expect(status.enumValues).toEqual([
      "draft",
      "published",
      "locked",
      "cancelled",
      "archived",
    ]);
  });

  it("shift_assignments has approved status enum", () => {
    const cfg = getTableConfig(shiftAssignments);
    const status = cfg.columns.find((c) => c.name === "status") as any;
    expect(status.enumValues).toEqual([
      "planned",
      "confirmed",
      "completed",
      "cancelled",
      "transferred",
    ]);
  });

  it("shift_assignments enforces unique worker slot (workerId, workDate, startTime)", () => {
    const cfg = getTableConfig(shiftAssignments);
    const uq = cfg.uniqueConstraints.concat(
      (cfg.indexes.filter((i: any) => i.config?.unique) as any[]).map(
        (i: any) => ({ name: i.config.name, columns: i.config.columns })
      ) as any
    );
    const names = [
      ...cfg.uniqueConstraints.map((u) => u.name),
      ...cfg.indexes
        .filter((i: any) => (i as any).config?.unique)
        .map((i: any) => (i as any).config.name),
    ];
    expect(names).toContain("assign_worker_slot_uq");
  });

  it("time_balances is unique per (workerId, periodId)", () => {
    const cfg = getTableConfig(timeBalances);
    const names = [
      ...cfg.uniqueConstraints.map((u) => u.name),
      ...cfg.indexes
        .filter((i: any) => (i as any).config?.unique)
        .map((i: any) => (i as any).config.name),
    ];
    expect(names).toContain("balance_worker_period_uq");
  });

  it("shift_templates supports midnight-crossing shifts and unique code", () => {
    const cfg = getTableConfig(shiftTemplates);
    expect(cfg.columns.some((c) => c.name === "crossesMidnight")).toBe(true);
    const code = cfg.columns.find((c) => c.name === "code") as any;
    expect(code.isUnique).toBe(true);
  });

  it("schedule_exceptions has approved type and status enums", () => {
    const cfg = getTableConfig(scheduleExceptions);
    const type = cfg.columns.find((c) => c.name === "exceptionType") as any;
    const status = cfg.columns.find((c) => c.name === "status") as any;
    expect(type.enumValues).toContain("extension");
    expect(type.enumValues).toContain("max_daily_override");
    expect(status.enumValues).toEqual([
      "pending",
      "approved",
      "rejected",
      "cancelled",
    ]);
  });

  it("audit fields exist on all new entities", () => {
    for (const table of [
      schedulePeriods,
      shiftTemplates,
      shiftAssignments,
      timeBalances,
      scheduleExceptions,
    ]) {
      const cols = getTableConfig(table).columns.map((c) => c.name);
      expect(cols).toContain("createdAt");
      expect(cols).toContain("updatedAt");
    }
  });
});
