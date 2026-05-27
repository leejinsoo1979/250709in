/**
 * Chatvia 스타일 메신저 페이지 — /dashboard/messages, /dashboard/messages/:convId
 * - 좌측 네비 컬럼 (아이콘 메뉴)
 * - 중앙 사이드바 (검색 + 대화 목록)
 * - 우측 채팅 영역 (헤더 + 메시지 + 입력창 + 첨부/이모지)
 * - 테마 색 적용 (라이트/다크)
 * - Firebase 로직 유지 + 파일 첨부 + 이모지
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/contexts/ThemeContext';
import {
  subscribeMyConversations,
  subscribeMessages,
  subscribeFriends,
  sendMessage,
  markConversationRead,
  ensureConversation,
  leaveConversation,
  uploadMessageAttachment,
  type ConversationRecord,
  type FriendRecord,
  type MessageRecord,
  type MessageAttachment,
} from '@/firebase/friends';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import AddFriendModal from '@/components/friends/AddFriendModal';
import EmojiPicker, { EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';
import {
  HiOutlineChat,
  HiOutlineUserGroup,
  HiOutlineUser,
  HiOutlineCog,
  HiOutlineSearch,
  HiOutlinePaperClip,
  HiOutlineEmojiHappy,
  HiOutlinePhotograph,
  HiOutlineDotsVertical,
  HiOutlineArrowLeft,
  HiOutlineDocumentText,
  HiOutlinePaperAirplane,
  HiOutlineClock,
  HiOutlineSun,
  HiOutlineMoon,
  HiOutlineUsers,
  HiOutlineUserAdd,
  HiOutlineLogout,
  HiChat,
  HiOutlineDesktopComputer,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi';
import {
  subscribeActiveLiveSessionsForConv,
  type LiveSessionRecord,
} from '@/firebase/liveSessions';
import { useScreenShareBroadcast } from '@/hooks/useScreenShareBroadcast';
import LiveStage from './messages/LiveStage';

type LeftTab = 'chats' | 'contacts' | 'profile' | 'settings' | 'groups';

function formatTime(d: Date): string {
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InitialAvatar({
  name,
  email,
  photoURL,
  size = 40,
}: {
  name?: string;
  email?: string;
  photoURL?: string;
  size?: number;
}) {
  const letter = (name?.[0] || email?.[0] || '?').toUpperCase();
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name || email || ''}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--theme-primary, #3b82f6)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

export default function Messages() {
  const { user, loading: authLoading } = useAuth();
  const { theme, toggleMode } = useTheme();
  const navigate = useNavigate();
  const { convId: activeConvId } = useParams<{ convId?: string }>();

  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [leavingConvId, setLeavingConvId] = useState<string | null>(null);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [startingFriendUid, setStartingFriendUid] = useState<string | null>(null);
  // 사이드바 토글 (대화 목록)
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  // 라이브 중 우측 채팅 사이드 토글 + 드래그 너비
  const [rightChatCollapsed, setRightChatCollapsed] = useState(false);
  const [rightChatWidth, setRightChatWidth] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? Number(localStorage.getItem('messages.rightChatWidth')) : 0;
    return saved >= 240 && saved <= 800 ? saved : 360;
  });
  const isResizingRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // 우측 채팅 사이즈 드래그 핸들러
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      // 마우스 X를 화면 우측 기준으로 계산 → 너비
      const newWidth = Math.min(800, Math.max(240, window.innerWidth - e.clientX));
      setRightChatWidth(newWidth);
    };
    const onUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try { localStorage.setItem('messages.rightChatWidth', String(rightChatWidth)); } catch { /* noop */ }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [rightChatWidth]);

  // 라이브 시연 — 활성 세션 구독
  const [activeLiveSessions, setActiveLiveSessions] = useState<LiveSessionRecord[]>([]);
  useEffect(() => {
    if (!activeConvId) {
      setActiveLiveSessions([]);
      return;
    }
    return subscribeActiveLiveSessionsForConv(activeConvId, setActiveLiveSessions);
  }, [activeConvId]);

  // 라이브 시연 — 시연자 훅 (활성 대화방 + 본인 정보)
  const broadcast = useScreenShareBroadcast({
    convId: activeConvId || '',
    broadcasterUid: user?.uid || '',
    broadcasterName: user?.displayName || user?.email || '',
  });

  const visibleLiveSessions = activeLiveSessions;
  const myVisibleLiveSession = visibleLiveSessions.find((s) => s.broadcasterUid === user?.uid) || null;

  // 라이브 에러 발생 시 즉시 표시
  useEffect(() => {
    if (broadcast.error) {
      console.error('[라이브 에러]', broadcast.error);
      alert(`라이브 시연 오류: ${broadcast.error}`);
    }
  }, [broadcast.error]);
  const canBroadcast = Boolean(activeConvId && user?.uid);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyConversations(user.uid, setConversations);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeFriends(user.uid, setFriends);
  }, [user?.uid]);

  useEffect(() => {
    if (!activeConvId || !user?.uid) {
      setMessages([]);
      return;
    }
    const unsub = subscribeMessages(activeConvId, (msgs) => {
      setMessages(msgs);
      markConversationRead(activeConvId, user.uid).catch(() => {});
    });
    return () => unsub();
  }, [activeConvId, user?.uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeConvId]);

  if (authLoading) return <LoadingSpinner fullscreen message="확인 중..." />;
  if (!user) return <Navigate to="/login" replace />;

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const isDark = theme.mode === 'dark';

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.peerName || '').toLowerCase().includes(q) ||
      (c.peerEmail || '').toLowerCase().includes(q) ||
      (c.lastMessage || '').toLowerCase().includes(q)
    );
  });

  const filteredFriends = friends.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (f.name || '').toLowerCase().includes(q) ||
      (f.email || '').toLowerCase().includes(q)
    );
  });

  const handleSendText = async () => {
    if (!activeConvId || sending) return;
    const trimmed = text.trim();
    if (!trimmed && pendingFiles.length === 0) return;
    setSending(true);
    try {
      let attachments: MessageAttachment[] | undefined;
      if (pendingFiles.length > 0) {
        attachments = await Promise.all(
          pendingFiles.map((f) => uploadMessageAttachment(activeConvId, user.uid, f)),
        );
      }
      await sendMessage(activeConvId, user.uid, trimmed, attachments);
      setText('');
      setPendingFiles([]);
    } catch (err: any) {
      console.error('[메시지 전송 실패]', err);
      alert(`메시지 전송 실패: ${err?.code || ''} ${err?.message || ''}`);
    } finally {
      setSending(false);
    }
  };

  const handleFilesPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
    event.target.value = '';
  };

  const handleEmojiClick = (data: EmojiClickData) => {
    setText((prev) => prev + data.emoji);
    setEmojiOpen(false);
  };

  const handleLeaveConversation = async () => {
    if (!activeConvId || !user?.uid || leavingConvId) return;
    const ok = window.confirm('이 채팅방에서 나가시겠습니까? 대화 목록에서 사라집니다.');
    if (!ok) return;
    setLeavingConvId(activeConvId);
    try {
      await leaveConversation(activeConvId, user.uid);
      setMessages([]);
      setPendingFiles([]);
      navigate('/dashboard/messages');
    } catch (err: any) {
      console.error('[채팅방 나가기 실패]', err);
      alert(`채팅방 나가기 실패: ${err?.code || ''} ${err?.message || ''}`);
    } finally {
      setLeavingConvId(null);
    }
  };

  const handleStartFriendConversation = async (friendUid: string) => {
    console.log('[채팅 시작 클릭]', { myUid: user?.uid, friendUid, startingFriendUid });
    if (!user?.uid) {
      alert('로그인 정보가 없습니다.');
      return;
    }
    if (startingFriendUid) {
      console.log('[이미 진행 중]', startingFriendUid);
      return;
    }
    setStartingFriendUid(friendUid);
    try {
      console.log('[ensureConversation 호출]', user.uid, friendUid);
      const convId = await ensureConversation(user.uid, friendUid);
      console.log('[ensureConversation 성공]', convId);
      setLeftTab('chats');
      navigate(`/dashboard/messages/${convId}`);
    } catch (err: any) {
      console.error('[대화 시작 실패]', err);
      alert(`대화 시작 실패: ${err?.code || ''} ${err?.message || ''}`);
    } finally {
      setStartingFriendUid(null);
    }
  };

  // Chatvia 스타일 톤
  const C = {
    pageBg: isDark ? '#1c2331' : '#eff2f7',
    leftNavBg: isDark ? '#262e3f' : '#ffffff',
    leftNavText: isDark ? '#a6b0cf' : '#7a7f9a',
    leftNavTextActive: 'var(--theme-primary, #7269ef)',
    leftNavActiveBg: isDark ? '#36404a' : 'rgba(114,105,239,0.18)',
    // 대화 목록 아이템 활성 배경 — 좀더 은은한 톤
    convItemActiveBg: isDark ? '#2e3648' : 'rgba(114,105,239,0.06)',
    convItemHoverBg: isDark ? '#2a3243' : 'rgba(0,0,0,0.03)',
    sidebarBg: isDark ? '#262e3f' : '#ffffff',
    sidebarBorder: isDark ? '#36404a' : '#e6ebf5',
    chatBg: isDark ? '#36404a' : '#f5f7fb',
    chatHeaderBg: isDark ? '#262e3f' : '#ffffff',
    text: isDark ? '#eff2f7' : '#495057',
    textSecondary: isDark ? '#a6b0cf' : '#7a7f9a',
    bubbleIncomingBg: isDark ? '#36404a' : '#ffffff',
    bubbleOutgoingBg: 'var(--theme-primary, #7269ef)',
    bubbleOutgoingText: '#ffffff',
    inputBg: isDark ? '#36404a' : '#f5f7fb',
    accent: 'var(--theme-primary, #7269ef)',
    danger: '#ff3d60',
    success: '#1ecab8',
  };

  return (
    <div
      style={{
        height: '100vh',
        background: C.pageBg,
        display: 'flex',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* ===== 좌측 네비 컬럼 (Chatvia 스타일) ===== */}
      <div
        style={{
          width: 75,
          background: C.leftNavBg,
          borderRight: `1px solid ${C.sidebarBorder}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '20px 0',
        }}
      >
        {/* 상단 로고 (테마색 원 + 흰색 점 3개) */}
        <button
          onClick={() => navigate('/dashboard')}
          title="대시보드"
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            background: C.accent,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            marginBottom: 32,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ffffff' }} />
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ffffff' }} />
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ffffff' }} />
        </button>

        {/* 중앙 네비 메뉴 */}
        <ChatviaNavBtn
          icon={<HiOutlineUser size={22} />}
          active={leftTab === 'profile'}
          onClick={() => setLeftTab('profile')}
          C={C}
          title="프로필"
        />
        <ChatviaNavBtn
          icon={<HiOutlineChat size={22} />}
          active={leftTab === 'chats'}
          onClick={() => setLeftTab('chats')}
          C={C}
          title="채팅"
        />
        <ChatviaNavBtn
          icon={<HiOutlineUsers size={22} />}
          active={leftTab === 'groups'}
          onClick={() => setLeftTab('groups')}
          C={C}
          title="그룹"
        />
        <ChatviaNavBtn
          icon={<HiOutlineUserAdd size={22} />}
          active={leftTab === 'contacts'}
          onClick={() => setLeftTab('contacts')}
          C={C}
          title="연락처"
        />
        <ChatviaNavBtn
          icon={<HiOutlineCog size={22} />}
          active={leftTab === 'settings'}
          onClick={() => setLeftTab('settings')}
          C={C}
          title="설정"
        />

        <div style={{ flex: 1 }} />

        {/* 사이드바 접혀있을 때만 펼치기 버튼 노출 */}
        {leftSidebarCollapsed && (
          <button
            onClick={() => setLeftSidebarCollapsed(false)}
            title="대화 목록 펼치기"
            style={{
              width: 46,
              height: 46,
              borderRadius: 8,
              background: C.leftNavActiveBg,
              border: 'none',
              color: C.accent,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
            }}
          >
            <HiOutlineChevronRight size={22} />
          </button>
        )}

        {/* 대시보드 가기 */}
        <button
          onClick={() => navigate('/dashboard')}
          title="대시보드"
          style={{
            width: 46,
            height: 46,
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: C.leftNavText,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
          }}
        >
          <HiOutlineArrowLeft size={22} />
        </button>

        {/* 하단 라이트/다크 토글 */}
        <button
          onClick={toggleMode}
          title={isDark ? '라이트 모드' : '다크 모드'}
          style={{
            width: 46,
            height: 46,
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: C.leftNavText,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          {isDark ? <HiOutlineSun size={22} /> : <HiOutlineMoon size={22} />}
        </button>

        {/* 최하단 사용자 아바타 */}
        <button
          onClick={() => setLeftTab('profile')}
          title="내 프로필"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <InitialAvatar
            name={user.displayName || user.email || '?'}
            photoURL={user.photoURL || undefined}
            size={36}
          />
        </button>
      </div>

      {/* ===== 중앙 사이드바 (대화 목록) ===== */}
      <div
        style={{
          width: leftSidebarCollapsed ? 0 : 360,
          background: C.sidebarBg,
          borderRight: leftSidebarCollapsed ? 'none' : `1px solid ${C.sidebarBorder}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.18s ease',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '24px 24px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text, flex: 1 }}>
            {leftTab === 'chats' ? '채팅' : leftTab === 'contacts' ? '연락처' : leftTab === 'profile' ? '내 정보' : leftTab === 'groups' ? '그룹' : '설정'}
          </h2>
          <button
            onClick={() => setLeftSidebarCollapsed(true)}
            title="사이드바 접기"
            style={{
              background: 'transparent',
              border: 'none',
              color: C.textSecondary,
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <HiOutlineChevronLeft size={18} />
          </button>
        </div>
        {leftTab === 'contacts' && (
          <div style={{ padding: '0 24px 12px' }}>
            <button
              onClick={() => setShowAddFriend(true)}
              style={{
                width: '100%',
                border: 'none',
                background: C.accent,
                color: '#ffffff',
                borderRadius: 6,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <HiOutlineUserAdd size={16} />
              친구 추가
            </button>
          </div>
        )}
        <div style={{ padding: '0 24px 16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: C.inputBg,
              borderRadius: 6,
              padding: '10px 12px',
            }}
          >
            <HiOutlineSearch size={16} color={C.textSecondary} />
            <input
              type="text"
              placeholder={leftTab === 'contacts' ? '친구 검색...' : '대화 검색...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: C.text,
                fontSize: 13,
              }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
          {leftTab === 'contacts' ? (
            filteredFriends.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>
                <div style={{ marginBottom: 12 }}>
                  {searchQuery ? '검색 결과 없음' : '친구가 없습니다.'}
                </div>
                {!searchQuery && (
                  <button
                    onClick={() => setShowAddFriend(true)}
                    style={{
                      border: 'none',
                      background: C.leftNavActiveBg,
                      color: C.accent,
                      borderRadius: 6,
                      padding: '8px 12px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    친구 추가
                  </button>
                )}
              </div>
            ) : (
              filteredFriends.map((f) => (
                <div
                  key={f.uid}
                  style={{
                    padding: '14px 12px',
                    borderRadius: 6,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <InitialAvatar name={f.name} email={f.email} photoURL={f.photoURL} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: C.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f.name || f.email || '(이름 없음)'}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.textSecondary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f.email || ''}
                    </div>
                  </div>
                  <button
                    onClick={() => handleStartFriendConversation(f.uid)}
                    disabled={startingFriendUid === f.uid}
                    style={{
                      border: 'none',
                      background: C.leftNavActiveBg,
                      color: C.accent,
                      borderRadius: 6,
                      padding: '7px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: startingFriendUid === f.uid ? 'not-allowed' : 'pointer',
                      opacity: startingFriendUid === f.uid ? 0.55 : 1,
                      flexShrink: 0,
                    }}
                  >
                    채팅
                  </button>
                </div>
              ))
            )
          ) : filteredConversations.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>
              <div style={{ marginBottom: 12 }}>
                {searchQuery ? '검색 결과 없음' : '대화가 없습니다.'}
              </div>
              {!searchQuery && (
                <button
                  onClick={() => setLeftTab('contacts')}
                  style={{
                    border: 'none',
                    background: C.leftNavActiveBg,
                    color: C.accent,
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  친구에서 시작
                </button>
              )}
            </div>
          ) : (
            filteredConversations.map((c) => {
              const myUnread = (c.unread || {})[user.uid] || 0;
              const isActive = c.id === activeConvId;
              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/dashboard/messages/${c.id}`)}
                  style={{
                    padding: '14px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: isActive ? C.convItemActiveBg : 'transparent',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    marginBottom: 4,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = C.convItemHoverBg;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <InitialAvatar name={c.peerName} email={c.peerEmail} photoURL={c.peerPhotoURL} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          color: C.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          marginRight: 8,
                        }}
                      >
                        {c.peerName || c.peerEmail || '(알 수 없음)'}
                      </span>
                      <span style={{ fontSize: 11, color: C.textSecondary, flexShrink: 0 }}>
                        {c.lastMessageAt ? formatTime(c.lastMessageAt) : ''}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: C.textSecondary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          marginRight: 8,
                        }}
                      >
                        {c.lastMessage || '대화 시작'}
                      </span>
                      {myUnread > 0 && (
                        <span
                          style={{
                            minWidth: 18,
                            height: 18,
                            padding: '0 6px',
                            background: C.accent,
                            color: '#fff',
                            borderRadius: 9,
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {myUnread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ===== 우측 영역 (라이브 있으면 라이브 메인 + 채팅 사이드 / 없으면 채팅 풀) ===== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', background: C.chatBg, minWidth: 0 }}>
        {/* 라이브 스테이지 (메인 무대) */}
        {activeConv && visibleLiveSessions.length > 0 && (
          <LiveStage
            session={visibleLiveSessions[0]}
            myUid={user.uid}
            broadcasterPreviewStream={
              visibleLiveSessions[0].broadcasterUid === user.uid ? broadcast.previewStream : null
            }
            broadcasterViewerCount={
              visibleLiveSessions[0].broadcasterUid === user.uid ? broadcast.viewerCount : 0
            }
            onStopBroadcast={
              visibleLiveSessions[0].broadcasterUid === user.uid
                ? (sessionId) => broadcast.stop(sessionId)
                : undefined
            }
            C={C}
          />
        )}

        {/* 라이브 중 우측 채팅 사이드 드래그 핸들 */}
        {activeConv && visibleLiveSessions.length > 0 && !rightChatCollapsed && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              isResizingRef.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            title="드래그로 너비 조절"
            style={{
              width: 6,
              cursor: 'col-resize',
              background: 'transparent',
              borderLeft: `1px solid ${C.sidebarBorder}`,
              borderRight: `1px solid ${C.sidebarBorder}`,
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.leftNavActiveBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          />
        )}

        {/* 라이브 중 우측 채팅 접힘 상태: 펼치기 버튼만 */}
        {activeConv && visibleLiveSessions.length > 0 && rightChatCollapsed && (
          <button
            onClick={() => setRightChatCollapsed(false)}
            title="채팅 펼치기"
            style={{
              width: 36,
              alignSelf: 'stretch',
              background: C.chatHeaderBg,
              border: 'none',
              borderLeft: `1px solid ${C.sidebarBorder}`,
              color: C.text,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <HiOutlineChevronLeft size={20} />
          </button>
        )}

        {/* 채팅 영역 (라이브 있으면 우측 N px 사이드, 없으면 풀) */}
        <div
          style={{
            display: rightChatCollapsed && visibleLiveSessions.length > 0 ? 'none' : 'flex',
            flexDirection: 'column',
            background: C.chatBg,
            ...(activeConv && visibleLiveSessions.length > 0
              ? { width: rightChatWidth, flexShrink: 0 }
              : { flex: 1 }),
            minWidth: 0,
          }}
        >
        {!activeConv ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 12,
              color: C.textSecondary,
            }}
          >
            <HiOutlineChat size={64} />
            <div style={{ fontSize: 16, fontWeight: 600 }}>대화를 선택하세요</div>
            <div style={{ fontSize: 13 }}>좌측 대화 목록에서 메시지를 시작할 사용자를 선택하세요.</div>
          </div>
        ) : (
          <>
            {/* 채팅 헤더 */}
            <div
              style={{
                padding: '16px 24px',
                background: C.chatHeaderBg,
                borderBottom: `1px solid ${C.sidebarBorder}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <InitialAvatar
                name={activeConv.peerName}
                email={activeConv.peerEmail}
                photoURL={activeConv.peerPhotoURL}
                size={40}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: C.text }}>
                  {activeConv.peerName || '(이름 없음)'}
                </div>
                <div style={{ fontSize: 12, color: C.textSecondary }}>
                  {activeConv.peerEmail || ''}
                </div>
              </div>
              {/* 라이브 중일 때만: 채팅 사이드 접기 */}
              {visibleLiveSessions.length > 0 && (
                <button
                  onClick={() => setRightChatCollapsed(true)}
                  title="채팅 접기"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: C.textSecondary,
                    cursor: 'pointer',
                    padding: 6,
                    borderRadius: 6,
                  }}
                >
                  <HiOutlineChevronRight size={20} />
                </button>
              )}
              <button
                onClick={handleLeaveConversation}
                disabled={leavingConvId === activeConv.id}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: C.accent,
                  cursor: leavingConvId === activeConv.id ? 'not-allowed' : 'pointer',
                  padding: '6px 8px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  opacity: leavingConvId === activeConv.id ? 0.55 : 1,
                }}
                title="채팅방 나가기"
              >
                <HiOutlineLogout size={18} />
                나가기
              </button>
              <button
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: C.textSecondary,
                  cursor: 'pointer',
                  padding: 6,
                }}
                title="더보기"
              >
                <HiOutlineDotsVertical size={20} />
              </button>
            </div>

            {/* 라이브 시연 패널은 우측이 아닌 가운데 메인 스테이지(LiveStage)로 표시됨 */}

            {/* 메시지 영역 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: C.textSecondary, fontSize: 13, marginTop: 40 }}>
                  아직 메시지가 없습니다.
                </div>
              ) : (
                messages.map((m, idx) => {
                  const mine = m.senderId === user.uid;
                  const prevSameSender = idx > 0 && messages[idx - 1].senderId === m.senderId;
                  const nextSameSender = idx < messages.length - 1 && messages[idx + 1].senderId === m.senderId;
                  const isLastInGroup = !nextSameSender;
                  const senderLabel = mine
                    ? (user.displayName || user.email || '나')
                    : (activeConv.peerName || activeConv.peerEmail || '상대');
                  return (
                    <ChatviaBubble
                      key={m.id}
                      message={m}
                      mine={mine}
                      C={C}
                      showAvatar={!mine && isLastInGroup}
                      showSenderName={isLastInGroup}
                      senderLabel={senderLabel}
                      peerName={activeConv.peerName}
                      peerEmail={activeConv.peerEmail}
                      peerPhotoURL={activeConv.peerPhotoURL}
                      compact={prevSameSender}
                    />
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 첨부 미리보기 */}
            {pendingFiles.length > 0 && (
              <div
                style={{
                  padding: '12px 24px',
                  background: C.chatHeaderBg,
                  borderTop: `1px solid ${C.sidebarBorder}`,
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                {pendingFiles.map((f, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      background: C.inputBg,
                      borderRadius: 6,
                      fontSize: 12,
                      color: C.text,
                    }}
                  >
                    {f.type.startsWith('image/') ? (
                      <HiOutlinePhotograph size={16} color={C.accent} />
                    ) : (
                      <HiOutlineDocumentText size={16} color={C.accent} />
                    )}
                    <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name}
                    </span>
                    <span style={{ color: C.textSecondary }}>{formatFileSize(f.size)}</span>
                    <button
                      onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: C.danger,
                        cursor: 'pointer',
                        fontSize: 14,
                        padding: 0,
                        marginLeft: 4,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 입력창 — 라이브 중 우측 사이드 모드면 2단 (입력 위 / 도구·전송 아래) */}
            {(() => {
              const isCompact = visibleLiveSessions.length > 0;
              return (
                <div
                  style={{
                    padding: isCompact ? '10px 14px' : '14px 24px',
                    background: C.chatHeaderBg,
                    borderTop: `1px solid ${C.sidebarBorder}`,
                    display: 'flex',
                    flexDirection: isCompact ? 'column' : 'row',
                    alignItems: isCompact ? 'stretch' : 'center',
                    gap: isCompact ? 8 : 8,
                    position: 'relative',
                  }}
                >
                  {emojiOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 16,
                        zIndex: 100,
                      }}
                    >
                      <EmojiPicker
                        onEmojiClick={handleEmojiClick}
                        theme={isDark ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                        width={320}
                        height={400}
                      />
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFilesPick}
                  />
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFilesPick}
                  />

                  {/* 입력박스 — 컴팩트 모드에서는 1행 단독 */}
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendText();
                      }
                    }}
                    placeholder="메시지 입력..."
                    disabled={sending}
                    style={{
                      flex: isCompact ? undefined : 1,
                      width: isCompact ? '100%' : undefined,
                      order: isCompact ? 0 : 4,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: C.inputBg,
                      color: C.text,
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />

                  {/* 도구 + 전송 — 컴팩트 모드에서는 2행 (도구 좌 / 전송 우) */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      order: isCompact ? 1 : 0,
                      width: isCompact ? '100%' : undefined,
                    }}
                  >
                    <button
                      onClick={() => setEmojiOpen((v) => !v)}
                      title="이모지"
                      style={iconBtnStyle(C, emojiOpen)}
                    >
                      <HiOutlineEmojiHappy size={20} />
                    </button>
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      title="이미지 첨부"
                      style={iconBtnStyle(C)}
                    >
                      <HiOutlinePhotograph size={20} />
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title="파일 첨부"
                      style={iconBtnStyle(C)}
                    >
                      <HiOutlinePaperClip size={20} />
                    </button>
                    <button
                      onClick={() => {
                        console.log('[라이브 버튼 클릭]', {
                          isLive: broadcast.isLive,
                          activeConvId,
                          userUid: user?.uid,
                          error: broadcast.error,
                          hasGetDisplayMedia: !!navigator.mediaDevices?.getDisplayMedia,
                        });
                        if (broadcast.isLive || myVisibleLiveSession) {
                          broadcast.stop(myVisibleLiveSession?.id || undefined);
                        } else {
                          broadcast.start();
                        }
                      }}
                      title={broadcast.isLive || myVisibleLiveSession ? '라이브 시연 종료' : '라이브 시연 시작 (화면 공유)'}
                      style={{
                        ...iconBtnStyle(C, broadcast.isLive || Boolean(myVisibleLiveSession)),
                        color: broadcast.isLive || myVisibleLiveSession ? '#ff3d60' : C.textSecondary,
                      }}
                    >
                      <HiOutlineDesktopComputer size={20} />
                    </button>
                    {isCompact && <div style={{ flex: 1 }} />}
                    <button
                      onClick={handleSendText}
                      disabled={sending || (!text.trim() && pendingFiles.length === 0)}
                      style={{
                        padding: isCompact ? '8px 14px' : '12px 16px',
                        background: C.accent,
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        cursor: sending ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 600,
                        fontSize: 13,
                        opacity: sending || (!text.trim() && pendingFiles.length === 0) ? 0.6 : 1,
                        flexShrink: 0,
                      }}
                    >
                      <HiOutlinePaperAirplane size={16} style={{ transform: 'rotate(90deg)' }} />
                      {isCompact ? '' : '전송'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </>
        )}
        </div>
      </div>

      {showAddFriend && <AddFriendModal onClose={() => setShowAddFriend(false)} />}
    </div>
  );
}

function ChatviaNavBtn({
  icon,
  active,
  onClick,
  C,
  title,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  C: any;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 46,
        height: 46,
        marginBottom: 12,
        borderRadius: 8,
        background: active ? C.leftNavActiveBg : 'transparent',
        border: 'none',
        color: active ? C.leftNavTextActive : C.leftNavText,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {icon}
    </button>
  );
}

function iconBtnStyle(C: any, active?: boolean): React.CSSProperties {
  return {
    width: 38,
    height: 38,
    borderRadius: 6,
    background: active ? C.leftNavActiveBg : 'transparent',
    border: 'none',
    color: active ? C.accent : C.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };
}

function ChatviaBubble({
  message,
  mine,
  C,
  showAvatar,
  showSenderName,
  senderLabel,
  peerName,
  peerEmail,
  peerPhotoURL,
  compact,
}: {
  message: MessageRecord;
  mine: boolean;
  C: any;
  showAvatar: boolean;
  showSenderName: boolean;
  senderLabel: string;
  peerName?: string;
  peerEmail?: string;
  peerPhotoURL?: string;
  compact: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        marginBottom: compact ? 4 : 16,
        gap: 12,
        alignItems: 'flex-end',
      }}
    >
      {!mine && (
        <div style={{ width: 40, flexShrink: 0 }}>
          {showAvatar && (
            <InitialAvatar name={peerName} email={peerEmail} photoURL={peerPhotoURL} size={40} />
          )}
        </div>
      )}
      <div
        style={{
          maxWidth: '65%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: mine ? 'flex-end' : 'flex-start',
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* 첨부 */}
        {message.attachments && message.attachments.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginBottom: message.text ? 6 : 0,
            }}
          >
            {message.attachments.map((att, i) => (
              <AttachmentBubble key={i} attachment={att} mine={mine} C={C} />
            ))}
          </div>
        )}
        {/* 텍스트 말풍선 */}
        {message.text && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexDirection: mine ? 'row-reverse' : 'row',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderRadius: 12,
                background: C.bubbleOutgoingBg,
                color: '#ffffff',
                fontSize: 14,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                minWidth: 120,
                position: 'relative',
              }}
            >
              <div style={{ marginBottom: 8 }}>{message.text}</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.7)',
                  justifyContent: 'flex-end',
                }}
              >
                <HiOutlineClock size={12} />
                {message.createdAt ? formatTime(message.createdAt) : ''}
              </div>
            </div>
            {/* 더보기 메뉴 (호버 시 표시) */}
            <button
              style={{
                background: 'transparent',
                border: 'none',
                color: C.textSecondary,
                cursor: 'pointer',
                padding: 4,
                opacity: hover ? 1 : 0,
                transition: 'opacity 0.15s',
              }}
              title="더보기"
            >
              <HiOutlineDotsVertical size={16} />
            </button>
          </div>
        )}
        {/* 발신자 이름 (인커밍 그룹 마지막에만, 아바타 옆) */}
        {!mine && showSenderName && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: C.text,
              marginTop: 8,
              marginLeft: 4,
            }}
          >
            {senderLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentBubble({
  attachment,
  mine,
  C,
}: {
  attachment: MessageAttachment;
  mine: boolean;
  C: any;
}) {
  if (attachment.kind === 'image') {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
        <img
          src={attachment.url}
          alt={attachment.name || ''}
          style={{
            maxWidth: 280,
            maxHeight: 220,
            borderRadius: 8,
            objectFit: 'cover',
            display: 'block',
            cursor: 'pointer',
          }}
        />
      </a>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 8,
        background: mine ? 'rgba(255,255,255,0.15)' : C.bubbleIncomingBg,
        color: mine ? C.bubbleOutgoingText : C.text,
        textDecoration: 'none',
        boxShadow: mine ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
        maxWidth: 280,
      }}
    >
      <HiOutlineDocumentText size={20} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {attachment.name || '파일'}
        </div>
        {attachment.size && (
          <div style={{ fontSize: 11, opacity: 0.8 }}>{formatFileSize(attachment.size)}</div>
        )}
      </div>
    </a>
  );
}
