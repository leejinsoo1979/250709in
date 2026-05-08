/**
 * 친구 요청 실시간 토스트 — 새 요청이 들어오면 우상단 팝업
 * App 루트에 마운트되어 어떤 페이지에서든 표시됨
 */
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { subscribeReceivedRequests, respondFriendRequest, type FriendRequestRecord } from '@/firebase/friends';

interface ToastItem {
  req: FriendRequestRecord;
  visible: boolean;
}

export default function FriendRequestToast() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!user?.uid) {
      seenIdsRef.current = new Set();
      initializedRef.current = false;
      setToasts([]);
      return;
    }
    const unsub = subscribeReceivedRequests(user.uid, (list) => {
      // 첫 호출은 기존 요청들을 seen으로 등록만 (토스트 띄우지 않음)
      if (!initializedRef.current) {
        list.forEach((r) => seenIdsRef.current.add(r.id));
        initializedRef.current = true;
        return;
      }
      // 새로 들어온 pending 요청만 토스트로 표시
      const fresh = list.filter((r) => !seenIdsRef.current.has(r.id));
      fresh.forEach((r) => {
        seenIdsRef.current.add(r.id);
        setToasts((prev) => [...prev, { req: r, visible: true }]);
      });
      // 사라진 요청 정리 (수락/거절 후)
      const stillPending = new Set(list.map((r) => r.id));
      setToasts((prev) => prev.filter((t) => stillPending.has(t.req.id)));
    });
    return () => unsub();
  }, [user?.uid]);

  const dismiss = (reqId: string) => {
    setToasts((prev) => prev.filter((t) => t.req.id !== reqId));
  };

  const handleAccept = async (reqId: string) => {
    try {
      await respondFriendRequest(reqId, 'accepted');
    } catch (err: any) {
      alert(err?.message || '수락 실패');
    }
    dismiss(reqId);
  };
  const handleReject = async (reqId: string) => {
    try {
      await respondFriendRequest(reqId, 'rejected');
    } catch (err: any) {
      alert(err?.message || '거절 실패');
    }
    dismiss(reqId);
  };

  if (!user || toasts.length === 0) return null;

  return (
    <div style={container}>
      {toasts.map((t) => (
        <div key={t.req.id} style={toastBox}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div style={avatar}>
              {(t.req.fromName?.[0] || t.req.fromEmail?.[0] || '?').toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937', marginBottom: 2 }}>
                친구 요청
              </div>
              <div style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <strong>{t.req.fromName || '(이름 없음)'}</strong>
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.req.fromEmail}
              </div>
            </div>
            <button onClick={() => dismiss(t.req.id)} style={closeBtn} aria-label="닫기">×</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => handleAccept(t.req.id)} style={btnPrimary}>수락</button>
            <button onClick={() => handleReject(t.req.id)} style={btnSecondary}>거절</button>
            <button onClick={() => { navigate('/dashboard/friends'); dismiss(t.req.id); }} style={btnText}>
              자세히
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const container: React.CSSProperties = {
  position: 'fixed', top: 80, right: 16, zIndex: 9999,
  display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none',
};
const toastBox: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 14, width: 320,
  boxShadow: '0 12px 32px rgba(0,0,0,0.18)', border: '1px solid #e5e7eb',
  pointerEvents: 'auto',
  animation: 'friendToastIn 220ms ease-out',
};
const avatar: React.CSSProperties = {
  width: 38, height: 38, borderRadius: '50%', background: '#3b82f6', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0,
};
const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 22, color: '#9ca3af', cursor: 'pointer',
  padding: 0, lineHeight: 1, marginLeft: 4,
};
const btnPrimary: React.CSSProperties = {
  flex: 1, padding: '7px 10px', background: '#3b82f6', color: '#fff', border: 'none',
  borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  flex: 1, padding: '7px 10px', background: '#fff', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnText: React.CSSProperties = {
  padding: '7px 10px', background: 'transparent', color: '#6b7280', border: 'none',
  fontSize: 12, cursor: 'pointer', fontWeight: 500,
};
