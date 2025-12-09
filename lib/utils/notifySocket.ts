export const notifyJourneyUpdate = async (journeyId: string) => {
  // PRIORITIZE internal URL for server-to-server communication
  // This avoids issues where the VPS cannot resolve its own public domain
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;

  try {
    const socketSecret = process.env.SOCKET_SECRET;
    if (!socketSecret) {
      throw new Error("SOCKET_SECRET is not defined");
    }

    // Add a short timeout to prevent long delays if the socket server is down
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    const response = await fetch(`${socketUrl}/notify-update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": socketSecret,
      },
      body: JSON.stringify({ journeyId }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("Failed to notify socket server:", response.statusText);
      return { ok: false, status: response.status };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    // Log as warning instead of error to reduce noise if server is intentionally down
    console.warn(
      "Warning: Could not notify socket server (is it running?):",
      (error as Error).message
    );
    return { ok: false, status: 0, error: (error as Error).message };
  }
};
