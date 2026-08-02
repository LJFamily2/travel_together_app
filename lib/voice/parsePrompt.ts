import type {
  VoiceMemberContext,
  VoiceCurrencyContext,
  ParsedExpense,
  FieldFlag,
  VoiceConversationTurn,
  ClarificationRequest,
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
 *  - It must NOT require the "<description>, <amount> <currency>, <payer>
 *    trả" template to match exactly - that's a loose example of common
 *    phrasing, not a grammar to enforce. Real speech is messy: dropped
 *    words, reordered clauses, run-on sentences, casual mentions. The model
 *    should extract what it reasonably can rather than rejecting the whole
 *    transcript just because it doesn't match the example shape.
 *  - If something genuinely blocking is missing (in practice: no amount at
 *    all could be determined), the model may return a single short
 *    `clarification` question instead of silently giving up. Non-blocking
 *    gaps (payer, currency, split) keep using safe defaults + confidence
 *    flags as before - only ask when there's truly nothing to fall back on.
 */
export function buildSystemPrompt(params: {
  members: VoiceMemberContext[];
  currencies: VoiceCurrencyContext[];
  baseCurrencyCode: string;
  /** true once the conversation has already had 2+ clarification rounds - tells the model to stop asking and just do its best. */
  isFinalAttempt?: boolean;
}): string {
  const { members, currencies, baseCurrencyCode, isFinalAttempt } = params;

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

FLEXIBILITY IS CRITICAL: Real speech is messy. Speakers drop words, reorder clauses, mumble, self-correct mid-sentence, or phrase things in ways that don't match any template. Do NOT reject a transcript just because it doesn't follow an expected structure - extract whatever expense information is reasonably inferable from natural, casual, fragmented, or oddly-ordered speech. Only treat a transcript as unparseable if it truly contains no identifiable expense information at all (e.g. silence, unrelated chit-chat, or pure noise transcribed as nonsense).

The transcript may describe MULTIPLE expenses in a single recording. The speaker separates them with a transition phrase such as: "tiếp theo", "cái nữa", "thêm một cái", "next", "next one", "another one", or similar. Segment the transcript into separate expenses at these cues. A cue word may itself be mis-transcribed (e.g. "tiep theo" without accents, "necks", "nex" due to STT noise) - use your judgement on near-matches in context, not just exact string matching.

The transcript will often loosely resemble: "<description>, <amount> <currency>, <payer> trả" (Vietnamese: payer pays) or the English equivalent, but treat this as ONE example of common phrasing, not a required grammar. Speakers will vary word order, drop words, mumble, mix languages ("dinner, hai trăm baht, Hau paid"), state the amount first, mention the payer before the description, or phrase things conversationally ("so Hau covered dinner, it was about two hundred baht"). Handle all of this flexibly.

JOURNEY MEMBERS (the ONLY valid payers and split participants - never invent a name not in this list):
${memberList}

JOURNEY CURRENCIES (the ONLY valid currency codes - never invent one):
${currencyList}
Base currency: "${baseCurrencyCode}"

PARSING RULES:
1. description: a short human-readable label for what the expense was for (e.g. "Dinner", "Taxi to airport"). Translate/normalize casually but keep it recognizable - do not translate Vietnamese food/place names that don't have a natural English equivalent. If truly no description is inferable but an amount is clearly present, use a generic label like "Expense" and mark description uncertain rather than discarding the whole expense.
2. totalAmount: the numeric amount. Handle numbers spoken as words in Vietnamese ("năm trăm chín mươi" = 590) or English ("five ninety", "five hundred ninety"), and digits. Handle Vietnamese magnitude words: "nghìn"/"ngàn" = thousand, "triệu" = million, "trăm" = hundred. This is the one field that's genuinely blocking: if you cannot determine ANY reasonable amount for an otherwise-real-sounding expense, see the CLARIFICATION rule below instead of guessing a number or silently dropping it.
3. currency: match the spoken currency word to one of the journey's currency codes above (e.g. "baht"/"bạt" -> THB if THB is in the list, "đồng"/"vnd"/"đ" -> VND, "dollar"/"đô" -> USD). If no currency is spoken at all, use the base currency "${baseCurrencyCode}" and mark currency as NOT uncertain (silence means base currency, this is expected/normal). If a currency word is spoken but doesn't match any journey currency, still make your best guess at the closest match AND mark it uncertain.
4. payer: match the spoken payer name against the JOURNEY MEMBERS list above, tolerating accent differences, nicknames, and STT mis-transcription (e.g. "Hậu", "Hau", "Hầu", "Hao" spoken with noise should all match a member named "Hậu" if present - use phonetic/fuzzy closeness). If genuinely no reasonable match exists, default payerId to null and mark payer as uncertain. If no payer is mentioned at all, default to null (frontend will default to the current user) and do NOT mark it uncertain (this is a normal, expected omission).
5. split: default to "equal" split among ALL members unless the speaker explicitly names who should split it (e.g. "chỉ chia cho Quang và Hậu" / "only split between Quang and Hau" / "just me and Trang"). If explicit names are given for the split, resolve them the same fuzzy way as payer and set splitMemberIds to just those resolved ids. Never fabricate a "custom" per-person amount split unless the speaker gave explicit differing numbers per person - that is rare; default to "equal".
6. Every parsed expense must include a "confidence" object with a boolean "uncertain" flag per field (description, totalAmount, currency, payer, split) and an optional short "reason" string explaining why, ONLY when uncertain is true. Do not flag fields that were parsed with reasonable confidence just because the source was spoken casually - only flag genuine ambiguity, mishearing risk, unmatched names, or missing critical info (e.g. no amount at all).
7. If the ENTIRE transcript is too garbled/unclear to extract even one reasonable expense (not just unusually phrased - genuinely no expense content present), return an empty expenses array and set "transcriptUnclear": true.
8. Ignore filler words, false starts, and background noise artifacts in the transcript.
9. sourceText: include the approximate slice of the original transcript this expense came from, for the user's reference.

CLARIFICATION (use sparingly - only for genuinely blocking gaps):
${
  isFinalAttempt
    ? `This is the LAST round of this conversation - the user has already answered follow-up questions. Do NOT ask another clarification question no matter what. Use your best judgement for anything still missing (e.g. default totalAmount to 0 and mark it uncertain) so the user gets a result they can fix manually.`
    : `If, after considering the whole transcript, an otherwise-real-sounding expense is missing its amount entirely (rule 2) and you cannot reasonably infer one, you may set a top-level "clarification" object with a single short, natural, friendly follow-up question asking specifically for that missing piece, in the SAME language/style the user was speaking (Vietnamese if they spoke Vietnamese, English if English). Ask about amount ONLY - never ask a clarification question about payer, currency, or split, since those already have safe defaults (current user / base currency / split-all-equally) and should just be flagged uncertain instead of interrupting the user. Only include "clarification" when it's truly needed - most transcripts should NOT trigger it. When you do include it, still return whatever expenses you could confidently extract (possibly empty) in the "expenses" array alongside it.`
}

Respond with ONLY a JSON object matching this exact shape, no prose, no markdown fences:
{
  "transcriptUnclear": false,
  "clarification": {"question": "string", "missingFields": ["totalAmount"]},
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
}
Omit "clarification" entirely (do not include the key) when there is nothing blocking to ask about.`;
}

export function buildUserPrompt(
  transcript: string,
  history?: VoiceConversationTurn[],
): string {
  if (!history || history.length === 0) {
    return `TRANSCRIPT:\n"""\n${transcript}\n"""`;
  }

  const historyBlock = history
    .map(
      (h, i) =>
        `Round ${i + 1} - You asked: "${h.question}"\nRound ${i + 1} - User answered: "${h.answerTranscript}"`,
    )
    .join("\n\n");

  return `ORIGINAL TRANSCRIPT:\n"""\n${transcript}\n"""\n\nFOLLOW-UP CONVERSATION (the user already answered these questions - merge these answers with the original transcript above to fill in what was missing):\n${historyBlock}\n\nUsing the original transcript PLUS the follow-up answers above, produce the final structured expense(s).`;
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
  clarification?: {
    question?: string;
    missingFields?: string[];
  };
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
const MAX_CLARIFICATION_QUESTION_LENGTH = 300;

/**
 * Validates and normalizes the raw LLM `clarification` object, the same
 * "never trust the model blindly" way normalizeParseResponse handles
 * expenses. Returns undefined if the model didn't provide a usable question.
 */
export function normalizeClarification(
  raw: RawParseResponse,
): ClarificationRequest | undefined {
  const rawClarification = raw.clarification;
  if (!rawClarification || typeof rawClarification.question !== "string") {
    return undefined;
  }

  const question = rawClarification.question.trim().slice(0, MAX_CLARIFICATION_QUESTION_LENGTH);
  if (!question) return undefined;

  const missingFields = Array.isArray(rawClarification.missingFields)
    ? rawClarification.missingFields.filter((f): f is string => typeof f === "string")
    : [];

  return {
    question,
    missingFields: missingFields.length > 0 ? missingFields : ["totalAmount"],
  };
}

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
