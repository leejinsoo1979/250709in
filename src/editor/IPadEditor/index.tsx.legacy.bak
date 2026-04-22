// IPadEditor — iPad 전용 에디터 (웹 UI 아이콘/버튼 스타일 맞춤)
import React, { useEffect, useRef, useState } from 'react';
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
import IPadRightPanel from './IPadRightPanel';

// TC 토큰 — 기존 웹 테마 변수 그대로
const TC = {
  primary:      'var(--theme-primary, #7C5CFF)',
  primary50:    'var(--theme-primary-50, #F5F3FF)',
  bg:           'var(--theme-background, #FFFFFF)',
  bg2:          'var(--theme-background-secondary, #F7F7F9)',
  bg3:          'var(--theme-background-tertiary, #F0F0F0)',
  surface:      'var(--theme-surface, #FFFFFF)',
  ink:          'var(--theme-text, #111827)',
  ink2:         'var(--theme-text-secondary, #4B5563)',
  ink3:         'var(--theme-text-muted, #6B7280)',
  line:         'var(--theme-border, #E5E7EB)',
  line3:        'var(--theme-border-light, #F3F4F6)',
};

const FONT_MONO = `"SF Mono", ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace`;
const FONT_SANS = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;

type ViewerMode = '2D' | '3D';
type IconTab = 'module' | 'material' | 'structure' | 'myCabinet' | 'island';

// 모듈 카테고리 탭 (웹 .moduleCategoryTab 스타일과 동일)
const CatTab: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      flex: '1 1 0', minWidth: 0,
      padding: '4px 6px', minHeight: 24,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? TC.bg2 : 'transparent',
      color: active ? TC.primary : TC.ink3,
      border: active ? `1.5px solid ${TC.primary}` : 'none',
      borderRadius: 4,
      fontSize: 11, fontWeight: active ? 600 : 500,
      letterSpacing: '-0.01em',
      cursor: 'pointer', whiteSpace: 'nowrap',
      transition: 'all 0.15s ease',
    }}
  >{children}</button>
);

const CatTabRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    display: 'flex', gap: 1, padding: 2, marginBottom: 4,
    background: TC.bg2, borderRadius: 5,
  }}>{children}</div>
);

