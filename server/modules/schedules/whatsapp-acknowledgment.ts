import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeliveryEvent } from "./whatsapp-delivery-tracking";

const payloadPrefix = "schedule_ack_v1_";
const phoneDigitsPattern = /^[1-9][0-9]{6,14}$/;
const messageIdPattern = /^wamid\.[A-Za-z0-9_+=./-]{1,240}$/;
const timestampPattern = /^[1-9][0-9]{8,10}$/;

/** Opaque quick reply payload for an approved schedule template. */
export function scheduleAcknowledgmentPayload(phoneDigits: string, secret: string): string {
  const digest = createHmac("sha256", secret)
    .update("workforce-management:whatsapp:schedule-acknowledgment:v1\0")
    .update(phoneDigits)
    .digest("base64url");

  return `${payloadPrefix}${digest}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isExactMatch(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.exec(value)?.[0] === value;
}

/** Parse only recipient-bound quick replies from an already verified Meta webhook. */
export function parseScheduleAcknowledgments(
  payload: unknown,
  phoneNumberId: string,
  secret: string,
): DeliveryEvent[] {
  if (!phoneNumberId || !secret) return [];

  const events: DeliveryEvent[] = [];
  const latestAcceptedTimestamp = Math.floor(Date.now() / 1000) + 86_400;

  for (const entry of asArray(asRecord(payload)?.entry)) {
    for (const change of asArray(asRecord(entry)?.changes)) {
      const value = asRecord(asRecord(change)?.value);
      if (asRecord(value?.metadata)?.phone_number_id !== phoneNumberId) continue;

      for (const rawMessage of asArray(value?.messages)) {
        const message = asRecord(rawMessage);
        if (message?.type !== "button") continue;

        const { from, id, timestamp } = message;
        const originalMessageId = asRecord(message.context)?.id;
        const replyPayload = asRecord(message.button)?.payload;
        if (
          !isExactMatch(from, phoneDigitsPattern) ||
          !isExactMatch(id, messageIdPattern) ||
          !isExactMatch(originalMessageId, messageIdPattern) ||
          !isExactMatch(timestamp, timestampPattern) ||
          typeof replyPayload !== "string" ||
          !replyPayload.startsWith(payloadPrefix) ||
          replyPayload.length !== payloadPrefix.length + 43
        ) continue;

        const occurredAt = Number(timestamp);
        if (occurredAt < 946_684_800 || occurredAt > latestAcceptedTimestamp) continue;

        const expected = Buffer.from(scheduleAcknowledgmentPayload(from, secret));
        const actual = Buffer.from(replyPayload);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) continue;

        // Store the original outbound ID so late API acceptance can still match this event.
        events.push({
          messageId: originalMessageId,
          status: "acknowledged",
          occurredAt: new Date(occurredAt * 1000),
          errorCode: null,
        });
      }
    }
  }

  return events;
}
