export const notifyJourneyUpdate = async (journeyId: string) => {
  const socketUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
  const socketSecret = process.env.SOCKET_SECRET || "change_me_in_prod";

  try {
    const response = await fetch(`${socketUrl}/notify-update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": socketSecret,
      },
      body: JSON.stringify({ journeyId }),
    });

    if (!response.ok) {
      console.error("Failed to notify socket server:", response.statusText);
    }
  } catch (error) {
    console.error("Error notifying socket server:", error);
  }
};
