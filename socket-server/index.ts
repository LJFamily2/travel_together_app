import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
// 1. Try to load from .env in the current directory first
dotenv.config();
// 2. Then try to load from the parent directory's .env file (does not overwrite existing variables)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const server = http.createServer(app);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

const SOCKET_SECRET = process.env.SOCKET_SECRET;

if (!process.env.SOCKET_SECRET) {
  throw new Error("SOCKET_SECRET is not defined");
}

const allowedOrigins = [CLIENT_URL];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

app.use(express.json());

const isDev = process.env.NODE_ENV !== "production";

io.on("connection", (socket: Socket) => {
  if (isDev) console.debug("A user connected:", socket.id);

  socket.on("join_journey", (journeyId: string) => {
    if (journeyId && typeof journeyId === "string") {
      // Basic sanitization: ensure it looks like a safe ID (alphanumeric + hyphens/underscores)
      // Adjust regex based on your ID format (MongoDB ObjectIds are hex)
      const safeId = journeyId.replace(/[^a-zA-Z0-9-_]/g, "");
      socket.join(safeId);
      if (isDev) console.debug(`User ${socket.id} joined journey: ${safeId}`);
    }
  });

  socket.on("disconnect", () => {
    if (isDev) console.debug("User disconnected:", socket.id);
  });
});

// Webhook endpoint for Next.js to trigger updates
app.post("/notify-update", (req: Request, res: Response) => {
  const authHeader = req.headers["x-api-key"];

  if (authHeader !== SOCKET_SECRET) {
    console.warn(
      "Unauthorized notify-update attempt, x-api-key provided:",
      authHeader
    );
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { journeyId } = req.body;

  if (!journeyId || typeof journeyId !== "string") {
    return res.status(400).json({ error: "Invalid journeyId" });
  }

  const safeId = journeyId.replace(/[^a-zA-Z0-9-_]/g, "");
  // Broadcast to everyone in the journey room (sanitized)
  io.to(safeId).emit("update_data");

  // If no members were found in the sanitized room, attempt an emit to the raw journeyId as a fallback
  // If we need a fallback to raw id, do that silently (no debug logs)
  const room = io.sockets.adapter.rooms.get(safeId);
  const memberCount = room ? room.size : 0;
  if (memberCount === 0 && safeId !== journeyId) {
    const rawRoom = io.sockets.adapter.rooms.get(journeyId);
    const rawCount = rawRoom ? rawRoom.size : 0;
    if (rawCount > 0) {
      io.to(journeyId).emit("update_data");
    }
  }

  res
    .status(200)
    .json({ success: true, message: `Update emitted to journey ${journeyId}` });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  // Keep this informative log to make it clear the server started; not a debug message.
  console.info(`Socket server running on port ${PORT}`);
});
