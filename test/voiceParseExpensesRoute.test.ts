jest.mock("../lib/voice/auth", () => ({
  requireAuthAndRateLimit: jest.fn(async () => ({ userId: "test-user" })),
}));

jest.mock("../lib/voice/openrouter", () => {
  const actual = jest.requireActual("../lib/voice/openrouter");
  return {
    ...actual,
    chatJSON: jest.fn(),
  };
});

import { POST } from "../app/api/voice/parse-expenses/route";
import { chatJSON, OpenRouterError } from "../lib/voice/openrouter";
import { requireAuthAndRateLimit } from "../lib/voice/auth";

const mockedChatJSON = chatJSON as jest.MockedFunction<typeof chatJSON>;
const mockedAuth = requireAuthAndRateLimit as jest.MockedFunction<
  typeof requireAuthAndRateLimit
>;

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const baseBody = {
  transcript: "Dinner, 200000 dong, Quang paid",
  members: [
    { id: "m1", name: "Hậu" },
    { id: "m2", name: "Quang" },
  ],
  currencies: [{ code: "VND", name: "Dong", symbol: "đ", isBase: true }],
  baseCurrencyCode: "VND",
  currentUserId: "m1",
};

describe("POST /api/voice/parse-expenses", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ userId: "test-user" });
  });

  test("400s on missing transcript", async () => {
    const res = await POST(makeReq({ ...baseBody, transcript: undefined }));
    expect(res.status).toBe(400);
  });

  test("400s on invalid members array", async () => {
    const res = await POST(makeReq({ ...baseBody, members: [{ id: "m1" }] }));
    expect(res.status).toBe(400);
  });

  test("400s on malformed history entries", async () => {
    const res = await POST(
      makeReq({ ...baseBody, history: [{ question: "hi" /* missing answerTranscript */ }] }),
    );
    expect(res.status).toBe(400);
  });

  test("413s when history has more rounds than allowed", async () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      question: `q${i}`,
      answerTranscript: `a${i}`,
    }));
    const res = await POST(makeReq({ ...baseBody, history }));
    expect(res.status).toBe(413);
  });

  test("413s when a single history field is too long", async () => {
    const res = await POST(
      makeReq({
        ...baseBody,
        history: [{ question: "q", answerTranscript: "a".repeat(10000) }],
      }),
    );
    expect(res.status).toBe(413);
  });

  test("returns expenses normally when there is no clarification", async () => {
    mockedChatJSON.mockResolvedValue({
      transcriptUnclear: false,
      expenses: [
        {
          description: "Dinner",
          totalAmount: 200000,
          currency: "VND",
          payerId: "m2",
          splitType: "equal",
          sourceText: "Dinner, 200000 dong, Quang paid",
        },
      ],
    });

    const res = await POST(makeReq(baseBody));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.expenses).toHaveLength(1);
    expect(data.clarification).toBeUndefined();
  });

  test("passes through a clarification question on the first round", async () => {
    mockedChatJSON.mockResolvedValue({
      transcriptUnclear: false,
      expenses: [],
      clarification: { question: "How much was dinner?", missingFields: ["totalAmount"] },
    });

    const res = await POST(makeReq(baseBody)); // no history yet -> round 0
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.clarification).toEqual({
      question: "How much was dinner?",
      missingFields: ["totalAmount"],
    });
  });

  test("suppresses clarification once the round cap is reached, even if the model asks anyway", async () => {
    mockedChatJSON.mockResolvedValue({
      transcriptUnclear: false,
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
      // Model disobeys the "don't ask again" instruction - server must still cap it.
      clarification: { question: "How much again?", missingFields: ["totalAmount"] },
    });

    const history = [
      { question: "How much?", answerTranscript: "not sure" },
      { question: "Roughly how much?", answerTranscript: "still not sure" },
    ]; // already at MAX_VOICE_CLARIFICATION_ROUNDS (2)

    const res = await POST(makeReq({ ...baseBody, history }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.clarification).toBeUndefined();

    // And the system prompt passed to the model should have told it this was final.
    const [{ systemPrompt }] = mockedChatJSON.mock.calls[0];
    expect(systemPrompt).toMatch(/last round/i);
  });

  test("OpenRouterError is surfaced with its curated message and matching status, and detail is logged not returned", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockedChatJSON.mockRejectedValue(
      new OpenRouterError("The voice service is busy right now. Please wait a moment and try again.", 429, "raw upstream rate limit body"),
    );

    const res = await POST(makeReq(baseBody));
    const data = await res.json();
    expect(res.status).toBe(429);
    expect(data.error).toBe(
      "The voice service is busy right now. Please wait a moment and try again.",
    );
    expect(JSON.stringify(data)).not.toContain("raw upstream rate limit body");
    consoleErrorSpy.mockRestore();
  });

  test("an unexpected non-OpenRouterError never leaks its raw message to the client", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockedChatJSON.mockRejectedValue(
      new Error("TypeError: Cannot read properties of undefined at /srv/app/secretpath.js:123"),
    );

    const res = await POST(makeReq(baseBody));
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe("Parsing failed unexpectedly. Please try again.");
    expect(data.error).not.toContain("secretpath");
    consoleErrorSpy.mockRestore();
  });

  test("401 from auth short-circuits before calling the model", async () => {
    const { NextResponse } = jest.requireActual("next/server");
    mockedAuth.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized. Please sign in again." }, { status: 401 }),
    );

    const res = await POST(makeReq(baseBody));
    expect(res.status).toBe(401);
    expect(mockedChatJSON).not.toHaveBeenCalled();
  });
});
