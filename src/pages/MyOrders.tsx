/**
 * 발주자(기업회원) 발주 현황 — /dashboard/orders
 */
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { listMyOrders, type OrderRecord, type OrderStatus } from '@/firebase/orders';
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
  pending: '#3b82f6',
  accepted: '#10b981',
  rejected: '#ef4444',
  in_progress: '#f59e0b',
  completed: '#7c3aed',
  cancelled: '#6b7280',
};

export default function MyOrders() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    listMyOrders(user.uid)
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [user?.uid]);

  if (authLoading) return <LoadingSpinner fullscreen message="확인 중..." />;
  if (!user) return <Navigate to="/login" replace />;

  const filtered = orders.filter((o) => filter === 'all' ? true : o.status === filter);
  const counts = orders.reduce<Record<string, number>>((a, o) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {});

  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-background, #f9fafb)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700, color: 'var(--theme-text, #1f2937)' }}>발주 현황</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-text-secondary, #6b7280)' }}>
              총 {orders.length}건 · 대기 {counts.pending || 0} · 수락 {counts.accepted || 0} · 제작중 {counts.in_progress || 0} · 완료 {counts.completed || 0}
            </p>
          </div>
          <button onClick={() => navigate('/dashboard')} style={btnSecondary}>대시보드</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['all', 'pending', 'accepted', 'in_progress', 'completed', 'rejected'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s as OrderStatus | 'all')}
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

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--theme-text-secondary, #6b7280)' }}>로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--theme-text-secondary, #6b7280)' }}>발주 내역이 없습니다.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
            {filtered.map((o) => (
              <div key={o.id} style={{
                background: 'var(--theme-surface, #ffffff)',
                border: '1px solid var(--theme-border, #e5e7eb)',
                borderRadius: 12,
                padding: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: STATUS_COLOR[o.status] + '22', color: STATUS_COLOR[o.status] }}>
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

                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  <Row label="공장" value={o.factoryName || '-'} />
                  {o.formData.quantity && <Row label="수량" value={o.formData.quantity} />}
                  {o.formData.dueDate && <Row label="납기" value={o.formData.dueDate} />}
                  {o.processedAt && <Row label="처리일" value={o.processedAt.toLocaleString('ko-KR')} />}
                  {o.reason && <Row label="사유" value={o.reason} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ minWidth: 60, color: 'var(--theme-text-secondary, #6b7280)' }}>{label}</span>
      <span style={{ flex: 1, color: 'var(--theme-text, #1f2937)' }}>{value}</span>
    </div>
  );
}

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
