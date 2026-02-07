export type PeerState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface PeerCallbacks {
  onState: (s: PeerState) => void;
  onData: (data: ArrayBuffer) => void;
  onLatency: (ms: number) => void;
  onTrack?: (stream: MediaStream) => void;
  onNegotiationNeeded?: (desc: RTCSessionDescription) => void;
}

export class PeerConnection {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  state: PeerState = 'new';
  latencyMs = 0;

  constructor(
    public readonly peerId: string,
    private readonly _iceServers: RTCIceServer[],
    private callbacks: PeerCallbacks,
  ) {
    this.pc = new RTCPeerConnection({ iceServers: this._iceServers, iceCandidatePoolSize: 2 });
    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') this.setState('connected');
      else if (s === 'disconnected') this.setState('disconnected');
      else if (s === 'failed') this.setState('failed');
    };

    // Handle incoming video tracks from remote peer
    this.pc.ontrack = (e) => {
      if (e.streams[0]) this.callbacks.onTrack?.(e.streams[0]);
    };

    // Handle renegotiation (triggered when host adds video track after initial connection)
    this.pc.onnegotiationneeded = async () => {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      if (this.pc.localDescription) {
        this.callbacks.onNegotiationNeeded?.(this.pc.localDescription);
      }
    };
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dc = this.pc.createDataChannel('game', { ordered: true, maxRetransmits: 2 });
    this.setupDC(this.dc);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.pc.ondatachannel = (e) => {
      this.dc = e.channel;
      this.setupDC(this.dc);
    };
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(answer);
  }

  async addICE(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(candidate);
  }

  onICE(cb: (c: RTCIceCandidate) => void): void {
    this.pc.onicecandidate = (e) => {
      if (e.candidate) cb(e.candidate);
    };
  }

  send(data: ArrayBuffer): boolean {
    if (this.dc?.readyState !== 'open') return false;
    this.dc.send(data);
    return true;
  }

  private setupDC(dc: RTCDataChannel): void {
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      this.setState('connected');
      this.startPing();
    };
    dc.onclose = () => this.setState('disconnected');
    dc.onmessage = (e) => {
      const d = e.data as ArrayBuffer;
      const marker = new Uint8Array(d)[0];
      if (marker === 0xFF || marker === 0xFE) {
        this.handlePing(d);
        return;
      }
      this.callbacks.onData(d);
    };
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.dc?.readyState !== 'open') return;
      const buf = new ArrayBuffer(9);
      const v = new DataView(buf);
      v.setUint8(0, 0xFF);
      v.setFloat64(1, performance.now(), true);
      this.dc.send(buf);
    }, 1000);
  }

  private handlePing(data: ArrayBuffer): void {
    if (data.byteLength < 9) return; // need 1 marker + 8 float64
    const v = new DataView(data);
    if (v.getUint8(0) === 0xFF) {
      // Ping received -> respond with pong
      const buf = new ArrayBuffer(9);
      const pv = new DataView(buf);
      pv.setUint8(0, 0xFE);
      pv.setFloat64(1, v.getFloat64(1, true), true);
      this.dc!.send(buf);
    } else {
      // Pong received -> calculate latency
      this.latencyMs = Math.round((performance.now() - v.getFloat64(1, true)) / 2);
      this.callbacks.onLatency(this.latencyMs);
    }
  }

  private setState(s: PeerState): void {
    if (this.state === s) return;
    this.state = s;
    this.callbacks.onState(s);
  }

  addStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream);
    }
  }

  destroy(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.dc?.close();
    this.pc.close();
  }
}
