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
    // Kick old connection for the same user
    const old = this.connections.get(user.id);
    if (old) old.ws.close(1000, 'Replaced');

    const conn: ConnectedUser = { ws, user, roomId: null };
    this.connections.set(user.id, conn);

    ws.on('message', (raw) => {
      try {
        this.onMessage(conn, JSON.parse(raw.toString()));
      } catch {
        this.send(ws, { type: 'error', code: 'BAD_MSG', message: 'Invalid JSON' });
      }
    });

    ws.on('close', () => {
      if (conn.roomId) this.leaveRoom(conn);
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
        // Leave current room first if already in one
        if (conn.roomId) this.leaveRoom(conn);

        const room = this.rooms.get(msg.roomId);
        if (!room) {
          this.send(conn.ws, { type: 'error', code: 'NOT_FOUND', message: 'Room not found' });
          return;
        }
        if (room.status !== 'waiting') {
          this.send(conn.ws, { type: 'error', code: 'STARTED', message: 'Game already started' });
          return;
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
        this.leaveRoom(conn);
        break;

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
