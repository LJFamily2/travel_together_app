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
  /**
   * Raw upstream error detail (response body, network error message, etc.),
   * kept for server-side console.error logging only. `message` itself is
   * always a curated, user-safe string - see mapUpstreamStatusToMessage.
   * Never send `detail` to the client.
   */
  detail?: string;
  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Maps an upstream HTTP status to a short, human-friendly message safe to
 * show directly in the UI. We deliberately never forward the raw response
 * body from OpenRouter/the STT or LLM provider to the client - it can be a
 * JSON blob, a stack trace fragment, or otherwise confusing/leaky text.
 */
function mapUpstreamStatusToMessage(
  status: number,
  context: "transcribe" | "parse",
): string {
  if (status === 401 || status === 403) {
    return "Voice service isn't configured correctly. Please contact support.";
  }
  if (status === 429) {
    return "The voice service is busy right now. Please wait a moment and try again.";
  }
  if (status >= 500 || status === 0) {
    return context === "transcribe"
      ? "Couldn't reach the transcription service. Please try again."
      : "Couldn't reach the parsing service. Please try again.";
  }
  return context === "transcribe"
    ? "Couldn't transcribe that recording. Please try again."
    : "Couldn't understand that recording. Please try again.";
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
  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE_URL}/audio/transcriptions`, {
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
  } catch (err) {
    // Network-level failure (DNS, timeout, connection refused, ...) - never
    // reached OpenRouter at all, so there's no response body to log.
    throw new OpenRouterError(
      mapUpstreamStatusToMessage(0, "transcribe"),
      503,
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[voice] OpenRouter transcription error (${res.status}):`,
      text || res.statusText,
    );
    throw new OpenRouterError(
      mapUpstreamStatusToMessage(res.status, "transcribe"),
      res.status,
      text || res.statusText,
    );
  }

  const data = await res.json();
  const transcript = data?.text;
  if (typeof transcript !== "string") {
    console.error("[voice] OpenRouter transcription response missing text:", data);
    throw new OpenRouterError(
      mapUpstreamStatusToMessage(502, "transcribe"),
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

  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
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
  } catch (err) {
    throw new OpenRouterError(
      mapUpstreamStatusToMessage(0, "parse"),
      503,
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[voice] OpenRouter chat-completion error (${res.status}):`,
      text || res.statusText,
    );
    throw new OpenRouterError(
      mapUpstreamStatusToMessage(res.status, "parse"),
      res.status,
      text || res.statusText,
    );
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    console.error("[voice] OpenRouter chat-completion response missing content:", data);
    throw new OpenRouterError(mapUpstreamStatusToMessage(502, "parse"), 502);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    console.error("[voice] OpenRouter chat-completion returned non-JSON content:", raw);
    throw new OpenRouterError(mapUpstreamStatusToMessage(502, "parse"), 502);
  }
}
