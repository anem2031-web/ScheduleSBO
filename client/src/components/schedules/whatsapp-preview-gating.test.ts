import { describe, expect, it } from "vitest";
import { invalidWhatsAppPreview } from "./whatsapp-preview-gating";

const ready = { isLoading: false, isFetching: false, error: null };

describe("WhatsApp pilot preview safety", () => {
  it("only permits a non-empty batch where every worker has a valid preview", () => {
    expect(invalidWhatsAppPreview({ ...ready, data: { messages: [{ error: null, configurationError: null }, { error: null, configurationError: null }] } })).toBe(false);
    expect(invalidWhatsAppPreview({ ...ready, data: { messages: [{ error: null, configurationError: null }, { error: "Unsupported language", configurationError: null }] } })).toBe(true);
    expect(invalidWhatsAppPreview({ ...ready, data: { messages: [{ error: null, configurationError: "Template not approved" }] } })).toBe(true);
    expect(invalidWhatsAppPreview({ ...ready, data: { messages: [] } })).toBe(true);
  });

  it("blocks a stale or unavailable preview while changing format or on a server error", () => {
    const data = { messages: [{ error: null, configurationError: null }] };
    expect(invalidWhatsAppPreview({ ...ready, isLoading: true, data })).toBe(true);
    expect(invalidWhatsAppPreview({ ...ready, isFetching: true, data })).toBe(true);
    expect(invalidWhatsAppPreview({ ...ready, error: new Error("unavailable"), data })).toBe(true);
    expect(invalidWhatsAppPreview(ready)).toBe(true);
  });
});
