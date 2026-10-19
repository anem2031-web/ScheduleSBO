import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../../shared/db", () => ({ getDb: mocks.getDb }));
vi.mock("../overtime/approved-overtime", () => ({
  approvedOvertimeForWorkers: async () => new Map(),
}));
vi.mock("../../shared/audit", () => ({ createAuditLog: async () => {} }));
vi.mock("./schedules.repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./schedules.repository")>()),
  findPeriodById: async () => ({ id: 3, status: "published" }),
}));
import { publishPeriod } from "./schedules.service";

function fixture(rest: number, work = 540, daily = "9") {
  const rows: unknown[][] = [
    [
      {
        id: 3,
        status: "draft",
        startDate: "2026-10-17",
        endDate: "2026-10-23",
      },
    ],
    [
      {
        workerId: 7,
        workDate: "2026-10-17",
        plannedMinutes: work,
        breakMinutes: rest,
      },
    ],
    [{ workerId: 7, maxDailyHours: daily, requiredHoursPerDay: daily }],
  ];
  const writes: unknown[] = [];
  const tx = {
    select: () => {
      const result = rows.shift() ?? [];
      const q: any = {
        from: () => q,
        where: () => q,
        for: async () => result,
        then: (a: any, b: any) => Promise.resolve(result).then(a, b),
      };
      return q;
    },
    update: () => ({
      set: (v: unknown) => ({
        where: async () => {
          writes.push(v);
        },
      }),
    }),
  };
  mocks.getDb.mockResolvedValue({ transaction: async (fn: any) => fn(tx) });
  return writes;
}
describe("weekly approval validates daily work and separate breaks", () => {
  beforeEach(() => vi.clearAllMocks());
  it("publishes 540 minutes work plus 30 minutes rest", async () => {
    const writes = fixture(30);
    await publishPeriod({ periodId: 3, publishedBy: 1 });
    expect(writes).toEqual([
      expect.objectContaining({ status: "published", publishedBy: 1 }),
    ]);
  });
  it("blocks a full work day without its break before changing approval", async () => {
    const writes = fixture(0);
    await expect(
      publishPeriod({ periodId: 3, publishedBy: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toEqual([]);
  });
  it("blocks duplicate daily breaks or exceeding the daily work limit", async () => {
    fixture(60);
    await expect(
      publishPeriod({ periodId: 3, publishedBy: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    fixture(30, 570);
    await expect(
      publishPeriod({ periodId: 3, publishedBy: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("supports customized 8-hour administrative workers", async () => {
    const writes = fixture(30, 480, "8");
    await publishPeriod({ periodId: 3, publishedBy: 1 });
    expect(writes).toHaveLength(1);
  });
});