const IPadEditor: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const projectName = searchParams.get('projectName') || '리얼프로젝트_kk';

  const spaceInfo = useSpaceConfigStore(s => s.spaceInfo);
  const placedModules = useFurnitureStore(s => s.placedModules);
  const viewMode = useUIStore(s => s.viewMode);
  const setViewMode = useUIStore(s => s.setViewMode);
  const renderMode = useUIStore(s => s.renderMode);
  const showAll = useUIStore(s => s.showAll);
  const showFrame = useUIStore(s => s.showFrame);

  const [mode, setMode] = useState<ViewerMode>('3D');
  const [activeIcon, setActiveIcon] = useState<IconTab>('module');
  const [moduleType, setModuleType] = useState<ModuleType>('all');

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
  const [moduleCategory, setModuleCategory] = useState<'clothing' | 'shoes' | 'kitchen'>('clothing');
  const [kitchenSub, setKitchenSub] = useState<'basic' | 'door-raise' | 'top-down' | 'upper'>('basic');

  const layoutMode = (spaceInfo.layoutMode || 'equal-division') as 'equal-division' | 'free-placement';
  const setSpaceInfo = useSpaceConfigStore(s => s.setSpaceInfo);

  // 웹과 동일한 i18n 라벨
  const LEFT_ICON_TABS: { id: IconTab; label: string; icon: JSX.Element }[] = [
    {
      id: 'module',
      label: t('sidebar.module'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        </svg>
      ),
    },
    { id: 'material', label: t('sidebar.material'), icon: <HiOutlineColorSwatch size={22} /> },
    { id: 'structure', label: '기둥', icon: <TbBoxAlignRight size={22} /> },
    { id: 'myCabinet', label: '커스텀', icon: <MdOutlineDashboardCustomize size={22} /> },
    {
      id: 'island',
      label: '아일랜드',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="7" width="18" height="3" rx="1" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="5" y="10" width="5" height="11" rx="1" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="14" y="10" width="5" height="11" rx="1" stroke="currentColor" strokeWidth="1.8"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: TC.bg2, color: TC.ink, fontFamily: FONT_SANS,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ─────── Top Header ─────── */}
      <div style={{ background: TC.surface, borderBottom: `1px solid ${TC.line}` }}>
        <div style={{ height: 52, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: TC.ink }}/>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: TC.ink }}/>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: TC.ink }}/>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: TC.ink }}>CRAFT</span>
          </div>
          <div style={{ width: 1, height: 20, background: TC.line }}/>
          <button style={{ fontSize: 12, color: TC.ink, background: 'none', border: 'none', cursor: 'pointer' }}>파일</button>
          <button style={{ fontSize: 12, color: TC.ink, background: 'none', border: 'none', cursor: 'pointer' }}>저장</button>
          <div style={{ flex: 1 }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: TC.ink2 }}>
            {projectName}
          </div>
          <div style={{ width: 1, height: 20, background: TC.line }}/>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
            background: TC.primary, color: '#FFF', border: 'none', borderRadius: 6,
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>컨버팅</button>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: TC.bg3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: TC.ink2, fontSize: 11, fontWeight: 600,
          }}>U</div>
        </div>

        <div style={{
          height: 32, background: TC.bg2,
          borderTop: `1px solid ${TC.line3}`,
          display: 'flex', alignItems: 'flex-end', padding: '0 12px',
        }}>
          <div style={{
            padding: '7px 12px', fontSize: 11, color: TC.ink, fontWeight: 500,
            background: TC.surface,
            borderTop: `2px solid ${TC.primary}`,
            borderRight: `1px solid ${TC.line3}`,
            borderLeft: `1px solid ${TC.line3}`,
            height: 30, marginBottom: -1,
          }}>{projectName}</div>
        </div>
      </div>

      {/* ─────── Main 3-column ─────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Left icon rail — 웹 Sidebar와 동일 */}
        <div style={{
          width: 72, background: TC.surface,
          borderRight: `1px solid ${TC.line}`,
          display: 'flex', flexDirection: 'column',
          padding: '12px 0', gap: 14,
          flexShrink: 0,
        }}>
          {LEFT_ICON_TABS.map(tab => {
            const isA = tab.id === activeIcon;
            return (
              <button key={tab.id} onClick={() => setActiveIcon(tab.id)}
                style={{
                  position: 'relative',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 3, padding: '12px 0', margin: '0 8px',
                  background: isA ? TC.bg2 : 'transparent',
                  border: 'none', borderRadius: 8,
                  cursor: 'pointer', transition: 'background 0.12s ease',
                }}>
                {isA && (
                  <span style={{
                    position: 'absolute', left: -8, top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3, height: 20, background: TC.primary,
                    borderRadius: '0 3px 3px 0',
                  }}/>
                )}
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24,
                  color: isA ? TC.primary : TC.ink3,
                  opacity: isA ? 1 : 0.75,
                }}>{tab.icon}</span>
                <span style={{
                  fontSize: 11, fontWeight: isA ? 600 : 500,
                  color: isA ? TC.primary : TC.ink3,
                  opacity: isA ? 1 : 0.75,
                  lineHeight: 1,
                }}>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Catalog panel — 기존 ModuleGallery/MaterialPanel 그대로 사용 */}
        <div style={{
          width: 280, background: TC.surface,
          borderRight: `1px solid ${TC.line}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* 카탈로그 헤더 */}
          <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${TC.line3}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TC.ink }}>
              {LEFT_ICON_TABS.find(tab => tab.id === activeIcon)?.label}
            </div>
          </div>

          {/* 슬롯배치/자유배치 토글 — 웹 .layoutModeToggle 스타일 */}
          <div style={{
            display: 'flex', gap: 1, padding: 2,
            background: TC.bg2, borderRadius: 5,
            margin: '4px 12px 0',
            paddingBottom: 4,
            borderBottom: `1px solid ${TC.line3}`,
            flexShrink: 0,
          }}>
            {([
              { id: 'equal-division', label: '슬롯배치' },
              { id: 'free-placement', label: '자유배치' },
            ] as const).map(m => {
              const active = layoutMode === m.id;
              return (
                <button key={m.id}
                  onClick={() => {
                    if (active) return;
                    if (placedModules.length > 0) {
                      if (!window.confirm('배치 방식을 변경하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) return;
                    }
                    setSpaceInfo({ layoutMode: m.id });
                  }}
                  style={{
                    flex: '1 1 0', minWidth: 0, minHeight: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '4px 6px',
                    background: active ? TC.bg2 : 'transparent',
                    color: active ? TC.primary : TC.ink3,
                    border: active ? `1.5px solid ${TC.primary}` : 'none',
                    borderRadius: 4,
                    fontSize: 11, fontWeight: active ? 600 : 500,
                    letterSpacing: '-0.01em',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >{m.label}</button>
              );
            })}
          </div>

          {/* 카탈로그 콘텐츠 */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {activeIcon === 'module' && (
              <div style={{ padding: 10 }}>
                {/* 의류장/신발장/주방 토글 탭 */}
                <CatTabRow>
                  <CatTab active={moduleCategory === 'clothing'} onClick={() => setModuleCategory('clothing')}>의류장</CatTab>
                  <CatTab active={moduleCategory === 'shoes'} onClick={() => setModuleCategory('shoes')}>신발장</CatTab>
                  <CatTab active={moduleCategory === 'kitchen'} onClick={() => setModuleCategory('kitchen')}>주방</CatTab>
                </CatTabRow>

                {/* 주방 서브 탭 */}
                {moduleCategory === 'kitchen' && (
                  <CatTabRow>
                    <CatTab active={kitchenSub === 'basic'} onClick={() => setKitchenSub('basic')}>기본장</CatTab>
                    <CatTab active={kitchenSub === 'door-raise'} onClick={() => setKitchenSub('door-raise')}>도어올림</CatTab>
                    <CatTab active={kitchenSub === 'top-down'} onClick={() => setKitchenSub('top-down')}>상판내림</CatTab>
                    <CatTab active={kitchenSub === 'upper'} onClick={() => setKitchenSub('upper')}>상부장</CatTab>
                  </CatTabRow>
                )}

                {/* 전체/싱글/듀얼 탭 - 의류장/신발장에서만 표시 */}
                {moduleCategory !== 'kitchen' && (
                  <CatTabRow>
                    <CatTab active={moduleType === 'all'} onClick={() => setModuleType('all')}>전체</CatTab>
                    <CatTab active={moduleType === 'single'} onClick={() => setModuleType('single')}>싱글</CatTab>
                    <CatTab active={moduleType === 'dual'} onClick={() => setModuleType('dual')}>듀얼</CatTab>
                  </CatTabRow>
                )}

                <div style={{ marginTop: 8 }}>
                  <ModuleGallery
                    moduleCategory={moduleCategory}
                    kitchenSubCategory={kitchenSub}
                    selectedType={moduleType}
                    onSelectedTypeChange={setModuleType}
                    hideTabMenu
                  />
                </div>
              </div>
            )}
            {activeIcon === 'material' && (
              <div style={{ padding: 0 }}>
                <MaterialPanel />
              </div>
            )}
            {activeIcon === 'structure' && (
              <div style={{ padding: 20, textAlign: 'center', color: TC.ink3, fontSize: 12 }}>
                뷰어를 탭해서 기둥 추가
              </div>
            )}
            {activeIcon === 'myCabinet' && (
              <div style={{ padding: 20, textAlign: 'center', color: TC.ink3, fontSize: 12 }}>
                커스텀 가구
              </div>
            )}
            {activeIcon === 'island' && (
              <div style={{ padding: 20, textAlign: 'center', color: TC.ink3, fontSize: 12 }}>
                아일랜드
              </div>
            )}
          </div>
        </div>

        {/* Center viewer */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: TC.bg2, position: 'relative', minWidth: 0,
        }}>
          <div style={{
            height: 40, padding: '0 14px',
            display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: `1px solid ${TC.line3}`,
            background: TC.surface, flexShrink: 0,
          }}>
            <div style={{ display: 'flex', background: TC.bg3, borderRadius: 6, padding: 2 }}>
              {(['2D', '3D'] as ViewerMode[]).map(m => {
                const active = m === mode;
                return (
                  <button key={m}
                    onClick={() => { setMode(m); setViewMode(m); }}
                    style={{
                      padding: '4px 16px', borderRadius: 4,
                      background: active ? TC.surface : 'transparent',
                      color: active ? TC.primary : TC.ink3,
                      fontSize: 11, fontWeight: 600,
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      border: 'none', cursor: 'pointer',
                    }}>{m}</button>
                );
              })}
            </div>
            <div style={{ flex: 1 }}/>
            <div style={{ fontSize: 10, color: TC.ink3, fontFamily: FONT_MONO }}>
              {placedModules.length}칸 · {spaceInfo.width}×{spaceInfo.height} · D{spaceInfo.depth}
            </div>
          </div>

          <div ref={viewerRef} style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
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

        {/* Right property panel — 웹 컨트롤 컴포넌트 그대로 재사용 */}
        <div style={{
          width: 300, background: TC.surface,
          borderLeft: `1px solid ${TC.line}`,
          overflow: 'auto', flexShrink: 0,
        }}>
          <IPadRightPanel spaceInfo={spaceInfo} setSpaceInfo={setSpaceInfo} />
        </div>
      </div>
    </div>
  );
};

export default IPadEditor;
