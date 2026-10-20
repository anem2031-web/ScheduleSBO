import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { branches, supervisorAssignments, workers, workerScheduleSettings } from "../../drizzle/schema";
import { riyadhToday } from "../../shared/weekly-schedule";
import { getDb } from "./db";

export type ScopeUser = {id:number;role:string;workerId?:number;accessScope?:{costCenterIds:number[]}|null};
export async function getScopedWorkerIds(user:ScopeUser,date=riyadhToday()):Promise<number[]|undefined>{
 return getScopedWorkerIdsInRange(user,date,date);
}
/** Workers linked at any point in the requested range, including links that start after its first day. */
export async function getScopedWorkerIdsInRange(user:ScopeUser,fromDate=riyadhToday(),toDate=fromDate):Promise<number[]|undefined>{
 if(toDate<fromDate)throw new TRPCError({code:"BAD_REQUEST",message:"تاريخ النهاية يسبق البداية"});
 if(user.role==="admin")return undefined;
 if(user.role!=="supervisor"&&user.role!=="worker"&&!user.accessScope)return undefined;
 const db=await getDb();
 if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"قاعدة البيانات غير متاحة"});
 if(user.role==="worker"){
  const rows=await db.select({id:workers.id}).from(workers).where(eq(workers.userId,user.id));
  return rows.map(row=>row.id);
 }
 let ids:number[]|undefined;
 if(user.role==="supervisor"){
  const rows=await db.select({id:supervisorAssignments.workerId}).from(supervisorAssignments).where(and(eq(supervisorAssignments.supervisorId,user.id),sql`${supervisorAssignments.effectiveFrom} <= ${toDate}`,or(isNull(supervisorAssignments.effectiveTo),sql`${supervisorAssignments.effectiveTo} >= ${fromDate}`)));
  ids=Array.from(new Set(rows.map(row=>row.id)));
 }
 if(user.accessScope){
  if(!user.accessScope.costCenterIds.length)return [];
  const centers=await db.select().from(branches).where(inArray(branches.id,user.accessScope.costCenterIds));
  const keys=centers.flatMap(center=>[String(center.id),center.code,center.nameAr]);
  if(!keys.length)return [];
  const rows=await db.select({id:workerScheduleSettings.workerId}).from(workerScheduleSettings).where(inArray(workerScheduleSettings.branch,keys));
  const allowed=new Set(rows.map(row=>row.id));
  // A direct supervisor link grants access to the shared worker's card even
  // when their home center belongs to the other operating period. Destination
  // and period writes still enforce this supervisor's allowed cost centers.
  if(user.role!=="supervisor")ids=ids===undefined?Array.from(allowed):ids.filter(id=>allowed.has(id));
 }
 return ids;
}
export async function assertWorkerInScope(user:ScopeUser,workerId:number,date?:string){
 const ids=await getScopedWorkerIds(user,date);
 if(ids!==undefined&&!ids.includes(workerId))throw new TRPCError({code:"FORBIDDEN",message:"العامل خارج نطاق صلاحيات حسابك"});
}
export async function assertCostCenterScope(user:ScopeUser,key:string|number|null|undefined){
 if(user.role==="admin"||!user.accessScope)return;
 const db=await getDb();if(!db)throw new Error("DATABASE_NOT_AVAILABLE");
 const allowed=user.accessScope.costCenterIds;
 const centers=allowed.length?await db.select().from(branches).where(inArray(branches.id,allowed)):[];
 if(!centers.some(center=>[String(center.id),center.code,center.nameAr].includes(String(key))))throw new TRPCError({code:"FORBIDDEN",message:"مركز التكلفة خارج نطاق صلاحيات حسابك"});
}
