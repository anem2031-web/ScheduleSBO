import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
const tracking=vi.hoisted(()=>({record:vi.fn()}));
vi.mock('../schedules/whatsapp-delivery-tracking',async(importOriginal)=>({...(await importOriginal<typeof import('../schedules/whatsapp-delivery-tracking')>()),recordDeliveryEvents:tracking.record}));
import { registerWhatsAppWebhook } from "./whatsapp-webhook";

afterEach(() => vi.unstubAllEnvs());

describe("Meta webhook verification", () => {
  it("requires the configured verification token and a valid signed payload", async () => {
    vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "test-verify-secret");
    vi.stubEnv("WHATSAPP_META_APP_SECRET", "test-app-secret");
    vi.stubEnv("WHATSAPP_TRIAL_PHONE_NUMBER_ID", "123456789012345");
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

      const eventBody=JSON.stringify({entry:[{changes:[{value:{metadata:{phone_number_id:'123456789012345'},statuses:[{id:'wamid.abc123',status:'delivered',timestamp:String(Math.floor(Date.now()/1000))}]}}]}]});
      const eventSignature=`sha256=${createHmac('sha256','test-app-secret').update(eventBody).digest('hex')}`;
      tracking.record.mockResolvedValueOnce(undefined);
      const eventResponse=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':eventSignature},body:eventBody});
      expect(eventResponse.status).toBe(200);
      expect(tracking.record).toHaveBeenLastCalledWith([expect.objectContaining({messageId:'wamid.abc123',status:'delivered'})]);
      tracking.record.mockRejectedValueOnce(new Error('database unavailable'));
      const log=vi.spyOn(console,'error').mockImplementation(()=>{});
      const failed=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':eventSignature},body:eventBody});
      expect(failed.status).toBe(503);
      log.mockRestore();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
