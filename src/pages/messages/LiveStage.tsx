/**
 * 라이브 시연 메인 스테이지 — 줌 방식
 * - 활성 라이브 세션이 있을 때 채팅 영역 대신 가운데 전체에 표시
 * - 시연자: 본인 미리보기 비디오 + 시청자 수 + 종료 버튼
 * - 시청자: 시연자 stream 비디오 + 음소거 토글
 */
import { useEffect, useRef, useState } from 'react';
import {
  HiOutlineX,
  HiOutlineUsers,
  HiOutlineVolumeUp,
  HiOutlineVolumeOff,
  HiOutlineArrowsExpand,
} from 'react-icons/hi';
import { useScreenShareViewer } from '@/hooks/useScreenShareViewer';
import type { LiveSessionRecord } from '@/firebase/liveSessions';

interface LiveStageProps {
  session: LiveSessionRecord;
  myUid: string;
  /** 시연자 본인의 미리보기 stream */
  broadcasterPreviewStream?: MediaStream | null;
  /** 시연자 본인의 시청자 수 */
  broadcasterViewerCount?: number;
  /** 시연자 종료 핸들러 */
  onStopBroadcast?: () => void;
  C: any;
}

export default function LiveStage(props: LiveStageProps) {
  const { session, myUid, broadcasterPreviewStream, broadcasterViewerCount, onStopBroadcast, C } = props;
  const isMyBroadcast = session.broadcasterUid === myUid;

  if (isMyBroadcast) {
    return (
      <BroadcasterStage
        stream={broadcasterPreviewStream || null}
        viewerCount={broadcasterViewerCount || 0}
        onStop={onStopBroadcast}
        C={C}
      />
    );
  }
  return <ViewerStage session={session} viewerUid={myUid} C={C} />;
}

// ===========================================================
// 시연자 — 메인 스테이지 미리보기
// ===========================================================
function BroadcasterStage({
  stream,
  viewerCount,
  onStop,
  C,
}: {
  stream: MediaStream | null;
  viewerCount: number;
  onStop?: () => void;
  C: any;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <StageShell
      C={C}
      header={
        <>
          <span style={liveBadgeStyle()}>● LIVE</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>내가 시연 중</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: C.textSecondary }}>
            <HiOutlineUsers size={16} /> {viewerCount}명 시청
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => {
              console.log('[LiveStage 종료 버튼 클릭]', { hasOnStop: typeof onStop === 'function' });
              if (onStop) onStop();
              else alert('종료 핸들러가 연결되지 않았습니다.');
            }}
            style={stopBtnStyle()}
          >
            <HiOutlineX size={14} /> 종료
          </button>
        </>
      }
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={videoStyle()}
      />
    </StageShell>
  );
}

// ===========================================================
// 시청자 — 메인 스테이지 비디오
// ===========================================================
function ViewerStage({
  session,
  viewerUid,
  C,
}: {
  session: LiveSessionRecord;
  viewerUid: string;
  C: any;
}) {
  const { remoteStream, isConnected, error, sessionEnded } = useScreenShareViewer({
    sessionId: session.id,
    viewerUid,
    autoJoin: true,
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  // 브라우저 autoplay 정책: 사운드 있는 stream은 muted로 시작해야 자동 재생됨
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      console.log('[viewer] remoteStream 수신', {
        videoTracks: remoteStream.getVideoTracks().length,
        audioTracks: remoteStream.getAudioTracks().length,
        videoTrackEnabled: remoteStream.getVideoTracks()[0]?.enabled,
        videoTrackReadyState: remoteStream.getVideoTracks()[0]?.readyState,
      });
      videoRef.current.srcObject = remoteStream;
      // 명시적으로 play() 호출 (autoplay 보조)
      videoRef.current.play().catch((err) => {
        console.warn('[viewer] video.play() 실패 (사용자 클릭 필요할 수 있음)', err);
      });
    }
  }, [remoteStream]);

  if (sessionEnded) {
    return (
      <StageShell
        C={C}
        header={
          <span style={{ fontSize: 14, color: C.textSecondary }}>시연이 종료되었습니다.</span>
        }
      >
        <div style={{ ...videoStyle(), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          종료됨
        </div>
      </StageShell>
    );
  }

  const requestFullscreen = () => {
    const el = videoRef.current as any;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  };

  return (
    <StageShell
      C={C}
      header={
        <>
          <span style={liveBadgeStyle()}>● LIVE</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
            {session.broadcasterName || '상대방'}님이 시연 중
          </span>
          <span style={{
            fontSize: 12,
            color: isConnected ? C.success : C.textSecondary,
          }}>
            {isConnected ? '● 연결됨' : error ? `● ${error}` : '● 연결 중...'}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setMuted((v) => !v)} style={ghostBtnStyle(C)} title={muted ? '음소거 해제' : '음소거'}>
            {muted ? <HiOutlineVolumeOff size={16} /> : <HiOutlineVolumeUp size={16} />}
          </button>
          <button onClick={requestFullscreen} style={ghostBtnStyle(C)} title="전체화면">
            <HiOutlineArrowsExpand size={16} />
          </button>
        </>
      }
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        controls={false}
        style={videoStyle()}
      />
    </StageShell>
  );
}

// ===========================================================
// 공통 셸 — 헤더 + 비디오 풀스테이지
// ===========================================================
function StageShell({ C, header, children }: { C: any; header: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#000',
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: '12px 20px',
          background: C.chatHeaderBg,
          borderBottom: `1px solid ${C.sidebarBorder}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {header}
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ===========================================================
// 스타일 유틸
// ===========================================================
function videoStyle(): React.CSSProperties {
  return {
    width: '100%',
    height: '100%',
    maxHeight: '100%',
    borderRadius: 8,
    background: '#000',
    objectFit: 'contain',
  };
}

function liveBadgeStyle(): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 4,
    background: '#ff3d60',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
  };
}

function ghostBtnStyle(C: any): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px',
    background: 'transparent',
    border: `1px solid ${C.sidebarBorder}`,
    borderRadius: 6,
    color: C.text,
    fontSize: 12,
    cursor: 'pointer',
  };
}

function stopBtnStyle(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    background: '#ff3d60',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };
}
