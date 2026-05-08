/**
 * 발주자(기업회원) 발주 현황 — /dashboard/orders
 */
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { listMyOrders, type OrderRecord, type OrderStatus } from '@/firebase/orders';
import { ensureConversation } from '@/firebase/friends';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import OrderDocumentModal from '@/components/orders/OrderDocumentModal';

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
  const [docOrder, setDocOrder] = useState<OrderRecord | null>(null);

  const handleSendMessageToFactory = async (factoryUid: string) => {
    if (!user?.uid) return;
    try {
      const convId = await ensureConversation(user.uid, factoryUid);
      navigate(`/dashboard/messages/${convId}`);
    } catch (e: any) {
      alert('메시지 시작 실패: ' + (e?.message || ''));
    }
  };

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
          <div style={{ background: 'var(--theme-surface, #fff)', border: '1px solid var(--theme-border, #e5e7eb)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--theme-background, #f9fafb)' }}>
                <tr>
                  <th style={th}>상태</th>
                  <th style={th}>발주일시</th>
                  <th style={th}>공장</th>
                  <th style={th}>디자인 / 프로젝트</th>
                  <th style={th}>자재 스펙</th>
                  <th style={th}>납기</th>
                  <th style={th}>처리일</th>
                  <th style={{ ...th, textAlign: 'right' }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--theme-border, #e5e7eb)' }}>
                    <td style={td}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: STATUS_COLOR[o.status] + '22', color: STATUS_COLOR[o.status] }}>
                        {STATUS_LABEL[o.status]}
                      </span>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--theme-text-secondary, #6b7280)' }}>
                      {o.createdAt?.toLocaleString('ko-KR') || '-'}
                    </td>
                    <td style={td}>{o.factoryName || '-'}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{o.designName}</div>
                      {o.projectName && <div style={{ fontSize: 11, color: 'var(--theme-text-secondary, #6b7280)' }}>{o.projectName}</div>}
                    </td>
                    <td style={{ ...td, maxWidth: 220, whiteSpace: 'pre-wrap' }}>{o.formData.materialSpec || '-'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{o.formData.dueDate || '-'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--theme-text-secondary, #6b7280)' }}>
                      {o.processedAt?.toLocaleString('ko-KR') || '-'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button onClick={() => setDocOrder(o)} style={btnSm}>발주서</button>
                        <button
                          onClick={() => navigate(`/configurator?designFileId=${o.designId}&projectId=${o.projectId || ''}&readonly=1`)}
                          style={btnSm}
                        >
                          디자인
                        </button>
                        <button onClick={() => handleSendMessageToFactory(o.factoryId)} style={btnSm}>메시지</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 발주서 모달 */}
      {docOrder && (
        <OrderDocumentModal
          order={docOrder}
          onClose={() => setDocOrder(null)}
          onSendMessage={(_uid) => { const fid = docOrder.factoryId; setDocOrder(null); handleSendMessageToFactory(fid); }}
        />
      )}
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

const th: React.CSSProperties = {
  padding: '12px 14px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--theme-text-secondary, #6b7280)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 13,
  color: 'var(--theme-text, #1f2937)',
  verticalAlign: 'middle',
};

const btnSm: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'var(--theme-surface, #fff)',
  color: 'var(--theme-text, #1f2937)',
  fontSize: 12,
  fontWeight: 500,
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

const btnPrimary: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--theme-primary, #3b82f6)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnMessage: React.CSSProperties = {
  width: '100%',
  marginTop: 4,
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--theme-primary, #3b82f6)',
  background: 'transparent',
  color: 'var(--theme-primary, #3b82f6)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
