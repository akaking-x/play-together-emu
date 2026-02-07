import type { PS1Input } from '../emulator/input-mapper';

const BUFFER_SIZE = 256; // ring buffer capacity in frames

export class InputBuffer {
  private buffer: (PS1Input | null)[];
  private head = 0;

  constructor(size = BUFFER_SIZE) {
    this.buffer = new Array(size).fill(null);
  }

  set(frame: number, input: PS1Input): void {
    this.buffer[frame % this.buffer.length] = input;
    if (frame > this.head) this.head = frame;
  }

  get(frame: number): PS1Input | null {
    if (frame > this.head) return null;
    return this.buffer[frame % this.buffer.length] ?? null;
  }

  get latestFrame(): number {
    return this.head;
  }
}

export class RollbackEngine {
  private localBuffer = new InputBuffer();
  private remoteBuffers = new Map<string, InputBuffer>();

  localFrame = 0;
  remoteFrame = 0;

  private inputDelay = 2; // frames of input delay for smoother sync

  addLocalInput(frame: number, input: PS1Input): void {
    this.localBuffer.set(frame, input);
    this.localFrame = Math.max(this.localFrame, frame);
  }

  addRemoteInput(peerId: string, frame: number, input: PS1Input): void {
    let buf = this.remoteBuffers.get(peerId);
    if (!buf) {
      buf = new InputBuffer();
      this.remoteBuffers.set(peerId, buf);
    }
    buf.set(frame, input);

    // Track the minimum latest frame across all remote peers
    let minRemote = Infinity;
    for (const rb of this.remoteBuffers.values()) {
      minRemote = Math.min(minRemote, rb.latestFrame);
    }
    if (minRemote !== Infinity) {
      this.remoteFrame = minRemote;
    }
  }

  getLocalInput(frame: number): PS1Input {
    return this.localBuffer.get(frame) ?? { buttons: 0, analogLX: 0, analogLY: 0 };
  }

  getInput(peerId: string, frame: number): PS1Input {
    const buf = this.remoteBuffers.get(peerId);
    if (!buf) return { buttons: 0, analogLX: 0, analogLY: 0 };

    const input = buf.get(frame);
    if (input) return input;

    // Prediction: repeat last known input
    const lastFrame = buf.latestFrame;
    if (lastFrame >= 0) {
      const last = buf.get(lastFrame);
      if (last) return last;
    }

    return { buttons: 0, analogLX: 0, analogLY: 0 };
  }

  shouldRollback(): boolean {
    // In delay-based mode, we wait for remote inputs rather than rolling back
    // Rollback is needed when we predicted wrong and actual remote input arrived
    return this.remoteFrame < this.localFrame - this.inputDelay;
  }

  get frameAdvantage(): number {
    return this.localFrame - this.remoteFrame;
  }

  get delay(): number {
    return this.inputDelay;
  }

  set delay(d: number) {
    this.inputDelay = Math.max(0, Math.min(d, 10));
  }

  reset(): void {
    this.localBuffer = new InputBuffer();
    this.remoteBuffers.clear();
    this.localFrame = 0;
    this.remoteFrame = 0;
  }
}
