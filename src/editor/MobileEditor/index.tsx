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
import PlacedModulePropertiesPanel from '@/editor/shared/controls/furniture/PlacedModulePropertiesPanel';
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

type ViewerMode = '3D' | '2D';
type BottomTab = 'module' | 'material' | 'settings';

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
  size?: 'sm' | 'md' | 'xs';
}> = ({ active, onClick, children, flex, size = 'sm' }) => {
  const dims = size === 'xs'
    ? { padding: '0 4px', height: 16, fontSize: 9, radius: 3 }
    : size === 'md'
    ? { padding: '8px 14px', height: undefined, fontSize: 12, radius: 6 }
    : { padding: '6px 10px', height: 32, fontSize: 12, radius: 6 };
  return (
    <button
      onClick={onClick}
      style={{
        flex: flex ? '1 1 0' : undefined,
        minWidth: 0,
        padding: dims.padding,
        height: dims.height,
        background: active ? T.blueAct : T.surface,
        color: active ? '#fff' : T.ink2,
        border: `1px solid ${active ? T.blueAct : T.line}`,
        borderRadius: dims.radius,
        fontSize: dims.fontSize, fontWeight: active ? 600 : 500,
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'all 0.12s ease',
        lineHeight: 1,
      }}
    >{children}</button>
  );
};

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
  const setAllDoors = useFurnitureStore(s => s.setAllDoors);
  const hasDoorsInstalled = placedModules.some(m => m.hasDoor);
  const handleDoorInstallation = () => {
    if (hasDoorsInstalled) {
      setAllDoors(false);
      useUIStore.getState().setDoorInstallIntent(false);
    } else {
      setAllDoors(true);
      useUIStore.getState().setDoorInstallIntent(true);
    }
  };
  const viewMode = useUIStore(s => s.viewMode);
  const setViewMode = useUIStore(s => s.setViewMode);
  const doorsOpen = useUIStore(s => s.doorsOpen);
  const setDoorsOpen = useUIStore(s => s.setDoorsOpen);
  const view2DTheme = useUIStore(s => s.view2DTheme);
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

  return (
    <div className="mobile-editor-root" style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: T.bg2, color: T.ink, fontFamily: FONT_SANS,
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {/* ═══════════════ Top Header (프로젝트명/토글 포함 통합) ═══════════════ */}
      <div style={{
        height: isLandscape ? 44 : 52, background: T.surface,
        borderBottom: `1px solid ${T.line}`,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: isLandscape ? '0 10px' : '0 14px', flexShrink: 0,
      }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.ink, padding: 4, display: 'flex' }}>
          <IconHamburger />
        </button>
        {!isLandscape && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
            <div style={{ display: 'flex', gap: 2.5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.ink }}/>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.ink }}/>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.ink }}/>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2, color: T.ink }}>CRAFT</span>
          </div>
        )}
        {/* 프로젝트명 (가로에서는 헤더에 직접, 세로에서는 별도 줄) */}
        {isLandscape && (
          <div style={{
            fontSize: 11, color: T.ink2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            minWidth: 0, marginLeft: 4,
          }}>
            {projectName} / <span style={{ color: T.primary, fontWeight: 600 }}>{projectNumber}</span> ▾
          </div>
        )}
        <div style={{ flex: 1 }}/>
        {/* 가로에서는 헤더 우측에 토글 통합 */}
        {isLandscape && (
          <div style={{
            display: 'flex', gap: 2,
            padding: 2, background: T.bg2, borderRadius: 6,
            flexShrink: 0, marginRight: 4,
          }}>
            {([
              { k: '3D', label: '3D' },
              { k: '2D', label: '2D' },
            ] as const).map(item => {
              const active = topMode === item.k;
              return (
                <button key={item.k}
                  onClick={() => {
                    setTopMode(item.k);
                    setViewMode(item.k);
                  }}
                  style={{
                    padding: '3px 10px', minWidth: 38, height: 24,
                    background: active ? T.surface : 'transparent',
                    color: active ? T.primary : T.ink3,
                    border: 'none', borderRadius: 4,
                    fontSize: 11, fontWeight: active ? 600 : 500,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >{item.label}</button>
              );
            })}
          </div>
        )}
        {/* 도어 설치/제거 토글 */}
        <button
          onClick={handleDoorInstallation}
          title={hasDoorsInstalled ? '도어 제거' : '도어 설치'}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 9px', height: 28,
            background: hasDoorsInstalled ? T.primary : T.surface,
            color: hasDoorsInstalled ? '#fff' : T.ink2,
            border: `1px solid ${hasDoorsInstalled ? T.primary : T.line}`,
            borderRadius: 6, cursor: 'pointer',
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
            marginRight: 4,
          }}
        >
          {hasDoorsInstalled ? '도어제거' : '도어설치'}
        </button>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.ink2, fontSize: 13, padding: '6px 8px',
        }}>
          <IconSave /> 저장
        </button>
      </div>

      {/* 프로젝트명 + 3D/2D/도면 토글 — 세로 모드에서만 표시 */}
      {!isLandscape && (<div style={{
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
          ] as const).map(item => {
            const active = topMode === item.k;
            return (
              <button key={item.k}
                onClick={() => {
                  setTopMode(item.k);
                  setViewMode(item.k);
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
      </div>)}

      {/* ═══════════════ 3D Viewer (전체 화면) ═══════════════ */}
      <div style={{
        flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden',
        // 가로 모드: 좌측 사이드바(44) + 사이드 패널(열려있을 때)
        marginLeft: isLandscape ? (sheetOpen ? 'calc(44px + min(240px, 38vw))' : '44px') : 0,
        transition: 'margin-left 0.2s ease',
      }}>
        {/* 도어 Open/Close 토글 — 도어 설치 시 뷰어 상단 중앙 */}
        {hasDoorsInstalled && (() => {
          const isOpen = doorsOpen === true;
          const dark = viewMode === '2D' && view2DTheme === 'dark';
          return (
            <div style={{
              position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              zIndex: 20, width: 90, height: 28, borderRadius: 14,
              background: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
              display: 'flex', alignItems: 'center', padding: 2,
              boxSizing: 'border-box', userSelect: 'none',
            }}>
              {/* 슬라이딩 활성 배경 */}
              <div style={{
                position: 'absolute', top: 2, left: isOpen ? 46 : 2,
                width: 42, height: 24, borderRadius: 12,
                background: T.blueAct, transition: 'left 0.2s', pointerEvents: 'none',
              }} />
              <span
                onClick={() => setDoorsOpen(false)}
                style={{
                  position: 'relative', flex: 1, textAlign: 'center',
                  fontSize: 10, fontWeight: 600,
                  color: !isOpen ? '#fff' : (dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)'),
                  zIndex: 1, lineHeight: '24px', cursor: 'pointer',
                }}
              >Close</span>
              <span
                onClick={() => setDoorsOpen(true)}
                style={{
                  position: 'relative', flex: 1, textAlign: 'center',
                  fontSize: 10, fontWeight: 600,
                  color: isOpen ? '#fff' : (dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)'),
                  zIndex: 1, lineHeight: '24px', cursor: 'pointer',
                }}
              >Open</span>
            </div>
          );
        })()}

        {/* 2D 뷰 방향 선택 버튼 — 2D 모드일 때만 상단 좌측에 표시 */}
        {viewMode === '2D' && (
          <div style={{
            position: 'absolute', top: 10, left: 10, zIndex: 20,
            display: 'flex', gap: 4,
            padding: 3, background: 'rgba(255,255,255,0.92)',
            border: '1px solid rgba(0,0,0,0.12)',
            borderRadius: 6,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}>
            {([
              { k: 'front', label: '정면' },
              { k: 'top',   label: '평면' },
              { k: 'left',  label: '측면' },
            ] as const).map(v => {
              const active = view2DDirection === v.k;
              return (
                <button
                  key={v.k}
                  onClick={() => setView2DDirection(v.k)}
                  style={{
                    padding: '4px 9px', height: 26, minWidth: 38,
                    background: active ? T.blueAct : 'transparent',
                    color: active ? '#fff' : T.ink2,
                    border: 'none', borderRadius: 4,
                    fontSize: 11, fontWeight: active ? 600 : 500,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >{v.label}</button>
              );
            })}
          </div>
        )}
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

        {/* 우측 플로팅 버튼 제거 — 상단 헤더에 3D/2D/도면 토글 있음 */}

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

      {/* 가로 모드: 좌측 세로 사이드바 (탭바) — 휴대폰에 맞춰 얇게 */}
      {isLandscape && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: 44,
          bottom: 0,
          width: 44,
          background: T.surface,
          borderRight: `1px solid ${T.line}`,
          display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          paddingTop: 4,
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
          zIndex: 11,
          boxShadow: '1px 0 3px rgba(0,0,0,0.04)',
        }}>
          {([
            { k: 'module',    label: '모듈', icon: <IconModules /> },
            { k: 'material',  label: '재질', icon: <HiOutlineColorSwatch size={16} /> },
            { k: 'settings',  label: '설정', icon: <IconSettings /> },
          ] as const).map(tab => {
            const isA = bottomTab === tab.k && sheetOpen;
            return (
              <button key={tab.k}
                onClick={() => handleTabClick(tab.k as BottomTab)}
                style={{
                  height: 42,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 1, background: isA ? T.primary50 : 'transparent', border: 'none', cursor: 'pointer',
                  color: isA ? T.primary : T.ink3,
                  borderLeft: isA ? `2px solid ${T.primary}` : '2px solid transparent',
                  padding: 0,
                }}
              >
                {tab.icon}
                <span style={{ fontSize: 9, fontWeight: isA ? 600 : 500, lineHeight: 1 }}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ═══════════════ Bottom Sheet (세로) / Side Panel (가로) ═══════════════ */}
      {sheetOpen && (
        <div style={isLandscape ? {
          // 가로: 사이드바(44) 옆에 사이드 패널
          position: 'absolute', left: 44, top: 44, bottom: 0,
          width: 'min(240px, 38vw)',
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

          {/* 헤더 — 가로 모드에서는 헤더 줄 자체 제거 (X는 콘텐츠 우상단 absolute) */}
          {!isLandscape && (
            <div style={{
              padding: '4px 16px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: `1px solid ${T.line2}`,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
                {bottomTab === 'module' && '모듈'}
                {bottomTab === 'material' && '재질'}
                {bottomTab === 'settings' && '설정'}
              </div>
              <button onClick={() => { setSheetOpen(false); setSheetHeight(SHEET_HEIGHTS.collapsed); }} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: T.ink2, padding: 4, display: 'flex',
              }}>
                <IconClose />
              </button>
            </div>
          )}

          {/* 가로 모드: 콘텐츠 우상단에 플로팅 X 버튼 */}
          {isLandscape && (
            <button
              onClick={() => { setSheetOpen(false); setSheetHeight(SHEET_HEIGHTS.collapsed); }}
              style={{
                position: 'absolute', top: 4, right: 4, zIndex: 5,
                background: 'none', border: 'none', cursor: 'pointer',
                color: T.ink3, padding: 2, display: 'flex',
              }}
            >
              <IconClose />
            </button>
          )}

          {/* 바텀 시트 콘텐츠 — 가로 모드는 우측 X 버튼 공간 확보 */}
          <div className={isLandscape ? 'mobile-landscape-panel' : ''} style={{ flex: 1, overflow: 'auto', padding: isLandscape ? '24px 8px 8px' : 12 }}>
            {bottomTab === 'module' && (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: isLandscape ? 5 : 8 }}>
                  <SegBtn size={isLandscape ? 'xs' : 'sm'} active={layoutMode === 'equal-division'} flex onClick={() => {
                    if (layoutMode === 'equal-division') return;
                    if (placedModules.length > 0 && !window.confirm('가구가 초기화됩니다.')) return;
                    setSpaceInfo({ layoutMode: 'equal-division' });
                  }}>슬롯배치</SegBtn>
                  <SegBtn size={isLandscape ? 'xs' : 'sm'} active={layoutMode === 'free-placement'} flex onClick={() => {
                    if (layoutMode === 'free-placement') return;
                    if (placedModules.length > 0 && !window.confirm('가구가 초기화됩니다.')) return;
                    setSpaceInfo({ layoutMode: 'free-placement' });
                  }}>자유배치</SegBtn>
                </div>
                <div style={{ display: 'flex', gap: 4, marginBottom: isLandscape ? 5 : 8 }}>
                  <SegBtn size={isLandscape ? 'xs' : 'sm'} active={moduleCategory === 'clothing'} flex onClick={() => setModuleCategory('clothing')}>의류장</SegBtn>
                  <SegBtn size={isLandscape ? 'xs' : 'sm'} active={moduleCategory === 'shoes'} flex onClick={() => setModuleCategory('shoes')}>신발장</SegBtn>
                  <SegBtn size={isLandscape ? 'xs' : 'sm'} active={moduleCategory === 'kitchen'} flex onClick={() => setModuleCategory('kitchen')}>주방</SegBtn>
                </div>

                {moduleCategory === 'kitchen' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: isLandscape ? 5 : 8 }}>
                    <SegBtn size={isLandscape ? 'xs' : 'sm'} active={kitchenSub === 'basic'} onClick={() => setKitchenSub('basic')}>기본장</SegBtn>
                    <SegBtn size={isLandscape ? 'xs' : 'sm'} active={kitchenSub === 'door-raise'} onClick={() => setKitchenSub('door-raise')}>도어올림</SegBtn>
                    <SegBtn size={isLandscape ? 'xs' : 'sm'} active={kitchenSub === 'top-down'} onClick={() => setKitchenSub('top-down')}>상판내림</SegBtn>
                    <SegBtn size={isLandscape ? 'xs' : 'sm'} active={kitchenSub === 'upper'} onClick={() => setKitchenSub('upper')}>상부장</SegBtn>
                  </div>
                )}

                {moduleCategory !== 'kitchen' && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: isLandscape ? 5 : 8 }}>
                    <SegBtn size={isLandscape ? 'xs' : 'sm'} active={moduleType === 'all'} flex onClick={() => setModuleType('all')}>전체</SegBtn>
                    <SegBtn size={isLandscape ? 'xs' : 'sm'} active={moduleType === 'single'} flex onClick={() => setModuleType('single')}>싱글</SegBtn>
                    <SegBtn size={isLandscape ? 'xs' : 'sm'} active={moduleType === 'dual'} flex onClick={() => setModuleType('dual')}>듀얼</SegBtn>
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
          </div>
        </div>
      )}

      {/* ═══════════════ Bottom Tab Bar — 세로 모드에서만 표시 ═══════════════ */}
      {!isLandscape && (<div style={{
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
      </div>)}

      {/* 가구 편집 팝업 — 배치된 가구 탭 시 우측에 속성 패널 표시 (모바일 스킨) */}
      <div className="mobile-furniture-popup-skin">
        <PlacedModulePropertiesPanel />
      </div>
    </div>
  );
};

export default MobileEditor;
