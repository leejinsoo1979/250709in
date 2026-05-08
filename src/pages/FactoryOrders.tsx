/**
 * 공장(파트너) 전용 — 받은 발주 목록 페이지
 * /factory/orders
 */
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import {
  listFactoryOrders,
  processOrder,
  type OrderRecord,
  type OrderStatus,
} from '@/firebase/orders';
import { ensureConversation } from '@/firebase/friends';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '대기',
  accepted: '수락',
  rejected: '거절',
  in_progress: '제작 중',
  completed: '완료',
  cancelled: '취소',
};
const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: 'var(--theme-primary, #3b82f6)',
  accepted: '#10b981',
  rejected: '#ef4444',
  in_progress: '#f59e0b',
  completed: '#7c3aed',
  cancelled: '#6b7280',
};

interface OrdererInfo {
  uid: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  businessNumber?: string;
  address?: string;
  photoURL?: string;
}

export default function FactoryOrders() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [checkingPartner, setCheckingPartner] = useState(true);
  const [isPartner, setIsPartner] = useState(false);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ordererInfo, setOrdererInfo] = useState<OrdererInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (authLoading) return;
      if (!user?.uid) { setCheckingPartner(false); return; }
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!cancelled) {
          setIsPartner(userDoc.exists() && !!(userDoc.data() as { isPartner?: boolean }).isPartner);
        }
      } finally {
        if (!cancelled) setCheckingPartner(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const load = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const list = await listFactoryOrders(user.uid);
      setOrders(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPartner && user?.uid) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPartner, user?.uid]);

  if (authLoading || checkingPartner) return <LoadingSpinner fullscreen message="확인 중..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isPartner) return <Navigate to="/demo" replace />;

  const handleAction = async (orderId: string, action: 'accept' | 'reject' | 'in_progress' | 'complete') => {
    let reason: string | undefined;
    if (action === 'reject') {
      const r = prompt('거절 사유를 입력해주세요:');
      if (r === null) return;
      reason = r;
    }
    setBusyId(orderId);
    try {
      await processOrder({ orderId, action, reason });
      await load();
    } catch (e) {
      alert('처리 실패: ' + (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleShowOrderer = async (o: OrderRecord) => {
    setLoadingInfo(true);
    setOrdererInfo({ uid: o.ordererId, name: o.ordererName, email: o.ordererEmail });
    try {
      const [userSnap, profileSnap] = await Promise.all([
        getDoc(doc(db, 'users', o.ordererId)),
        getDoc(doc(db, 'userProfiles', o.ordererId)),
      ]);
      const u = userSnap.exists() ? (userSnap.data() as any) : {};
      const p = profileSnap.exists() ? (profileSnap.data() as any) : {};
      setOrdererInfo({
        uid: o.ordererId,
        name: u.displayName || u.name || o.ordererName || '',
        email: u.email || o.ordererEmail || '',
        phone: u.phone || p.phone || '',
        companyName: u.companyName || p.companyName || '',
        businessNumber: u.businessNumber || p.businessNumber || '',
        address: u.address || p.address || '',
        photoURL: u.photoURL || p.photoURL || '',
      });
    } catch (e) {
      console.error('[발주자 정보 조회 실패]', e);
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleSendMessage = async (ordererUid: string) => {
    if (!user?.uid) return;
    try {
      const convId = await ensureConversation(user.uid, ordererUid);
      navigate(`/dashboard/messages/${convId}`);
    } catch (e: any) {
      alert('메시지 시작 실패: ' + (e?.message || ''));
    }
  };

  const filtered = orders.filter((o) => filter === 'all' ? true : o.status === filter);
  const counts = orders.reduce<Record<string, number>>((a, o) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {});

  // 표시할 필터 (거절 제외)
  const visibleFilters: (OrderStatus | 'all')[] = ['all', 'pending', 'accepted', 'in_progress', 'completed'];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-background, #f9fafb)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700, color: 'var(--theme-text, #1f2937)' }}>받은 발주</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-text-secondary, #6b7280)' }}>
              총 {orders.length}건 · 대기 {counts.pending || 0} · 수락 {counts.accepted || 0} · 제작중 {counts.in_progress || 0} · 완료 {counts.completed || 0}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigate('/dashboard')} style={btnSecondary}>대시보드</button>
            <button onClick={load} style={btnSecondary}>새로고침</button>
          </div>
        </div>

        {/* 필터 (거절 제외) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {visibleFilters.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                border: '1px solid',
                borderColor: filter === s ? 'var(--theme-primary, #667eea)' : 'var(--theme-border, #e5e7eb)',
                background: filter === s ? 'var(--theme-primary, #667eea)' : 'var(--theme-surface, #fff)',
                color: filter === s ? '#fff' : 'var(--theme-text, #1f2937)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {s === 'all' ? '전체' : STATUS_LABEL[s as OrderStatus]}
              {s !== 'all' && counts[s] !== undefined && ` ${counts[s]}`}
            </button>
          ))}
        </div>

        {/* 목록 */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--theme-text-secondary, #6b7280)' }}>로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--theme-text-secondary, #6b7280)' }}>
            받은 발주가 없습니다.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
            {filtered.map((o) => (
              <div key={o.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ ...badgeStyle, background: STATUS_COLOR[o.status] + '22', color: STATUS_COLOR[o.status] }}>
                    {STATUS_LABEL[o.status]}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--theme-text-secondary, #6b7280)' }}>
                    {o.createdAt?.toLocaleString('ko-KR') || '-'}
                  </span>
                </div>

                {o.thumbnailUrl && (
                  <div style={{ width: '100%', aspectRatio: '16/10', overflow: 'hidden', borderRadius: 8, marginBottom: 12, background: '#f3f4f6' }}>
                    <img src={o.thumbnailUrl} alt={o.designName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{o.designName}</div>
                  {o.projectName && <div style={{ fontSize: 12, color: 'var(--theme-text-secondary, #6b7280)' }}>프로젝트: {o.projectName}</div>}
                </div>

                <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
                  <Row label="발주자" value={o.ordererName || o.ordererEmail || '-'} />
                  {o.formData.quantity && <Row label="수량" value={o.formData.quantity} />}
                  {o.formData.dueDate && <Row label="납기" value={o.formData.dueDate} />}
                  {o.formData.deliveryAddress && <Row label="배송지" value={o.formData.deliveryAddress} />}
                  {o.formData.installSchedule && <Row label="설치" value={o.formData.installSchedule} />}
                  {o.formData.notes && <Row label="요청사항" value={o.formData.notes} />}
                  {o.reason && <Row label="사유" value={o.reason} />}
                </div>

                {/* 액션 버튼: 디자인보기 + (대기시 수락) + 발주자정보 */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <button
                    onClick={() => navigate(`/configurator?designFileId=${o.designId}&projectId=${o.projectId || ''}&readonly=1`)}
                    style={btnSecondary}
                  >
                    디자인 보기
                  </button>
                  {o.status === 'pending' && (
                    <button
                      onClick={() => handleAction(o.id, 'accept')}
                      disabled={busyId === o.id}
                      style={btnPrimary}
                    >
                      수락
                    </button>
                  )}
                  {o.status === 'accepted' && (
                    <button
                      onClick={() => handleAction(o.id, 'in_progress')}
                      disabled={busyId === o.id}
                      style={btnPrimary}
                    >
                      제작 시작
                    </button>
                  )}
                  {o.status === 'in_progress' && (
                    <button
                      onClick={() => handleAction(o.id, 'complete')}
                      disabled={busyId === o.id}
                      style={btnPrimary}
                    >
                      완료 처리
                    </button>
                  )}
                  <button onClick={() => handleShowOrderer(o)} style={btnSecondary}>
                    발주자 정보
                  </button>
                </div>

                {/* 하단 메시지 보내기 */}
                <button
                  onClick={() => handleSendMessage(o.ordererId)}
                  style={btnMessage}
                >
                  💬 메시지 보내기
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 발주자 정보 모달 */}
      {ordererInfo && (
        <div style={modalOverlay} onClick={() => setOrdererInfo(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--theme-text, #1f2937)' }}>발주자 정보</h2>
              <button onClick={() => setOrdererInfo(null)} style={closeBtn}>×</button>
            </div>
            {loadingInfo ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--theme-text-secondary, #6b7280)' }}>로딩 중...</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div style={avatar}>
                    {ordererInfo.photoURL
                      ? <img src={ordererInfo.photoURL} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      : (ordererInfo.name?.[0] || ordererInfo.email?.[0] || '?').toUpperCase()
                    }
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--theme-text, #1f2937)' }}>{ordererInfo.name || '(이름 없음)'}</div>
                    <div style={{ fontSize: 12, color: 'var(--theme-text-secondary, #6b7280)' }}>{ordererInfo.email}</div>
                  </div>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.9 }}>
                  {ordererInfo.companyName && <Row label="회사" value={ordererInfo.companyName} />}
                  {ordererInfo.businessNumber && <Row label="사업자번호" value={ordererInfo.businessNumber} />}
                  {ordererInfo.phone && <Row label="연락처" value={ordererInfo.phone} />}
                  {ordererInfo.address && <Row label="주소" value={ordererInfo.address} />}
                  {!ordererInfo.companyName && !ordererInfo.phone && !ordererInfo.address && (
                    <div style={{ color: 'var(--theme-text-secondary, #6b7280)', fontSize: 13, padding: '12px 0' }}>
                      추가 정보가 등록되어 있지 않습니다.
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  <button onClick={() => setOrdererInfo(null)} style={{ ...btnSecondary, flex: 1 }}>닫기</button>
                  <button
                    onClick={() => { const uid = ordererInfo.uid; setOrdererInfo(null); handleSendMessage(uid); }}
                    style={{ ...btnPrimary, flex: 1 }}
                  >
                    메시지 보내기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ minWidth: 80, color: 'var(--theme-text-secondary, #6b7280)' }}>{label}</span>
      <span style={{ flex: 1, color: 'var(--theme-text, #1f2937)' }}>{value}</span>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--theme-surface, #ffffff)',
  border: '1px solid var(--theme-border, #e5e7eb)',
  borderRadius: 12,
  padding: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  display: 'flex',
  flexDirection: 'column',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--theme-primary, #3b82f6)',
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'var(--theme-surface, #fff)',
  color: 'var(--theme-text, #1f2937)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const btnMessage: React.CSSProperties = {
  width: '100%',
  marginTop: 'auto',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--theme-primary, #3b82f6)',
  background: 'transparent',
  color: 'var(--theme-primary, #3b82f6)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const modalBox: React.CSSProperties = {
  background: 'var(--theme-surface, #fff)', borderRadius: 12, padding: 24,
  width: 'min(90vw, 460px)', boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
};

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 28, cursor: 'pointer',
  color: 'var(--theme-text-secondary, #6b7280)', lineHeight: 1, padding: 0,
};

const avatar: React.CSSProperties = {
  width: 48, height: 48, borderRadius: '50%', background: 'var(--theme-primary, #3b82f6)',
  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 700, fontSize: 20, overflow: 'hidden', flexShrink: 0,
};
