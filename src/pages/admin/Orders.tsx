/**
 * 관리자 — 전체 발주 현황 (/admin/orders)
 */
import { useEffect, useState } from 'react';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import {
  getOrderDesignKey,
  removeOrderDesign,
  type OrderDesignItem,
  type OrderRecord,
  type OrderStatus
} from '@/firebase/orders';
import OrderDesignTree from '@/components/orders/OrderDesignTree';

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

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [removingDesignKey, setRemovingDesignKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'orders'));
      const list: OrderRecord[] = snap.docs.map((d) => {
        const x = d.data();
        const ts = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null);
        const designs = Array.isArray(x.designs) ? x.designs : [];
        return {
          id: d.id,
          ordererId: x.ordererId,
          ordererName: x.ordererName,
          ordererEmail: x.ordererEmail,
          factoryId: x.factoryId,
          factoryName: x.factoryName,
          designId: x.designId,
          designName: x.designName || '',
          designs,
          orderScope: x.orderScope,
          projectId: x.projectId,
          projectName: x.projectName,
          thumbnailUrl: x.thumbnailUrl,
          formData: x.formData || {},
          status: (x.status as OrderStatus) || 'pending',
          reason: x.reason || null,
          createdAt: ts(x.createdAt),
          processedAt: ts(x.processedAt),
          updatedAt: ts(x.updatedAt),
        };
      });
      list.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      setOrders(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRemoveDesign = async (order: OrderRecord, design: OrderDesignItem) => {
    const designCount = order.designs.length || (order.designId ? 1 : 0);
    if (designCount <= 1) {
      alert('마지막 디자인은 개별 삭제할 수 없습니다.');
      return;
    }
    if (!confirm(`"${design.designName || '디자인'}"을 이 발주 목록에서 삭제할까요?`)) return;

    const key = `${order.id}:${getOrderDesignKey(design)}`;
    setRemovingDesignKey(key);
    try {
      await removeOrderDesign(order, design);
      await load();
    } catch (e) {
      alert('디자인 삭제 실패: ' + (e as Error).message);
    } finally {
      setRemovingDesignKey(null);
    }
  };

  const filtered = orders
    .filter((o) => filter === 'all' ? true : o.status === filter)
    .filter((o) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (o.designName || '').toLowerCase().includes(q) ||
        (o.factoryName || '').toLowerCase().includes(q) ||
        (o.ordererName || '').toLowerCase().includes(q) ||
        (o.ordererEmail || '').toLowerCase().includes(q)
      );
    });

  const counts = orders.reduce<Record<string, number>>((a, o) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {});

  return (
    <div style={{ padding: 32, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700 }}>발주 현황</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-text-secondary, #6b7280)' }}>
            총 {orders.length}건 · 대기 {counts.pending || 0} · 수락 {counts.accepted || 0} · 제작중 {counts.in_progress || 0} · 완료 {counts.completed || 0} · 거절 {counts.rejected || 0}
          </p>
        </div>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--theme-border, #e5e7eb)', background: 'var(--theme-surface, #fff)', cursor: 'pointer', fontSize: 13 }}>
          새로고침
        </button>
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
        <input
          type="text"
          placeholder="디자인명/공장/발주자/이메일 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--theme-border, #e5e7eb)', background: 'var(--theme-surface, #fff)', color: 'var(--theme-text, #1f2937)' }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--theme-text-secondary, #6b7280)' }}>로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--theme-text-secondary, #6b7280)' }}>발주 내역이 없습니다.</div>
      ) : (
        <div style={{ background: 'var(--theme-surface, #fff)', border: '1px solid var(--theme-border, #e5e7eb)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--theme-surface-alt, #f9fafb)' }}>
                <tr>
                  <th style={th}>상태</th>
                  <th style={th}>디자인</th>
                  <th style={th}>발주자</th>
                  <th style={th}>공장</th>
                  <th style={th}>수량</th>
                  <th style={th}>납기</th>
                  <th style={th}>신청일</th>
                  <th style={th}>처리일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--theme-border, #e5e7eb)' }}>
                    <td style={td}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: STATUS_COLOR[o.status] + '22', color: STATUS_COLOR[o.status], fontSize: 11, fontWeight: 600 }}>
                        {STATUS_LABEL[o.status]}
                      </span>
                      {o.reason && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--theme-text-secondary, #6b7280)' }}>{o.reason}</div>}
                    </td>
                    <td style={td}>
                      <OrderDesignTree
                        order={o}
                        showCheckboxes
                        showRemoveButton
                        onRemoveDesign={(design) => handleRemoveDesign(o, design)}
                        removingDesignKey={removingDesignKey?.startsWith(`${o.id}:`) ? removingDesignKey.slice(o.id.length + 1) : null}
                        getRemoveDisabledReason={(_design, designs) => (
                          designs.length <= 1 ? '마지막 디자인은 개별 삭제할 수 없습니다' : null
                        )}
                      />
                    </td>
                    <td style={td}>
                      {o.ordererName || '-'}
                      {o.ordererEmail && <div style={{ fontSize: 11, color: 'var(--theme-text-secondary, #6b7280)' }}>{o.ordererEmail}</div>}
                    </td>
                    <td style={td}>{o.factoryName || '-'}</td>
                    <td style={td}>{(o.formData as { quantity?: string | number }).quantity || '-'}</td>
                    <td style={td}>{o.formData.dueDate || '-'}</td>
                    <td style={td}>{o.createdAt ? o.createdAt.toLocaleString('ko-KR') : '-'}</td>
                    <td style={td}>{o.processedAt ? o.processedAt.toLocaleString('ko-KR') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '12px 14px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 12,
  color: 'var(--theme-text-secondary, #6b7280)',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'top',
};
