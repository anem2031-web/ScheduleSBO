import fs from "node:fs/promises";
import path from "node:path";
import {connect,trialRoot} from "./trial-database.mjs";
import {verifiedBackup} from "./apply-trial-migration.mjs";
const c=await connect();
try {
 await verifiedBackup(c);
 const [[target]]=await c.query("SELECT @@session.time_zone AS sessionZone, @@global.time_zone AS globalZone");
 const [before]=await c.query("SELECT id,workerId,checkInTime,checkOutTime,actualHours FROM attendance WHERE notes = ? AND checkInTime IS NOT NULL AND checkOutTime IS NOT NULL",["بيانات اختبار حضور اصطناعية وليست من جهاز البصمة"]);
 if(process.argv[2]!=="--apply-synthetic-only")throw new Error("Explicit synthetic reconciliation flag required");
 await fs.writeFile(path.join(trialRoot,"synthetic-attendance-before.json"),JSON.stringify(before,null,2));
 const [result]=await c.query("UPDATE attendance SET actualHours=ROUND(TIMESTAMPDIFF(SECOND,checkInTime,checkOutTime)/3600,2) WHERE notes = ? AND checkInTime IS NOT NULL AND checkOutTime IS NOT NULL",["بيانات اختبار حضور اصطناعية وليست من جهاز البصمة"]);
 const report={changed:result.changedRows,matched:before.length,timeZone:target,originalTimestampsPreserved:true,onlySyntheticRows:true};
 await fs.writeFile(path.join(trialRoot,"synthetic-attendance-reconciliation.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}finally{await c.end();}
