import { describe, expect, it } from "vitest";
import { parseScheduleAcknowledgments, scheduleAcknowledgmentPayload } from "./whatsapp-acknowledgment";

const secret = "fixture-app-secret";
const phoneNumberId = "123456789012345";
const from = "966500000001";
const validReply = {
  type: "button",
  from,
  id: "wamid.Inbound_1=",
  context: { id: "wamid.Outbound_1=" },
  timestamp: "1760000000",
  button: { payload: scheduleAcknowledgmentPayload(from, secret), text: "تم الاستلام" },
};

function webhook(messages: unknown[], senderId = phoneNumberId) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: senderId },
      messages,
    } }] }],
  };
}

describe("schedule acknowledgment quick replies", () => {
  it("uses an opaque, fixed-length payload bound to the intended phone and app", () => {
    const payload = validReply.button.payload;
    expect(payload).toMatch(/^schedule_ack_v1_[\w-]{43}$/);
    expect(payload).toBe(scheduleAcknowledgmentPayload(from, secret));
    expect(payload).not.toContain(from);
    expect(payload).not.toBe(scheduleAcknowledgmentPayload("966500000002", secret));
    expect(payload).not.toBe(scheduleAcknowledgmentPayload(from, "different-app-secret"));
  });

  it("returns only the outbound ID, acknowledgment status, and provider timestamp", () => {
    expect(parseScheduleAcknowledgments(webhook([validReply]), phoneNumberId, secret)).toEqual([{
      messageId: validReply.context.id,
      status: "acknowledged",
      occurredAt: new Date(Number(validReply.timestamp) * 1000),
      errorCode: null,
    }]);
  });

  it("ignores wrong senders, unrelated buttons and invalid raw fields", () => {
    const invalidReplies = [
      null,
      { ...validReply, type: "text" },
      { ...validReply, type: "interactive" },
      { ...validReply, from: "966500000002" },
      { ...validReply, from: `+${from}` },
      { ...validReply, from: ` ${from}` },
      { ...validReply, id: "malformed" },
      { ...validReply, context: undefined },
      { ...validReply, context: { id: `${validReply.context.id}\n` } },
      { ...validReply, timestamp: Number(validReply.timestamp) },
      { ...validReply, timestamp: `0${validReply.timestamp}` },
      { ...validReply, timestamp: "99999999999" },
      { ...validReply, button: { payload: "ordinary-quick-reply", text: validReply.button.text } },
      { ...validReply, button: { payload: scheduleAcknowledgmentPayload(from, "different-secret") } },
    ];
    expect(parseScheduleAcknowledgments(webhook(invalidReplies), phoneNumberId, secret)).toEqual([]);
    expect(parseScheduleAcknowledgments(webhook([validReply], "other-phone-id"), phoneNumberId, secret)).toEqual([]);
  });
});
