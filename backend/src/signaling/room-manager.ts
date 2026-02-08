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

export interface DisconnectedPlayer {
  player: LivePlayer;
  timer: ReturnType<typeof setTimeout>;
}

export class RoomManager {
  private rooms = new Map<string, LiveRoom>();
  private disconnectedPlayers = new Map<string, Map<string, DisconnectedPlayer>>();
  private reconnectStates = new Map<string, string>(); // roomId → base64 save state

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
    // Clean up disconnected players and timers
    const disc = this.disconnectedPlayers.get(roomId);
    if (disc) {
      for (const entry of disc.values()) {
        clearTimeout(entry.timer);
      }
      this.disconnectedPlayers.delete(roomId);
    }
    this.reconnectStates.delete(roomId);
    this.emulatorReady.delete(roomId);
    this.rooms.delete(roomId);
  }

  reservePlayer(roomId: string, userId: string, timer: ReturnType<typeof setTimeout>): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = room.players.find(p => p.userId === userId);
    if (!player) return;
    // Remove from active players
    room.players = room.players.filter(p => p.userId !== userId);
    // Store in disconnected map
    if (!this.disconnectedPlayers.has(roomId)) {
      this.disconnectedPlayers.set(roomId, new Map());
    }
    this.disconnectedPlayers.get(roomId)!.set(userId, { player, timer });
  }

  restorePlayer(roomId: string, userId: string): LivePlayer | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const disc = this.disconnectedPlayers.get(roomId);
    if (!disc) return null;
    const entry = disc.get(userId);
    if (!entry) return null;
    clearTimeout(entry.timer);
    disc.delete(userId);
    if (disc.size === 0) this.disconnectedPlayers.delete(roomId);
    // Add back to room
    room.players.push(entry.player);
    return entry.player;
  }

  isReserved(roomId: string, userId: string): boolean {
    return this.disconnectedPlayers.get(roomId)?.has(userId) ?? false;
  }

  clearReservation(roomId: string, userId: string): void {
    const disc = this.disconnectedPlayers.get(roomId);
    if (!disc) return;
    const entry = disc.get(userId);
    if (entry) {
      clearTimeout(entry.timer);
      disc.delete(userId);
    }
    if (disc.size === 0) this.disconnectedPlayers.delete(roomId);
  }

  getReservedCount(roomId: string): number {
    return this.disconnectedPlayers.get(roomId)?.size ?? 0;
  }

  hasActivePlayers(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.players.length > 0 || (this.disconnectedPlayers.get(roomId)?.size ?? 0) > 0;
  }

  // Track which players have loaded their emulator
  private emulatorReady = new Map<string, Set<string>>(); // roomId → set of userIds

  markEmulatorReady(roomId: string, userId: string): boolean {
    if (!this.emulatorReady.has(roomId)) {
      this.emulatorReady.set(roomId, new Set());
    }
    this.emulatorReady.get(roomId)!.add(userId);
    // Check if all active players are ready
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.players.every(p => this.emulatorReady.get(roomId)!.has(p.userId));
  }

  clearEmulatorReady(roomId: string): void {
    this.emulatorReady.delete(roomId);
  }

  setReconnectState(roomId: string, state: string): void {
    this.reconnectStates.set(roomId, state);
  }

  getReconnectState(roomId: string): string | null {
    return this.reconnectStates.get(roomId) ?? null;
  }

  clearReconnectState(roomId: string): void {
    this.reconnectStates.delete(roomId);
  }
}
