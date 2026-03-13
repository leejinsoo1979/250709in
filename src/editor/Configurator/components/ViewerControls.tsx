import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BiDoorOpen } from 'react-icons/bi';
import { TbBorderOuter } from 'react-icons/tb';
import { Edit3, Eye, EyeOff, Grid3X3, Ruler, Box, Layers, Sun, Moon, MoreHorizontal, Check, ChevronDown } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import styles from './ViewerControls.module.css';
import QRCodeGenerator from '@/editor/shared/ar/components/QRCodeGenerator';
import { useTheme } from '@/contexts/ThemeContext';

export type ViewMode = '2D' | '3D';
export type ViewDirection = 'front' | 'top' | 'left' | 'right' | 'all';
export type RenderMode = 'solid' | 'wireframe';

interface ViewerControlsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  viewDirection: ViewDirection;
  onViewDirectionChange: (direction: ViewDirection) => void;
  renderMode: RenderMode;
  onRenderModeChange: (mode: RenderMode) => void;
  showAll: boolean;
  onShowAllToggle: () => void;
  showDimensions: boolean;
  onShowDimensionsToggle: () => void;
  showDimensionsText: boolean;
  onShowDimensionsTextToggle: () => void;
  showGuides: boolean;
  onShowGuidesToggle: () => void;
  showAxis: boolean;
  onShowAxisToggle: () => void;
  showFurniture: boolean;
  onShowFurnitureToggle: () => void;
  doorsOpen: boolean | null;
  onDoorsToggle: () => void;
  hasDoorsInstalled?: boolean;
  onDoorInstallationToggle?: () => void;
  surroundGenerated?: boolean;
  onSurroundGenerate?: () => void;
}

/** Thin vertical separator */
const Divider = () => <div className={styles.divider} />;

