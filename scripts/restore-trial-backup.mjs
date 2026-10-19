import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { backupRoot, connect, ident, inventory } from "./trial-database.mjs";

/** Splits this generated MySQL dump without splitting quoted semicolons or comments. */
export function splitSqlStatements(sql) {
  const statements = [];
  let start = 0, state = "plain", quote = "";
  for (let index = 0; index < sql.length; index++) {
    const character = sql[index], next = sql[index + 1];
    if (state === "line") { if (character === "\n") state = "plain"; continue; }
    if (state === "block") { if (character === "*" && next === "/") { state = "plain"; index++; } continue; }
    if (state === "quote") {
      if (character === "\\" && quote !== "`") { index++; continue; }
      if (character === quote) { if (next === quote) index++; else state = "plain"; }
      continue;
    }
    if (character === "#" || character === "-" && next === "-" && /\s/.test(sql[index + 2] || "")) { state = "line"; continue; }
    if (character === "/" && next === "*") { state = "block"; index++; continue; }
    if (["'", '"', "`"].includes(character)) { state = "quote"; quote = character; continue; }
    if (character === ";") { const statement = sql.slice(start, index).trim(); if (statement) statements.push(statement); start = index + 1; }
  }
  if (state === "quote" || state === "block") throw new Error("Unterminated SQL string or comment");
  const tail = sql.slice(start).trim();
  if (tail && !/^(?:--[^\n]*(?:\n|$)|#[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|\s)*$/.test(tail)) throw new Error("Dump ends with an incomplete statement");
  return statements;
}

export function validateDump(statements, manifest) {
  const expected = new Map(manifest.tables.map(table => [table.name, { drop: 0, create: 0, insert: 0, count: table.count }]));
  for (const statement of statements) {
    const source = statement.replace(/^(?:\s|--[^\n]*(?:\n|$)|#[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "");
    if (/^SET (?:NAMES utf8mb4|time_zone\s*=\s*'\+00:00'|FOREIGN_KEY_CHECKS\s*=\s*[01])$/i.test(source)) continue;
    const match = source.match(/^(DROP TABLE IF EXISTS|CREATE TABLE|INSERT INTO)\s+`((?:``|[^`])+)`(?:\s|\(|$)/i);
    if (!match) throw new Error("Unexpected dump statement; refusing to restore");
    const name = match[2].replaceAll("``", "`"), table = expected.get(name);
    if (!table) throw new Error(`Dump references a table absent from the manifest: ${name}`);
    const action = match[1].toUpperCase();
    const kind = action.startsWith("DROP") ? "drop" : action.startsWith("CREATE") ? "create" : "insert";
    table[kind]++;
  }
  for (const [name, table] of expected) {
    if (table.drop !== 1 || table.create !== 1 || table.insert !== table.count) throw new Error(`Dump manifest mismatch for ${name}`);
  }
  return expected.size;
}

async function readVerifiedBackup() {
  const manifest = JSON.parse(await fs.readFile(path.join(backupRoot, "manifest.json"), "utf8"));
  const bytes = await fs.readFile(path.join(backupRoot, "before-reset.sql"));
  if (bytes.length !== manifest.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== manifest.sha256) throw new Error("Backup size or SHA-256 mismatch");
  if (!manifest.database || !Array.isArray(manifest.tables) || !manifest.tables.length || new Set(manifest.tables.map(table => table.name)).size !== manifest.tables.length) throw new Error("Invalid backup manifest");
  if (manifest.tables.some(table => typeof table.name !== "string" || !Number.isSafeInteger(table.count) || table.count < 0) || manifest.rows !== manifest.tables.reduce((sum, table) => sum + table.count, 0)) throw new Error("Invalid backup row counts");
  const statements = splitSqlStatements(bytes.toString("utf8"));
  validateDump(statements, manifest);
  return { manifest, statements };
}

async function captureCurrentDatabase(connection) {
  const current = await inventory(connection);
  const destination = path.join(backupRoot, `before-restore-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`);
  await fs.mkdir(destination, { recursive: false });
  const sql = ["-- Safety snapshot immediately before restoring the pre-trial database", "SET NAMES utf8mb4;", "SET time_zone = '+00:00';", "SET FOREIGN_KEY_CHECKS = 0;"];
  let total = 0;
  await connection.beginTransaction();
  try {
    for (const { name, count } of current.tables) {
      const [[definition]] = await connection.query(`SHOW CREATE TABLE ${ident(name)}`);
      sql.push(`DROP TABLE IF EXISTS ${ident(name)};`, definition["Create Table"] + ";");
      const [rows] = await connection.query(`SELECT * FROM ${ident(name)}`);
      if (rows.length !== count) throw new Error(`Data changed during safety snapshot: ${name}`);
      for (const row of rows) {
        const columns = Object.keys(row), values = columns.map(key => { const value = row[key]; return value !== null && typeof value === "object" && !Buffer.isBuffer(value) && !(value instanceof Date) ? JSON.stringify(value) : value; });
        sql.push(mysql.format(`INSERT INTO ${ident(name)} (${columns.map(ident).join(",")}) VALUES (${values.map(() => "?").join(",")});`, values));
      }
      total += rows.length;
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  sql.push("SET FOREIGN_KEY_CHECKS = 1;");
  const bytes = Buffer.from(sql.join("\n") + "\n"), sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const file = path.join(destination, "before-restore.sql");
  await fs.writeFile(file, bytes, { flag: "wx" });
  if (crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex") !== sha256) throw new Error("Safety snapshot verification failed");
  await fs.writeFile(path.join(destination, "manifest.json"), JSON.stringify({ ...current, rows: total, bytes: bytes.length, sha256, createdAt: new Date().toISOString() }, null, 2), { flag: "wx" });
  return { current, destination };
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const allowed = arguments_.every(argument => argument === "--verify" || argument === "--execute" || argument === "--maintenance-confirmed" || argument.startsWith("--database=") || argument === "--confirm=RESTORE-PRE-TRIAL-BACKUP");
  if (!allowed || arguments_.includes("--verify") && arguments_.includes("--execute")) throw new Error("Unsupported restore arguments");
  const { manifest, statements } = await readVerifiedBackup();
  if (!arguments_.includes("--execute")) {
    console.log(JSON.stringify({ mode: "verified-offline-only", database: manifest.database, tables: manifest.tables.length, rows: manifest.rows, statements: statements.length, checksum: "PASS", databaseConnected: false }));
    return;
  }
  if (!arguments_.includes(`--database=${manifest.database}`) || !arguments_.includes("--confirm=RESTORE-PRE-TRIAL-BACKUP") || !arguments_.includes("--maintenance-confirmed")) throw new Error("Restore requires exact database, destructive confirmation, and maintenance confirmation flags after explicit human authorization");
  const connection = await connect();
  let safetySnapshot;
  try {
    const [[target]] = await connection.query("SELECT DATABASE() AS name");
    if (target.name !== manifest.database) throw new Error("DATABASE_URL target differs from backup manifest");
    const [[mode]] = await connection.query("SELECT @@SESSION.sql_mode AS sqlMode");
    if (String(mode.sqlMode).split(",").includes("NO_BACKSLASH_ESCAPES")) throw new Error("Restore requires MySQL backslash string escaping; incompatible session sql_mode");
    await connection.query("SET time_zone = '+00:00'");
    safetySnapshot = await captureCurrentDatabase(connection);
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const { name } of safetySnapshot.current.tables) await connection.query(`DROP TABLE IF EXISTS ${ident(name)}`);
    for (const statement of statements) await connection.query(statement);
    const after = await inventory(connection);
    if (after.tables.length !== manifest.tables.length || manifest.tables.some(table => after.tables.find(item => item.name === table.name)?.count !== table.count)) throw new Error("Post-restore table/row verification failed");
    console.log(JSON.stringify({ restored: true, database: manifest.database, tables: after.tables.length, rows: manifest.rows, safetySnapshot: safetySnapshot.destination }));
  } catch (error) {
    if (safetySnapshot) console.error(JSON.stringify({ restoreCompleted: false, safetySnapshot: safetySnapshot.destination, warning: "DDL cannot roll back automatically; preserve both backups and investigate before any retry." }));
    throw error;
  } finally {
    try { await connection.query("SET FOREIGN_KEY_CHECKS = 1"); } finally { await connection.end(); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) main().catch(error => { console.error({ code: error.code, message: error.message }); process.exitCode = 1; });
