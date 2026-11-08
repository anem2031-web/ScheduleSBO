import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWhatsAppWebhook } from "./whatsapp-webhook";

afterEach(() => vi.unstubAllEnvs());

describe("Meta webhook verification", () => {
  it("requires the configured verification token and a valid signed payload", async () => {
    vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "test-verify-secret");
    vi.stubEnv("WHATSAPP_META_APP_SECRET", "test-app-secret");
    const app = express();
    registerWhatsAppWebhook(app);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhooks/whatsapp`;
      const rejected = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge`);
      expect(rejected.status).toBe(403);
      const verified = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=test-verify-secret&hub.challenge=challenge`);
      expect(verified.status).toBe(200);
      expect(await verified.text()).toBe("challenge");

      const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
      const invalid = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body });
      expect(invalid.status).toBe(403);
      const signature = `sha256=${createHmac("sha256", "test-app-secret").update(body).digest("hex")}`;
      const valid = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": signature }, body });
      expect(valid.status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
