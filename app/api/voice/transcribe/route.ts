import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio, OpenRouterError } from "../../../../lib/voice/openrouter";
import { requireAuthAndRateLimit } from "../../../../lib/voice/auth";
import type {
  TranscribeResponse,
  VoiceApiError,
} from "../../../../lib/voice/types";

export const runtime = "nodejs";

// Roughly 15MB of base64 audio (~11MB raw) - generous for a single push-to-talk
// recording (a few minutes of compressed webm/opus audio), while still
// protecting the server from accidental huge uploads.
const MAX_BASE64_LENGTH = 15 * 1024 * 1024;

interface TranscribeRequestBody {
  audioBase64?: string;
  format?: string;
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndRateLimit(req);
  if (authResult instanceof NextResponse) return authResult;

  let body: TranscribeRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<VoiceApiError>(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { audioBase64, format } = body;

  if (!audioBase64 || typeof audioBase64 !== "string") {
    return NextResponse.json<VoiceApiError>(
      { error: "Missing audioBase64" },
      { status: 400 },
    );
  }

  if (!format || typeof format !== "string") {
    return NextResponse.json<VoiceApiError>(
      { error: "Missing format" },
      { status: 400 },
    );
  }

  if (audioBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json<VoiceApiError>(
      { error: "Audio too large. Please keep recordings under a few minutes." },
      { status: 413 },
    );
  }

  try {
    const transcript = await transcribeAudio(audioBase64, format);

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json<VoiceApiError>(
        {
          error:
            "Couldn't hear anything in that recording. Please try again and speak clearly.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json<TranscribeResponse>({ transcript });
  } catch (err) {
    console.error("Voice transcribe error:", err);
    const status = err instanceof OpenRouterError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Transcription failed unexpectedly.";
    return NextResponse.json<VoiceApiError>(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
