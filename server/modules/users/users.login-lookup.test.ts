import { describe, expect, it, vi } from "vitest";
vi.mock("../../shared/db", () => ({ getDb: vi.fn() }));
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { getDb } from "../../shared/db";
import { getUserByLogin } from "./users.repository";
describe("Case-insensitive usernames on a binary database collation", () => {
  it.each(["ADMIN", "admin", " AdMiN "])("canonicalizes %s and compares LOWER of both stored identifiers", async identifier => {
    const where = vi.fn((_condition: unknown) => ({ limit: vi.fn(async () => [{ id: 1, username: "ADMIN" }]) }));
    vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: () => ({ where }) }) } as any);
    await expect(getUserByLogin(identifier)).resolves.toMatchObject({ id: 1, username: "ADMIN" });
    const query = new MySqlDialect().sqlToQuery(where.mock.calls[0][0] as any);
    expect(query.sql).toContain("LOWER(`users`.`username`)");
    expect(query.sql).toContain("LOWER(`users`.`email`)");
    expect(query.params).toEqual(["admin", "admin"]);
  });
});
