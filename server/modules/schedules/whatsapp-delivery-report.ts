import { sql, type SQL } from 'drizzle-orm';
import { getDb } from '../../shared/db';

export type DeliveryFilter = {weekStart?:string;dateFrom?:string;dateTo?:string;search?:string;status?:'pending'|'sent'|'delivered'|'read'|'failed'|'unknown';kind?:'weekly'|'update';branchId?:number;locationId?:number;departmentId?:number;supervisorId?:number;limit:number;offset:number};

/** Admin-only caller; filters apply before status counts, and pagination is performed by SQL. */
export async function getWhatsAppDeliveryReport(input:DeliveryFilter) {
 const db=await getDb();if(!db)throw new Error('Database not available');
 const filters:SQL[]=[];
 if(input.weekStart)filters.push(sql`r.weekStart = ${input.weekStart}`);
 if(input.dateFrom)filters.push(sql`r.createdAt >= ${new Date(`${input.dateFrom}T00:00:00+03:00`)}`);
 if(input.dateTo){const next=new Date(new Date(`${input.dateTo}T00:00:00+03:00`).getTime()+86400000);filters.push(sql`r.createdAt < ${next}`);}
 if(input.search){const value=`%${input.search.trim().replace(/[\\%_]/g,'\\$&')}%`;filters.push(sql`(r.workerName LIKE ${value} OR r.employeeId LIKE ${value})`);}
 if(input.kind)filters.push(sql`r.kind = ${input.kind}`);
 const destinations:SQL[]=[];
 if(input.branchId)destinations.push(sql`dest.branch_id = ${input.branchId}`);
 if(input.locationId)destinations.push(sql`dest.location_id = ${input.locationId}`);
 if(input.departmentId)destinations.push(sql`dest.department_id = ${input.departmentId}`);
 if(input.supervisorId)destinations.push(sql`dest.supervisor_id = ${input.supervisorId}`);
 if(destinations.length)filters.push(sql`EXISTS (SELECT 1 FROM whatsapp_delivery_destinations dest WHERE dest.delivery_id=r.id AND ${sql.join(destinations,sql` AND `)})`);
 const base=filters.length?sql.join(filters,sql` AND `):sql`1=1`;
 const status=input.status==='delivered'?sql`r.status IN ('delivered','read')`:input.status?sql`r.status=${input.status}`:sql`1=1`;
 const cte=sql`WITH event_summary AS (
   SELECT message_id, MIN(CASE WHEN status='sent' THEN occurred_at END) sentAt,
     MIN(CASE WHEN status='delivered' THEN occurred_at END) deliveredAt,
     MIN(CASE WHEN status='read' THEN occurred_at END) readAt,
     MIN(CASE WHEN status='failed' THEN occurred_at END) failedAt,
     MAX(CASE WHEN status='failed' THEN error_code END) callbackErrorCode
   FROM whatsapp_delivery_events GROUP BY message_id
 ), report AS (
   SELECT m.id,m.worker_id workerId,w.employeeId,w.nameAr workerName,m.phone_ending phoneEnding,
     m.kind,m.period_id periodId,p.startDate weekStart,p.endDate weekEnd,m.work_date workDate,m.created_at createdAt,
     COALESCE(e.sentAt,m.accepted_at) sentAt,e.deliveredAt,e.readAt,e.failedAt,
     COALESCE(e.callbackErrorCode,m.error_code) errorCode,m.error_summary errorSummary,
     b.id branchId,b.nameAr branchName,l.id locationId,l.nameAr locationName,d.id departmentId,d.nameAr departmentName,
     u.id supervisorId,u.name supervisorName,
     (ds.destinationCount>1) multipleDestinations,
     CASE WHEN e.readAt IS NOT NULL THEN 'read' WHEN e.deliveredAt IS NOT NULL THEN 'delivered' WHEN e.failedAt IS NOT NULL OR m.state='failed' THEN 'failed' WHEN m.state='unknown' THEN 'unknown' WHEN e.sentAt IS NOT NULL OR m.state='sent' THEN 'sent' WHEN m.created_at < CURRENT_TIMESTAMP() - INTERVAL 5 MINUTE THEN 'unknown' ELSE 'pending' END status
   FROM whatsapp_delivery_messages m JOIN workers w ON w.id=m.worker_id JOIN schedule_periods p ON p.id=m.period_id
   LEFT JOIN event_summary e ON e.message_id=m.message_id
   LEFT JOIN (SELECT delivery_id,MIN(id) firstId,COUNT(*) destinationCount FROM whatsapp_delivery_destinations GROUP BY delivery_id) ds ON ds.delivery_id=m.id
   LEFT JOIN whatsapp_delivery_destinations dd ON dd.id=ds.firstId
   LEFT JOIN branches b ON b.id=dd.branch_id LEFT JOIN locations l ON l.id=dd.location_id
   LEFT JOIN departments d ON d.id=dd.department_id LEFT JOIN users u ON u.id=dd.supervisor_id
 )`;
 const [rowsResult,totalsResult,countResult]=await Promise.all([
   db.execute(sql`${cte} SELECT r.*, CASE WHEN r.status='read' THEN r.readAt WHEN r.status='delivered' THEN r.deliveredAt WHEN r.status='failed' THEN COALESCE(r.failedAt,r.createdAt) ELSE COALESCE(r.sentAt,r.createdAt) END statusAt FROM report r WHERE ${base} AND ${status} ORDER BY r.createdAt DESC,r.id DESC LIMIT ${input.limit} OFFSET ${input.offset}`),
   db.execute(sql`${cte} SELECT COUNT(*) AS \`all\`, SUM(r.status='pending') pending, SUM(r.status='sent') sent, SUM(r.status IN ('delivered','read')) delivered, SUM(r.status='read') \`read\`, SUM(r.status='failed') failed, SUM(r.status='unknown') unknown FROM report r WHERE ${base}`),
   db.execute(sql`${cte} SELECT COUNT(*) total FROM report r WHERE ${base} AND ${status}`),
 ]);
 const rows=(rowsResult as any)[0]??[];const totalsRow=(totalsResult as any)[0]?.[0]??{};const totalRow=(countResult as any)[0]?.[0]??{};
 const totals=Object.fromEntries(['all','pending','sent','delivered','read','failed','unknown'].map(k=>[k,Number(totalsRow[k]??0)]));
 return {rows,totals,total:Number(totalRow.total??0),limit:input.limit,offset:input.offset,webhookConfigured:!!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && !!process.env.WHATSAPP_META_APP_SECRET};
}
