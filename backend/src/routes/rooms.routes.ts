import { Router } from 'express';
import type { SignalingServer } from '../signaling/ws-server.js';

export function createRoomsRoutes(signaling: SignalingServer) {
  const router = Router();

  // POST /api/rooms - create room
  router.post('/', (req, res) => {
    const { gameId, roomName, maxPlayers, isPrivate } = req.body;
    if (!gameId || !roomName) {
      res.status(400).json({ error: 'gameId and roomName are required' });
      return;
    }

    const room = signaling.rooms.create({
      hostId: req.user!.id,
      gameId,
      roomName,
      maxPlayers: maxPlayers || 2,
      isPrivate: isPrivate || false,
    });
    signaling.rooms.addPlayer(room.id, req.user!.id, req.user!.displayName, 0);

    res.json(room);
  });

  // GET /api/rooms - list rooms
  router.get('/', (req, res) => {
    const gameId = req.query.gameId as string;
    const rooms = gameId
      ? signaling.rooms.listByGame(gameId)
      : signaling.rooms.listAll();

    // Hide roomCode from non-host players
    const sanitized = rooms.map(r => ({
      ...r,
      roomCode: r.isPrivate ? '******' : '',
    }));
    res.json(sanitized);
  });

  // GET /api/rooms/:id - room detail
  router.get('/:id', (req, res) => {
    const room = signaling.rooms.get(req.params.id);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const isInRoom = room.players.some(p => p.userId === req.user!.id);
    res.json({
      ...room,
      roomCode: isInRoom || room.hostId === req.user!.id ? room.roomCode : (room.isPrivate ? '******' : ''),
    });
  });

  // POST /api/rooms/:id/join
  router.post('/:id/join', (req, res) => {
    const room = signaling.rooms.get(req.params.id);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    if (room.status !== 'waiting') {
      res.status(400).json({ error: 'Game already started' });
      return;
    }
    if (room.players.length >= room.maxPlayers) {
      res.status(400).json({ error: 'Room is full' });
      return;
    }
    if (room.isPrivate && req.body.roomCode !== room.roomCode) {
      res.status(403).json({ error: 'Invalid room code' });
      return;
    }

    const port = signaling.rooms.nextPort(room.id);
    signaling.rooms.addPlayer(room.id, req.user!.id, req.user!.displayName, port);

    res.json(signaling.rooms.get(room.id));
  });

  // POST /api/rooms/:id/leave
  router.post('/:id/leave', (req, res) => {
    const room = signaling.rooms.get(req.params.id);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    signaling.rooms.removePlayer(room.id, req.user!.id);

    const updated = signaling.rooms.get(room.id);
    if (!updated || updated.players.length === 0) {
      signaling.rooms.delete(room.id);
      res.json({ success: true, deleted: true });
      return;
    }

    res.json({ success: true, room: updated });
  });

  // POST /api/rooms/:id/start
  router.post('/:id/start', (req, res) => {
    const room = signaling.rooms.get(req.params.id);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    if (room.hostId !== req.user!.id) {
      res.status(403).json({ error: 'Only host can start the game' });
      return;
    }
    const allReady = room.players.every(
      p => p.userId === room.hostId || p.isReady
    );
    if (!allReady) {
      res.status(400).json({ error: 'Not all players are ready' });
      return;
    }

    room.status = 'playing';
    res.json({ success: true, room });
  });

  return router;
}
