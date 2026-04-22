// MobileEditor — iPhone 14 Pro 전용 에디터 (시안 Image #78 기준)
// 웹 UI 절대 불침범. /mobile, /mobile/configurator 라우트 전용
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HiOutlineColorSwatch } from 'react-icons/hi';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import ModuleGallery, { type ModuleType } from '@/editor/shared/controls/furniture/ModuleGallery';
import MaterialPanel from '@/editor/shared/controls/styling/MaterialPanel';

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

// ─── 작은 공용 컴포넌트 ───────────────────────────────────────
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
      minWidth: 0, padding: '8px 14px',
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

/** 뷰어 우측 플로팅 버튼 */
const SideFloatBtn: React.FC<{ onClick?: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      width: 40, height: 40, borderRadius: 10,
      border: `1px solid ${T.line}`,
      background: T.surface,
      color: T.ink2,
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

  const [topMode, setTopMode] = useState<ViewerMode>('3D');
  const [bottomTab, setBottomTab] = useState<BottomTab>('module');
  const [sheetOpen, setSheetOpen] = useState(false);
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

  const handleTabClick = (tab: BottomTab) => {
    if (tab === bottomTab && sheetOpen) {
      setSheetOpen(false);
      return;
    }
    setBottomTab(tab);
    setSheetOpen(true);
  };

  return (
    <div style={{
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

      {/* 프로젝트명 + 3D/2D/도면 토글 */}
      <div style={{
        background: T.surface,
        padding: '8px 16px 12px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 13, color: T.ink2 }}>
          {projectName} / <span style={{ color: T.primary, fontWeight: 600 }}>{projectNumber}</span> ▾
        </div>
        <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: 320 }}>
          {([
            { k: '3D', label: '3D' },
            { k: '2D', label: '2D' },
            { k: 'drawing', label: '도면' },
          ] as const).map(item => (
            <SegBtn key={item.k} active={topMode === item.k} flex onClick={() => {
              setTopMode(item.k);
              if (item.k === '2D' || item.k === '3D') setViewMode(item.k);
            }}>{item.label}</SegBtn>
          ))}
        </div>
      </div>

      {/* ═══════════════ 3D Viewer (전체 화면) ═══════════════ */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
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

        {/* 우측 플로팅 버튼 (큐브/회전/전체화면) */}
        <div style={{
          position: 'absolute', top: 14, right: 14,
          display: 'flex', flexDirection: 'column', gap: 8,
          zIndex: 5,
        }}>
          <SideFloatBtn><IconCube /></SideFloatBtn>
          <SideFloatBtn><IconRotate /></SideFloatBtn>
          <SideFloatBtn><IconFullscreen /></SideFloatBtn>
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

      {/* ═══════════════ Bottom Sheet ═══════════════ */}
      {sheetOpen && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 60,
          background: T.surface,
          borderTop: `1px solid ${T.line}`,
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          maxHeight: '65vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
          zIndex: 10,
        }}>
          {/* 드래그 핸들 */}
          <div style={{ padding: '8px 0 4px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 40, height: 4, background: T.bg3, borderRadius: 2 }}/>
          </div>

          {/* 헤더 */}
          <div style={{
            padding: '8px 16px 10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${T.line2}`,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
              {bottomTab === 'module' && '모듈'}
              {bottomTab === 'material' && '재질'}
              {bottomTab === 'settings' && '설정'}
              {bottomTab === 'drawing' && '도면'}
            </div>
            <button onClick={() => setSheetOpen(false)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: T.ink2, padding: 4, display: 'flex',
            }}>
              <IconClose />
            </button>
          </div>

          {/* 바텀 시트 콘텐츠 */}
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            {bottomTab === 'module' && (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <SegBtn active={layoutMode === 'equal-division'} flex onClick={() => {
                    if (layoutMode === 'equal-division') return;
                    if (placedModules.length > 0 && !window.confirm('가구가 초기화됩니다.')) return;
                    setSpaceInfo({ layoutMode: 'equal-division' });
                  }}>슬롯배치</SegBtn>
                  <SegBtn active={moduleCategory === 'clothing'} onClick={() => setModuleCategory('clothing')}>의류장</SegBtn>
                  <SegBtn active={moduleCategory === 'shoes'} onClick={() => setModuleCategory('shoes')}>신발장</SegBtn>
                  <SegBtn active={moduleCategory === 'kitchen'} onClick={() => setModuleCategory('kitchen')}>주방</SegBtn>
                </div>

                {moduleCategory !== 'kitchen' && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
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
              <div style={{ padding: 20, textAlign: 'center', color: T.ink3, fontSize: 13 }}>
                공간 / 프레임 설정 (모바일)
                <div style={{ marginTop: 12, fontSize: 12 }}>
                  추후 모바일 전용 설정 UI 구현 예정
                </div>
              </div>
            )}
            {bottomTab === 'drawing' && (
              <div style={{ padding: 20, textAlign: 'center', color: T.ink3, fontSize: 13 }}>
                도면 (모바일)
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
