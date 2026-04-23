// IPadEditor — iPad Pro 11" 전용 에디터 (시안 Image #78 기준 재디자인)
// 웹 UI는 절대 수정하지 않으며, 이 파일은 /ipad, /ipad/configurator 라우트 전용
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineColorSwatch } from 'react-icons/hi';
import { TbBoxAlignRight } from 'react-icons/tb';
import { MdOutlineDashboardCustomize } from 'react-icons/md';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import ModuleGallery, { type ModuleType } from '@/editor/shared/controls/furniture/ModuleGallery';
import MaterialPanel from '@/editor/shared/controls/styling/MaterialPanel';
import PlacedModulePropertiesPanel from '@/editor/shared/controls/furniture/PlacedModulePropertiesPanel';
import IPadRightPanel from './IPadRightPanel';
import '@/editor/MobileEditor/MobileEditor.css';

// ─── 시안 기준 디자인 토큰 ──────────────────────────────────────
const T = {
  primary:  'var(--theme-primary, #3B82F6)',   // 시안 블루
  primaryBg:'var(--theme-primary-bg, #EFF6FF)',
  bg:       '#FFFFFF',
  bg2:      '#F9FAFB',
  bg3:      '#F3F4F6',
  surface:  '#FFFFFF',
  ink:      '#111827',
  ink2:     '#4B5563',
  ink3:     '#9CA3AF',
  line:     '#E5E7EB',
  line2:    '#F3F4F6',
  blue50:   '#EFF6FF',
  blueAct:  '#3B82F6',
};

const FONT_SANS = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;

type ViewerMode = '2D' | '3D';
type IconTab = 'module' | 'material' | 'structure' | 'myCabinet' | 'island';

// ─── 작은 공용 컴포넌트 ─────────────────────────────────────────
/** 시안의 둥근 세그먼트 버튼 (활성 시 파란 배경 + 흰 글자) */
const SegBtn: React.FC<{
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  flex?: boolean;
}> = ({ active, onClick, children, flex }) => (
  <button
    onClick={onClick}
    style={{
      flex: flex ? '1 1 0' : undefined,
      minWidth: 0,
      padding: '7px 14px',
      background: active ? T.blueAct : T.surface,
      color: active ? '#fff' : T.ink2,
      border: `1px solid ${active ? T.blueAct : T.line}`,
      borderRadius: 8,
      fontSize: 13, fontWeight: active ? 600 : 500,
      cursor: 'pointer', whiteSpace: 'nowrap',
      transition: 'all 0.12s ease',
    }}
  >{children}</button>
);

/** 중앙 뷰어 하단 플로팅 버튼 (파란 테두리 원형) */
const FloatBtn: React.FC<{ onClick?: () => void; title?: string; children: React.ReactNode }> = ({ onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: 42, height: 42, borderRadius: 21,
      border: `1.5px solid ${T.blueAct}`,
      background: T.surface,
      color: T.blueAct,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      transition: 'background 0.12s',
    }}
    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.blue50; }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.surface; }}
  >{children}</button>
);

// 아이콘들
const IconEdit = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/>
  </svg>
);
const IconDuplicate = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>
);
const IconRotate = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
  </svg>
);
const IconFullscreen = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>
  </svg>
);
const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.38.95 1.14 1.55 2 1.7z"/>
  </svg>
);
const IconFile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);
const IconSave = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </svg>
);
const IconExit = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const IconRender = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);
const IconCube = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

// ─── 좌측 아이콘 사이드바 탭 정의 ─────────────────────────────────
const ICON_TABS: { id: IconTab; label: string; icon: JSX.Element }[] = [
  {
    id: 'module',
    label: '모듈',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  { id: 'material', label: '재질', icon: <HiOutlineColorSwatch size={24} /> },
  {
    id: 'structure',
    label: '기능',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 6v12M6 12h12"/>
        <rect x="3" y="3" width="18" height="18" rx="2"/>
      </svg>
    ),
  },
  { id: 'myCabinet', label: '커스텀', icon: <MdOutlineDashboardCustomize size={24} /> },
  {
    id: 'island',
    label: '아이템',
    icon: <IconCube />,
  },
];

