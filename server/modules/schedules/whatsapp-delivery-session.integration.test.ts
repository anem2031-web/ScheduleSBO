/** Opt-in integration test: all fixture tables are connection-local TEMPORARY tables. */
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const fixture=vi.hoisted(()=>({db:null as any}));
vi.mock('../../shared/db',()=>({getDb:async()=>fixture.db}));
import { registerWhatsAppWebhook } from '../notifications/whatsapp-webhook';
import { acceptedDelivery } from './whatsapp-delivery-tracking';
import { getWhatsAppDeliveryReport } from './whatsapp-delivery-report';
import { schedulesRouter } from './schedules.router';

const enabled=process.env.WA_TEMP_DB_TEST==='1';
describe.skipIf(!enabled)('WhatsApp delivery integration on isolated temporary tables',()=>{
 let connection:mysql.Connection;
 let server:ReturnType<ReturnType<typeof express>['listen']>;
 let url:string;
 const sender='111111111111111';
 const mid='wamid.FixtureAbC_111=';
 const message2='wamid.fixtureabc_111=';
 const now=Math.floor(Date.now()/1000)-10;
 const filter={weekStart:'2026-11-15',limit:32,offset:0};

 async function callback(status:string,id=mid,time=now){
  const body=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:sender},statuses:[{id,status,timestamp:String(time)}]}}]}]});
  const signature='sha256='+createHmac('sha256','temporary-app-secret').update(body).digest('hex');
  return fetch(url,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signature},body});
 }
 beforeAll(async()=>{
  const d=new URL(process.env.DATABASE_URL||'mysql://missing');
  if(d.pathname!=='/SBO'||d.hostname!=='gateway01.ap-southeast-1.prod.aws.tidbcloud.com')throw new Error('Unexpected test host');
  connection=await mysql.createConnection({host:d.hostname,port:Number(d.port||4000),user:decodeURIComponent(d.username),password:decodeURIComponent(d.password),database:d.pathname.slice(1),ssl:{rejectUnauthorized:true},timezone:'Z'});
  const statements=[
   `CREATE TEMPORARY TABLE whatsapp_delivery_messages (id INT PRIMARY KEY AUTO_INCREMENT,period_id INT NOT NULL,worker_id INT NOT NULL,kind VARCHAR(20) NOT NULL,work_date DATE NULL,phone_ending VARCHAR(4) NOT NULL,message_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL UNIQUE,state VARCHAR(20) NOT NULL DEFAULT 'pending',error_code VARCHAR(40),error_summary VARCHAR(255),created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,accepted_at TIMESTAMP NULL)`,
   `CREATE TEMPORARY TABLE whatsapp_delivery_events (event_key VARCHAR(64) PRIMARY KEY,message_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,status VARCHAR(20) NOT NULL,occurred_at TIMESTAMP NOT NULL,error_code VARCHAR(40),created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
   `CREATE TEMPORARY TABLE whatsapp_delivery_destinations (id INT PRIMARY KEY AUTO_INCREMENT,delivery_id INT NOT NULL,branch_id INT,location_id INT,department_id INT,supervisor_id INT)`,
   `CREATE TEMPORARY TABLE workers (id INT PRIMARY KEY,employeeId VARCHAR(50),nameAr VARCHAR(255))`,
   `CREATE TEMPORARY TABLE schedule_periods (id INT PRIMARY KEY,startDate DATE,endDate DATE)`,
   `CREATE TEMPORARY TABLE branches (id INT PRIMARY KEY,nameAr VARCHAR(255))`,
   `CREATE TEMPORARY TABLE locations (id INT PRIMARY KEY,nameAr VARCHAR(255))`,
   `CREATE TEMPORARY TABLE departments (id INT PRIMARY KEY,nameAr VARCHAR(255))`,
   `CREATE TEMPORARY TABLE users (id INT PRIMARY KEY,name TEXT)`,
  ];
  for(const statement of statements)await connection.query(statement);
  fixture.db=drizzle({client:connection});
  await connection.query(`INSERT INTO workers VALUES (700001,'TEST-ONLY-1','Fixture One'),(700002,'TEST-ONLY-2','Fixture Two')`);
  await connection.query(`INSERT INTO schedule_periods VALUES (700001,'2026-11-15','2026-11-21')`);
  await connection.query(`INSERT INTO branches VALUES (700001,'Test center')`);
  await connection.query(`INSERT INTO locations VALUES (700001,'Test location')`);
  await connection.query(`INSERT INTO departments VALUES (700001,'Test department')`);
  await connection.query(`INSERT INTO users VALUES (700001,'Test supervisor')`);
  await connection.query(`INSERT INTO whatsapp_delivery_messages(id,period_id,worker_id,kind,phone_ending,state) VALUES (700001,700001,700001,'weekly','0001','pending'),(700002,700001,700002,'update','0002','pending')`);
  await connection.query(`INSERT INTO whatsapp_delivery_destinations(delivery_id,branch_id,location_id,department_id,supervisor_id) VALUES (700001,700001,700001,700001,700001),(700002,700001,700001,700001,700001)`);
  vi.stubEnv('WHATSAPP_META_APP_SECRET','temporary-app-secret');
  vi.stubEnv('WHATSAPP_TRIAL_PHONE_NUMBER_ID',sender);
  const app=express();registerWhatsAppWebhook(app);
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhooks/whatsapp`;
 },30000);
 afterAll(async()=>{
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(connection)await connection.end();
  fixture.db=null;vi.unstubAllEnvs();
 });
 it('matches an early signed webhook, deduplicates callbacks, does not regress, and filters employee identifiers',async()=>{
  expect((await callback('delivered')).status).toBe(200);
  await acceptedDelivery(700001,mid);
  let report=await getWhatsAppDeliveryReport(filter);
  expect(report.rows.find((r:any)=>r.id===700001)?.status).toBe('delivered');
  expect((await callback('sent',mid,now+1)).status).toBe(200);
  expect((await callback('sent',mid,now+1)).status).toBe(200);
  report=await getWhatsAppDeliveryReport(filter);
  expect(report.rows.find((r:any)=>r.id===700001)?.status).toBe('delivered');
  const [events]:any=await connection.query('SELECT COUNT(*) n FROM whatsapp_delivery_events');
  expect(Number(events[0].n)).toBe(2);
  expect((await callback('read',mid,now+2)).status).toBe(200);
  await acceptedDelivery(700002,message2);
  report=await getWhatsAppDeliveryReport({...filter,search:'TEST-ONLY-1'});
  expect(report.rows).toHaveLength(1);
  expect(report.rows[0].phoneEnding).toBe('0001');
  expect(report.rows[0].status).toBe('read');
  expect(report.totals.delivered).toBe(1);
  expect(report.totals.read).toBe(1);
  const caseCheck=await getWhatsAppDeliveryReport({...filter,search:'TEST-ONLY-2'});
  expect(caseCheck.rows[0].status).toBe('sent');
  expect((await getWhatsAppDeliveryReport({...filter,branchId:700001,locationId:700001,departmentId:700001,supervisorId:700001})).total).toBe(2);
  expect((await getWhatsAppDeliveryReport({...filter,branchId:700002})).total).toBe(0);
 },30000);
 it('rejects a supervisor trying to access the global delivery report',async()=>{
  const caller=schedulesRouter.createCaller({user:{id:700002,role:'supervisor',accessScope:null} as any,req:{} as any,res:{} as any});
  await expect(caller.getWhatsAppDeliveryReport(filter)).rejects.toMatchObject({code:'FORBIDDEN'});
 });
});
