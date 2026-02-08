const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));

const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ROOM_TTL = 7200; // 2 hours safety TTL

// --- Redis setup ---
const pubClient = new Redis(REDIS_URL);
const subClient = pubClient.duplicate();
const redis = new Redis(REDIS_URL); // general-purpose client for room state

pubClient.on('error', (err) => console.error('Redis pub error:', err.message));
subClient.on('error', (err) => console.error('Redis sub error:', err.message));
redis.on('error', (err) => console.error('Redis error:', err.message));

io.adapter(createAdapter(pubClient, subClient));
console.log('Socket.IO Redis adapter attached');

// --- Redis room helpers ---
const ROOMS_ACTIVE_KEY = 'rooms:active';

function roomKey(sessionId) {
  return `room:${sessionId}`;
}

function playersKey(sessionId) {
  return `room:${sessionId}:players`;
}

async function createRoom(sessionId, roomData) {
  const pipeline = redis.pipeline();
  pipeline.hset(roomKey(sessionId), roomData);
  pipeline.expire(roomKey(sessionId), ROOM_TTL);
  pipeline.sadd(ROOMS_ACTIVE_KEY, sessionId);
  await pipeline.exec();
}

async function getRoom(sessionId) {
  const data = await redis.hgetall(roomKey(sessionId));
  if (!data || Object.keys(data).length === 0) return null;
  return data;
}

async function deleteRoom(sessionId) {
  const pipeline = redis.pipeline();
  pipeline.del(roomKey(sessionId));
  pipeline.del(playersKey(sessionId));
  pipeline.srem(ROOMS_ACTIVE_KEY, sessionId);
  await pipeline.exec();
}

async function setPlayer(sessionId, playerId, playerData) {
  await redis.hset(playersKey(sessionId), playerId, JSON.stringify(playerData));
  await redis.expire(playersKey(sessionId), ROOM_TTL);
}

async function removePlayer(sessionId, playerId) {
  await redis.hdel(playersKey(sessionId), playerId);
}

async function getPlayers(sessionId) {
  const raw = await redis.hgetall(playersKey(sessionId));
  const players = {};
  for (const [id, json] of Object.entries(raw)) {
    players[id] = JSON.parse(json);
  }
  return players;
}

async function getPlayerCount(sessionId) {
  return await redis.hlen(playersKey(sessionId));
}

async function setRoomField(sessionId, field, value) {
  await redis.hset(roomKey(sessionId), field, value);
}

// --- Utility ---
const getClientIp = (socket) => {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.headers['x-real-ip'] || socket.handshake.address;
};

