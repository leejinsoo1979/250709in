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
  sendMessage,
  markConversationRead,
  uploadMessageAttachment,
  type ConversationRecord,
  type MessageRecord,
  type MessageAttachment,
} from '@/firebase/friends';
import LoadingSpinner from '@/components/common/LoadingSpinner';
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
} from 'react-icons/hi';

type LeftTab = 'chats' | 'contacts' | 'profile' | 'settings';

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
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { convId: activeConvId } = useParams<{ convId?: string }>();

  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyConversations(user.uid, setConversations);
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
      {/* ===== 좌측 네비 컬럼 ===== */}
      <div
        style={{
          width: 75,
          background: C.leftNavBg,
          borderRight: `1px solid ${C.sidebarBorder}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px 0',
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <InitialAvatar name={user.displayName || user.email || '?'} photoURL={user.photoURL || undefined} size={36} />
        </div>
        <NavButton
          icon={<HiOutlineChat size={22} />}
          active={leftTab === 'chats'}
          onClick={() => setLeftTab('chats')}
          color={leftTab === 'chats' ? C.leftNavTextActive : C.leftNavText}
          activeBg={C.leftNavActiveBg}
        />
        <NavButton
          icon={<HiOutlineUserGroup size={22} />}
          active={leftTab === 'contacts'}
          onClick={() => setLeftTab('contacts')}
          color={leftTab === 'contacts' ? C.leftNavTextActive : C.leftNavText}
          activeBg={C.leftNavActiveBg}
        />
        <NavButton
          icon={<HiOutlineUser size={22} />}
          active={leftTab === 'profile'}
          onClick={() => setLeftTab('profile')}
          color={leftTab === 'profile' ? C.leftNavTextActive : C.leftNavText}
          activeBg={C.leftNavActiveBg}
        />
        <div style={{ flex: 1 }} />
        <NavButton
          icon={<HiOutlineCog size={22} />}
          active={leftTab === 'settings'}
          onClick={() => setLeftTab('settings')}
          color={leftTab === 'settings' ? C.leftNavTextActive : C.leftNavText}
          activeBg={C.leftNavActiveBg}
        />
        <button
          onClick={() => navigate('/dashboard')}
          title="대시보드"
          style={{
            marginTop: 12,
            width: 50,
            height: 50,
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: C.leftNavText,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <HiOutlineArrowLeft size={22} />
        </button>
      </div>

      {/* ===== 중앙 사이드바 (대화 목록) ===== */}
      <div
        style={{
          width: 360,
          background: C.sidebarBg,
          borderRight: `1px solid ${C.sidebarBorder}`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '24px 24px 12px' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>
            {leftTab === 'chats' ? '채팅' : leftTab === 'contacts' ? '연락처' : leftTab === 'profile' ? '내 정보' : '설정'}
          </h2>
        </div>
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
              placeholder="대화 검색..."
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
          {filteredConversations.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>
              {searchQuery ? '검색 결과 없음' : '대화가 없습니다.\n친구 페이지에서 메시지를 시작하세요.'}
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
                    borderLeft: isActive ? `3px solid ${C.accent}` : '3px solid transparent',
                    paddingLeft: 9,
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

      {/* ===== 우측 채팅 영역 ===== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.chatBg }}>
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
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        justifyContent: mine ? 'flex-end' : 'flex-start',
                        marginBottom: prevSameSender ? 4 : 12,
                        gap: 8,
                        alignItems: 'flex-end',
                      }}
                    >
                      {!mine && !prevSameSender && (
                        <InitialAvatar
                          name={activeConv.peerName}
                          email={activeConv.peerEmail}
                          photoURL={activeConv.peerPhotoURL}
                          size={32}
                        />
                      )}
                      {!mine && prevSameSender && <div style={{ width: 32, flexShrink: 0 }} />}
                      <div style={{ maxWidth: '60%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                        {m.attachments && m.attachments.length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              marginBottom: m.text ? 6 : 0,
                            }}
                          >
                            {m.attachments.map((att, i) => (
                              <AttachmentBubble
                                key={i}
                                attachment={att}
                                mine={mine}
                                C={C}
                              />
                            ))}
                          </div>
                        )}
                        {m.text && (
                          <div
                            style={{
                              padding: '10px 14px',
                              borderRadius: 8,
                              background: mine ? C.bubbleOutgoingBg : C.bubbleIncomingBg,
                              color: mine ? C.bubbleOutgoingText : C.text,
                              fontSize: 14,
                              wordBreak: 'break-word',
                              whiteSpace: 'pre-wrap',
                              boxShadow: mine ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                            }}
                          >
                            {m.text}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: 10,
                            color: C.textSecondary,
                            marginTop: 4,
                          }}
                        >
                          {m.createdAt ? formatTime(m.createdAt) : ''}
                        </div>
                      </div>
                    </div>
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

            {/* 입력창 */}
            <div
              style={{
                padding: '14px 24px',
                background: C.chatHeaderBg,
                borderTop: `1px solid ${C.sidebarBorder}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
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
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: C.inputBg,
                  color: C.text,
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSendText}
                disabled={sending || (!text.trim() && pendingFiles.length === 0)}
                style={{
                  padding: '12px 16px',
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
                }}
              >
                <HiOutlinePaperAirplane size={16} style={{ transform: 'rotate(90deg)' }} />
                전송
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NavButton({
  icon,
  active,
  onClick,
  color,
  activeBg,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color: string;
  activeBg: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 50,
        height: 50,
        marginBottom: 8,
        borderRadius: 8,
        background: active ? activeBg : 'transparent',
        border: 'none',
        color,
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
