import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { connect, ident } from "./trial-database.mjs";
import { rawJson, digest, rowsDigest } from "./prepare-operational-database.mjs";
import { splitSqlStatements, validateDump } from "./restore-trial-backup.mjs";

export const expectedDatabase = "SBO";
export const backupDirectory = path.resolve(".implementation-backups/20261020-real-onboarding/database");
const dumpName = "before-onboarding.sql";
const expectedTables = new Set([
  "__drizzle_migrations", "attendance", "attendance_corrections", "audit_logs",
  "branch_locations", "branches", "day_types", "departments", "evaluation_templates",
  "evaluations", "incentive_categories", "incentive_rules", "incentives", "job_titles",
  "location_departments", "locations", "login_attempts", "notifications", "operating_periods",
  "overtime_reasons", "overtimes", "payroll_details", "payroll_sheets", "permissions",
  "requests", "role_permissions", "roles", "schedule_exceptions", "schedule_periods",
  "schedules", "sessions", "shift_assignments", "shift_templates", "shifts",
  "supervisor_assignments", "system_settings", "time_balances", "translations",
  "user_access_scopes", "user_roles", "users", "worker_calendar", "worker_salaries",
  "worker_schedule_settings", "workers",
]);

export function validateArguments(args) {
  const allowed = new Set(["--backup", "--verify", `--database=${expectedDatabase}`]);
  if (new Set(args).size !== args.length || args.some(arg => !allowed.has(arg)))
    throw new Error("Unsupported backup arguments");
  if (args.includes("--backup") === args.includes("--verify"))
    throw new Error("Choose exactly one of --backup or --verify");
  if (!args.includes(`--database=${expectedDatabase}`))
    throw new Error("The explicit --database=SBO target is required");
}

/** TiDB cannot enforce READ ONLY transactions; fail closed on every SQL command in this utility. */
export function assertReadOnlyQuery(query) {
  const sql = typeof query === "string" ? query : query.sql;
  const fixed = new Set([
    "SELECT DATABASE() AS name, @@SESSION.sql_mode AS sqlMode",
    "SELECT DATABASE() AS name, VERSION() AS version",
    "SELECT TABLE_NAME, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()",
    "SHOW FULL TABLES",
    "SET NAMES utf8mb4",
    "SET SESSION time_zone = '+00:00'",
    "SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ",
    "START TRANSACTION WITH CONSISTENT SNAPSHOT",
  ]);
  if (fixed.has(sql)) return;
  const table = sql.match(/^(?:SHOW CREATE TABLE|SELECT \* FROM) `([a-z_]+)`$/)?.[1];
  if (!table || !expectedTables.has(table)) throw new Error("A non-read-only or unreviewed query was blocked");
}
function readQuery(connection, query) {
  assertReadOnlyQuery(query);
  return connection.query(query);
}

