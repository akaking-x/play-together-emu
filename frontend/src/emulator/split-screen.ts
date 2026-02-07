import type { SplitScreenCheats } from '../types/split-screen';

declare global {
  interface Window {
    EJS_cheats?: string[];
  }
}

type PlayerKey = 'player1_fullscreen' | 'player2_fullscreen' | 'player3_fullscreen' | 'player4_fullscreen';

/**
 * Set window.EJS_cheats for a specific player. MUST be called BEFORE EmulatorJS starts.
 */
export function applyCheats(config: SplitScreenCheats | null | undefined, playerNumber: number): void {
  if (!config) return;

  const playerKey: PlayerKey = `player${playerNumber}_fullscreen` as PlayerKey;
  const codes = config.cheats[playerKey];
  if (!codes || codes.length === 0) return;

  window.EJS_cheats = codes.map((c, i) => {
    const desc = `SplitMod_${i}_${c.description.replace(/\s+/g, '_') || 'code'}`;
    return `${c.code} ${desc}`;
  });
}

/**
 * Remove cheats from window globals.
 */
export function removeCheats(): void {
  delete window.EJS_cheats;
}

/**
 * Convert 0-based controllerPort to 1-based playerNumber.
 */
export function getPlayerNumber(controllerPort: number): number {
  return controllerPort + 1;
}
