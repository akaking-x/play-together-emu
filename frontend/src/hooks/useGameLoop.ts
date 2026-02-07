import { useEffect, useRef } from 'react';
import type { EmulatorCore } from '../emulator/core';
import type { InputMapper, PS1Input } from '../emulator/input-mapper';
import type { SignalingRoom } from '../netplay/signaling';
import { RollbackEngine } from '../netplay/rollback';
import { encodeInput, decodeInput } from '../netplay/protocol';

interface UseGameLoopOptions {
  emulator: EmulatorCore | null;
  inputMapper: InputMapper | null;
  room: SignalingRoom | null;
  localUserId: string;
  sendToAll: (data: ArrayBuffer) => void;
  setOnData: (cb: (peerId: string, data: ArrayBuffer) => void) => void;
  active: boolean;
}

const TICK_MS = 16; // ~60Hz
const MAX_ADVANTAGE = 7; // max frames ahead of remote before throttling

export function useGameLoop({
  emulator,
  inputMapper,
  room,
  localUserId,
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

  const rollbackRef = useRef<RollbackEngine | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!active) {
      // Reset when deactivated
      rollbackRef.current?.reset();
      frameRef.current = 0;
      return;
    }

    const rollback = new RollbackEngine();
    rollbackRef.current = rollback;
    frameRef.current = 0;

    // Wire up incoming data handler
    setOnData((peerId: string, data: ArrayBuffer) => {
      const { frame, input } = decodeInput(data);
      rollback.addRemoteInput(peerId, frame, input);
    });

    // Main game loop tick
    const intervalId = setInterval(() => {
      const emu = emulatorRef.current;
      const mapper = inputMapperRef.current;
      const currentRoom = roomRef.current;
      if (!emu || !mapper || !currentRoom) return;

      // Throttle: don't run too far ahead of remote
      if (rollback.frameAdvantage > rollback.delay + MAX_ADVANTAGE) return;

      // Advance frame
      frameRef.current++;
      const frame = frameRef.current;

      // Poll local input
      const localInput: PS1Input = mapper.poll();

      // Record locally and broadcast to peers
      rollback.addLocalInput(frame, localInput);
      sendToAllRef.current(encodeInput(frame, localInput));

      // Apply inputs to emulator for each player
      for (const player of currentRoom.players) {
        const port = player.controllerPort;
        if (player.userId === localUserId) {
          emu.setInput(port, localInput.buttons);
        } else {
          const remoteInput = rollback.getInput(player.userId, frame);
          emu.setInput(port, remoteInput.buttons);
        }
      }
    }, TICK_MS);

    return () => {
      clearInterval(intervalId);
      rollback.reset();
      rollbackRef.current = null;
      frameRef.current = 0;
    };
  }, [active, localUserId, setOnData]);
}
