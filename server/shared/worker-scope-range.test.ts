import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
vi.mock("./db", () => ({ getDb: vi.fn() }));
import { getDb } from "./db";
import { getScopedWorkerIds, getScopedWorkerIdsInRange } from "./worker-scope";

const dialect = new MySqlDialect();
beforeEach(() => vi.clearAllMocks());
function database(responses: unknown[][]) {
  const parameters: unknown[][] = [];
  vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: () => ({ where: (condition: any) => {
    parameters.push(dialect.sqlToQuery(condition).params);
    return Promise.resolve(responses.shift() ?? []);
  } }) }) } as any);
  return parameters;
}
describe("dated worker scope for lists", () => {
  it("uses both ends of the range so a mid-month link remains visible", async () => {
    const parameters = database([[{ id: 101 }, { id: 101 }, { id: 102 }]]);
    expect(await getScopedWorkerIdsInRange({ id: 12, role: "supervisor" }, "2026-10-01", "2026-10-31")).toEqual([101, 102]);
    expect(parameters[0]).toEqual([12, "2026-10-31", "2026-10-01"]);
  });
  it("retains exact-day restrictions for mutations using the original helper", async () => {
    const parameters = database([[{ id: 101 }]]);
    await getScopedWorkerIds({ id: 12, role: "supervisor" }, "2026-10-20");
    expect(parameters[0]).toEqual([12, "2026-10-20", "2026-10-20"]);
  });
  it("intersects dated supervisor links with an explicit cost-center scope", async () => {
    database([[{ id: 101 }, { id: 102 }], [{ id: 1, code: "REST", nameAr: "مطاعم" }], [{ id: 102 }, { id: 103 }]]);
    expect(await getScopedWorkerIdsInRange({ id: 12, role: "supervisor", accessScope: { costCenterIds: [1] } }, "2026-10-01", "2026-10-31")).toEqual([102]);
  });
  it("rejects an inverted interval before consulting the database", async () => {
    await expect(getScopedWorkerIdsInRange({ id: 12, role: "supervisor" }, "2026-10-31", "2026-10-01")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDb).not.toHaveBeenCalled();
  });
});
