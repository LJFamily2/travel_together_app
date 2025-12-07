import { notifyJourneyUpdate } from "../lib/utils/notifySocket";

// Mock the global fetch function
global.fetch = jest.fn();

describe("notifyJourneyUpdate", () => {
  const mockFetch = global.fetch as jest.Mock;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    mockFetch.mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should send a POST request with the correct headers and body", async () => {
    // Setup environment variables
    process.env.NEXT_PUBLIC_SOCKET_URL = "http://test-socket-server";
    process.env.SOCKET_SECRET = "test-secret";

    // Mock successful response
    mockFetch.mockResolvedValueOnce({
      ok: true,
    });

    await notifyJourneyUpdate("journey-123");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://test-socket-server/notify-update",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-secret",
        },
        body: JSON.stringify({ journeyId: "journey-123" }),
      })
    );
  });

  it("should use default URL if env var is missing", async () => {
    delete process.env.NEXT_PUBLIC_SOCKET_URL;
    process.env.SOCKET_SECRET = "test-secret";

    mockFetch.mockResolvedValueOnce({ ok: true });

    await notifyJourneyUpdate("journey-123");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/notify-update",
      expect.anything()
    );
  });

  it("should log error if fetch fails", async () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: "Internal Server Error",
    });

    await notifyJourneyUpdate("journey-123");

    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to notify socket server:",
      "Internal Server Error"
    );
    consoleSpy.mockRestore();
  });
});
