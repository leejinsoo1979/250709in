/**
 * 시연자(broadcaster) 훅 — 화면공유 시작, 다중 시청자 PeerConnection 관리
 *
 * 동작:
 * 1. start() → getDisplayMedia (+ getUserMedia 마이크) → Firestore에 세션 생성
 * 2. viewers 서브컬렉션을 구독 → 새 시청자 join 시 PeerConnection 생성 → offer 전송
 * 3. 각 시청자별 signals 구독 → answer 수신 → setRemoteDescription
 * 4. ICE candidate 양방향 교환
 * 5. stop() → 모든 PeerConnection close + tracks stop + 세션 종료
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startLiveSession,
  endLiveSession,
  subscribeViewers,
  subscribeSignals,
  sendSignal,
  DEFAULT_ICE_SERVERS,
} from '@/firebase/liveSessions';

export interface UseScreenShareBroadcastOptions {
  convId: string;
  broadcasterUid: string;
  broadcasterName?: string;
  /** 마이크 음성 포함 (기본 true) */
  includeMicrophone?: boolean;
  /** 시스템 오디오 (화면 공유 시) 포함 (기본 true) */
  includeSystemAudio?: boolean;
  onSessionStarted?: (sessionId: string) => void | Promise<void>;
  onSessionStopped?: (sessionId: string) => void | Promise<void>;
}

export interface BroadcastState {
  isLive: boolean;
  sessionId: string | null;
  error: string | null;
  viewerCount: number;
  /** 시연자 자신의 미리보기용 stream */
  previewStream: MediaStream | null;
}

