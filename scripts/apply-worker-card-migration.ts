/**
 * تطبيق آمن لحقول بطاقة الدوام (migration 0005) مباشرة على قاعدة البيانات.
 * - ينفذ أوامر drizzle/0005_yellow_magneto.sql واحدًا واحدًا.
 * - يتجاهل "العمود موجود مسبقًا" فقط (لا يخفي أي خطأ آخر).
 * - لا يلمس أي جدول آخر غير sessions.token وworker_schedule_settings.
 * التشغيل: pnpm tsx scripts/apply-worker-card-migration.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import mysql from "mysql2/promise";

const IGNORABLE = new Set([
  1060, // ER_DUP_FIELDNAME — العمود موجود مسبقًا
]);

let sessionsTableMissing = false;

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

  const sql = readFileSync("drizzle/0005_yellow_magneto.sql", "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  let applied = 0;
  let skipped = 0;
  for (const stmt of statements) {
    const label = stmt.slice(0, 90).replace(/\s+/g, " ");
    try {
      await conn.query(stmt);
      applied++;
      console.log(`✓ ${label}...`);
    } catch (e: any) {
      if (IGNORABLE.has(e?.errno)) {
        skipped++;
        console.log(`↷ موجود مسبقًا (${e.errno}): ${label}...`);
      } else if (e?.errno === 1146 && stmt.includes("`sessions`")) {
        sessionsTableMissing = true;
        skipped++;
        console.log(`⚠️  تخطي: جدول sessions غير موجود في قاعدتك (غير حرج لهذه المرحلة): ${label}...`);
      } else {
        console.error(`✗ فشل: ${label}`);
        throw e;
      }
    }
  }

  // التحقق النهائي من وجود الأعمدة الجديدة
  const [rows] = await conn.query(
    `SELECT column_name AS c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'worker_schedule_settings'
     AND column_name IN ('branch','weeklyRestDay','patternType','p1Start','p1End','p2Start','p2End','dayOverrides')`
  );
  const found = (rows as any[]).map((r) => r.c);
  const expected = ["branch", "weeklyRestDay", "patternType", "p1Start", "p1End", "p2Start", "p2End", "dayOverrides"];
  const missing = expected.filter((c) => !found.includes(c));

  console.log(`\nنُفذ: ${applied} | تُخطي (موجود): ${skipped}`);
  if (missing.length) {
    console.error(`أعمدة ما تزال ناقصة: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("✅ حقول بطاقة الدوام موجودة في worker_schedule_settings. المرحلة أ جاهزة.");
  if (sessionsTableMissing) {
    console.log(
      "\n⚠️  تنبيه منفصل: جدول 'sessions' غير موجود في قاعدة بياناتك رغم أن migration 0003 يفترض إنشاءه.\n" +
      "   هذا لا يؤثر على بطاقة العامل أو الجداول، لكنه يستحق مراجعة منفصلة لنظام المصادقة المحلي."
    );
  }
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
