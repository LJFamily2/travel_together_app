jest.mock("../lib/voice/auth", () => ({
  requireAuthAndRateLimit: jest.fn(async () => ({ userId: "test-user" })),
}));

jest.mock("../lib/voice/openrouter", () => {
  const actual = jest.requireActual("../lib/voice/openrouter");
  return {
    ...actual,
    transcribeAudio: jest.fn(),
  };
});

import { POST } from "../app/api/voice/transcribe/route";
import { transcribeAudio, OpenRouterError } from "../lib/voice/openrouter";

const mockedTranscribeAudio = transcribeAudio as jest.MockedFunction<typeof transcribeAudio>;

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/voice/transcribe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("400s on missing audioBase64", async () => {
    const res = await POST(makeReq({ format: "webm" }));
    expect(res.status).toBe(400);
  });

  test("400s on missing format", async () => {
    const res = await POST(makeReq({ audioBase64: "abc" }));
    expect(res.status).toBe(400);
  });

  test("returns the transcript on success", async () => {
    mockedTranscribeAudio.mockResolvedValue("Dinner, 200000 dong");
    const res = await POST(makeReq({ audioBase64: "abc", format: "webm" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.transcript).toBe("Dinner, 200000 dong");
  });

  test("422s with a friendly message on an empty transcript", async () => {
    mockedTranscribeAudio.mockResolvedValue("   ");
    const res = await POST(makeReq({ audioBase64: "abc", format: "webm" }));
    const data = await res.json();
    expect(res.status).toBe(422);
    expect(data.error).toMatch(/couldn't hear/i);
  });

  test("OpenRouterError's curated message and status pass through, raw detail does not", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockedTranscribeAudio.mockRejectedValue(
      new OpenRouterError(
        "Couldn't reach the transcription service. Please try again.",
        503,
        "raw connection refused detail",
      ),
    );
    const res = await POST(makeReq({ audioBase64: "abc", format: "webm" }));
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.error).toBe("Couldn't reach the transcription service. Please try again.");
    expect(JSON.stringify(data)).not.toContain("raw connection refused detail");
    consoleErrorSpy.mockRestore();
  });

  test("an unexpected error never leaks its raw message", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockedTranscribeAudio.mockRejectedValue(new Error("ENOENT /etc/secret/config.json"));
    const res = await POST(makeReq({ audioBase64: "abc", format: "webm" }));
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe("Transcription failed unexpectedly. Please try again.");
    consoleErrorSpy.mockRestore();
  });
});
