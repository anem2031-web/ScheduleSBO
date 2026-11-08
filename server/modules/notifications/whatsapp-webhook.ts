import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import express from "express";

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
  app.post(path, express.raw({ type: "application/json", limit: "1mb" }), (req, res) => {
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
      const payload = JSON.parse(req.body.toString("utf8")) as { entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<{ status?: string }> } }> }> };
      const statuses = payload.entry?.flatMap((entry) => entry.changes?.flatMap((change) => change.value?.statuses?.map((status) => status.status ?? "unknown") ?? []) ?? []) ?? [];
      if (statuses.length) console.info("WhatsApp trial status events:", statuses.join(","));
      res.sendStatus(200);
    } catch {
      res.sendStatus(400);
    }
  });
}
