import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BiDoorOpen } from 'react-icons/bi';
import { PiHandTapThin } from 'react-icons/pi';
import { TbBorderOuter } from 'react-icons/tb';
import { Edit3, Eye, EyeOff, Grid3X3, Ruler, Box, Layers, Sun, Moon, MoreHorizontal } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
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
  frameMergeEnabled?: boolean;
  onFrameMergeToggle?: () => void;
}

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
  onSurroundGenerate,
  frameMergeEnabled = false,
  onFrameMergeToggle
}) => {
  const { view2DDirection, setView2DDirection, view2DTheme, toggleView2DTheme, setView2DTheme, isMeasureMode, toggleMeasureMode, showFurnitureEditHandles, setShowFurnitureEditHandles, shadowEnabled, setShadowEnabled, edgeOutlineEnabled, setEdgeOutlineEnabled, isLayoutBuilderOpen, equalDistribution, toggleEqualDistribution, setDoorsOpen } = useUIStore();
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules, isFurniturePlacementMode } = useFurnitureStore();
  const derivedColumnCount = useDerivedSpaceStore((state) => state.columnCount);
  const isFreePlacement = spaceInfo?.layoutMode === 'free-placement';
  const hasFurniture = placedModules.length > 0;
  // 모든 슬롯이 가구로 채워졌는지 판단 (프레임병합 버튼 표시 조건)
  const allSlotsFilled = (() => {
    if (isFreePlacement) return hasFurniture; // 자유배치는 가구 있으면 OK
    const totalSlots = derivedColumnCount || spaceInfo?.customColumnCount || 1;
    const slotFurniture = placedModules.filter(m => !m.isFreePlacement);
    let occupiedSlots = 0;
    slotFurniture.forEach(m => {
      const isDual = m.moduleId?.startsWith('dual-') || m.isDualSlot;
      occupiedSlots += isDual ? 2 : 1;
    });
    return occupiedSlots >= totalSlots;
  })();
  const { theme } = useTheme();
  const [showQRGenerator, setShowQRGenerator] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileOptions, setShowMobileOptions] = useState(false);
  const [showDoorGuide, setShowDoorGuide] = useState(false);

  // 모든 슬롯이 채워지면 안내 표시, 빈 슬롯 생기면 숨김
  useEffect(() => {
    if (hasDoorsInstalled || isFreePlacement || !hasFurniture) {
      setShowDoorGuide(false);
      return;
    }

    const totalSlots = derivedColumnCount || spaceInfo?.customColumnCount || 1;
    const slotFurniture = placedModules.filter(m => !m.isFreePlacement);
    let occupiedSlots = 0;
    slotFurniture.forEach(m => {
      const isDual = m.moduleId?.startsWith('dual-') || m.isDualSlot;
      occupiedSlots += isDual ? 2 : 1;
    });

    if (occupiedSlots >= totalSlots) {
      const timer = setTimeout(() => setShowDoorGuide(true), 1000);
      return () => clearTimeout(timer);
    } else {
      setShowDoorGuide(false);
    }
  }, [placedModules, hasDoorsInstalled, isFreePlacement, derivedColumnCount, spaceInfo?.customColumnCount, hasFurniture]);

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

      {/* ─── Center: absolute-centered 3D/2D toggle ─── */}
      <div className={styles.centerAbsolute}>
        {isFreePlacement && (
          <div className={styles.segmentedControl}>
            <button
              className={`${styles.segmentButton} ${styles.segmentAccent} ${!equalDistribution ? styles.segmentAccentActive : ''}`}
              onClick={() => { if (equalDistribution) toggleEqualDistribution(); }}
            >
              자유
            </button>
            <button
              className={`${styles.segmentButton} ${styles.segmentAccent} ${equalDistribution ? styles.segmentAccentActive : ''}`}
              onClick={() => { if (!equalDistribution) toggleEqualDistribution(); }}
            >
              균등
            </button>
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

        {onDoorInstallationToggle && hasFurniture && (
          <div className={styles.segmentedControl} style={{ position: 'relative' }}>
            <button
              className={`${styles.segmentButton} ${styles.segmentIconText} ${hasDoorsInstalled ? styles.segmentAccentActive : ''}`}
              onClick={() => {
                onDoorInstallationToggle();
                setShowDoorGuide(false);
              }}
            >
              <BiDoorOpen size={13} />
              {hasDoorsInstalled ? '도어제거' : '도어설치'}
            </button>
            {/* 도어 설치 안내 툴팁 */}
            {showDoorGuide && !hasDoorsInstalled && (
              <div
                className={styles.doorGuideTooltip}
                onClick={() => setShowDoorGuide(false)}
              >
                <span>도어를 장착해보세요</span>
                <PiHandTapThin className={styles.doorGuideFingerIcon} size={20} />
              </div>
            )}
          </div>
        )}

        {hasDoorsInstalled && (
          <div className={styles.segmentedControl}>
            <button
              className={`${styles.segmentButton} ${doorsOpen !== true ? styles.segmentAccentActive : ''}`}
              onClick={() => setDoorsOpen(false)}
            >
              Close
            </button>
            <button
              className={`${styles.segmentButton} ${doorsOpen === true ? styles.segmentAccentActive : ''}`}
              onClick={() => setDoorsOpen(true)}
            >
              Open
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

        {/* 프레임분절/병합 버튼 숨김 — CNC 옵티마이저 진입 시 팝업으로 대체 */}
      </div>

      <div className={styles.spacer} />

      {/* ─── Right: View direction (2D 모드에서만 표시) ─── */}
      {viewMode === '2D' && (
        <div className={styles.segmentedControl} style={{ marginRight: isLayoutBuilderOpen ? '400px' : '80px' }}>
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
