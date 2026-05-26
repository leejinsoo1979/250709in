/**
 * 시청자(viewer) 훅 — 라이브 세션 참여, 시연자 stream 수신
 *
 * 동작:
 * 1. join() → Firestore에 viewer 문서 생성 → 시연자가 PeerConnection 생성 + offer 전송
 * 2. signals 구독 → offer 수신 → answer 생성/전송
 * 3. ICE candidate 양방향 교환
 * 4. ontrack → MediaStream 수신 → 비디오 엘리먼트로 전달
 * 5. leave() → PeerConnection close + viewer 문서 삭제
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  joinAsViewer,
  leaveAsViewer,
  subscribeSignals,
  sendSignal,
  subscribeLiveSession,
  DEFAULT_ICE_SERVERS,
} from '@/firebase/liveSessions';

export interface UseScreenShareViewerOptions {
  sessionId: string;
  viewerUid: string;
  /** 자동 join (기본 true) */
  autoJoin?: boolean;
}

export interface ViewerState {
  isConnected: boolean;
  isJoined: boolean;
  error: string | null;
  remoteStream: MediaStream | null;
  /** 시연자가 세션을 종료했는지 */
  sessionEnded: boolean;
}

export function useScreenShareViewer(opts: UseScreenShareViewerOptions) {
  const { sessionId, viewerUid, autoJoin = true } = opts;

  const [state, setState] = useState<ViewerState>({
    isConnected: false,
    isJoined: false,
    error: null,
    remoteStream: null,
    sessionEnded: false,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const signalUnsubRef = useRef<(() => void) | null>(null);
  const sessionUnsubRef = useRef<(() => void) | null>(null);
  // ICE candidate가 setRemoteDescription 전에 도착할 수 있으므로 큐
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  const cleanup = useCallback(() => {
    if (signalUnsubRef.current) { try { signalUnsubRef.current(); } catch {} signalUnsubRef.current = null; }
    if (sessionUnsubRef.current) { try { sessionUnsubRef.current(); } catch {} sessionUnsubRef.current = null; }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    pendingIceRef.current = [];
  }, []);

  /** 시청 시작 (join) */
  const join = useCallback(async () => {
    if (state.isJoined) return;
    setState((s) => ({ ...s, error: null }));

    try {
      // PeerConnection 준비 (receive only)
      const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
      pcRef.current = pc;

      // 시연자로부터 받는 stream
      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          setState((s) => ({ ...s, remoteStream: stream }));
        }
      };

      // ICE → 시연자로 전송
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({
            sessionId,
            viewerUid,
            fromUid: viewerUid,
            kind: 'ice-viewer',
            payload: event.candidate.toJSON(),
          }).catch((err) => console.warn('[viewer] ICE 전송 실패', err));
        }
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        setState((s) => ({ ...s, isConnected: st === 'connected' }));
        if (st === 'failed') {
          setState((s) => ({ ...s, error: '연결 실패' }));
        }
      };

      // signals 구독 — 시연자 offer + ICE 수신
      signalUnsubRef.current = subscribeSignals({
        sessionId,
        viewerUid,
        myUid: viewerUid,
        cb: async (signal) => {
          try {
            if (signal.kind === 'offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
              // 큐에 쌓인 ICE 처리
              for (const ice of pendingIceRef.current) {
                try { await pc.addIceCandidate(new RTCIceCandidate(ice)); } catch (e) { console.warn(e); }
              }
              pendingIceRef.current = [];

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await sendSignal({
                sessionId,
                viewerUid,
                fromUid: viewerUid,
                kind: 'answer',
                payload: { type: answer.type, sdp: answer.sdp },
              });
            } else if (signal.kind === 'ice-broadcaster') {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
              } else {
                pendingIceRef.current.push(signal.payload);
              }
            }
          } catch (err) {
            console.warn('[viewer] signal 처리 실패', signal.kind, err);
          }
        },
      });

      // 세션 상태 구독 — 시연자가 종료하면 자동 leave
      sessionUnsubRef.current = subscribeLiveSession(sessionId, (rec) => {
        if (!rec || rec.status === 'ended') {
          setState((s) => ({ ...s, sessionEnded: true, isConnected: false }));
          cleanup();
        }
      });

      // viewer 문서 생성 → 시연자에게 알림 (이 시점에 broadcaster가 offer 전송 시작)
      await joinAsViewer(sessionId, viewerUid);
      setState((s) => ({ ...s, isJoined: true }));
    } catch (err: any) {
      console.error('[viewer] join 실패', err);
      setState((s) => ({ ...s, error: err?.message || '시청 시작 실패' }));
      cleanup();
    }
  }, [state.isJoined, sessionId, viewerUid, cleanup]);

  /** 시청 종료 (leave) */
  const leave = useCallback(async () => {
    cleanup();
    try {
      await leaveAsViewer(sessionId, viewerUid);
    } catch (e) {
      console.warn('[viewer] leave 실패', e);
    }
    setState({
      isConnected: false,
      isJoined: false,
      error: null,
      remoteStream: null,
      sessionEnded: false,
    });
  }, [sessionId, viewerUid, cleanup]);

  // autoJoin
  useEffect(() => {
    if (autoJoin && sessionId && viewerUid && !state.isJoined) {
      join();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, sessionId, viewerUid]);

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      cleanup();
      // viewer 문서 정리 (fire-and-forget)
      leaveAsViewer(sessionId, viewerUid).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, join, leave };
}
