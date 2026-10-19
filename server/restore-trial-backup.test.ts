import { describe, expect, it } from "vitest";
import { splitSqlStatements, validateDump } from "../scripts/restore-trial-backup.mjs";

describe("Trial backup SQL parser and restore validation", () => {
  it("keeps semicolons in quoted values and escaped quotes", () => {
    const statements = splitSqlStatements("INSERT INTO `x` VALUES ('a;b', 'it\\'s;c', \"x;y\"); SELECT 1;");
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("a;b");
  });
  it("keeps doubled quotes and backtick identifiers intact", () => {
    expect(splitSqlStatements("INSERT INTO `x;``y` VALUES ('it''s;ok');")).toHaveLength(1);
  });
  it("ignores semicolons inside line and block comments", () => {
    expect(splitSqlStatements("-- note;\nSET NAMES utf8mb4; # note;\n/* block; */ SELECT 1;")).toHaveLength(2);
  });
  it("retains TiDB create-table comments", () => {
    expect(splitSqlStatements("CREATE TABLE `x` (`id` INT PRIMARY KEY /*T![clustered_index] CLUSTERED */);")[0]).toContain("/*T!");
  });
  it.each(["SELECT 'unterminated;", "/* unterminated;", "SELECT 1"])("rejects malformed or truncated input: %s", source => {
    expect(() => splitSqlStatements(source)).toThrow();
  });
  it("validates the generated schema and one INSERT per row", () => {
    const statements = splitSqlStatements("-- backup\nSET NAMES utf8mb4; SET time_zone = '+00:00'; SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS `x`; CREATE TABLE `x` (`id` INT); INSERT INTO `x` (`id`) VALUES (1); SET FOREIGN_KEY_CHECKS = 1;");
    expect(validateDump(statements, { tables: [{ name: "x", count: 1 }] })).toBe(1);
  });
  it("rejects unknown tables", () => {
    expect(() => validateDump(["DROP TABLE IF EXISTS `other`"], { tables: [{ name: "x", count: 0 }] })).toThrow();
  });
  it("rejects missing inserts instead of accepting an incomplete backup", () => {
    expect(() => validateDump(["DROP TABLE IF EXISTS `x`", "CREATE TABLE `x` (`id` INT)"], { tables: [{ name: "x", count: 1 }] })).toThrow();
  });
  it("rejects statements outside the generated backup format", () => {
    expect(() => validateDump(["DELETE FROM `x`"], { tables: [{ name: "x", count: 0 }] })).toThrow();
  });
});
