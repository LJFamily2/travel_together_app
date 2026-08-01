import type {
  VoiceMemberContext,
  VoiceCurrencyContext,
  ParsedExpense,
  FieldFlag,
} from "./types";

/**
 * Builds the system prompt for the expense-parsing LLM call.
 *
 * Design notes (the "harness"):
 *  - The model receives the ACTUAL member list and ACTUAL currency list for
 *    this journey, and must only ever pick from those - never invent a payer
 *    or a currency that doesn't exist in the journey.
 *  - It is explicitly told about the transition cues ("tiếp theo", "next",
 *    "cái nữa", "thêm một cái", "one more") so it can segment one long
 *    recording into multiple expenses reliably, without us doing fragile
 *    string splitting client-side.
 *  - It must return a `confidence` object per field so the frontend can
 *    render an orange "please check this" warning instead of silently
 *    accepting a bad guess.
 *  - It is told to default split to "equal, all members" unless the speaker
 *    clearly said otherwise (matching the app's existing default).
 *  - It must handle Vietnamese/English code-switching, accented and
 *    unaccented Vietnamese, and numbers spoken as words or digits, in both
 *    languages, including regional accents/mispronunciations transcribed
 *    imperfectly by the STT step.
 */
export function buildSystemPrompt(params: {
  members: VoiceMemberContext[];
  currencies: VoiceCurrencyContext[];
  baseCurrencyCode: string;
}): string {
  const { members, currencies, baseCurrencyCode } = params;

  const memberList = members
    .map((m) => `  - id: "${m.id}", name: "${m.name}"`)
    .join("\n");

  const currencyList = currencies
    .map(
      (c) =>
        `  - code: "${c.code}", name: "${c.name}"${c.isBase ? " (BASE currency)" : ""}`,
    )
    .join("\n");

  return `You are the parsing engine for a voice-to-expense feature in a group travel expense-splitting app.

Your job: read a raw speech-to-text TRANSCRIPT (Vietnamese, English, or a mix of both in the same sentence) and convert it into one or more structured expense records in JSON.

The transcript may describe MULTIPLE expenses in a single recording. The speaker separates them with a transition phrase such as: "tiếp theo", "cái nữa", "thêm một cái", "next", "next one", "another one", or similar. Segment the transcript into separate expenses at these cues. A cue word may itself be mis-transcribed (e.g. "tiep theo" without accents, "necks", "nex" due to STT noise) - use your judgement on near-matches in context, not just exact string matching.

The transcript will likely follow a loose structure similar to: "<description>, <amount> <currency>, <payer> trả" (Vietnamese: payer pays) or the English equivalent, but speakers will vary word order, drop words, mumble, or mix languages ("dinner, hai trăm baht, Hau paid"). Handle this flexibly - do not require an exact template match.

JOURNEY MEMBERS (the ONLY valid payers and split participants - never invent a name not in this list):
${memberList}

JOURNEY CURRENCIES (the ONLY valid currency codes - never invent one):
${currencyList}
Base currency: "${baseCurrencyCode}"

PARSING RULES:
1. description: a short human-readable label for what the expense was for (e.g. "Dinner", "Taxi to airport"). Translate/normalize casually but keep it recognizable - do not translate Vietnamese food/place names that don't have a natural English equivalent.
2. totalAmount: the numeric amount. Handle numbers spoken as words in Vietnamese ("năm trăm chín mươi" = 590) or English ("five ninety", "five hundred ninety"), and digits. Handle Vietnamese magnitude words: "nghìn"/"ngàn" = thousand, "triệu" = million, "trăm" = hundred.
3. currency: match the spoken currency word to one of the journey's currency codes above (e.g. "baht"/"bạt" -> THB if THB is in the list, "đồng"/"vnd"/"đ" -> VND, "dollar"/"đô" -> USD). If no currency is spoken at all, use the base currency "${baseCurrencyCode}" and mark currency as NOT uncertain (silence means base currency, this is expected/normal). If a currency word is spoken but doesn't match any journey currency, still make your best guess at the closest match AND mark it uncertain.
4. payer: match the spoken payer name against the JOURNEY MEMBERS list above, tolerating accent differences, nicknames, and STT mis-transcription (e.g. "Hậu", "Hau", "Hầu", "Hao" spoken with noise should all match a member named "Hậu" if present - use phonetic/fuzzy closeness). If genuinely no reasonable match exists, default payerId to null and mark payer as uncertain. If no payer is mentioned at all, default to null (frontend will default to the current user) and do NOT mark it uncertain (this is a normal, expected omission).
5. split: default to "equal" split among ALL members unless the speaker explicitly names who should split it (e.g. "chỉ chia cho Quang và Hậu" / "only split between Quang and Hau" / "just me and Trang"). If explicit names are given for the split, resolve them the same fuzzy way as payer and set splitMemberIds to just those resolved ids. Never fabricate a "custom" per-person amount split unless the speaker gave explicit differing numbers per person - that is rare; default to "equal".
6. Every parsed expense must include a "confidence" object with a boolean "uncertain" flag per field (description, totalAmount, currency, payer, split) and an optional short "reason" string explaining why, ONLY when uncertain is true. Do not flag fields that were parsed with reasonable confidence just because the source was spoken casually - only flag genuine ambiguity, mishearing risk, unmatched names, or missing critical info (e.g. no amount at all).
7. If the ENTIRE transcript is too garbled/unclear to extract even one reasonable expense, return an empty expenses array and set "transcriptUnclear": true.
8. Ignore filler words, false starts, and background noise artifacts in the transcript.
9. sourceText: include the approximate slice of the original transcript this expense came from, for the user's reference.

Respond with ONLY a JSON object matching this exact shape, no prose, no markdown fences:
{
  "transcriptUnclear": false,
  "expenses": [
    {
      "description": "string",
      "totalAmount": number,
      "currency": "string (one of the journey currency codes)",
      "payerId": "string or null (one of the member ids above, or null)",
      "payerNameRaw": "string or null (the name as spoken, for reference)",
      "splitType": "equal" | "custom",
      "splitMemberIds": ["string", ...] | null,
      "customSplits": [{"userId": "string", "amount": number}, ...] | null,
      "sourceText": "string",
      "confidence": {
        "description": {"uncertain": boolean, "reason": "string (optional)"},
        "totalAmount": {"uncertain": boolean, "reason": "string (optional)"},
        "currency": {"uncertain": boolean, "reason": "string (optional)"},
        "payer": {"uncertain": boolean, "reason": "string (optional)"},
        "split": {"uncertain": boolean, "reason": "string (optional)"}
      }
    }
  ]
}`;
}

