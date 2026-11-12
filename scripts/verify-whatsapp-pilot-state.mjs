// Explicitly targets the pre-existing disposable pilot worker and week.
// No messages are sent: fetch is replaced with a local simulator.
import 'dotenv/config';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { getDb } from '../server/shared/db.ts';
import { buildWeeklyTemplateValues, deliverChangedSchedule } from '../server/modules/schedules/whatsapp-trial.ts';
import { resolveScheduleDeliveryReview } from '../server/modules/schedules/whatsapp-trial-state.ts';

const url = new URL(process.env.DATABASE_URL ?? '');
if (url.pathname !== '/SBO' || url.hostname !== 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com') throw new Error('unexpected_target');
const db = await getDb();
if (!db) throw new Error('missing_database');
const connection = await mysql.createConnection({ host: url.hostname, port: Number(url.port || 4000),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)), ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } });
let periodId; let workerId; let ownRowCreated = false;
const sent = [];
try {
  const [workers] = await connection.query("SELECT id FROM workers WHERE employeeId = 'WA-TRIAL-003'");
  const [periods] = await connection.query("SELECT id FROM schedule_periods WHERE startDate='2026-11-08' AND endDate='2026-11-14' AND status='published'");
  const [admins] = await connection.query("SELECT id FROM users WHERE LOWER(username)='admin' LIMIT 1");
  if (workers.length !== 1 || periods.length !== 1 || admins.length !== 1) throw new Error('pilot_fixtures_not_unique');
  workerId = workers[0].id; periodId = periods[0].id;
  const [existing] = await connection.query('SELECT state FROM whatsapp_trial_schedule_state WHERE period_id=? AND worker_id=?', [periodId, workerId]);
  if (existing.length) throw new Error('pilot_delivery_state_already_exists');
  Object.assign(process.env, { WHATSAPP_TRIAL_ENABLED: 'true', WHATSAPP_TRIAL_RECIPIENTS: '+966500000000',
    WHATSAPP_TRIAL_PHONE_NUMBER_ID: '123456789012345', WHATSAPP_TRIAL_ACCESS_TOKEN: 'local-mock-token',
    WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_APPROVED: 'true', WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_VARIABLES: '21',
    WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_NAME: 'wardia_weekly_schedule', WHATSAPP_TRIAL_UPDATE_TEMPLATE_APPROVED: 'true',
    WHATSAPP_TRIAL_UPDATE_TEMPLATE_NAME: 'wardia_schedule_update' });
  let fail = false;
  globalThis.fetch = async (_url, options) => {
    if (fail) throw new Error('simulated_timeout');
    const body = JSON.parse(options.body); sent.push({ name: body.template.name, count: body.template.components[0].parameters.length });
    return { ok: true };
  };
  const base = buildWeeklyTemplateValues({ start: '2026-11-08', end: '2026-11-14', rows: [],
    leaves: [{ start: '2026-11-08', end: '2026-11-14', kind: 'annual' }] });
  assert.equal(await deliverChangedSchedule(periodId, workerId, '966500000000', base), 'sent');
  ownRowCreated = true;
  assert.equal(await deliverChangedSchedule(periodId, workerId, '966500000000', base), 'unchanged');
  const revised = [...base]; revised[4] = 'FROM 04:00 PM TO 01:00 AM';
  assert.equal(await deliverChangedSchedule(periodId, workerId, '966500000000', revised), 'sent');
  const later = [...revised]; later[7] = 'FROM 03:00 PM TO 11:00 PM';
  fail = true;
  await assert.rejects(deliverChangedSchedule(periodId, workerId, '966500000000', later), /simulated_timeout/);
  let [state] = await connection.query('SELECT state FROM whatsapp_trial_schedule_state WHERE period_id=? AND worker_id=?', [periodId, workerId]);
  assert.equal(state[0].state, 'needs_review');
  await resolveScheduleDeliveryReview({ periodId, workerId, actorId: admins[0].id, delivered: false,
    reason: 'اختبار محاكاة لحالة الإرسال دون إرسال رسائل فعلية' });
  fail = false;
  assert.equal(await deliverChangedSchedule(periodId, workerId, '966500000000', later), 'sent');
  assert.deepEqual(sent, [{ name: 'wardia_weekly_schedule', count: 21 },
    { name: 'wardia_schedule_update', count: 5 }, { name: 'wardia_schedule_update', count: 5 }]);
  console.log(JSON.stringify({ state_store: 'passed', weekly_values: 21, update_values: 5,
    duplicate_guard: 'passed', simulated_timeout_recovery: 'passed', actual_messages: 0, audit_record_created: true }));
} finally {
  if (ownRowCreated) await connection.query('DELETE FROM whatsapp_trial_schedule_state WHERE period_id=? AND worker_id=?', [periodId, workerId]);
  await connection.end();
  await db.$client.end();
}
