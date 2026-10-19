/**
 * تطبيق آمن لجداول الهيكل التنظيمي (migration 0006) مباشرة على قاعدة البيانات.
 * فرع <->> موقع <->> قسم — 4 جداول جديدة فقط، لا يلمس أي جدول قائم.
 * التشغيل: pnpm tsx scripts/apply-org-structure-migration.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import mysql from "mysql2/promise";

const IGNORABLE = new Set([
  1050, // ER_TABLE_EXISTS_ERROR
  1061, // ER_DUP_KEYNAME
  1826, // ER_FK_DUP_NAME
]);

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

  const sql = readFileSync(
    "drizzle/0006_overconfident_the_watchers.sql",
    "utf8"
  );
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
      } else {
        console.error(`✗ فشل: ${label}`);
        throw e;
      }
    }
  }

  const expected = [
    "branches",
    "locations",
    "branch_locations",
    "location_departments",
  ];
  const [rows] = await conn.query(
    `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?, ?, ?, ?)`,
    expected
  );
  const found = (rows as any[]).map((r) => r.t ?? r.TABLE_NAME);
  const missing = expected.filter((t) => !found.includes(t));

  console.log(`\nنُفذ: ${applied} | تُخطي (موجود): ${skipped}`);
  if (missing.length) {
    console.error(`جداول ما تزال ناقصة: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("✅ جداول الهيكل التنظيمي (فروع/مواقع/روابط) موجودة في القاعدة.");
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
