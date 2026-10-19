import { COOKIE_NAME } from "@shared/const";
import bcrypt from "bcrypt";
import type { Request } from "express";
import { jwtVerify, SignJWT } from "jose";
import type { User } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { workers } from "../../../drizzle/schema";
import { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_MESSAGE, USERNAME_PATTERN } from "../../../shared/access-control";
import { getDb } from "../../shared/db";
import { loadUserAccess } from "../users/access.repository";
import type { AuthorizedUser } from "../../shared/rbac";
import { ENV } from "../../_core/env";
import {
  getAllUsers,
  getUserByEmail,
  getUserByLogin,
  getUserByOpenId,
  upsertUser,
} from "../users/users.repository";

/**
 * ============================================================================
 * Auth Service — مصادقة محلية (Email + Password + JWT)
 * ----------------------------------------------------------------------------
 * لا اعتماد على أي مزوّد خارجي. الجلسة عبارة عن JWT موقّع بـ JWT_SECRET
 * يُحفظ في كوكي httpOnly باسم COOKIE_NAME ويُقرأ في _core/context.ts.
 * ============================================================================
 */

const JWT_SECRET = ENV.cookieSecret;
const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
/** مدة جلسة الكوكي */
export const SESSION_EXPIRY = "7d";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHORIZED" | "BAD_REQUEST" | "CONFLICT",
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function getSecret() {
  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is not set — local auth cannot sign or verify tokens"
    );
  }
  return new TextEncoder().encode(JWT_SECRET);
}

// ---------------------------------------------------------------------------
// كلمات المرور
// ---------------------------------------------------------------------------

/** Hash a password using bcrypt */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compare a password with its hash */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------

/** Create JWT access token */
export async function createAccessToken(userId: number): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getSecret());
}

/** Create JWT refresh token */
export async function createRefreshToken(userId: number): Promise<string> {
  return new SignJWT({ userId, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(getSecret());
}

/** توكن الجلسة المحفوظ في الكوكي */
export async function createSessionToken(userId: number): Promise<string> {
  return new SignJWT({ userId, type: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(SESSION_EXPIRY)
    .sign(getSecret());
}

/** Verify and decode JWT token */
export async function verifyToken(
  token: string
): Promise<{ userId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return { userId: payload.userId as number };
  } catch (error) {
    console.error("[Auth] Token verification failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// المصادقة على الطلبات (تُستدعى من _core/context.ts)
// ---------------------------------------------------------------------------

/** Extract token from request (cookie or Authorization header) */
export function extractToken(req: Request): string | null {
  // Cookie أولًا (المسار الطبيعي للمتصفح)
  const cookies = req.headers.cookie || "";
  const cookieMatch = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (cookieMatch) {
    return decodeURIComponent(cookieMatch[1]);
  }

  // ثم Authorization header (لأدوات API أو عملاء بدون كوكيز)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return null;
}

/** Authenticate request and return user (null إن لم توجد جلسة صالحة) */
export async function authenticateRequest(req: Request): Promise<AuthorizedUser | null> {
  const token = extractToken(req);
  if (!token) return null;

  const decoded = await verifyToken(token);
  if (!decoded) return null;

  const { getUserById } = await import("../users/users.repository");
  const user = await getUserById(decoded.userId);
  if (!user || !user.isActive) return null;

  const principal: AuthorizedUser = await loadUserAccess(user);
  if (user.role === "worker") {
    const db = await getDb();
    const [worker] = db ? await db.select({ id: workers.id }).from(workers).where(eq(workers.userId, user.id)).limit(1) : [];
    principal.workerId = worker?.id;
  }
  return principal;
}

// ---------------------------------------------------------------------------
// التسجيل والدخول
// ---------------------------------------------------------------------------

/** إنشاء مستخدم جديد (تُستدعى من إجراء محمي بصلاحية USERS_CREATE أو من seed) */
export async function registerUser(params: {
  email: string;
  username?: string;
  password: string;
  name: string;
  role?: User["role"];
}): Promise<User> {
  if (params.password.length < MIN_PASSWORD_LENGTH) throw new AuthError("BAD_REQUEST", PASSWORD_LENGTH_MESSAGE);
  if (params.username && !USERNAME_PATTERN.test(params.username)) throw new AuthError("BAD_REQUEST", "اسم الدخول من 2 إلى 64 خانة، ويقبل الحروف الإنجليزية والأرقام و _ . -");
  if (params.username && await getUserByLogin(params.username)) throw new AuthError("CONFLICT", "اسم الدخول مستخدم بالفعل");
  const existing = await getUserByEmail(params.email);
  if (existing) {
    throw new AuthError("CONFLICT", "يوجد مستخدم مسجّل بهذا البريد بالفعل");
  }

  const passwordHash = await hashPassword(params.password);
  const openId = `local_${params.email}`;

  await upsertUser({
    openId,
    email: params.email,
    username: params.username?.trim().toLowerCase(),
    name: params.name,
    passwordHash,
    loginMethod: "local",
    role: params.role ?? "worker",
  });

  const user = await getUserByOpenId(openId);
  if (!user) {
    throw new Error("Failed to create user");
  }

  return user;
}

/** تسجيل الدخول بالبريد وكلمة المرور */
export async function loginUser(
  email: string,
  password: string
): Promise<{ user: User; sessionToken: string }> {
  const user = email.includes("@") ? await getUserByEmail(email) : await getUserByLogin(email);

  if (!user || !user.passwordHash) {
    // رسالة واحدة موحّدة — لا نكشف هل البريد موجود أم لا
    throw new AuthError("UNAUTHORIZED", "اسم الدخول أو كلمة المرور غير صحيحة");
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    throw new AuthError("UNAUTHORIZED", "اسم الدخول أو كلمة المرور غير صحيحة");
  }

  if (!user.isActive) {
    throw new AuthError("UNAUTHORIZED", "هذا الحساب معطّل — تواصل مع المسؤول");
  }

  const sessionToken = await createSessionToken(user.id);

  // تحديث آخر تسجيل دخول (لا يفشل الدخول لو تعذّر)
  try {
    await upsertUser({ openId: user.openId, lastSignedIn: new Date() });
  } catch {}

  return { user, sessionToken };
}

/** Refresh access token using refresh token */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const decoded = await verifyToken(refreshToken);
  if (!decoded) {
    throw new AuthError("UNAUTHORIZED", "Invalid refresh token");
  }
  return createAccessToken(decoded.userId);
}

/** @deprecated للاختبارات القديمة فقط — استخدم loginUser */
export async function findUserByEmailLegacy(email: string) {
  const allUsers = await getAllUsers();
  return allUsers.find((u) => u.email === email);
}
