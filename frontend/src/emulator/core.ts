// EmulatorJS WASM wrapper for Beetle PSX (Mednafen) core
// EmulatorJS manages its own DOM inside a container div

export type EmulatorState = 'idle' | 'loading' | 'running' | 'paused' | 'error';

export interface EmulatorCallbacks {
  onFrame?: (frameNumber: number) => void;
  onStateChange?: (state: EmulatorState) => void;
  onError?: (error: string) => void;
}

declare global {
  interface Window {
    EJS_player: string;
    EJS_core: string;
    EJS_gameUrl: string;
    EJS_pathtodata: string;
    EJS_startOnLoaded: boolean;
    EJS_DEBUG: boolean;
    EJS_biosUrl: string;
    EJS_emulator: EmulatorJSInstance | undefined;
    EJS_onGameStart?: () => void;
    EJS_onLoadState?: () => void;
    EJS_onSaveState?: () => void;
  }
}

interface EmulatorJSInstance {
  gameManager: {
    saveSaveFiles: () => void;
    loadSaveFiles: () => void;
    getState: () => Uint8Array;
    loadState: (data: Uint8Array) => void;
    simulateInput: (player: number, index: number, value: number) => void;
  };
  pause: () => void;
  play: () => void;
  elements: {
    canvas: HTMLCanvasElement;
  };
}

export class EmulatorCore {
  private state: EmulatorState = 'idle';
  private instance: EmulatorJSInstance | null = null;
  private callbacks: EmulatorCallbacks;
  private frameCount = 0;
  private animFrameId: number | null = null;

  constructor(callbacks: EmulatorCallbacks = {}) {
    this.callbacks = callbacks;
  }

  getState(): EmulatorState {
    return this.state;
  }

  private setState(newState: EmulatorState) {
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
  }

  async init(containerId: string, romUrl: string, biosUrl?: string): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot init in state: ${this.state}`);
    }

    this.setState('loading');

    try {
      // Configure EmulatorJS globals before loading the script
      window.EJS_player = `#${containerId}`;
      window.EJS_core = 'psx';
      window.EJS_gameUrl = romUrl;
      window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
      window.EJS_startOnLoaded = true;
      window.EJS_DEBUG = false;

      if (biosUrl) {
        window.EJS_biosUrl = biosUrl;
      }

      // Set up game start callback
      window.EJS_onGameStart = () => {
        this.instance = window.EJS_emulator || null;
        this.setState('running');
        this.startFrameLoop();
      };

      // Check if EmulatorJS script is already loaded in the DOM
      const existingScript = document.querySelector(
        'script[src*="cdn.emulatorjs.org"][src*="loader.js"]'
      );
      if (existingScript) {
        // Remove old script and related elements so EmulatorJS reinitializes
        existingScript.remove();
      }

      // Load EmulatorJS loader script
      await this.loadScript('https://cdn.emulatorjs.org/stable/data/loader.js');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to init emulator';
      this.setState('error');
      this.callbacks.onError?.(msg);
      throw err;
    }
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.body.appendChild(script);
    });
  }

  private startFrameLoop() {
    const tick = () => {
      if (this.state !== 'running') return;
      this.frameCount++;
      this.callbacks.onFrame?.(this.frameCount);
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  start() {
    if (!this.instance) return;
    this.instance.play();
    this.setState('running');
    this.startFrameLoop();
  }

  pause() {
    if (!this.instance) return;
    this.instance.pause();
    this.setState('paused');
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  resume() {
    if (!this.instance || this.state !== 'paused') return;
    this.start();
  }

  saveState(): Uint8Array | null {
    if (!this.instance) return null;
    try {
      return this.instance.gameManager.getState();
    } catch {
      this.callbacks.onError?.('Failed to save state');
      return null;
    }
  }

  loadState(data: Uint8Array): boolean {
    if (!this.instance) return false;
    try {
      this.instance.gameManager.loadState(data);
      return true;
    } catch {
      this.callbacks.onError?.('Failed to load state');
      return false;
    }
  }

  setInput(port: number, buttons: number) {
    if (!this.instance) return;
    const gm = this.instance.gameManager;
    for (let i = 0; i < 14; i++) {
      const pressed = (buttons & (1 << i)) !== 0 ? 1 : 0;
      gm.simulateInput(port, i, pressed);
    }
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  destroy() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // Clean up EmulatorJS globals
    delete window.EJS_onGameStart;
    delete window.EJS_onLoadState;
    delete window.EJS_onSaveState;
    window.EJS_emulator = undefined;

    this.instance = null;
    this.frameCount = 0;
    this.setState('idle');
  }
}