// --- Cleanup empty rooms every 60 seconds ---
setInterval(async () => {
  try {
    const activeIds = await redis.smembers(ROOMS_ACTIVE_KEY);
    for (const sessionId of activeIds) {
      const count = await getPlayerCount(sessionId);
      if (count === 0) {
        await deleteRoom(sessionId);
      }
    }
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}, 60000);

// --- REST: list open rooms ---
app.get('/list', async (req, res) => {
  try {
    const gameId = req.query.game_id;
    const activeIds = await redis.smembers(ROOMS_ACTIVE_KEY);
    const openRooms = {};

    for (const sessionId of activeIds) {
      const room = await getRoom(sessionId);
      if (!room) continue;

      const players = await getPlayers(sessionId);
      const playerCount = Object.keys(players).length;
      const maxPlayers = parseInt(room.maxPlayers, 10) || 4;

      if (playerCount >= maxPlayers) continue;
      if (String(room.gameId) !== gameId) continue;

      const ownerPlayerId = Object.keys(players).find(
        (pid) => players[pid].socketId === room.owner
      );
      const playerName = ownerPlayerId ? players[ownerPlayerId].player_name : 'Unknown';

      openRooms[sessionId] = {
        room_name: room.roomName,
        current: playerCount,
        max: maxPlayers,
        player_name: playerName,
        hasPassword: room.password !== '' && room.password !== 'null',
      };
    }

    res.json(openRooms);
  } catch (err) {
    console.error('List error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Socket.IO event handlers ---
io.on('connection', (socket) => {
  const clientIp = getClientIp(socket);
  console.log(`[connect] socket=${socket.id} ip=${clientIp}`);

  socket.on('open-room', async (data, callback) => {
    console.log(`[open-room] socket=${socket.id}`, JSON.stringify(data).substring(0, 200));
    try {
      let sessionId, playerId, roomName, gameId, maxPlayers, playerName, roomPassword;
      if (data.extra) {
        sessionId = data.extra.sessionid;
        playerId = data.extra.userid || data.extra.playerId;
        roomName = data.extra.room_name;
        gameId = data.extra.game_id;
        maxPlayers = data.maxPlayers || 4;
        playerName = data.extra.player_name || 'Unknown';
        roomPassword = data.extra.room_password || 'none';
      }
      if (!sessionId || !playerId) {
        return callback('Invalid data: sessionId and playerId required');
      }

      const existing = await getRoom(sessionId);
      if (existing) {
        return callback('Room already exists');
      }

      let finalDomain = data.extra.domain;
      if (finalDomain === undefined || finalDomain === null) {
        finalDomain = 'unknown';
      }

      await createRoom(sessionId, {
        owner: socket.id,
        roomName: roomName || `Room ${sessionId}`,
        gameId: gameId || 'default',
        domain: finalDomain,
        password: data.password || '',
        maxPlayers: maxPlayers,
      });

      const playerData = { ...data.extra, socketId: socket.id };
      await setPlayer(sessionId, playerId, playerData);

      socket.join(sessionId);
      socket.sessionId = sessionId;
      socket.playerId = playerId;

      const players = await getPlayers(sessionId);
      io.to(sessionId).emit('users-updated', players);
      callback(null);
    } catch (err) {
      console.error('open-room error:', err.message);
      callback('Server error');
    }
  });

  socket.on('join-room', async (data, callback) => {
    try {
      const { sessionid: sessionId, userid: playerId, player_name: playerName = 'Unknown' } = data.extra || {};

      if (!sessionId || !playerId) {
        if (typeof callback === 'function') callback('Invalid data: sessionId and playerId required');
        return;
      }

      const room = await getRoom(sessionId);
      if (!room) {
        if (typeof callback === 'function') callback('Room not found');
        return;
      }

      const roomPassword = data.password || null;
      if (room.password && room.password !== '' && room.password !== roomPassword) {
        if (typeof callback === 'function') callback('Incorrect password');
        return;
      }

      const playerCount = await getPlayerCount(sessionId);
      const maxPlayers = parseInt(room.maxPlayers, 10) || 4;
      if (playerCount >= maxPlayers) {
        if (typeof callback === 'function') callback('Room full');
        return;
      }

      const playerData = { ...data.extra, socketId: socket.id };
      await setPlayer(sessionId, playerId, playerData);

      socket.join(sessionId);
      socket.sessionId = sessionId;
      socket.playerId = playerId;

      const players = await getPlayers(sessionId);
      io.to(sessionId).emit('users-updated', players);

      if (typeof callback === 'function') {
        callback(null, players);
      }
    } catch (err) {
      console.error('join-room error:', err.message);
      if (typeof callback === 'function') callback('Server error');
    }
  });

  socket.on('leave-room', async () => {
    await handlePlayerLeave(socket);
  });

  socket.on('webrtc-signal', (data) => {
    try {
      const { target, candidate, offer, answer, requestRenegotiate } = data || {};

      if (!target && !requestRenegotiate) {
        throw new Error('Target ID missing unless requesting renegotiation');
      }

      if (requestRenegotiate) {
        const targetSocket = io.sockets.sockets.get(target);
        if (targetSocket) {
          targetSocket.emit('webrtc-signal', {
            sender: socket.id,
            requestRenegotiate: true,
          });
        }
      } else {
        io.to(target).emit('webrtc-signal', {
          sender: socket.id,
          candidate,
          offer,
          answer,
        });
      }
    } catch (error) {
      console.error(`WebRTC signal error: ${error.message}`);
    }
  });

  // Relay events — Socket.IO Redis adapter handles cross-instance broadcast
  socket.on('data-message', (data) => {
    if (socket.sessionId) {
      socket.to(socket.sessionId).emit('data-message', data);
    }
  });

  socket.on('snapshot', (data) => {
    if (socket.sessionId) {
      socket.to(socket.sessionId).emit('snapshot', data);
    }
  });

  socket.on('input', (data) => {
    if (socket.sessionId) {
      socket.to(socket.sessionId).emit('input', data);
    }
  });

  socket.on('disconnect', async () => {
    await handlePlayerLeave(socket);
  });
});

async function handlePlayerLeave(socket) {
  const sessionId = socket.sessionId;
  const playerId = socket.playerId;
  if (!sessionId || !playerId) return;

  const room = await getRoom(sessionId);
  if (!room) return;

  await removePlayer(sessionId, playerId);

  const players = await getPlayers(sessionId);
  const remainingIds = Object.keys(players);

  io.to(sessionId).emit('users-updated', players);

  if (remainingIds.length === 0) {
    await deleteRoom(sessionId);
  } else if (socket.id === room.owner) {
    // Transfer ownership to first remaining player
    const newOwnerPid = remainingIds[0];
    const newOwnerId = players[newOwnerPid].socketId;
    await setRoomField(sessionId, 'owner', newOwnerId);
    io.to(sessionId).emit('users-updated', players);
  }

  socket.leave(sessionId);
  delete socket.sessionId;
  delete socket.playerId;
}

server.listen(PORT, '0.0.0.0', () => console.log(`Netplay server running on port ${PORT}`));
