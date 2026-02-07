import type { ISplitScreenCheats, ICheatCode } from '../models/Game.js';

const GAMESHARK_RE = /^[0-9A-Fa-f]{8}\s[0-9A-Fa-f]{4}$/;

export function validateCheatCode(code: string): boolean {
  return GAMESHARK_RE.test(code.trim());
}

interface CheatsFileJSON {
  game?: {
    splitType?: string;
    testedVersion?: string;
  };
  cheats?: Record<string, Array<string | { code: string; description?: string }>>;
  testResults?: {
    viewportOK?: boolean;
    cameraOK?: boolean;
    hudOK?: boolean;
    stabilityOK?: boolean;
    notes?: string;
  };
}

type PlayerKey = 'player1_fullscreen' | 'player2_fullscreen' | 'player3_fullscreen' | 'player4_fullscreen';
const PLAYER_KEYS: PlayerKey[] = ['player1_fullscreen', 'player2_fullscreen', 'player3_fullscreen', 'player4_fullscreen'];

export function parseCheatsFile(json: CheatsFileJSON): { config: ISplitScreenCheats; warnings: string[] } {
  const warnings: string[] = [];

  // 1. Validate splitType
  const splitType = json.game?.splitType;
  if (!splitType || !['horizontal', 'vertical', 'quad'].includes(splitType)) {
    throw new Error(`splitType khong hop le: "${splitType}". Phai la horizontal, vertical, hoac quad`);
  }

  // 2. Parse cheats
  const cheats: ISplitScreenCheats['cheats'] = {
    player1_fullscreen: [],
    player2_fullscreen: [],
    player3_fullscreen: [],
    player4_fullscreen: [],
  };

  if (!json.cheats || typeof json.cheats !== 'object') {
    throw new Error('Thieu truong "cheats" trong file JSON');
  }

  for (const key of PLAYER_KEYS) {
    const rawCodes = json.cheats[key];
    if (!rawCodes || !Array.isArray(rawCodes)) continue;

    for (const entry of rawCodes) {
      let cheat: ICheatCode;
      if (typeof entry === 'string') {
        cheat = { code: entry.trim(), description: '' };
      } else if (entry && typeof entry === 'object' && entry.code) {
        cheat = { code: entry.code.trim(), description: entry.description || '' };
      } else {
        continue;
      }

      if (!validateCheatCode(cheat.code)) {
        throw new Error(`Code khong hop le: "${cheat.code}". Format: "XXXXXXXX XXXX" (hex)`);
      }

      cheats[key].push(cheat);
    }
  }

  // 3. Must have at least some codes
  const hasAnyCodes = PLAYER_KEYS.some(k => cheats[k].length > 0);
  if (!hasAnyCodes) {
    throw new Error('File cheats khong co code nao. Phai co it nhat player1_fullscreen hoac player2_fullscreen');
  }

  // 4. Build notes
  const notesParts: string[] = [];
  if (json.testResults?.notes) notesParts.push(json.testResults.notes);
  if (json.game?.testedVersion) notesParts.push(`Tested version: ${json.game.testedVersion}`);
  const notes = notesParts.join('. ');

  // 5. Warnings from testResults
  if (json.testResults) {
    if (json.testResults.hudOK === false) warnings.push('HUD co the bi loi khi dung cheats');
    if (json.testResults.stabilityOK === false) warnings.push('Game co the khong on dinh voi cheats');
    if (json.testResults.cameraOK === false) warnings.push('Camera co the bi loi voi cheats');
  }

  return {
    config: {
      splitType: splitType as ISplitScreenCheats['splitType'],
      cheats,
      notes,
    },
    warnings,
  };
}