export function buildUserPrompt(transcript: string): string {
  return `TRANSCRIPT:\n"""\n${transcript}\n"""`;
}

// --- Raw LLM response shape (before we attach draftIds / defaults) ---

interface RawConfidence {
  uncertain: boolean;
  reason?: string;
}

interface RawParsedExpense {
  description?: string;
  totalAmount?: number;
  currency?: string;
  payerId?: string | null;
  payerNameRaw?: string | null;
  splitType?: "equal" | "custom";
  splitMemberIds?: string[] | null;
  customSplits?: { userId: string; amount: number }[] | null;
  sourceText?: string;
  confidence?: {
    description?: RawConfidence;
    totalAmount?: RawConfidence;
    currency?: RawConfidence;
    payer?: RawConfidence;
    split?: RawConfidence;
  };
}

export interface RawParseResponse {
  transcriptUnclear?: boolean;
  expenses?: RawParsedExpense[];
}

function toFlag(raw: RawConfidence | undefined, forceUncertain = false): FieldFlag {
  return {
    uncertain: forceUncertain || !!raw?.uncertain,
    reason: raw?.reason,
  };
}

/**
 * Validates and normalizes the raw LLM output into safe ParsedExpense[]
 * objects. This is the "harness" backstop: even if the model returns
 * something malformed or references a member/currency that doesn't
 * actually exist, we never trust it blindly - we re-validate against the
 * real journey data and flag anything suspicious rather than silently
 * accepting it.
 */
