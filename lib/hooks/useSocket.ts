import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

let globalSocket: Socket | null = null;

export const useSocket = (
  journeyId: string | undefined,
  onUpdate: () => void
) => {
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    if (!journeyId) return;

    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://127.0.0.1:4000";

    // If there's already a global socket, reuse it; otherwise create one with backoff options
    if (!globalSocket) {
      globalSocket = io(socketUrl, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        randomizationFactor: 0.5,
        transports: ["websocket"],
      });
    }

    const socket = globalSocket;

    const handleConnect = () => {
      reconnectAttempts.current = 0;
      socket.emit("join_journey", journeyId);
    };

    const handleConnectError = (err: any) => {
      reconnectAttempts.current += 1;
      console.error("Socket connect_error:", err?.message || err);
    };

    const handleError = (err: any) => {
      console.error("Socket error:", err);
    };

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("error", handleError);
    socket.on("update_data", onUpdate);

    return () => {
      try {
        socket.off("connect", handleConnect);
        socket.off("connect_error", handleConnectError);
        socket.off("error", handleError);
        socket.off("update_data", onUpdate);
      } catch (e) {
        // ignore
      }

      // If no listeners remain for this socket, disconnect and clear global
      // This helps avoid keeping a stale connection when components unmount
      if (socket && socket.listeners("update_data").length === 0) {
        socket.disconnect();
        globalSocket = null;
      }
    };
  }, [journeyId, onUpdate]);
};
