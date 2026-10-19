import "dotenv/config";
import { registerUser } from "../server/modules/auth/auth.service";
import { getUserByEmail } from "../server/modules/users/users.repository";

/**
 * ============================================================================
 * Seed Admin — إنشاء أول حساب مسؤول
 * ----------------------------------------------------------------------------
 * الاستخدام:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=StrongPass123 pnpm seed:admin
 *
 * يتطلب DATABASE_URL و JWT_SECRET في البيئة (.env).
 * آمن للتكرار: لو البريد موجود مسبقًا لا يفعل شيئًا.
 * ============================================================================
 */

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "System Administrator";

  if (!email || !password) {
    console.error(
      "❌ حدد ADMIN_EMAIL و ADMIN_PASSWORD كمتغيرات بيئة قبل التشغيل.\n" +
        "مثال: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=StrongPass123 pnpm seed:admin"
    );
    process.exit(1);
  }

  if (password.length < 7) {
    console.error("❌ كلمة المرور يجب أن تكون 7 خانات على الأقل.");
    process.exit(1);
  }

  const existing = await getUserByEmail(email.trim().toLowerCase());
  if (existing) {
    console.log(`ℹ️  المستخدم ${email} موجود بالفعل (role: ${existing.role}) — لا حاجة للإنشاء.`);
    process.exit(0);
  }

  const user = await registerUser({
    email: email.trim().toLowerCase(),
    password,
    name,
    username: process.env.ADMIN_USERNAME || "ADMIN",
    role: "admin",
  });

  console.log(`✅ تم إنشاء المسؤول بنجاح: ${user.email} (id: ${user.id})`);
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ فشل إنشاء المسؤول:", error);
  process.exit(1);
});