const ViewerControls: React.FC<ViewerControlsProps> = ({
  viewMode,
  onViewModeChange,
  viewDirection,
  onViewDirectionChange,
  renderMode,
  onRenderModeChange,
  showAll,
  onShowAllToggle,
  showDimensions,
  onShowDimensionsToggle,
  showDimensionsText,
  onShowDimensionsTextToggle,
  showGuides,
  onShowGuidesToggle,
  showAxis,
  onShowAxisToggle,
  showFurniture,
  onShowFurnitureToggle,
  doorsOpen,
  onDoorsToggle,
  hasDoorsInstalled = false,
  onDoorInstallationToggle,
  surroundGenerated = false,
  onSurroundGenerate
}) => {
  const { view2DDirection, setView2DDirection, view2DTheme, toggleView2DTheme, setView2DTheme, isMeasureMode, toggleMeasureMode, showFurnitureEditHandles, setShowFurnitureEditHandles, shadowEnabled, setShadowEnabled, edgeOutlineEnabled, setEdgeOutlineEnabled } = useUIStore();
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules, isFurniturePlacementMode } = useFurnitureStore();
  const isFreePlacement = spaceInfo?.layoutMode === 'free-placement';
  const hasFurniture = placedModules.length > 0;
  const { theme } = useTheme();
  const [showQRGenerator, setShowQRGenerator] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileOptions, setShowMobileOptions] = useState(false);
  const [showDisplayMenu, setShowDisplayMenu] = useState(false);
  const displayMenuRef = useRef<HTMLDivElement>(null);

  // 표시 옵션 드롭다운 외부 클릭 감지
  useEffect(() => {
    if (!showDisplayMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (displayMenuRef.current && !displayMenuRef.current.contains(e.target as Node)) {
        setShowDisplayMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDisplayMenu]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ui-store');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.state && data.state.view2DTheme !== undefined) {
          delete data.state.view2DTheme;
          localStorage.setItem('ui-store', JSON.stringify(data));
        }
      }
    } catch (e) {
      console.warn('localStorage 정리 실패:', e);
    }
    const desiredTheme = theme.mode === 'dark' ? 'dark' : 'light';
    setView2DTheme(desiredTheme);
  }, [theme, setView2DTheme]);

  const { t } = useTranslation();

  const viewModes = [
    { id: '3D' as ViewMode, label: '3D' },
    { id: '2D' as ViewMode, label: '2D' }
  ];

  const viewDirections = [
    { id: 'front' as ViewDirection, label: t('viewer.front') },
    { id: 'top' as ViewDirection, label: t('viewer.top') },
    { id: 'left' as ViewDirection, label: t('viewer.left') }
  ];

  const handleViewDirectionChange = (direction: ViewDirection) => {
    setView2DDirection(direction);
    onViewDirectionChange(direction);
  };

  // ── Mobile UI ──
  if (isMobile) {
    return (
      <div className={styles.mobileViewerControls}>
        <div className={styles.mobileMainBar}>
          <div className={styles.mobileButtonGroup}>
            <button
              className={`${styles.mobileButton} ${viewMode === '3D' ? styles.active : ''}`}
              onClick={() => onViewModeChange('3D')}
            >3D</button>
            <button
              className={`${styles.mobileButton} ${viewMode === '2D' ? styles.active : ''}`}
              onClick={() => {
                onViewModeChange('2D');
                if (renderMode !== 'wireframe') onRenderModeChange('wireframe');
              }}
            >2D</button>
          </div>

          {onDoorInstallationToggle && hasFurniture && (
            <button
              className={`${styles.mobileIconButton} ${hasDoorsInstalled ? styles.active : ''}`}
              onClick={onDoorInstallationToggle}
            ><BiDoorOpen size={20} /></button>
          )}

          <button
            className={`${styles.mobileIconButton} ${showDimensions ? styles.active : ''}`}
            onClick={onShowDimensionsToggle}
          ><Ruler size={18} /></button>

          <button
            className={`${styles.mobileIconButton} ${showMobileOptions ? styles.active : ''}`}
            onClick={() => setShowMobileOptions(!showMobileOptions)}
          ><MoreHorizontal size={20} /></button>
        </div>

        {viewMode === '2D' && (
          <div className={styles.mobileViewDirections}>
            {[
              { id: 'front' as ViewDirection, label: '입면' },
              { id: 'top' as ViewDirection, label: '평면' },
              { id: 'left' as ViewDirection, label: '측면' }
            ].map((dir) => (
              <button
                key={dir.id}
                className={`${styles.mobileDirectionButton} ${view2DDirection === dir.id ? styles.active : ''}`}
                onClick={() => handleViewDirectionChange(dir.id)}
              >{dir.label}</button>
            ))}
          </div>
        )}

        {showMobileOptions && (
          <div className={styles.mobileOptionsPanel}>
            <div className={styles.mobileOptionsGrid}>
              {!isFreePlacement && (
                <button className={`${styles.mobileOptionItem} ${showAll ? styles.active : ''}`} onClick={onShowAllToggle}>
                  <Layers size={18} /><span>컬럼</span>
                </button>
              )}
              <button className={`${styles.mobileOptionItem} ${showDimensionsText ? styles.active : ''}`} onClick={onShowDimensionsTextToggle}>
                <Ruler size={18} /><span>치수</span>
              </button>
              {viewMode === '2D' && (
                <button className={`${styles.mobileOptionItem} ${showFurniture ? styles.active : ''}`} onClick={onShowFurnitureToggle}>
                  {showFurniture ? <Eye size={18} /> : <EyeOff size={18} />}<span>가구</span>
                </button>
              )}
              {viewMode === '2D' && (
                <button className={`${styles.mobileOptionItem} ${showGuides ? styles.active : ''}`} onClick={onShowGuidesToggle}>
                  <Grid3X3 size={18} /><span>그리드</span>
                </button>
              )}
              {viewMode === '2D' && (
                <button className={`${styles.mobileOptionItem} ${showAxis ? styles.active : ''}`} onClick={onShowAxisToggle}>
                  <span style={{ fontSize: 16, fontWeight: 'bold' }}>+</span><span>축</span>
                </button>
              )}
              {viewMode === '2D' && (
                <button className={styles.mobileOptionItem} onClick={toggleView2DTheme}>
                  {view2DTheme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                  <span>{view2DTheme === 'dark' ? '다크' : '라이트'}</span>
                </button>
              )}
              {viewMode === '3D' && (
                <button className={`${styles.mobileOptionItem} ${showFurnitureEditHandles ? styles.active : ''}`} onClick={() => setShowFurnitureEditHandles(!showFurnitureEditHandles)}>
                  <Edit3 size={18} /><span>아이콘</span>
                </button>
              )}
              {viewMode === '3D' && (
                <button className={`${styles.mobileOptionItem} ${shadowEnabled ? styles.active : ''}`} onClick={() => setShadowEnabled(!shadowEnabled)}>
                  <Sun size={18} /><span>그림자</span>
                </button>
              )}
              {viewMode === '3D' && (
                <button className={`${styles.mobileOptionItem} ${edgeOutlineEnabled ? styles.active : ''}`} onClick={() => setEdgeOutlineEnabled(!edgeOutlineEnabled)}>
                  <Box size={18} /><span>윤곽선</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Desktop UI ──
  return (
    <div className={styles.viewerControls}>

      {/* ─── Left: Display toggle + options ─── */}
      <div className={styles.toggleGroup}>
        <span className={styles.toggleLabel}>ON</span>
        <button
          className={`${styles.switch} ${showDimensions ? styles.on : styles.off}`}
          onClick={onShowDimensionsToggle}
          title={showDimensions ? 'Hide dimensions' : 'Show dimensions'}
        >
          <div className={styles.switchHandle} />
        </button>
      </div>

      {showDimensions && (
        <>
          <Divider />
          <div className={styles.displayMenuWrapper} ref={displayMenuRef}>
            <button
              className={`${styles.chip} ${showDisplayMenu ? styles.chipActive : ''}`}
              onClick={() => setShowDisplayMenu(!showDisplayMenu)}
            >
              표시 <ChevronDown size={11} />
            </button>
            {showDisplayMenu && (
              <div className={styles.displayDropdown}>
                {viewMode === '2D' && (
                  <button className={styles.displayMenuItem} onClick={onShowFurnitureToggle}>
                    <Check size={13} strokeWidth={2.5} className={showFurniture ? styles.checkVisible : styles.checkHidden} />
                    <span>{t('furniture.title')}</span>
                  </button>
                )}
                {!isFreePlacement && (
                  <button className={styles.displayMenuItem} onClick={onShowAllToggle}>
                    <Check size={13} strokeWidth={2.5} className={showAll ? styles.checkVisible : styles.checkHidden} />
                    <span>{t('viewer.column')}</span>
                  </button>
                )}
                <button className={styles.displayMenuItem} onClick={onShowDimensionsTextToggle}>
                  <Check size={13} strokeWidth={2.5} className={showDimensionsText ? styles.checkVisible : styles.checkHidden} />
                  <span>{t('viewer.dimensions')}</span>
                </button>
                {viewMode === '3D' && (
                  <button className={styles.displayMenuItem} onClick={() => setShowFurnitureEditHandles(!showFurnitureEditHandles)}>
                    <Check size={13} strokeWidth={2.5} className={showFurnitureEditHandles ? styles.checkVisible : styles.checkHidden} />
                    <span>아이콘</span>
                  </button>
                )}
                {viewMode === '2D' && (
                  <>
                    <button className={styles.displayMenuItem} onClick={onShowGuidesToggle}>
                      <Check size={13} strokeWidth={2.5} className={showGuides ? styles.checkVisible : styles.checkHidden} />
                      <span>{t('viewer.grid')}</span>
                    </button>
                    <button className={styles.displayMenuItem} onClick={onShowAxisToggle}>
                      <Check size={13} strokeWidth={2.5} className={showAxis ? styles.checkVisible : styles.checkHidden} />
                      <span>{t('viewer.axis')}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Center: absolute-centered 3D/2D toggle ─── */}
      <div className={styles.centerAbsolute}>
        <div className={styles.segmentedControl}>
          {viewModes.map((mode) => (
            <button
              key={mode.id}
              data-view-mode={mode.id}
              className={`${styles.segmentButton} ${styles.segmentAccent} ${viewMode === mode.id ? styles.segmentAccentActive : ''}`}
              onClick={() => {
                onViewModeChange(mode.id);
                if (mode.id === '2D') {
                  if (renderMode !== 'wireframe') onRenderModeChange('wireframe');
                  requestAnimationFrame(() => {
                    setView2DTheme(theme.mode === 'dark' ? 'dark' : 'light');
                  });
                }
              }}
            >{mode.label}</button>
          ))}
        </div>

        {onDoorInstallationToggle && hasFurniture && (
          <div className={styles.segmentedControl}>
            <button
              className={`${styles.segmentButton} ${styles.segmentIconText} ${hasDoorsInstalled ? styles.segmentAccentActive : ''}`}
              onClick={onDoorInstallationToggle}
            >
              <BiDoorOpen size={13} />
              {hasDoorsInstalled ? '도어제거' : '도어설치'}
            </button>
          </div>
        )}

        {isFreePlacement && hasFurniture && !isFurniturePlacementMode && onSurroundGenerate && (
          <div className={styles.segmentedControl}>
            <button
              className={`${styles.segmentButton} ${styles.segmentIconText} ${surroundGenerated ? styles.segmentAccentActive : ''}`}
              onClick={onSurroundGenerate}
            >
              <TbBorderOuter size={13} />
              서라운드
            </button>
          </div>
        )}
      </div>

      <div className={styles.spacer} />

      {/* ─── Right: View direction (2D 모드에서만 표시) ─── */}
      {viewMode === '2D' && (
        <div className={styles.segmentedControl} style={{ marginRight: '80px' }}>
          {viewDirections.map((direction) => (
            <button
              key={direction.id}
              data-view-direction={direction.id}
              className={`${styles.segmentButton} ${view2DDirection === direction.id ? styles.segmentActive : ''}`}
              style={{ padding: '0 16px', height: '30px', fontSize: '12px' }}
              onClick={() => handleViewDirectionChange(direction.id)}
            >{direction.label}</button>
          ))}
        </div>
      )}

      {showQRGenerator && (
        <QRCodeGenerator onClose={() => setShowQRGenerator(false)} />
      )}
    </div>
  );
};

export default ViewerControls;
