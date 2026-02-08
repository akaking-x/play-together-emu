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
    // Netplay globals
    EJS_gameID?: number;
    EJS_netplayServer?: string;
    EJS_netplayICEServers?: RTCIceServer[];
  }
}

export interface NetplayConfig {
  gameId: number;
  serverUrl: string;
  iceServers: RTCIceServer[];
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
  on?: (event: string, callback: () => void) => void;
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
  private origGetContext: typeof HTMLCanvasElement.prototype.getContext | null = null;

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

  async init(containerId: string, romUrl: string, biosUrl?: string, netplay?: NetplayConfig): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot init in state: ${this.state}`);
    }

    this.setState('loading');

    try {
      // Force preserveDrawingBuffer on WebGL contexts so captureStream() works.
      // Without this, captureStream on a WebGL canvas produces black frames.
      this.patchWebGLContext();

      // Configure EmulatorJS globals before loading the script
      window.EJS_player = `#${containerId}`;
      window.EJS_core = 'psx';
      window.EJS_gameUrl = romUrl;
      window.EJS_pathtodata = '/emulatorjs/data/';
      window.EJS_startOnLoaded = true;
      window.EJS_DEBUG = false;

      if (biosUrl) {
        window.EJS_biosUrl = biosUrl;
      }

      // Configure netplay if provided
      if (netplay) {
        window.EJS_gameID = netplay.gameId;
        window.EJS_netplayServer = netplay.serverUrl;
        window.EJS_netplayICEServers = netplay.iceServers;
      }

      // Set up game start callback
      window.EJS_onGameStart = () => {
        this.instance = window.EJS_emulator || null;
        this.setState('running');
        this.startFrameLoop();
      };

      // If EmulatorJS class is already loaded (from a previous game session),
      // create a new instance directly instead of re-loading the script
      // (re-loading causes "EJS_STORAGE has already been declared" error)
      const EJSClass = (window as any).EmulatorJS;
      if (EJSClass) {
        const config = this.buildEJSConfig();
        window.EJS_emulator = new EJSClass(window.EJS_player, config);
        if (typeof window.EJS_onGameStart === 'function') {
          window.EJS_emulator!.on?.('start', window.EJS_onGameStart);
        }
      } else {
        // First load — use loader.js to load emulator.min.js + CSS
        await this.loadScript('/emulatorjs/data/loader.js');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to init emulator';
      this.setState('error');
      this.callbacks.onError?.(msg);
      throw err;
    }
  }

  private buildEJSConfig(): Record<string, any> {
    const scriptPath = window.EJS_pathtodata || '/emulatorjs/data/';
    return {
      gameUrl: window.EJS_gameUrl,
      dataPath: scriptPath,
      system: window.EJS_core,
      biosUrl: window.EJS_biosUrl,
      startOnLoad: window.EJS_startOnLoaded,
      netplayUrl: (window as any).EJS_netplayServer,
      gameId: (window as any).EJS_gameID,
      volume: 0.5,
    };
  }

  private patchWebGLContext(): void {
    if (this.origGetContext) return; // Already patched
    const orig = HTMLCanvasElement.prototype.getContext;
    this.origGetContext = orig;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      attrs?: any,
    ): any {
      if (type === 'webgl' || type === 'webgl2') {
        attrs = { ...attrs, preserveDrawingBuffer: true };
      }
      return orig.call(this, type, attrs);
    } as any;
  }

  private unpatchWebGLContext(): void {
    if (this.origGetContext) {
      HTMLCanvasElement.prototype.getContext = this.origGetContext;
      this.origGetContext = null;
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

  // Map from PS1Button bit position to EmulatorJS (RetroArch) button index:
  // RetroArch: B=0, Y=1, SELECT=2, START=3, UP=4, DOWN=5, LEFT=6, RIGHT=7, A=8, X=9, L=10, R=11, L2=12, R2=13
  // PS1Button: UP=0, DOWN=1, LEFT=2, RIGHT=3, CROSS=4, CIRCLE=5, SQUARE=6, TRIANGLE=7, L1=8, R1=9, L2=10, R2=11, START=12, SELECT=13
  private static readonly PS1_TO_EJS: readonly number[] = [4, 5, 6, 7, 0, 8, 1, 9, 10, 11, 12, 13, 3, 2] as const;

  setInput(port: number, buttons: number) {
    if (!this.instance) return;
    const gm = this.instance.gameManager;
    for (let i = 0; i < 14; i++) {
      const pressed = (buttons & (1 << i)) !== 0 ? 1 : 0;
      gm.simulateInput(port, EmulatorCore.PS1_TO_EJS[i]!, pressed);
    }
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.instance?.elements.canvas ?? null;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  destroy() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // Restore original getContext
    this.unpatchWebGLContext();

    // Stop EmulatorJS: pause emulation, close netplay, close audio
    try {
      const emu = window.EJS_emulator as any;
      if (emu) {
        // Pause the emulator to stop frame loop and audio output
        emu.pause?.();
        // Close netplay connection
        if (emu.netplay) {
          emu.netplay.close?.();
        }
        // Close the AudioContext to stop all audio
        if (emu.audioContext) {
          emu.audioContext.close?.();
        }
        // Also try the gameManager's Module audio context
        if (emu.gameManager?.Module?.SDL2?.audioContext) {
          emu.gameManager.Module.SDL2.audioContext.close?.();
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    // Clean up EmulatorJS globals
    delete window.EJS_onGameStart;
    delete window.EJS_onLoadState;
    delete window.EJS_onSaveState;
    window.EJS_emulator = undefined;

    // Clean up netplay globals
    delete window.EJS_gameID;
    delete window.EJS_netplayServer;
    delete window.EJS_netplayICEServers;

    this.instance = null;
    this.frameCount = 0;
    this.setState('idle');
  }
}
