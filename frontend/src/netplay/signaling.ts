export interface SignalingRoom {
  id: string;
  hostId: string;
  gameId: string;
  roomName: string;
  maxPlayers: number;
  isPrivate: boolean;
  roomCode?: string;
  players: Array<{
    userId: string;
    displayName: string;
    controllerPort: number;
    isReady: boolean;
  }>;
  status: 'waiting' | 'playing' | 'closed';
}

export interface SignalingCallbacks {
  onRoomUpdated?: (room: SignalingRoom) => void;
  onRoomList?: (rooms: SignalingRoom[]) => void;
  onGameStarting?: (room: SignalingRoom) => void;
  onSignal?: (fromId: string, sdp: RTCSessionDescriptionInit) => void;
  onICE?: (fromId: string, candidate: RTCIceCandidateInit) => void;
  onChat?: (fromId: string, displayName: string, message: string, timestamp: number) => void;
  onPlayerDisconnected?: (userId: string, temporary?: boolean) => void;
  onPlayerReconnected?: (userId: string, displayName: string) => void;
  onReconnectState?: (stateData: string) => void;
  onError?: (code: string, message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export class SignalingClient {
  private ws: WebSocket | null = null;
  private callbacks: SignalingCallbacks;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 10;
  private token: string | null = null;
  private intentionalClose = false;

  constructor(callbacks: SignalingCallbacks = {}) {
    this.callbacks = callbacks;
  }

  connect(token: string): void {
    this.token = token;
    this.intentionalClose = false;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws?token=${this.token}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.callbacks.onOpen?.();
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        this.handleMessage(msg);
      } catch {
        // ignore invalid JSON
      }
    };

    this.ws.onclose = () => {
      this.callbacks.onClose?.();
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'room-updated':
        this.callbacks.onRoomUpdated?.(msg.room as SignalingRoom);
        break;
      case 'room-list':
        this.callbacks.onRoomList?.(msg.rooms as SignalingRoom[]);
        break;
      case 'game-starting':
        this.callbacks.onGameStarting?.(msg.room as SignalingRoom);
        break;
      case 'signal':
        this.callbacks.onSignal?.(msg.fromId as string, msg.sdp as RTCSessionDescriptionInit);
        break;
      case 'ice':
        this.callbacks.onICE?.(msg.fromId as string, msg.candidate as RTCIceCandidateInit);
        break;
      case 'chat':
        this.callbacks.onChat?.(
          msg.fromId as string,
          msg.displayName as string,
          msg.message as string,
          msg.timestamp as number,
        );
        break;
      case 'player-disconnected':
        this.callbacks.onPlayerDisconnected?.(msg.userId as string, msg.temporary as boolean | undefined);
        break;
      case 'player-reconnected':
        this.callbacks.onPlayerReconnected?.(msg.userId as string, msg.displayName as string);
        break;
      case 'reconnect-state':
        this.callbacks.onReconnectState?.(msg.stateData as string);
        break;
      case 'error':
        this.callbacks.onError?.(msg.code as string, msg.message as string);
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= this.maxReconnectAttempts) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  // Convenience methods

  listRooms(gameId: string): void {
    this.send({ type: 'list-rooms', gameId });
  }

  createRoom(gameId: string, roomName: string, maxPlayers: number, isPrivate: boolean): void {
    this.send({ type: 'create-room', gameId, roomName, maxPlayers, isPrivate });
  }

  joinRoom(roomId: string, roomCode?: string): void {
    this.send({ type: 'join-room', roomId, roomCode });
  }

  leaveRoom(): void {
    this.send({ type: 'leave-room' });
  }

  setReady(ready: boolean): void {
    this.send({ type: 'ready', ready });
  }

  startGame(): void {
    this.send({ type: 'start-game' });
  }

  sendSignal(targetId: string, sdp: RTCSessionDescriptionInit): void {
    this.send({ type: 'signal', targetId, sdp });
  }

  sendICE(targetId: string, candidate: RTCIceCandidateInit): void {
    this.send({ type: 'ice', targetId, candidate });
  }

  sendChat(message: string): void {
    this.send({ type: 'chat', message });
  }

  rejoinRoom(roomId: string): void {
    this.send({ type: 'rejoin-room', roomId });
  }

  sendRoomSaveState(stateData: string): void {
    this.send({ type: 'room-save-state', stateData });
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  setCallback<K extends keyof SignalingCallbacks>(key: K, cb: SignalingCallbacks[K]): void {
    this.callbacks[key] = cb;
  }

  getCallback<K extends keyof SignalingCallbacks>(key: K): SignalingCallbacks[K] {
    return this.callbacks[key];
  }
}
