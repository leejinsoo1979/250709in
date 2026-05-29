/**
 * 친구 목록 페이지 — /dashboard/friends
 */
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import {
  subscribeFriends,
  subscribeReceivedRequests,
  respondFriendRequest,
  removeFriend,
  ensureConversation,
  type FriendRecord,
  type FriendRequestRecord,
} from '@/firebase/friends';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import AddFriendModal from '@/components/friends/AddFriendModal';

export default function Friends() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [requests, setRequests] = useState<FriendRequestRecord[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<'friends' | 'requests'>('friends');

  useEffect(() => {
    if (!user?.uid) return;
    const unsub1 = subscribeFriends(user.uid, setFriends);
    const unsub2 = subscribeReceivedRequests(user.uid, setRequests);
    return () => { unsub1(); unsub2(); };
  }, [user?.uid]);

  if (authLoading) return <LoadingSpinner fullscreen message="확인 중..." />;
  if (!user) return <Navigate to="/login" replace />;

  const handleMessage = async (friendUid: string) => {
    const convId = await ensureConversation(user.uid, friendUid);
    navigate(`/dashboard/messages/${convId}`);
  };

  const handleRemove = async (friendUid: string, friendName: string) => {
    if (!confirm(`${friendName || '이 친구'}를 친구목록에서 삭제할까요?`)) return;
    await removeFriend(user.uid, friendUid);
  };

  const handleAccept = async (reqId: string) => {
    await respondFriendRequest(reqId, 'accepted');
  };
  const handleReject = async (reqId: string) => {
    await respondFriendRequest(reqId, 'rejected');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-background, #f9fafb)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 700, color: 'var(--theme-text, #1f2937)' }}>친구</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-text-secondary, #6b7280)' }}>
              총 {friends.length}명 · 받은 요청 {requests.length}건
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigate('/dashboard')} style={btnSecondary}>대시보드</button>
            <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ 친구 추가</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--theme-border, #e5e7eb)' }}>
          <TabBtn active={tab === 'friends'} onClick={() => setTab('friends')}>친구 목록 ({friends.length})</TabBtn>
          <TabBtn active={tab === 'requests'} onClick={() => setTab('requests')}>
            받은 요청 {requests.length > 0 && <span style={badge}>{requests.length}</span>}
          </TabBtn>
        </div>

        {tab === 'friends' && (
          <div style={card}>
            {friends.length === 0 ? (
              <EmptyState icon="👥" title="아직 친구가 없습니다" desc="이메일로 친구를 검색해 추가해보세요." />
            ) : (
              <div>
                {friends.map((f) => (
                  <div key={f.uid} style={row}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div style={avatar}>
                        {f.photoURL
                          ? <img src={f.photoURL} alt="" style={imgFit} />
                          : (f.name?.[0] || f.email?.[0] || '?').toUpperCase()
                        }
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{f.name || '(이름 없음)'}</div>
                        <div style={{ fontSize: 12, color: 'var(--theme-text-secondary, #6b7280)' }}>{f.email}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleMessage(f.uid)} style={btnSm}>메시지</button>
                      <button onClick={() => handleRemove(f.uid, f.name || '')} style={btnSmDanger}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'requests' && (
          <div style={card}>
            {requests.length === 0 ? (
              <EmptyState icon="📨" title="받은 친구 요청이 없습니다" desc="" />
            ) : (
              <div>
                {requests.map((r) => (
                  <div key={r.id} style={row}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div style={avatar}>
                        {(r.fromName?.[0] || r.fromEmail?.[0] || '?').toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{r.fromName || '(이름 없음)'}</div>
                        <div style={{ fontSize: 12, color: 'var(--theme-text-secondary, #6b7280)' }}>{r.fromEmail}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleAccept(r.id)} style={btnSmPrimary}>수락</button>
                      <button onClick={() => handleReject(r.id)} style={btnSm}>거절</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showAdd && <AddFriendModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
        fontSize: 14, fontWeight: 600,
        color: active ? 'var(--theme-primary, #3b82f6)' : 'var(--theme-text-secondary, #6b7280)',
        borderBottom: active ? '2px solid var(--theme-primary, #3b82f6)' : '2px solid transparent',
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--theme-text, #1f2937)', marginBottom: 6 }}>{title}</div>
      {desc && <div style={{ fontSize: 13, color: 'var(--theme-text-secondary, #6b7280)' }}>{desc}</div>}
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'var(--theme-surface, #fff)', borderRadius: 12,
  border: '1px solid var(--theme-border, #e5e7eb)', overflow: 'hidden',
};
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '14px 16px',
  borderBottom: '1px solid var(--theme-border, #e5e7eb)',
};
const avatar: React.CSSProperties = {
  width: 40, height: 40, borderRadius: '50%', background: 'var(--theme-primary, #3b82f6)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16,
  flexShrink: 0, overflow: 'hidden',
};
const imgFit: React.CSSProperties = { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' };
const btnPrimary: React.CSSProperties = {
  padding: '10px 16px', background: 'var(--theme-primary, #3b82f6)', color: '#fff', border: 'none',
  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '10px 16px', background: 'var(--theme-surface, #fff)', color: 'var(--theme-text, #374151)',
  border: '1px solid var(--theme-border, #d1d5db)', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const btnSm: React.CSSProperties = {
  padding: '6px 12px', background: 'var(--theme-surface, #fff)', color: 'var(--theme-text, #374151)',
  border: '1px solid var(--theme-border, #d1d5db)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnSmPrimary: React.CSSProperties = {
  padding: '6px 12px', background: 'var(--theme-primary, #3b82f6)', color: '#fff', border: 'none',
  borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnSmDanger: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--theme-surface, #fff)',
  color: 'var(--theme-danger, #b91c1c)',
  border: '1px solid var(--theme-danger-light, #fecaca)',
  borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const badge: React.CSSProperties = {
  display: 'inline-block', minWidth: 18, padding: '2px 6px', marginLeft: 4,
  background: 'var(--theme-danger, #ef4444)', color: '#fff', borderRadius: 9, fontSize: 11, fontWeight: 700,
};
