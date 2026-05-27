/**
 * 키큰장 우클릭 EP 컨텍스트 메뉴 — Canvas 바깥에서 렌더링
 * - uiStore.tallEpContextMenu 를 구독해서 위치/모듈ID 가져옴
 * - 선택 시 placedModule 의 hasLeftEndPanel / hasRightEndPanel 토글
 */
import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';

export default function TallEpContextMenu() {
  const menu = useUIStore((s) => s.tallEpContextMenu);
  const closeMenu = useUIStore((s) => s.closeTallEpContextMenu);
  const placedModules = useFurnitureStore((s) => s.placedModules);
  const updatePlacedModule = useFurnitureStore((s) => s.updatePlacedModule);

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
  const baseLabel = (id: 'left' | 'right' | 'both') =>
    id === 'left' ? '좌 EP' : id === 'right' ? '우 EP' : '양쪽 EP';
  const items: Array<{ id: 'left' | 'right' | 'both' }> = [
    { id: 'left' },
    { id: 'right' },
    { id: 'both' },
  ];

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
          minWidth: 160,
          background: '#ffffff',
          border: '1px solid #e6ebf5',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          padding: '6px 0',
          fontSize: 13,
          zIndex: 99999,
        }}
      >
        {items.map((opt) => {
          const active =
            (opt.id === 'left' && cur.hasLeftEndPanel && !cur.hasRightEndPanel) ||
            (opt.id === 'right' && cur.hasRightEndPanel && !cur.hasLeftEndPanel) ||
            (opt.id === 'both' && cur.hasLeftEndPanel && cur.hasRightEndPanel);
          return (
            <button
              key={opt.id}
              onClick={() => {
                const next = active
                  ? { hasLeftEndPanel: false, hasRightEndPanel: false }
                  : opt.id === 'left'
                    ? { hasLeftEndPanel: true, hasRightEndPanel: false }
                    : opt.id === 'right'
                      ? { hasLeftEndPanel: false, hasRightEndPanel: true }
                      : { hasLeftEndPanel: true, hasRightEndPanel: true };
                updatePlacedModule(placedModule.id, next);
                closeMenu();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '8px 14px',
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
              <span style={{ flex: 1 }}>{active ? `${baseLabel(opt.id)} 제거` : baseLabel(opt.id)}</span>
              {active && <span style={{ color: 'var(--theme-primary, #7269ef)' }}>✓</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
