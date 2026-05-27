/**
 * 키큰장 우클릭 EP 컨텍스트 메뉴 — Canvas 바깥에서 렌더링
 * - 좌/우/양쪽 EP 토글
 * - 활성된 EP 아래 옵셋(앞/뒤) / 갭(상/하) 인라인 입력 펼침
 * - 가구 설정 팝업의 동일 필드와 연동 (leftEndPanelOffset, rightEndPanelOffset,
 *   leftEndPanelBackOffset, rightEndPanelBackOffset, endPanelTopOffset, endPanelBottomOffset)
 */
import { useEffect, useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';

type Side = 'left' | 'right';
type OffsetDir = 'front' | 'back';
type GapDir = 'top' | 'bottom';

export default function TallEpContextMenu() {
  const menu = useUIStore((s) => s.tallEpContextMenu);
  const closeMenu = useUIStore((s) => s.closeTallEpContextMenu);
  const placedModules = useFurnitureStore((s) => s.placedModules);
  const updatePlacedModule = useFurnitureStore((s) => s.updatePlacedModule);

  // 옵셋/갭 방향 토글 상태 (side별)
  const [offsetDir, setOffsetDir] = useState<{ left: OffsetDir; right: OffsetDir }>({ left: 'front', right: 'front' });
  const [gapDir, setGapDir] = useState<{ left: GapDir; right: GapDir }>({ left: 'top', right: 'top' });

  // ESC 키로 닫기
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, closeMenu]);

  if (!menu) return null;

  const placedModule = placedModules.find((m) => m.id === menu.moduleId);
  if (!placedModule) {
    closeMenu();
    return null;
  }

  const cur = placedModule as any;
  const items: Array<{ id: 'left' | 'right' | 'both'; label: string }> = [
    { id: 'left', label: '좌 EP' },
    { id: 'right', label: '우 EP' },
    { id: 'both', label: '양쪽 EP' },
  ];

  const toggleEp = (id: 'left' | 'right' | 'both', active: boolean) => {
    const next = active
      ? { hasLeftEndPanel: false, hasRightEndPanel: false }
      : id === 'left'
        ? { hasLeftEndPanel: true, hasRightEndPanel: false }
        : id === 'right'
          ? { hasLeftEndPanel: false, hasRightEndPanel: true }
          : { hasLeftEndPanel: true, hasRightEndPanel: true };
    updatePlacedModule(placedModule.id, next);
  };

  // 옵셋 입력 값/저장 키
  const getOffsetValue = (side: Side, dir: OffsetDir): number => {
    const key = dir === 'front'
      ? (side === 'left' ? 'leftEndPanelOffset' : 'rightEndPanelOffset')
      : (side === 'left' ? 'leftEndPanelBackOffset' : 'rightEndPanelBackOffset');
    return Number(cur[key] ?? 0);
  };
  const setOffsetValue = (side: Side, dir: OffsetDir, value: number) => {
    const key = dir === 'front'
      ? (side === 'left' ? 'leftEndPanelOffset' : 'rightEndPanelOffset')
      : (side === 'left' ? 'leftEndPanelBackOffset' : 'rightEndPanelBackOffset');
    updatePlacedModule(placedModule.id, { [key]: value } as any);
  };

  // 갭 입력 값/저장 키 (좌우 공통 필드)
  const getGapValue = (dir: GapDir): number => {
    const key = dir === 'top' ? 'endPanelTopOffset' : 'endPanelBottomOffset';
    return Number(cur[key] ?? 0);
  };
  const setGapValue = (dir: GapDir, value: number) => {
    const key = dir === 'top' ? 'endPanelTopOffset' : 'endPanelBottomOffset';
    updatePlacedModule(placedModule.id, { [key]: value } as any);
  };

  // 인라인 컨트롤 (활성 EP 아래)
  const renderControls = (side: Side) => {
    const od = offsetDir[side];
    const gd = gapDir[side];
    return (
      <div style={{ padding: '8px 14px 12px 28px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid #f1f3f7' }}>
        {/* 옵셋 */}
        <ControlRow label="옵셋">
          <Toggle
            options={[{ id: 'front', label: '앞' }, { id: 'back', label: '뒤' }] as const}
            value={od}
            onChange={(v) => setOffsetDir((prev) => ({ ...prev, [side]: v }))}
          />
          <NumberInput
            value={getOffsetValue(side, od)}
            onChange={(v) => setOffsetValue(side, od, v)}
          />
        </ControlRow>
        {/* 갭 */}
        <ControlRow label="갭">
          <Toggle
            options={[{ id: 'top', label: '상' }, { id: 'bottom', label: '하' }] as const}
            value={gd}
            onChange={(v) => setGapDir((prev) => ({ ...prev, [side]: v }))}
          />
          <NumberInput
            value={getGapValue(gd)}
            onChange={(v) => setGapValue(gd, v)}
          />
        </ControlRow>
      </div>
    );
  };

  return (
    <>
      {/* 투명 오버레이 (메뉴 바깥 클릭 감지) */}
      <div
        onClick={closeMenu}
        onContextMenu={(e) => { e.preventDefault(); closeMenu(); }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99998,
          background: 'transparent',
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: menu.x,
          top: menu.y,
          minWidth: 240,
          background: '#ffffff',
          border: '1px solid #e6ebf5',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          padding: '6px 0',
          fontSize: 13,
          zIndex: 99999,
          color: '#1a1a1a',
        }}
      >
        {items.map((opt) => {
          const active =
            (opt.id === 'left' && cur.hasLeftEndPanel && !cur.hasRightEndPanel) ||
            (opt.id === 'right' && cur.hasRightEndPanel && !cur.hasLeftEndPanel) ||
            (opt.id === 'both' && cur.hasLeftEndPanel && cur.hasRightEndPanel);
          return (
            <div key={opt.id}>
              <button
                onClick={() => toggleEp(opt.id, active)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 14px',
                  background: active ? 'rgba(114,105,239,0.1)' : 'transparent',
                  border: 'none',
                  color: active ? 'var(--theme-primary, #7269ef)' : '#1a1a1a',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span style={{ flex: 1 }}>{opt.label}</span>
                {active && <span style={{ color: 'var(--theme-primary, #7269ef)' }}>✓</span>}
              </button>
              {/* 활성된 EP 아래에 옵셋/갭 컨트롤 펼침 */}
              {active && opt.id === 'left' && renderControls('left')}
              {active && opt.id === 'right' && renderControls('right')}
              {active && opt.id === 'both' && (
                <>
                  <div style={{ padding: '4px 14px 0', fontSize: 11, color: '#7a7f9a', fontWeight: 600 }}>좌측</div>
                  {renderControls('left')}
                  <div style={{ padding: '4px 14px 0', fontSize: 11, color: '#7a7f9a', fontWeight: 600 }}>우측</div>
                  {renderControls('right')}
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============================================
// 내부 헬퍼 컴포넌트
// ============================================
function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ width: 30, fontSize: 12, color: '#7a7f9a' }}>{label}</span>
      {children}
    </div>
  );
}

function Toggle<T extends string>({ options, value, onChange }: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid #e6ebf5', borderRadius: 6, overflow: 'hidden' }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              padding: '4px 10px',
              border: 'none',
              background: active ? 'var(--theme-primary, #7269ef)' : '#ffffff',
              color: active ? '#ffffff' : '#1a1a1a',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: 28,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: 1 }}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          const n = parseFloat(text);
          if (!Number.isNaN(n)) onChange(n);
          else setText(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const n = parseFloat(text);
            if (!Number.isNaN(n)) onChange(n);
            (e.currentTarget as HTMLInputElement).blur();
            return;
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            const delta = e.key === 'ArrowUp' ? step : -step;
            const base = parseFloat(text);
            const cur = Number.isNaN(base) ? value : base;
            const next = cur + delta;
            setText(String(next));
            onChange(next);
          }
        }}
        style={{
          flex: 1,
          width: 60,
          padding: '4px 8px',
          border: '1px solid #e6ebf5',
          borderRadius: 6,
          outline: 'none',
          fontSize: 12,
          background: '#ffffff',
          color: '#1a1a1a',
          textAlign: 'right',
        }}
      />
      <span style={{ fontSize: 11, color: '#7a7f9a' }}>mm</span>
    </div>
  );
}
