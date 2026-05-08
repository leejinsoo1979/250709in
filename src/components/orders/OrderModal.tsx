/**
 * 발주 신청 모달 — 기업회원이 디자인에서 공장(파트너)에게 발주
 */
import { useEffect, useState } from 'react';
import { listFactories, createOrder, type FactoryInfo, type OrderFormData } from '@/firebase/orders';

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  designId: string;
  designName: string;
  projectId?: string;
  projectName?: string;
  thumbnailUrl?: string;
  onSuccess?: (orderId: string) => void;
}

export default function OrderModal({
  isOpen,
  onClose,
  designId,
  designName,
  projectId,
  projectName,
  thumbnailUrl,
  onSuccess,
}: OrderModalProps) {
  const [factories, setFactories] = useState<FactoryInfo[]>([]);
  const [factoriesLoading, setFactoriesLoading] = useState(false);
  const [selectedFactoryId, setSelectedFactoryId] = useState<string>('');
  const [form, setForm] = useState<OrderFormData>({
    materialSpec: '',
    dueDate: '',
    deliveryAddress: '',
    installSchedule: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFactoriesLoading(true);
    listFactories()
      .then((list) => setFactories(list))
      .finally(() => setFactoriesLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const update = (k: keyof OrderFormData, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!selectedFactoryId) {
      setError('공장을 선택해주세요.');
      return;
    }
    if (!form.materialSpec?.trim()) {
      setError('자재 스펙을 입력해주세요.');
      return;
    }
    if (!form.dueDate?.trim()) {
      setError('납기일을 입력해주세요.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const r = await createOrder({
        factoryId: selectedFactoryId,
        designId,
        designName,
        projectId,
        projectName,
        thumbnailUrl,
        formData: form,
      });
      alert('발주 요청이 전송되었습니다.');
      onSuccess?.(r.orderId);
      onClose();
    } catch (e) {
      const msg = (e as { message?: string }).message || '알 수 없는 오류';
      setError('발주 실패: ' + msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--theme-surface, #ffffff)',
          color: 'var(--theme-text, #1f2937)',
          borderRadius: 16,
          padding: '32px',
          width: 'min(560px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          border: '1px solid var(--theme-border, #e5e7eb)',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>발주 요청</h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--theme-text-secondary, #6b7280)' }}>
          공장(파트너)에게 디자인 발주를 요청합니다.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 디자인 정보 */}
          <div style={{ padding: '12px 14px', background: 'var(--theme-surface-alt, #f9fafb)', borderRadius: 10, border: '1px solid var(--theme-border, #e5e7eb)' }}>
            <div style={{ fontSize: 11, color: 'var(--theme-text-secondary, #6b7280)', marginBottom: 4 }}>디자인</div>
            <div style={{ fontWeight: 600 }}>{designName}</div>
            {projectName && <div style={{ fontSize: 12, color: 'var(--theme-text-secondary, #6b7280)' }}>프로젝트: {projectName}</div>}
          </div>

          {/* 공장 선택 */}
          <div>
            <label style={labelStyle}>공장 선택 <span style={{ color: '#ef4444' }}>*</span></label>
            {factoriesLoading ? (
              <div style={{ padding: 12, fontSize: 13, color: 'var(--theme-text-secondary, #6b7280)' }}>공장 목록 불러오는 중...</div>
            ) : factories.length === 0 ? (
              <div style={{ padding: 12, fontSize: 13, color: '#ef4444' }}>등록된 공장이 없습니다. 관리자에게 문의해주세요.</div>
            ) : (
              <select
                value={selectedFactoryId}
                onChange={(e) => setSelectedFactoryId(e.target.value)}
                style={inputStyle}
              >
                <option value="">— 공장을 선택해주세요 —</option>
                {factories.map((f) => (
                  <option key={f.uid} value={f.uid}>{f.displayName}{f.email ? ` (${f.email})` : ''}</option>
                ))}
              </select>
            )}
          </div>

          {/* 자재 스펙 */}
          <div>
            <label style={labelStyle}>자재 스펙 <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea
              value={form.materialSpec}
              onChange={(e) => update('materialSpec', e.target.value)}
              placeholder={'예) 몸통: PB 18T 화이트, 백패널: MDF 9T, 도어: PET 무광 그레이, 손잡이: 브러시드 알루미늄'}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* 납기 */}
          <div>
            <label style={labelStyle}>납기일 <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="date" value={form.dueDate} onChange={(e) => update('dueDate', e.target.value)} style={inputStyle} />
          </div>

          {/* 배송지 */}
          <div>
            <label style={labelStyle}>배송지 주소</label>
            <input type="text" value={form.deliveryAddress} onChange={(e) => update('deliveryAddress', e.target.value)} placeholder="완성품 배송 주소 또는 설치 장소" style={inputStyle} />
          </div>

          {/* 설치 일정 */}
          <div>
            <label style={labelStyle}>설치 일정</label>
            <input type="text" value={form.installSchedule} onChange={(e) => update('installSchedule', e.target.value)} placeholder="예: 2026-06-15 오전" style={inputStyle} />
          </div>

          {/* 특이사항 */}
          <div>
            <label style={labelStyle}>특이사항 / 요청사항</label>
            <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="공장에 전달할 추가 요청 사항을 적어주세요" rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: '1px solid var(--theme-border, #e5e7eb)',
                background: 'transparent',
                color: 'var(--theme-text, #1f2937)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || factories.length === 0}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--theme-primary, #667eea)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? '전송 중...' : '발주 요청'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  color: 'var(--theme-text-secondary, #6b7280)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--theme-border, #d1d5db)',
  background: 'var(--theme-surface, #ffffff)',
  color: 'var(--theme-text, #1f2937)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};
