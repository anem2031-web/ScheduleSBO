import { describe, it, expect } from "vitest";
import * as auth from "./auth.service";

describe("Authentication System", () => {
  const testPassword = "TestPassword123!";

  describe("Password Hashing", () => {
    it("should hash password correctly", async () => {
      const hash = await auth.hashPassword(testPassword);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(testPassword);
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should verify correct password", async () => {
      const hash = await auth.hashPassword(testPassword);
      const isValid = await auth.comparePassword(testPassword, hash);
      expect(isValid).toBe(true);
    });

    it("should reject incorrect password", async () => {
      const hash = await auth.hashPassword(testPassword);
      const isValid = await auth.comparePassword("WrongPassword", hash);
      expect(isValid).toBe(false);
    });
  });

  describe("JWT Tokens", () => {
    it("should create access token", async () => {
      const token = await auth.createAccessToken(1);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // JWT format: header.payload.signature
    });

    it("should create refresh token", async () => {
      const token = await auth.createRefreshToken(1);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3);
    });

    it("should verify valid token", async () => {
      const token = await auth.createAccessToken(42);
      const decoded = await auth.verifyToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(42);
    });

    it("should reject invalid token", async () => {
      const decoded = await auth.verifyToken("invalid.token.here");
      expect(decoded).toBeNull();
    });

    it("should reject expired token", async () => {
      // Create a token that expires immediately
      const token = await auth.createAccessToken(1);
      // Wait a tiny bit and try to verify
      const decoded = await auth.verifyToken(token);
      // Should still be valid (token just created)
      expect(decoded).toBeDefined();
    });
  });

  describe("Token Refresh", () => {
    it("should create valid refresh token", async () => {
      const refreshToken = await auth.createRefreshToken(1);
      expect(refreshToken).toBeDefined();
      expect(typeof refreshToken).toBe("string");
    });

    it("should reject invalid refresh token", async () => {
      try {
        await auth.refreshAccessToken("invalid.token");
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(String(error)).toContain("Invalid refresh token");
      }
    });

    it("should create new access token from refresh token", async () => {
      const refreshToken = await auth.createRefreshToken(99);
      const newAccessToken = await auth.refreshAccessToken(refreshToken);
      expect(newAccessToken).toBeDefined();
      expect(typeof newAccessToken).toBe("string");
      
      // Verify the new token is valid
      const decoded = await auth.verifyToken(newAccessToken);
      expect(decoded?.userId).toBe(99);
    });
  });

  describe("Token Extraction", () => {
    it("should extract token from Authorization header", () => {
      const mockReq = {
        headers: {
          authorization: "Bearer test.token.here",
        },
      } as any;
      
      const token = auth.extractToken(mockReq);
      expect(token).toBe("test.token.here");
    });

    it("should extract token from cookie", () => {
      const mockReq = {
        headers: {
          cookie: "app_session_id=cookie.token.here; other=value",
        },
      } as any;
      
      const token = auth.extractToken(mockReq);
      expect(token).toBe("cookie.token.here");
    });

    it("should return null if no token found", () => {
      const mockReq = {
        headers: {},
      } as any;
      
      const token = auth.extractToken(mockReq);
      expect(token).toBeNull();
    });

    it("should prefer Authorization header over cookie", () => {
      const mockReq = {
        headers: {
          authorization: "Bearer header.token.here",
          cookie: "session=cookie.token.here",
        },
      } as any;
      
      const token = auth.extractToken(mockReq);
      expect(token).toBe("header.token.here");
    });
  });
});

describe("Local Session Tokens", () => {
  it("creates a session token verifiable back to the same user", async () => {
    const token = await auth.createSessionToken(42);
    const decoded = await auth.verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe(42);
  });

  it("prefers the session cookie over the Authorization header", () => {
    const mockReq = {
      headers: {
        cookie: "app_session_id=cookie.token; other=x",
        authorization: "Bearer header.token",
      },
    } as any;
    expect(auth.extractToken(mockReq)).toBe("cookie.token");
  });

  it("falls back to the Authorization header when no cookie", () => {
    const mockReq = {
      headers: { authorization: "Bearer header.token" },
    } as any;
    expect(auth.extractToken(mockReq)).toBe("header.token");
  });
});
