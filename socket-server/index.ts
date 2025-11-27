import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";

const app = express();
const server = http.createServer(app);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const SOCKET_SECRET = process.env.SOCKET_SECRET || "change_me_in_prod";

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

app.use(express.json());

io.on("connection", (socket: Socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join_journey", (journeyId: string) => {
    if (journeyId && typeof journeyId === "string") {
      // Basic sanitization: ensure it looks like a safe ID (alphanumeric + hyphens/underscores)
      // Adjust regex based on your ID format (MongoDB ObjectIds are hex)
      const safeId = journeyId.replace(/[^a-zA-Z0-9-_]/g, "");
      socket.join(safeId);
      console.log(`User ${socket.id} joined journey: ${safeId}`);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Webhook endpoint for Next.js to trigger updates
app.post("/notify-update", (req: Request, res: Response) => {
  const authHeader = req.headers["x-api-key"];

  if (authHeader !== SOCKET_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { journeyId } = req.body;

  if (!journeyId || typeof journeyId !== "string") {
    return res.status(400).json({ error: "Invalid journeyId" });
  }

  console.log(`Notification received for journey: ${journeyId}`);

  // Broadcast to everyone in the journey room
  io.to(journeyId).emit("update_data");

  res
    .status(200)
    .json({ success: true, message: `Update emitted to journey ${journeyId}` });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});
