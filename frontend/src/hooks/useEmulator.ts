import { useState, useEffect, useRef } from 'react';
import { EmulatorCore, type EmulatorState } from '../emulator/core';

interface UseEmulatorOptions {
  containerId: string;
  romUrl: string;
  biosUrl?: string;
  onFrame?: (frameNumber: number) => void;
}

interface UseEmulatorResult {
  emulator: EmulatorCore | null;
  state: EmulatorState;
  error: string | null;
}

export function useEmulator({ containerId, romUrl, biosUrl, onFrame }: UseEmulatorOptions): UseEmulatorResult {
  const emulatorRef = useRef<EmulatorCore | null>(null);
  const [state, setState] = useState<EmulatorState>('idle');
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!romUrl || !containerId || initRef.current) return;
    initRef.current = true;

    const emu = new EmulatorCore({
      onFrame: (n) => onFrameRef.current?.(n),
      onStateChange: setState,
      onError: setError,
    });
    emulatorRef.current = emu;

    emu.init(containerId, romUrl, biosUrl).catch((err) => {
      setError(err instanceof Error ? err.message : 'Emulator init failed');
    });

    return () => {
      emu.destroy();
      emulatorRef.current = null;
      initRef.current = false;
    };
  }, [containerId, romUrl, biosUrl]);

  return {
    emulator: emulatorRef.current,
    state,
    error,
  };
}
