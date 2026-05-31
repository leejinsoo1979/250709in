import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BiDoorOpen } from 'react-icons/bi';
import { PiHandTapThin } from 'react-icons/pi';
import { TbBorderOuter, TbZoomScan } from 'react-icons/tb';
import { Edit3, Eye, EyeOff, Grid3X3, Ruler, RulerDimensionLine, Box, Layers, Sun, Moon, MoreHorizontal } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import styles from './ViewerControls.module.css';
import QRCodeGenerator from '@/editor/shared/ar/components/QRCodeGenerator';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/auth/AuthProvider';
import { viewCubeRequest } from '@/editor/shared/viewer3d/components/base/components/AxisArrowsGizmo';
import { getFreePlacementGuideBoundsX } from '@/editor/shared/utils/freePlacementUtils';
import { isSuperAdmin } from '@/firebase/admins';

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
  onStartGuideSetupInNewTab?: () => Promise<boolean> | boolean;
  guideSetupRequest?: boolean;
  onGuideSetupRequestHandled?: () => void;
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
  onFrameMergeToggle,
  onStartGuideSetupInNewTab,
  guideSetupRequest = false,
  onGuideSetupRequestHandled
}) => {
  const { view2DDirection, setView2DDirection, view2DTheme, toggleView2DTheme, setView2DTheme, isLiveDimensionMode, toggleLiveDimensionMode, isTapeMeasureMode, toggleTapeMeasureMode, showFurnitureEditHandles, setShowFurnitureEditHandles, shadowEnabled, setShadowEnabled, edgeOutlineEnabled, setEdgeOutlineEnabled, isLayoutBuilderOpen, equalDistribution, toggleEqualDistribution, setDoorsOpen, slotWidthEditMode, setSlotWidthEditMode, slotEditOriginalColumnCount, setSlotEditOriginalColumnCount, activePlacementWall, setActivePlacementWall, cameraMode, setCameraMode, guideDepthEditMode, setGuideDepthEditMode } = useUIStore();
  const { user } = useAuth();
  const isAllowedUser = isSuperAdmin(user?.email);
  const canCreateFreePlacementGuide = true;
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { placedModules, isFurniturePlacementMode } = useFurnitureStore();
  const derivedColumnCount = useDerivedSpaceStore((state) => state.columnCount);
  const isFreePlacement = spaceInfo?.layoutMode === 'free-placement';
  const isCustomSlotMode = spaceInfo?.customGuideMode === true
    || (spaceInfo?.freePlacementGuides?.length || 0) > 0
    || placedModules.some(module => module.guideSlotPlacement === true);
  const hasCustomGuideSlots = (spaceInfo?.freePlacementGuides?.length || 0) > 0;
  const canShowViewModeToggle = !spaceInfo?.customGuideMode
    || (hasCustomGuideSlots && !spaceInfo?.freePlacementGuideEditing);
  const isNoWallSpace = spaceInfo?.installType === 'freestanding'
    || (!spaceInfo?.wallConfig?.left && !spaceInfo?.wallConfig?.right);
  const canUsePlacementWallTools = isAllowedUser && !isNoWallSpace;
  const placementWallButtons = [
    ...(spaceInfo?.wallConfig?.left ? [{ id: 'left' as const, label: 'L' }] : []),
    { id: 'front' as const, label: 'F' },
    ...(spaceInfo?.wallConfig?.right ? [{ id: 'right' as const, label: 'R' }] : []),
    // 탑뷰(T) 버튼 — 모든 모드
    { id: 'top' as const, label: 'T' },
  ];
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
  const [showGuideDialog, setShowGuideDialog] = useState(false);
  const [guideSlotCount, setGuideSlotCount] = useState(() => String(spaceInfo?.freePlacementGuides?.length || 4));
  const [guideVerticalSplit, setGuideVerticalSplit] = useState(() => (
    spaceInfo?.freePlacementGuides?.some((slot) => slot.guideZone === 'upper' || slot.guideZone === 'lower') || false
  ));
  const [guideUpperSlotCount, setGuideUpperSlotCount] = useState(() => String(
    spaceInfo?.freePlacementGuides?.filter((slot) => slot.guideZone === 'upper').length || 4
  ));
  const [guideLowerSlotCount, setGuideLowerSlotCount] = useState(() => String(
    spaceInfo?.freePlacementGuides?.filter((slot) => slot.guideZone === 'lower').length || 4
  ));
  const guideSetupAutoOpenedRef = useRef(false);
  const guideModeRestoreOpenedRef = useRef(false);

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
    const nextDirection = spaceInfo?.freePlacementGuideEditing ? 'front' : direction;
    setView2DDirection(nextDirection);
    onViewDirectionChange(nextDirection);
  };

  useEffect(() => {
    if (!spaceInfo?.freePlacementGuideEditing) return;
    // 깊이 편집 모드에서는 탑뷰를 허용 — front 강제하지 않음
    if (guideDepthEditMode) return;

    if (viewMode !== '3D') {
      onViewModeChange('3D');
    }
    if (cameraMode !== 'orthographic') {
      setCameraMode('orthographic');
    }
    if (view2DDirection !== 'front') {
      setView2DDirection('front');
      onViewDirectionChange('front');
    }
  }, [
    spaceInfo?.freePlacementGuideEditing,
    guideDepthEditMode,
    viewMode,
    cameraMode,
    view2DDirection,
    onViewModeChange,
    onViewDirectionChange,
    setCameraMode,
    setView2DDirection
  ]);

  const openGuideDialog = () => {
    useUIStore.getState().clearSelectedFurnitureIds();
    useUIStore.getState().setSelectedSlotIndex(null);
    onViewModeChange('3D');
    setCameraMode('orthographic');
    setView2DDirection('front');
    onViewDirectionChange('front');

    const guideSlots = spaceInfo?.freePlacementGuides || [];
    const hasSplitGuides = guideSlots.some((slot) => slot.guideZone === 'upper' || slot.guideZone === 'lower');
    const upperCount = guideSlots.filter((slot) => slot.guideZone === 'upper').length;
    const lowerCount = guideSlots.filter((slot) => slot.guideZone === 'lower').length;
    const fullCount = guideSlots.filter((slot) => !slot.guideZone || slot.guideZone === 'full').length;
    setGuideVerticalSplit(hasSplitGuides);
    setGuideSlotCount(String(fullCount || guideSlots.length || 4));
    setGuideUpperSlotCount(String(upperCount || 4));
    setGuideLowerSlotCount(String(lowerCount || 4));
    setShowGuideDialog(true);
  };

  useEffect(() => {
    if (!guideSetupRequest) {
      guideSetupAutoOpenedRef.current = false;
      return;
    }

    if (guideSetupAutoOpenedRef.current) return;

    guideSetupAutoOpenedRef.current = true;
    onGuideSetupRequestHandled?.();
    openGuideDialog();
  }, [guideSetupRequest]);

  useEffect(() => {
    if (guideSetupAutoOpenedRef.current || guideSetupRequest || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('guideSetup') !== '1') return;

    guideSetupAutoOpenedRef.current = true;
    params.delete('guideSetup');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
    openGuideDialog();
  }, []);

  useEffect(() => {
    const guideCount = spaceInfo?.freePlacementGuides?.length || 0;
    const shouldRestoreGuideDialog = !!spaceInfo?.customGuideMode
      && !spaceInfo?.freePlacementGuideEditing
      && guideCount === 0;

    if (!shouldRestoreGuideDialog) {
      guideModeRestoreOpenedRef.current = false;
      return;
    }
    if (!canCreateFreePlacementGuide || showGuideDialog || guideModeRestoreOpenedRef.current) return;

    guideModeRestoreOpenedRef.current = true;
    openGuideDialog();
  }, [
    spaceInfo?.customGuideMode,
    spaceInfo?.freePlacementGuideEditing,
    spaceInfo?.freePlacementGuides?.length,
    canCreateFreePlacementGuide,
    showGuideDialog
  ]);

  const handleGuideButtonClick = async () => {
    if (spaceInfo?.freePlacementGuideEditing) {
      useUIStore.getState().setSelectedSlotIndex(null);
      setSpaceInfo({
        freePlacementGuides: (spaceInfo.freePlacementGuides || []).map((slot) => ({
          ...slot,
          confirmed: true
        })),
        freePlacementGuideEditing: false
      });
      return;
    }

    // 새 디자인 파일 생성 없이 현재 화면에서 바로 가이드 생성 팝업만 표시
    openGuideDialog();
  };

  useEffect(() => {
    const handleGuideToggle = () => {
      if (!canCreateFreePlacementGuide) return;
      void handleGuideButtonClick();
    };

    const handleGuideClose = () => setShowGuideDialog(false);

    window.addEventListener('free-placement-guide:toggle', handleGuideToggle);
    window.addEventListener('free-placement-guide:close', handleGuideClose);
    return () => {
      window.removeEventListener('free-placement-guide:toggle', handleGuideToggle);
      window.removeEventListener('free-placement-guide:close', handleGuideClose);
    };
  }, [
    canCreateFreePlacementGuide,
    spaceInfo?.freePlacementGuideEditing,
    spaceInfo?.freePlacementGuides,
    handleGuideButtonClick
  ]);

  const stepSlotCount = (value: string, delta: number) => {
    const next = Math.max(1, Math.min(30, Math.floor(Number(value) || 1) + delta));
    return String(next);
  };

  const guideStepperBtnStyle: React.CSSProperties = {
    width: 32,
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--theme-border, #d0d0d0)',
    borderRadius: 6,
    background: 'var(--theme-surface, #f5f5f5)',
    color: 'var(--theme-text, #333)',
    fontSize: 16,
    lineHeight: 1,
    cursor: 'pointer',
    padding: 0
  };

  const createFreePlacementGuides = () => {
    const clampSlotCount = (value: string) => Math.max(1, Math.min(30, Math.floor(Number(value) || 1)));
    const totalWidth = spaceInfo?.width || 0;
    const bounds = spaceInfo ? getFreePlacementGuideBoundsX(spaceInfo) : { startX: -totalWidth / 2, endX: totalWidth / 2 };
    const guideStartX = bounds.startX + totalWidth / 2;
    const guideWidth = Math.max(0, bounds.endX - bounds.startX);
    const makeSlots = (count: number, guideZone: 'full' | 'upper' | 'lower') => {
      const slotWidth = guideWidth > 0 ? guideWidth / count : 0;
      return Array.from({ length: count }, (_, index) => ({
        id: `free-guide-${guideZone}-${index + 1}`,
        index,
        x: guideStartX + slotWidth * index,
        width: slotWidth,
        guideZone,
        confirmed: false
      }));
    };
    const nextGuides = guideVerticalSplit
      ? [
        ...makeSlots(clampSlotCount(guideUpperSlotCount), 'upper'),
        ...makeSlots(clampSlotCount(guideLowerSlotCount), 'lower')
      ]
      : makeSlots(clampSlotCount(guideSlotCount), 'full');

    useUIStore.getState().setSelectedSlotIndex(null);
    setSpaceInfo({
      freePlacementGuides: nextGuides,
      freePlacementGuideEditing: true,
      customGuideMode: true
    });
    onViewModeChange('3D');
    setCameraMode('orthographic');
    setView2DDirection('front');
    onViewDirectionChange('front');
    if (guideVerticalSplit) {
      setGuideUpperSlotCount(String(clampSlotCount(guideUpperSlotCount)));
      setGuideLowerSlotCount(String(clampSlotCount(guideLowerSlotCount)));
    } else {
      setGuideSlotCount(String(clampSlotCount(guideSlotCount)));
    }
    setShowGuideDialog(false);
  };

  // ── Mobile UI ──
  if (isMobile) {
    return (
      <div className={styles.mobileViewerControls}>
        {spaceInfo?.freePlacementGuideEditing && (
          <button
            type="button"
            className={`${styles.guideCreateButton} ${styles.guideCreateButtonActive}`}
            onClick={handleGuideButtonClick}
          >
            <Grid3X3 size={13} />
            <span>배치시작</span>
          </button>
        )}

        <div className={styles.mobileMainBar}>
          <div className={styles.mobileButtonGroup}>
            <button
              className={`${styles.mobileButton} ${viewMode === '3D' ? styles.active : ''}`}
              disabled={spaceInfo?.freePlacementGuideEditing}
              onClick={() => {
                if (spaceInfo?.freePlacementGuideEditing) return;
                onViewModeChange('3D');
              }}
            >3D</button>
            <button
              className={`${styles.mobileButton} ${viewMode === '2D' ? styles.active : ''}`}
              onClick={() => {
                onViewModeChange('2D');
                // 2D↔wireframe 자동 연동 제거: 렌더모드는 사용자가 직접 선택
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
              disabled={spaceInfo?.freePlacementGuideEditing && dir.id !== 'front'}
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
                <button className={`${styles.mobileOptionItem} ${isLiveDimensionMode ? styles.active : ''}`} onClick={toggleLiveDimensionMode}>
                  <TbZoomScan size={18} /><span>스캔</span>
                </button>
              )}
              {viewMode === '3D' && (
                <button className={`${styles.mobileOptionItem} ${isTapeMeasureMode ? styles.active : ''}`} onClick={toggleTapeMeasureMode}>
                  <RulerDimensionLine size={18} /><span>줄자</span>
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
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Desktop UI ──
  return (
    <div className={styles.viewerControls}>
      {viewMode === '3D' && spaceInfo?.customGuideMode && (spaceInfo.freePlacementGuides?.length || 0) > 0 && (
        <button
          type="button"
          className={`${styles.guideCreateButton} ${styles.guideCreateButtonActive} ${styles.guideSlotEditButton}`}
          onClick={() => {
            if (spaceInfo?.freePlacementGuideEditing) {
              // 배치시작: 가이드 확정
              handleGuideButtonClick();
            } else {
              // 슬롯수정: 편집 모드로 + 슬롯 confirmed 해제 → 너비 수정/추가 가능
              setSpaceInfo({
                freePlacementGuideEditing: true,
                freePlacementGuides: (spaceInfo.freePlacementGuides || []).map((s) => ({ ...s, confirmed: false })),
              });
            }
          }}
          title={spaceInfo?.freePlacementGuideEditing ? '배치시작' : '슬롯수정'}
        >
          <Grid3X3 size={18} />
          <span>{spaceInfo?.freePlacementGuideEditing ? '배치시작' : '슬롯수정'}</span>
        </button>
      )}

      {/* ─── Left: L/F/R 측면 배치벽 토글 (3D 모드에서만) — 기즈모 박스 중앙과 수직 정렬 ─── */}
      {canUsePlacementWallTools && viewMode === '3D' && (
        <div className={styles.segmentedControl} style={{ marginLeft: 19 }}>
          {placementWallButtons.map((btn) => {
            const isTop = btn.id === 'top';
            const active = isTop ? guideDepthEditMode : (!guideDepthEditMode && activePlacementWall === btn.id);
            return (
              <button
                key={btn.id}
                className={`${styles.segmentButton} ${styles.segmentAccent} ${active ? styles.segmentAccentActive : ''}`}
                onClick={() => {
                  if (isTop) {
                    // T: 깊이 편집 모드 ON + 기즈모 top 시점 (카메라·기즈모 동기화)
                    setGuideDepthEditMode(true);
                    onViewModeChange('3D');
                    setCameraMode('orthographic');
                    viewCubeRequest.handler?.('top');
                  } else {
                    // L/F/R: 깊이 모드 해제 후 해당 면으로 (기즈모 동기화)
                    if (guideDepthEditMode) setGuideDepthEditMode(false);
                    viewCubeRequest.handler?.(btn.id as any);
                  }
                }}
              >{btn.label}</button>
            );
          })}
        </div>
      )}

      {/* ─── Center: absolute-centered 3D/2D toggle ─── */}
      <div className={styles.centerAbsolute}>
        {isFreePlacement && !isCustomSlotMode && (() => {
          // 자유배치에서 상부장/하부장이 하나라도 배치되면 중앙 자유/균등 토글 숨김
          // (대신 상부장은 위쪽, 하부장은 아래쪽에 각각 전용 토글이 표시됨)
          const hasUpperOrLower = placedModules.some(m => {
            if (m.isSurroundPanel) return false;
            const id = m.moduleId || '';
            return id.startsWith('upper-') || id.includes('-upper-') || id.startsWith('lower-') || id.includes('-lower-');
          });
          if (hasUpperOrLower) return null;
          return (
            <>
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
            </>
          );
        })()}

        {/* 슬롯배치 모드: 자유=슬롯 너비 직접 입력, 균등=균등분할 (sbbc212@gmail.com 전용) */}
        {isAllowedUser && !isFreePlacement && !isCustomSlotMode && !spaceInfo?.droppedCeiling?.enabled && !spaceInfo?.curtainBox?.enabled && (() => {
          const isSlotCustom = Array.isArray(spaceInfo?.customSlotWidths) && spaceInfo.customSlotWidths.length > 0;
          const hasSlotPlaced = placedModules.some(m => !m.isFreePlacement);
          const isCustomActive = isSlotCustom || slotWidthEditMode;
          const handleSwitchToCustom = () => {
            if (isCustomActive) return;
            // 자유 진입 직전 컬럼 수 저장 (균등 복귀 시 복원용)
            const currentColumnCount = spaceInfo?.customColumnCount;
            setSlotEditOriginalColumnCount(currentColumnCount ?? null);
            setSlotWidthEditMode(true);
          };
          const handleSwitchToEqual = () => {
            if (!isCustomActive) return;
            if (isSlotCustom) {
              if (hasSlotPlaced && !window.confirm('슬롯 너비를 균등분할로 되돌리면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) {
                return;
              }
              if (hasSlotPlaced) {
                useFurnitureStore.getState().clearAllModules();
              }
              // 자유 진입 전 컬럼 수로 복귀, customSlotWidths 제거
              useSpaceConfigStore.getState().setSpaceInfo({
                customSlotWidths: undefined,
                customColumnCount: slotEditOriginalColumnCount ?? undefined,
              });
            }
            setSlotEditOriginalColumnCount(null);
            setSlotWidthEditMode(false);
          };
          return (
            <div className={styles.segmentedControl}>
              <button
                type="button"
                className={`${styles.segmentButton} ${styles.segmentAccent} ${isCustomActive ? styles.segmentAccentActive : ''}`}
                onClick={handleSwitchToCustom}
              >
                자유
              </button>
              <button
                type="button"
                className={`${styles.segmentButton} ${styles.segmentAccent} ${!isCustomActive ? styles.segmentAccentActive : ''}`}
                onClick={handleSwitchToEqual}
              >
                균등
              </button>
            </div>
          );
        })()}

        {/* 가이드 모드: 폭/깊이 토글 — 깊이 선택 시 탑뷰로 슬롯별 깊이 설정 */}
        {spaceInfo?.customGuideMode && (
          <div className={styles.segmentedControl}>
            <button
              className={`${styles.segmentButton} ${!guideDepthEditMode ? styles.segmentActive : ''}`}
              onClick={() => {
                if (!guideDepthEditMode) return;
                // 폭: 정면 복귀 (기즈모 front 동기화)
                setGuideDepthEditMode(false);
                onViewModeChange('3D');
                setCameraMode('orthographic');
                viewCubeRequest.handler?.('front');
              }}
            >폭</button>
            <button
              className={`${styles.segmentButton} ${guideDepthEditMode ? styles.segmentActive : ''}`}
              onClick={() => {
                if (guideDepthEditMode) return;
                // 깊이: 진입 시 ThreeCanvas에서 탑뷰 카메라/줌/포커스를 완전 초기화한다.
                setActivePlacementWall('front');
                setGuideDepthEditMode(true);
                onViewModeChange('3D');
                setCameraMode('orthographic');
              }}
            >깊이</button>
          </div>
        )}

        {canShowViewModeToggle && (
          <div className={styles.segmentedControl}>
            {viewModes.map((mode) => (
              <button
                key={mode.id}
                data-view-mode={mode.id}
                className={`${styles.segmentButton} ${styles.segmentAccent} ${viewMode === mode.id ? styles.segmentAccentActive : ''}`}
                onClick={() => {
                  onViewModeChange(mode.id);
                  if (mode.id === '2D') {
                    // 2D↔wireframe 자동 연동 제거: 렌더모드는 사용자가 직접 선택
                    requestAnimationFrame(() => {
                      setView2DTheme(theme.mode === 'dark' ? 'dark' : 'light');
                    });
                  }
                }}
              >{mode.label}</button>
            ))}
          </div>
        )}


        {/* 스캔/줄자 버튼 — 우측 패널 토글 옆 세로 배열로 이동 (Configurator/index.tsx 참조) */}

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
            {/* 도어 설치 안내 툴팁 (3D 뷰에서만) */}
            {showDoorGuide && !hasDoorsInstalled && viewMode === '3D' && (
              <div
                className={styles.doorGuideTooltip}
                onClick={() => setShowDoorGuide(false)}
              >
                <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)', transformOrigin: 'center', lineHeight: 0 }}>
                  <PiHandTapThin className={styles.doorGuideFingerIcon} size={20} />
                </span>
                <span>도어를 장착해보세요</span>
              </div>
            )}
          </div>
        )}

        {/* Close/Open → 뷰어 캔버스 상단 중앙에 별도 배치 (Configurator/index.tsx) */}

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
              disabled={spaceInfo?.freePlacementGuideEditing && direction.id !== 'front'}
              onClick={() => handleViewDirectionChange(direction.id)}
            >{direction.label}</button>
          ))}
        </div>
      )}

      {showQRGenerator && (
        <QRCodeGenerator onClose={() => setShowQRGenerator(false)} />
      )}

      {showGuideDialog && (
        <div className={styles.guideDialogBackdrop} onMouseDown={() => { setShowGuideDialog(false); if (!spaceInfo?.freePlacementGuides?.length) setSpaceInfo({ customGuideMode: false }); }}>
          <div className={styles.guideDialog} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.guideDialogHeader}>
              <div>
                <div className={styles.guideDialogTitle}>가이드 생성</div>
                <div className={styles.guideDialogSubtitle}>와리를 몇 개 슬롯으로 나눌지 입력하세요.</div>
              </div>
              <button
                type="button"
                className={styles.guideDialogClose}
                onClick={() => { setShowGuideDialog(false); if (!spaceInfo?.freePlacementGuides?.length) setSpaceInfo({ customGuideMode: false }); }}
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className={styles.guideSplitToggle}>
              <span>슬롯 상하분할</span>
              <button
                type="button"
                className={`${styles.guideSplitToggleButton} ${guideVerticalSplit ? styles.guideSplitToggleButtonActive : ''}`}
                onClick={() => setGuideVerticalSplit((value) => !value)}
                aria-pressed={guideVerticalSplit}
                aria-label="슬롯 상하분할"
              >
                <span className={styles.guideSplitToggleKnob} />
              </button>
            </div>

            {guideVerticalSplit ? (
              <div className={styles.guideSplitFields}>
                <label className={styles.guideDialogField}>
                  <span>상부 모듈 갯수</span>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
                    <button type="button" style={guideStepperBtnStyle} onClick={() => setGuideUpperSlotCount((v) => stepSlotCount(v, -1))} aria-label="감소">−</button>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={guideUpperSlotCount}
                      onChange={(event) => setGuideUpperSlotCount(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') createFreePlacementGuides();
                        if (event.key === 'Escape') setShowGuideDialog(false);
                      }}
                      autoFocus
                      style={{ flex: 1, textAlign: 'center' }}
                    />
                    <button type="button" style={guideStepperBtnStyle} onClick={() => setGuideUpperSlotCount((v) => stepSlotCount(v, 1))} aria-label="증가">+</button>
                  </div>
                </label>
                <label className={styles.guideDialogField}>
                  <span>하부 모듈 갯수</span>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
                    <button type="button" style={guideStepperBtnStyle} onClick={() => setGuideLowerSlotCount((v) => stepSlotCount(v, -1))} aria-label="감소">−</button>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={guideLowerSlotCount}
                      onChange={(event) => setGuideLowerSlotCount(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') createFreePlacementGuides();
                        if (event.key === 'Escape') setShowGuideDialog(false);
                      }}
                      style={{ flex: 1, textAlign: 'center' }}
                    />
                    <button type="button" style={guideStepperBtnStyle} onClick={() => setGuideLowerSlotCount((v) => stepSlotCount(v, 1))} aria-label="증가">+</button>
                  </div>
                </label>
              </div>
            ) : (
              <label className={styles.guideDialogField}>
                <span>모듈 갯수</span>
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
                  <button type="button" style={guideStepperBtnStyle} onClick={() => setGuideSlotCount((v) => stepSlotCount(v, -1))} aria-label="감소">−</button>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={guideSlotCount}
                    onChange={(event) => setGuideSlotCount(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') createFreePlacementGuides();
                      if (event.key === 'Escape') setShowGuideDialog(false);
                    }}
                    autoFocus
                    style={{ flex: 1, textAlign: 'center' }}
                  />
                  <button type="button" style={guideStepperBtnStyle} onClick={() => setGuideSlotCount((v) => stepSlotCount(v, 1))} aria-label="증가">+</button>
                </div>
              </label>
            )}

            <div className={styles.guideDialogMeta}>
              {guideVerticalSplit
                ? '좌우 이격을 제외한 배치 가능 폭을 상부/하부 각각 균등 분할합니다.'
                : '좌우 이격을 제외한 배치 가능 폭 기준으로 우선 균등 가이드를 생성합니다.'}
            </div>

            <div className={styles.guideDialogActions}>
              <button type="button" className={styles.guideDialogSecondary} onClick={() => { setShowGuideDialog(false); if (!spaceInfo?.freePlacementGuides?.length) setSpaceInfo({ customGuideMode: false }); }}>
                취소
              </button>
              <button type="button" className={styles.guideDialogPrimary} onClick={createFreePlacementGuides}>
                생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewerControls;
