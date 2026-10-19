import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/env", () => ({
  ENV: { cookieSecret: "inactive-account-unit-test-secret" },
}));
vi.mock("jose", () => ({
  jwtVerify: vi.fn(async () => ({ payload: { userId: 2 } })),
  SignJWT: vi.fn(),
}));
vi.mock("bcrypt", () => ({ default: { compare: vi.fn(async () => true) } }));
vi.mock("../users/users.repository", () => ({
  getAllUsers: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

import { authenticateRequest, loginUser } from "./auth.service";
import {
  getUserByEmail,
  getUserById,
  upsertUser,
} from "../users/users.repository";

const requestWithExistingToken = {
  headers: { authorization: "Bearer valid-old-session" },
} as any;

describe("Archived account access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a new login to an archived account even with the correct password", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({
      id: 2,
      role: "supervisor",
      isActive: false,
      passwordHash: "existing-hash",
    } as any);
    await expect(
      loginUser("supervisor@example.com", "correct-password"),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it("invalidates an existing signed session as soon as its account is archived", async () => {
    vi.mocked(getUserById).mockResolvedValue({
      id: 2,
      role: "supervisor",
      isActive: false,
    } as any);
    await expect(
      authenticateRequest(requestWithExistingToken),
    ).resolves.toBeNull();
  });

  it("continues to allow an active account with the same session", async () => {
    const activeUser = { id: 2, role: "supervisor", isActive: true } as any;
    vi.mocked(getUserById).mockResolvedValue(activeUser);
    await expect(authenticateRequest(requestWithExistingToken)).resolves.toBe(
      activeUser,
    );
  });

  it("rejects the token when its account no longer exists", async () => {
    vi.mocked(getUserById).mockResolvedValue(undefined);
    await expect(
      authenticateRequest(requestWithExistingToken),
    ).resolves.toBeNull();
  });
});
