import { WebSocketServer, WebSocket } from 'ws';
import { parse } from 'url';
import { verifyToken, TokenPayload } from '../services/auth.service.js';
import { RoomManager } from './room-manager.js';
import type { Server } from 'http';

interface ConnectedUser {
  ws: WebSocket;
  user: TokenPayload;
  roomId: string | null;
}

export class SignalingServer {
  private wss: WebSocketServer;
  private connections = new Map<string, ConnectedUser>();
  public rooms = new RoomManager();

  constructor(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      verifyClient: (info, cb) => {
        const { query } = parse(info.req.url || '', true);
        const user = verifyToken(query.token as string);
        if (!user) return cb(false, 401, 'Unauthorized');
        (info.req as any).user = user;
        cb(true);
      },
    });

    this.wss.on('connection', (ws, req) => {
      const user = (req as any).user as TokenPayload;
      this.onConnect(ws, user);
    });
  }

  private onConnect(ws: WebSocket, user: TokenPayload) {
    // If same user reconnects, inherit their roomId so they stay in the room
    const old = this.connections.get(user.id);
    let inheritedRoomId: string | null = null;

    if (old) {
      inheritedRoomId = old.roomId;
      old.roomId = null; // Clear BEFORE close so close handler won't remove from room
      old.ws.close(1000, 'Replaced');
    }

    const conn: ConnectedUser = { ws, user, roomId: inheritedRoomId };
    this.connections.set(user.id, conn);

    // If reconnecting to a room, verify and send current state
    if (inheritedRoomId) {
      const room = this.rooms.get(inheritedRoomId);
      if (room && room.players.find(p => p.userId === user.id)) {
        this.send(ws, { type: 'room-updated', room });
      } else {
        conn.roomId = null; // Room gone or player was removed
      }
    }

    ws.on('message', (raw) => {
      try {
        this.onMessage(conn, JSON.parse(raw.toString()));
      } catch {
        this.send(ws, { type: 'error', code: 'BAD_MSG', message: 'Invalid JSON' });
      }
    });

    ws.on('close', () => {
      // If this connection was replaced by a newer one, don't touch the room
      if (this.connections.get(user.id) !== conn) return;

      if (conn.roomId) {
        const room = this.rooms.get(conn.roomId);
        // During 'playing', reserve slot instead of permanent leave
        if (room && room.status === 'playing') {
          this.disconnectFromRoom(conn);
        } else {
          this.leaveRoom(conn);
        }
      }
      this.connections.delete(user.id);
    });
  }

  private onMessage(conn: ConnectedUser, msg: any) {
    switch (msg.type) {
      case 'list-rooms':
        this.send(conn.ws, {
          type: 'room-list',
          rooms: this.rooms.listByGame(msg.gameId),
        });
        break;

      case 'create-room': {
        // Leave current room first if already in one
        if (conn.roomId) this.leaveRoom(conn);

        const room = this.rooms.create({
          hostId: conn.user.id,
          gameId: msg.gameId,
          roomName: msg.roomName,
          maxPlayers: msg.maxPlayers || 2,
          isPrivate: msg.isPrivate || false,
        });
        this.rooms.addPlayer(room.id, conn.user.id, conn.user.displayName, 0);
        conn.roomId = room.id;
        this.send(conn.ws, { type: 'room-updated', room: this.rooms.get(room.id) });
        break;
      }

      case 'join-room': {
        // Leave current room first if already in a DIFFERENT room
        if (conn.roomId && conn.roomId !== msg.roomId) this.leaveRoom(conn);

        const room = this.rooms.get(msg.roomId);
        if (!room) {
          this.send(conn.ws, { type: 'error', code: 'NOT_FOUND', message: 'Room not found' });
          return;
        }
        if (room.status !== 'waiting') {
          this.send(conn.ws, { type: 'error', code: 'STARTED', message: 'Game already started' });
          return;
        }

        // If player is already in this room (ghost from previous connection),
        // just re-associate the connection instead of adding a duplicate
        const existingPlayer = room.players.find(p => p.userId === conn.user.id);
        if (existingPlayer) {
          conn.roomId = room.id;
          this.broadcastRoom(room.id);
          break;
        }

        if (room.players.length >= room.maxPlayers) {
          this.send(conn.ws, { type: 'error', code: 'FULL', message: 'Room is full' });
          return;
        }
        if (room.isPrivate && msg.roomCode !== room.roomCode) {
          this.send(conn.ws, { type: 'error', code: 'BAD_CODE', message: 'Invalid room code' });
          return;
        }

        const port = this.rooms.nextPort(room.id);
        this.rooms.addPlayer(room.id, conn.user.id, conn.user.displayName, port);
        conn.roomId = room.id;
        this.broadcastRoom(room.id);
        break;
      }

      case 'leave-room':
        // Intentional leave — permanent removal, no reservation
        this.leaveRoom(conn);
        break;

      case 'rejoin-room': {
        const room = this.rooms.get(msg.roomId);
        if (!room) {
          this.send(conn.ws, { type: 'error', code: 'NOT_FOUND', message: 'Room not found' });
          return;
        }

        if (room.status === 'waiting') {
          // Rejoin waiting room — just re-associate the connection
          const existingPlayer = room.players.find(p => p.userId === conn.user.id);
          if (!existingPlayer) {
            this.send(conn.ws, { type: 'error', code: 'NOT_IN_ROOM', message: 'Not in this room' });
            return;
          }
          conn.roomId = room.id;
          this.broadcastRoom(room.id);
          break;
        }

        if (room.status !== 'playing') {
          this.send(conn.ws, { type: 'error', code: 'ROOM_CLOSED', message: 'Room is closed' });
          return;
        }
        if (!this.rooms.isReserved(room.id, conn.user.id)) {
          this.send(conn.ws, { type: 'error', code: 'NO_RESERVATION', message: 'No reservation found' });
          return;
        }
        // Restore player from reservation
        const restored = this.rooms.restorePlayer(room.id, conn.user.id);
        if (!restored) {
          this.send(conn.ws, { type: 'error', code: 'RESTORE_FAILED', message: 'Failed to restore player' });
          return;
        }
        conn.roomId = room.id;
        // Notify remaining players
        this.broadcastToRoom(room.id, {
          type: 'player-reconnected',
          userId: conn.user.id,
          displayName: conn.user.displayName,
        });
        // Send reconnect state to rejoining player if available
        const reconnectState = this.rooms.getReconnectState(room.id);
        if (reconnectState) {
          this.send(conn.ws, { type: 'reconnect-state', stateData: reconnectState });
          this.rooms.clearReconnectState(room.id);
        }
        // Broadcast updated room
        this.broadcastRoom(room.id);
        break;
      }

      case 'room-save-state': {
        if (!conn.roomId) return;
        const room = this.rooms.get(conn.roomId);
        if (!room || room.status !== 'playing') return;
        this.rooms.setReconnectState(conn.roomId, msg.stateData);
        break;
      }

      case 'emulator-ready': {
        if (!conn.roomId) return;
        const room = this.rooms.get(conn.roomId);
        if (!room || room.status !== 'playing') return;
        const allReady = this.rooms.markEmulatorReady(conn.roomId, conn.user.id);
        // Notify others about loading progress
        this.broadcastToRoom(conn.roomId, {
          type: 'player-loaded',
          userId: conn.user.id,
          displayName: conn.user.displayName,
        });
        if (allReady) {
          // All players loaded — start synced gameplay with 3s countdown
          this.rooms.clearEmulatorReady(conn.roomId);
          this.broadcastToRoom(conn.roomId, { type: 'game-synced' });
        }
        break;
      }

      case 'ready':
        if (conn.roomId) {
          this.rooms.setReady(conn.roomId, conn.user.id, msg.ready);
          this.broadcastRoom(conn.roomId);
        }
        break;

      case 'start-game': {
        if (!conn.roomId) return;
        const room = this.rooms.get(conn.roomId);
        if (!room || room.hostId !== conn.user.id) return;
        const allReady = room.players.every(
          p => p.userId === room.hostId || p.isReady
        );
        if (!allReady) {
          this.send(conn.ws, { type: 'error', code: 'NOT_READY', message: 'Not all players are ready' });
          return;
        }

        room.status = 'playing';
        this.broadcastToRoom(conn.roomId, { type: 'game-starting', room });
        break;
      }

      // WebRTC signaling relay
      case 'signal': {
        const target = this.connections.get(msg.targetId);
        if (target) {
          this.send(target.ws, { type: 'signal', fromId: conn.user.id, sdp: msg.sdp });
        }
        break;
      }

      case 'ice': {
        const target = this.connections.get(msg.targetId);
        if (target) {
          this.send(target.ws, { type: 'ice', fromId: conn.user.id, candidate: msg.candidate });
        }
        break;
      }

      case 'chat': {
        if (!conn.roomId) return;
        this.broadcastToRoom(conn.roomId, {
          type: 'chat',
          fromId: conn.user.id,
          displayName: conn.user.displayName,
          message: msg.message,
          timestamp: Date.now(),
        });
        break;
      }
    }
  }

  private disconnectFromRoom(conn: ConnectedUser) {
    if (!conn.roomId) return;
    const roomId = conn.roomId;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const RESERVATION_TIMEOUT = 60_000; // 60 seconds

    const timer = setTimeout(() => {
      // Reservation expired — permanent removal
      this.rooms.clearReservation(roomId, conn.user.id);
      // If host timed out, transfer host
      if (room.hostId === conn.user.id && room.players.length > 0) {
        room.hostId = room.players[0].userId;
      }
      // Broadcast permanent leave
      this.broadcastToRoom(roomId, {
        type: 'player-disconnected',
        userId: conn.user.id,
        temporary: false,
        displayName: conn.user.displayName,
      });
      // Delete room if no active players and no reservations
      if (!this.rooms.hasActivePlayers(roomId)) {
        this.rooms.delete(roomId);
      } else {
        this.broadcastRoom(roomId);
      }
    }, RESERVATION_TIMEOUT);

    // Reserve the slot (removes from room.players, stores with timer)
    this.rooms.reservePlayer(roomId, conn.user.id, timer);
    conn.roomId = null;

    // Notify remaining players of temporary disconnect
    this.broadcastToRoom(roomId, {
      type: 'player-disconnected',
      userId: conn.user.id,
      temporary: true,
      displayName: conn.user.displayName,
    });
    this.broadcastRoom(roomId);
  }

  private leaveRoom(conn: ConnectedUser) {
    if (!conn.roomId) return;
    const roomId = conn.roomId;
    this.rooms.removePlayer(roomId, conn.user.id);
    conn.roomId = null;

    const room = this.rooms.get(roomId);
    if (!room || room.players.length === 0) {
      this.rooms.delete(roomId);
    } else {
      this.broadcastToRoom(roomId, { type: 'player-disconnected', userId: conn.user.id });
      this.broadcastRoom(roomId);
    }
  }

  private broadcastRoom(roomId: string) {
    this.broadcastToRoom(roomId, { type: 'room-updated', room: this.rooms.get(roomId) });
  }

  private broadcastToRoom(roomId: string, msg: any) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const p of room.players) {
      const conn = this.connections.get(p.userId);
      if (conn) this.send(conn.ws, msg);
    }
  }

  private send(ws: WebSocket, msg: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  getOnlineCount(): number {
    return this.connections.size;
  }

  getActiveRoomCount(): number {
    return this.rooms.listAll().length;
  }
}