async function configure(connection) {
  const [[target]] = await readQuery(connection, "SELECT DATABASE() AS name, @@SESSION.sql_mode AS sqlMode");
  if (target.name !== expectedDatabase)
    throw new Error("Database target differs from the explicitly authorized database");
  if (String(target.sqlMode).split(",").includes("NO_BACKSLASH_ESCAPES"))
    throw new Error("SQL mode is incompatible with the backup escaping format");
  await readQuery(connection, "SET NAMES utf8mb4");
  await readQuery(connection, "SET SESSION time_zone = '+00:00'");
  await readQuery(connection, "SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
}

async function tableNames(connection) {
  const [listed] = await readQuery(connection, "SHOW FULL TABLES");
  const names = listed.map(entry => {
    const [name, kind] = Object.values(entry);
    if (kind !== "BASE TABLE" || !expectedTables.has(name))
      throw new Error("An unreviewed table or view exists; backup stopped");
    return name;
  }).sort();
  if (names.length !== expectedTables.size || [...expectedTables].some(name => !names.includes(name)))
    throw new Error("Expected 45 application and migration tables are not all present");
  return names;
}

/** This utility never executes its dump: only allowlisted reads/session settings and a consistent snapshot. */
async function capture(connection) {
  await readQuery(connection, "START TRANSACTION WITH CONSISTENT SNAPSHOT");
  try {
    const [[target]] = await readQuery(connection, "SELECT DATABASE() AS name, VERSION() AS version");
    const names = await tableNames(connection);
    const [columns] = await readQuery(connection, "SELECT TABLE_NAME, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()");
    if (columns.some(column => /(?:VIRTUAL|STORED)\s+GENERATED|GENERATED\s+(?:VIRTUAL|STORED)/i.test(column.EXTRA)))
      throw new Error("Generated-column backup requires separate review");
    const tables = [];
    const records = new Map();
    for (const name of names) {
      const [[definition]] = await readQuery(connection, `SHOW CREATE TABLE ${ident(name)}`);
      const createSql = definition["Create Table"];
      const [rows] = await readQuery(connection, { sql: `SELECT * FROM ${ident(name)}`, typeCast: rawJson });
      tables.push({ name, count: rows.length, schemaSha256: digest(createSql), dataSha256: rowsDigest(rows), createSql });
      records.set(name, rows);
    }
    // Schema reads are checked again so a concurrent DDL cannot silently change the dump shape.
    const afterNames = await tableNames(connection);
    if (JSON.stringify(names) !== JSON.stringify(afterNames)) throw new Error("Table list changed during backup");
    for (const table of tables) {
      const [[definition]] = await readQuery(connection, `SHOW CREATE TABLE ${ident(table.name)}`);
      if (digest(definition["Create Table"]) !== table.schemaSha256)
        throw new Error(`Table schema changed during backup: ${table.name}`);
    }
    await connection.commit();
    return { database: target.name, version: target.version, tables, records };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function verifyBackup() {
  const manifest = JSON.parse(await fs.readFile(path.join(backupDirectory, "manifest.json"), "utf8"));
  const bytes = await fs.readFile(path.join(backupDirectory, dumpName));
  if (manifest.database !== expectedDatabase || !Array.isArray(manifest.tables) ||
    manifest.tables.length !== expectedTables.size ||
    new Set(manifest.tables.map(table => table.name)).size !== expectedTables.size ||
    manifest.tables.some(table => !expectedTables.has(table.name) || !Number.isSafeInteger(table.count) || table.count < 0 ||
      !/^[a-f0-9]{64}$/.test(table.schemaSha256) || !/^[a-f0-9]{64}$/.test(table.dataSha256)))
    throw new Error("Invalid backup manifest database or table list");
  if (bytes.length !== manifest.bytes || digest(bytes) !== manifest.sha256)
    throw new Error("Backup size or SHA-256 mismatch");
  if (manifest.rows !== manifest.tables.reduce((sum, table) => sum + table.count, 0))
    throw new Error("Backup row-count mismatch");
  const statements = splitSqlStatements(bytes.toString("utf8"));
  validateDump(statements, manifest);
  return { ...manifest, statements: statements.length };
}

async function makeBackup(connection) {
  try {
    await fs.access(backupDirectory);
    throw new Error("Backup directory exists; refusing to overwrite it");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const snapshot = await capture(connection);
  const sql = [
    "-- Read-only full safety snapshot before the approved real employee onboarding",
    "-- DROP/CREATE/INSERT statements below are backup contents only; this utility never executes them.",
    "SET NAMES utf8mb4;", "SET time_zone = '+00:00';", "SET FOREIGN_KEY_CHECKS = 0;",
  ];
  for (const table of snapshot.tables) {
    sql.push(`DROP TABLE IF EXISTS ${ident(table.name)};`, table.createSql + ";");
    for (const row of snapshot.records.get(table.name)) {
      const columns = Object.keys(row);
      sql.push(mysql.format(
        `INSERT INTO ${ident(table.name)} (${columns.map(ident).join(",")}) VALUES (${columns.map(() => "?").join(",")});`,
        columns.map(column => row[column]),
      ));
    }
  }
  sql.push("SET FOREIGN_KEY_CHECKS = 1;");
  const bytes = Buffer.from(sql.join("\n") + "\n");
  const manifest = {
    createdAt: new Date().toISOString(), database: snapshot.database, version: snapshot.version,
    purpose: "Safety backup before real employee onboarding and optional hire dates",
    tables: snapshot.tables.map(({ createSql, ...table }) => table),
    rows: snapshot.tables.reduce((sum, table) => sum + table.count, 0),
    bytes: bytes.length, sha256: digest(bytes), rawJsonPreserved: true, sessionTimeZone: "+00:00",
    consistentSnapshot: true, readOnlyEnforcement: "utility-query-allowlist", engineReadOnlyMode: false,
    applicationWritersPaused: false,
    restoreExecutionTested: false,
  };
  // Exclusive directory and file creation prevents replacement of any older safety snapshot.
  await fs.mkdir(path.dirname(backupDirectory), { recursive: true });
  await fs.mkdir(backupDirectory, { recursive: false });
  await fs.writeFile(path.join(backupDirectory, dumpName), bytes, { flag: "wx" });
  await fs.writeFile(path.join(backupDirectory, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
  return verifyBackup();
}

async function main() {
  const args = process.argv.slice(2);
  validateArguments(args);
  let manifest;
  if (args.includes("--verify")) manifest = await verifyBackup();
  else {
    const connection = await connect();
    try {
      await configure(connection);
      manifest = await makeBackup(connection);
    } finally { await connection.end(); }
  }
  console.log(JSON.stringify({
    backupVerified: true, offlineVerificationOnly: args.includes("--verify"),
    database: manifest.database, tables: manifest.tables.length, rows: manifest.rows,
    counts: manifest.tables.map(({ name, count }) => ({ name, count })),
    bytes: manifest.bytes, sha256: manifest.sha256, statements: manifest.statements,
    backupDirectory, restoreExecutionTested: false,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename)
  main().catch(error => { console.error({ code: error.code, message: error.message }); process.exitCode = 1; });

