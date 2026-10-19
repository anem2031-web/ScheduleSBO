import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql2";
import type { SQL } from "drizzle-orm";

vi.mock("../../shared/db", () => ({ getDb: vi.fn() }));
import { getDb } from "../../shared/db";
import * as repo from "./org-structure.repository";

const dialect = new MySqlDialect();
const queryBuilder = drizzle.mock();
const statements: { sql: string; params: unknown[] }[] = [];
let affectedRows = 1;
const tx = {
  select: queryBuilder.select.bind(queryBuilder),
  delete: vi.fn(() => ({
    where: vi.fn(async (condition: SQL) => {
      statements.push(dialect.sqlToQuery(condition));
      return [{ affectedRows }];
    }),
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  statements.length = 0;
  affectedRows = 1;
});

describe("Organization deletion SQL guards without a live database", () => {
  it("checks all supported legacy cost-center values: id, code, and Arabic name", async () => {
    const where = vi.fn(async (condition: SQL) => {
      statements.push(dialect.sqlToQuery(condition));
      return [{ n: 2 }];
    });
    vi.mocked(getDb).mockResolvedValue({
      select: () => ({ from: () => ({ where }) }),
    } as any);
    expect(
      await repo.countWorkersByBranch({
        id: 3,
        code: "PARK",
        nameAr: "الحديقة",
      }),
    ).toBe(2);
    expect(statements[0].sql).toContain(
      "`worker_schedule_settings`.`branch` in",
    );
    expect(statements[0].params).toEqual(["3", "PARK", "الحديقة"]);
  });

  it("rechecks links and legacy worker references inside the final cost-center delete", async () => {
    vi.mocked(getDb).mockResolvedValue(tx as any);
    await repo.deleteBranch({ id: 3, code: "PARK", nameAr: "الحديقة" });
    expect(statements[0].sql).toContain("`branch_locations`");
    expect(statements[0].sql).toContain("`worker_schedule_settings`");
    expect(statements[0].params).toEqual([3, 3, "3", "PARK", "الحديقة"]);
  });

  it("removes only the confirmed site context link, then guards every other relationship", async () => {
    vi.mocked(getDb).mockResolvedValue({
      transaction: (work: any) => work(tx),
    } as any);
    await repo.deleteLocation(10, 3);
    expect(statements[0].params).toEqual([10, 3]);
    expect(statements[1].sql).toContain("not exists");
    expect(statements[1].sql).toContain("`branch_locations`");
    expect(statements[1].sql).toContain("`location_departments`");
    expect(tx.delete).toHaveBeenCalledTimes(2);
  });

  it("guards current and historical department references before allowing deletion", async () => {
    vi.mocked(getDb).mockResolvedValue({
      transaction: (work: any) => work(tx),
    } as any);
    await repo.deleteDepartment(20, 10);
    expect(statements[0].params).toEqual([20, 10]);
    for (const table of [
      "workers",
      "job_titles",
      "schedules",
      "evaluation_templates",
      "incentive_categories",
      "payroll_sheets",
      "shift_templates",
      "shift_assignments",
      "location_departments",
    ]) {
      expect(statements[1].sql).toContain("`" + table + "`");
    }
    expect(tx.delete).toHaveBeenCalledTimes(2);
  });

  it("rejects the transaction when the final conditional delete finds a reference", async () => {
    affectedRows = 0;
    const transaction = vi.fn((work: any) => work(tx));
    vi.mocked(getDb).mockResolvedValue({ transaction } as any);
    await expect(repo.deleteDepartment(20, 10)).rejects.toBeInstanceOf(
      repo.OrgDeletionConflict,
    );
    expect(transaction).toHaveBeenCalledOnce();
  });
});
