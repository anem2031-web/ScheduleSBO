import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { connect, ident } from "./trial-database.mjs";
import { splitSqlStatements, validateDump } from "./restore-trial-backup.mjs";

export const expectedDatabase = "SBO";
const backupDirectory = path.resolve(".implementation-backups/20261019-operational-reset/database");
const reportDirectory = path.resolve(".implementation-qa/operational-reset-20261019");
export const supportedTables = new Set([
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
const fullPreservation = new Set(["permissions", "__drizzle_migrations"]);
const canonicalDays = new Set(["SICK_LEAVE", "ANNUAL_LEAVE", "WEEKLY_REST", "HOLIDAY"]);
export const deletionOrder = [
  "schedule_exceptions", "attendance_corrections", "payroll_details", "payroll_sheets", "overtimes",
  "incentives", "evaluations", "worker_calendar", "time_balances", "shifts", "requests",
  "attendance", "shift_assignments", "schedule_periods", "schedules", "operating_periods",
  "shift_templates", "evaluation_templates", "incentive_rules", "incentive_categories",
  "worker_salaries", "worker_schedule_settings", "supervisor_assignments", "workers",
  "job_titles", "branch_locations", "location_departments", "branches", "locations",
  "departments", "overtime_reasons", "notifications", "audit_logs", "translations",
  "sessions", "user_roles", "user_access_scopes", "login_attempts", "system_settings",
  "role_permissions", "roles", "day_types", "users",
];
if (new Set(deletionOrder).size !== deletionOrder.length ||
  [...supportedTables].some((name) => !fullPreservation.has(name) && !deletionOrder.includes(name)) ||
  deletionOrder.some((name) => !supportedTables.has(name) || fullPreservation.has(name))) {
  throw new Error("Reset table coverage is incomplete or duplicated");
}
export const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const rowsDigest = (rows) => digest(rows.map((row) => JSON.stringify(row)).sort().join("\n"));
export const rawJson = (field, next) => field.type === "JSON" ? field.string("utf8") : next();
async function readRows(connection, name) {
  const [rows] = await connection.query({ sql: `SELECT * FROM ${ident(name)}`, typeCast: rawJson });
  return rows;
}
async function configure(connection) {
  const [[target]] = await connection.query("SELECT DATABASE() AS name, @@SESSION.sql_mode AS sqlMode");
  if (target.name !== expectedDatabase) throw new Error("Database target differs from the explicitly authorized database");
  if (String(target.sqlMode).split(",").includes("NO_BACKSLASH_ESCAPES")) throw new Error("SQL mode is incompatible with the backup escaping format");
  await connection.query("SET NAMES utf8mb4");
  await connection.query("SET SESSION time_zone = '+00:00'");
}

/** Read one consistent snapshot. Values and credential hashes are never printed. */
async function capture(connection) {
  const [[target]] = await connection.query("SELECT DATABASE() AS name, VERSION() AS version");
  const [listed] = await connection.query("SHOW FULL TABLES");
  const names = listed.map((entry) => {
    const [name, kind] = Object.values(entry);
    if (kind !== "BASE TABLE" || !supportedTables.has(name)) throw new Error(`Unreviewed table or view: ${name}`);
    return name;
  }).sort();
  const missing = [...supportedTables].filter((name) => name !== "__drizzle_migrations" && !names.includes(name));
  if (missing.length) throw new Error("Required application tables are missing");
  const [columns] = await connection.query("SELECT TABLE_NAME, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()");
  if (columns.some((column) => /(?:VIRTUAL|STORED)\s+GENERATED|GENERATED\s+(?:VIRTUAL|STORED)/i.test(column.EXTRA))) throw new Error("Generated-column backup requires separate review");
  const tables = [];
  const records = new Map();
  for (const name of names) {
    const [[definition]] = await connection.query(`SHOW CREATE TABLE ${ident(name)}`);
    const rows = await readRows(connection, name);
    const createSql = definition["Create Table"];
    records.set(name, rows);
    tables.push({ name, count: rows.length, schemaSha256: digest(createSql), dataSha256: rowsDigest(rows), createSql });
  }
  return { database: target.name, version: target.version, tables, records };
}

export function retainedRows(records, permissionCodes) {
  const retained = new Map([...records].map(([name]) => [name, []]));
  const admins = (records.get("users") ?? []).filter((row) => String(row.username).toUpperCase() === "ADMIN" && row.role === "admin" && Number(row.isActive) === 1);
  if (admins.length !== 1 || Number(admins[0].id) !== 1 || !admins[0].passwordHash) throw new Error("Exactly the current active ADMIN account (id 1) with existing credentials must be retained");
  retained.set("users", admins);
  const permissions = records.get("permissions") ?? [];
  if (permissions.length !== permissionCodes.size ||
    new Set(permissions.map((row) => row.code)).size !== permissionCodes.size ||
    new Set(permissions.map((row) => String(row.id))).size !== permissions.length ||
    permissions.some((row) => !permissionCodes.has(row.code))) throw new Error("Permission dictionary differs from the reviewed built-in catalog");
  retained.set("permissions", permissions);
  if (records.has("__drizzle_migrations")) retained.set("__drizzle_migrations", records.get("__drizzle_migrations"));
  const dayTypes = (records.get("day_types") ?? []).filter((row) => canonicalDays.has(row.code));
  if (dayTypes.length !== canonicalDays.size ||
    new Set(dayTypes.map((row) => row.code)).size !== canonicalDays.size ||
    new Set(dayTypes.map((row) => String(row.id))).size !== dayTypes.length) throw new Error("Built-in day types are incomplete or duplicated");
  retained.set("day_types", dayTypes);
  const roles = (records.get("roles") ?? []).filter((row) => Number(row.is_system) === 1);
  const roleIds = new Set(roles.map((row) => String(row.id)));
  const permissionIds = new Set(permissions.map((row) => String(row.id)));
  retained.set("roles", roles);
  retained.set("role_permissions", (records.get("role_permissions") ?? []).filter((row) => roleIds.has(String(row.role_id)) && permissionIds.has(String(row.permission_id))));
  return retained;
}

async function permissionCatalog() {
  const source = await fs.readFile("shared/access-control.ts", "utf8");
  const codes = new Set([...source.matchAll(/\["([a-z_]+:[a-z_*]+)", "([^"]+)", "([^"]+)"\]/g)].map((match) => match[1]));
  if (codes.size < 40) throw new Error("Built-in permission catalog is unavailable");
  return codes;
}
function summary(snapshot, retained) {
  return {
    database: snapshot.database,
    tables: snapshot.tables.map(({ name, count }) => ({ name, before: count, after: retained.get(name).length, deleted: count - retained.get(name).length })),
    retainedAdmin: { id: 1, username: "ADMIN", credentialsUnchanged: true },
    schemaAndIdentityCountersUnchanged: true,
  };
}

async function makeBackup(connection) {
  await fs.mkdir(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory, "before-operational-reset.sql");
  try { await fs.access(backupPath); throw new Error("Backup exists; refusing to overwrite it"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await connection.beginTransaction();
  let snapshot;
  try { snapshot = await capture(connection); await connection.commit(); }
  catch (error) { await connection.rollback(); throw error; }
  const sql = ["-- Full safety backup before the user-authorized operational-data reset", "SET NAMES utf8mb4;", "SET time_zone = '+00:00';", "SET FOREIGN_KEY_CHECKS = 0;"];
  for (const table of snapshot.tables) {
    sql.push(`DROP TABLE IF EXISTS ${ident(table.name)};`, table.createSql + ";");
    for (const row of snapshot.records.get(table.name)) {
      const columns = Object.keys(row);
      sql.push(mysql.format(`INSERT INTO ${ident(table.name)} (${columns.map(ident).join(",")}) VALUES (${columns.map(() => "?").join(",")});`, columns.map((column) => row[column])));
    }
  }
  sql.push("SET FOREIGN_KEY_CHECKS = 1;");
  const bytes = Buffer.from(sql.join("\n") + "\n");
  const manifest = {
    createdAt: new Date().toISOString(), database: snapshot.database, version: snapshot.version,
    tables: snapshot.tables.map(({ createSql, ...table }) => table),
    rows: snapshot.tables.reduce((sum, table) => sum + table.count, 0), bytes: bytes.length, sha256: digest(bytes),
    rawJsonPreserved: true, sessionTimeZone: "+00:00", applicationWritersPaused: true,
  };
  await fs.writeFile(backupPath, bytes, { flag: "wx" });
  await fs.writeFile(path.join(backupDirectory, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
  await verifyBackup();
  return manifest;
}

export async function verifyBackup() {
  const manifest = JSON.parse(await fs.readFile(path.join(backupDirectory, "manifest.json"), "utf8"));
  const bytes = await fs.readFile(path.join(backupDirectory, "before-operational-reset.sql"));
  if (!Array.isArray(manifest.tables) || !manifest.tables.length ||
    new Set(manifest.tables.map((table) => table.name)).size !== manifest.tables.length ||
    manifest.tables.some((table) => !supportedTables.has(table.name) || !Number.isSafeInteger(table.count) || table.count < 0)) throw new Error("Invalid backup manifest table list");
  if (manifest.database !== expectedDatabase || bytes.length !== manifest.bytes || digest(bytes) !== manifest.sha256) throw new Error("Backup database, size or SHA-256 mismatch");
  if (manifest.rows !== manifest.tables.reduce((sum, table) => sum + table.count, 0)) throw new Error("Backup row-count mismatch");
  validateDump(splitSqlStatements(bytes.toString("utf8")), manifest);
  return manifest;
}

async function assertNoOrphans(connection) {
  const [references] = await connection.query("SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION");
  const groups = Map.groupBy(references, (reference) => `${reference.TABLE_NAME}/${reference.CONSTRAINT_NAME}`);
  for (const group of groups.values()) {
    const first = group[0];
    const join = group.map((item) => `c.${ident(item.COLUMN_NAME)} = p.${ident(item.REFERENCED_COLUMN_NAME)}`).join(" AND ");
    const nonNull = group.map((item) => `c.${ident(item.COLUMN_NAME)} IS NOT NULL`).join(" AND ");
    const [[result]] = await connection.query(`SELECT COUNT(*) AS count FROM ${ident(first.TABLE_NAME)} c LEFT JOIN ${ident(first.REFERENCED_TABLE_NAME)} p ON ${join} WHERE ${nonNull} AND p.${ident(first.REFERENCED_COLUMN_NAME)} IS NULL`);
    if (Number(result.count)) throw new Error(`Remaining foreign-key orphans in ${first.TABLE_NAME}`);
  }
}

export function validateArguments(arguments_) {
  const allowed = new Set(["--backup", "--verify", "--execute", "--maintenance-confirmed", `--database=${expectedDatabase}`, "--confirm=CLEAR-TRIAL-DATA"]);
  if (arguments_.some((argument) => !allowed.has(argument)) || ["--backup", "--verify", "--execute"].filter((argument) => arguments_.includes(argument)).length > 1) throw new Error("Unsupported reset arguments");
  if ((arguments_.includes("--backup") || arguments_.includes("--execute")) && (!arguments_.includes("--maintenance-confirmed") || !arguments_.includes(`--database=${expectedDatabase}`))) throw new Error("Explicit database and maintenance confirmation are required");
  if (arguments_.includes("--execute") && !arguments_.includes("--confirm=CLEAR-TRIAL-DATA")) throw new Error("Explicit reset confirmation is required");
}

async function execute(connection, manifest, codes) {
  const [[session]] = await connection.query("SELECT @@SESSION.foreign_key_checks AS fk");
  await connection.query("SET SESSION foreign_key_checks = 0");
  let committed = false;
  try {
    await connection.beginTransaction();
    const before = await capture(connection);
    if (before.tables.length !== manifest.tables.length || before.tables.some((table) => {
      const saved = manifest.tables.find((entry) => entry.name === table.name);
      return !saved || saved.count !== table.count || saved.schemaSha256 !== table.schemaSha256 || saved.dataSha256 !== table.dataSha256;
    })) throw new Error("Database differs from the verified backup; deletion refused");
    const retained = retainedRows(before.records, codes);
    for (const name of deletionOrder) {
      if (!before.records.has(name) || fullPreservation.has(name)) continue;
      const keep = retained.get(name);
      if (name === "users") await connection.query("DELETE FROM users WHERE id <> ?", [1]);
      else if (name === "day_types") await connection.query(`DELETE FROM day_types WHERE id NOT IN (${keep.map(() => "?").join(",")})`, keep.map((row) => row.id));
      else if (name === "roles" && keep.length) await connection.query("DELETE FROM roles WHERE is_system IS NULL OR is_system <> 1");
      else if (name === "role_permissions" && keep.length) {
        const ids = retained.get("roles").map((row) => row.id);
        await connection.query(`DELETE FROM role_permissions WHERE role_id NOT IN (${ids.map(() => "?").join(",")})`, ids);
      } else await connection.query(`DELETE FROM ${ident(name)}`);
    }
    for (const { name } of before.tables) {
      const rows = await readRows(connection, name);
      if (rows.length !== retained.get(name).length || rowsDigest(rows) !== rowsDigest(retained.get(name))) throw new Error(`Pre-commit retained-state verification failed: ${name}`);
    }
    await assertNoOrphans(connection);
    await connection.commit();
    committed = true;
    const report = { ...summary(before, retained), committed: true, completedAt: new Date().toISOString(), backupVerified: true, backupDirectory, retainedRows: [...retained.values()].reduce((sum, rows) => sum + rows.length, 0) };
    await fs.mkdir(reportDirectory, { recursive: true });
    await fs.writeFile(path.join(reportDirectory, "reset-result.json"), JSON.stringify(report, null, 2), { flag: "wx" });
    return report;
  } catch (error) {
    if (!committed) { try { await connection.rollback(); } catch {} }
    error.message = `${committed ? "Reset committed; reporting needs attention" : "Reset failed or commit outcome needs verification; do not automatically retry"}: ${error.message}`;
    throw error;
  } finally {
    await connection.query("SET SESSION foreign_key_checks = ?", [Number(session.fk)]);
  }
}

async function main() {
  const args = process.argv.slice(2);
  validateArguments(args);
  if (args.includes("--verify")) {
    const manifest = await verifyBackup();
    console.log(JSON.stringify({ verified: true, offlineOnly: true, database: manifest.database, tables: manifest.tables.length, rows: manifest.rows, bytes: manifest.bytes, sha256: manifest.sha256 }));
    return;
  }
  const connection = await connect();
  try {
    await configure(connection);
    if (args.includes("--backup")) {
      const manifest = await makeBackup(connection);
      console.log(JSON.stringify({ backupVerified: true, database: manifest.database, tables: manifest.tables.length, rows: manifest.rows, bytes: manifest.bytes, backupDirectory }));
    } else if (args.includes("--execute")) {
      const manifest = await verifyBackup();
      console.log(JSON.stringify(await execute(connection, manifest, await permissionCatalog())));
    } else {
      await connection.beginTransaction();
      try {
        const snapshot = await capture(connection);
        const plan = summary(snapshot, retainedRows(snapshot.records, await permissionCatalog()));
        await connection.rollback();
        await fs.mkdir(reportDirectory, { recursive: true });
        await fs.writeFile(path.join(reportDirectory, "reset-plan.json"), JSON.stringify(plan, null, 2));
        console.log(JSON.stringify({ dryRun: true, ...plan }));
      } catch (error) { await connection.rollback(); throw error; }
    }
  } finally { await connection.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) main().catch((error) => {
  console.error({ code: error.code, message: error.message }); process.exitCode = 1;
});
