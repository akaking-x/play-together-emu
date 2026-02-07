export enum PS1Button {
  UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3,
  CROSS = 4, CIRCLE = 5, SQUARE = 6, TRIANGLE = 7,
  L1 = 8, R1 = 9, L2 = 10, R2 = 11,
  START = 12, SELECT = 13,
}

export interface PS1Input {
  buttons: number;    // 16-bit bitmask
  analogLX: number;   // -128..127
  analogLY: number;
}

export const DEFAULT_KEYMAP: Record<string, string> = {
  UP: 'ArrowUp',     DOWN: 'ArrowDown',    LEFT: 'ArrowLeft',  RIGHT: 'ArrowRight',
  CROSS: 'KeyX',     CIRCLE: 'KeyZ',       SQUARE: 'KeyC',     TRIANGLE: 'KeyV',
  L1: 'KeyQ',        R1: 'KeyE',           L2: 'KeyA',         R2: 'KeyD',
  START: 'Enter',    SELECT: 'ShiftRight',
};

export class InputMapper {
  private pressed = new Set<string>();
  private keyMap: Record<string, string>;
  private reverseMap: Record<string, PS1Button>;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;

  constructor(keyMap: Record<string, string> = DEFAULT_KEYMAP) {
    this.keyMap = keyMap;
    this.reverseMap = this.buildReverse();

    this.onKeyDown = (e: KeyboardEvent) => {
      if (this.reverseMap[e.code] !== undefined) {
        this.pressed.add(e.code);
        e.preventDefault();
      }
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.pressed.delete(e.code);
    };

    this.bind();
  }

  private buildReverse(): Record<string, PS1Button> {
    const map: Record<string, PS1Button> = {};
    for (const [btnName, keyCode] of Object.entries(this.keyMap)) {
      const btnEnum = PS1Button[btnName as keyof typeof PS1Button];
      if (btnEnum !== undefined) map[keyCode] = btnEnum;
    }
    return map;
  }

  private bind() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  /** Call every frame (60Hz) -- returns compact input */
  poll(): PS1Input {
    let buttons = 0;
    for (const code of this.pressed) {
      const btn = this.reverseMap[code];
      if (btn !== undefined) buttons |= (1 << btn);
    }

    // Gamepad support
    const gp = navigator.getGamepads?.()?.[0];
    if (gp) {
      if (gp.buttons[12]?.pressed) buttons |= (1 << PS1Button.UP);
      if (gp.buttons[13]?.pressed) buttons |= (1 << PS1Button.DOWN);
      if (gp.buttons[14]?.pressed) buttons |= (1 << PS1Button.LEFT);
      if (gp.buttons[15]?.pressed) buttons |= (1 << PS1Button.RIGHT);
      if (gp.buttons[0]?.pressed)  buttons |= (1 << PS1Button.CROSS);
      if (gp.buttons[1]?.pressed)  buttons |= (1 << PS1Button.CIRCLE);
      if (gp.buttons[2]?.pressed)  buttons |= (1 << PS1Button.SQUARE);
      if (gp.buttons[3]?.pressed)  buttons |= (1 << PS1Button.TRIANGLE);
      if (gp.buttons[4]?.pressed)  buttons |= (1 << PS1Button.L1);
      if (gp.buttons[5]?.pressed)  buttons |= (1 << PS1Button.R1);
      if (gp.buttons[6]?.pressed)  buttons |= (1 << PS1Button.L2);
      if (gp.buttons[7]?.pressed)  buttons |= (1 << PS1Button.R2);
      if (gp.buttons[9]?.pressed)  buttons |= (1 << PS1Button.START);
      if (gp.buttons[8]?.pressed)  buttons |= (1 << PS1Button.SELECT);
    }

    return { buttons, analogLX: 0, analogLY: 0 };
  }

  updateKeyMap(newMap: Record<string, string>) {
    this.keyMap = newMap;
    this.reverseMap = this.buildReverse();
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.pressed.clear();
  }
}
