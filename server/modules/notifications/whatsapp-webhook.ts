import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import express from "express";
import { parseDeliveryEvents, recordDeliveryEvents } from "../schedules/whatsapp-delivery-tracking";

const path = "/api/webhooks/whatsapp";

function sameSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function registerWhatsAppWebhook(app: Express): void {
  app.get(path, (req, res) => {
    const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    const mode = req.query["hub.mode"];
    const challenge = req.query["hub.challenge"];
    const supplied = req.query["hub.verify_token"];
    if (!token || mode !== "subscribe" || typeof supplied !== "string" || !sameSecret(supplied, token) || typeof challenge !== "string") {
      res.sendStatus(403);
      return;
    }
    res.status(200).type("text/plain").send(challenge);
  });

  // Register before the global JSON parser so Meta's signature covers the exact payload bytes.
  app.post(path, express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    const secret = process.env.WHATSAPP_META_APP_SECRET;
    const signature = req.header("x-hub-signature-256");
    if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature) || !Buffer.isBuffer(req.body)) {
      res.sendStatus(403);
      return;
    }
    const digest = `sha256=${createHmac("sha256", secret).update(req.body).digest("hex")}`;
    if (!sameSecret(signature.toLowerCase(), digest)) {
      res.sendStatus(403);
      return;
    }
    try {
      const payload = JSON.parse(req.body.toString("utf8"));
      const phoneId=process.env.WHATSAPP_TRIAL_PHONE_NUMBER_ID?.trim();
      if (!phoneId) { res.sendStatus(503); return; }
      await recordDeliveryEvents(parseDeliveryEvents(payload,phoneId));
      res.sendStatus(200);
    } catch (error) {
      if(error instanceof SyntaxError) res.sendStatus(400);
      else { console.error('Unable to persist WhatsApp status events'); res.sendStatus(503); }
    }
  });
}
