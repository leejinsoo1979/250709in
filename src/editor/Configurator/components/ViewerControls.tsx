import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BiDoorOpen } from 'react-icons/bi';
import { Edit3, Eye, EyeOff, Grid3X3, Ruler, Box, Layers, Sun, Moon, MoreHorizontal, Check } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
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
  doorsOpen: boolean;
  onDoorsToggle: () => void;
  hasDoorsInstalled?: boolean;
  onDoorInstallationToggle?: () => void;
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
  onDoorInstallationToggle
}) => {
  const { view2DDirection, setView2DDirection, view2DTheme, toggleView2DTheme, setView2DTheme, isMeasureMode, toggleMeasureMode, showFurnitureEditHandles, setShowFurnitureEditHandles } = useUIStore();
  const { theme } = useTheme();
  const [showQRGenerator, setShowQRGenerator] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileOptions, setShowMobileOptions] = useState(false);

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

  const renderModes = [
    { id: 'solid' as RenderMode, label: t('viewer.solid') },
    { id: 'wireframe' as RenderMode, label: t('viewer.wireframe') }
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

          {onDoorInstallationToggle && (
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
              <button className={`${styles.mobileOptionItem} ${showAll ? styles.active : ''}`} onClick={onShowAllToggle}>
                <Layers size={18} /><span>컬럼</span>
              </button>
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
          <div className={styles.chipGroup}>
            {viewMode === '2D' && (
              <button
                className={`${styles.chip} ${showFurniture ? styles.chipActive : ''}`}
                onClick={onShowFurnitureToggle}
              >{showFurniture && <Check size={13} strokeWidth={2.5} />}{t('furniture.title')}</button>
            )}
            <button
              className={`${styles.chip} ${showAll ? styles.chipActive : ''}`}
              onClick={onShowAllToggle}
            >{showAll && <Check size={13} strokeWidth={2.5} />}{t('viewer.column')}</button>
            <button
              className={`${styles.chip} ${showDimensionsText ? styles.chipActive : ''}`}
              onClick={onShowDimensionsTextToggle}
            >{showDimensionsText && <Check size={13} strokeWidth={2.5} />}{t('viewer.dimensions')}</button>
            {viewMode === '3D' && (
              <button
                className={`${styles.chip} ${showFurnitureEditHandles ? styles.chipActive : ''}`}
                onClick={() => setShowFurnitureEditHandles(!showFurnitureEditHandles)}
              >{showFurnitureEditHandles && <Check size={13} strokeWidth={2.5} />}아이콘</button>
            )}
            {viewMode === '2D' && (
              <>
                <button
                  className={`${styles.chip} ${showGuides ? styles.chipActive : ''}`}
                  onClick={onShowGuidesToggle}
                >{showGuides && <Check size={13} strokeWidth={2.5} />}{t('viewer.grid')}</button>
                <button
                  className={`${styles.chip} ${showAxis ? styles.chipActive : ''}`}
                  onClick={onShowAxisToggle}
                >{showAxis && <Check size={13} strokeWidth={2.5} />}{t('viewer.axis')}</button>
              </>
            )}
          </div>
        </>
      )}

      <div className={styles.spacer} />

      {/* ─── Center: Render + View mode ─── */}
      {viewMode === '3D' && (
        <div className={styles.segmentedControl}>
          {renderModes.map((mode) => (
            <button
              key={mode.id}
              className={`${styles.segmentButton} ${renderMode === mode.id ? styles.segmentActive : ''}`}
              onClick={() => onRenderModeChange(mode.id)}
            >{mode.label}</button>
          ))}
        </div>
      )}

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

      {onDoorInstallationToggle && (
        <div className={styles.segmentedControl}>
          <button
            className={`${styles.segmentButton} ${styles.segmentIconText} ${hasDoorsInstalled ? styles.segmentAccentActive : ''}`}
            onClick={onDoorInstallationToggle}
          >
            <BiDoorOpen size={13} />
            {t('viewer.doorInstallation')}
          </button>
        </div>
      )}

      <div className={styles.spacer} />

      {/* ─── Right: View direction ─── */}
      <div className={styles.segmentedControl}>
        {viewDirections.map((direction) => (
          <button
            key={direction.id}
            data-view-direction={direction.id}
            className={`${styles.segmentButton} ${view2DDirection === direction.id ? styles.segmentActive : ''}`}
            onClick={() => handleViewDirectionChange(direction.id)}
          >{direction.label}</button>
        ))}
      </div>

      {showQRGenerator && (
        <QRCodeGenerator onClose={() => setShowQRGenerator(false)} />
      )}
    </div>
  );
};

export default ViewerControls;
