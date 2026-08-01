/**
 * Thin client around OpenRouter's REST API.
 * Docs: https://openrouter.ai/docs
 *
 * We use two endpoints:
 *  - POST /api/v1/audio/transcriptions  (speech-to-text, Whisper by default)
 *  - POST /api/v1/chat/completions      (LLM parsing, JSON-mode)
 *
 * Both share the same OPENROUTER_API_KEY.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Model used for speech-to-text. Override via env if you want a different STT model. */
export const VOICE_STT_MODEL =
  process.env.OPENROUTER_STT_MODEL || "openai/whisper-1";

/** Model used for parsing the transcript into structured expenses. */
export const VOICE_PARSE_MODEL =
  process.env.OPENROUTER_PARSE_MODEL || "openai/gpt-4o-mini";

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to your .env.local file.",
    );
  }
  return key;
}

export class OpenRouterError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

/**
 * Transcribe an audio buffer using OpenRouter's transcription endpoint.
 * Accepts base64-encoded audio + a format string (e.g. "webm", "mp3", "wav").
 * We do NOT force a single language, since the whole point is to support
 * code-switched Vietnamese/English utterances in one sentence.
 */
export async function transcribeAudio(
  audioBase64: string,
  format: string,
): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://localhost:3000",
      "X-Title": "Travel Together - Voice Expense",
    },
    body: JSON.stringify({
      model: VOICE_STT_MODEL,
      input_audio: {
        data: audioBase64,
        format,
      },
      // Do not set `language` - let the model auto-detect / code-switch.
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OpenRouterError(
      `Transcription failed (${res.status}): ${text || res.statusText}`,
      res.status,
    );
  }

  const data = await res.json();
  const transcript = data?.text;
  if (typeof transcript !== "string") {
    throw new OpenRouterError(
      "Transcription response did not include text.",
      502,
    );
  }
  return transcript;
}

/**
 * Call an OpenRouter chat-completion model in strict JSON mode.
 * Returns the parsed JSON object from the model's single text response.
 */
export async function chatJSON<T>(params: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
}): Promise<T> {
  const { systemPrompt, userPrompt, model, temperature = 0.1 } = params;

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://localhost:3000",
      "X-Title": "Travel Together - Voice Expense",
    },
    body: JSON.stringify({
      model: model || VOICE_PARSE_MODEL,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OpenRouterError(
      `LLM parse call failed (${res.status}): ${text || res.statusText}`,
      res.status,
    );
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    throw new OpenRouterError(
      "LLM response did not include message content.",
      502,
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new OpenRouterError(
      "LLM response was not valid JSON.",
      502,
    );
  }
}
