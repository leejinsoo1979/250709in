/**
 * 라이브 시연 패널 — 채팅창 상단에 표시
 * - 시연자 본인: 미리보기 + 시청자 수 + 종료 버튼
 * - 시청자: 인라인 비디오 플레이어 (자동 join)
 */
import { useEffect, useRef, useState } from 'react';
import { HiOutlineX, HiOutlineUsers, HiOutlineVolumeUp, HiOutlineVolumeOff } from 'react-icons/hi';
import { useScreenShareViewer } from '@/hooks/useScreenShareViewer';
import type { LiveSessionRecord } from '@/firebase/liveSessions';

interface LiveSessionPanelProps {
  session: LiveSessionRecord;
  myUid: string;
  /** 시연자가 본인일 때 미리보기용 stream */
  broadcasterPreviewStream?: MediaStream | null;
  /** 시연자가 본인일 때 시청자 수 */
  broadcasterViewerCount?: number;
  /** 시연자가 본인일 때 종료 핸들러 */
  onStopBroadcast?: () => void;
  C: any;
}

export default function LiveSessionPanel(props: LiveSessionPanelProps) {
  const { session, myUid, broadcasterPreviewStream, broadcasterViewerCount, onStopBroadcast, C } = props;
  const isMyBroadcast = session.broadcasterUid === myUid;

  if (isMyBroadcast) {
    return (
      <BroadcasterPreview
        stream={broadcasterPreviewStream || null}
        viewerCount={broadcasterViewerCount || 0}
        onStop={onStopBroadcast}
        C={C}
      />
    );
  }
  return <ViewerPlayer session={session} viewerUid={myUid} C={C} />;
}

// ===========================================================
// 시연자 미리보기
// ===========================================================
function BroadcasterPreview({
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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      style={{
        background: C.chatHeaderBg,
        borderBottom: `1px solid ${C.sidebarBorder}`,
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: collapsed ? 0 : 10 }}>
        <span style={liveBadgeStyle()}>● LIVE</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>내가 시연 중</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.textSecondary }}>
          <HiOutlineUsers size={14} /> {viewerCount}명 시청
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={smallBtnStyle(C)}
          title={collapsed ? '펼치기' : '접기'}
        >
          {collapsed ? '펼치기' : '접기'}
        </button>
        <button onClick={onStop} style={stopBtnStyle()} title="종료">
          <HiOutlineX size={14} />
          종료
        </button>
      </div>
      {!collapsed && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: '100%',
            maxHeight: 240,
            borderRadius: 8,
            background: '#000',
            objectFit: 'contain',
          }}
        />
      )}
    </div>
  );
}

// ===========================================================
// 시청자 플레이어
// ===========================================================
function ViewerPlayer({
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
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (sessionEnded) {
    return (
      <div
        style={{
          background: C.chatHeaderBg,
          borderBottom: `1px solid ${C.sidebarBorder}`,
          padding: 12,
          fontSize: 13,
          color: C.textSecondary,
        }}
      >
        시연이 종료되었습니다.
      </div>
    );
  }

  return (
    <div
      style={{
        background: C.chatHeaderBg,
        borderBottom: `1px solid ${C.sidebarBorder}`,
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: collapsed ? 0 : 10 }}>
        <span style={liveBadgeStyle()}>● LIVE</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
          {session.broadcasterName || '상대방'}님이 시연 중
        </span>
        <span style={{
          fontSize: 11,
          color: isConnected ? C.success : C.textSecondary,
        }}>
          {isConnected ? '● 연결됨' : error ? `● ${error}` : '● 연결 중...'}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setMuted((v) => !v)}
          style={smallBtnStyle(C)}
          title={muted ? '음소거 해제' : '음소거'}
        >
          {muted ? <HiOutlineVolumeOff size={14} /> : <HiOutlineVolumeUp size={14} />}
        </button>
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={smallBtnStyle(C)}
          title={collapsed ? '펼치기' : '접기'}
        >
          {collapsed ? '펼치기' : '접기'}
        </button>
      </div>
      {!collapsed && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          controls={false}
          style={{
            width: '100%',
            maxHeight: 480,
            borderRadius: 8,
            background: '#000',
            objectFit: 'contain',
          }}
        />
      )}
    </div>
  );
}

// ===========================================================
// 스타일 유틸
// ===========================================================
function liveBadgeStyle(): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    background: '#ff3d60',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
  };
}

function smallBtnStyle(C: any): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
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
    gap: 4,
    padding: '4px 10px',
    background: '#ff3d60',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}
