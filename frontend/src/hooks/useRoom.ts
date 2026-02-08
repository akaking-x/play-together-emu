import { useEffect, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useRoomStore } from '../stores/roomStore';

export function useRoom() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const client = useRoomStore((s) => s.client);
  const connected = useRoomStore((s) => s.connected);
  const room = useRoomStore((s) => s.room);
  const rooms = useRoomStore((s) => s.rooms);
  const messages = useRoomStore((s) => s.messages);
  const error = useRoomStore((s) => s.error);
  const gameStarting = useRoomStore((s) => s.gameStarting);
  const connect = useRoomStore((s) => s.connect);
  const clearRoom = useRoomStore((s) => s.clearRoom);
  const setReadyLocal = useRoomStore((s) => s.setReadyLocal);

  // Auto-connect when token is available
  useEffect(() => {
    if (token) {
      connect(token);
    }
  }, [token, connect]);

  const listRooms = useCallback((gameId: string) => {
    client?.listRooms(gameId);
  }, [client]);

  const createRoom = useCallback((gameId: string, roomName: string, maxPlayers: number, isPrivate: boolean) => {
    client?.createRoom(gameId, roomName, maxPlayers, isPrivate);
  }, [client]);

  const joinRoom = useCallback((roomId: string, roomCode?: string) => {
    client?.joinRoom(roomId, roomCode);
  }, [client]);

  const leaveRoom = useCallback(() => {
    client?.leaveRoom();
    clearRoom();
  }, [client, clearRoom]);

  const setReady = useCallback((ready: boolean) => {
    client?.setReady(ready);
    // Optimistic local update so the UI responds immediately
    if (user) {
      setReadyLocal(user.id, ready);
    }
  }, [client, user, setReadyLocal]);

  const startGame = useCallback(() => {
    client?.startGame();
  }, [client]);

  const transferHost = useCallback((targetUserId: string) => {
    client?.transferHost(targetUserId);
  }, [client]);

  const sendChat = useCallback((message: string) => {
    client?.sendChat(message);
  }, [client]);

  const isHost = room?.hostId === user?.id;
  const currentPlayer = room?.players.find((p) => p.userId === user?.id);
  const isReady = currentPlayer?.isReady ?? false;
  const allReady = room?.players.every((p) => p.userId === room.hostId || p.isReady) ?? false;

  return {
    room,
    rooms,
    messages,
    connected,
    error,
    gameStarting,
    isHost,
    isReady,
    allReady,
    client,
    listRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    transferHost,
    sendChat,
  };
}
