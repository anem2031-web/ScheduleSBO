import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { whatsappDeliveryEvents, whatsappDeliveryMessages, whatsappDeliveryDestinations, shiftAssignments, workers, workerScheduleSettings, branches, supervisorAssignments } from '../../../drizzle/schema';
import { getDb } from '../../shared/db';

export type DeliveryEvent = { messageId: string; status: 'sent' | 'delivered' | 'read' | 'failed'; occurredAt: Date; errorCode: string | null };
/** Extract only safe, minimal status data. Unknown or malformed events are ignored. */
export function parseDeliveryEvents(payload: any, phoneNumberId: string): DeliveryEvent[] {
  const result: DeliveryEvent[]=[];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) for (const change of Array.isArray(entry?.changes) ? entry.changes : []) for (const item of change?.value?.metadata?.phone_number_id === phoneNumberId && Array.isArray(change?.value?.statuses) ? change.value.statuses : []) {
    if (typeof item?.id !== 'string' || !/^wamid\.[A-Za-z0-9_+=.\/\-]{1,240}$/.test(item.id) || !['sent','delivered','read','failed'].includes(item.status)) continue;
    const n=typeof item.timestamp==='string' && /^\d{9,11}$/.test(item.timestamp) ? Number(item.timestamp) : NaN;
    if (!Number.isFinite(n) || n < 946684800 || n > Math.floor(Date.now()/1000)+86400) continue;
    const code=item.errors?.[0]?.code;
    result.push({messageId:item.id,status:item.status,occurredAt:new Date(n*1000),errorCode:Number.isSafeInteger(code)&&code>=0?String(code):null});
  }
  return result;
}
export function deliveryEventKey(event: DeliveryEvent): string {
  return createHash('sha256').update(JSON.stringify([event.messageId,event.status,event.occurredAt.toISOString(),event.errorCode])).digest('hex');
}
export async function recordDeliveryEvents(events: DeliveryEvent[]) {
  if (!events.length) return;
  const db=await getDb(); if(!db)throw new Error('Database not available');
  // Keep unmatched events: Meta can notify before the API response containing the ID.
  for(const event of events) await db.insert(whatsappDeliveryEvents).values({...event,eventKey:deliveryEventKey(event)}).onDuplicateKeyUpdate({set:{eventKey:sql`${whatsappDeliveryEvents.eventKey}`}});
}
export async function beginDelivery(input:{periodId:number;workerId:number;kind:'weekly'|'update';workDate?:string;phoneEnding:string}) {
  const db=await getDb();if(!db)throw new Error('Database not available');
  return db.transaction(async(tx)=>{
    const [row]=await tx.insert(whatsappDeliveryMessages).values({...input,workDate:input.workDate ? new Date(`${input.workDate}T00:00:00Z`) : null}).$returningId();
    // Weekly messages may cover more than one cost center or supervisor. Capture
    // all relevant destinations at send time, not the employee's later profile.
    const shifts=await tx.select({branchId:shiftAssignments.costCenterId,locationId:shiftAssignments.locationId,departmentId:shiftAssignments.departmentId,supervisorId:shiftAssignments.supervisorId})
      .from(shiftAssignments).where(and(eq(shiftAssignments.periodId,input.periodId),eq(shiftAssignments.workerId,input.workerId),inArray(shiftAssignments.status,['planned','confirmed','completed']),input.workDate?eq(shiftAssignments.workDate,new Date(`${input.workDate}T00:00:00Z`)):undefined));
    if(shifts.length){
      const unique=new Map(shifts.map(s=>[JSON.stringify(s),s]));
      await tx.insert(whatsappDeliveryDestinations).values(Array.from(unique.values()).map(s=>({...s,deliveryId:row.id})));
    } else {
      const [worker]=await tx.select({locationId:workers.locationId,departmentId:workers.departmentId,branch:workerScheduleSettings.branch}).from(workers).leftJoin(workerScheduleSettings,eq(workerScheduleSettings.workerId,workers.id)).where(eq(workers.id,input.workerId));
      const [branch]=worker?.branch ? await tx.select({id:branches.id}).from(branches).where(sql`${branches.code}=${worker.branch} OR ${branches.nameAr}=${worker.branch} OR CAST(${branches.id} AS CHAR)=${worker.branch}`).limit(1) : [];
      const [supervisor]=await tx.select({id:supervisorAssignments.supervisorId}).from(supervisorAssignments).where(and(eq(supervisorAssignments.workerId,input.workerId),eq(supervisorAssignments.assignmentType,'primary'),sql`${supervisorAssignments.effectiveTo} IS NULL`)).limit(1);
      await tx.insert(whatsappDeliveryDestinations).values({deliveryId:row.id,branchId:branch?.id??null,locationId:worker?.locationId??null,departmentId:worker?.departmentId??null,supervisorId:supervisor?.id??null});
    }
    return row.id;
  });
}
export async function acceptedDelivery(id:number,messageId:string|null) {
  const db=await getDb();if(!db)throw new Error('Database not available');
  await db.update(whatsappDeliveryMessages).set({state:messageId?'sent':'unknown',messageId,acceptedAt:new Date(),errorSummary:messageId?null:'قبلت Meta الطلب دون معرّف رسالة قابل للتتبع'}).where(and(eq(whatsappDeliveryMessages.id,id),eq(whatsappDeliveryMessages.state,'pending')));
}
export async function failedDelivery(id:number,definitive:boolean,code:string|null) {
  const db=await getDb();if(!db)throw new Error('Database not available');
  await db.update(whatsappDeliveryMessages).set({state:definitive?'failed':'unknown',errorCode:code,errorSummary:definitive?'رفضت Meta طلب الإرسال':'تعذر تأكيد نتيجة الإرسال؛ تحتاج مراجعة'}).where(and(eq(whatsappDeliveryMessages.id,id),eq(whatsappDeliveryMessages.state,'pending')));
}