const IPadEditor: React.FC = () => {
  const { t } = useTranslation();
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
  const renderMode = useUIStore(s => s.renderMode);
  const showAll = useUIStore(s => s.showAll);
  const showFrame = useUIStore(s => s.showFrame);

  const [mode, setMode] = useState<ViewerMode>('3D');
  const [activeIcon, setActiveIcon] = useState<IconTab>('module');
  const [moduleType, setModuleType] = useState<ModuleType>('all');
  const [moduleCategory, setModuleCategory] = useState<'clothing' | 'shoes' | 'kitchen'>('clothing');
  const [kitchenSub, setKitchenSub] = useState<'basic' | 'door-raise' | 'top-down' | 'upper'>('basic');

  const layoutMode = (spaceInfo.layoutMode || 'equal-division') as 'equal-division' | 'free-placement';

  // 뷰어 컨테이너 크기 반응형
  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewerSize, setViewerSize] = useState({ width: 800, height: 600 });
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

  return (
    <div className="ipad-editor-root" style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: T.bg2, color: T.ink, fontFamily: FONT_SANS,
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ═══════════════ Top Header (시안 기준) ═══════════════ */}
      <div style={{
        height: 52, background: T.surface,
        borderBottom: `1px solid ${T.line}`,
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '0 20px', flexShrink: 0,
      }}>
        {/* 로고 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.ink }}/>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.ink }}/>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.ink }}/>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: T.ink }}>CRAFT</span>
        </div>

        {/* 프로젝트 경로 */}
        <div style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ color: T.ink2 }}>{projectName}</span>
          <span style={{ color: T.ink3 }}>/</span>
          <span style={{ color: T.primary, fontWeight: 600 }}>{projectNumber} ▾</span>
        </div>

        <div style={{ flex: 1 }}/>

        {/* 우측 액션 */}
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.ink2, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}>
          <IconFile /> 파일
        </button>
        {/* 도어 설치/제거 토글 */}
        <button
          onClick={handleDoorInstallation}
          title={hasDoorsInstalled ? '도어 제거' : '도어 설치'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', height: 30,
            background: hasDoorsInstalled ? T.blueAct : T.surface,
            color: hasDoorsInstalled ? '#fff' : T.ink2,
            border: `1px solid ${hasDoorsInstalled ? T.blueAct : T.line}`,
            borderRadius: 6, cursor: 'pointer',
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          {hasDoorsInstalled ? '도어제거' : '도어설치'}
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.ink2, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}>
          <IconSave /> 저장
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.ink2, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}>
          <IconExit /> 저장하고 나가기
        </button>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          background: T.blueAct, color: '#FFF', border: 'none', borderRadius: 8,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          <IconRender /> 렌더링
        </button>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.ink2, display: 'flex', padding: 6 }}>
          <IconSettings />
        </button>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', background: T.bg3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.ink2, fontSize: 12, fontWeight: 600, flexShrink: 0,
        }}>U</div>
      </div>

      {/* ═══════════════ Main 4-column (아이콘사이드바 + 카탈로그 + 뷰어 + 우측패널) ═══════════════ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ─── Left Icon Sidebar (시안 기준 세로 아이콘 + 레이블) ─── */}
        <div style={{
          width: 68, background: T.surface,
          borderRight: `1px solid ${T.line}`,
          display: 'flex', flexDirection: 'column',
          padding: '10px 0', gap: 6,
          flexShrink: 0,
        }}>
          {ICON_TABS.map(tab => {
            const isA = tab.id === activeIcon;
            return (
              <button key={tab.id}
                onClick={() => setActiveIcon(tab.id)}
                style={{
                  position: 'relative',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 4, padding: '10px 0', margin: '0 8px',
                  background: isA ? T.blue50 : 'transparent',
                  border: 'none', borderRadius: 10,
                  cursor: 'pointer', transition: 'background 0.12s ease',
                }}
              >
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26,
                  color: isA ? T.primary : T.ink3,
                }}>{tab.icon}</span>
                <span style={{
                  fontSize: 11, fontWeight: isA ? 600 : 500,
                  color: isA ? T.primary : T.ink3,
                  lineHeight: 1,
                }}>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ─── Catalog Panel (모듈/재질 등 선택된 탭의 콘텐츠) ─── */}
        <div style={{
          width: 240, background: T.surface,
          borderRight: `1px solid ${T.line}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          flexShrink: 0,
        }}>
          {activeIcon === 'module' && (
            <>
              {/* 슬롯배치/자유배치 */}
              <div style={{ padding: '14px 12px 10px', display: 'flex', gap: 6 }}>
                <SegBtn
                  active={layoutMode === 'equal-division'}
                  flex
                  onClick={() => {
                    if (layoutMode === 'equal-division') return;
                    if (placedModules.length > 0) {
                      if (!window.confirm('배치 방식을 변경하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) return;
                    }
                    setSpaceInfo({ layoutMode: 'equal-division' });
                  }}
                >슬롯배치</SegBtn>
                <SegBtn
                  active={layoutMode === 'free-placement'}
                  flex
                  onClick={() => {
                    if (layoutMode === 'free-placement') return;
                    if (placedModules.length > 0) {
                      if (!window.confirm('배치 방식을 변경하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) return;
                    }
                    setSpaceInfo({ layoutMode: 'free-placement' });
                  }}
                >자유배치</SegBtn>
              </div>

              {/* 의류장/신발장/주방 */}
              <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6 }}>
                <SegBtn active={moduleCategory === 'clothing'} flex onClick={() => setModuleCategory('clothing')}>의류장</SegBtn>
                <SegBtn active={moduleCategory === 'shoes'} flex onClick={() => setModuleCategory('shoes')}>신발장</SegBtn>
                <SegBtn active={moduleCategory === 'kitchen'} flex onClick={() => setModuleCategory('kitchen')}>주방</SegBtn>
              </div>

              {/* 주방 서브 */}
              {moduleCategory === 'kitchen' && (
                <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <SegBtn active={kitchenSub === 'basic'} onClick={() => setKitchenSub('basic')}>기본장</SegBtn>
                  <SegBtn active={kitchenSub === 'door-raise'} onClick={() => setKitchenSub('door-raise')}>도어올림</SegBtn>
                  <SegBtn active={kitchenSub === 'top-down'} onClick={() => setKitchenSub('top-down')}>상판내림</SegBtn>
                  <SegBtn active={kitchenSub === 'upper'} onClick={() => setKitchenSub('upper')}>상부장</SegBtn>
                </div>
              )}

              {/* 전체/싱글/듀얼 (의류장/신발장 전용) */}
              {moduleCategory !== 'kitchen' && (
                <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6 }}>
                  <SegBtn active={moduleType === 'all'} flex onClick={() => setModuleType('all')}>전체</SegBtn>
                  <SegBtn active={moduleType === 'single'} flex onClick={() => setModuleType('single')}>싱글</SegBtn>
                  <SegBtn active={moduleType === 'dual'} flex onClick={() => setModuleType('dual')}>듀얼</SegBtn>
                </div>
              )}

              {/* 모듈 그리드 (기존 ModuleGallery 재사용 — 탭 숨김 옵션) */}
              <div style={{ flex: 1, overflow: 'auto', padding: '4px 6px 12px' }}>
                <ModuleGallery
                  moduleCategory={moduleCategory}
                  kitchenSubCategory={kitchenSub}
                  selectedType={moduleType}
                  onSelectedTypeChange={setModuleType}
                  hideTabMenu
                />
              </div>
            </>
          )}

          {activeIcon === 'material' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <MaterialPanel />
            </div>
          )}

          {activeIcon === 'structure' && (
            <div style={{ padding: 20, textAlign: 'center', color: T.ink3, fontSize: 12 }}>
              뷰어를 탭해서 기능 요소 추가
            </div>
          )}

          {activeIcon === 'myCabinet' && (
            <div style={{ padding: 20, textAlign: 'center', color: T.ink3, fontSize: 12 }}>
              커스텀 가구
            </div>
          )}

          {activeIcon === 'island' && (
            <div style={{ padding: 20, textAlign: 'center', color: T.ink3, fontSize: 12 }}>
              아이템
            </div>
          )}
        </div>

        {/* ─── Center Viewer Area ─── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: T.bg2, position: 'relative', minWidth: 0,
        }}>

          {/* 중앙 상단 툴바 — 3D/2D 뷰 전환만 (자유/공동은 좌측 카탈로그에 있음, 서라운드는 우측 패널에 있음) */}
          <div style={{
            height: 48, padding: '0 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: T.surface,
            borderBottom: `1px solid ${T.line}`, flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['3D', '2D'] as ViewerMode[]).map(m => (
                <SegBtn key={m} active={mode === m} onClick={() => { setMode(m); setViewMode(m); }}>{m}</SegBtn>
              ))}
            </div>
          </div>

          {/* 3D 뷰어 */}
          <div ref={viewerRef} style={{
            flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden',
            background: T.bg2,
          }}>
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
        </div>

        {/* ─── Right Property Panel ─── */}
        <div style={{
          width: 300, background: T.surface,
          borderLeft: `1px solid ${T.line}`,
          overflow: 'auto', flexShrink: 0,
        }}>
          <IPadRightPanel spaceInfo={spaceInfo} setSpaceInfo={setSpaceInfo} />
        </div>
      </div>

      {/* 가구 편집 팝업 — 배치된 가구 탭 시 우측에 속성 패널 표시 (태블릿 스킨) */}
      <div className="mobile-furniture-popup-skin">
        <PlacedModulePropertiesPanel />
      </div>
    </div>
  );
};

export default IPadEditor;
