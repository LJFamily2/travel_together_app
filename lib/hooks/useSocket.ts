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
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
    socket = io(socketUrl);

    socket.on("connect", () => {
      console.log("Connected to socket server"); 
      socket.emit("join_journey", journeyId);
    });

    socket.on("update_data", () => {
      console.log("Received update_data event");
      onUpdate();
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [journeyId, onUpdate]);
};
