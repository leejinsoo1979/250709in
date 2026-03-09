import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { CustomFurnitureConfig, CustomElement, CustomSection } from '@/editor/shared/furniture/types';
import BoxWithEdges from '../components/BoxWithEdges';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { DrawerRenderer } from '../DrawerRenderer';
import { ShelfRenderer } from '../ShelfRenderer';
import { ClothingRod } from '../components/ClothingRod';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { SettingsIcon, EditIcon } from '@/components/common/Icons';
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings } from '@/editor/shared/utils/materialConstants';
import DimensionText from '../components/DimensionText';
import { Line } from '@react-three/drei';

interface CustomizableBoxModuleProps {
  width: number;   // mm
  height: number;  // mm
  depth: number;   // mm
  customConfig: CustomFurnitureConfig;
  color?: string;
  isDragging?: boolean;
  isEditMode?: boolean;
  showFurniture?: boolean;
  isHighlighted?: boolean;
  placedFurnitureId?: string;
  category?: 'full' | 'upper' | 'lower';
  panelGrainDirections?: { [key: string]: 'horizontal' | 'vertical' };
  lowerSectionDepth?: number; // 하부 섹션 깊이 (mm)
  upperSectionDepth?: number; // 상부 섹션 깊이 (mm)
  lowerSectionDepthDirection?: 'front' | 'back'; // 하부 깊이 줄이는 방향
  upperSectionDepthDirection?: 'front' | 'back'; // 상부 깊이 줄이는 방향
  lowerLeftSectionDepth?: number; // 하부 좌측 영역 깊이 (mm)
  lowerRightSectionDepth?: number; // 하부 우측 영역 깊이 (mm)
  backPanelThickness?: number; // 백패널 두께 (mm, 기본값: 9)
  isEditable?: boolean; // true: 커스텀 편집 가능 (톱니 아이콘 표시), false: 고정 구조 (My캐비넷)
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
  onDoubleClick?: (e: any) => void;
}

// mm → Three.js units
const mmToUnit = (val: number) => val * 0.01;

// ── 선반 간격 입력 컴포넌트 ──
interface ShelfGapInputProps {
  value: number;
  sIdx: number;
  gapIdx: number;
  shelfIdx: number;
  side: 'full' | 'left' | 'right';
  sectionHeight: number;
  heights: number[];
  sortedHeights: number[];
  panelThickness: number;
  placedFurnitureId?: string;
  customConfig: CustomFurnitureConfig;
  onFocusChange?: (focused: boolean) => void;
}

const ShelfGapInput: React.FC<ShelfGapInputProps> = React.memo(({
  value,
  sIdx,
  gapIdx,
  side,
  sectionHeight,
  panelThickness,
  placedFurnitureId,
  onFocusChange,
}) => {
  const [localVal, setLocalVal] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setLocalVal(value.toString());
    }
  }, [value]);

  const applyGapChange = useCallback((newGap: number) => {
    if (!placedFurnitureId) return;
    const store = useFurnitureStore.getState();
    const mod = store.placedModules.find(m => m.id === placedFurnitureId);
    if (!mod?.customConfig) return;

    const sections = [...mod.customConfig.sections];
    const sec = { ...sections[sIdx] };
    const elemKey = side === 'full' ? 'elements' : side === 'left' ? 'leftElements' : 'rightElements';
    const elements = [...(sec[elemKey] || [])];
    const el = elements[0];
    if (!el || el.type !== 'shelf' || !('heights' in el)) return;

    const hArr = [...el.heights];
    const sorted = [...hArr].sort((a, b) => a - b);
    const idxMap = [...hArr].map((h, i) => ({ h, i })).sort((a, b) => a.h - b.h);

    let targetOrigIdx: number;
    let newHeight: number;
    const halfT = panelThickness / 2;

    if (gapIdx === 0) {
      // 바닥 → 첫선반 하단: 내경 = 선반중심 - halfT → 선반중심 = newGap + halfT
      targetOrigIdx = idxMap[0].i;
      newHeight = newGap + halfT;
    } else if (gapIdx >= sorted.length) {
      // 마지막선반 윗면 → 상판: 내경 = sectionH - 선반중심 - halfT → 선반중심 = sectionH - newGap - halfT
      targetOrigIdx = idxMap[sorted.length - 1].i;
      newHeight = sectionHeight - newGap - halfT;
    } else {
      // 선반 사이: 내경 = 위선반중심 - 아래선반중심 - panelThickness
      targetOrigIdx = idxMap[gapIdx].i;
      newHeight = sorted[gapIdx - 1] + panelThickness + newGap;
    }

    newHeight = Math.max(50, Math.min(sectionHeight, Math.round(newHeight)));
    hArr[targetOrigIdx] = newHeight;

    elements[0] = { ...el, heights: hArr };
    (sec as any)[elemKey] = elements;
    sections[sIdx] = sec;

    store.updatePlacedModule(placedFurnitureId, {
      customConfig: { ...mod.customConfig, sections },
    });
  }, [placedFurnitureId, sIdx, gapIdx, side, sectionHeight, panelThickness]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    const current = parseInt(localVal, 10) || value;
    const delta = e.key === 'ArrowUp' ? 1 : -1;
    const newGap = Math.max(10, current + delta);
    setLocalVal(newGap.toString());
    applyGapChange(newGap);
  }, [localVal, value, applyGapChange]);

  const handleBlur = useCallback(() => {
    const parsed = parseInt(localVal, 10);
    if (!isNaN(parsed) && parsed !== value) {
      applyGapChange(Math.max(10, parsed));
    } else {
      setLocalVal(value.toString());
    }
    onFocusChange?.(false);
  }, [localVal, value, applyGapChange, onFocusChange]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
    onFocusChange?.(true);
  }, [onFocusChange]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onFocus={handleFocus}
      style={{
        width: '40px',
        height: '18px',
        fontSize: '11px',
        textAlign: 'center',
        border: '1px solid #999',
        borderRadius: '2px',
        background: 'rgba(255,255,255,0.9)',
        color: '#333',
        outline: 'none',
        padding: '0 2px',
        cursor: 'text',
      }}
    />
  );
});

ShelfGapInput.displayName = 'ShelfGapInput';

/**
 * 커스터마이징 가구 3D 렌더링 컴포넌트
 *
 * 기존 BaseFurnitureShell과 동일한 체결 구조:
 * - 측판(좌/우): 전체 높이, 전체 깊이 (구조체)
 * - 상판/하판: 측판 사이에 끼워넣기, 깊이 26mm 줄임, 좌우 0.5mm씩 줄임
 * - 백패널: 9mm 두께, 측판보다 넓게 (innerW + 10mm), 뒤쪽 배치
 *
 * 내부 요소(서랍/옷봉/선반)는 기존 DrawerRenderer, ClothingRod, ShelfRenderer를
 * 그대로 재사용하여 동일한 생성 공식/보링/타공 방식을 유지합니다.
 */
