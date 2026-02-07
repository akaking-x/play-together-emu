import { useEffect, useRef } from 'react';
import type { EmulatorCore } from '../emulator/core';
import type { InputMapper, PS1Input } from '../emulator/input-mapper';
import type { SignalingRoom } from '../netplay/signaling';
import { encodeInput, decodeInput } from '../netplay/protocol';

interface UseGameLoopOptions {
  emulator: EmulatorCore | null;
  inputMapper: InputMapper | null;
  room: SignalingRoom | null;
  localUserId: string;
  isHost: boolean;
  sendToAll: (data: ArrayBuffer) => void;
  setOnData: (cb: (peerId: string, data: ArrayBuffer) => void) => void;
  active: boolean;
}

const TICK_MS = 16; // ~60Hz

export function useGameLoop({
  emulator,
  inputMapper,
  room,
  localUserId,
  isHost,
  sendToAll,
  setOnData,
  active,
}: UseGameLoopOptions) {
  // Use refs to avoid stale closures in the interval/callback
  const roomRef = useRef(room);
  roomRef.current = room;

  const emulatorRef = useRef(emulator);
  emulatorRef.current = emulator;

  const inputMapperRef = useRef(inputMapper);
  inputMapperRef.current = inputMapper;

  const sendToAllRef = useRef(sendToAll);
  sendToAllRef.current = sendToAll;

  // Store latest remote input buttons for host to apply
  const remoteButtonsRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!active) {
      frameRef.current = 0;
      remoteButtonsRef.current = 0;
      return;
    }

    if (isHost) {
      // HOST MODE: run emulator, apply local + remote input
      // Wire up incoming data: guest sends input, host stores latest buttons
      setOnData((_peerId: string, data: ArrayBuffer) => {
        const { input } = decodeInput(data);
        remoteButtonsRef.current = input.buttons;
      });

      const intervalId = setInterval(() => {
        const emu = emulatorRef.current;
        const mapper = inputMapperRef.current;
        const currentRoom = roomRef.current;
        if (!emu || !mapper || !currentRoom) return;

        frameRef.current++;

        // Poll local input
        const localInput: PS1Input = mapper.poll();

        // Apply inputs to emulator for each player
        for (const player of currentRoom.players) {
          const port = player.controllerPort;
          if (player.userId === localUserId) {
            emu.setInput(port, localInput.buttons);
          } else {
            emu.setInput(port, remoteButtonsRef.current);
          }
        }
      }, TICK_MS);

      return () => {
        clearInterval(intervalId);
        frameRef.current = 0;
        remoteButtonsRef.current = 0;
      };
    } else {
      // GUEST MODE: no emulator, just poll input and send to host
      setOnData(() => {
        // Guest ignores incoming data (host doesn't send game input to guest)
      });

      const intervalId = setInterval(() => {
        const mapper = inputMapperRef.current;
        if (!mapper) return;

        frameRef.current++;
        const localInput: PS1Input = mapper.poll();
        sendToAllRef.current(encodeInput(frameRef.current, localInput));
      }, TICK_MS);

      return () => {
        clearInterval(intervalId);
        frameRef.current = 0;
      };
    }
  }, [active, localUserId, isHost, setOnData]);
}
