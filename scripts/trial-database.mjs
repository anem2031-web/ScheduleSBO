import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const trialRoot = path.resolve(".implementation-qa/full-trial-20261018");
export const backupRoot = path.resolve(".implementation-backups/20261018-full-trial/database");
export const ident = value => "`" + String(value).replaceAll("`", "``") + "`";
export async function connect() {
  const url = new URL(process.env.DATABASE_URL || "mysql://missing");
  if (!url.pathname.slice(1)) throw new Error("DATABASE_URL is required");
  return mysql.createConnection({host:url.hostname,port:Number(url.port||4000),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:decodeURIComponent(url.pathname.slice(1)),ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true},dateStrings:true,supportBigNumbers:true,bigNumberStrings:true,connectTimeout:20000,timezone:"Z"});
}
export async function inventory(connection) {
  const [[target]] = await connection.query("SELECT DATABASE() AS name, VERSION() AS version");
  const [tables] = await connection.query("SHOW FULL TABLES");
  const entries = [];
  for(const table of tables) {
    const name = Object.values(table)[0], kind = Object.values(table)[1];
    if(kind!=="BASE TABLE") continue;
    const [[count]] = await connection.query(`SELECT COUNT(*) AS count FROM ${ident(name)}`);
    entries.push({name,count:Number(count.count)});
  }
  return {database:target.name,version:target.version,tables:entries};
}
export async function backup(connection) {
  await fs.mkdir(backupRoot,{recursive:true});
  const file = path.join(backupRoot,"before-reset.sql");
  try { await fs.access(file); throw new Error("Backup already exists; refusing to overwrite"); } catch(error) { if(error.code!=="ENOENT") throw error; }
  const before = await inventory(connection);
  const statements = ["-- Full database backup before explicitly authorized trial reset", "SET NAMES utf8mb4;", "SET time_zone = '+00:00';", "SET FOREIGN_KEY_CHECKS = 0;"];
  const manifest = {createdAt:new Date().toISOString(),...before,rows:0};
  await connection.beginTransaction();
  try {
    for (const {name,count} of before.tables) {
      const [[definition]] = await connection.query(`SHOW CREATE TABLE ${ident(name)}`);
      statements.push(`DROP TABLE IF EXISTS ${ident(name)};`,definition["Create Table"]+";");
      const [rows] = await connection.query(`SELECT * FROM ${ident(name)}`);
      if(rows.length!==count) throw new Error(`Table changed during backup: ${name}`);
      for(const row of rows) {
        const columns=Object.keys(row);
        const values=columns.map(key => {
          const value=row[key];
          return value!==null && typeof value==="object"&&!Buffer.isBuffer(value)&&!(value instanceof Date)?JSON.stringify(value):value;
        });
        statements.push(mysql.format(`INSERT INTO ${ident(name)} (${columns.map(ident).join(",")}) VALUES (${values.map(()=>"?").join(",")});`,values));
      }
      manifest.rows+=rows.length;
    }
    await connection.commit();
  } catch(error) {await connection.rollback();throw error;}
  statements.push("SET FOREIGN_KEY_CHECKS = 1;");
  const sql=statements.join("\n")+"\n";
  manifest.sha256=crypto.createHash("sha256").update(sql).digest("hex");
  manifest.bytes=Buffer.byteLength(sql);
  await fs.writeFile(file,sql,{flag:"wx"});
  const saved=await fs.readFile(file);
  if(crypto.createHash("sha256").update(saved).digest("hex")!==manifest.sha256)throw new Error("Backup verification failed");
  await fs.writeFile(path.join(backupRoot,"manifest.json"),JSON.stringify(manifest,null,2),{flag:"wx"});
  console.log(JSON.stringify({backup:file,database:manifest.database,tables:manifest.tables.length,rows:manifest.rows,bytes:manifest.bytes,verified:true}));
  return manifest;
}
async function main() {
  const command=process.argv[2];
  if(!["inspect","backup"].includes(command))throw new Error("Use inspect or backup");
  const connection=await connect();
  try {
    if(command==="backup")await backup(connection);
    else {
      const result=await inventory(connection);
      await fs.mkdir(trialRoot,{recursive:true});
      await fs.writeFile(path.join(trialRoot,"before-inventory.json"),JSON.stringify(result,null,2));
      console.log(JSON.stringify(result));
    }
  } finally {await connection.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename)main().catch(error=>{console.error({code:error.code,message:error.message});process.exitCode=1;});