export function useScreenShareBroadcast(opts: UseScreenShareBroadcastOptions) {
  const {
    convId,
    broadcasterUid,
    broadcasterName,
    includeMicrophone = true,
    includeSystemAudio = true,
    onSessionStarted,
    onSessionStopped,
  } = opts;

  const [state, setState] = useState<BroadcastState>({
    isLive: false,
    sessionId: null,
    error: null,
    viewerCount: 0,
    previewStream: null,
  });

  const sessionIdRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  // viewerUid → RTCPeerConnection
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // viewerUid → unsubscribe
  const signalUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const viewersUnsubRef = useRef<(() => void) | null>(null);
  const stoppingRef = useRef(false);

  /** 특정 viewer에 대한 PeerConnection 생성 + offer 전송 */
  const createPeerForViewer = useCallback(async (viewerUid: string) => {
    const sessionId = sessionIdRef.current;
    const stream = streamRef.current;
    if (!sessionId || !stream) return;
    if (peerConnectionsRef.current.has(viewerUid)) return; // 중복 방지

    const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
    peerConnectionsRef.current.set(viewerUid, pc);

    // 모든 track 추가 (화면 비디오 + 시스템 오디오 + 마이크)
    stream.getTracks().forEach((track) => {
      try {
        const sender = pc.addTrack(track, stream);
        if (track.kind === 'video') {
          track.contentHint = 'detail';
          const params = sender.getParameters();
          params.encodings = params.encodings && params.encodings.length > 0 ? params.encodings : [{}];
          params.encodings[0].maxBitrate = 6_000_000;
          params.encodings[0].maxFramerate = 30;
          (params as any).degradationPreference = 'balanced';
          void sender.setParameters(params).catch((err) => {
            console.warn('[broadcast] video sender 저지연 파라미터 적용 실패', err);
          });
        }
      } catch (e) {
        console.warn('[broadcast] addTrack 실패', e);
      }
    });

    // ICE candidate → 시청자로 전송
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          sessionId,
          viewerUid,
          fromUid: broadcasterUid,
          kind: 'ice-broadcaster',
          payload: event.candidate.toJSON(),
        }).catch((err) => console.warn('[broadcast] ICE 전송 실패', err));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        const existing = peerConnectionsRef.current.get(viewerUid);
        if (existing) {
          try { existing.close(); } catch { /* noop */ }
          peerConnectionsRef.current.delete(viewerUid);
        }
      }
    };

    // offer 생성/전송
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal({
        sessionId,
        viewerUid,
        fromUid: broadcasterUid,
        kind: 'offer',
        payload: { type: offer.type, sdp: offer.sdp },
      });
    } catch (err) {
      console.error('[broadcast] offer 생성/전송 실패', err);
    }

    // 시청자로부터 answer + ICE 수신
    const unsub = subscribeSignals({
      sessionId,
      viewerUid,
      myUid: broadcasterUid,
      cb: async (signal) => {
        try {
          if (signal.kind === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
          } else if (signal.kind === 'ice-viewer') {
            await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
          }
        } catch (err) {
          console.warn('[broadcast] signal 처리 실패', signal.kind, err);
        }
      },
    });
    signalUnsubsRef.current.set(viewerUid, unsub);
  }, [broadcasterUid]);

  /** 시연 시작 */
  const start = useCallback(async (): Promise<string | null> => {
    if (state.isLive) return sessionIdRef.current;
    setState((s) => ({ ...s, error: null }));

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setState((s) => ({ ...s, error: '이 브라우저는 화면 공유를 지원하지 않습니다.' }));
      return null;
    }

    let displayStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;
    try {
      // 화면 캡처: 화면 글자/선명도를 위해 1080p를 유지하고 FPS/비트레이트로 지연을 제어
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          // @ts-expect-error cursor는 표준 외 옵션이지만 Chrome/Edge 지원
          cursor: 'always',
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
        },
        audio: includeSystemAudio,
      });
      displayStream.getVideoTracks().forEach((track) => {
        track.contentHint = 'detail';
      });

      // 마이크 추가
      if (includeMicrophone) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          micStream.getAudioTracks().forEach((track) => {
            displayStream!.addTrack(track);
          });
        } catch (micErr) {
          console.warn('[broadcast] 마이크 권한 거부 또는 실패 — 화면만 공유', micErr);
        }
      }

      streamRef.current = displayStream;
      micStreamRef.current = micStream;

      // 사용자가 브라우저 화면 공유창에서 "중지" 누르면 자동 종료
      displayStream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          stop(sessionIdRef.current || undefined);
        };
      });

      // 세션 생성
      const sessionId = await startLiveSession({
        convId,
        broadcasterUid,
        broadcasterName,
      });
      sessionIdRef.current = sessionId;

      setState({
        isLive: true,
        sessionId,
        error: null,
        viewerCount: 0,
        previewStream: displayStream,
      });

      // viewers 구독 → 새 시청자 join 시 PeerConnection 생성
      viewersUnsubRef.current = subscribeViewers(sessionId, (viewerUids) => {
        setState((s) => ({ ...s, viewerCount: viewerUids.length }));

        // 신규 시청자에 대해 PeerConnection 생성
        viewerUids.forEach((viewerUid) => {
          if (!peerConnectionsRef.current.has(viewerUid)) {
            createPeerForViewer(viewerUid);
          }
        });

        // 떠난 시청자 정리
        const currentSet = new Set(viewerUids);
        Array.from(peerConnectionsRef.current.keys()).forEach((existingUid) => {
          if (!currentSet.has(existingUid)) {
            const pc = peerConnectionsRef.current.get(existingUid);
            try { pc?.close(); } catch {}
            peerConnectionsRef.current.delete(existingUid);
            const unsub = signalUnsubsRef.current.get(existingUid);
            if (unsub) { try { unsub(); } catch {} signalUnsubsRef.current.delete(existingUid); }
          }
        });
      });
      if (onSessionStarted) {
        try {
          await onSessionStarted(sessionId);
        } catch (err) {
          console.warn('[broadcast] 시작 알림 전송 실패', err);
        }
      }
      return sessionId;
    } catch (err: any) {
      console.error('[broadcast] start 실패', err);
      // 권한 거부 시 displayStream 정리
      if (displayStream) {
        displayStream.getTracks().forEach((t) => t.stop());
      }
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
      }
      const msg = err?.name === 'NotAllowedError'
        ? '화면 공유 권한이 거부되었습니다.'
        : (err?.message || '화면 공유를 시작할 수 없습니다.');
      setState((s) => ({ ...s, error: msg, isLive: false, previewStream: null }));
      return null;
    }
  }, [
    state.isLive,
    convId,
    broadcasterUid,
    broadcasterName,
    includeMicrophone,
    includeSystemAudio,
    createPeerForViewer,
    onSessionStarted,
  ]);

  /** 시연 종료 */
  const stop = useCallback(async (targetSessionId?: string) => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const sessionId = targetSessionId || sessionIdRef.current;
    console.log('[broadcast.stop] 시작', { sessionId });

    try {
      // viewers 구독 해제
      if (viewersUnsubRef.current) {
        try { viewersUnsubRef.current(); } catch {}
        viewersUnsubRef.current = null;
      }

      // 모든 signal 구독 해제
      signalUnsubsRef.current.forEach((unsub) => { try { unsub(); } catch {} });
      signalUnsubsRef.current.clear();

      // 모든 PeerConnection close
      peerConnectionsRef.current.forEach((pc) => { try { pc.close(); } catch {} });
      peerConnectionsRef.current.clear();

      // tracks stop
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        streamRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        micStreamRef.current = null;
      }

      // 세션 종료 마킹
      if (sessionId) {
        try {
          await endLiveSession(sessionId);
        } catch (err) {
          console.error('[broadcast.stop] 세션 종료 마킹 실패', err);
          setState((s) => ({ ...s, error: '라이브 세션 종료 처리에 실패했습니다.' }));
        }
        if (onSessionStopped) {
          try {
            await onSessionStopped(sessionId);
          } catch (err) {
            console.warn('[broadcast.stop] 종료 알림 전송 실패', err);
          }
        }
      }
    } finally {
      sessionIdRef.current = null;

      setState({
        isLive: false,
        sessionId: null,
        error: null,
        viewerCount: 0,
        previewStream: null,
      });
      stoppingRef.current = false;
    }
  }, [onSessionStopped]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      // 비동기지만 fire-and-forget
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, start, stop };
}
