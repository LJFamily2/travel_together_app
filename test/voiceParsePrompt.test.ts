import {
  buildSystemPrompt,
  buildUserPrompt,
  normalizeParseResponse,
  normalizeClarification,
  type RawParseResponse,
} from "../lib/voice/parsePrompt";
import type { VoiceMemberContext, VoiceCurrencyContext } from "../lib/voice/types";

const members: VoiceMemberContext[] = [
  { id: "m1", name: "Hậu" },
  { id: "m2", name: "Quang" },
];
const currencies: VoiceCurrencyContext[] = [
  { code: "VND", name: "Vietnamese Dong", symbol: "đ", isBase: true },
  { code: "THB", name: "Thai Baht", symbol: "฿", isBase: false },
];

describe("buildSystemPrompt", () => {
  test("instructs the model not to require the example template structure", () => {
    const prompt = buildSystemPrompt({ members, currencies, baseCurrencyCode: "VND" });
    expect(prompt).toMatch(/do not.*reject/i);
    expect(prompt.toLowerCase()).toContain("flexib");
  });

  test("by default, allows a clarification question and includes the field in the JSON shape", () => {
    const prompt = buildSystemPrompt({ members, currencies, baseCurrencyCode: "VND" });
    expect(prompt).toContain('"clarification"');
    expect(prompt).toMatch(/may set a top-level "clarification"/i);
  });

  test("on the final attempt, forbids asking another clarification question", () => {
    const prompt = buildSystemPrompt({
      members,
      currencies,
      baseCurrencyCode: "VND",
      isFinalAttempt: true,
    });
    expect(prompt).toMatch(/last round/i);
    expect(prompt).toMatch(/do not ask another clarification question/i);
  });

  test("never invents members/currencies outside the provided lists", () => {
    const prompt = buildSystemPrompt({ members, currencies, baseCurrencyCode: "VND" });
    expect(prompt).toContain('id: "m1", name: "Hậu"');
    expect(prompt).toContain('code: "THB"');
  });
});

describe("buildUserPrompt", () => {
  test("with no history, sends just the transcript", () => {
    const prompt = buildUserPrompt("Dinner 200000 dong");
    expect(prompt).toContain("Dinner 200000 dong");
    expect(prompt).not.toContain("FOLLOW-UP");
  });

  test("with history, includes the original transcript plus each Q&A round", () => {
    const prompt = buildUserPrompt("Dinner, Quang paid", [
      { question: "How much was it?", answerTranscript: "two hundred thousand dong" },
    ]);
    expect(prompt).toContain("ORIGINAL TRANSCRIPT");
    expect(prompt).toContain("Dinner, Quang paid");
    expect(prompt).toContain("How much was it?");
    expect(prompt).toContain("two hundred thousand dong");
  });

  test("includes multiple rounds in order", () => {
    const prompt = buildUserPrompt("Dinner", [
      { question: "How much?", answerTranscript: "200k" },
      { question: "Which currency?", answerTranscript: "dong" },
    ]);
    const howMuchIdx = prompt.indexOf("How much?");
    const whichCurrencyIdx = prompt.indexOf("Which currency?");
    expect(howMuchIdx).toBeGreaterThan(-1);
    expect(whichCurrencyIdx).toBeGreaterThan(howMuchIdx);
  });
});

describe("normalizeClarification", () => {
  test("returns undefined when the model didn't include one", () => {
    expect(normalizeClarification({ expenses: [] })).toBeUndefined();
  });

  test("returns undefined for an empty/whitespace-only question", () => {
    expect(
      normalizeClarification({ expenses: [], clarification: { question: "   " } }),
    ).toBeUndefined();
  });

  test("trims the question and defaults missingFields to totalAmount", () => {
    const result = normalizeClarification({
      expenses: [],
      clarification: { question: "  How much was it?  " },
    });
    expect(result).toEqual({ question: "How much was it?", missingFields: ["totalAmount"] });
  });

  test("caps an excessively long question", () => {
    const longQuestion = "a".repeat(1000);
    const result = normalizeClarification({
      expenses: [],
      clarification: { question: longQuestion },
    });
    expect(result?.question.length).toBeLessThanOrEqual(300);
  });

  test("passes through valid missingFields, filtering out non-strings", () => {
    const result = normalizeClarification({
      expenses: [],
      clarification: {
        question: "How much?",
        // @ts-expect-error - deliberately malformed input from the model
        missingFields: ["totalAmount", 42, null],
      },
    });
    expect(result?.missingFields).toEqual(["totalAmount"]);
  });
});

describe("normalizeParseResponse (baseline behavior still intact)", () => {
  test("resolves a valid member/currency and leaves fields unflagged", () => {
    const raw: RawParseResponse = {
      expenses: [
        {
          description: "Dinner",
          totalAmount: 200000,
          currency: "VND",
          payerId: "m2",
          payerNameRaw: "Quang",
          splitType: "equal",
          splitMemberIds: null,
          sourceText: "Dinner, 200000 dong, Quang paid",
          confidence: {
            description: { uncertain: false },
            totalAmount: { uncertain: false },
            currency: { uncertain: false },
            payer: { uncertain: false },
            split: { uncertain: false },
          },
        },
      ],
    };
    const [expense] = normalizeParseResponse(raw, members, currencies, "VND");
    expect(expense.payerId).toBe("m2");
    expect(expense.currency).toBe("VND");
    expect(expense.flags.totalAmount.uncertain).toBe(false);
  });

  test("falls back to base currency and flags it when the model invents a currency", () => {
    const raw: RawParseResponse = {
      expenses: [
        {
          description: "Snacks",
          totalAmount: 50,
          currency: "EUR", // not in the journey's currency list
          payerId: null,
          splitType: "equal",
          sourceText: "snacks",
        },
      ],
    };
    const [expense] = normalizeParseResponse(raw, members, currencies, "VND");
    expect(expense.currency).toBe("VND");
    expect(expense.flags.currency.uncertain).toBe(true);
  });

  test("zero/invalid amount is flagged uncertain rather than silently accepted", () => {
    const raw: RawParseResponse = {
      expenses: [
        {
          description: "Something",
          totalAmount: -5,
          currency: "VND",
          payerId: null,
          splitType: "equal",
          sourceText: "something",
        },
      ],
    };
    const [expense] = normalizeParseResponse(raw, members, currencies, "VND");
    expect(expense.totalAmount).toBe(0);
    expect(expense.flags.totalAmount.uncertain).toBe(true);
  });

  test("still works fine when the raw response also carries a clarification key", () => {
    const raw: RawParseResponse = {
      expenses: [
        {
          description: "Dinner",
          totalAmount: 0,
          currency: "VND",
          payerId: null,
          splitType: "equal",
          sourceText: "dinner",
        },
      ],
      clarification: { question: "How much was dinner?", missingFields: ["totalAmount"] },
    };
    const expenses = normalizeParseResponse(raw, members, currencies, "VND");
    expect(expenses).toHaveLength(1);
    expect(expenses[0].flags.totalAmount.uncertain).toBe(true);
  });
});
