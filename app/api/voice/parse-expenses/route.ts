import { NextRequest, NextResponse } from "next/server";
import { chatJSON, OpenRouterError } from "../../../../lib/voice/openrouter";
import { requireAuthAndRateLimit } from "../../../../lib/voice/auth";
import {
  buildSystemPrompt,
  buildUserPrompt,
  normalizeParseResponse,
  type RawParseResponse,
} from "../../../../lib/voice/parsePrompt";
import type {
  ParseExpensesRequest,
  ParseExpensesResponse,
  VoiceApiError,
  VoiceMemberContext,
  VoiceCurrencyContext,
} from "../../../../lib/voice/types";

export const runtime = "nodejs";

const MAX_TRANSCRIPT_LENGTH = 4000;
// Bounds how large the members/currencies arrays can be. These come straight
// from the client's journey data, so without a cap a malicious caller could
// pad them arbitrarily to inflate the prompt sent to the (paid) LLM call.
// A real journey has at most a handful of members/currencies in practice.
const MAX_MEMBERS = 100;
const MAX_CURRENCIES = 20;

function isValidMember(m: unknown): m is VoiceMemberContext {
  return (
    !!m &&
    typeof m === "object" &&
    typeof (m as VoiceMemberContext).id === "string" &&
    typeof (m as VoiceMemberContext).name === "string"
  );
}

function isValidCurrency(c: unknown): c is VoiceCurrencyContext {
  return (
    !!c &&
    typeof c === "object" &&
    typeof (c as VoiceCurrencyContext).code === "string" &&
    typeof (c as VoiceCurrencyContext).name === "string" &&
    typeof (c as VoiceCurrencyContext).symbol === "string" &&
    typeof (c as VoiceCurrencyContext).isBase === "boolean"
  );
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndRateLimit(req);
  if (authResult instanceof NextResponse) return authResult;

  let body: Partial<ParseExpensesRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<VoiceApiError>(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { transcript, members, currencies, baseCurrencyCode, currentUserId } =
    body;

  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    return NextResponse.json<VoiceApiError>(
      { error: "Missing transcript" },
      { status: 400 },
    );
  }

  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return NextResponse.json<VoiceApiError>(
      { error: "Transcript too long" },
      { status: 413 },
    );
  }

  if (!Array.isArray(members) || members.length === 0 || !members.every(isValidMember)) {
    return NextResponse.json<VoiceApiError>(
      { error: "Missing or invalid members list" },
      { status: 400 },
    );
  }

  if (members.length > MAX_MEMBERS) {
    return NextResponse.json<VoiceApiError>(
      { error: "Members list too large" },
      { status: 413 },
    );
  }

  if (
    !Array.isArray(currencies) ||
    currencies.length === 0 ||
    !currencies.every(isValidCurrency)
  ) {
    return NextResponse.json<VoiceApiError>(
      { error: "Missing or invalid currencies list" },
      { status: 400 },
    );
  }

  if (currencies.length > MAX_CURRENCIES) {
    return NextResponse.json<VoiceApiError>(
      { error: "Currencies list too large" },
      { status: 413 },
    );
  }

  if (!baseCurrencyCode || typeof baseCurrencyCode !== "string") {
    return NextResponse.json<VoiceApiError>(
      { error: "Missing baseCurrencyCode" },
      { status: 400 },
    );
  }

  if (!currentUserId || typeof currentUserId !== "string") {
    return NextResponse.json<VoiceApiError>(
      { error: "Missing currentUserId" },
      { status: 400 },
    );
  }

  try {
    const systemPrompt = buildSystemPrompt({
      members,
      currencies,
      baseCurrencyCode,
    });
    const userPrompt = buildUserPrompt(transcript);

    const raw = await chatJSON<RawParseResponse>({
      systemPrompt,
      userPrompt,
    });

    const expenses = normalizeParseResponse(
      raw,
      members,
      currencies,
      baseCurrencyCode,
    );

    // Default payer to the current user (person holding the mic) wherever
    // the model returned null - this matches the app's existing default in
    // AddExpenseForm (payerId starts as currentUser.id).
    const withDefaultPayer = expenses.map((exp) =>
      exp.payerId === null
        ? { ...exp, payerId: currentUserId }
        : exp,
    );

    return NextResponse.json<ParseExpensesResponse>({
      expenses: withDefaultPayer,
      transcriptUnclear: !!raw.transcriptUnclear && withDefaultPayer.length === 0,
    });
  } catch (err) {
    console.error("Voice parse-expenses error:", err);
    const status = err instanceof OpenRouterError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Parsing failed unexpectedly.";
    return NextResponse.json<VoiceApiError>(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
