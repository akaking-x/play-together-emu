import crypto from 'crypto';

export interface LivePlayer {
  userId: string;
  displayName: string;
  controllerPort: number;
  isReady: boolean;
}

export interface LiveRoom {
  id: string;
  hostId: string;
  gameId: string;
  roomName: string;
  maxPlayers: number;
  isPrivate: boolean;
  roomCode: string;
  players: LivePlayer[];
  status: 'waiting' | 'playing' | 'closed';
  createdAt: number;
}

function randomId(length: number): string {
  return crypto.randomBytes(length)
    .toString('base64url')
    .slice(0, length);
}

function randomCode(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

export class RoomManager {
  private rooms = new Map<string, LiveRoom>();

  create(opts: {
    hostId: string;
    gameId: string;
    roomName: string;
    maxPlayers: number;
    isPrivate: boolean;
  }): LiveRoom {
    const room: LiveRoom = {
      id: randomId(8),
      hostId: opts.hostId,
      gameId: opts.gameId,
      roomName: opts.roomName,
      maxPlayers: Math.min(opts.maxPlayers, 8),
      isPrivate: opts.isPrivate,
      roomCode: opts.isPrivate ? randomCode(6) : '',
      players: [],
      status: 'waiting',
      createdAt: Date.now(),
    };
    this.rooms.set(room.id, room);
    return room;
  }

  get(id: string): LiveRoom | null {
    return this.rooms.get(id) || null;
  }

  listByGame(gameId: string): LiveRoom[] {
    return [...this.rooms.values()].filter(
      r => r.gameId === gameId && r.status === 'waiting'
    );
  }

  listAll(): LiveRoom[] {
    return [...this.rooms.values()].filter(r => r.status !== 'closed');
  }

  addPlayer(roomId: string, userId: string, displayName: string, port: number) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.players.find(p => p.userId === userId)) return;
    room.players.push({ userId, displayName, controllerPort: port, isReady: false });
  }

  removePlayer(roomId: string, userId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter(p => p.userId !== userId);
    // Transfer host if host left
    if (room.hostId === userId && room.players.length > 0) {
      room.hostId = room.players[0].userId;
    }
  }

  setReady(roomId: string, userId: string, ready: boolean) {
    const room = this.rooms.get(roomId);
    const player = room?.players.find(p => p.userId === userId);
    if (player) player.isReady = ready;
  }

  nextPort(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    const usedPorts = new Set(room.players.map(p => p.controllerPort));
    for (let i = 0; i < 8; i++) {
      if (!usedPorts.has(i)) return i;
    }
    return 0;
  }

  delete(roomId: string) {
    this.rooms.delete(roomId);
  }
}
