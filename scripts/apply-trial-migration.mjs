import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {connect,backupRoot,ident,trialRoot} from "./trial-database.mjs";

export async function verifiedBackup(connection) {
 const manifest=JSON.parse(await fs.readFile(path.join(backupRoot,"manifest.json"),"utf8"));
 const bytes=await fs.readFile(path.join(backupRoot,"before-reset.sql"));
 if(crypto.createHash("sha256").update(bytes).digest("hex")!==manifest.sha256)throw new Error("Backup checksum mismatch");
 const [[target]]=await connection.query("SELECT DATABASE() AS name");
 if(target.name!==manifest.database)throw new Error("Backup belongs to another database");
 return manifest;
}
export async function migrate(connection) {
 await verifiedBackup(connection);
 const additions={
  users:{username:"varchar(64) NULL"},
  workers:{preferredLanguage:"varchar(10) NOT NULL DEFAULT 'ar'",locationId:"int NULL",userId:"int NULL"},
  worker_calendar:{requestId:"int NULL"},
  requests:{leaveKind:"enum('sick','annual','permission') NULL",startDate:"date NULL",endDate:"date NULL",startTime:"varchar(5) NULL",endTime:"varchar(5) NULL",permissionMode:"enum('excused','make_up') NULL",decisionNote:"text NULL",cancelledBy:"int NULL",cancelledAt:"timestamp NULL"},
  shift_templates:{breakMinutes:"int NOT NULL DEFAULT 0"},
  shift_assignments:{breakMinutes:"int NOT NULL DEFAULT 0"},
  overtimes:{overtimeKind:"enum('planned','actual') NOT NULL DEFAULT 'actual'",assignmentId:"int NULL",attendanceId:"int NULL",requestedBy:"int NULL",requestedStartTime:"time NULL",requestedEndTime:"time NULL",originalEndTime:"time NULL",reasonText:"text NULL",reviewStatus:"enum('pending','approved','rejected') NOT NULL DEFAULT 'pending'",reviewedBy:"int NULL",reviewedAt:"timestamp NULL",reviewNote:"text NULL",decisionNote:"text NULL"},
 };
 const applied=[],rollback=[];
 for(const [table,columns]of Object.entries(additions)) {
  const [existing]=await connection.query(`SHOW COLUMNS FROM ${ident(table)}`);
  for(const [column,definition]of Object.entries(columns))if(!existing.some(c=>c.Field===column)) {
   const statement=`ALTER TABLE ${ident(table)} ADD COLUMN ${ident(column)} ${definition}`;
   await connection.query(statement);applied.push(statement);rollback.unshift(`ALTER TABLE ${ident(table)} DROP COLUMN ${ident(column)};`);
  }
 }
 for(const [table,column,name]of [["users","username","users_username_unique"],["workers","userId","workers_userId_unique"]]){
  const [indexes]=await connection.query(`SHOW INDEX FROM ${ident(table)}`);
  if(!indexes.some(index=>index.Column_name===column&&Number(index.Non_unique)===0)){
   const statement=`ALTER TABLE ${ident(table)} ADD UNIQUE INDEX ${ident(name)} (${ident(column)})`;
   await connection.query(statement);applied.push(statement);
  }
 }
 await connection.query("CREATE TABLE IF NOT EXISTS user_access_scopes (user_id INT NOT NULL PRIMARY KEY, cost_center_ids JSON NOT NULL, CONSTRAINT trial_scope_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)");
 await connection.query("CREATE TABLE IF NOT EXISTS user_roles (user_id INT NOT NULL, role_id INT NOT NULL, assigned_at INT NOT NULL, assigned_by INT NULL, PRIMARY KEY(user_id,role_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE, FOREIGN KEY(assigned_by) REFERENCES users(id))");
 await connection.query("CREATE TABLE IF NOT EXISTS sessions (id VARCHAR(255) NOT NULL PRIMARY KEY, user_id INT NOT NULL, token VARCHAR(512) NOT NULL UNIQUE, expires_at INT NOT NULL, created_at INT NOT NULL, revoked_at INT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)");
 await fs.mkdir(trialRoot,{recursive:true});
 await fs.writeFile(path.join(trialRoot,"migration-result.json"),JSON.stringify({applied,scopeTable:true,when:new Date().toISOString()},null,2));
 const allRollback=Object.entries(additions).reverse().flatMap(([table,columns])=>Object.keys(columns).reverse().map(column=>`ALTER TABLE ${ident(table)} DROP COLUMN ${ident(column)};`));
 await fs.writeFile(path.join(trialRoot,"migration-rollback.sql"),"-- Restore full pre-trial backup to recover previous data. These DDL statements undo trial columns only.\nDROP TABLE IF EXISTS user_access_scopes;\nDROP TABLE IF EXISTS user_roles;\nDROP TABLE IF EXISTS sessions;\n"+allRollback.join("\n"));
 return {addedColumns:applied.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename){const c=await connect();try{console.log(JSON.stringify(await migrate(c)));}finally{await c.end();}}
