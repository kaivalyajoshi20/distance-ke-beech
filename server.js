const http = require("http");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = process.env.PORT || 10000;
const rooms = new Map();
const ROOM_TTL = 2 * 60 * 60 * 1000;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, service: "distance-ke-beech-live", activeRooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

function code() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function roster(room) {
  return room.players.map((p, i) => p ? { name: p.name, gender: p.gender, connected: !!room.clients[i] } : null);
}
function broadcastRoom(room) {
  const msg = { type: "room", code: room.code, players: roster(room), state: room.state, mode: room.mode };
  room.clients.forEach(ws => send(ws, msg));
}
function error(ws, message) { send(ws, { type: "error", message }); }
function safeName(value) {
  return String(value || "Sweetheart").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 24) || "Sweetheart";
}
wss.on("connection", ws => {
  ws.roomCode = null;
  ws.slot = -1;
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return error(ws, "Invalid message."); }
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "create") {
      if (ws.roomCode) return error(ws, "This connection is already in a room.");
      let id;
      do { id = code(); } while (rooms.has(id));
      const room = { code: id, players: [null, null], clients: [null, null], state: null, mode: "love", updated: Date.now() };
      room.players[0] = { name: safeName(msg.name), gender: safeName(msg.gender) };
      room.clients[0] = ws;
      rooms.set(id, room);
      ws.roomCode = id; ws.slot = 0;
      send(ws, { type: "created", code: id, slot: 0 });
      broadcastRoom(room);
      return;
    }
    if (msg.type === "join") {
      if (ws.roomCode) return error(ws, "This connection is already in a room.");
      const id = String(msg.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const room = rooms.get(id);
      if (!room) return error(ws, "That room code was not found. Ask your partner to create a new room.");
      if (room.clients[1]) return error(ws, "This room already has two connected players.");
      room.players[1] = { name: safeName(msg.name), gender: safeName(msg.gender) };
      room.clients[1] = ws;
      room.updated = Date.now();
      ws.roomCode = id; ws.slot = 1;
      send(ws, { type: "joined", code: id, slot: 1 });
      broadcastRoom(room);
      return;
    }
    if (msg.type === "mode") {
      const room = rooms.get(ws.roomCode);
      if (!room || room.clients[ws.slot] !== ws) return error(ws, "You are no longer in this room.");
      if (room.state && room.state.started) return error(ws, "The game has already started. Finish this round before changing mode.");
      if (!["romance", "love", "spice"].includes(msg.mode)) return error(ws, "Unknown game mode.");
      room.mode = msg.mode;
      room.updated = Date.now();
      room.clients.forEach(client => send(client, { type: "mode", mode: room.mode }));
      return;
    }
    if (msg.type === "state") {
      const room = rooms.get(ws.roomCode);
      if (!room || room.clients[ws.slot] !== ws) return error(ws, "You are no longer in this room.");
      if (!room.clients[0] || !room.clients[1]) return error(ws, "Wait until both players are connected.");
      const incoming = msg.state;
      if (!incoming || !Array.isArray(incoming.players) || incoming.players.length !== 2) return error(ws, "Invalid game state.");
      if (room.state) {
        if (room.state.finished) {
          if (ws.slot !== 0) return error(ws, "Only the room creator can restart the game.");
        } else if (Number(room.state.turn) !== ws.slot) {
          return error(ws, "It is your partner's turn.");
        }
      } else if (ws.slot !== 0) {
        return error(ws, "The room creator starts the game.");
      }
      room.state = incoming;
      room.updated = Date.now();
      room.clients.forEach((client, slot) => {
        if (slot !== ws.slot) send(client, { type: "state", state: room.state });
      });
    }
  });
  ws.on("close", () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    if (room.clients[ws.slot] === ws) room.clients[ws.slot] = null;
    room.updated = Date.now();
    room.clients.forEach(client => send(client, { type: "peer-left" }));
    broadcastRoom(room);
  });
});
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.updated > ROOM_TTL) {
      room.clients.forEach(client => { if (client) { send(client, { type: "error", message: "This room expired. Create a new room to play again." }); client.close(); } });
      rooms.delete(id);
    }
  }
}, 10 * 60 * 1000);
cleanup.unref();
server.listen(PORT, "0.0.0.0", () => console.log("Distance Ke Beech live server listening on " + PORT));
