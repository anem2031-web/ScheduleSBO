import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcrypt";
import {connect,ident,inventory,trialRoot} from "./trial-database.mjs";
import {verifiedBackup} from "./apply-trial-migration.mjs";
import {makeWorkers,intervals,plusDays,weekStart,validateFixture,supervisorIds} from "./full-trial-fixture.mjs";

const centers=[{id:1,code:"RESTAURANTS",nameAr:"مركز المطاعم",nameEn:"Restaurants"},{id:2,code:"PARK",nameAr:"مركز تشغيل الحديقة",nameEn:"Park Operations"},{id:3,code:"MAINTENANCE",nameAr:"مركز الصيانة",nameEn:"Maintenance"},{id:4,code:"CONSTRUCTION",nameAr:"مركز الإنشاءات والبناء",nameEn:"Construction"},{id:5,code:"ADMINISTRATION",nameAr:"مركز الإدارة",nameEn:"Administration"}];
const accounts=[
 {id:1,username:"ADMIN",name:"مسؤول النظام",role:"admin",password:"Admin2026"},
 {id:2,username:"HR01",name:"شؤون إدارية — إعداد الجداول",role:"hr_admin",password:"Test2026"},
 {id:3,username:"HR02",name:"شؤون إدارية — المراجعة والاعتماد",role:"hr_admin",password:"Test2026"},
 {id:10,username:"MAINT",name:"مدير الصيانة",role:"supervisor",password:"Test2026"},
 {id:11,username:"BUILD",name:"مدير الإنشاءات والبناء",role:"supervisor",password:"Test2026"},
 {id:12,username:"REST",name:"مدير المطاعم",role:"supervisor",password:"Test2026"},
 {id:13,username:"PARK",name:"مدير تشغيل الحديقة",role:"supervisor",password:"Test2026"},
 {id:20,username:"GUARD",name:"موظف متابعة الحضور",role:"guard",password:"Test2026"},
 {id:21,username:"FINANCE",name:"موظف المالية التجريبي",role:"finance",password:"Test2026"},
 {id:22,username:"REVIEW",name:"المراجع المالي التجريبي",role:"financial_reviewer",password:"Test2026"},
 {id:23,username:"ACCOUNTS",name:"رئيس الحسابات التجريبي",role:"accounting_head",password:"Test2026"},
 {id:24,username:"MODIFY",name:"موظف التصحيحات التجريبي",role:"modifier",password:"Test2026"},
 {id:25,username:"WORKER",name:"عامل تجريبي — عرض شخصي",role:"worker",password:"Test2026"},
];
async function insert(c,table,rows){
 if(!rows.length)return;
 const columns=Object.keys(rows[0]);
 for(let start=0;start<rows.length;start+=150){const part=rows.slice(start,start+150);try{await c.query(`INSERT INTO ${ident(table)} (${columns.map(ident).join(",")}) VALUES ?`,[part.map(row=>columns.map(key=>{const value=row[key];return value!==null&&typeof value==="object"&&!Buffer.isBuffer(value)?JSON.stringify(value):value;}))]);}catch(error){error.message=`${table}: ${error.message}`;throw error;}}
}
async function permissionSeed(c){
 const text=await fs.readFile("shared/access-control.ts","utf8");
 const catalog=Array.from(text.matchAll(/\["([a-z_]+:[a-z_*]+)", "([^"]+)", "([^"]+)"\]/g)).map(m=>({code:m[1],category:m[2],nameAr:m[3],nameEn:m[1]}));
 if(catalog.length<40)throw new Error("Permission catalog missing");
 const now=Math.floor(Date.now()/1000);
 await insert(c,"permissions",catalog.map((p,i)=>({id:i+1,code:p.code,category:p.category,name_ar:p.nameAr,name_en:p.nameEn,created_at:now})));
 const editor=["workers:read","workers:create","workers:update","org_structure:read","schedule:read","schedule:create","schedule:update","schedule:export","attendance:read","attendance:record","attendance:correct","leave:read","leave:create","leave:cancel","overtime:read","overtime:create","requests:read","requests:create","users:read"];
 const approver=["workers:read","org_structure:read","schedule:read","schedule:approve","schedule:export","attendance:read","attendance:approve","leave:read","leave:approve","leave:cancel","overtime:read","overtime:approve","requests:read","requests:approve","users:read","audit:read"];
 const full=Array.from(new Set([...editor,...approver,"workers:delete","org_structure:manage","schedule:lock","overtime:review"]));
 const viewer=catalog.filter(p=>p.code.endsWith(":read")||p.code==="schedule:export").map(p=>p.code);
 const roles=[{id:1,name_ar:"شؤون إدارية — محرر",name_en:"HR_EDITOR",codes:editor},{id:2,name_ar:"شؤون إدارية — معتمد",name_en:"HR_APPROVER",codes:approver},{id:3,name_ar:"شؤون إدارية — كامل",name_en:"HR_FULL",codes:full},{id:4,name_ar:"عرض فقط",name_en:"HR_VIEWER",codes:viewer}];
 await insert(c,"roles",roles.map(({codes,...r})=>({...r,is_system:0,created_at:now,updated_at:now})));
 await insert(c,"role_permissions",roles.flatMap(r=>catalog.filter(p=>r.codes.includes(p.code)).map(p=>({role_id:r.id,permission_id:catalog.findIndex(x=>x.code===p.code)+1}))));
 await insert(c,"user_roles",[{user_id:2,role_id:1,assigned_at:now,assigned_by:1},{user_id:3,role_id:2,assigned_at:now,assigned_by:1}]);
 await insert(c,"user_access_scopes",[{user_id:2,cost_center_ids:[1]}]);
 return catalog.length;
}
async function main(){
 const fixture=validateFixture();
 if(process.argv[2]==="--validate"){console.log(JSON.stringify(fixture));return;}
 if(process.argv[2]!=="--reset-and-seed-authorized")throw new Error("Explicit reset flag required");
 const c=await connect();
 try{
  const backup=await verifiedBackup(c),before=await inventory(c);
  for(const old of backup.tables){const current=before.tables.find(t=>t.name===old.name);if(current?.count!==old.count)throw new Error("Data changed after backup: "+old.name);}
  await fs.mkdir(trialRoot,{recursive:true});
  await c.query("SET FOREIGN_KEY_CHECKS = 0");
  await c.beginTransaction();
  try{
   for(const {name}of before.tables)if(name!=="__drizzle_migrations")await c.query(`DELETE FROM ${ident(name)}`);
   const hashes=new Map();for(const pass of new Set(accounts.map(a=>a.password)))hashes.set(pass,await bcrypt.hash(pass,12));
   await insert(c,"users",accounts.map(({password,...a})=>({...a,openId:`trial-${a.username.toLowerCase()}`,email:`${a.username.toLowerCase()}@trial.invalid`,loginMethod:"local",passwordHash:hashes.get(password),isActive:1})));
   await insert(c,"branches",centers);
   const locations=Array.from({length:29},(_,i)=>({id:i+1,code:i<18?`REST-${String(i+1).padStart(2,"0")}`:i<27?`WORKSHOP-${i-17}`:i===27?"PARK-SITE":"ADMIN-SITE",nameAr:i<18?`مطعم ${i+1}`:i<27?`ورشة ${i-17}`:i===27?"تشغيل الحديقة":"الإدارة",nameEn:i<18?`Restaurant ${i+1}`:i<27?`Workshop ${i-17}`:i===27?"Park":"Administration"}));
   await insert(c,"locations",locations);
   await insert(c,"departments",locations.map(l=>({id:l.id,code:`DEPT-${l.code}`,nameAr:`قسم ${l.nameAr}`,nameEn:`${l.nameEn} Department`})));
   await insert(c,"branch_locations",locations.map(l=>({branchId:l.id<=18?1:l.id<=24?3:l.id<=27?4:l.id===28?2:5,locationId:l.id})));
   await insert(c,"location_departments",locations.map(l=>({locationId:l.id,departmentId:l.id})));
   await insert(c,"job_titles",locations.map(l=>({id:l.id,code:`JOB-${l.code}`,titleAr:l.id<=18?"عامل مطعم":l.id<=27?"فني ورشة":l.id===28?"عامل تشغيل":"موظف إداري",titleEn:"Trial position",departmentId:l.id,effectiveFrom:"2026-01-01"})));
   await insert(c,"day_types",[{id:1,code:"SICK_LEAVE",nameAr:"إجازة مرضية",nameEn:"Sick leave"},{id:2,code:"ANNUAL_LEAVE",nameAr:"إجازة سنوية",nameEn:"Annual leave"},{id:3,code:"WEEKLY_REST",nameAr:"راحة أسبوعية",nameEn:"Weekly rest"},{id:4,code:"HOLIDAY",nameAr:"عطلة رسمية",nameEn:"Holiday"}]);
   await insert(c,"overtime_reasons",[{id:1,code:"COVER",reasonAr:"تغطية غياب عامل",reasonEn:"Absence coverage"},{id:2,code:"DEMAND",reasonAr:"حاجة تشغيلية",reasonEn:"Operational demand"}]);
   const workers=makeWorkers();
   await insert(c,"workers",workers.map(({mask,group,centerId,requiredMinutes,restDay,...w})=>w));
   await insert(c,"worker_schedule_settings",workers.map(w=>({workerId:w.id,requiredHoursPerDay:String(w.requiredMinutes/60),standardMonthlyHours:"0",maxDailyHours:String(w.requiredMinutes/60),branch:centers.find(b=>b.id===w.centerId).code,weeklyRestDay:w.restDay,patternType:intervals(w).length>1?"split":"single",p1Start:intervals(w)[0].startTime,p1End:intervals(w)[0].endTime,p2Start:intervals(w)[1]?.startTime??null,p2End:intervals(w)[1]?.endTime??null})));
   await insert(c,"supervisor_assignments",workers.flatMap(w=>supervisorIds.filter((_,bit)=>w.mask&(1<<bit)).map((supervisorId,i)=>({workerId:w.id,supervisorId,assignmentType:i===0?"primary":"secondary",effectiveFrom:"2026-01-01",effectiveTo:null}))));
   const permissionCount=await permissionSeed(c);
   const start=weekStart(),assignmentRows=[],templates=[],keys=new Map();
   const weeks=[plusDays(start,-7),start,plusDays(start,7)];
   await insert(c,"schedule_periods",weeks.map((week,i)=>({id:i+1,name:`تجربة 400 عامل — ${week}`,startDate:week,endDate:plusDays(week,6),status:"draft",createdBy:1})));
   for(let p=0;p<weeks.length;p++)for(const w of workers)for(let day=0;day<7;day++){
    const date=plusDays(weeks[p],day);if(new Date(date+"T00:00:00Z").getUTCDay()===w.restDay)continue;
    for(const slot of intervals(w)){
     const key=`${slot.startTime}-${slot.endTime}-${slot.breakMinutes}`;
     if(!keys.has(key)){const id=keys.size+1;keys.set(key,id);templates.push({id,code:`TRIAL-${id}`,nameAr:`فترة ${slot.startTime} — ${slot.endTime}`,nameEn:`Shift ${key}`,startTime:slot.startTime,endTime:slot.endTime,crossesMidnight:slot.endTime<slot.startTime?1:0,durationMinutes:slot.plannedMinutes+slot.breakMinutes,breakMinutes:slot.breakMinutes,createdBy:1});}
     assignmentRows.push({periodId:p+1,workerId:w.id,shiftTemplateId:keys.get(key),departmentId:w.departmentId,workDate:date,...slot,crossesMidnight:slot.endTime<slot.startTime?1:0,status:"planned",createdBy:1});
    }
   }
   await insert(c,"shift_templates",templates);
   await insert(c,"shift_assignments",assignmentRows);
   await insert(c,"time_balances",weeks.flatMap((_,i)=>workers.map(w=>({workerId:w.id,periodId:i+1,requiredMinutes:w.requiredMinutes*6,scheduledMinutes:w.requiredMinutes*6,executedMinutes:0,remainingMinutes:0}))));
   const punches=assignmentRows.filter(a=>a.periodId===1||a.periodId===2&&a.workDate===start).map((a,i)=>{
    const startDate=new Date(`${a.workDate}T${a.startTime}:00+03:00`),endDate=new Date(`${a.endTime<a.startTime?plusDays(a.workDate,1):a.workDate}T${a.endTime}:00+03:00`);
    if(i%29===0)return{workerId:a.workerId,attendanceDate:a.workDate,checkInTime:null,checkOutTime:null,actualHours:"0",status:"absent",notes:"بيانات اختبار حضور اصطناعية",recordedBy:20};
    if(i%17===0)startDate.setUTCMinutes(startDate.getUTCMinutes()+15);
    if(i%23===0)endDate.setUTCMinutes(endDate.getUTCMinutes()+60);
    // Match the attendance service: elapsed presence is raw; credit deducts the break once.
    const duration=(endDate-startDate)/3600000;
    return{workerId:a.workerId,attendanceDate:a.workDate,checkInTime:startDate.toISOString().slice(0,19).replace("T"," "),checkOutTime:i%37===0?null:endDate.toISOString().slice(0,19).replace("T"," "),actualHours:i%37===0?null:duration.toFixed(2),status:i%23===0?"overtime":i%17===0?"late":"present",notes:"بيانات اختبار حضور اصطناعية وليست من جهاز البصمة",recordedBy:20};
   });
   await insert(c,"attendance",punches);
   await c.commit();
   await c.query("SET FOREIGN_KEY_CHECKS = 1");
   const summary={...fixture,start,weeks,restaurants:18,workshops:9,locations:29,accounts:accounts.length,permissions:permissionCount,assignments:assignmentRows.length,attendance:punches.length,seededAt:new Date().toISOString(),syntheticAttendance:true};
   await fs.writeFile(path.join(trialRoot,"seed-summary.json"),JSON.stringify(summary,null,2));
   await fs.writeFile(path.join(trialRoot,"trial-accounts.json"),JSON.stringify(accounts,null,2));
   await fs.writeFile(path.join(trialRoot,"trial-workers.json"),JSON.stringify(workers.map(w=>({id:w.id,employeeId:w.employeeId,mask:w.mask,centerId:w.centerId,restDay:w.restDay,language:w.preferredLanguage,intervals:intervals(w)})),null,2));
   console.log(JSON.stringify(summary));
  }catch(error){await c.rollback();await c.query("SET FOREIGN_KEY_CHECKS = 1");throw error;}
 }finally{await c.end();}
}
main().catch(error=>{console.error({code:error.code,message:error.message});process.exitCode=1;});
