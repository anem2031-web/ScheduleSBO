import fs from "node:fs/promises";
import path from "node:path";
import { connect, ident } from "./trial-database.mjs";
import { rawJson, rowsDigest } from "./prepare-operational-database.mjs";
import { verifyBackup } from "./backup-worker-phone.mjs";

export function validateMigrationArguments(args) {
  const allowed = new Set(["--execute", "--database=SBO", "--maintenance-confirmed"]);
  if (new Set(args).size !== args.length || args.some(arg => !allowed.has(arg)) || !args.includes("--database=SBO"))
    throw new Error("Pass the explicit --database=SBO target and only reviewed arguments");
  if (args.includes("--execute") && !args.includes("--maintenance-confirmed"))
    throw new Error("Pause the application and verify its fresh backup before execution");
  return args.includes("--execute");
}

async function inventory(connection, tables, omitPhone) {
  const result = {};
  for (const { name } of tables) {
    const [rows] = await connection.query({ sql: `SELECT * FROM ${ident(name)}`, typeCast: rawJson });
    const preserved = name === "workers" && omitPhone
      ? rows.map(({ phoneNumber: _phone, ...original }) => original)
      : rows;
    result[name] = { count: rows.length, dataSha256: rowsDigest(preserved) };
  }
  return result;
}

function assertSameData(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Application data changed; preserve the additive column and investigate, do not restore over newer data");
}

async function main() {
  const execute = validateMigrationArguments(process.argv.slice(2));
  const backup = await verifyBackup();
  const connection = await connect();
  try {
    const [[target]] = await connection.query("SELECT DATABASE() AS name");
    if (target.name !== "SBO") throw new Error("Unexpected database; migration stopped");
    await connection.query("SET SESSION time_zone = '+00:00'");
    const [tables] = await connection.query("SHOW FULL TABLES");
    const names = tables.map(row => { const [name, type] = Object.values(row); if (type !== "BASE TABLE") throw new Error("Unexpected view"); return name; }).sort();
    if (JSON.stringify(names) !== JSON.stringify(backup.tables.map(table => table.name).sort()))
      throw new Error("The backed-up and live table lists differ");
    const [columns] = await connection.query("SELECT COLUMN_NAME AS name, DATA_TYPE AS type, IS_NULLABLE AS nullable, CHARACTER_MAXIMUM_LENGTH AS length FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workers'");
    if (!columns.some(column => column.name === "employeeId") || !columns.some(column => column.name === "fingerprintId"))
      throw new Error("Unexpected workers schema");
    const existing = columns.find(column => column.name === "phoneNumber");
    if (existing && (existing.type !== "varchar" || existing.nullable !== "YES" || Number(existing.length) !== 32))
      throw new Error("The existing phoneNumber column has an incompatible definition");
    const before = await inventory(connection, backup.tables, false);
    if (!existing) assertSameData(Object.fromEntries(backup.tables.map(({ name, count, dataSha256 }) => [name, { count, dataSha256 }])), before);
    if (!existing && execute)
      await connection.query("ALTER TABLE `workers` ADD COLUMN `phoneNumber` varchar(32) NULL");
    const after = await inventory(connection, backup.tables, !existing && execute);
    assertSameData(before, after);
    if (!existing && execute) {
      const [[column]] = await connection.query("SELECT DATA_TYPE AS type, IS_NULLABLE AS nullable, CHARACTER_MAXIMUM_LENGTH AS length FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workers' AND COLUMN_NAME='phoneNumber'");
      if (column?.type !== "varchar" || column.nullable !== "YES" || Number(column.length) !== 32)
        throw new Error("Post-migration phone column verification failed");
      const [[nonNull]] = await connection.query("SELECT COUNT(*) AS count FROM workers WHERE phoneNumber IS NOT NULL");
      if (Number(nonNull.count) !== 0) throw new Error("Unexpected phone values immediately after adding a nullable column");
    }
    const result = {
      timestamp: new Date().toISOString(), database: "SBO", executed: execute,
      action: existing ? "already-present" : execute ? "added" : "would-add",
      column: "workers.phoneNumber", definition: "varchar(32) NULL", additiveOnly: true,
      dmlRowsChanged: 0, existingDataUnchanged: true, tables: names.length,
      rows: Object.values(before).reduce((sum, table) => sum + table.count, 0),
      backupSha256: backup.sha256, countersReset: false,
    };
    if (execute) {
      const directory = path.resolve(".implementation-qa/worker-phone-20261019");
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, "phone-migration.json"), JSON.stringify(result, null, 2));
    }
    console.log(JSON.stringify(result));
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename)
  main().catch(error => { console.error({ code: error.code, message: error.message }); process.exitCode = 1; });
