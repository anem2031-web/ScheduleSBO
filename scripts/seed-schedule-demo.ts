/**
 * Seed تجريبي لنموذج الجداول (S1) — للاختبار فقط، لا يُشغّل في الإنتاج.
 * التشغيل: pnpm tsx scripts/seed-schedule-demo.ts
 * يتطلب DATABASE_URL ووجود مستخدم admin وعامل واحد على الأقل.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { and, eq } from "drizzle-orm";
import {
  users,
  workers,
  schedulePeriods,
  shiftTemplates,
  shiftAssignments,
} from "../drizzle/schema";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
  const db = drizzle(conn);

  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  const [worker] = await db.select().from(workers).limit(1);
  if (!admin || !worker) {
    console.error("يلزم وجود مستخدم admin وعامل واحد على الأقل قبل التشغيل.");
    process.exit(1);
  }

  // فترة أسبوعية: الأحد القادم حتى السبت (أسبوع الرياض)
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + ((7 - now.getDay()) % 7));
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  const d = (x: Date) => x.toISOString().slice(0, 10);

  // قابل لإعادة التشغيل: استخدم الفترة إن كانت موجودة
  let periodId: number;
  const [existingPeriod] = await db
    .select()
    .from(schedulePeriods)
    .where(
      and(
        eq(schedulePeriods.startDate, d(sunday)),
        eq(schedulePeriods.endDate, d(saturday))
      )
    )
    .limit(1);
  if (existingPeriod) {
    periodId = existingPeriod.id;
    console.log(`↷ الفترة موجودة مسبقًا #${periodId}`);
  } else {
    const [periodRes] = await db
      .insert(schedulePeriods)
      .values({
        name: `أسبوع ${d(sunday)}`,
        startDate: d(sunday),
        endDate: d(saturday),
        status: "draft",
        createdBy: admin.id,
      })
      .$returningId();
    periodId = periodRes.id;
  }

  const shiftDefs = [
    { code: "MORNING", nameAr: "صباحية", nameEn: "Morning", startTime: "07:00:00", endTime: "15:00:00", crossesMidnight: false, durationMinutes: 480 },
    { code: "EVENING", nameAr: "مسائية", nameEn: "Evening", startTime: "15:00:00", endTime: "23:00:00", crossesMidnight: false, durationMinutes: 480 },
    { code: "NIGHT", nameAr: "ليلية", nameEn: "Night", startTime: "23:00:00", endTime: "07:00:00", crossesMidnight: true, durationMinutes: 480 },
  ];
  const templateIds: number[] = [];
  for (const s of shiftDefs) {
    const [existing] = await db
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.code, s.code))
      .limit(1);
    if (existing) {
      templateIds.push(existing.id);
      console.log(`↷ وردية ${s.code} موجودة مسبقًا #${existing.id}`);
      continue;
    }
    const [r] = await db
      .insert(shiftTemplates)
      .values({ ...s, createdBy: admin.id })
      .$returningId();
    templateIds.push(r.id);
  }

  // تكليف تجريبي واحد: العامل الأول، وردية صباحية، يوم الأحد (تخطَّ إن وُجد)
  const [existingAssign] = await db
    .select()
    .from(shiftAssignments)
    .where(
      and(
        eq(shiftAssignments.workerId, worker.id),
        eq(shiftAssignments.workDate, d(sunday)),
        eq(shiftAssignments.startTime, "07:00:00")
      )
    )
    .limit(1);
  if (existingAssign) {
    console.log(`↷ التكليف موجود مسبقًا #${existingAssign.id}`);
    console.log(`تم: فترة #${periodId}، ${templateIds.length} ورديات، التكليف قائم.`);
    await conn.end();
    return;
  }
  await db.insert(shiftAssignments).values({
    periodId: periodId,
    workerId: worker.id,
    shiftTemplateId: templateIds[0],
    supervisorId: admin.id,
    workDate: d(sunday),
    startTime: "07:00:00",
    endTime: "15:00:00",
    crossesMidnight: false,
    plannedMinutes: 480,
    status: "planned",
    createdBy: admin.id,
  });

  console.log(`تم: فترة #${periodId}، ${templateIds.length} ورديات، تكليف واحد.`);
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
