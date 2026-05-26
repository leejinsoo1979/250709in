/**
 * 1:1 메신저 페이지 — /dashboard/messages, /dashboard/messages/:convId
 * UI: @chatscope/chat-ui-kit-react 기반 메신저 룩앤필
 * 데이터: 기존 Firebase friends 모듈 (subscribeMyConversations / subscribeMessages / sendMessage)
 */
import { useEffect, useState } from 'react';
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
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import {
  MainContainer,
  Sidebar,
  ConversationList,
  Conversation,
  Avatar,
  ChatContainer,
  ConversationHeader,
  MessageList,
  Message,
  MessageInput,
  MessageGroup,
} from '@chatscope/chat-ui-kit-react';

const FALLBACK_AVATAR =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="100%" height="100%" fill="%233b82f6"/><text x="50%" y="55%" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-size="18" font-weight="700">?</text></svg>';

function getInitialAvatar(name?: string, email?: string): string {
  const letter = (name?.[0] || email?.[0] || '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="100%" height="100%" fill="%233b82f6"/><text x="50%" y="55%" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-size="18" font-weight="700">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

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

export default function Messages() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { convId: activeConvId } = useParams<{ convId?: string }>();
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [sending, setSending] = useState(false);

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

  if (authLoading) return <LoadingSpinner fullscreen message="확인 중..." />;
  if (!user) return <Navigate to="/login" replace />;

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const handleSend = async (innerHtml: string, textContent: string, _innerText: string) => {
    const text = (textContent || innerHtml || '').trim();
    if (!activeConvId || !text || sending) return;
    setSending(true);
    try {
      await sendMessage(activeConvId, user.uid, text);
    } catch (err: any) {
      console.error('[메시지 전송 실패]', err);
      alert(`메시지 전송 실패: ${err?.code || ''} ${err?.message || ''}`);
    } finally {
      setSending(false);
    }
  };

  // chatscope 메시지 그룹핑: 같은 발신자가 연속으로 보낸 메시지는 한 그룹으로
  const buildMessageGroups = () => {
    const groups: Array<{ senderId: string; isMine: boolean; messages: MessageRecord[] }> = [];
    messages.forEach((m) => {
      const isMine = m.senderId === user.uid;
      const last = groups[groups.length - 1];
      if (last && last.senderId === m.senderId) {
        last.messages.push(m);
      } else {
        groups.push({ senderId: m.senderId, isMine, messages: [m] });
      }
    });
    return groups;
  };

  return (
    <div
      style={{
        height: '100vh',
        background: 'var(--theme-background, #f9fafb)',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', height: '100%' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--theme-text, #1f2937)' }}>
            메시지
          </h1>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '8px 14px',
              background: 'var(--theme-surface, #fff)',
              color: 'var(--theme-text, #374151)',
              border: '1px solid var(--theme-border, #d1d5db)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            대시보드
          </button>
        </div>

        <div
          style={{
            position: 'relative',
            height: 'calc(100vh - 140px)',
            minHeight: 480,
            border: '1px solid var(--theme-border, #e5e7eb)',
            borderRadius: 12,
            overflow: 'hidden',
            background: 'var(--theme-surface, #fff)',
          }}
        >
          <MainContainer responsive style={{ height: '100%' }}>
            <Sidebar position="left" scrollable>
              <ConversationList>
                {conversations.length === 0 ? (
                  <Conversation
                    info="친구 페이지에서 메시지를 시작하세요"
                    name="대화가 없습니다"
                  />
                ) : (
                  conversations.map((c) => {
                    const myUnread = (c.unread || {})[user.uid] || 0;
                    const isActive = c.id === activeConvId;
                    const avatarSrc =
                      c.peerPhotoURL || getInitialAvatar(c.peerName, c.peerEmail);
                    return (
                      <Conversation
                        key={c.id}
                        name={c.peerName || c.peerEmail || '(알 수 없음)'}
                        info={c.lastMessage || '대화 시작'}
                        active={isActive}
                        unreadCnt={myUnread > 0 ? myUnread : undefined}
                        onClick={() => navigate(`/dashboard/messages/${c.id}`)}
                      >
                        <Avatar src={avatarSrc} name={c.peerName || c.peerEmail || '?'} />
                      </Conversation>
                    );
                  })
                )}
              </ConversationList>
            </Sidebar>

            {activeConv ? (
              <ChatContainer>
                <ConversationHeader>
                  <Avatar
                    src={
                      activeConv.peerPhotoURL ||
                      getInitialAvatar(activeConv.peerName, activeConv.peerEmail)
                    }
                    name={activeConv.peerName || activeConv.peerEmail || '?'}
                  />
                  <ConversationHeader.Content
                    userName={activeConv.peerName || '(이름 없음)'}
                    info={activeConv.peerEmail || ''}
                  />
                </ConversationHeader>

                <MessageList>
                  {messages.length === 0 ? (
                    <MessageList.Content
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        color: '#9ca3af',
                        fontSize: 13,
                      }}
                    >
                      아직 메시지가 없습니다.
                    </MessageList.Content>
                  ) : (
                    buildMessageGroups().map((group, gi) => (
                      <MessageGroup
                        key={`${group.senderId}-${gi}`}
                        direction={group.isMine ? 'outgoing' : 'incoming'}
                      >
                        {!group.isMine && (
                          <Avatar
                            src={activeConv.peerPhotoURL || FALLBACK_AVATAR}
                            name={activeConv.peerName || '?'}
                          />
                        )}
                        <MessageGroup.Messages>
                          {group.messages.map((m) => (
                            <Message
                              key={m.id}
                              model={{
                                message: m.text,
                                sentTime: m.createdAt ? formatTime(m.createdAt) : '',
                                sender: group.isMine ? '나' : activeConv.peerName || '상대',
                                direction: group.isMine ? 'outgoing' : 'incoming',
                                position: 'single',
                              }}
                            />
                          ))}
                        </MessageGroup.Messages>
                        <MessageGroup.Footer>
                          {group.messages[group.messages.length - 1]?.createdAt
                            ? formatTime(group.messages[group.messages.length - 1].createdAt!)
                            : ''}
                        </MessageGroup.Footer>
                      </MessageGroup>
                    ))
                  )}
                </MessageList>

                <MessageInput
                  placeholder="메시지 입력..."
                  onSend={handleSend}
                  attachButton={false}
                  disabled={sending}
                  sendDisabled={sending}
                />
              </ChatContainer>
            ) : (
              <ChatContainer>
                <MessageList>
                  <MessageList.Content
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: '#6b7280',
                      fontSize: 14,
                    }}
                  >
                    좌측에서 대화를 선택하세요.
                  </MessageList.Content>
                </MessageList>
              </ChatContainer>
            )}
          </MainContainer>
        </div>
      </div>
    </div>
  );
}
