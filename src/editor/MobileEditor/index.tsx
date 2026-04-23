// MobileEditor — iPhone 14 Pro 전용 에디터 (시안 Image #78 기준)
// 웹 UI 절대 불침범. /mobile, /mobile/configurator 라우트 전용
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HiOutlineColorSwatch } from 'react-icons/hi';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import ModuleGallery, { type ModuleType } from '@/editor/shared/controls/furniture/ModuleGallery';
import MaterialPanel from '@/editor/shared/controls/styling/MaterialPanel';
import IPadRightPanel from '@/editor/IPadEditor/IPadRightPanel';
import './MobileEditor.css';

// ─── 디자인 토큰 ──────────────────────────────────────────────
const T = {
  primary:  '#3B82F6',
  primary50:'#EFF6FF',
  bg:       '#FFFFFF',
  bg2:      '#F9FAFB',
  bg3:      '#F3F4F6',
  surface:  '#FFFFFF',
  ink:      '#111827',
  ink2:     '#4B5563',
  ink3:     '#9CA3AF',
  line:     '#E5E7EB',
  line2:    '#F3F4F6',
  blueAct:  '#3B82F6',
};

const FONT_SANS = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;

type ViewerMode = '3D' | '2D' | 'drawing';
type BottomTab = 'module' | 'material' | 'settings' | 'drawing';

// 바텀시트 높이 스냅 포인트 (vh 단위)
// 뷰어를 최대한 보이도록 기본값(medium)을 낮게 설정
const SHEET_HEIGHTS = {
  collapsed: 0,     // 닫힘
  medium:    30,    // 기본 (뷰어 70% 유지)
  full:      75,    // 전체 확장 (하단 탭바/safe-area 고려)
} as const;

// ─── 작은 공용 컴포넌트 ───────────────────────────────────────
const SegBtn: React.FC<{
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  flex?: boolean;
  size?: 'sm' | 'md';
}> = ({ active, onClick, children, flex, size = 'sm' }) => (
  <button
    onClick={onClick}
    style={{
      flex: flex ? '1 1 0' : undefined,
      minWidth: 0,
      padding: size === 'md' ? '8px 14px' : '6px 10px',
      height: size === 'md' ? undefined : 32,
      background: active ? T.blueAct : T.surface,
      color: active ? '#fff' : T.ink2,
      border: `1px solid ${active ? T.blueAct : T.line}`,
      borderRadius: 6,
      fontSize: 12, fontWeight: active ? 600 : 500,
      cursor: 'pointer', whiteSpace: 'nowrap',
      transition: 'all 0.12s ease',
      lineHeight: 1,
    }}
  >{children}</button>
);

/** 뷰어 우측 플로팅 버튼 */
const SideFloatBtn: React.FC<{ onClick?: () => void; children: React.ReactNode; active?: boolean; title?: string }> = ({ onClick, children, active, title }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: 40, height: 40, borderRadius: 10,
      border: `1px solid ${active ? T.blueAct : T.line}`,
      background: active ? T.primary50 : T.surface,
      color: active ? T.blueAct : T.ink2,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}
  >{children}</button>
);

