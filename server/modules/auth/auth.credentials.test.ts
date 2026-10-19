import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./auth.service", () => ({
  AuthError: class extends Error {},
  SESSION_MAX_AGE_MS: 604800000,
  loginUser: vi.fn(),
  registerUser: vi.fn(),
}));
import { authRouter } from "./auth.router";
import { loginUser, registerUser } from "./auth.service";

const context = (role = "admin", permissions?: string[]) => ({ user: { id: 1, role, permissions }, req: { protocol: "http", headers: {} }, res: { cookie: vi.fn() } }) as any;
describe("Username and seven-character credentials", () => {
  beforeEach(() => vi.resetAllMocks());
  it("accepts ADMIN as an identifier and a seven-digit password without exposing its hash", async () => {
    vi.mocked(loginUser).mockResolvedValue({ user: { id: 1, username: "admin", passwordHash: "private" } as any, sessionToken: "session" });
    const ctx = context();
    const result = await authRouter.createCaller(ctx).login({ email: " ADMIN ", password: "1234567" });
    expect(loginUser).toHaveBeenCalledWith("admin", "1234567");
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(ctx.res.cookie).toHaveBeenCalled();
  });
  it("rejects six-character passwords before authentication with a clear message", async () => {
    await expect(authRouter.createCaller(context()).login({ email: "ADMIN", password: "123456" })).rejects.toThrow("7");
    expect(loginUser).not.toHaveBeenCalled();
  });
  it.each(["1234567", "abcdefg", "abc1234", "longer-password"])("accepts account creation with %s", async password => {
    vi.mocked(registerUser).mockResolvedValue({ id: 2 } as any);
    await expect(authRouter.createCaller(context()).register({ email: "test@example.com", username: "HR01", password, name: "موظف اختبار", role: "hr_admin" })).resolves.toMatchObject({ success: true });
  });
  it("honors account-specific denial despite the legacy role", async () => {
    await expect(authRouter.createCaller(context("hr_admin", [])).register({ email: "test@example.com", password: "1234567", name: "اختبار" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("prevents delegated account creation from escalating to admin", async () => {
    await expect(authRouter.createCaller(context("hr_admin", ["users:create"])).register({ email: "test@example.com", password: "1234567", name: "اختبار", role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(registerUser).not.toHaveBeenCalled();
  });
});
