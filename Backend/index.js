import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST"],
}));

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// ---------- helpers ----------
const getDirectRoomId = (userA, userB) => {
  return [userA, userB].sort().join(":"); // "10:42"
};

const getGroupRoomId = (groupId) => `group:${groupId}`;
const getUserRoomId = (userId) => `user:${userId}`;

// Dummy permission checks for now
async function canChatDirect(userId, otherUserId) {
  // later: blocklist / friend / company rules etc.
  return true;
}

async function isMemberOfGroup(userId, groupId) {
  // later: check group_members table
  return true;
}

// ---------- auth middleware for sockets ----------
io.use((socket, next) => {
  const { userId } = socket.handshake.auth || {};
  if (!userId) {
    return next(new Error("Unauthorized"));
  }

  // real app: verify JWT, fetch user, etc.
  socket.user = { id: String(userId) };
  next();
});

// ---------- connection handler ----------
io.on("connection", (socket) => {
  const userId = socket.user.id;
  console.log("Socket connected:", socket.id, "user:", userId);

  // join user room (for notifications, multi-device)
  const userRoom = getUserRoomId(userId);
  socket.join(userRoom);

  // ---- join direct 1–1 conversation ----
  socket.on("join:direct", async ({ otherUserId }) => {
    otherUserId = String(otherUserId);

    if (!(await canChatDirect(userId, otherUserId))) {
      console.warn(`User ${userId} not allowed to chat with ${otherUserId}`);
      return;
    }

    const convoRoom = getDirectRoomId(userId, otherUserId);
    socket.join(convoRoom);

    console.log(`User ${userId} joined direct convo room ${convoRoom}`);
    socket.emit("joined:direct", { roomId: convoRoom });
  });

  // ---- join group conversation ----
  socket.on("join:group", async ({ groupId }) => {
    groupId = String(groupId);

    if (!(await isMemberOfGroup(userId, groupId))) {
      console.warn(`User ${userId} not in group ${groupId}`);
      return;
    }

    const groupRoom = getGroupRoomId(groupId);
    socket.join(groupRoom);

    console.log(`User ${userId} joined group room ${groupRoom}`);
    socket.emit("joined:group", { roomId: groupRoom });
  });

  // ---- send direct 1–1 message ----
  socket.on("message:direct", async ({ to, text }) => {
    const from = userId;
    to = String(to);

    if (!text || typeof text !== "string" || !text.trim()) {
      return;
    }

    if (!(await canChatDirect(from, to))) {
      return;
    }

    const convoRoom = getDirectRoomId(from, to);

    // In real app:
    // 1) insert into DB
    // const saved = await db.insertMessage({ type: "direct", convoId: convoRoom, from, to, text });

    const saved = {
      id: Date.now().toString(36),
      type: "direct",
      convoId: convoRoom,
      from,
      to,
      text,
      ts: new Date().toISOString(),
    };

    // emit to both users currently in the convo
    io.to(convoRoom).emit("message:direct", saved);

    // optionally notify receiver specifically (all their devices)
    const targetUserRoom = getUserRoomId(to);
    io.to(targetUserRoom).emit("notify:new-message", {
      from,
      convoId: convoRoom,
    });

    console.log("Direct message", saved);
  });

  // ---- send group message ----
  socket.on("message:group", async ({ groupId, text }) => {
    const from = userId;
    groupId = String(groupId);

    if (!text || typeof text !== "string" || !text.trim()) {
      return;
    }

    if (!(await isMemberOfGroup(from, groupId))) {
      return;
    }

    const groupRoom = getGroupRoomId(groupId);

    // In real app: save to DB
    const saved = {
      id: Date.now().toString(36),
      type: "group",
      groupId,
      from,
      text,
      ts: new Date().toISOString(),
    };

    // emit to everyone in the group room
    io.to(groupRoom).emit("message:group", saved);

    console.log("Group message", saved);
  });

  socket.on("error", (error) => {
    console.error("Socket error on", socket.id, "user", userId, error);
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", socket.id, "user:", userId, "reason:", reason);
  });
});

server.listen(5000, () => {
  console.log("Server + Socket server running on port 5000");
});
