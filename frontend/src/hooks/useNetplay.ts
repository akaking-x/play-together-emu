import { useState, useEffect, useRef, useCallback } from 'react';
import { PeerConnection, type PeerState } from '../netplay/peer';
import type { SignalingClient } from '../netplay/signaling';
import type { PeerInfo } from '../components/ConnectionStatus';

interface UseNetplayOptions {
  signalingClient: React.RefObject<SignalingClient | null>;
  localUserId: string;
  players: Array<{ userId: string; displayName: string }>;
  active: boolean; // true when game is starting
  isHost: boolean;
  onTrack?: (stream: MediaStream) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

export function useNetplay({ signalingClient, localUserId, players, active, isHost, onTrack }: UseNetplayOptions) {
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const [peerInfos, setPeerInfos] = useState<PeerInfo[]>([]);
  const onDataRef = useRef<((peerId: string, data: ArrayBuffer) => void) | null>(null);
  const onTrackRef = useRef(onTrack);
  onTrackRef.current = onTrack;

  const updatePeerInfo = useCallback((peerId: string, state: PeerState, latencyMs: number, displayName: string) => {
    setPeerInfos((prev) => {
      const existing = prev.find((p) => p.peerId === peerId);
      if (existing) {
        return prev.map((p) => p.peerId === peerId ? { ...p, state, latencyMs } : p);
      }
      return [...prev, { peerId, displayName, state, latencyMs }];
    });
  }, []);

  // Set up signaling relay for WebRTC
  useEffect(() => {
    if (!active || !signalingClient.current) return;

    const client = signalingClient.current;
    const remotePlayers = players.filter((p) => p.userId !== localUserId);

    // Save original callbacks
    const originalOnSignal = client.getCallback('onSignal');
    const originalOnICE = client.getCallback('onICE');

    // Create peer connections for all remote players
    for (const rp of remotePlayers) {
      if (peersRef.current.has(rp.userId)) continue;

      const peer = new PeerConnection(
        rp.userId,
        ICE_SERVERS,
        {
          onState: (state) => updatePeerInfo(rp.userId, state, peer.latencyMs, rp.displayName),
          onData: (data) => onDataRef.current?.(rp.userId, data),
          onLatency: (ms) => updatePeerInfo(rp.userId, peer.state, ms, rp.displayName),
          onTrack: (stream) => onTrackRef.current?.(stream),
        },
      );

      peer.onICE((candidate) => {
        client.sendICE(rp.userId, candidate.toJSON());
      });

      peersRef.current.set(rp.userId, peer);

      // Host always initiates the offer (with video transceiver so m-line is stable)
      if (isHost) {
        peer.setupSendVideo();
        peer.createOffer().then((offer) => {
          client.sendSignal(rp.userId, offer);
        });
      }
    }

    // Wire up signal handling
    const handleSignal = async (fromId: string, sdp: RTCSessionDescriptionInit) => {
      let peer = peersRef.current.get(fromId);
      if (!peer) {
        const rp = remotePlayers.find((p) => p.userId === fromId);
        peer = new PeerConnection(
          fromId,
          ICE_SERVERS,
          {
            onState: (state) => updatePeerInfo(fromId, state, peer!.latencyMs, rp?.displayName ?? fromId),
            onData: (data) => onDataRef.current?.(fromId, data),
            onLatency: (ms) => updatePeerInfo(fromId, peer!.state, ms, rp?.displayName ?? fromId),
            onTrack: (stream) => onTrackRef.current?.(stream),
          },
        );
        if (isHost) peer.setupSendVideo();
        peer.onICE((candidate) => {
          client.sendICE(fromId, candidate.toJSON());
        });
        peersRef.current.set(fromId, peer);
      }

      if (sdp.type === 'offer') {
        const answer = await peer.handleOffer(sdp);
        client.sendSignal(fromId, answer);
      } else if (sdp.type === 'answer') {
        await peer.handleAnswer(sdp);
      }

      originalOnSignal?.(fromId, sdp);
    };

    const handleICE = async (fromId: string, candidate: RTCIceCandidateInit) => {
      const peer = peersRef.current.get(fromId);
      if (peer) {
        await peer.addICE(candidate);
      }
      originalOnICE?.(fromId, candidate);
    };

    // Set new callbacks on signaling client
    client.setCallback('onSignal', handleSignal);
    client.setCallback('onICE', handleICE);

    return () => {
      // Restore original callbacks
      client.setCallback('onSignal', originalOnSignal);
      client.setCallback('onICE', originalOnICE);
    };
  }, [active, localUserId, players, signalingClient, updatePeerInfo, isHost]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const peer of peersRef.current.values()) {
        peer.destroy();
      }
      peersRef.current.clear();
    };
  }, []);

  const sendToAll = useCallback((data: ArrayBuffer) => {
    for (const peer of peersRef.current.values()) {
      peer.send(data);
    }
  }, []);

  const sendToPeer = useCallback((peerId: string, data: ArrayBuffer) => {
    const peer = peersRef.current.get(peerId);
    if (peer) peer.send(data);
  }, []);

  const setOnData = useCallback((cb: (peerId: string, data: ArrayBuffer) => void) => {
    onDataRef.current = cb;
  }, []);

  const replaceTrackOnAll = useCallback((stream: MediaStream) => {
    for (const peer of peersRef.current.values()) {
      peer.replaceVideoTrack(stream);
    }
  }, []);

  return {
    peerInfos,
    sendToAll,
    sendToPeer,
    setOnData,
    replaceTrackOnAll,
    peers: peersRef,
  };
}
