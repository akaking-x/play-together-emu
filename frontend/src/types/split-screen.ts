export interface CheatCode {
  code: string;
  description: string;
}

export interface SplitScreenCheats {
  splitType: 'horizontal' | 'vertical' | 'quad';
  cheats: {
    player1_fullscreen: CheatCode[];
    player2_fullscreen: CheatCode[];
    player3_fullscreen: CheatCode[];
    player4_fullscreen: CheatCode[];
  };
  notes: string;
}
