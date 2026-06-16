import type { CSSProperties } from 'react';
import type { OrderDesignItem, OrderRecord } from '@/firebase/orders';

interface Props {
  order: OrderRecord;
  onOpenDesign?: (design: OrderDesignItem) => void;
}

export default function OrderDesignTree({ order, onOpenDesign }: Props) {
  const designs: OrderDesignItem[] = order.designs.length > 0
    ? order.designs
    : order.designId
      ? [{
        designId: order.designId,
        designName: order.designName || '디자인',
        projectId: order.projectId,
        projectName: order.projectName,
        thumbnailUrl: order.thumbnailUrl,
      }]
      : [];

  if (designs.length === 0) {
    return <span style={mutedText}>-</span>;
  }

  if (designs.length === 1) {
    return (
      <div>
        <button
          type="button"
          onClick={() => onOpenDesign?.(designs[0])}
          disabled={!onOpenDesign}
          style={onOpenDesign ? designButton : plainDesign}
        >
          {designs[0].designName || order.designName || '디자인'}
        </button>
        {(designs[0].projectName || order.projectName) && (
          <div style={mutedText}>{designs[0].projectName || order.projectName}</div>
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
