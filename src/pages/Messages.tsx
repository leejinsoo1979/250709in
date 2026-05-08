/**
 * 1:1 메신저 페이지 — /dashboard/messages, /dashboard/messages/:convId
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import {
  subscribeMyConversations,
  subscribeMessages,
  sendMessage,
  markConversationRead,
  type ConversationRecord,
  type MessageRecord,
} from '@/firebase/friends';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function Messages() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { convId: activeConvId } = useParams<{ convId?: string }>();
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

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
      // 읽음 처리
      markConversationRead(activeConvId, user.uid).catch(() => {});
    });
    return () => unsub();
  }, [activeConvId, user?.uid]);

  // 메시지 변경 시 스크롤 하단
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, activeConvId]);

  if (authLoading) return <LoadingSpinner fullscreen message="확인 중..." />;
  if (!user) return <Navigate to="/login" replace />;

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const handleSend = async () => {
    if (!activeConvId || !text.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(activeConvId, user.uid, text);
      setText('');
    } catch (err: any) {
      console.error('[메시지 전송 실패]', err);
      alert(`메시지 전송 실패: ${err?.code || ''} ${err?.message || ''}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-background, #f9fafb)', padding: '24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--theme-text, #1f2937)' }}>메시지</h1>
          <button onClick={() => navigate('/dashboard')} style={btnSecondary}>대시보드</button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          gap: 16,
          height: 'calc(100vh - 140px)',
          minHeight: 480,
        }}>
          {/* 좌측: 대화방 목록 */}
          <div style={{ ...panel, overflowY: 'auto' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--theme-border, #e5e7eb)', fontWeight: 600, fontSize: 14 }}>
              대화 ({conversations.length})
            </div>
            {conversations.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                대화가 없습니다.<br />친구 페이지에서 메시지를 시작하세요.
              </div>
            ) : (
              conversations.map((c) => {
                const myUnread = (c.unread || {})[user.uid] || 0;
                const isActive = c.id === activeConvId;
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/dashboard/messages/${c.id}`)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--theme-border, #f3f4f6)',
                      cursor: 'pointer',
                      background: isActive ? 'var(--theme-primary-light, #eff6ff)' : 'transparent',
                      display: 'flex', gap: 12, alignItems: 'center',
                    }}
                  >
                    <div style={avatar}>
                      {c.peerPhotoURL
                        ? <img src={c.peerPhotoURL} alt="" style={imgFit} />
                        : (c.peerName?.[0] || c.peerEmail?.[0] || '?').toUpperCase()
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.peerName || c.peerEmail || '(알 수 없음)'}
                        </div>
                        {myUnread > 0 && <span style={badge}>{myUnread}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.lastMessage || '대화 시작'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 우측: 대화창 */}
          <div style={{ ...panel, display: 'flex', flexDirection: 'column' }}>
            {!activeConv ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                좌측에서 대화를 선택하세요.
              </div>
            ) : (
              <>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--theme-border, #e5e7eb)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={avatar}>
                    {activeConv.peerPhotoURL
                      ? <img src={activeConv.peerPhotoURL} alt="" style={imgFit} />
                      : (activeConv.peerName?.[0] || activeConv.peerEmail?.[0] || '?').toUpperCase()
                    }
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{activeConv.peerName || '(이름 없음)'}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{activeConv.peerEmail}</div>
                  </div>
                </div>

                <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: 'var(--theme-background, #f9fafb)' }}>
                  {messages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, marginTop: 40 }}>아직 메시지가 없습니다.</div>
                  ) : (
                    messages.map((m) => {
                      const mine = m.senderId === user.uid;
                      return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                          <div style={{
                            maxWidth: '70%',
                            padding: '8px 12px',
                            borderRadius: 12,
                            background: mine ? '#3b82f6' : '#fff',
                            color: mine ? '#fff' : '#1f2937',
                            border: mine ? 'none' : '1px solid #e5e7eb',
                            fontSize: 14,
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap',
                          }}>
                            {m.text}
                            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, textAlign: 'right' }}>
                              {m.createdAt ? formatTime(m.createdAt) : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--theme-border, #e5e7eb)', display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="메시지 입력..."
                    style={input}
                    disabled={sending}
                  />
                  <button onClick={handleSend} disabled={sending || !text.trim()} style={btnPrimary}>
                    전송
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(d: Date): string {
  const today = new Date();
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

const panel: React.CSSProperties = {
  background: 'var(--theme-surface, #fff)', borderRadius: 12,
  border: '1px solid var(--theme-border, #e5e7eb)', overflow: 'hidden',
};
const avatar: React.CSSProperties = {
  width: 40, height: 40, borderRadius: '50%', background: '#3b82f6', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16,
  flexShrink: 0, overflow: 'hidden',
};
const imgFit: React.CSSProperties = { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' };
const input: React.CSSProperties = {
  flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--theme-border, #d1d5db)',
  fontSize: 14, outline: 'none', background: 'var(--theme-surface, #fff)', color: 'var(--theme-text, #1f2937)',
};
const btnPrimary: React.CSSProperties = {
  padding: '10px 18px', background: '#3b82f6', color: '#fff', border: 'none',
  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '8px 14px', background: 'var(--theme-surface, #fff)', color: 'var(--theme-text, #374151)',
  border: '1px solid var(--theme-border, #d1d5db)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const badge: React.CSSProperties = {
  minWidth: 18, padding: '2px 6px', background: '#ef4444', color: '#fff',
  borderRadius: 9, fontSize: 11, fontWeight: 700, textAlign: 'center',
};
