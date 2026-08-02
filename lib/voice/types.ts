/**
 * Shared types for the Voice Expense feature.
 *
 * Flow: user holds mic button -> records audio -> POST /api/voice/transcribe
 * -> transcript -> POST /api/voice/parse-expenses -> ParsedExpense[]
 * -> user reviews/edits in confirmation cards -> each is submitted via the
 * existing `addExpense` GraphQL mutation (see AddExpenseForm.tsx).
 */

/** A single member the LLM can pick as payer, drawn from journey.members. */
export interface VoiceMemberContext {
  id: string;
  name: string;
}

/** A currency the journey accepts, drawn from journey.currencies + baseCurrency. */
export interface VoiceCurrencyContext {
  code: string;
  name: string;
  symbol: string;
  /** true for the journey's baseCurrency entry */
  isBase: boolean;
}

/** What the frontend sends to /api/voice/parse-expenses. */
export interface ParseExpensesRequest {
  transcript: string;
  members: VoiceMemberContext[];
  currencies: VoiceCurrencyContext[];
  baseCurrencyCode: string;
  /** id of the person who tapped the mic - used as default payer + default split-all-equally participant */
  currentUserId: string;
}

/** One field's confidence/flag state, used to drive the orange-warning UI. */
export interface FieldFlag {
  /** true if the LLM was not confident about this field and it needs human review */
  uncertain: boolean;
  /** short human-readable reason, e.g. "No member named 'Hau' found, defaulted to you" */
  reason?: string;
}

/** A single expense as parsed by the LLM, before the user confirms it. */
export interface ParsedExpense {
  /** client-generated id for React keys / editing state, not persisted */
  draftId: string;
  description: string;
  totalAmount: number;
  /** ISO 4217-ish currency code, must be one of the journey's configured currencies */
  currency: string;
  /** resolved member id, or null if the LLM could not confidently resolve one */
  payerId: string | null;
  payerNameRaw: string | null;
  splitType: "equal" | "custom";
  /** only present when splitType === "equal"; ids of members included. Empty/omitted means "all members". */
  splitMemberIds: string[] | null;
  /** only present when splitType === "custom": explicit per-member base-currency amounts */
  customSplits: { userId: string; amount: number }[] | null;
  /** raw transcript fragment this expense was parsed from, for user reference */
  sourceText: string;
  flags: {
    description: FieldFlag;
    totalAmount: FieldFlag;
    currency: FieldFlag;
    payer: FieldFlag;
    split: FieldFlag;
  };
}

export interface ParseExpensesResponse {
  expenses: ParsedExpense[];
  /** true if the model flagged the whole transcript as too unclear to parse reliably */
  transcriptUnclear?: boolean;
}

export interface TranscribeResponse {
  transcript: string;
}

export interface VoiceApiError {
  error: string;
}
