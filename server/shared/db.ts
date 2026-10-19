import { drizzle } from "drizzle-orm/mysql2";
import {
  createPool,
  type Pool,
} from "mysql2/promise";

let pool: Pool | null = null;

/*
 * تعريف Drizzle داخل دالة مستقلة يجعل TypeScript
 * يستنتج النوع من نفس Pool المستخدم فعليًا،
 * بدل الاعتماد على ReturnType لدالة drizzle
 * التي تحتوي على أكثر من overload.
 */
function createDatabase(client: Pool) {
  return drizzle({
    client,
  });
}

type Database = ReturnType<
  typeof createDatabase
>;

let db: Database | null = null;

export async function getDb(): Promise<
  Database | null
> {
  if (db) {
    return db;
  }

  const databaseUrl =
    process.env.DATABASE_URL;

  if (!databaseUrl) {
    return null;
  }

  const url = new URL(databaseUrl);

  pool = createPool({
    host: url.hostname,

    port: Number(
      url.port || 4000,
    ),

    user: decodeURIComponent(
      url.username,
    ),

    password: decodeURIComponent(
      url.password,
    ),

    database: decodeURIComponent(
      url.pathname.replace(/^\/+/, ""),
    ),
    // Store and read timestamps in UTC; DATE bounds must not drift to 03:00.
    timezone: "Z",

    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },

    // إعدادات مرونة ضد إغلاق TiDB Serverless للاتصالات الخاملة من طرفها
    // (تسبب ECONNRESET بدونها بعد فترة عدم استخدام قصيرة)
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000, // ثانية، يغلق الاتصال من طرفنا قبل أن تغلقه الخادم
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 20000,
  });

  db = createDatabase(pool);

  return db;
}
