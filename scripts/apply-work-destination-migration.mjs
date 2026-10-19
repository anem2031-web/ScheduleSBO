import { connect, ident } from "./trial-database.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const columns = { costCenterId: "branches", locationId: "locations", jobTitleId: "job_titles" };
export function validateMigrationArguments(args) {
  if (args.some((arg) => !["--execute", "--database=SBO", "--maintenance-confirmed"].includes(arg)) || !args.includes("--database=SBO")) throw new Error("Pass --database=SBO; use --execute --maintenance-confirmed only after a verified backup");
  if (args.includes("--execute") && !args.includes("--maintenance-confirmed")) throw new Error("Stop the app and verify a fresh backup before applying the additive migration");
  return args.includes("--execute");
}
async function main() {
  const execute = validateMigrationArguments(process.argv.slice(2));
  const connection = await connect();
  const results = [];
  try {
    const [[target]] = await connection.query("SELECT DATABASE() AS name");
    if (target.name !== "SBO") throw new Error("Unexpected database; refusing migration");
    const [before] = await connection.query("SELECT COLUMN_NAME AS name, DATA_TYPE AS type, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='shift_assignments'");
    if (!before.some((item) => item.name === "departmentId")) throw new Error("Expected shift_assignments schema is missing");
    for (const name of Object.keys(columns)) {
      const existing = before.find((item) => item.name === name);
      if (existing && (existing.type !== "int" || existing.nullable !== "YES")) throw new Error(`Existing ${name} has an incompatible definition`);
      if (!existing && execute) await connection.query(`ALTER TABLE ${ident("shift_assignments")} ADD COLUMN ${ident(name)} int NULL`);
      results.push({ column: name, action: existing ? "already-present" : execute ? "added" : "would-add" });
    }
    const [foreignKeys] = await connection.query("SELECT COLUMN_NAME AS name, REFERENCED_TABLE_NAME AS target, REFERENCED_COLUMN_NAME AS targetColumn FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='shift_assignments' AND REFERENCED_TABLE_NAME IS NOT NULL");
    for (const [name, table] of Object.entries(columns)) {
      const existing = foreignKeys.find((item) => item.name === name);
      if (existing && (existing.target !== table || existing.targetColumn !== "id")) throw new Error(`Existing foreign key for ${name} differs`);
      if (!existing && execute) await connection.query(`ALTER TABLE ${ident("shift_assignments")} ADD CONSTRAINT ${ident(`shift_assignments_${name}_${table}_id_fk`)} FOREIGN KEY (${ident(name)}) REFERENCES ${ident(table)} (${ident("id")})`);
      results.push({ foreignKey: name, action: existing ? "already-present" : execute ? "added" : "would-add" });
    }
    const result = { database: "SBO", executed: execute, additiveOnly: true, rowsChanged: 0, results, timestamp: new Date().toISOString() };
    if (execute) {
      const directory = path.resolve(".implementation-qa/sample-schedules-20261019");
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, "work-destination-migration.json"), JSON.stringify(result, null, 2));
    }
    console.log(JSON.stringify(result));
  } finally { await connection.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) main().catch((error) => { console.error({ code: error.code, message: error.message }); process.exitCode = 1; });
