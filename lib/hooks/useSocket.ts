import { useEffect } from "react";
import { io, Socket } from "socket.io-client";

let socket: Socket;

export const useSocket = (
  journeyId: string | undefined,
  onUpdate: () => void
) => {
  useEffect(() => {
    if (!journeyId) return;

    // Initialize socket connection
    // Assuming the socket server is running on port 4000
    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL;

    socket = io(socketUrl);

    socket.on("connect", () => {
      socket.emit("join_journey", journeyId);
    });
    socket.on("connect_error", (err) => {
      console.error("Socket connect_error:", err.message);
    });
    socket.on("error", (err) => {
      console.error("Socket error:", err);
    });

    socket.on("update_data", () => {
      onUpdate();
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [journeyId, onUpdate]);
};
