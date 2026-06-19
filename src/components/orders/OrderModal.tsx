/**
 * 발주 신청 모달 — 기업회원이 디자인에서 공장(파트너)에게 발주
 */
import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  getOrderDesignKey,
  listFactories,
  createOrder,
  type FactoryInfo,
  type OrderDesignItem,
  type OrderFormData
} from '@/firebase/orders';

// 자재 스펙 프리셋 — 드롭다운 선택지. '직접 입력' 선택 시에만 자유 입력 textarea 노출
const MATERIAL_SPEC_PRESETS = [
  '몸통: PB 18T 화이트, 백패널: MDF 9T, 도어: PET 무광 화이트, 손잡이: 무손잡이',
  '몸통: PB 18T 화이트, 백패널: MDF 9T, 도어: PET 무광 그레이, 손잡이: 브러시드 알루미늄',
  '몸통: PB 18T 그레이, 백패널: MDF 9T, 도어: PET 유광 화이트, 손잡이: 브러시드 알루미늄',
  '몸통: PB 18T 무늬목, 백패널: MDF 9T, 도어: 무늬목 도어, 손잡이: 블랙 바 손잡이',
] as const;
const MATERIAL_SPEC_CUSTOM = '__custom__';

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  designId?: string;
  designName?: string;
  designs?: OrderDesignItem[];
  orderScope?: 'design' | 'multi-design' | 'project';
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
  designs,
  orderScope,
  projectId,
  projectName,
  thumbnailUrl,
  onSuccess,
}: OrderModalProps) {
  const initialOrderDesigns = useMemo<OrderDesignItem[]>(() => (
    designs?.length
      ? designs
      : designId
        ? [{ designId, designName: designName || '', projectId, projectName, thumbnailUrl }]
        : []
  ), [designId, designName, designs, projectId, projectName, thumbnailUrl]);
  const [modalDesigns, setModalDesigns] = useState<OrderDesignItem[]>(initialOrderDesigns);
  const [checkedDesignKeys, setCheckedDesignKeys] = useState<Set<string>>(
    () => new Set(initialOrderDesigns.map(getOrderDesignKey))
  );
  const orderDesigns = modalDesigns.filter(item => checkedDesignKeys.has(getOrderDesignKey(item)));
  const firstDesign = orderDesigns[0];
  const displayDesignName = orderDesigns.length > 1
    ? `${firstDesign?.designName || '디자인'} 외 ${orderDesigns.length - 1}개`
    : firstDesign?.designName || designName || '';
  const orderFileCount = orderDesigns.length;
  const effectiveOrderScope: 'design' | 'multi-design' | 'project' = orderScope === 'project' && orderDesigns.length === modalDesigns.length
    ? 'project'
    : orderDesigns.length > 1
      ? 'multi-design'
      : 'design';
  const displayOrderSummary = orderFileCount > 1
    ? `디자인 파일 ${orderFileCount}개`
    : displayDesignName || '선택된 디자인 없음';
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
  // 자재 스펙 드롭다운 선택값 ('' = 미선택, 프리셋 문자열, 또는 직접 입력)
  const [materialSpecChoice, setMaterialSpecChoice] = useState<string>('');

  useEffect(() => {
    if (!isOpen) {
      setMaterialSpecChoice('');
      return;
    }
    setModalDesigns(initialOrderDesigns);
    setCheckedDesignKeys(new Set(initialOrderDesigns.map(getOrderDesignKey)));
    setFactoriesLoading(true);
    listFactories()
      .then((list) => setFactories(list))
      .finally(() => setFactoriesLoading(false));
  }, [initialOrderDesigns, isOpen]);

  if (!isOpen) return null;

  const update = (k: keyof OrderFormData, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // 드롭다운 선택: 프리셋이면 materialSpec에 바로 반영, '직접 입력'이면 비우고 textarea 노출
  const handleMaterialSpecChoice = (v: string) => {
    setMaterialSpecChoice(v);
    if (v === MATERIAL_SPEC_CUSTOM) {
      update('materialSpec', '');
    } else {
      update('materialSpec', v);
    }
  };

  const toggleDesignChecked = (design: OrderDesignItem) => {
    const key = getOrderDesignKey(design);
    setCheckedDesignKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const removeDesignFromModal = (design: OrderDesignItem) => {
    if (modalDesigns.length <= 1) {
      setError('발주 목록에는 최소 1개의 디자인이 필요합니다.');
      return;
    }
    const key = getOrderDesignKey(design);
    setModalDesigns(prev => prev.filter(item => getOrderDesignKey(item) !== key));
    setCheckedDesignKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setError(null);
  };

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
    if (orderDesigns.length === 0) {
      setError('발주할 디자인이 없습니다.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const r = await createOrder({
        factoryId: selectedFactoryId,
        designId: firstDesign?.designId,
        designName: displayDesignName,
        designs: orderDesigns,
        orderScope: effectiveOrderScope,
        projectId,
        projectName,
        thumbnailUrl: firstDesign?.thumbnailUrl || thumbnailUrl,
        formData: form,
      });
      const successLines = [
        '발주 요청이 전송되었습니다.',
        '',
        `총 발주 파일: ${orderFileCount}개`,
        effectiveOrderScope === 'project' ? '발주 범위: 프로젝트 전체' : orderFileCount > 1 ? '발주 범위: 선택한 디자인 파일' : '',
        projectName ? `프로젝트: ${projectName}` : '',
        orderFileCount === 1 && firstDesign?.designName ? `디자인: ${firstDesign.designName}` : '',
      ].filter(Boolean);
      alert(successLines.join('\n'));
      onSuccess?.(r.orderId);
      onClose();
    } catch (e) {
      const err = e as { code?: string; message?: string; details?: unknown };
      console.error('발주 실패 상세:', err);
      const msg = [err.code, err.message].filter(Boolean).join(' - ') || '알 수 없는 오류';
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
            <div style={{ fontSize: 11, color: 'var(--theme-text-secondary, #6b7280)', marginBottom: 4 }}>
              {orderScope === 'project' ? '프로젝트 발주' : modalDesigns.length > 1 ? '다중 디자인 발주' : '디자인'}
            </div>
            <div style={{ fontWeight: 600 }}>{displayOrderSummary}</div>
            {projectName && <div style={{ fontSize: 12, color: 'var(--theme-text-secondary, #6b7280)' }}>프로젝트: {projectName}</div>}
            <div style={{ marginTop: 10, maxHeight: 150, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {modalDesigns.map((item, idx) => {
                const key = getOrderDesignKey(item);
                const checked = checkedDesignKeys.has(key);
                return (
                  <div key={key} style={designRowStyle}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDesignChecked(item)}
                      style={designCheckboxStyle}
                      aria-label={`${item.designName || '디자인'} 발주 포함`}
                    />
                    <div style={{ ...designNameStyle, opacity: checked ? 1 : 0.5 }}>
                      <span>{idx + 1}. {item.designName || '디자인'}</span>
                      {item.projectName && item.projectName !== projectName && (
                        <span style={designProjectStyle}> · {item.projectName}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDesignFromModal(item)}
                      disabled={modalDesigns.length <= 1}
                      style={modalDesigns.length <= 1 ? disabledTrashButtonStyle : trashButtonStyle}
                      title={modalDesigns.length <= 1 ? '발주 목록에는 최소 1개의 디자인이 필요합니다' : '목록에서 제거'}
                      aria-label={`${item.designName || '디자인'} 목록에서 제거`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
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
            <select
              value={materialSpecChoice}
              onChange={(e) => handleMaterialSpecChoice(e.target.value)}
              style={inputStyle}
            >
              <option value="">— 자재 스펙을 선택해주세요 —</option>
              {MATERIAL_SPEC_PRESETS.map((preset) => (
                <option key={preset} value={preset}>{preset}</option>
              ))}
              <option value={MATERIAL_SPEC_CUSTOM}>직접 입력</option>
            </select>
            {materialSpecChoice === MATERIAL_SPEC_CUSTOM && (
              <textarea
                value={form.materialSpec}
                onChange={(e) => update('materialSpec', e.target.value)}
                placeholder={'예) 몸통: PB 18T 화이트, 백패널: MDF 9T, 도어: PET 무광 그레이, 손잡이: 브러시드 알루미늄'}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginTop: 8 }}
              />
            )}
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
              disabled={submitting || factories.length === 0 || orderDesigns.length === 0}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--theme-primary, #667eea)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: submitting ? 'wait' : orderDesigns.length === 0 ? 'not-allowed' : 'pointer',
                opacity: submitting || orderDesigns.length === 0 ? 0.7 : 1,
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

const designRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 30,
  padding: '4px 6px',
  borderRadius: 8,
  background: 'var(--theme-surface, #ffffff)',
  border: '1px solid var(--theme-border, #e5e7eb)',
};

const designCheckboxStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  margin: 0,
  accentColor: 'var(--theme-primary, #667eea)',
  flexShrink: 0,
};

const designNameStyle: React.CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  fontSize: 12,
  color: 'var(--theme-text, #1f2937)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const designProjectStyle: React.CSSProperties = {
  color: 'var(--theme-text-secondary, #6b7280)',
};

const trashButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  padding: 0,
  borderRadius: 6,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'var(--theme-surface, #ffffff)',
  color: '#ef4444',
  cursor: 'pointer',
  flexShrink: 0,
};

const disabledTrashButtonStyle: React.CSSProperties = {
  ...trashButtonStyle,
  color: 'var(--theme-text-secondary, #9ca3af)',
  cursor: 'not-allowed',
  opacity: 0.55,
};