const CustomizableBoxModule: React.FC<CustomizableBoxModuleProps> = ({
  width,
  height,
  depth,
  customConfig,
  color,
  category = 'full',
  isDragging = false,
  isEditMode = false,
  showFurniture = true,
  isHighlighted = false,
  placedFurnitureId,
  panelGrainDirections,
  lowerSectionDepth,
  upperSectionDepth,
  lowerSectionDepthDirection = 'front',
  upperSectionDepthDirection = 'front',
  lowerLeftSectionDepth,
  lowerRightSectionDepth,
  backPanelThickness: backPanelThicknessProp,
  isEditable = true,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerOver,
  onPointerOut,
  onDoubleClick,
}) => {
  const { renderMode } = useSpace3DView();
  const { spaceInfo } = useSpaceConfigStore();
  const { theme } = useTheme();
  const viewMode = useUIStore(state => state.viewMode);
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const activePopup = useUIStore(state => state.activePopup);
  const { camera, gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  const panelThickness = customConfig.panelThickness || 18; // mm
  const t = mmToUnit(panelThickness); // Three.js 단위
  const backPanelThicknessMm = backPanelThicknessProp || 9; // 백패널 두께 (3/5/9mm)
  const backPanelT = mmToUnit(backPanelThicknessMm);
  const backReductionMm = backPanelThicknessMm + 17; // 상/하판/선반 깊이 줄임 (백패널 + 오프셋)
  const backReduction = mmToUnit(backReductionMm);
  const widthReductionMm = 1; // 좌우 0.5mm씩 줄임
  const widthReduction = mmToUnit(widthReductionMm);
  const backPanelWidthExtMm = 10; // 백패널 너비 확장 (좌우 5mm씩)
  const backPanelHeightExtMm = 26; // 백패널 높이 확장 (상하 13mm씩)
  const backPanelDepthOffsetMm = 17; // 백패널 뒤쪽에서의 오프셋
  const drawerTopInsetMm = 85; // 서랍 섹션 상판 앞쪽 들여쓰기
  const drawerTopInset = mmToUnit(drawerTopInsetMm);

  // Three.js 단위 치수
  const W = mmToUnit(width);
  const H = mmToUnit(height);
  const D = mmToUnit(depth);

  // 내부 너비 (측판 두께 제외) - 기존 BaseFurnitureShell과 동일
  const innerW = W - 2 * t;
  const innerWidthMm = width - 2 * panelThickness;

  // 재질 설정
  const materialConfig = spaceInfo.materialConfig || {
    interiorColor: '#FFFFFF',
    doorColor: '#E0E0E0',
  };

  const getThemeColor = () => {
    const themeColorMap: Record<string, string> = {
      blue: '#3b82f6', purple: '#8b5cf6', green: '#10b981', orange: '#f59e0b',
      red: '#ef4444', pink: '#ec4899', teal: '#14b8a6', indigo: '#6366f1',
      amber: '#d97706', emerald: '#059669', rose: '#f43f5e', cyan: '#06b6d4',
      copper: '#AD4F34', forest: '#1B3924', olive: '#4C462C',
    };
    return themeColorMap[theme.color] || '#3b82f6';
  };

  const furnitureColor = (isDragging || isEditMode) ? getThemeColor() : (
    color || materialConfig.interiorColor || '#D4C5A9'
  );

  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(furnitureColor),
      roughness: 0.7,
      metalness: 0.1,
    });
  }, [furnitureColor]);

  // 텍스처 URL 추출
  const textureUrl = ('interiorTexture' in materialConfig) ? (materialConfig as any).interiorTexture : undefined;

  // 텍스처 적용 (useBaseFurniture와 동일한 패턴)
  useEffect(() => {
    if (isDragging) {
      if (material) {
        material.map = null;
        material.needsUpdate = true;
      }
      return;
    }

    if (textureUrl && material) {
      if (isCabinetTexture1(textureUrl)) {
        applyCabinetTexture1Settings(material);
        material.needsUpdate = true;
      }

      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        textureUrl,
        (texture) => {
          if (isDragging) {
            texture.dispose();
            return;
          }
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1, 1);
          material.map = texture;

          if (isOakTexture(textureUrl)) {
            applyOakTextureSettings(material, false);
          } else if (!isCabinetTexture1(textureUrl)) {
            material.color.setHex(0xffffff);
            material.toneMapped = true;
            material.roughness = 0.6;
          }

          material.needsUpdate = true;
          requestAnimationFrame(() => {
            material.needsUpdate = true;
          });
        },
        undefined,
        (error) => {
          console.warn('CustomizableBoxModule 텍스처 로드 실패:', error);
        }
      );
    } else if (material) {
      if (material.map) {
        material.map.dispose();
        material.map = null;
      }
      material.color.set(furnitureColor);
      material.toneMapped = true;
      material.roughness = 0.6;
      material.needsUpdate = true;
    }
  }, [textureUrl, material, furnitureColor, isDragging, isEditMode]);

  const sections = customConfig.sections;
  const isSplit = sections.length >= 2;

  // 섹션 옵션 아이콘 상태
  const showDimensions = useUIStore(state => state.showDimensions);
  const showFurnitureEditHandles = useUIStore(state => state.showFurnitureEditHandles);
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);
  const [isEditingGap, setIsEditingGap] = useState(false);

  const showSectionIcons = isEditable && showFurnitureEditHandles && showDimensions
    && viewMode === '3D' && !isDragging && showFurniture && !isEditingGap;

  // 서랍이 상판에 밀착하는지 (fullFill 또는 drawerAlign=top) - 상판 85mm 들여쓰기 판단용
  const sectionDrawerTouchesTop = (section: CustomSection, sectionInnerH: number): boolean => {
    const allElems = [...(section.elements || []), ...(section.leftElements || []), ...(section.rightElements || [])];
    return allElems.some(el => {
      if (el.type !== 'drawer') return false;
      // drawerAlign이 top이면 상판에 밀착
      if ('drawerAlign' in el && el.drawerAlign === 'top') return true;
      // fullFill이면 상판에 밀착
      const gapHeight = 23.6;
      const totalH = el.heights.reduce((s: number, h: number) => s + h, 0) + gapHeight * (el.heights.length + 1);
      return mmToUnit(totalH) >= mmToUnit(sectionInnerH) - t;
    });
  };

  // 현재 편집 중인 영역인지 확인
  const isEditingArea = (sectionIndex: number, areaSide?: 'left' | 'center' | 'right') => {
    return activePopup.type === 'customizableEdit'
      && activePopup.id === placedFurnitureId
      && activePopup.sectionIndex === sectionIndex
      && activePopup.areaSide === areaSide;
  };

  // 섹션 아이콘 렌더링 함수
  const renderSectionIcon = (
    key: string,
    posX: number,
    posY: number,
    posZ: number,
    sectionIndex: number,
    areaSide?: 'left' | 'center' | 'right',
    subPart?: 'upper' | 'lower',
  ) => {
    // 해당 영역이 편집 중이면 아이콘 숨김
    if (isEditingArea(sectionIndex, areaSide)) return null;

    const isHov = hoveredIcon === key;
    const themeColor = getThemeColor();
    return (
      <Html
        key={`icon-${key}`}
        position={[posX, posY, posZ]}
        center
        style={{
          userSelect: 'none',
          pointerEvents: 'auto',
          zIndex: 100,
          background: 'transparent',
        }}
      >
        <div
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            border: `2px solid ${themeColor}`,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.92)',
            transition: 'all 0.2s ease',
            opacity: isHov ? 1 : 0.7,
            transform: isHov ? 'scale(1.15)' : 'scale(1)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (isEditMode) {
              useUIStore.getState().closeAllPopups();
            } else if (placedFurnitureId && groupRef.current) {
              // 가구 좌측/우측 끝의 screen 좌표 계산
              const canvasRect = gl.domElement.getBoundingClientRect();
              const worldPos = new THREE.Vector3();
              groupRef.current.getWorldPosition(worldPos);

              const el = e.currentTarget as HTMLElement;
              const iconRect = el.getBoundingClientRect();

              let sx: number;
              if (areaSide === 'left') {
                // 가구 좌측 끝 screen X
                const leftEdge = worldPos.clone();
                leftEdge.x -= W / 2;
                leftEdge.project(camera);
                const leftScreenX = Math.round((leftEdge.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left);
                sx = leftScreenX - 340 - 12;
              } else if (areaSide === 'center') {
                // 중앙: 아이콘 위치 기준으로 팝업 오른쪽에 표시
                sx = Math.round(iconRect.right) + 12;
              } else {
                // 가구 우측 끝 screen X
                const rightEdge = worldPos.clone();
                rightEdge.x += W / 2;
                rightEdge.project(camera);
                const rightScreenX = Math.round((rightEdge.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left);
                sx = rightScreenX + 12;
              }
              useUIStore.getState().openCustomizableEditPopup(placedFurnitureId, sectionIndex, areaSide, subPart, sx, Math.round(iconRect.top));
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setHoveredIcon(key)}
          onMouseLeave={() => setHoveredIcon(null)}
          title="섹션 세부설정"
        >
          <SettingsIcon color={themeColor} size={14} />
        </div>
      </Html>
    );
  };

  // 미드웨이(사이 간격) 아이콘 — 메인 편집 패널 열기 (sectionIndex 없이)
  // 섹션 내경 치수 가이드 렌더링 (톱니 아이콘 클릭 시)
  const renderSectionDimensionGuides = () => {
    if (activePopup.type !== 'customizableEdit') return null;
    if (activePopup.id !== placedFurnitureId) return null;
    if (activePopup.sectionIndex === undefined) return null;

    const sIdx = activePopup.sectionIndex;
    const section = sections[sIdx];
    if (!section) return null;

    const themeColor = getThemeColor();
    const frontZ = D / 2 + 0.02;

    // 섹션 내경 (mm)
    const sectionInnerHeightMm = section.height;
    const sectionInnerWidthMm = width - 2 * panelThickness;

    // 섹션 중심 Y 계산
    let sectionCenterY = 0;
    let sectionInnerH = mmToUnit(sectionInnerHeightMm);
    if (isSplit) {
      // 패널 소유 모델에 따라 박스 높이 계산
      const splitBoxHeights = sections.map(s => {
        const hb = s.showBottomPanel !== false;
        const ht = s.showTopPanel !== false;
        const pc = (hb ? 1 : 0) + (ht ? 1 : 0);
        return mmToUnit(s.height + pc * panelThickness);
      });
      let currentBot = -H / 2;
      for (let i = 0; i < sIdx; i++) {
        currentBot += splitBoxHeights[i];
      }
      sectionCenterY = currentBot + splitBoxHeights[sIdx] / 2;
    }

    // 가이드 라인 좌표 (Three.js 단위)
    const left = -innerW / 2;
    const right = innerW / 2;
    const top = sectionCenterY + sectionInnerH / 2;
    const bottom = sectionCenterY - sectionInnerH / 2;

    const lineColor = themeColor;
    const lineOpacity = 0.6;
    const dashSize = 0.04;
    const gapSize = 0.03;

    // 점선 재질
    const dashedLineMat = new THREE.LineDashedMaterial({
      color: lineColor,
      dashSize,
      gapSize,
      transparent: true,
      opacity: lineOpacity,
      depthTest: false,
    });

    // 수평 가이드 라인 (상/하 내경 경계)
    const hTopGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(left, top, frontZ),
      new THREE.Vector3(right, top, frontZ),
    ]);
    const hBottomGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(left, bottom, frontZ),
      new THREE.Vector3(right, bottom, frontZ),
    ]);

    // 수직 가이드 라인 (좌/우 내경 경계)
    const vLeftGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(left, top, frontZ),
      new THREE.Vector3(left, bottom, frontZ),
    ]);
    const vRightGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(right, top, frontZ),
      new THREE.Vector3(right, bottom, frontZ),
    ]);

    return (
      <group key="section-dim-guides">
        {/* 점선 가이드 */}
        <lineSegments geometry={hTopGeo} material={dashedLineMat} computeLineDistances />
        <lineSegments geometry={hBottomGeo} material={dashedLineMat} computeLineDistances />
        <lineSegments geometry={vLeftGeo} material={dashedLineMat} computeLineDistances />
        <lineSegments geometry={vRightGeo} material={dashedLineMat} computeLineDistances />

        {/* 너비 치수 (상단) */}
        <Html
          position={[0, top + 0.15, frontZ]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div style={{
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            border: `1px solid ${themeColor}`,
          }}>
            내경 {sectionInnerWidthMm}mm
          </div>
        </Html>

        {/* 높이 치수 (좌측) */}
        <Html
          position={[left - 0.15, sectionCenterY, frontZ]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div style={{
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            border: `1px solid ${themeColor}`,
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
          }}>
            내경 {sectionInnerHeightMm}mm
          </div>
        </Html>
      </group>
    );
  };

  // 섹션별 아이콘 목록 생성
  const renderSectionIcons = () => {
    if (!showSectionIcons) return null;

    const icons: React.ReactNode[] = [];
    const frontZ = D / 2 + 0.1;

    if (isSplit) {
      // 각 섹션의 박스 높이(패널 소유 모델)와 중심 Y 계산
      const sectionBoxHeights = sections.map(s => {
        const hb = s.showBottomPanel !== false;
        const ht = s.showTopPanel !== false;
        const pc = (hb ? 1 : 0) + (ht ? 1 : 0);
        return mmToUnit(s.height + pc * panelThickness);
      });
      const sectionCenterYs: number[] = [];
      let currentBottom = -H / 2;
      for (let i = 0; i < sections.length; i++) {
        sectionCenterYs.push(currentBottom + sectionBoxHeights[i] / 2);
        currentBottom += sectionBoxHeights[i];
      }

      const addPartitionIcons = (section: CustomSection, centerY: number, prefix: string, sIdx: number, secInnerW: number = innerW, xOffset: number = 0) => {
        // 영역별 아이콘 추가 (서브분할 고려, 삭제된 영역은 스킵)
        const addAreaIcon = (areaKey: 'full' | 'left' | 'right', cx: number, elements: CustomElement[] | undefined) => {
          // 삭제된 영역은 아이콘 스킵
          if (areaKey !== 'full' && !elements) return;

          const subSplit = section.areaSubSplits?.[areaKey];
          if (subSplit?.enabled) {
            const areaInnerH = mmToUnit(section.height);
            const lowerH = mmToUnit(subSplit.lowerHeight);
            const upperH = areaInnerH - lowerH;
            const lowerCY = centerY - areaInnerH / 2 + lowerH / 2;
            const upperCY = centerY + areaInnerH / 2 - upperH / 2;
            const side = areaKey === 'full' ? undefined : areaKey;
            icons.push(renderSectionIcon(`${prefix}-${areaKey}-lower`, cx + xOffset, lowerCY, frontZ, sIdx, side, 'lower'));
            icons.push(renderSectionIcon(`${prefix}-${areaKey}-upper`, cx + xOffset, upperCY, frontZ, sIdx, side, 'upper'));
          } else {
            const side = areaKey === 'full' ? undefined : areaKey;
            icons.push(renderSectionIcon(`${prefix}-${areaKey}`, cx + xOffset, centerY, frontZ, sIdx, side));
          }
        };

        if (section.horizontalSplit) {
          // 좌우 섹션분할: 각 독립 박스 중심에 아이콘 (외경 W 기준)
          const hs = section.horizontalSplit;
          const totalInnerWMm = (width - 2 * panelThickness);
          const leftOuterWMm = hs.position + 2 * panelThickness;
          const is3Split = hs.secondPosition != null;
          const centerInnerWMm = is3Split ? (hs.secondPosition || 0) : 0;
          const centerOuterWMm = is3Split ? centerInnerWMm + 2 * panelThickness : 0;
          const extraPanels = is3Split ? 4 : 2;
          const rightInnerWMm = totalInnerWMm - hs.position - centerInnerWMm - extraPanels * panelThickness;
          const rightOuterWMm = rightInnerWMm + 2 * panelThickness;
          const leftCX = -W / 2 + mmToUnit(leftOuterWMm) / 2;
          const centerCX = is3Split ? -W / 2 + mmToUnit(leftOuterWMm) + mmToUnit(centerOuterWMm) / 2 : 0;
          const rightCX = W / 2 - mmToUnit(rightOuterWMm) / 2;
          // 서브분할 고려 아이콘 렌더링 헬퍼
          const addHSplitAreaIcon = (areaKey: 'left' | 'center' | 'right', cx: number, elements: CustomElement[] | undefined) => {
            if (!elements) return;
            const subSplit = section.areaSubSplits?.[areaKey];
            if (subSplit?.enabled) {
              const areaInnerH = mmToUnit(section.height);
              const lowerH = mmToUnit(subSplit.lowerHeight);
              const upperH = areaInnerH - lowerH;
              const lowerCY = centerY - areaInnerH / 2 + lowerH / 2;
              const upperCY = centerY + areaInnerH / 2 - upperH / 2;
              icons.push(renderSectionIcon(`${prefix}-hsplit-${areaKey}-lower`, cx + xOffset, lowerCY, frontZ, sIdx, areaKey, 'lower'));
              icons.push(renderSectionIcon(`${prefix}-hsplit-${areaKey}-upper`, cx + xOffset, upperCY, frontZ, sIdx, areaKey, 'upper'));
            } else {
              icons.push(renderSectionIcon(`${prefix}-hsplit-${areaKey}`, cx + xOffset, centerY, frontZ, sIdx, areaKey));
            }
          };
          addHSplitAreaIcon('left', leftCX, hs.leftElements);
          if (is3Split) {
            addHSplitAreaIcon('center', centerCX, hs.centerElements);
          }
          addHSplitAreaIcon('right', rightCX, hs.rightElements);
        } else if (section.hasPartition && section.partitionPosition) {
          const partX = -secInnerW / 2 + mmToUnit(section.partitionPosition);
          const leftCenterX = (-secInnerW / 2 + partX - t / 2) / 2;
          const rightCenterX = (partX + t / 2 + secInnerW / 2) / 2;
          addAreaIcon('left', leftCenterX, section.leftElements);
          addAreaIcon('right', rightCenterX, section.rightElements);
        } else {
          addAreaIcon('full', 0, section.elements);
        }
      };

      const sectionLabels = sections.length === 3
        ? ['lower', 'middle', 'upper']
        : ['lower', 'upper'];
      sections.forEach((section, sIdx) => {
        // 섹션별 너비/정렬 오프셋 반영
        const sectionW = section.width ? mmToUnit(section.width) : W;
        const iconAlignOffset = calculateAlignOffset(sectionW, W, section.align || 'center');
        const sectionInnerW = sectionW - 2 * t;
        addPartitionIcons(section, sectionCenterYs[sIdx], sectionLabels[sIdx], sIdx, sectionInnerW, iconAlignOffset);
      });
    } else {
      // 단일 섹션에서도 서브분할 고려
      const section = sections[0];
      // 섹션별 너비/정렬 오프셋 반영
      const singleSectionW = section?.width ? mmToUnit(section.width) : W;
      const singleAlignOffset = calculateAlignOffset(singleSectionW, W, section?.align || 'center');
      const singleInnerW = singleSectionW - 2 * t;

      const addSingleAreaIcon = (areaKey: 'full' | 'left' | 'right', cx: number, elements: CustomElement[] | undefined) => {
        // 삭제된 영역은 아이콘 스킵
        if (areaKey !== 'full' && !elements) return;

        const subSplit = section?.areaSubSplits?.[areaKey];
        if (subSplit?.enabled) {
          const areaInnerH = mmToUnit(section.height);
          const lH = mmToUnit(subSplit.lowerHeight);
          const uH = areaInnerH - lH;
          const lowerCY = -areaInnerH / 2 + lH / 2;
          const upperCY = areaInnerH / 2 - uH / 2;
          const side = areaKey === 'full' ? undefined : areaKey;
          icons.push(renderSectionIcon(`single-${areaKey}-lower`, cx + singleAlignOffset, lowerCY, frontZ, 0, side, 'lower'));
          icons.push(renderSectionIcon(`single-${areaKey}-upper`, cx + singleAlignOffset, upperCY, frontZ, 0, side, 'upper'));
        } else {
          const side = areaKey === 'full' ? undefined : areaKey;
          icons.push(renderSectionIcon(`single-${areaKey}`, cx + singleAlignOffset, 0, frontZ, 0, side));
        }
      };

      if (section?.horizontalSplit) {
        // 좌우 섹션분할: 각 독립 박스 중심에 아이콘 (외경 W 기준)
        const hs = section.horizontalSplit;
        const totalInnerWMm = (width - 2 * panelThickness);
        const leftOuterWMm = hs.position + 2 * panelThickness;
        const is3Split = hs.secondPosition != null;
        const centerInnerWMm = is3Split ? (hs.secondPosition || 0) : 0;
        const centerOuterWMm = is3Split ? centerInnerWMm + 2 * panelThickness : 0;
        const extraPanels = is3Split ? 4 : 2;
        const rightInnerWMm = totalInnerWMm - hs.position - centerInnerWMm - extraPanels * panelThickness;
        const rightOuterWMm = rightInnerWMm + 2 * panelThickness;
        const leftCX = -W / 2 + mmToUnit(leftOuterWMm) / 2;
        const centerCX = is3Split ? -W / 2 + mmToUnit(leftOuterWMm) + mmToUnit(centerOuterWMm) / 2 : 0;
        const rightCX = W / 2 - mmToUnit(rightOuterWMm) / 2;
        // 서브분할 고려 아이콘 렌더링 헬퍼
        const addSingleHSplitIcon = (areaKey: 'left' | 'center' | 'right', cx: number, elements: CustomElement[] | undefined) => {
          if (!elements) return;
          const subSplit = section.areaSubSplits?.[areaKey];
          if (subSplit?.enabled) {
            const areaInnerH = mmToUnit(section.height);
            const lowerH = mmToUnit(subSplit.lowerHeight);
            const upperH = areaInnerH - lowerH;
            const lowerCY = -areaInnerH / 2 + lowerH / 2;
            const upperCY = areaInnerH / 2 - upperH / 2;
            icons.push(renderSectionIcon(`single-hsplit-${areaKey}-lower`, cx + singleAlignOffset, lowerCY, frontZ, 0, areaKey, 'lower'));
            icons.push(renderSectionIcon(`single-hsplit-${areaKey}-upper`, cx + singleAlignOffset, upperCY, frontZ, 0, areaKey, 'upper'));
          } else {
            icons.push(renderSectionIcon(`single-hsplit-${areaKey}`, cx + singleAlignOffset, 0, frontZ, 0, areaKey));
          }
        };
        addSingleHSplitIcon('left', leftCX, hs.leftElements);
        if (is3Split) {
          addSingleHSplitIcon('center', centerCX, hs.centerElements);
        }
        addSingleHSplitIcon('right', rightCX, hs.rightElements);
      } else if (section?.hasPartition && section?.partitionPosition) {
        const partX = -singleInnerW / 2 + mmToUnit(section.partitionPosition);
        const leftCenterX = (-singleInnerW / 2 + partX - t / 2) / 2;
        const rightCenterX = (partX + t / 2 + singleInnerW / 2) / 2;
        addSingleAreaIcon('left', leftCenterX, section?.leftElements);
        addSingleAreaIcon('right', rightCenterX, section?.rightElements);
      } else {
        addSingleAreaIcon('full', 0, section?.elements);
      }
    }

    return icons;
  };

  // 편집 중인 영역 하이라이트 테두리 렌더링
  const highlightedSection = useUIStore(state => state.highlightedSection);

  const renderEditingHighlight = () => {
    let sIdx: number | undefined;
    let aSide: 'left' | 'center' | 'right' | undefined;

    // 1) 톱니 아이콘 팝업 (sectionIndex가 있을 때)
    if (activePopup.type === 'customizableEdit' && activePopup.id === placedFurnitureId && activePopup.sectionIndex !== undefined) {
      sIdx = activePopup.sectionIndex;
      aSide = activePopup.areaSide;
    }
    // 2) 메인 팝업에서 highlightedSection (예: "furnitureId-0")
    else if (highlightedSection && placedFurnitureId) {
      const parts = highlightedSection.split('-');
      const furId = parts.slice(0, -1).join('-');
      const secIdx = parseInt(parts[parts.length - 1], 10);
      if (furId === placedFurnitureId && !isNaN(secIdx)) {
        sIdx = secIdx;
      }
    }

    if (sIdx === undefined) return null;
    const section = sections[sIdx];
    if (!section) return null;

    const themeColor = getThemeColor();

    // Y 위치 계산
    let centerY = 0;
    let areaH: number;
    if (isSplit) {
      const sectionBoxHeights = sections.map(s => {
        const hb = s.showBottomPanel !== false;
        const ht = s.showTopPanel !== false;
        const pc = (hb ? 1 : 0) + (ht ? 1 : 0);
        return mmToUnit(s.height + pc * panelThickness);
      });
      let currentBottom = -H / 2;
      for (let i = 0; i < sIdx; i++) {
        currentBottom += sectionBoxHeights[i];
      }
      centerY = currentBottom + sectionBoxHeights[sIdx] / 2;
      areaH = sectionBoxHeights[sIdx] - t;
    } else {
      areaH = H - 2 * t;
    }

    // X 위치 및 너비 계산
    let centerX = 0;
    let areaW = innerW;
    if (section.hasPartition && section.partitionPosition && aSide) {
      const partX = -innerW / 2 + mmToUnit(section.partitionPosition);
      if (aSide === 'left') {
        centerX = (-innerW / 2 + partX - t / 2) / 2;
        areaW = partX - t / 2 - (-innerW / 2);
      } else {
        centerX = (partX + t / 2 + innerW / 2) / 2;
        areaW = innerW / 2 - (partX + t / 2);
      }
    }

    const areaD = D - 2 * t;
    const pad = 0.003;
    const hw = areaW / 2 + pad;
    const hh = areaH / 2 + pad;
    const hd = areaD / 2 + pad;

    return (
      <group position={[centerX, centerY, 0]}>
        {/* 앞면만 반투명 */}
        <mesh position={[0, 0, hd]} renderOrder={998}>
          <planeGeometry args={[hw * 2, hh * 2]} />
          <meshBasicMaterial color={themeColor} transparent opacity={0.15} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  };

  if (!showFurniture) return null;

  /**
   * 섹션 내부 요소 렌더링 (기존 DrawerRenderer/ClothingRod/ShelfRenderer 재사용)
   *
   * 기존 모듈과 동일한 방식으로 서랍(ㄷ자 프레임 + 레일 + 보링홀),
   * 옷봉(브라켓 + 봉 + 필라이트), 선반(패널 + 치수)을 렌더링합니다.
   *
   * @param elements - 내부 요소 배열
   * @param areaInnerWidth - 영역 내부 너비 (Three.js 단위, 측판 제외)
   * @param areaInnerHeight - 영역 내부 높이 (Three.js 단위, 상하판 제외)
   * @param sectionCenterY - 섹션 중심 Y (Three.js 단위)
   * @param offsetX - 영역 중심 X 오프셋 (Three.js, 칸막이 영역용)
   * @param sectionDepth - 섹션 깊이 (Three.js 단위)
   * @param sectionLabel - 섹션 이름 ("(상)", "(하)" 등)
   * @param keyPrefix - 키 접두사
   */
  /**
   * 영역 렌더링 (서브분할 처리 포함)
   * 서브분할이 있으면 상/하부로 나누어 각각 renderSectionElements 호출
   */
  const renderAreaWithSubSplit = (
    section: CustomSection,
    areaKey: 'full' | 'left' | 'center' | 'right',
    elements: CustomElement[] | undefined,
    areaInnerWidth: number,
    areaInnerHeight: number,
    sectionCenterY: number,
    offsetX: number,
    sectionDepth: number,
    sectionLabel: string,
    keyPrefix: string,
    _sIdx: number,
  ): React.ReactNode[] => {
    const subSplit = section.areaSubSplits?.[areaKey];

    if (subSplit?.enabled) {
      const nodes: React.ReactNode[] = [];
      const lowerH = mmToUnit(subSplit.lowerHeight);
      const upperH = areaInnerHeight - lowerH;
      const lowerCenterY = sectionCenterY - areaInnerHeight / 2 + lowerH / 2;
      const upperCenterY = sectionCenterY + areaInnerHeight / 2 - upperH / 2;

      // 서브분할 수평 패널 (구분판)
      const dividerY = sectionCenterY - areaInnerHeight / 2 + lowerH;
      nodes.push(
        <BoxWithEdges
          key={`${keyPrefix}-subsplit-divider`}
          position={[offsetX, dividerY, 0]}
          args={[areaInnerWidth, t, sectionDepth - t]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isHighlighted={isHighlighted}
          panelName={`${sectionLabel}서브분할판`}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
        />
      );

      // 하부 요소
      if (subSplit.lowerElements && subSplit.lowerElements.length > 0) {
        nodes.push(
          ...renderSectionElements(
            subSplit.lowerElements, areaInnerWidth, lowerH - t / 2,
            lowerCenterY - t / 4, offsetX, sectionDepth,
            `${sectionLabel}하`, `${keyPrefix}-lower`
          )
        );
      }

      // 상부 요소
      if (subSplit.upperElements && subSplit.upperElements.length > 0) {
        nodes.push(
          ...renderSectionElements(
            subSplit.upperElements, areaInnerWidth, upperH - t / 2,
            upperCenterY + t / 4, offsetX, sectionDepth,
            `${sectionLabel}상`, `${keyPrefix}-upper`
          )
        );
      }

      return nodes;
    }

    // 서브분할 없음: 기존 방식
    if (elements && elements.length > 0) {
      return renderSectionElements(
        elements, areaInnerWidth, areaInnerHeight,
        sectionCenterY, offsetX, sectionDepth,
        sectionLabel, keyPrefix
      );
    }
    return [];
  };

  const renderSectionElements = (
    elements: CustomElement[],
    areaInnerWidth: number,   // Three.js 단위
    areaInnerHeight: number,  // Three.js 단위
    sectionCenterY: number,   // Three.js 단위
    offsetX: number,          // Three.js 단위
    sectionDepth: number,     // Three.js 단위
    sectionLabel: string,
    keyPrefix: string,
  ) => {
    const nodes: React.ReactNode[] = [];
    // 기존 모듈과 동일한 셸프 깊이 계산
    const adjustedDepth = sectionDepth - t; // depth - basicThickness

    elements.forEach((el, elIdx) => {
      const key = `${keyPrefix}-${elIdx}`;

      if (el.type === 'drawer') {
        // ═══ DrawerRenderer 사용 (ㄷ자 프레임 + 레일 + 보링홀 포함) ═══
        const drawerCount = el.heights.length;
        const gapHeight = 23.6; // 서랍 간 공백 (mm) - 기존 모듈과 동일

        // DrawerRenderer 내부: 바닥gap + (서랍+gap)*n = sum(heights) + (n+1)*gap
        const totalDrawerHeightMm = el.heights.reduce((sum: number, h: number) => sum + h, 0)
          + gapHeight * (drawerCount + 1);
        const totalDrawerInnerH = mmToUnit(totalDrawerHeightMm);

        // 서랍이 영역 전체를 채우는지 판단
        const isFullFill = totalDrawerInnerH >= areaInnerHeight - t;

        // 서랍 yOffset과 innerHeight 결정
        let drawerYOffset: number;
        let drawerInnerH: number;

        const align = ('drawerAlign' in el && el.drawerAlign) || 'bottom';

        if (isFullFill) {
          // 영역 전체를 채움: 기존처럼 중앙 배치
          drawerYOffset = sectionCenterY;
          drawerInnerH = areaInnerHeight;
        } else if (align === 'top') {
          // 위에서 배치: 상단갭은 상판에 흡수 (bottom과 동일 원리)
          const drawerTopY = sectionCenterY + areaInnerHeight / 2;
          drawerInnerH = totalDrawerInnerH - t;
          drawerYOffset = drawerTopY - drawerInnerH / 2;
        } else {
          // 아래서 배치(기본): 하단부터 배치, 날개벽은 위에서 패널두께만큼 줄임
          const drawerBottomY = sectionCenterY - areaInnerHeight / 2;
          drawerInnerH = totalDrawerInnerH - t;
          drawerYOffset = drawerBottomY + drawerInnerH / 2;
        }

        nodes.push(
          <group key={key} position={[offsetX, 0, 0]}>
            <DrawerRenderer
              drawerCount={drawerCount}
              innerWidth={areaInnerWidth}
              innerHeight={drawerInnerH}
              depth={sectionDepth}
              basicThickness={t}
              yOffset={drawerYOffset}
              drawerHeights={el.heights}
              gapHeight={gapHeight}
              material={material}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              furnitureId={placedFurnitureId}
              sectionName={sectionLabel}
              panelGrainDirections={panelGrainDirections}
              drawerAlign={align}
            />
            {/* 서랍이 영역보다 작을 때: 덮개 선반 */}
            {!isFullFill && (() => {
              // 위 배치 하단덮개: 상판과 동일한 85mm 옵셋, 아래 배치: 기본 60mm
              const defaultInset = align === 'top' ? 85 : 60;
              const coverInsetMm = ('coverInset' in el && el.coverInset) ? el.coverInset : defaultInset;
              const coverFrontInset = mmToUnit(coverInsetMm);
              const coverBackInset = mmToUnit(backReductionMm);
              const coverDepth = sectionDepth - coverFrontInset - coverBackInset;
              const coverZ = (coverBackInset - coverFrontInset) / 2;
              // 위 배치: 15mm 두께, 날개벽 사이에 끼워짐 / 아래 배치: 18mm, 전체 내경
              const coverThickness = align === 'top' ? mmToUnit(15) : t;
              const coverY = align === 'top'
                ? drawerYOffset - drawerInnerH / 2 - coverThickness / 2 + mmToUnit(15)  // 날개벽 안쪽으로 15mm 올림
                : drawerYOffset + drawerInnerH / 2 + coverThickness / 2;
              const wingInsetMm = 27 + 18 + 0.5; // horizontalPanelWidth + drawerFrameThickness + offset
              const coverWidth = align === 'top'
                ? areaInnerWidth - mmToUnit(wingInsetMm * 2)
                : areaInnerWidth;
              return (
                <BoxWithEdges
                  args={[coverWidth, coverThickness, coverDepth]}
                  position={[0, coverY, coverZ]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isHighlighted={isHighlighted}
                  panelName={`${sectionLabel}서랍덮개선반`}
                  panelGrainDirections={panelGrainDirections}
                  furnitureId={placedFurnitureId}
                />
              );
            })()}
          </group>
        );
      } else if (el.type === 'rod') {
        // ═══ 옷봉 (고정선반+옷봉 / 옷봉만) ═══
        if (el.withShelf) {
          // 고정선반+옷봉: 상판에서 shelfGap만큼 아래에 고정선반, 그 아래 옷봉
          const gap = el.shelfGap ?? 280;
          const sectionHmm = Math.round(areaInnerHeight / 0.01); // Three.js → mm
          const shelfFromBottom = sectionHmm - gap; // 섹션 하단에서의 선반 위치
          // 고정선반 렌더링
          nodes.push(
            <group key={`${key}-shelf`} position={[offsetX, 0, 0]}>
              <ShelfRenderer
                shelfCount={1}
                innerWidth={areaInnerWidth}
                innerHeight={areaInnerHeight}
                depth={sectionDepth}
                basicThickness={t}
                material={material}
                yOffset={sectionCenterY}
                shelfPositions={[shelfFromBottom]}
                renderMode={renderMode}
                furnitureId={placedFurnitureId}
                isHighlighted={isHighlighted}
                sectionName={sectionLabel}
                panelGrainDirections={panelGrainDirections}
              />
            </group>
          );
          // 옷봉: 고정선반 하단 바로 아래
          const rodYFromBottom = mmToUnit(shelfFromBottom) - t / 2 - mmToUnit(75 / 2);
          const rodYPosition = sectionCenterY - areaInnerHeight / 2 + rodYFromBottom;
          nodes.push(
            <group key={key} position={[offsetX, 0, 0]}>
              <ClothingRod
                innerWidth={areaInnerWidth}
                yPosition={rodYPosition}
                renderMode={renderMode as '2d' | '3d'}
                isDragging={isDragging}
                isEditMode={isEditMode}
                adjustedDepthForShelves={adjustedDepth}
                depth={sectionDepth}
                addFrontFillLight={rodYPosition < 0}
                furnitureId={placedFurnitureId}
              />
            </group>
          );
        } else {
          // 옷봉만: 상판 바로 아래
          const rodYPosition = sectionCenterY + areaInnerHeight / 2 - mmToUnit(75 / 2);
          nodes.push(
            <group key={key} position={[offsetX, 0, 0]}>
              <ClothingRod
                innerWidth={areaInnerWidth}
                yPosition={rodYPosition}
                renderMode={renderMode as '2d' | '3d'}
                isDragging={isDragging}
                isEditMode={isEditMode}
                adjustedDepthForShelves={adjustedDepth}
                depth={sectionDepth}
                addFrontFillLight={rodYPosition < 0}
                furnitureId={placedFurnitureId}
              />
            </group>
          );
        }
      } else if (el.type === 'shelf') {
        // ═══ ShelfRenderer 사용 ═══
        // el.heights는 섹션 하단에서 각 선반 위치 (mm)
        const insetMm = el.shelfMethod === 'fixed' ? 0 : (el.shelfFrontInset ?? 30);
        nodes.push(
          <group key={key} position={[offsetX, 0, 0]}>
            <ShelfRenderer
              shelfCount={el.heights.length}
              innerWidth={areaInnerWidth}
              innerHeight={areaInnerHeight}
              depth={sectionDepth}
              basicThickness={t}
              material={material}
              yOffset={sectionCenterY}
              shelfPositions={el.heights}
              renderMode={renderMode}
              furnitureId={placedFurnitureId}
              isHighlighted={isHighlighted}
              sectionName={sectionLabel}
              panelGrainDirections={panelGrainDirections}
              shelfFrontInsetMm={insetMm}
            />
          </group>
        );

        // ═══ 선반 + 옷봉 조합: hasRod=true면 최상단 선반 바로 아래에 옷봉 자동 배치 ═══
        if (el.hasRod) {
          const topShelfHeight = Math.max(...el.heights); // 가장 높은 선반 위치 (mm)
          // 봉 위치 = 최상단 선반 하단 - 브라켓 높이/2
          // 선반 하단 = 선반 위치 - 패널 두께/2
          const rodYFromBottom = mmToUnit(topShelfHeight) - t / 2 - mmToUnit(75 / 2);
          const rodYPosition = sectionCenterY - areaInnerHeight / 2 + rodYFromBottom;

          nodes.push(
            <group key={`${key}-rod`} position={[offsetX, 0, 0]}>
              <ClothingRod
                innerWidth={areaInnerWidth}
                yPosition={rodYPosition}
                renderMode={renderMode as '2d' | '3d'}
                isDragging={isDragging}
                isEditMode={isEditMode}
                adjustedDepthForShelves={adjustedDepth}
                depth={sectionDepth}
                addFrontFillLight={rodYPosition < 0}
                furnitureId={placedFurnitureId}
              />
            </group>
          );
        }
      }
      else if (el.type === 'pants') {
        // ═══ 바지걸이 - ClothingRod 재사용 (하부섹션 전용) ═══
        // 상판 바로 아래에 자동 배치 (옷봉과 동일 로직)
        const pantsYPosition = sectionCenterY + areaInnerHeight / 2 - mmToUnit(75 / 2);

        nodes.push(
          <group key={key} position={[offsetX, 0, 0]}>
            <ClothingRod
              innerWidth={areaInnerWidth}
              yPosition={pantsYPosition}
              renderMode={renderMode as '2d' | '3d'}
              isDragging={isDragging}
              isEditMode={isEditMode}
              adjustedDepthForShelves={adjustedDepth}
              depth={sectionDepth}
              addFrontFillLight={pantsYPosition < 0}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      }
      // 'open' 타입은 내부 요소 없음
    });

    return nodes;
  };

  /**
   * 섹션 내부 콘텐츠 렌더링 (칸막이 + 요소)
   */
  const renderSectionContent = (
    section: CustomSection,
    sIdx: number,
    boxW: number,     // Three.js (외곽 너비)
    boxH: number,     // Three.js (외곽 높이)
    boxD: number,     // Three.js (전체 깊이)
    centerY: number,  // Three.js (박스 중심 Y)
  ) => {
    const meshes: React.ReactNode[] = [];
    const bInnerW = boxW - 2 * t;
    // 패널 소유에 따른 내경 높이 계산
    const contentHasBottom = section.showBottomPanel !== false;
    const contentHasTop = section.showTopPanel !== false;
    const bInnerH = boxH - (contentHasBottom ? t : 0) - (contentHasTop ? t : 0);
    // 비대칭 패널 시 내경 중심 Y 보정 (바닥판 없으면 내경이 아래로 확장)
    const contentCenterY = centerY + ((contentHasBottom ? t : 0) - (contentHasTop ? t : 0)) / 2;
    const innerD = boxD - backReduction;
    const sectionLabel = isSplit
      ? (sections.length === 3 ? (sIdx === 0 ? '(하)' : sIdx === 1 ? '(중)' : '(상)') : (sIdx === 0 ? '(하)' : '(상)'))
      : '';

    if (section.hasPartition && section.partitionPosition) {
      const partPos = mmToUnit(section.partitionPosition);
      const partitionX = -bInnerW / 2 + partPos;
      const frontInset = mmToUnit(section.partitionFrontInset ?? 0);
      const partD = innerD - frontInset; // 칸막이 깊이 (앞 오프셋만큼 줄어듦)
      const partZ = backReduction / 2 - frontInset / 2; // Z 위치 (앞 오프셋만큼 뒤로)

      // 칸막이 좌/우 독립 깊이 계산 (1단/2단 모두 지원)
      const leftBoxD = lowerLeftSectionDepth
        ? mmToUnit(lowerLeftSectionDepth) : boxD;
      const rightBoxD = lowerRightSectionDepth
        ? mmToUnit(lowerRightSectionDepth) : boxD;
      // 칸막이 깊이 = 짧은 쪽에 맞춤
      const minAreaD = Math.min(leftBoxD, rightBoxD);
      const adjustedPartD = minAreaD - backReduction - frontInset;

      // 칸막이 수직 패널
      meshes.push(
        <BoxWithEdges
          key={`partition-${sIdx}`}
          args={[t, bInnerH, adjustedPartD > 0 ? adjustedPartD : partD]}
          position={[partitionX, contentCenterY, partZ]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isHighlighted={isHighlighted}
          panelName={`${sectionLabel}칸막이`}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
        />
      );

      // 좌측 영역 (칸막이 중심에서 좌측면까지 = partitionPosition - panelThickness/2)
      const leftWidthMm = section.partitionPosition - panelThickness / 2;
      const leftInnerW = mmToUnit(leftWidthMm);
      const leftCenterX = -bInnerW / 2 + leftInnerW / 2;
      meshes.push(
        ...renderAreaWithSubSplit(
          section, 'left', section.leftElements,
          leftInnerW, bInnerH, contentCenterY, leftCenterX, leftBoxD,
          `${sectionLabel}좌`, `s${sIdx}-left`, sIdx
        )
      );

      // 우측 영역 (칸막이 중심에서 우측면까지 = innerWidthMm - partitionPosition - panelThickness/2)
      const rightWidthMm = innerWidthMm - section.partitionPosition - panelThickness / 2;
      const rightInnerW = mmToUnit(rightWidthMm);
      const rightCenterX = partitionX + t / 2 + rightInnerW / 2;
      meshes.push(
        ...renderAreaWithSubSplit(
          section, 'right', section.rightElements,
          rightInnerW, bInnerH, contentCenterY, rightCenterX, rightBoxD,
          `${sectionLabel}우`, `s${sIdx}-right`, sIdx
        )
      );
    } else {
      // 칸막이 없는 경우
      meshes.push(
        ...renderAreaWithSubSplit(
          section, 'full', section.elements,
          bInnerW, bInnerH, contentCenterY, 0, boxD,
          sectionLabel, `s${sIdx}`, sIdx
        )
      );
    }

    return meshes;
  };

  /**
   * 독립 박스 렌더링 (기존 BaseFurnitureShell 체결 구조)
   * depthOffset: Z축 오프셋 (깊이가 줄어든 섹션의 앞/뒤 정렬용)
   */
  const renderBox = (
    section: CustomSection,
    sIdx: number,
    boxW: number,
    boxH: number,
    boxD: number,
    centerY: number,
    depthOffset: number = 0,
  ) => {
    // ═══ 좌우 섹션분할 감지 → 두 개의 독립 박스 렌더링 ═══
    if (section.horizontalSplit) {
      return renderHorizontalSplitBoxes(section, sIdx, boxW, boxH, boxD, centerY, depthOffset);
    }

    const meshes: React.ReactNode[] = [];
    const bInnerW = boxW - 2 * t;
    // 패널 소유에 따른 내경 높이: boxH에서 실제 존재하는 패널 두께만 차감
    const hasBottom = section.showBottomPanel !== false;
    const hasTop = section.showTopPanel !== false;
    const bInnerH = boxH - (hasBottom ? t : 0) - (hasTop ? t : 0);
    // 비대칭 패널 시 내경 중심 Y 보정
    const boxContentCenterY = centerY + ((hasBottom ? t : 0) - (hasTop ? t : 0)) / 2;
    const prefix = `box-${sIdx}`;
    const sectionLabel = sIdx === 0 ? '하부' : '상부';

    // 칸막이 좌/우 독립 깊이 여부 (1단/2단 모두 지원)
    const hasPartitionInSection = section.hasPartition && section.partitionPosition;
    const hasIndependentDepth = hasPartitionInSection && (lowerLeftSectionDepth || lowerRightSectionDepth);
    const leftD = hasIndependentDepth && lowerLeftSectionDepth ? mmToUnit(lowerLeftSectionDepth) : boxD;
    const rightD = hasIndependentDepth && lowerRightSectionDepth ? mmToUnit(lowerRightSectionDepth) : boxD;
    const leftZOffset = (boxD - leftD) / 2;
    const rightZOffset = (boxD - rightD) / 2;

    if (hasIndependentDepth && section.partitionPosition) {
      // ═══ 좌/우 독립 깊이 분리 렌더링 ═══
      const partPos = mmToUnit(section.partitionPosition);
      const partitionX = -bInnerW / 2 + partPos;
      // 좌측 영역 너비 (외벽~칸막이)
      const leftOuterW = partPos + t; // 좌측판 포함 너비
      const leftInnerW = partPos - t / 2;
      const leftCenterX = -bInnerW / 2 - t / 2 + leftOuterW / 2;
      // 우측 영역 너비 (칸막이~외벽)
      const rightOuterW = boxW - leftOuterW - t; // 칸막이 두께 포함
      const rightInnerW = bInnerW - partPos - t / 2;
      const rightCenterX = partitionX + t / 2 + rightOuterW / 2;

      // ── 좌측 측판 ──
      meshes.push(
        <BoxWithEdges key={`${prefix}-left`}
          args={[t, boxH, leftD]} position={[-bInnerW / 2 - t / 2, centerY, leftZOffset]}
          material={material} renderMode={renderMode} isDragging={isDragging} isHighlighted={isHighlighted}
          panelName={`${sectionLabel}좌측판`} panelGrainDirections={panelGrainDirections} furnitureId={placedFurnitureId}
        />
      );
      // ── 우측 측판 ──
      meshes.push(
        <BoxWithEdges key={`${prefix}-right`}
          args={[t, boxH, rightD]} position={[bInnerW / 2 + t / 2, centerY, rightZOffset]}
          material={material} renderMode={renderMode} isDragging={isDragging} isHighlighted={isHighlighted}
          panelName={`${sectionLabel}우측판`} panelGrainDirections={panelGrainDirections} furnitureId={placedFurnitureId}
        />
      );

      // ── 좌측 상판/바닥판 ──
      const drawerTouchesTop = sectionDrawerTouchesTop(section, section.height);
      const topDepthReduction = drawerTouchesTop ? drawerTopInset : 0;
      if (section.showTopPanel !== false) {
      meshes.push(
        <BoxWithEdges key={`${prefix}-top-left`}
          args={[leftInnerW - widthReduction / 2, t, leftD - backReduction - topDepthReduction]}
          position={[-bInnerW / 2 + leftInnerW / 2, centerY + boxH / 2 - t / 2, leftZOffset + backReduction / 2 - topDepthReduction / 2]}
          material={material} renderMode={renderMode} isDragging={isDragging} isHighlighted={isHighlighted}
          panelName={`${sectionLabel}좌상판`} panelGrainDirections={panelGrainDirections} furnitureId={placedFurnitureId}
        />
      );
      }
      if (section.showBottomPanel !== false) {
      meshes.push(
        <BoxWithEdges key={`${prefix}-bottom-left`}
          args={[leftInnerW - widthReduction / 2, t, leftD - backReduction]}
          position={[-bInnerW / 2 + leftInnerW / 2, centerY - boxH / 2 + t / 2, leftZOffset + backReduction / 2]}
          material={material} renderMode={renderMode} isDragging={isDragging} isHighlighted={isHighlighted}
          panelName={`${sectionLabel}좌바닥판`} panelGrainDirections={panelGrainDirections} furnitureId={placedFurnitureId}
        />
      );
      }
      // ── 우측 상판/바닥판 ──
      if (section.showTopPanel !== false) {
      meshes.push(
        <BoxWithEdges key={`${prefix}-top-right`}
          args={[rightInnerW - widthReduction / 2, t, rightD - backReduction - topDepthReduction]}
          position={[partitionX + t / 2 + rightInnerW / 2, centerY + boxH / 2 - t / 2, rightZOffset + backReduction / 2 - topDepthReduction / 2]}
          material={material} renderMode={renderMode} isDragging={isDragging} isHighlighted={isHighlighted}
          panelName={`${sectionLabel}우상판`} panelGrainDirections={panelGrainDirections} furnitureId={placedFurnitureId}
        />
      );
      }
      if (section.showBottomPanel !== false) {
      meshes.push(
        <BoxWithEdges key={`${prefix}-bottom-right`}
          args={[rightInnerW - widthReduction / 2, t, rightD - backReduction]}
          position={[partitionX + t / 2 + rightInnerW / 2, centerY - boxH / 2 + t / 2, rightZOffset + backReduction / 2]}
          material={material} renderMode={renderMode} isDragging={isDragging} isHighlighted={isHighlighted}
          panelName={`${sectionLabel}우바닥판`} panelGrainDirections={panelGrainDirections} furnitureId={placedFurnitureId}
        />
      );
      }
      // ── 좌측 백패널 ──
      if (section.showBackPanel !== false) {
      const leftBackH = bInnerH + mmToUnit(backPanelHeightExtMm);
      const leftBackW = leftInnerW + mmToUnit(backPanelWidthExtMm / 2);
      meshes.push(
        <BoxWithEdges key={`${prefix}-back-left`}
          args={[leftBackW, leftBackH, backPanelT]}
          position={[-bInnerW / 2 + leftInnerW / 2, boxContentCenterY, -leftD / 2 + backPanelT / 2 + mmToUnit(backPanelDepthOffsetMm) + leftZOffset]}
          material={material} renderMode={renderMode} isDragging={isDragging} isHighlighted={isHighlighted} isBackPanel
          panelName={`${sectionLabel}좌백패널`} panelGrainDirections={panelGrainDirections} furnitureId={placedFurnitureId}
        />
      );
      // ── 우측 백패널 ──
      const rightBackW = rightInnerW + mmToUnit(backPanelWidthExtMm / 2);
      meshes.push(
        <BoxWithEdges key={`${prefix}-back-right`}
          args={[rightBackW, leftBackH, backPanelT]}
          position={[partitionX + t / 2 + rightInnerW / 2, boxContentCenterY, -rightD / 2 + backPanelT / 2 + mmToUnit(backPanelDepthOffsetMm) + rightZOffset]}
          material={material} renderMode={renderMode} isDragging={isDragging} isHighlighted={isHighlighted} isBackPanel
          panelName={`${sectionLabel}우백패널`} panelGrainDirections={panelGrainDirections} furnitureId={placedFurnitureId}
        />
      );
      }
    } else {
    // ═══ 기존 단일 깊이 렌더링 ═══

    // ═══ 1. 측판 (좌/우) - 전체 높이, 전체 깊이 ═══
    meshes.push(
      <BoxWithEdges
        key={`${prefix}-left`}
        args={[t, boxH, boxD]}
        position={[-bInnerW / 2 - t / 2, centerY, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName={`${sectionLabel}좌측판`}
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />
    );
    meshes.push(
      <BoxWithEdges
        key={`${prefix}-right`}
        args={[t, boxH, boxD]}
        position={[bInnerW / 2 + t / 2, centerY, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName={`${sectionLabel}우측판`}
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />
    );

    // ═══ 2. 상판/하판 - 측판 사이에 끼워넣기 ═══
    // 서랍이 상판에 밀착(fullFill 또는 drawerAlign=top)하면 상판 85mm 들여쓰기
    const drawerTouchesTop = sectionDrawerTouchesTop(section, section.height);
    const topDepthReduction = drawerTouchesTop ? drawerTopInset : 0;
    if (section.showTopPanel !== false) {
    meshes.push(
      <BoxWithEdges
        key={`${prefix}-top`}
        args={[bInnerW - widthReduction, t, boxD - backReduction - topDepthReduction]}
        position={[0, centerY + boxH / 2 - t / 2, backReduction / 2 - topDepthReduction / 2]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName={`${sectionLabel}상판`}
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />
    );
    }
    if (section.showBottomPanel !== false) {
    meshes.push(
      <BoxWithEdges
        key={`${prefix}-bottom`}
        args={[bInnerW - widthReduction, t, boxD - backReduction]}
        position={[0, centerY - boxH / 2 + t / 2, backReduction / 2]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName={`${sectionLabel}바닥판`}
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />
    );
    }

    // ═══ 3. 백패널 ═══
    if (section.showBackPanel !== false) {
    const backPanelH = bInnerH + mmToUnit(backPanelHeightExtMm);
    const backPanelW = bInnerW + mmToUnit(backPanelWidthExtMm);
    const backPanelZ = -boxD / 2 + backPanelT / 2 + mmToUnit(backPanelDepthOffsetMm);

    meshes.push(
      <BoxWithEdges
        key={`${prefix}-back`}
        args={[backPanelW, backPanelH, backPanelT]}
        position={[0, boxContentCenterY, backPanelZ]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        isBackPanel
        panelName={`${sectionLabel}백패널`}
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />
    );
    }
    } // else (기존 단일 깊이) 닫기

    // ═══ 4. 내부 요소 (칸막이, 서랍, 옷봉, 선반) ═══
    if (!isDragging || isEditMode) {
      meshes.push(...renderSectionContent(section, sIdx, boxW, boxH, boxD, centerY));
    }

    // depthOffset이 있으면 group으로 감싸서 Z 이동
    if (depthOffset !== 0) {
      return [
        <group key={`box-group-${sIdx}`} position={[0, 0, depthOffset]}>
          {meshes}
        </group>
      ];
    }
    return meshes;
  };

  /**
   * 좌우 섹션분할: 2분할 또는 3분할 독립 박스 렌더링
   */
  const renderHorizontalSplitBoxes = (
    section: CustomSection,
    sIdx: number,
    boxW: number,
    boxH: number,
    boxD: number,
    centerY: number,
    depthOffset: number = 0,
  ) => {
    const meshes: React.ReactNode[] = [];
    const hs = section.horizontalSplit!;
    const totalInnerWMm = (boxW - 2 * t) / 0.01; // 전체 내경 (mm)
    const is3Split = hs.secondPosition != null;

    // 좌측 박스
    const leftInnerWMm = hs.position;
    const leftOuterWMm = leftInnerWMm + 2 * panelThickness;
    const leftOuterW = mmToUnit(leftOuterWMm);
    const leftInnerW = mmToUnit(leftInnerWMm);

    // 중앙 박스 (3분할 시)
    let centerInnerWMm = 0;
    let centerOuterW = 0;
    let centerInnerW = 0;
    if (is3Split) {
      centerInnerWMm = hs.secondPosition!;
      const centerOuterWMm = centerInnerWMm + 2 * panelThickness;
      centerOuterW = mmToUnit(centerOuterWMm);
      centerInnerW = mmToUnit(centerInnerWMm);
    }

    // 우측 박스
    const rightInnerWMm = is3Split
      ? totalInnerWMm - leftInnerWMm - centerInnerWMm - 4 * panelThickness
      : totalInnerWMm - leftInnerWMm - 2 * panelThickness;
    const rightOuterWMm = rightInnerWMm + 2 * panelThickness;
    const rightOuterW = mmToUnit(rightOuterWMm);
    const rightInnerW = mmToUnit(rightInnerWMm);

    // 중심 X 계산
    const leftCenterX = -boxW / 2 + leftOuterW / 2;
    const centerCenterX = is3Split ? -boxW / 2 + leftOuterW + centerOuterW / 2 : 0;
    const rightCenterX = boxW / 2 - rightOuterW / 2;

    const sectionLabel = sections.length > 1 ? (sIdx === 0 ? '하부' : '상부') : '';
    // 패널 소유에 따른 내경 높이 계산
    const hsHasBottom = section.showBottomPanel !== false;
    const hsHasTop = section.showTopPanel !== false;
    const bInnerH = boxH - (hsHasBottom ? t : 0) - (hsHasTop ? t : 0);
    // 비대칭 패널 시 내경 중심 Y 보정
    const hsCenterY = centerY + ((hsHasBottom ? t : 0) - (hsHasTop ? t : 0)) / 2;

    // ─── 서브 박스별 개별 깊이 계산 ───
    const getSubBoxDepth = (side: 'left' | 'center' | 'right') => {
      const depthField = side === 'left' ? hs.leftDepth
        : side === 'center' ? hs.centerDepth
        : hs.rightDepth;
      const dirField = side === 'left' ? hs.leftDepthDirection
        : side === 'center' ? hs.centerDepthDirection
        : hs.rightDepthDirection;

      if (!depthField) return { subD: boxD, subDepthZ: 0 };
      const subD = mmToUnit(depthField);
      const diff = boxD - subD;
      const dir = dirField || 'front';
      const subDepthZ = diff === 0 ? 0 : dir === 'back' ? diff / 2 : -diff / 2;
      return { subD, subDepthZ };
    };

    // ─── 서브 박스 렌더링 ───
    const renderSubBox = (
      side: string,
      subInnerW: number,
      subCenterX: number,
      elements: CustomElement[] | undefined,
      label: string,
      subBoxD: number,
      subDepthZ: number,
    ) => {
      const prefix = `box-${sIdx}-hsplit-${side}`;
      const hasContent = !!elements;
      const subMeshes: React.ReactNode[] = [];

      // 측판 (좌/우)
      subMeshes.push(
        <BoxWithEdges
          key={`${prefix}-left-panel`}
          args={[t, boxH, subBoxD]}
          position={[subCenterX - subInnerW / 2 - t / 2, centerY, 0]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isHighlighted={isHighlighted}
          panelName={`${label}좌측판`}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
        />
      );
      subMeshes.push(
        <BoxWithEdges
          key={`${prefix}-right-panel`}
          args={[t, boxH, subBoxD]}
          position={[subCenterX + subInnerW / 2 + t / 2, centerY, 0]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isHighlighted={isHighlighted}
          panelName={`${label}우측판`}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
        />
      );

      // 상판/하판
      if (section.showTopPanel !== false) {
      subMeshes.push(
        <BoxWithEdges
          key={`${prefix}-top`}
          args={[subInnerW - widthReduction, t, subBoxD - backReduction]}
          position={[subCenterX, centerY + boxH / 2 - t / 2, backReduction / 2]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isHighlighted={isHighlighted}
          panelName={`${label}상판`}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
        />
      );
      }
      if (section.showBottomPanel !== false) {
      subMeshes.push(
        <BoxWithEdges
          key={`${prefix}-bottom`}
          args={[subInnerW - widthReduction, t, subBoxD - backReduction]}
          position={[subCenterX, centerY - boxH / 2 + t / 2, backReduction / 2]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isHighlighted={isHighlighted}
          panelName={`${label}바닥판`}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
        />
      );
      }

      // 백패널
      if (section.showBackPanel !== false) {
      const bpH = bInnerH + mmToUnit(backPanelHeightExtMm);
      const bpW = subInnerW + mmToUnit(backPanelWidthExtMm);
      const bpZ = -subBoxD / 2 + backPanelT / 2 + mmToUnit(backPanelDepthOffsetMm);
      subMeshes.push(
        <BoxWithEdges
          key={`${prefix}-back`}
          args={[bpW, bpH, backPanelT]}
          position={[subCenterX, hsCenterY, bpZ]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isHighlighted={isHighlighted}
          isBackPanel
          panelName={`${label}백패널`}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
        />
      );
      }

      // 내부 요소 (서브분할 areaSubSplits 지원)
      if ((!isDragging || isEditMode)) {
        const areaKey = side as 'left' | 'center' | 'right';
        const subSplit = section.areaSubSplits?.[areaKey];
        if (subSplit?.enabled) {
          // 서브분할 있음: 구분판 + 상/하부 요소 렌더링
          subMeshes.push(
            ...renderAreaWithSubSplit(
              section, areaKey, elements,
              subInnerW, bInnerH, hsCenterY, subCenterX, subBoxD,
              label, `s${sIdx}-hsplit-${side}`, sIdx
            )
          );
        } else if (hasContent) {
          // 서브분할 없음: 기존 방식
          subMeshes.push(
            ...renderSectionElements(
              elements!, subInnerW, bInnerH, hsCenterY, subCenterX, subBoxD,
              label, `s${sIdx}-hsplit-${side}`
            )
          );
        }
      }

      // 깊이 오프셋이 있으면 group으로 감싸기
      if (subDepthZ !== 0) {
        meshes.push(
          <group key={`${prefix}-depth-group`} position={[0, 0, subDepthZ]}>
            {subMeshes}
          </group>
        );
      } else {
        meshes.push(...subMeshes);
      }
    };

    const { subD: leftD, subDepthZ: leftDZ } = getSubBoxDepth('left');
    renderSubBox('left', leftInnerW, leftCenterX, hs.leftElements, `${sectionLabel}좌`, leftD, leftDZ);
    if (is3Split) {
      const { subD: centerD, subDepthZ: centerDZ } = getSubBoxDepth('center');
      renderSubBox('center', centerInnerW, centerCenterX, hs.centerElements, `${sectionLabel}중`, centerD, centerDZ);
    }
    const { subD: rightD, subDepthZ: rightDZ } = getSubBoxDepth('right');
    renderSubBox('right', rightInnerW, rightCenterX, hs.rightElements, `${sectionLabel}우`, rightD, rightDZ);

    if (depthOffset !== 0) {
      return [
        <group key={`box-group-hsplit-${sIdx}`} position={[0, 0, depthOffset]}>
          {meshes}
        </group>
      ];
    }
    return meshes;
  };

  // 섹션별 너비에 따른 X축 정렬 오프셋 계산
  const calculateAlignOffset = (sectionW: number, totalW: number, align: 'left' | 'center' | 'right') => {
    if (sectionW >= totalW) return 0;
    switch (align) {
      case 'left': return -(totalW - sectionW) / 2;
      case 'right': return (totalW - sectionW) / 2;
      default: return 0; // center
    }
  };

  return (
    <group
      ref={groupRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onDoubleClick={onDoubleClick}
    >
      {isSplit ? (
        <>
          {/* 분할 모드: 각 섹션을 독립 박스로 렌더링 (2분할 또는 3분할) */}
          {(() => {
            // 독립 박스 모델: 각 섹션은 자체 상/하판 보유
            // 모든 섹션: inner + 2*PT (상판 + 하판)
            // 경계부에서 인접 섹션의 상/하판이 1*PT만큼 겹침 (물리적으로 1장의 구분판)
            const sectionBoxHeights = sections.map(s => {
              const hasBottom = s.showBottomPanel !== false;
              const hasTop = s.showTopPanel !== false;
              const panelCount = (hasBottom ? 1 : 0) + (hasTop ? 1 : 0);
              return mmToUnit(s.height + panelCount * panelThickness);
            });
            const sectionCenterYs: number[] = [];
            let currentBottom = -H / 2;
            for (let i = 0; i < sections.length; i++) {
              // 경계부 겹침: i>0인 섹션은 아래 섹션의 상판과 자신의 하판이 겹침
              if (i > 0 && sections[i].showBottomPanel !== false && sections[i - 1].showTopPanel !== false) {
                currentBottom -= t;
              }
              sectionCenterYs.push(currentBottom + sectionBoxHeights[i] / 2);
              currentBottom += sectionBoxHeights[i];
            }

            return (
              <>
                {sections.map((section, sIdx) => {
                  // 비활성 섹션은 렌더링 스킵 (높이 공간은 유지)
                  if (section.enabled === false) return null;
                  const boxH = sectionBoxHeights[sIdx];
                  const centerY = sectionCenterYs[sIdx];
                  // 섹션별 깊이: 하부(idx=0)와 상부(마지막)만 개별 깊이 지원
                  let sectionD = D;
                  let depthZ = 0;
                  if (sIdx === 0 && lowerSectionDepth) {
                    sectionD = mmToUnit(lowerSectionDepth);
                    const diff = D - sectionD;
                    depthZ = diff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? diff / 2 : -diff / 2;
                  } else if (sIdx === sections.length - 1 && upperSectionDepth) {
                    sectionD = mmToUnit(upperSectionDepth);
                    const diff = D - sectionD;
                    depthZ = diff === 0 ? 0 : upperSectionDepthDirection === 'back' ? diff / 2 : -diff / 2;
                  }
                  // 섹션별 개별 너비/정렬 적용
                  const sectionW = section.width ? mmToUnit(section.width) : W;
                  const alignOffset = calculateAlignOffset(sectionW, W, section.align || 'center');
                  const needsGroup = sectionW !== W || depthZ !== 0;
                  const boxContent = renderBox(section, sIdx, sectionW, boxH, sectionD, centerY, 0);
                  return (
                    <React.Fragment key={`split-box-${sIdx}`}>
                      {needsGroup ? (
                        <group position={[alignOffset, 0, depthZ]}>
                          {boxContent}
                        </group>
                      ) : boxContent}
                    </React.Fragment>
                  );
                })}
              </>
            );
          })()}
        </>
      ) : sections[0]?.horizontalSplit ? (
        <>
          {/* 1단 + 좌우 섹션분할: renderBox가 독립 박스 2개로 렌더링 */}
          {sections[0].enabled !== false && renderBox(sections[0], 0, W, H, D, 0)}
        </>
      ) : (
        <>
          {/* 1단(분할 없음): 섹션별 너비/정렬 지원 */}
          {(() => {
            const section = sections[0];
            if (section?.enabled === false) return null;
            const singleW = section?.width ? mmToUnit(section.width) : W;
            const singleAlignOff = calculateAlignOffset(singleW, W, section?.align || 'center');
            const needsGroup = singleW !== W;
            const content = renderBox(section, 0, singleW, H, D, 0);
            return needsGroup ? (
              <group position={[singleAlignOff, 0, 0]}>{content}</group>
            ) : <>{content}</>;
          })()}
        </>
      )}

      {/* 섹션별 옵션 아이콘 */}
      {renderSectionIcons()}

      {/* 편집 중인 영역 하이라이트 테두리 */}
      {renderEditingHighlight()}

      {/* 섹션 내경 치수 (높이 + 칸막이 좌우 너비) */}
      {!isDragging && viewMode === '2D' && view2DDirection === 'front' && (() => {
        const zPos = D / 2 + 1.0;
        // 가구 내부 좌측에 표시 (측판 바로 안쪽)
        const xPos = -innerW / 2 + 0.6;
        const lineX = -innerW / 2 + 0.45;

        // 섹션별 내경 치수 렌더링 헬퍼
        const renderSectionDims = (
          section: CustomSection,
          sIdx: number,
          sectionCenterY: number,
          sectionInnerH: number,
          sectionBoxW: number,
        ) => {
          const topY = sectionCenterY + sectionInnerH / 2;
          const botY = sectionCenterY - sectionInnerH / 2;
          const bInnerW = sectionBoxW - 2 * t;
          const nodes: React.ReactNode[] = [];

          // 높이 치수
          nodes.push(
            <DimensionText
              key={`dim-h-${sIdx}`}
              value={section.height}
              position={[xPos, sectionCenterY, zPos]}
              rotation={[0, 0, Math.PI / 2]}
            />,
            <Line
              key={`dim-hline-${sIdx}`}
              points={[[lineX, topY, zPos], [lineX, botY, zPos]]}
              color="#888888"
              lineWidth={1}
            />
          );

          // 칸막이가 있으면 좌/우 내경 너비 표시
          if (section.hasPartition && section.partitionPosition) {
            const leftWidthMm = section.partitionPosition - panelThickness / 2;
            const rightWidthMm = innerWidthMm - section.partitionPosition - panelThickness / 2;
            const partX = -bInnerW / 2 + mmToUnit(section.partitionPosition);

            // 좌측 내경 너비 (섹션 중앙 상단 부근에 수평 표시)
            const dimYPos = sectionCenterY + sectionInnerH * 0.25;
            const leftCenterX = (-bInnerW / 2 + partX - t / 2) / 2;
            const leftLeft = -bInnerW / 2;
            const leftRight = partX - t / 2;

            nodes.push(
              <DimensionText
                key={`dim-wl-${sIdx}`}
                value={Math.round(leftWidthMm)}
                position={[leftCenterX, dimYPos, zPos]}
              />,
              <Line
                key={`dim-wl-line-${sIdx}`}
                points={[[leftLeft, dimYPos, zPos], [leftRight, dimYPos, zPos]]}
                color="#888888"
                lineWidth={1}
              />
            );

            // 우측 내경 너비
            const rightLeft = partX + t / 2;
            const rightRight = bInnerW / 2;
            const rightCenterX = (rightLeft + rightRight) / 2;

            nodes.push(
              <DimensionText
                key={`dim-wr-${sIdx}`}
                value={Math.round(rightWidthMm)}
                position={[rightCenterX, dimYPos, zPos]}
              />,
              <Line
                key={`dim-wr-line-${sIdx}`}
                points={[[rightLeft, dimYPos, zPos], [rightRight, dimYPos, zPos]]}
                color="#888888"
                lineWidth={1}
              />
            );
          }

          return nodes;
        };

        if (isSplit) {
          // 패널 소유 모델에 따라 박스 높이 & 내경 계산
          const sectionHeights = sections.map(s => {
            const hb = s.showBottomPanel !== false;
            const ht = s.showTopPanel !== false;
            const pc = (hb ? 1 : 0) + (ht ? 1 : 0);
            return mmToUnit(s.height + pc * panelThickness);
          });
          let dimCurrentBottom = -H / 2;
          const dimCenters: number[] = [];
          for (let i = 0; i < sections.length; i++) {
            dimCenters.push(dimCurrentBottom + sectionHeights[i] / 2);
            dimCurrentBottom += sectionHeights[i];
          }

          return (
            <>
              {sections.map((sec, si) => {
                const hb = sec.showBottomPanel !== false;
                const ht = sec.showTopPanel !== false;
                const innerH = sectionHeights[si] - (hb ? t : 0) - (ht ? t : 0);
                const contentCenter = dimCenters[si] + ((hb ? t : 0) - (ht ? t : 0)) / 2;
                return renderSectionDims(sec, si, contentCenter, innerH, W);
              })}
            </>
          );
        } else {
          return <>{renderSectionDims(sections[0], 0, 0, H - 2 * t, W)}</>;
        }
      })()}

      {/* 선반 사이 간격 치수 — 편집 팝업 열려있을 때만 표시 */}
      {!isDragging && activePopup.id === placedFurnitureId && (() => {
        const zPos = D / 2 + 0.01;

        const renderShelfGaps = (
          section: CustomSection,
          sIdx: number,
          sectionCenterY: number,
          sectionInnerH: number,
        ) => {
          const botY = sectionCenterY - sectionInnerH / 2;
          const allElements = section.hasPartition
            ? [...(section.leftElements || []), ...(section.rightElements || [])]
            : (section.elements || []);
          const shelfEl = allElements.find(e => e.type === 'shelf' && 'heights' in e);
          if (!shelfEl || !('heights' in shelfEl)) return null;

          const sortedHeights = [...shelfEl.heights].sort((a, b) => a - b);
          // 정렬된 높이의 원본 인덱스 매핑
          const sortedIndices = [...shelfEl.heights]
            .map((h, i) => ({ h, i }))
            .sort((a, b) => a.h - b.h)
            .map(x => x.i);

          const gaps: { fromY: number; toY: number; gapMm: number; shelfIdx: number }[] = [];
          const sectionHmm = section.height;

          // heights는 선반 중심 위치(mm). 내경 = 선반 아래면/윗면 기준
          const halfT = panelThickness / 2;

          // 바닥 → 첫 선반 하단 (shelfIdx=0: 첫 선반을 움직임)
          if (sortedHeights.length > 0) {
            const innerGap = sortedHeights[0] - halfT; // 바닥 ~ 첫선반 아래면
            gaps.push({ fromY: 0, toY: sortedHeights[0], gapMm: innerGap, shelfIdx: sortedIndices[0] });
          }
          // 선반 사이: 아래선반 윗면 ~ 위선반 아래면
          for (let i = 0; i < sortedHeights.length - 1; i++) {
            const innerGap = sortedHeights[i + 1] - sortedHeights[i] - panelThickness;
            gaps.push({ fromY: sortedHeights[i], toY: sortedHeights[i + 1], gapMm: innerGap, shelfIdx: sortedIndices[i] });
          }
          // 마지막 선반 윗면 → 상판 하단
          if (sortedHeights.length > 0) {
            const lastIdx = sortedHeights.length - 1;
            const lastH = sortedHeights[lastIdx];
            const innerGap = sectionHmm - lastH - halfT; // 선반 윗면 ~ 상판 하단
            gaps.push({ fromY: lastH, toY: sectionHmm, gapMm: innerGap, shelfIdx: sortedIndices[lastIdx] });
          }

          // side 결정 (칸막이 없으면 full, 있으면 첫 발견 side)
          const side: 'full' | 'left' | 'right' = !section.hasPartition ? 'full'
            : (section.leftElements || []).some(e => e.type === 'shelf') ? 'left' : 'right';

          return gaps.map((g, gi) => {
            const fromYLocal = botY + mmToUnit(g.fromY) + (gi > 0 ? t / 2 : 0);
            const toYLocal = botY + mmToUnit(g.toY) - (gi < gaps.length - 1 ? t / 2 : 0);
            const centerY = (fromYLocal + toYLocal) / 2;
            const gapVal = Math.round(g.gapMm);
            return (
              <Html
                key={`sg-${sIdx}-${gi}`}
                position={[0, centerY, zPos]}
                center
                style={{ pointerEvents: 'auto' }}
              >
                <ShelfGapInput
                  value={gapVal}
                  sIdx={sIdx}
                  gapIdx={gi}
                  shelfIdx={g.shelfIdx}
                  side={side}
                  sectionHeight={sectionHmm}
                  heights={shelfEl.heights}
                  sortedHeights={sortedHeights}
                  panelThickness={panelThickness}
                  placedFurnitureId={placedFurnitureId}
                  customConfig={customConfig}
                  onFocusChange={setIsEditingGap}
                />
              </Html>
            );
          });
        };

        if (isSplit) {
          // 패널 소유 모델에 따라 박스 높이 계산
          const gapBoxHeights = sections.map(s => {
            const hb = s.showBottomPanel !== false;
            const ht = s.showTopPanel !== false;
            const pc = (hb ? 1 : 0) + (ht ? 1 : 0);
            return mmToUnit(s.height + pc * panelThickness);
          });
          let gapBottom = -H / 2;
          const gapCenters: number[] = [];
          for (let i = 0; i < sections.length; i++) {
            gapCenters.push(gapBottom + gapBoxHeights[i] / 2);
            gapBottom += gapBoxHeights[i];
          }
          return (
            <>
              {sections.map((sec, si) => {
                const hb = sec.showBottomPanel !== false;
                const ht = sec.showTopPanel !== false;
                const innerH = gapBoxHeights[si] - (hb ? t : 0) - (ht ? t : 0);
                const contentCenter = gapCenters[si] + ((hb ? t : 0) - (ht ? t : 0)) / 2;
                return renderShelfGaps(sec, si, contentCenter, innerH);
              })}
            </>
          );
        } else {
          return <>{renderShelfGaps(sections[0], 0, 0, H - 2 * t)}</>;
        }
      })()}

      {/* 조절발 (upper가 아닌 경우) — 하부(최하단) 섹션 너비/깊이/정렬 기준 */}
      {showFurniture && category !== 'upper' && (() => {
        const lowerSection = sections[0];
        const footWidth = lowerSection?.width ? mmToUnit(lowerSection.width) : W;
        const footAlignOffset = calculateAlignOffset(footWidth, W, lowerSection?.align || 'center');

        // 좌우분할(horizontalSplit) + 좌/우 개별 깊이가 다른 경우 → 발판 분리
        const hs = lowerSection?.horizontalSplit;
        if (hs && (hs.leftDepth || hs.rightDepth)) {
          const totalInnerWMm = (footWidth - 2 * t) / 0.01;
          const leftInnerWMm = hs.position;
          const leftOuterW = mmToUnit(leftInnerWMm + 2 * panelThickness);
          const is3Split = hs.secondPosition != null;
          const centerInnerWMm = is3Split ? (hs.secondPosition || 0) : 0;
          const centerOuterW = is3Split ? mmToUnit(centerInnerWMm + 2 * panelThickness) : 0;
          const rightInnerWMm = is3Split
            ? totalInnerWMm - leftInnerWMm - centerInnerWMm - 4 * panelThickness
            : totalInnerWMm - leftInnerWMm - 2 * panelThickness;
          const rightOuterW = mmToUnit(rightInnerWMm + 2 * panelThickness);

          const leftCX = -footWidth / 2 + leftOuterW / 2;
          const rightCX = footWidth / 2 - rightOuterW / 2;

          const getFootDepth = (side: 'left' | 'center' | 'right') => {
            const d = side === 'left' ? hs.leftDepth : side === 'center' ? hs.centerDepth : hs.rightDepth;
            const dir = side === 'left' ? hs.leftDepthDirection : side === 'center' ? hs.centerDepthDirection : hs.rightDepthDirection;
            if (!d) {
              const baseD = lowerSectionDepth ? mmToUnit(lowerSectionDepth) : D;
              const baseDiff = D - baseD;
              const baseZ = baseDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? baseDiff / 2 : -baseDiff / 2;
              return { fd: baseD, fz: baseZ };
            }
            const fd = mmToUnit(d);
            const diff = D - fd;
            const fz = diff === 0 ? 0 : (dir || 'front') === 'back' ? diff / 2 : -diff / 2;
            return { fd, fz };
          };

          const { fd: leftFD, fz: leftFZ } = getFootDepth('left');
          const { fd: rightFD, fz: rightFZ } = getFootDepth('right');

          const footProps = {
            yOffset: -H / 2,
            renderMode,
            isHighlighted,
            isFloating: spaceInfo.baseConfig?.placementType === 'float',
            baseHeight: spaceInfo.baseConfig?.height || 65,
            baseDepth: spaceInfo.baseConfig?.depth || 0,
            viewMode,
            view2DDirection,
          } as const;

          return (
            <group position={[footAlignOffset, 0, 0]}>
              <group position={[leftCX, 0, leftFZ]}>
                <AdjustableFootsRenderer width={leftOuterW} depth={leftFD} {...footProps} />
              </group>
              {is3Split && (() => {
                const centerCX = -footWidth / 2 + leftOuterW + centerOuterW / 2;
                const { fd: centerFD, fz: centerFZ } = getFootDepth('center');
                return (
                  <group position={[centerCX, 0, centerFZ]}>
                    <AdjustableFootsRenderer width={centerOuterW} depth={centerFD} {...footProps} />
                  </group>
                );
              })()}
              <group position={[rightCX, 0, rightFZ]}>
                <AdjustableFootsRenderer width={rightOuterW} depth={rightFD} {...footProps} />
              </group>
            </group>
          );
        }

        // 기본: 단일 발판
        let footDepth = D;
        let footDepthZ = 0;
        if (lowerSectionDepth) {
          footDepth = mmToUnit(lowerSectionDepth);
          const diff = D - footDepth;
          footDepthZ = diff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? diff / 2 : -diff / 2;
        }
        return (
          <group position={[footAlignOffset, 0, footDepthZ]}>
            <AdjustableFootsRenderer
              width={footWidth}
              depth={footDepth}
              yOffset={-H / 2}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              isFloating={spaceInfo.baseConfig?.placementType === 'float'}
              baseHeight={spaceInfo.baseConfig?.height || 65}
              baseDepth={spaceInfo.baseConfig?.depth || 0}
              viewMode={viewMode}
              view2DDirection={view2DDirection}
            />
          </group>
        );
      })()}
    </group>
  );
};

export default CustomizableBoxModule;