// 아이콘들
const IconHamburger = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/>
  </svg>
);
const IconSave = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
  </svg>
);
const IconCube = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const IconSquare = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
  </svg>
);
const IconRotate = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
  </svg>
);
const IconFullscreen = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>
  </svg>
);
const IconEdit = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/>
  </svg>
);
const IconModules = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const IconSettings = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.38.95 1.14 1.55 2 1.7z"/>
  </svg>
);
const IconDrawing = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
  </svg>
);
const IconClose = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const MobileEditor: React.FC = () => {
  const [searchParams] = useSearchParams();
  const projectName = searchParams.get('projectName') || '리얼프로젝트';
  const projectNumber = searchParams.get('projectNumber') || '3050';

  const spaceInfo = useSpaceConfigStore(s => s.spaceInfo);
  const setSpaceInfo = useSpaceConfigStore(s => s.setSpaceInfo);
  const placedModules = useFurnitureStore(s => s.placedModules);
  const viewMode = useUIStore(s => s.viewMode);
  const setViewMode = useUIStore(s => s.setViewMode);
  const renderMode = useUIStore(s => s.renderMode);
  const showAll = useUIStore(s => s.showAll);
  const showFrame = useUIStore(s => s.showFrame);
  const view2DDirection = useUIStore(s => s.view2DDirection);
  const setView2DDirection = useUIStore(s => s.setView2DDirection);

  const [topMode, setTopMode] = useState<ViewerMode>('3D');
  const [bottomTab, setBottomTab] = useState<BottomTab>('module');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetHeight, setSheetHeight] = useState<number>(SHEET_HEIGHTS.medium);

  // 가로/세로 모드 감지 (가로에서는 사이드 패널로 전환)
  const [isLandscape, setIsLandscape] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false
  );
  useEffect(() => {
    const onResize = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  const [moduleType, setModuleType] = useState<ModuleType>('all');
  const [moduleCategory, setModuleCategory] = useState<'clothing' | 'shoes' | 'kitchen'>('clothing');
  const [kitchenSub, setKitchenSub] = useState<'basic' | 'door-raise' | 'top-down' | 'upper'>('basic');
  const layoutMode = (spaceInfo.layoutMode || 'equal-division') as 'equal-division' | 'free-placement';

  // 뷰어 크기
  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewerSize, setViewerSize] = useState({ width: 390, height: 500 });
  useEffect(() => {
    if (!viewerRef.current) return;
    const el = viewerRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setViewerSize({ width: Math.max(200, Math.floor(rect.width)), height: Math.max(200, Math.floor(rect.height)) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  // 바텀 시트 드래그 제스처 (드래그 핸들에서 시작된 경우에만 동작)
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleSheetDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStateRef.current = { startY: clientY, startHeight: sheetHeight };
    setIsDragging(true);
  }, [sheetHeight]);

  useEffect(() => {
    if (!isDragging) return; // 드래그 중일 때만 전역 리스너 활성

    const handleMove = (e: TouchEvent | MouseEvent) => {
      if (!dragStateRef.current) return;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      const deltaY = dragStateRef.current.startY - clientY;
      const vh = window.innerHeight;
      const deltaVh = (deltaY / vh) * 100;
      const newHeight = Math.max(0, Math.min(SHEET_HEIGHTS.full, dragStateRef.current.startHeight + deltaVh));
      setSheetHeight(newHeight);
    };
    const handleEnd = () => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      setIsDragging(false);
      // 가장 가까운 스냅 포인트로 정착
      setSheetHeight(cur => {
        if (cur < (SHEET_HEIGHTS.medium / 2)) {
          setSheetOpen(false);
          return SHEET_HEIGHTS.collapsed;
        }
        if (cur < (SHEET_HEIGHTS.medium + SHEET_HEIGHTS.full) / 2) return SHEET_HEIGHTS.medium;
        return SHEET_HEIGHTS.full;
      });
    };
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    };
  }, [isDragging]);

  const handleTabClick = (tab: BottomTab) => {
    if (tab === bottomTab && sheetOpen) {
      setSheetOpen(false);
      setSheetHeight(SHEET_HEIGHTS.collapsed);
      return;
    }
    setBottomTab(tab);
    setSheetOpen(true);
    if (sheetHeight < SHEET_HEIGHTS.medium) setSheetHeight(SHEET_HEIGHTS.medium);
  };

  // 플로팅 버튼: 회전 → 2D 방향 순환 (front→left→top→right→front)
  const handleRotate2D = () => {
    if (viewMode !== '2D') {
      setViewMode('2D');
      setTopMode('2D');
      return;
    }
    const order: Array<'front' | 'left' | 'top' | 'right'> = ['front', 'left', 'top', 'right'];
    const idx = order.indexOf(view2DDirection as any);
    const next = order[(idx + 1) % order.length];
    setView2DDirection(next);
  };

  const handleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div className="mobile-editor-root" style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: T.bg2, color: T.ink, fontFamily: FONT_SANS,
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {/* ═══════════════ Top Header ═══════════════ */}
      <div style={{
        height: 52, background: T.surface,
        borderBottom: `1px solid ${T.line}`,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 14px', flexShrink: 0,
      }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.ink, padding: 4, display: 'flex' }}>
          <IconHamburger />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
          <div style={{ display: 'flex', gap: 2.5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.ink }}/>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.ink }}/>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.ink }}/>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2, color: T.ink }}>CRAFT</span>
        </div>
        <div style={{ flex: 1 }}/>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.ink2, fontSize: 13, padding: '6px 8px',
        }}>
          <IconSave /> 저장
        </button>
      </div>

      {/* 프로젝트명 + 3D/2D/도면 토글 — 한 줄에 컴팩트 배치 */}
      <div style={{
        background: T.surface,
        padding: '6px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${T.line}`,
        flexShrink: 0, minHeight: 40,
      }}>
        <div style={{
          fontSize: 11, color: T.ink2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flexShrink: 1, minWidth: 0,
        }}>
          {projectName} / <span style={{ color: T.primary, fontWeight: 600 }}>{projectNumber}</span> ▾
        </div>
        <div style={{ flex: 1 }}/>
        {/* 컴팩트한 토글 그룹 — 배경으로 묶고 버튼은 더 작게 */}
        <div style={{
          display: 'flex', gap: 2,
          padding: 2, background: T.bg2, borderRadius: 6,
          flexShrink: 0,
        }}>
          {([
            { k: '3D', label: '3D' },
            { k: '2D', label: '2D' },
            { k: 'drawing', label: '도면' },
          ] as const).map(item => {
            const active = topMode === item.k;
            return (
              <button key={item.k}
                onClick={() => {
                  setTopMode(item.k);
                  if (item.k === '2D' || item.k === '3D') setViewMode(item.k);
                  if (item.k === 'drawing') {
                    setBottomTab('drawing');
                    setSheetOpen(true);
                    setSheetHeight(SHEET_HEIGHTS.medium);
                  }
                }}
                style={{
                  padding: '4px 12px', minWidth: 42, height: 26,
                  background: active ? T.surface : 'transparent',
                  color: active ? T.primary : T.ink3,
                  border: 'none', borderRadius: 4,
                  fontSize: 11, fontWeight: active ? 600 : 500,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.12s',
                }}
              >{item.label}</button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════ 3D Viewer (전체 화면) ═══════════════ */}
      <div style={{
        flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden',
        // 가로 모드에서 사이드 패널 열리면 좌측 여백 확보
        marginLeft: isLandscape && sheetOpen ? 'min(340px, 45vw)' : 0,
        transition: 'margin-left 0.2s ease',
      }}>
        <div ref={viewerRef} style={{ width: '100%', height: '100%' }}>
          <Space3DView
            spaceInfo={spaceInfo}
            viewMode={viewMode}
            setViewMode={setViewMode}
            renderMode={renderMode}
            showAll={showAll}
            showFrame={showFrame}
            svgSize={viewerSize}
          />
        </div>

        {/* 우측 플로팅 버튼 */}
        <div style={{
          position: 'absolute', top: 14, right: 14,
          display: 'flex', flexDirection: 'column', gap: 8,
          zIndex: 5,
        }}>
          <SideFloatBtn
            title="3D 뷰"
            active={viewMode === '3D'}
            onClick={() => { setViewMode('3D'); setTopMode('3D'); }}
          ><IconCube /></SideFloatBtn>
          <SideFloatBtn
            title="2D 뷰 전환"
            active={viewMode === '2D'}
            onClick={() => { setViewMode('2D'); setTopMode('2D'); }}
          ><IconSquare /></SideFloatBtn>
          <SideFloatBtn title="2D 방향 회전" onClick={handleRotate2D}><IconRotate /></SideFloatBtn>
          <SideFloatBtn title="전체화면" onClick={handleFullscreen}><IconFullscreen /></SideFloatBtn>
        </div>

        {/* 우측 하단 파란 편집 FAB */}
        <button
          onClick={() => handleTabClick('module')}
          style={{
            position: 'absolute', bottom: 16, right: 16,
            width: 52, height: 52, borderRadius: 26,
            background: T.blueAct, color: '#fff',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(59,130,246,0.4)',
            zIndex: 5,
          }}
        >
          <IconEdit />
        </button>
      </div>

      {/* ═══════════════ Bottom Sheet (세로) / Side Panel (가로) ═══════════════ */}
      {sheetOpen && (
        <div style={isLandscape ? {
          // 가로: 좌측 사이드 패널 (하단 탭바 위까지)
          position: 'absolute', left: 0, top: 0, bottom: 60,
          width: 'min(340px, 45vw)',
          background: T.surface,
          borderRight: `1px solid ${T.line}`,
          display: 'flex', flexDirection: 'column',
          boxShadow: '2px 0 12px rgba(0,0,0,0.08)',
          zIndex: 10,
        } : {
          // 세로: 하단 바텀시트
          position: 'absolute', left: 0, right: 0, bottom: 60,
          background: T.surface,
          borderTop: `2px solid ${T.line}`,
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          height: `${sheetHeight}vh`,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
          zIndex: 10,
          transition: isDragging ? 'none' : 'height 0.2s ease',
        }}>
          {/* 드래그 핸들 — 세로 모드에서만 표시 */}
          {!isLandscape && (
            <div
              onTouchStart={handleSheetDragStart}
              onMouseDown={handleSheetDragStart}
              style={{
                padding: '10px 0 6px',
                display: 'flex',
                justifyContent: 'center',
                cursor: 'grab',
                touchAction: 'none',
              }}
            >
              <div style={{ width: 48, height: 5, background: T.bg3, borderRadius: 3 }}/>
            </div>
          )}

          {/* 헤더 */}
          <div style={{
            padding: isLandscape ? '14px 16px 10px' : '4px 16px 10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${T.line2}`,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
              {bottomTab === 'module' && '모듈'}
              {bottomTab === 'material' && '재질'}
              {bottomTab === 'settings' && '설정'}
              {bottomTab === 'drawing' && '도면'}
            </div>
            <button onClick={() => { setSheetOpen(false); setSheetHeight(SHEET_HEIGHTS.collapsed); }} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: T.ink2, padding: 4, display: 'flex',
            }}>
              <IconClose />
            </button>
          </div>

          {/* 바텀 시트 콘텐츠 */}
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            {bottomTab === 'module' && (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  <SegBtn active={layoutMode === 'equal-division'} flex onClick={() => {
                    if (layoutMode === 'equal-division') return;
                    if (placedModules.length > 0 && !window.confirm('가구가 초기화됩니다.')) return;
                    setSpaceInfo({ layoutMode: 'equal-division' });
                  }}>슬롯배치</SegBtn>
                  <SegBtn active={layoutMode === 'free-placement'} flex onClick={() => {
                    if (layoutMode === 'free-placement') return;
                    if (placedModules.length > 0 && !window.confirm('가구가 초기화됩니다.')) return;
                    setSpaceInfo({ layoutMode: 'free-placement' });
                  }}>자유배치</SegBtn>
                </div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  <SegBtn active={moduleCategory === 'clothing'} flex onClick={() => setModuleCategory('clothing')}>의류장</SegBtn>
                  <SegBtn active={moduleCategory === 'shoes'} flex onClick={() => setModuleCategory('shoes')}>신발장</SegBtn>
                  <SegBtn active={moduleCategory === 'kitchen'} flex onClick={() => setModuleCategory('kitchen')}>주방</SegBtn>
                </div>

                {moduleCategory === 'kitchen' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 8 }}>
                    <SegBtn active={kitchenSub === 'basic'} onClick={() => setKitchenSub('basic')}>기본장</SegBtn>
                    <SegBtn active={kitchenSub === 'door-raise'} onClick={() => setKitchenSub('door-raise')}>도어올림</SegBtn>
                    <SegBtn active={kitchenSub === 'top-down'} onClick={() => setKitchenSub('top-down')}>상판내림</SegBtn>
                    <SegBtn active={kitchenSub === 'upper'} onClick={() => setKitchenSub('upper')}>상부장</SegBtn>
                  </div>
                )}

                {moduleCategory !== 'kitchen' && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    <SegBtn active={moduleType === 'all'} flex onClick={() => setModuleType('all')}>전체</SegBtn>
                    <SegBtn active={moduleType === 'single'} flex onClick={() => setModuleType('single')}>싱글</SegBtn>
                    <SegBtn active={moduleType === 'dual'} flex onClick={() => setModuleType('dual')}>듀얼</SegBtn>
                  </div>
                )}

                <ModuleGallery
                  moduleCategory={moduleCategory}
                  kitchenSubCategory={kitchenSub}
                  selectedType={moduleType}
                  onSelectedTypeChange={setModuleType}
                  hideTabMenu
                />
              </>
            )}

            {bottomTab === 'material' && <MaterialPanel />}

            {bottomTab === 'settings' && (
              <IPadRightPanel spaceInfo={spaceInfo} setSpaceInfo={setSpaceInfo} />
            )}

            {bottomTab === 'drawing' && (
              <div style={{ padding: '20px 10px', color: T.ink2, fontSize: 13 }}>
                <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: T.ink }}>
                  2D 도면 뷰
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {([
                    { k: 'front', label: '정면도' },
                    { k: 'left',  label: '좌측도' },
                    { k: 'right', label: '우측도' },
                    { k: 'top',   label: '평면도' },
                  ] as const).map(v => (
                    <SegBtn
                      key={v.k}
                      active={viewMode === '2D' && view2DDirection === v.k}
                      onClick={() => { setViewMode('2D'); setView2DDirection(v.k); setTopMode('2D'); }}
                    >{v.label}</SegBtn>
                  ))}
                </div>
                <div style={{ marginTop: 14, color: T.ink3, fontSize: 12 }}>
                  도면 선택 후 바텀시트를 닫으면 뷰어에 표시됩니다.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ Bottom Tab Bar ═══════════════ */}
      <div style={{
        height: 60, background: T.surface,
        borderTop: `1px solid ${T.line}`,
        display: 'flex', alignItems: 'stretch',
        flexShrink: 0,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}>
        {([
          { k: 'module',    label: '모듈', icon: <IconModules /> },
          { k: 'material',  label: '재질', icon: <HiOutlineColorSwatch size={22} /> },
          { k: 'settings',  label: '설정', icon: <IconSettings /> },
          { k: 'drawing',   label: '도면', icon: <IconDrawing /> },
        ] as const).map(tab => {
          const isA = bottomTab === tab.k && sheetOpen;
          return (
            <button key={tab.k}
              onClick={() => handleTabClick(tab.k as BottomTab)}
              style={{
                flex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 3, background: 'none', border: 'none', cursor: 'pointer',
                color: isA ? T.primary : T.ink3,
              }}
            >
              {tab.icon}
              <span style={{ fontSize: 11, fontWeight: isA ? 600 : 500 }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileEditor;
