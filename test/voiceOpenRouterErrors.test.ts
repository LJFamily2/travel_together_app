/**
 * Regression tests for the error-message sanitization fix: raw upstream
 * response bodies (which can be arbitrary JSON, HTML, or stack-trace-like
 * text) must never end up in the message we throw/return to callers -
 * only a short, curated, user-safe string. The raw detail should still be
 * captured on `.detail` for server-side logging.
 */

const ORIGINAL_ENV = process.env;

describe("voice/openrouter error sanitization", () => {
  let transcribeAudio: typeof import("../lib/voice/openrouter").transcribeAudio;
  let chatJSON: typeof import("../lib/voice/openrouter").chatJSON;
  let OpenRouterError: typeof import("../lib/voice/openrouter").OpenRouterError;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, OPENROUTER_API_KEY: "test-key" };
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../lib/voice/openrouter");
    transcribeAudio = mod.transcribeAudio;
    chatJSON = mod.chatJSON;
    OpenRouterError = mod.OpenRouterError;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  const RAW_UPSTREAM_JSON = JSON.stringify({
    error: { message: "Internal provider stack trace: at Foo.bar (file.js:42)", type: "server_error" },
  });

  test("transcribeAudio never leaks the raw upstream body in the thrown message", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => RAW_UPSTREAM_JSON,
    }) as unknown as typeof fetch;

    await expect(transcribeAudio("base64data", "webm")).rejects.toMatchObject({
      message: expect.not.stringContaining("Internal provider stack trace"),
    });

    try {
      await transcribeAudio("base64data", "webm");
    } catch (err) {
      expect(err).toBeInstanceOf(OpenRouterError);
      const e = err as InstanceType<typeof OpenRouterError>;
      expect(e.message).not.toContain("{");
      expect(e.message.length).toBeLessThan(120);
      // Raw detail is preserved for server logs only.
      expect(e.detail).toContain("Internal provider stack trace");
    }

    // The raw detail was logged server-side.
    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedArgs = consoleErrorSpy.mock.calls.flat().join(" ");
    expect(loggedArgs).toContain("Internal provider stack trace");
  });

  test("chatJSON never leaks the raw upstream body in the thrown message", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => RAW_UPSTREAM_JSON,
    }) as unknown as typeof fetch;

    try {
      await chatJSON({ systemPrompt: "sys", userPrompt: "user" });
      throw new Error("expected chatJSON to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(OpenRouterError);
      const e = err as InstanceType<typeof OpenRouterError>;
      expect(e.message).not.toContain("Internal provider stack trace");
      expect(e.detail).toContain("Internal provider stack trace");
    }
  });

  test("maps 401/403 to a configuration message", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "unauthorized upstream detail",
    }) as unknown as typeof fetch;

    await expect(transcribeAudio("x", "webm")).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining("configured correctly"),
    });
  });

  test("maps 429 to a busy/rate-limited message", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: async () => "rate limited upstream detail",
    }) as unknown as typeof fetch;

    await expect(chatJSON({ systemPrompt: "s", userPrompt: "u" })).rejects.toMatchObject({
      status: 429,
      message: expect.stringMatching(/busy|wait/i),
    });
  });

  test("network-level fetch failure (no response at all) is sanitized to a clean 503", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED 1.2.3.4:443"));

    try {
      await transcribeAudio("x", "webm");
      throw new Error("expected transcribeAudio to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(OpenRouterError);
      const e = err as InstanceType<typeof OpenRouterError>;
      expect(e.status).toBe(503);
      expect(e.message).not.toContain("ECONNREFUSED");
      expect(e.detail).toContain("ECONNREFUSED");
    }
  });

  test("non-JSON chat-completion content produces a clean error, not the raw content", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "not valid json <<<>>>" } }],
      }),
    }) as unknown as typeof fetch;

    try {
      await chatJSON({ systemPrompt: "s", userPrompt: "u" });
      throw new Error("expected chatJSON to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(OpenRouterError);
      const e = err as InstanceType<typeof OpenRouterError>;
      expect(e.message).not.toContain("not valid json");
    }
  });

  test("happy path still returns the transcript / parsed JSON normally", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: "Dinner, 200000 dong, Quang paid" }),
    }) as unknown as typeof fetch;

    const transcript = await transcribeAudio("x", "webm");
    expect(transcript).toBe("Dinner, 200000 dong, Quang paid");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ expenses: [], transcriptUnclear: true }) } }],
      }),
    }) as unknown as typeof fetch;

    const parsed = await chatJSON<{ transcriptUnclear: boolean }>({
      systemPrompt: "s",
      userPrompt: "u",
    });
    expect(parsed.transcriptUnclear).toBe(true);
  });
});