export function normalizeParseResponse(
  raw: RawParseResponse,
  members: VoiceMemberContext[],
  currencies: VoiceCurrencyContext[],
  baseCurrencyCode: string,
): ParsedExpense[] {
  const memberIds = new Set(members.map((m) => m.id));
  const currencyCodes = new Set(currencies.map((c) => c.code));

  const expenses = Array.isArray(raw.expenses) ? raw.expenses : [];

  return expenses.map((exp, idx) => {
    const flags = {
      description: toFlag(exp.confidence?.description),
      totalAmount: toFlag(exp.confidence?.totalAmount),
      currency: toFlag(exp.confidence?.currency),
      payer: toFlag(exp.confidence?.payer),
      split: toFlag(exp.confidence?.split),
    };

    // Description: must be a non-empty string.
    const description =
      typeof exp.description === "string" && exp.description.trim().length > 0
        ? exp.description.trim()
        : "Expense";
    if (description === "Expense") {
      flags.description = { uncertain: true, reason: "No description detected" };
    }

    // Amount: must be a positive finite number.
    let totalAmount =
      typeof exp.totalAmount === "number" && Number.isFinite(exp.totalAmount)
        ? exp.totalAmount
        : 0;
    if (totalAmount <= 0) {
      totalAmount = 0;
      flags.totalAmount = { uncertain: true, reason: "No valid amount detected" };
    }

    // Currency: must be one the journey actually supports. If not, fall back
    // to base currency and force-flag it, rather than trusting an invented code.
    let currency =
      typeof exp.currency === "string" ? exp.currency.toUpperCase() : baseCurrencyCode;
    if (!currencyCodes.has(currency)) {
      const original = currency;
      currency = baseCurrencyCode;
      flags.currency = {
        uncertain: true,
        reason: flags.currency.reason
          ? flags.currency.reason
          : `Detected currency "${original}" is not configured for this journey; defaulted to ${baseCurrencyCode}`,
      };
    }

    // Payer: must be a real member id, or null.
    const payerId: string | null =
      typeof exp.payerId === "string" && memberIds.has(exp.payerId)
        ? exp.payerId
        : null;
    if (exp.payerId && !payerId) {
      // Model returned a payerId that isn't a real member - never trust it silently.
      flags.payer = {
        uncertain: true,
        reason: flags.payer.reason || "Detected payer does not match a journey member",
      };
    }

    const payerNameRaw =
      typeof exp.payerNameRaw === "string" ? exp.payerNameRaw : null;

    // Split: validate splitMemberIds against real members; drop unknown ids
    // rather than trusting them.
    const splitType: "equal" | "custom" =
      exp.splitType === "custom" ? "custom" : "equal";

    let splitMemberIds: string[] | null = null;
    if (splitType === "equal") {
      if (Array.isArray(exp.splitMemberIds) && exp.splitMemberIds.length > 0) {
        const valid = exp.splitMemberIds.filter((id) => memberIds.has(id));
        if (valid.length === 0) {
          // Every referenced id was bogus - fall back to "all members" and flag it.
          splitMemberIds = null;
          flags.split = {
            uncertain: true,
            reason: "Could not match named split participants; defaulted to all members",
          };
        } else {
          splitMemberIds = valid;
          if (valid.length !== exp.splitMemberIds.length) {
            flags.split = {
              uncertain: true,
              reason: "Some named split participants could not be matched and were dropped",
            };
          }
        }
      } else {
        splitMemberIds = null; // null = all members (the app's existing default)
      }
    }

    let customSplits: { userId: string; amount: number }[] | null = null;
    if (splitType === "custom" && Array.isArray(exp.customSplits)) {
      const valid = exp.customSplits.filter(
        (s) =>
          memberIds.has(s.userId) &&
          typeof s.amount === "number" &&
          Number.isFinite(s.amount) &&
          s.amount >= 0,
      );
      if (valid.length === 0) {
        flags.split = {
          uncertain: true,
          reason: "Custom split amounts could not be validated; review before saving",
        };
      } else {
        customSplits = valid;
        const sum = valid.reduce((a, s) => a + s.amount, 0);
        if (Math.abs(sum - totalAmount) > 0.01) {
          flags.split = {
            uncertain: true,
            reason: "Custom split amounts don't add up to the total; review before saving",
          };
        }
      }
    }

    const sourceText =
      typeof exp.sourceText === "string" ? exp.sourceText : "";

    const draftId = `draft-${Date.now()}-${idx}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    return {
      draftId,
      description,
      totalAmount,
      currency,
      payerId,
      payerNameRaw,
      splitType,
      splitMemberIds,
      customSplits: splitType === "custom" ? customSplits : null,
      sourceText,
      flags,
    };
  });
      }
