import { afterEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
vi.mock("../../shared/db", () => ({ getDb: vi.fn(async () => ({ update })) }));
import { getNameTranslationAttempt, getNameTranslationConfiguration, isNameTranslationEnabled, scheduleWorkerNameTranslation, translateMissingWorkerNames, translateName } from "./worker-name-translation";
import { getDb } from "../../shared/db";
import { createWorkerSchema } from "../workers/workers.validation";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("worker name translation", () => {
  it("does not enable external processing unless explicitly configured", () => {
    vi.stubEnv("TRANSLATION_ENABLED", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("TRANSLATION_MODEL", "test-model");
    expect(isNameTranslationEnabled()).toBe(false);
  });

  it("honors the user's choice not to translate even when the provider is enabled", async () => {
    vi.stubEnv("TRANSLATION_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("TRANSLATION_MODEL", "test-model");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    scheduleWorkerNameTranslation(1, { nameAr: "أحمد", nameEn: null, nameUr: null });
    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("reports disabled and incomplete configuration without exposing credentials", () => {
    vi.stubEnv("TRANSLATION_ENABLED", "false");
    expect(getNameTranslationConfiguration()).toBe("disabled");
    scheduleWorkerNameTranslation(103, { nameAr: "أحمد" }, "ar");
    expect(getNameTranslationAttempt(103)).toBe("not_configured");
    vi.stubEnv("TRANSLATION_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("TRANSLATION_MODEL", "test-model");
    expect(getNameTranslationConfiguration()).toBe("incomplete");
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    expect(getNameTranslationConfiguration()).toBe("ready");
  });

  it("reports provider failure and retains no provider response", async () => {
    vi.stubEnv("TRANSLATION_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("TRANSLATION_MODEL", "test-model");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("private provider details", { status: 401 }));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    scheduleWorkerNameTranslation(104, { nameAr: "أحمد", nameEn: null, nameUr: null }, "ar");
    await vi.waitFor(() => expect(getNameTranslationAttempt(104)).toBe("failed"));
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain("private provider details");
    fetchSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("accepts only a valid single-line provider output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("TRANSLATION_MODEL", "test-model");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "Ahmed" }] }] }), { status: 200 })) as unknown as typeof fetch;
    expect(await translateName("أحمد", "ar", "en", fetcher)).toBe("Ahmed");
    const invalid = vi.fn(async () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "Ahmed\nMore text" }] }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(translateName("أحمد", "ar", "en", invalid)).rejects.toThrow("TRANSLATION_INVALID_RESULT");
  });

  it("translates only empty languages and preserves supplied names", async () => {
    const where = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where }));
    update.mockReturnValue({ set });
    const translate = vi.fn(async () => "احمد");
    await translateMissingWorkerNames(1, "ar", { nameAr: "أحمد", nameEn: "Ahmad", nameUr: null }, translate);
    expect(translate).toHaveBeenCalledOnce();
    expect(translate).toHaveBeenCalledWith("أحمد", "ar", "ur");
    expect(set).toHaveBeenCalledWith({ nameUr: "احمد" });
    expect(where).toHaveBeenCalledOnce();
  });

  it("does not accept an empty selected source name", () => {
    const base = { employeeId: "W1", nameAr: "أحمد", departmentId: 1, jobTitleId: 1, status: "active" as const };
    expect(createWorkerSchema.safeParse({ ...base, sourceLanguage: "en" }).success).toBe(false);
    expect(createWorkerSchema.safeParse({ ...base, nameEn: "Ahmed", sourceLanguage: "en" }).success).toBe(true);
  });
});
