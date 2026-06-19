import { useState, type CSSProperties } from 'react';
import { Trash2 } from 'lucide-react';
import {
  getOrderDesignItems,
  getOrderDesignKey,
  type OrderDesignItem,
  type OrderRecord
} from '@/firebase/orders';

interface Props {
  order: OrderRecord;
  onOpenDesign?: (design: OrderDesignItem) => void;
  showCheckboxes?: boolean;
  showRemoveButton?: boolean;
  onRemoveDesign?: (design: OrderDesignItem) => void;
  removingDesignKey?: string | null;
  getRemoveDisabledReason?: (design: OrderDesignItem, designs: OrderDesignItem[]) => string | null;
}

export default function OrderDesignTree({
  order,
  onOpenDesign,
  showCheckboxes = false,
  showRemoveButton = false,
  onRemoveDesign,
  removingDesignKey = null,
  getRemoveDisabledReason
}: Props) {
  const designs: OrderDesignItem[] = getOrderDesignItems(order);
  const [checkedDesignKeys, setCheckedDesignKeys] = useState<Set<string>>(new Set());

  const toggleChecked = (design: OrderDesignItem) => {
    const key = getOrderDesignKey(design);
    setCheckedDesignKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderRemoveButton = (design: OrderDesignItem) => {
    if (!showRemoveButton) return null;
    const key = getOrderDesignKey(design);
    const disabledReason = designs.length <= 1
      ? '마지막 디자인은 개별 삭제할 수 없습니다'
      : getRemoveDisabledReason?.(design, designs) || null;
    const disabled = Boolean(disabledReason) || !onRemoveDesign || removingDesignKey === key;
    return (
      <button
        type="button"
        onClick={() => onRemoveDesign?.(design)}
        disabled={disabled}
        style={disabled ? disabledTrashButton : trashButton}
        title={disabledReason || '이 디자인을 발주 목록에서 삭제'}
        aria-label={`${design.designName || '디자인'} 삭제`}
      >
        <Trash2 size={14} />
      </button>
    );
  };

  const renderCheckbox = (design: OrderDesignItem) => {
    if (!showCheckboxes) return null;
    const key = getOrderDesignKey(design);
    return (
      <input
        type="checkbox"
        checked={checkedDesignKeys.has(key)}
        onChange={() => toggleChecked(design)}
        style={designCheckbox}
        aria-label={`${design.designName || '디자인'} 선택`}
      />
    );
  };

  if (designs.length === 0) {
    return <span style={mutedText}>-</span>;
  }

  if (designs.length === 1) {
    const design = designs[0];
    return (
      <div>
        <div style={singleDesignRow}>
          {renderCheckbox(design)}
          <button
            type="button"
            onClick={() => onOpenDesign?.(design)}
            disabled={!onOpenDesign}
            style={onOpenDesign ? designButton : plainDesign}
          >
            {design.designName || order.designName || '디자인'}
          </button>
          {renderRemoveButton(design)}
        </div>
        {(design.projectName || order.projectName) && (
          <div style={mutedText}>{design.projectName || order.projectName}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={treeRoot}>
        {order.orderScope === 'project' ? '프로젝트 발주' : '다중 디자인 발주'} · 디자인 {designs.length}개
      </div>
      {order.projectName && <div style={mutedText}>{order.projectName}</div>}
      <div style={treeChildren}>
        {designs.map((design, idx) => (
          <div key={`${design.projectId || ''}:${design.designId}`} style={treeChildRow}>
            {renderCheckbox(design)}
            <span style={treeLine}>{idx === designs.length - 1 ? '└' : '├'}</span>
            <button
              type="button"
              onClick={() => onOpenDesign?.(design)}
              disabled={!onOpenDesign}
              style={onOpenDesign ? childDesignButton : childPlainDesign}
            >
              {idx + 1}. {design.designName}
            </button>
            {design.projectName && design.projectName !== order.projectName && (
              <span style={childProjectText}> · {design.projectName}</span>
            )}
            {renderRemoveButton(design)}
          </div>
        ))}
      </div>
    </div>
  );
}

const treeRoot: CSSProperties = {
  fontWeight: 700,
  color: 'var(--theme-text, #1f2937)',
};

const mutedText: CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  color: 'var(--theme-text-secondary, #6b7280)',
};

const treeChildren: CSSProperties = {
  marginTop: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const treeChildRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 4,
  paddingLeft: 10,
  fontSize: 12,
};

const singleDesignRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
};

const designCheckbox: CSSProperties = {
  width: 14,
  height: 14,
  margin: 0,
  accentColor: 'var(--theme-primary, #667eea)',
  flexShrink: 0,
};

const treeLine: CSSProperties = {
  color: 'var(--theme-text-secondary, #9ca3af)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

const designButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: 'var(--theme-primary, #667eea)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 700,
  textAlign: 'left',
  textDecoration: 'underline',
  minWidth: 0,
  flex: '1 1 auto',
};

const plainDesign: CSSProperties = {
  ...designButton,
  color: 'var(--theme-text, #1f2937)',
  cursor: 'default',
  textDecoration: 'none',
};

const childDesignButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: 'var(--theme-primary, #667eea)',
  cursor: 'pointer',
  fontSize: 12,
  textAlign: 'left',
  textDecoration: 'underline',
  minWidth: 0,
  flex: '0 1 auto',
};

const childPlainDesign: CSSProperties = {
  ...childDesignButton,
  color: 'var(--theme-text, #1f2937)',
  cursor: 'default',
  textDecoration: 'none',
};

const childProjectText: CSSProperties = {
  color: 'var(--theme-text-secondary, #6b7280)',
  fontSize: 11,
};

const trashButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  padding: 0,
  marginLeft: 'auto',
  borderRadius: 6,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'var(--theme-surface, #fff)',
  color: '#ef4444',
  cursor: 'pointer',
  flexShrink: 0,
};

const disabledTrashButton: CSSProperties = {
  ...trashButton,
  color: 'var(--theme-text-secondary, #9ca3af)',
  cursor: 'not-allowed',
  opacity: 0.55,
};
