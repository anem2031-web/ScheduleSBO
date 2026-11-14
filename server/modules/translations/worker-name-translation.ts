import { and, eq, isNull, or } from "drizzle-orm";
import { workers } from "../../../drizzle/schema";
import { getDb } from "../../shared/db";

export type TranslationLanguage = "ar" | "en" | "ur";
type NameFields = { nameAr?: string | null; nameEn?: string | null; nameUr?: string | null };
const fields = { ar: "nameAr", en: "nameEn", ur: "nameUr" } as const;
const languageNames = { ar: "Arabic", en: "English", ur: "Urdu" } as const;

/** External processing is deliberately opt-in: names are employee data. */
export function isNameTranslationEnabled() {
  return getNameTranslationConfiguration() === "ready";
}

export function getNameTranslationConfiguration(): "ready" | "disabled" | "incomplete" {
  if (process.env.TRANSLATION_ENABLED !== "true") return "disabled";
  return process.env.OPENAI_API_KEY?.trim() && process.env.TRANSLATION_MODEL?.trim() ? "ready" : "incomplete";
}

type Attempt = "pending" | "complete" | "failed" | "not_configured";
const attempts = new Map<number, { state: Attempt; token: symbol; recordedAt: number }>();
const ATTEMPT_TTL_MS = 30 * 60 * 1000;

function recordAttempt(workerId: number, state: Attempt, token: symbol) {
  const now = Date.now();
  attempts.forEach((attempt, id) => { if (now - attempt.recordedAt > ATTEMPT_TTL_MS) attempts.delete(id); });
  if (!attempts.has(workerId) && attempts.size >= 1000) attempts.delete(attempts.keys().next().value!);
  attempts.set(workerId, { state, token, recordedAt: now });
}

/** Process-local only: not an audit log and not shared between replicas. */
export function getNameTranslationAttempt(workerId: number): Attempt | "unknown" {
  const attempt = attempts.get(workerId);
  if (!attempt || Date.now() - attempt.recordedAt > ATTEMPT_TTL_MS) {
    attempts.delete(workerId);
    return "unknown";
  }
  return attempt.state;
}

/** Translate a name as a name (transliteration), not as a common noun. */
export async function translateName(
  name: string,
  source: TranslationLanguage,
  target: TranslationLanguage,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.TRANSLATION_MODEL?.trim();
  if (!key || !model) throw new Error("TRANSLATION_NOT_CONFIGURED");
  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model,
      store: false,
      instructions: `Transliterate the person's name from ${languageNames[source]} to ${languageNames[target]}. Preserve the name, do not translate its meaning. Return the name only, no explanation.`,
      input: name,
      max_output_tokens: 200,
    }),
  });
  if (!response.ok) throw new Error(`TRANSLATION_PROVIDER_HTTP_${response.status}`);
  const payload = await response.json() as { output?: Array<{ type?: string; content?: Array<{type?: string; text?: string}> }> };
  const value = payload.output?.flatMap(item => item.type === "message" ? item.content ?? [] : [])
    .filter(item => item.type === "output_text")
    .map(item => item.text ?? "").join("").trim();
  if (!value || value.length > 255 || /[\r\n]/.test(value)) throw new Error("TRANSLATION_INVALID_RESULT");
  return value;
}

/**
 * Runs after the original record is saved. Writes only into an empty field and
 * only while the source is unchanged; user-entered names always win races.
 */
export async function translateMissingWorkerNames(
  workerId: number,
  sourceLanguage: TranslationLanguage,
  snapshot: NameFields,
  translate: typeof translateName = translateName,
): Promise<void> {
  const sourceField = fields[sourceLanguage];
  const sourceValue = snapshot[sourceField]?.trim();
  if (!sourceValue) return;
  const db = await getDb();
  if (!db) throw new Error("DATABASE_NOT_AVAILABLE");
  const targets = (["ar", "en", "ur"] as const).filter(lang => lang !== sourceLanguage && !snapshot[fields[lang]]?.trim());
  await Promise.all(targets.map(async target => {
    const value = await translate(sourceValue, sourceLanguage, target);
    const targetField = fields[target];
    const column = workers[targetField];
    await db.update(workers).set({ [targetField]: value }).where(and(
      eq(workers.id, workerId),
      eq(workers[sourceField], sourceValue),
      or(isNull(column), eq(column, "")),
    ));
  }));
}

export function scheduleWorkerNameTranslation(workerId: number, snapshot: NameFields, sourceLanguage?: TranslationLanguage) {
  if (!sourceLanguage) return;
  const token = Symbol();
  if (!isNameTranslationEnabled()) {
    recordAttempt(workerId, "not_configured", token);
    return;
  }
  recordAttempt(workerId, "pending", token);
  void translateMissingWorkerNames(workerId, sourceLanguage, snapshot).then(() => {
    if (attempts.get(workerId)?.token === token) recordAttempt(workerId, "complete", token);
  }).catch(error => {
    if (attempts.get(workerId)?.token === token) recordAttempt(workerId, "failed", token);
    // Do not log employee text, API responses, or credentials.
    console.error("Worker name translation failed", { code: typeof error?.message === "string" && /^TRANSLATION_(?:PROVIDER_HTTP_\d+|INVALID_RESULT|NOT_CONFIGURED)$/.test(error.message) ? error.message : "TRANSLATION_ERROR" });
  });
}
