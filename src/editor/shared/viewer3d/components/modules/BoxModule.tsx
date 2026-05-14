import React, { useEffect, useState, useMemo } from 'react';
import { ModuleData } from '../../../../../data/modules/shelving';
import { SpaceInfo, useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer } from './shared';
import BoxWithEdges from './components/BoxWithEdges';
import MicrowavePullOut from './components/MicrowavePullOut';
import DoorModule from './DoorModule';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import * as THREE from 'three';
import IndirectLight from './IndirectLight';
import SingleType1 from './types/SingleType1';
import SingleType2 from './types/SingleType2';
import SingleType4 from './types/SingleType4';
import DualType1 from './types/DualType1';
import DualType2 from './types/DualType2';
import DualType4 from './types/DualType4';
import DualType5 from './types/DualType5';
import DualType6 from './types/DualType6';
import UpperCabinet from './types/UpperCabinet';
import LowerCabinet from './types/LowerCabinet';
import CustomFurnitureModule from './types/CustomFurnitureModule';
import CustomizableBoxModule from './types/CustomizableBoxModule';
import { CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import { AdjustableFootsRenderer } from './components/AdjustableFootsRenderer';
import { withUpperSafetyShelfRemoved } from '@/editor/shared/utils/upperSafetyShelf';
import {
  isOakTexture,
  applyOakTextureSettings,
  isCabinetTexture1,
  applyCabinetTexture1Settings,
  applyDefaultImageTextureSettings,
} from '@/editor/shared/utils/materialConstants';
import { resolveShelfFrontInsetMm } from '@/editor/shared/utils/shelfInsetCalculator';

interface BoxModuleProps {
  moduleData: ModuleData;
  color?: string;
  isDragging?: boolean;
  isEditMode?: boolean; // 편집 모드 여부
  internalHeight?: number;
  hasDoor?: boolean;
  hasBackPanel?: boolean; // 백패널 유무 (상부장/하부장용)
  customDepth?: number;
  hingePosition?: 'left' | 'right';
  spaceInfo?: SpaceInfo;
  doorWidth?: number; // 도어 너비 (사용하지 않음 - 도어는 항상 원래 슬롯 크기)
  doorXOffset?: number; // 도어 위치 보정값 (사용하지 않음)
  originalSlotWidth?: number; // 원래 슬롯 너비 (mm)
  slotCenterX?: number; // 원래 슬롯 중심 X 좌표 (Three.js 단위)
  adjustedWidth?: number; // 기둥/엔드판넬에 의해 조정된 폭 (mm)
  slotWidths?: number[]; // 듀얼 가구의 개별 슬롯 너비들 (mm)
  slotIndex?: number; // 슬롯 인덱스 (노서라운드 모드에서 엔드패널 확장 판단용)
  slotInfo?: any; // 슬롯 정보 (기둥 침범 등)
  viewMode?: '2D' | '3D';
  renderMode?: 'solid' | 'wireframe';
  furnitureId?: string; // 가구 ID (칸 강조용)
  showFurniture?: boolean; // 가구 본체 표시 여부 (2D 모드에서 도어만 표시할 때 사용)
  isHighlighted?: boolean; // 가구 강조 여부
  adjacentCabinets?: { hasAdjacentUpperLower: boolean; adjacentSide: 'left' | 'right' | null }; // 인접 상하부장 정보
  placedFurnitureId?: string; // 배치된 가구의 고유 ID (치수 편집용)
  customSections?: SectionConfig[]; // 사용자 정의 섹션 설정
  visibleSectionIndex?: number | null; // 듀얼 가구 섹션 필터링 (0: 좌측, 1: 우측, null: 전체)
  doorTopGap?: number; // 가구 상단에서 위로의 갭 (mm, 기본값: 5)
  doorBottomGap?: number; // 가구 하단에서 아래로의 갭 (mm, 기본값: 25)
  lowerSectionDepth?: number; // 하부 섹션 깊이 (mm)
  upperSectionDepth?: number; // 상부 섹션 깊이 (mm)
  lowerSectionDepthDirection?: 'front' | 'back'; // 하부 깊이 줄이는 방향
  upperSectionDepthDirection?: 'front' | 'back'; // 상부 깊이 줄이는 방향
  lowerSectionWidth?: number; // 하부 섹션 너비 (mm)
  upperSectionWidth?: number; // 상부 섹션 너비 (mm)
  lowerSectionWidthDirection?: 'left' | 'right'; // 하부 너비 줄이는 방향
  upperSectionWidthDirection?: 'left' | 'right'; // 상부 너비 줄이는 방향
  lowerLeftSectionDepth?: number; // 하부 좌측 영역 깊이 (mm)
  lowerRightSectionDepth?: number; // 하부 우측 영역 깊이 (mm)
  lowerSectionTopOffset?: number; // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
  grainDirection?: 'horizontal' | 'vertical'; // 텍스처 결 방향 (하위 호환성)
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' }; // 패널별 개별 결 방향
  backPanelThickness?: number; // 백패널 두께 (mm, 기본값: 9)
  hasLeftEndPanel?: boolean; // 좌측 엔드패널 표시 여부
  hasRightEndPanel?: boolean; // 우측 엔드패널 표시 여부
  endPanelThickness?: number; // 엔드패널 두께 (mm, 기본값: 18)
  endPanelDepth?: number; // 엔드패널 깊이 (mm, 기본값: 가구 깊이)
  endPanelDepthDirection?: 'front' | 'back'; // EP 깊이 확장 방향 (front: 앞으로, back: 뒤로)
  endPanelOffset?: number; // 엔드패널 Z축 옵셋 (mm, 기본값: 0) — 하위호환
  leftEndPanelOffset?: number; // 좌측 EP 앞 옵셋 (mm)
  rightEndPanelOffset?: number; // 우측 EP 앞 옵셋 (mm)
  leftEndPanelBackOffset?: number; // 좌측 EP 뒤 옵셋 (mm)
  rightEndPanelBackOffset?: number; // 우측 EP 뒤 옵셋 (mm)
  leftEndPanelOffsetDir?: 'front' | 'back'; // (deprecated)
  rightEndPanelOffsetDir?: 'front' | 'back'; // (deprecated)
  zone?: 'normal' | 'dropped'; // 단내림 영역 정보
  isFreePlacement?: boolean; // 자유배치 모드 여부
  doorSplit?: boolean; // 도어 분할 모드 (상/하 개별 도어)
  upperDoorTopGap?: number; // 상부 도어 상단 이격거리 (mm)
  upperDoorBottomGap?: number; // 상부 도어 하단 이격거리 (mm)
  lowerDoorTopGap?: number; // 하부 도어 상단 이격거리 (mm)
  lowerDoorBottomGap?: number; // 하부 도어 하단 이격거리 (mm)
  topFrameThickness?: number; // 개별 가구 상단몰딩 두께 (mm)
  hasBase?: boolean; // 걸래받이 존재 여부 (false면 받침대 없음 → baseHeight=0)
  individualFloatHeight?: number; // 개별 띄움 높이 (mm) - hasBase=false일 때 도어 Y보정용
  isCustomizable?: boolean; // 커스터마이징 가구 여부
  customConfig?: CustomFurnitureConfig; // 커스터마이징 설정
  // 이벤트 핸들러 추가
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
  onDoubleClick?: (e: any) => void;
  parentGroupY?: number; // 부모 그룹(가구)의 Y 위치 (Three.js 단위) — 도어 Y 보정용
  endPanelHeightMode?: 'floor' | 'furniture'; // EP 높이 모드 (floor: 바닥~천장, furniture: 가구 높이에 맞춤)
  topPanelNotchSize?: '680x140' | '340x140'; // 상판 따내기 크기
  topPanelNotchSide?: 'left' | 'right'; // 따내기 위치 (기본: right)
}

/**
 * BoxModule 컴포넌트 (공통 로직 사용)
 * 
 * 1. 타입별 라우팅: 주요 타입들은 개별 컴포넌트로 라우팅
 * 2. 특수 케이스: DualType5/6 같은 복잡한 케이스는 별도 처리
 * 3. 일반 폴백: 나머지 케이스들은 공통 로직 사용
 */
const BoxModule: React.FC<BoxModuleProps> = ({
  moduleData,
  color,
  isDragging = false,
  isEditMode = false,
  internalHeight,
  hasDoor = false,
  hasBackPanel = true, // 기본값은 true (백패널 있음)
  customDepth,
  hingePosition = 'right',
  spaceInfo,
  doorWidth,
  doorXOffset = 0,
  originalSlotWidth,
  slotCenterX,
  adjustedWidth,
  slotWidths,
  slotIndex,
  slotInfo,
  viewMode,
  renderMode,
  furnitureId,
  showFurniture = true, // 기본값은 true (가구 표시)
  isHighlighted = false, // 강조 상태
  adjacentCabinets, // 인접 상하부장 정보
  placedFurnitureId, // 배치된 가구 ID
  customSections, // 사용자 정의 섹션 설정
  visibleSectionIndex = null, // 듀얼 가구 섹션 필터링 (0: 좌측, 1: 우측, null: 전체)
  doorTopGap = 5, // 가구 상단에서 위로의 갭 (mm)
  doorBottomGap = 25, // 가구 하단에서 아래로의 갭 (mm)
  lowerSectionDepth, // 하부 섹션 깊이 (mm)
  upperSectionDepth, // 상부 섹션 깊이 (mm)
  lowerSectionDepthDirection, // 하부 깊이 줄이는 방향
  upperSectionDepthDirection, // 상부 깊이 줄이는 방향
  lowerSectionWidth, // 하부 섹션 너비 (mm)
  upperSectionWidth, // 상부 섹션 너비 (mm)
  lowerSectionWidthDirection, // 하부 너비 줄이는 방향
  upperSectionWidthDirection, // 상부 너비 줄이는 방향
  lowerLeftSectionDepth, // 하부 좌측 영역 깊이 (mm)
  lowerRightSectionDepth, // 하부 우측 영역 깊이 (mm)
  lowerSectionTopOffset, // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
  grainDirection, // 텍스처 결 방향
  panelGrainDirections, // 패널별 개별 결 방향
  backPanelThickness: backPanelThicknessProp, // 백패널 두께 (mm)
  hasLeftEndPanel, // 좌측 엔드패널
  hasRightEndPanel, // 우측 엔드패널
  endPanelThickness, // 엔드패널 두께 (mm)
  endPanelDepth, // 엔드패널 깊이 (mm)
  endPanelDepthDirection, // EP 깊이 확장 방향
  endPanelOffset, // 엔드패널 Z축 옵셋 (mm) — 하위호환
  leftEndPanelOffset, // 좌측 EP 앞 옵셋 (mm)
  rightEndPanelOffset, // 우측 EP 앞 옵셋 (mm)
  leftEndPanelBackOffset, // 좌측 EP 뒤 옵셋 (mm)
  rightEndPanelBackOffset, // 우측 EP 뒤 옵셋 (mm)
  leftEndPanelOffsetDir, // (deprecated)
  rightEndPanelOffsetDir, // (deprecated)
  zone, // 단내림 영역 정보
  isFreePlacement = false, // 자유배치 모드 여부
  doorSplit, // 도어 분할 모드
  upperDoorTopGap, // 상부 도어 상단 이격거리
  upperDoorBottomGap, // 상부 도어 하단 이격거리
  lowerDoorTopGap, // 하부 도어 상단 이격거리
  lowerDoorBottomGap, // 하부 도어 하단 이격거리
  topFrameThickness, // 개별 가구 상단몰딩 두께
  hasBase, // 걸래받이 존재 여부
  individualFloatHeight, // 개별 띄움 높이
  isCustomizable: _isCustomizable = false, // 커스터마이징 가구 여부 (편집 패널 분기용, 렌더링에는 customConfig 사용)
  customConfig, // 커스터마이징 설정
  // 이벤트 핸들러들
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerOver,
  onPointerOut,
  onDoubleClick,
  parentGroupY, // 부모 그룹 Y 위치
  endPanelHeightMode, // EP 높이 모드
  topPanelNotchSize, // 상판 따내기 크기
  topPanelNotchSide, // 따내기 위치
}) => {
  // === React Hooks는 항상 최상단에서 호출 ===
  const spaceConfigStore = useSpaceConfigStore();
  const { indirectLightEnabled, indirectLightIntensity, indirectLightColor } = useUIStore();
  const placedModules = useFurnitureStore(state => state.placedModules);

  // 상부 안전선반 제거 옵션 적용 (코트장/붙박이장B/D)
  const removeUpperSafetyShelf = useMemo(() => {
    const pm = placedFurnitureId ? placedModules.find(p => p.id === placedFurnitureId) : undefined;
    return !!pm?.removeUpperSafetyShelf;
  }, [placedFurnitureId, placedModules]);
  moduleData = useMemo(
    () => withUpperSafetyShelfRemoved(moduleData, removeUpperSafetyShelf),
    [moduleData, removeUpperSafetyShelf]
  );

  // sectionDepths/sectionDepthDirections는 사용자 입력 시 reactive 업데이트되어야 하므로 셀렉터 사용
  // 셀렉터에서 매번 새 객체 반환하면 무한 루프 → 배열 자체를 그대로 반환 (참조 안정성)
  const placedSectionDepths = useFurnitureStore(s => {
    if (!placedFurnitureId) return undefined;
    const m = s.placedModules.find(p => p.id === placedFurnitureId);
    return (m as any)?.sectionDepths as number[] | undefined;
  });
  const placedSectionDepthDirections = useFurnitureStore(s => {
    if (!placedFurnitureId) return undefined;
    const m = s.placedModules.find(p => p.id === placedFurnitureId);
    return (m as any)?.sectionDepthDirections as ('front' | 'back')[] | undefined;
  });
  const placedModuleForReactive = (placedSectionDepths || placedSectionDepthDirections)
    ? { sectionDepths: placedSectionDepths, sectionDepthDirections: placedSectionDepthDirections }
    : null;

  // 선반장(single-shelf/dual-shelf) 전용 흡수 분배:
  // - 띄움 차감(floatAbsorbed): 하부 섹션에서 빼고
  // - 걸레받이 흡수(baseAbsorbed): 상부 섹션에 더함
  const moduleIdForAbsorb = moduleData?.id || '';
  const isPlainShelfModule = /(^|-)(?:single|dual)-shelf-/.test(moduleIdForAbsorb)
    && !moduleIdForAbsorb.includes('-4drawer-shelf-')
    && !moduleIdForAbsorb.includes('-2drawer-shelf-');
  let shelfFloatAbsorbedMm = 0;
  let shelfBaseAbsorbedMm = 0;
  if (isPlainShelfModule) {
    const globalBaseMm = spaceInfo?.baseConfig?.height ?? 100;
    const isFloatPlacement = spaceInfo?.baseConfig?.type === 'stand'
      && spaceInfo?.baseConfig?.placementType === 'float';
    const globalFloatMm = isFloatPlacement ? (spaceInfo?.baseConfig?.floatHeight || 0) : 0;
    if (hasBase === false) {
      // 걸레받이 OFF: 받침대 전체가 가구 본체에 흡수
      shelfBaseAbsorbedMm = globalBaseMm;
      // 개별 띄움(individualFloatHeight)만큼 가구가 줄어듦 → 하부에서 차감
      shelfFloatAbsorbedMm = Math.max(0, individualFloatHeight ?? 0);
    } else if (globalFloatMm > 0) {
      // 걸레받이 ON + 전역 띄움: 띄움 높이만큼 가구가 줄어듦 → 하부에서 차감
      shelfFloatAbsorbedMm = globalFloatMm;
    }
  }

  // 공통 로직도 항상 호출 (조건부 사용)
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth,
    isHighlighted,
    grainDirection,
    panelGrainDirections,
    backPanelThicknessMm: backPanelThicknessProp,
    customSections,
    lowerSectionDepth,
    upperSectionDepth,
    lowerSectionDepthDirection,
    upperSectionDepthDirection,
    shelfFloatAbsorbedMm,
    shelfBaseAbsorbedMm,
  } as any);


  // debug useEffects removed for perf

  // 인서트 프레임 머티리얼 (전면 프레임/EP) — 도어 재질 사용
  // 도어색 우선 → 없으면 frameColor 폴백
  const insertFrameColorRaw = ((spaceInfo?.materialConfig as any)?.doorColor as string | undefined)
    ?? ((spaceInfo?.materialConfig as any)?.frameColor as string | undefined);
  const insertFrameTextureRaw = ((spaceInfo?.materialConfig as any)?.doorTexture as string | undefined)
    ?? ((spaceInfo?.materialConfig as any)?.frameTexture as string | undefined);
  const insertFrameMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#E0E0E0'),
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
      emissive: new THREE.Color(0x000000),
    });

    if (insertFrameTextureRaw) {
      if (isOakTexture(insertFrameTextureRaw)) {
        applyOakTextureSettings(mat);
      } else if (isCabinetTexture1(insertFrameTextureRaw)) {
        applyCabinetTexture1Settings(mat);
      }

      const loader = new THREE.TextureLoader();
      loader.load(insertFrameTextureRaw, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        texture.rotation = Math.PI / 2;
        texture.center.set(0.5, 0.5);
        mat.map = texture;

        if (isOakTexture(insertFrameTextureRaw)) {
          applyOakTextureSettings(mat);
        } else if (isCabinetTexture1(insertFrameTextureRaw)) {
          applyCabinetTexture1Settings(mat);
        } else {
          applyDefaultImageTextureSettings(mat);
        }

        mat.needsUpdate = true;
      });
    } else {
      // 텍스처 없을 때만 frameColor 적용
      mat.color.set(insertFrameColorRaw || '#D4C5A9');
    }
    return mat;
  }, [insertFrameColorRaw, insertFrameTextureRaw]);

  // 머티리얼 dispose (언마운트/재생성 시 메모리 정리)
  useEffect(() => {
    return () => {
      if (insertFrameMaterial.map) insertFrameMaterial.map.dispose();
      insertFrameMaterial.dispose();
    };
  }, [insertFrameMaterial]);

  // 키큰장찬넬 상부몰딩/걸레받이 머티리얼 — 옆 가구 상부몰딩/걸레받이와 동일 (frameColor/frameTexture 사용)
  const insertSurroundColorRaw = (spaceInfo?.materialConfig as any)?.frameColor as string | undefined;
  const insertSurroundTextureRaw = (spaceInfo?.materialConfig as any)?.frameTexture as string | undefined;
  const insertSurroundMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(insertSurroundColorRaw || '#D4C5A9'),
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
      emissive: new THREE.Color(0x000000),
    });
    if (insertSurroundTextureRaw) {
      if (isOakTexture(insertSurroundTextureRaw)) applyOakTextureSettings(mat);
      else if (isCabinetTexture1(insertSurroundTextureRaw)) applyCabinetTexture1Settings(mat);
      const loader = new THREE.TextureLoader();
      loader.load(insertSurroundTextureRaw, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        texture.rotation = Math.PI / 2;
        texture.center.set(0.5, 0.5);
        mat.map = texture;
        if (isOakTexture(insertSurroundTextureRaw)) applyOakTextureSettings(mat);
        else if (isCabinetTexture1(insertSurroundTextureRaw)) applyCabinetTexture1Settings(mat);
        else applyDefaultImageTextureSettings(mat);
        mat.needsUpdate = true;
      });
    }
    return mat;
  }, [insertSurroundColorRaw, insertSurroundTextureRaw]);

  useEffect(() => {
    return () => {
      if (insertSurroundMaterial.map) insertSurroundMaterial.map.dispose();
      insertSurroundMaterial.dispose();
    };
  }, [insertSurroundMaterial]);

  // 모든 간접조명은 UpperCabinetIndirectLight에서 통합 처리하므로 BoxModule에서는 렌더링하지 않음
  const showIndirectLight = false;



  // === 커스터마이징 가구 라우팅 (커스텀 설정이 있으면 항상 CustomizableBoxModule 사용) ===
  if (customConfig) {
    return (
      <>
        <CustomizableBoxModule
          width={adjustedWidth || moduleData.dimensions.width}
          height={internalHeight || moduleData.dimensions.height}
          depth={customDepth || moduleData.dimensions.depth}
          customConfig={customConfig}
          category={moduleData.category as 'full' | 'upper' | 'lower'}
          color={color}
          isDragging={isDragging}
          isEditMode={isEditMode}
          showFurniture={showFurniture}
          isHighlighted={isHighlighted}
          placedFurnitureId={placedFurnitureId}
          panelGrainDirections={panelGrainDirections}
          lowerSectionDepth={lowerSectionDepth}
          upperSectionDepth={upperSectionDepth}
          lowerSectionDepthDirection={lowerSectionDepthDirection}
          upperSectionDepthDirection={upperSectionDepthDirection}
          lowerSectionWidth={lowerSectionWidth}
          upperSectionWidth={upperSectionWidth}
          lowerSectionWidthDirection={lowerSectionWidthDirection}
          upperSectionWidthDirection={upperSectionWidthDirection}
          lowerLeftSectionDepth={lowerLeftSectionDepth}
          lowerRightSectionDepth={lowerRightSectionDepth}
          backPanelThickness={backPanelThicknessProp}
          hasLeftEndPanel={hasLeftEndPanel}
          hasRightEndPanel={hasRightEndPanel}
          endPanelThickness={endPanelThickness}
          endPanelDepth={endPanelDepth}
          endPanelDepthDirection={endPanelDepthDirection}
          leftEndPanelOffset={leftEndPanelOffset ?? endPanelOffset}
          rightEndPanelOffset={rightEndPanelOffset ?? endPanelOffset}
          leftEndPanelBackOffset={leftEndPanelBackOffset}
          rightEndPanelBackOffset={rightEndPanelBackOffset}
          leftEndPanelOffsetDir={leftEndPanelOffsetDir}
          rightEndPanelOffsetDir={rightEndPanelOffsetDir}
          endPanelHeightMode={endPanelHeightMode}
          parentGroupY={parentGroupY}
          isEditable={_isCustomizable}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          onDoubleClick={onDoubleClick}
        />
        {/* 커스터마이징 가구에도 도어 렌더링 (hasDoor가 true인 경우) */}
        {hasDoor && spaceInfo && (() => {
          // 상/하부 섹션 depth가 다르면 도어는 "덜 줄어든 쪽"(max) 앞면에 맞춤
          // 가구 전체는 customDepth(600) 기준이므로 도어만 로컬 Z에서 뒤로 이동
          const maxSec = Math.max(upperSectionDepth || 0, lowerSectionDepth || 0);
          let doorLocalZ = 0;
          if (maxSec > 0 && maxSec < (baseFurniture.actualDepthMm || 600)) {
            // 가장 덜 줄어든 쪽의 direction이 'front'(뒤고정)이면 그만큼 뒤로 이동
            const isMaxUpper = (upperSectionDepth || 0) >= (lowerSectionDepth || 0);
            const dir = isMaxUpper
              ? (upperSectionDepthDirection || 'front')
              : (lowerSectionDepthDirection || 'front');
            if (dir === 'front') {
              // 뒤고정: 600-maxSec 만큼 뒤로
              const diffMm = (baseFurniture.actualDepthMm || 600) - maxSec;
              doorLocalZ = -diffMm * 0.01; // mm→three unit
            }
          }
          return (
            <group position={[0, 0, doorLocalZ]}>
              <DoorModule
                moduleWidth={adjustedWidth || moduleData.dimensions.width}
                moduleDepth={maxSec > 0 ? maxSec : baseFurniture.actualDepthMm}
                hingePosition={hingePosition}
                spaceInfo={spaceInfo}
                color={baseFurniture.doorColor}
                doorXOffset={doorXOffset}
                originalSlotWidth={originalSlotWidth}
                slotCenterX={slotCenterX}
                slotWidths={slotWidths}
                slotIndex={slotIndex}
                moduleData={moduleData}
                isDragging={isDragging}
                isEditMode={isEditMode}
                textureUrl={baseFurniture.textureUrl}
                panelGrainDirections={baseFurniture.panelGrainDirections}
                furnitureId={placedFurnitureId}
                floatHeight={spaceInfo?.baseConfig?.floatHeight}
                doorTopGap={doorTopGap}
                doorBottomGap={doorBottomGap}
                zone={zone}
                internalHeight={internalHeight}
                isFreePlacement={isFreePlacement}
                topFrameThickness={topFrameThickness}
                hasBase={hasBase}
                individualFloatHeight={individualFloatHeight}
                parentGroupY={parentGroupY}
              />
            </group>
          );
        })()}
      </>
    );
  }

  // === 0단계: 커스텀 가구 라우팅 ===
  if (moduleData.id.startsWith('custom-')) {
    // 커스텀 가구 ID에서 실제 가구 ID 추출
    const customFurnitureId = moduleData.id;

    return (
      <CustomFurnitureModule
        customFurnitureId={customFurnitureId}
        slotWidth={adjustedWidth || moduleData.dimensions.width}
        slotHeight={moduleData.dimensions.height}
        slotDepth={customDepth || moduleData.dimensions.depth}
        scaleMode="non-uniform"
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        showFurniture={showFurniture}
        isHighlighted={isHighlighted}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
      />
    );
  }

  // === 1단계: 타입별 라우팅 (주요 타입들) ===
  if (moduleData.id.includes('dual-4drawer-shelf')) {
    return (
      <>
        <DualType4
          moduleData={moduleData}
          color={color}
          isDragging={isDragging}
          isEditMode={isEditMode}
          internalHeight={internalHeight}
          hasDoor={hasDoor}
          customDepth={customDepth}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          doorWidth={doorWidth}
          doorXOffset={0}
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX}
          adjustedWidth={adjustedWidth}
          slotWidths={slotWidths}
          slotIndex={slotIndex}
          showFurniture={showFurniture}
          customSections={customSections}
          placedFurnitureId={placedFurnitureId}
          visibleSectionIndex={visibleSectionIndex}
          lowerSectionDepth={lowerSectionDepth}
          upperSectionDepth={upperSectionDepth}
          lowerSectionDepthDirection={lowerSectionDepthDirection}
          upperSectionDepthDirection={upperSectionDepthDirection}
          lowerSectionWidth={lowerSectionWidth}
          upperSectionWidth={upperSectionWidth}
          lowerSectionWidthDirection={lowerSectionWidthDirection}
          upperSectionWidthDirection={upperSectionWidthDirection}
          lowerSectionTopOffset={lowerSectionTopOffset}
          backPanelThickness={backPanelThicknessProp}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          onDoubleClick={onDoubleClick}
          furnitureId={furnitureId}
          doorTopGap={doorTopGap}
          doorBottomGap={doorBottomGap}
          zone={zone}
          hasBase={hasBase}
          individualFloatHeight={individualFloatHeight}
          parentGroupY={parentGroupY}
        />
      </>
    );
  }

  if (moduleData.id.includes('dual-4drawer-hanging')) {
    return (
      <>
        <DualType4
          moduleData={moduleData}
          color={color}
          isDragging={isDragging}
          isEditMode={isEditMode}
          internalHeight={internalHeight}
          hasDoor={hasDoor}
          customDepth={customDepth}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          doorWidth={doorWidth}
          doorXOffset={0} // 도어 위치 고정 (커버 방식)
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX}
          adjustedWidth={adjustedWidth} // 조정된 폭 전달
          slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
          slotIndex={slotIndex} // 슬롯 인덱스 전달
          showFurniture={showFurniture} // 가구 본체 표시 여부
          customSections={customSections} // 사용자 정의 섹션 설정
          placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
          visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
          lowerSectionDepth={lowerSectionDepth} // 하부 섹션 깊이 (mm)
          upperSectionDepth={upperSectionDepth} // 상부 섹션 깊이 (mm)
          lowerSectionDepthDirection={lowerSectionDepthDirection}
          upperSectionDepthDirection={upperSectionDepthDirection}
  
          lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
          backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
            // 이벤트 핸들러들 전달
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
        doorTopGap={doorTopGap} // 천장에서 도어 상단까지의 갭
        doorBottomGap={doorBottomGap} // 바닥에서 도어 하단까지의 갭
        zone={zone}
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
        parentGroupY={parentGroupY}
        />
      </>
    );
  }

  if (moduleData.id.includes('dual-2drawer-shelf')) {
    return (
      <>
        <DualType1
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0}
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth}
        slotWidths={slotWidths}
        slotIndex={slotIndex}
        showFurniture={showFurniture}
        customSections={customSections}
        isHighlighted={isHighlighted}
        placedFurnitureId={placedFurnitureId}
        visibleSectionIndex={visibleSectionIndex}
        grainDirection={grainDirection}
        panelGrainDirections={panelGrainDirections}
        lowerSectionDepth={lowerSectionDepth}
        upperSectionDepth={upperSectionDepth}
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        lowerSectionTopOffset={lowerSectionTopOffset}
        backPanelThickness={backPanelThicknessProp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        zone={zone}
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
        parentGroupY={parentGroupY}
      />
      </>
    );
  }

  if (moduleData.id.includes('dual-2drawer-hanging')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <DualType1
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        showFurniture={showFurniture} // 가구 본체 표시 여부
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        isHighlighted={isHighlighted} // 강조 상태 전달
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
        grainDirection={grainDirection} // 텍스처 결 방향 (하위 호환성)
        panelGrainDirections={panelGrainDirections} // 패널별 개별 결 방향
        lowerSectionDepth={lowerSectionDepth} // 하부 섹션 깊이 (mm)
        upperSectionDepth={upperSectionDepth} // 상부 섹션 깊이 (mm)
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}


        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
        doorTopGap={doorTopGap} // 천장에서 도어 상단까지의 갭
        doorBottomGap={doorBottomGap} // 바닥에서 도어 하단까지의 갭
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
        parentGroupY={parentGroupY}
      />
      </>
    );
  }

  // 듀얼 현관장 H(dual-entryway-h-)는 BaseFurnitureShell 폴백 경로에서 처리
  // (속서랍/서랍받침대/속장 ㄷ자 프레임 hardcoded 코드가 BaseFurnitureShell에 있음)
  if ((moduleData.id.includes('dual-2hanging') || moduleData.id.includes('dual-shelf-')) && !moduleData.id.includes('shelf-split')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <DualType2
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        showFurniture={showFurniture} // 가구 본체 표시 여부
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        isHighlighted={isHighlighted} // 강조 상태 전달
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
        lowerSectionDepth={lowerSectionDepth} // 하부 섹션 깊이
        upperSectionDepth={upperSectionDepth} // 상부 섹션 깊이
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        doorSplit={doorSplit}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        panelGrainDirections={panelGrainDirections}
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
        parentGroupY={parentGroupY}
      />
      </>
    );
  }

  if (moduleData.id.includes('single-4drawer-shelf')) {
    return (
      <>
        <SingleType4
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0}
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth}
        slotIndex={slotIndex}
        slotInfo={slotInfo}
        showFurniture={showFurniture}
        customSections={customSections}
        isHighlighted={isHighlighted}
        furnitureId={furnitureId}
        placedFurnitureId={placedFurnitureId}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        lowerSectionDepth={lowerSectionDepth}
        upperSectionDepth={upperSectionDepth}
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        doorSplit={doorSplit}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset}
        backPanelThickness={backPanelThicknessProp}
        zone={zone}
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
        parentGroupY={parentGroupY}
      />
      </>
    );
  }

  if (moduleData.id.includes('single-4drawer-hanging')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <SingleType4
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        slotInfo={slotInfo} // 슬롯 정보 전달
        showFurniture={showFurniture}
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        isHighlighted={isHighlighted} // 강조 상태 전달
        furnitureId={furnitureId} // 가구 본체 표시 여부
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        lowerSectionDepth={lowerSectionDepth}
        upperSectionDepth={upperSectionDepth}
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        doorSplit={doorSplit}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        zone={zone}
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
        parentGroupY={parentGroupY}
      />
      </>
    );
  }

  if (moduleData.id.includes('single-2drawer-shelf')) {
    return (
      <>
        <SingleType1
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        customSections={customSections}
        doorXOffset={0}
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth}
        slotIndex={slotIndex}
        slotInfo={slotInfo}
        showFurniture={showFurniture}
        isHighlighted={isHighlighted}
        furnitureId={furnitureId}
        placedFurnitureId={placedFurnitureId}
        lowerSectionDepth={lowerSectionDepth}
        upperSectionDepth={upperSectionDepth}
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        panelGrainDirections={panelGrainDirections}
        doorSplit={doorSplit}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset}
        backPanelThickness={backPanelThicknessProp}
        zone={zone}
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
        parentGroupY={parentGroupY}
      />
      </>
    );
  }

  if (moduleData.id.includes('single-2drawer-hanging')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <SingleType1
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        customSections={customSections}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        slotInfo={slotInfo} // 슬롯 정보 전달
        showFurniture={showFurniture} // 가구 본체 표시 여부
        isHighlighted={isHighlighted} // 강조 상태 전달
        furnitureId={furnitureId} // 가구 ID 전달
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        lowerSectionDepth={lowerSectionDepth}
        upperSectionDepth={upperSectionDepth}
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        panelGrainDirections={panelGrainDirections}
        doorSplit={doorSplit}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        zone={zone}
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
        parentGroupY={parentGroupY}
      />
      </>
    );
  }

  // 현관장 H(single-entryway-h-)는 BaseFurnitureShell 폴백 경로에서 처리
  // (속서랍/서랍받침대/속장 ㄷ자 프레임 hardcoded 코드가 BaseFurnitureShell에 있음)
  if ((moduleData.id.includes('single-2hanging') || moduleData.id.includes('single-shelf-')) && !moduleData.id.includes('shelf-split')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <SingleType2
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        showFurniture={showFurniture}
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        furnitureId={furnitureId} // 가구 본체 표시 여부
        doorTopGap={doorTopGap} // 천장에서 도어 상단까지의 갭
        doorBottomGap={doorBottomGap} // 바닥에서 도어 하단까지의 갭
        lowerSectionDepth={lowerSectionDepth} // 하부 섹션 깊이 (mm)
        upperSectionDepth={upperSectionDepth} // 상부 섹션 깊이 (mm)
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        doorSplit={doorSplit}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        zone={zone}
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
        parentGroupY={parentGroupY}
      />
      </>
    );
  }

  if (moduleData.id.includes('dual-2drawer-styler')) {
    
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <DualType5
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        showFurniture={showFurniture} // 가구 본체 표시 여부
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
        individualFloatHeight={individualFloatHeight}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        parentGroupY={parentGroupY}
      />
      </>
    );
  }

  if (moduleData.id.includes('dual-4drawer-pantshanger')) {
    
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <DualType6
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}-${doorSplit}-${upperDoorTopGap}-${upperDoorBottomGap}-${lowerDoorTopGap}-${lowerDoorBottomGap}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        showFurniture={showFurniture} // 가구 본체 표시 여부
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
        lowerSectionDepth={lowerSectionDepth}
        upperSectionDepth={upperSectionDepth}
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        doorSplit={doorSplit}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
        individualFloatHeight={individualFloatHeight}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        parentGroupY={parentGroupY}
      />
      </>
    );
  }

  // === 상부장 타입들 (싱글 및 듀얼) ===
  if (moduleData.id.includes('upper-cabinet-') || moduleData.id.includes('dual-upper-cabinet-')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <UpperCabinet
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        hasBackPanel={hasBackPanel} // 백패널 유무 전달
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0}
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth}
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex}
        showFurniture={showFurniture} // 가구 본체 표시 여부
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        placedFurnitureId={placedFurnitureId}
        panelGrainDirections={panelGrainDirections}
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        renderMode={renderMode} // 렌더 모드 전달
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
        parentGroupY={parentGroupY}
        topPanelNotchSize={topPanelNotchSize}
        topPanelNotchSide={topPanelNotchSide}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        customSections={customSections} // 선반 갯수/위치 편집 반영 (상부장 3단형 등)
      />
      </>
    );
  }

  // === 하부장 타입들 (싱글 및 듀얼) ===
  if (moduleData.id.includes('lower-cabinet-') || moduleData.id.includes('dual-lower-cabinet-') || moduleData.id.includes('lower-half-cabinet') || moduleData.id.includes('dual-lower-half-cabinet') || moduleData.id.includes('lower-sink-cabinet') || moduleData.id.includes('dual-lower-sink-cabinet') || moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet') || moduleData.id.includes('lower-drawer-') || moduleData.id.includes('lower-door-lift-') || moduleData.id.includes('lower-top-down-')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <LowerCabinet
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        hasBackPanel={hasBackPanel} // 백패널 유무 전달
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0}
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth}
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex}
        showFurniture={showFurniture} // 가구 본체 표시 여부
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        placedFurnitureId={placedFurnitureId}
        panelGrainDirections={panelGrainDirections}
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        renderMode={renderMode} // 렌더 모드 전달
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
        individualFloatHeight={individualFloatHeight}
        parentGroupY={parentGroupY}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
      />
      </>
    );
  }

  // === Insert 프레임 (ㄷ자 구조) 전용 렌더링 ===
  // 본체/백패널/상하판/조절발/도어/공간상걸래받이 모두 없음
  // 앞면 프레임 + 좌 EP(18×58) + 우 EP(18×58), 모두 PET 재질, 바닥~천장
  // 외경은 customWidth(빌트인 냉장고장 배치 시 자동 조정) 우선, 없으면 moduleData 기본값(136)
  const isInsertFrame = (moduleData?.modelConfig as any)?.isInsertFrame === true;
  if (isInsertFrame && showFurniture && spaceInfo) {
    const mmTo = baseFurniture.mmToThreeUnits;
    const PT = (moduleData?.modelConfig?.basicThickness || 18); // 판재 두께 (PET 18)
    const FRAME_DEPTH = mmTo(58);
    const PT_THREE = mmTo(PT);

    // 공간 전체 높이로 그림. 가구 그룹은 가구 중심 기준이므로 공간 중심으로 Y 시프트.
    const spaceTotalHeightMm = spaceInfo.height || 0;
    const floorFinishMm = (spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height) || 0;
    const baseHeightMm = spaceInfo.baseConfig?.type === 'floor'
      ? (spaceInfo.baseConfig?.height ?? 65)
      : 0;
    const floatHeightMmIF = spaceInfo.baseConfig?.placementType === 'float'
      ? (spaceInfo.baseConfig?.floatHeight ?? 0)
      : 0;
    const furnitureCenterYmm = floorFinishMm + baseHeightMm + floatHeightMmIF + (baseFurniture.height * 100) / 2;
    const spaceCenterYmm = spaceTotalHeightMm / 2;
    const fullYOffset = mmTo(spaceCenterYmm - furnitureCenterYmm);
    const fullHeight = mmTo(spaceTotalHeightMm);

    // 외경 폭: 사용자 입력값(adjustedWidth) 우선, 없으면 기본 136
    const insertOuterWidthMm = adjustedWidth || moduleData.dimensions.width || 136;
    const moduleW = mmTo(insertOuterWidthMm);
    const moduleD = baseFurniture.depth; // 58mm

    // 앞면 프레임: placedModule.insertFrontInsetMm 우선, 기본 40mm
    //   프레임 앞면 = moduleD/2 - inset → 프레임 중심 = moduleD/2 - inset - PT/2
    const _pmIF = placedFurnitureId ? placedModules.find(p => p.id === placedFurnitureId) : undefined;
    const _insetMm = typeof (_pmIF as any)?.insertFrontInsetMm === 'number' ? (_pmIF as any).insertFrontInsetMm : 40;
    const FRONT_FRAME_INSET = mmTo(_insetMm);
    const frontFrameZ = moduleD / 2 - FRONT_FRAME_INSET - PT_THREE / 2;
    // 좌/우 EP: 두께 18, 깊이 = 기본 - 18mm (Z축으로 18mm 줄임). 위치 X는 좌/우 끝 그대로
    const leftEpX = -moduleW / 2 + PT_THREE / 2;
    const rightEpX = moduleW / 2 - PT_THREE / 2;
    // EP 깊이를 기본 FRAME_DEPTH(58)에서 18mm 줄임 → 40
    const EP_DEPTH_REDUCTION = mmTo(18);
    const epDepth = FRAME_DEPTH - EP_DEPTH_REDUCTION;
    // EP 앞면이 전면 프레임의 뒷면에 닿도록 → EP가 전면 프레임 뒤에 위치
    // 전면 프레임 뒷면 Z = frontFrameZ - PT_THREE/2
    // EP 중심 = (전면 프레임 뒷면) - epDepth/2
    const epZ = frontFrameZ - PT_THREE / 2 - epDepth / 2;

    // 전면 프레임 폭: 외경 폭 그대로 (좌우로 EP 두께만큼 더 늘려서 가구 양 끝까지)
    const frontFrameWidth = moduleW;

    // 상단 프레임 / 걸레받이: 전면 프레임과 동일한 Z 위치, 폭=가구 외경, 두께=18mm, 깊이=18mm
    //   상단 프레임 size = spaceInfo.frameSize.top (기본 30)
    //   걸레받이 size = spaceInfo.baseConfig.height (floor 타입일 때만, 기본 65)
    const topFrameMmIF = spaceInfo.frameSize?.top ?? 30;
    const baseFrameMmIF = spaceInfo.baseConfig?.type === 'floor'
      ? (spaceInfo.baseConfig?.height ?? 65)
      : 0;
    const topFrameH = mmTo(topFrameMmIF);
    const baseFrameH = mmTo(baseFrameMmIF);
    // 공간 좌표계: 공간 상단 Y = fullYOffset + fullHeight/2
    //              공간 바닥(floor finish 위) Y = fullYOffset - fullHeight/2 + mmTo(floorFinishMm)
    const spaceTopY = fullYOffset + fullHeight / 2;
    const spaceBottomY = fullYOffset - fullHeight / 2 + mmTo(floorFinishMm);
    const topFrameCenterY = spaceTopY - topFrameH / 2;
    const baseFrameCenterY = spaceBottomY + baseFrameH / 2;
    // 상단몰딩/걸레받이 Z: 옆 가구와 동일한 라인 = 가구 앞면(moduleD/2)에서 두께/2 안쪽
    //   (전면 프레임의 inset과 무관)
    const topBaseFrameZ = moduleD / 2 - PT_THREE / 2;

    return (
      <>
        {/* 앞면 프레임 (PET) - 좌우 EP 사이, 가구 중앙에 위치, 윤곽선 포함 */}
        <BoxWithEdges
          args={[frontFrameWidth, fullHeight, PT_THREE]}
          position={[0, fullYOffset, frontFrameZ]}
          material={insertFrameMaterial}
          isDragging={isDragging}
          isEditMode={isEditMode}
          panelName="Insert전면프레임-마감판"
          furnitureId={placedFurnitureId}
        />
        {/* 상단 프레임 (PET) - 옆 가구 상단몰딩과 같은 Z + 같은 색상/윤곽선 (panelName에 '마감판' 포함 → 도어 색 외곽선) */}
        {topFrameMmIF > 0 && (
          <BoxWithEdges
            args={[frontFrameWidth, topFrameH, PT_THREE]}
            position={[0, topFrameCenterY, topBaseFrameZ]}
            material={insertSurroundMaterial}
            isDragging={isDragging}
            isEditMode={isEditMode}
            panelName="Insert상단프레임"
            furnitureId={placedFurnitureId}
          />
        )}
        {/* 걸레받이 (PET) - 옆 가구 걸레받이와 같은 Z + 같은 색상/윤곽선 */}
        {baseFrameMmIF > 0 && (
          <BoxWithEdges
            args={[frontFrameWidth, baseFrameH, PT_THREE]}
            position={[0, baseFrameCenterY, topBaseFrameZ]}
            material={insertSurroundMaterial}
            isDragging={isDragging}
            isEditMode={isEditMode}
            panelName="Insert걸레받이"
            furnitureId={placedFurnitureId}
          />
        )}
        {/* 좌/우 EP (PET) — 상단 프레임/걸레받이 사이 영역만 (전면 프레임과 동일한 본체 높이) */}
        {(() => {
          const epTopY = spaceTopY - topFrameH;       // 상단 프레임 하단
          const epBottomY = spaceBottomY + baseFrameH; // 걸레받이 상단
          const epH = Math.max(0, epTopY - epBottomY);
          const epCenterY = (epTopY + epBottomY) / 2;
          if (epH <= 0) return null;
          return (
            <>
              <BoxWithEdges
                args={[PT_THREE, epH, epDepth]}
                position={[leftEpX, epCenterY, epZ]}
                material={insertFrameMaterial}
                isDragging={isDragging}
                isEditMode={isEditMode}
                isEndPanel={true}
                panelName="Insert좌EP-마감판"
                furnitureId={placedFurnitureId}
              />
              <BoxWithEdges
                args={[PT_THREE, epH, epDepth]}
                position={[rightEpX, epCenterY, epZ]}
                material={insertFrameMaterial}
                isDragging={isDragging}
                isEditMode={isEditMode}
                isEndPanel={true}
                panelName="Insert우EP-마감판"
                furnitureId={placedFurnitureId}
              />
            </>
          );
        })()}
      </>
    );
  }

  // === 2단계: 일반 폴백 케이스 (공통 로직 사용) ===
  // 나머지 케이스들을 공통 로직으로 처리
  return (
    <>
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <BaseFurnitureShell
          {...baseFurniture}
          isDragging={isDragging}
          isEditMode={isEditMode}
          isHighlighted={isHighlighted}
          placedFurnitureId={placedFurnitureId}
          panelGrainDirections={panelGrainDirections}
          moduleData={moduleData}
          lowerSectionTopOffsetMm={(moduleData?.id?.includes('entryway-h')) ? 85 : (lowerSectionTopOffset || 0)}
          // 유리장 천판/바닥판은 앞쪽 50mm 들이기 (브론즈 도어 위/아래 공간 확보)
          topPanelFrontReduction={moduleData?.id?.includes('glass-cabinet') ? 50 : 0}
          bottomPanelFrontReduction={moduleData?.id?.includes('glass-cabinet') ? 50 : 0}
        >
          {/* 내부 구조 렌더링 (드래그/고스트 중에도 표시) */}
          {(
            <SectionsRenderer
              key={`sections-${placedFurnitureId}-${JSON.stringify(placedSectionDepths)}-${JSON.stringify(placedSectionDepthDirections)}`}
              modelConfig={baseFurniture.modelConfig}
              height={baseFurniture.height}
              innerWidth={baseFurniture.innerWidth}
              depth={baseFurniture.depth}
              adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
              basicThickness={baseFurniture.basicThickness}
              shelfZOffset={baseFurniture.shelfZOffset}
              material={baseFurniture.material}
              calculateSectionHeight={baseFurniture.calculateSectionHeight}
              mmToThreeUnits={baseFurniture.mmToThreeUnits}
              renderMode={renderMode || useSpace3DView().renderMode}
              furnitureId={moduleData?.id || furnitureId}
              placedFurnitureId={placedFurnitureId}
              textureUrl={baseFurniture.textureUrl}
              panelGrainDirections={panelGrainDirections}
              isFloatingPlacement={spaceInfo?.baseConfig?.placementType === 'float'}
              shelfFrontInsetMm={resolveShelfFrontInsetMm({
                moduleId: moduleData?.id,
                cabinetCategory: moduleData?.category,
                depthMm: baseFurniture?.actualDepthMm
              })}
              doorTopGap={doorTopGap}
              doorBottomGap={doorBottomGap}
              sectionDepths={placedModuleForReactive?.sectionDepths}
              sectionDepthDirections={placedModuleForReactive?.sectionDepthDirections}
            />
          )}
          {/* 인출장 2단: 전자렌지 인출서랍 부재 */}
          {moduleData?.id?.includes('pull-out-cabinet') && (() => {
            const sections = (baseFurniture.modelConfig as any)?.sections || [];
            if (sections.length < 2) return null;
            const sec1H = sections[0].height || 600; // 1단 외경 높이 600
            const sec2H = sections[1].height || 500; // 2단 외경 높이 500
            const heightMm = baseFurniture.height * 100; // 가구 외경 높이 mm
            const halfHeightMm = heightMm / 2;
            // 2단 섹션 바닥 (가구 그룹 중심 기준 mm)
            // 가구 바닥 = -halfHeight, 1단 끝 = -halfHeight + sec1H
            const sec2BottomMm = -halfHeightMm + sec1H;
            const innerWidthMm = baseFurniture.innerWidth * 100;
            const outerDepthMm = baseFurniture.depth * 100;
            // 백패널 두께: useBaseFurniture에서 계산된 값(사용자 설정 반영) 사용 → 백패널 두께 변경 시 자동 동기화
            const backPanelThicknessMm = baseFurniture.backPanelThickness * 100;
            const basicThicknessMm = baseFurniture.basicThickness * 100;
            return (
              <MicrowavePullOut
                sectionBottomMm={sec2BottomMm}
                sectionHeightMm={sec2H}
                innerWidthMm={innerWidthMm}
                outerDepthMm={outerDepthMm}
                backPanelThicknessMm={backPanelThicknessMm}
                basicThicknessMm={basicThicknessMm}
                material={baseFurniture.material}
                mmToThreeUnits={baseFurniture.mmToThreeUnits}
              />
            );
          })()}
          {/* 도어분절 현관장: 하부섹션 상단에 ㄱ자 목찬넬 (가로 + 수직) — 하부섹션 H 변경 추종 */}
          {moduleData?.id?.includes('shelf-split') && (() => {
            const mmToUnits = (mm: number) => mm * 0.01;
            const notchHeightMm = 80;
            // 하부섹션 실제 height (customSections 우선, 없으면 modelConfig.sections[0].height)
            const lowerSectionHmm =
              (customSections?.[0]?.height as number | undefined) ??
              (baseFurniture.modelConfig?.sections?.[0]?.height as number | undefined) ??
              860;
            // 노치 상단 = 하부섹션 상단(=측판 (하) 상단), 노치 하단 = 그 - 80mm
            const notchFromBottomMm = lowerSectionHmm - notchHeightMm;
            const basicThicknessMm = baseFurniture.basicThickness / 0.01;
            // 목찬넬 폭: 측판 따내기(z=40mm, 깊이방향) 안쪽으로 측판 두께만큼 좌·우 양옆 확장 → 끼워짐
            const frameWidth = baseFurniture.innerWidth + 2 * baseFurniture.basicThickness;
            const verticalHMm = notchHeightMm - basicThicknessMm;
            const cabinetBottomY = -baseFurniture.height / 2;
            const horzY = cabinetBottomY + mmToUnits(notchFromBottomMm) + baseFurniture.basicThickness / 2;
            const horzZ = baseFurniture.depth / 2 - mmToUnits(40) / 2;
            const vertY = cabinetBottomY + mmToUnits(notchFromBottomMm) + baseFurniture.basicThickness + mmToUnits(verticalHMm) / 2;
            // 수직부재 뒷면 = 측판 따내기 안쪽 면 (= depth/2 - 40), 수직 중심 = 뒷면 + basicThickness/2
            // → 수직부재는 수평부재 뒷쪽 끝부분 18mm 영역에 위치 (다른 상판내림 모듈과 동일 패턴)
            const vertZ = baseFurniture.depth / 2 - mmToUnits(40) + baseFurniture.basicThickness / 2;
            return (
              <>
                <BoxWithEdges
                  args={[frameWidth, baseFurniture.basicThickness, mmToUnits(40)]}
                  position={[0, horzY, horzZ]}
                  material={baseFurniture.material}
                  renderMode={renderMode || useSpace3DView().renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  panelName="목찬넬프레임수평"
                  panelGrainDirections={panelGrainDirections}
                  furnitureId={placedFurnitureId}
                  textureUrl={baseFurniture.textureUrl}
                />
                <BoxWithEdges
                  args={[frameWidth, mmToUnits(verticalHMm), baseFurniture.basicThickness]}
                  position={[0, vertY, vertZ]}
                  material={baseFurniture.material}
                  renderMode={renderMode || useSpace3DView().renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  panelName="목찬넬프레임수직"
                  panelGrainDirections={panelGrainDirections}
                  furnitureId={placedFurnitureId}
                  textureUrl={baseFurniture.textureUrl}
                />
                {/* 목찬넬 수직부재 뒤쪽 세로 보강대 (전대) — 폭 innerWidth × 높이 80 × 두께 18 */}
                {(() => {
                  const stretcherHeightMm = 80;
                  const stretcherWidth = baseFurniture.innerWidth;
                  const stretcherHeight = mmToUnits(stretcherHeightMm);
                  const stretcherThickness = baseFurniture.basicThickness;
                  // Y: 따내기 영역(780~860) 중앙 = 820 → 가구 중심 기준 = -H/2 + 820
                  const stretcherY = cabinetBottomY + mmToUnits(notchFromBottomMm + notchHeightMm / 2);
                  // Z: 수직부재(z 두께 18) 바로 뒤
                  //    수직부재 뒷면 z = vertZ - basicThickness/2
                  //    보강대 중심 z = (수직부재 뒷면) - stretcherThickness/2
                  const stretcherZ = vertZ - baseFurniture.basicThickness / 2 - stretcherThickness / 2;
                  return (
                    <BoxWithEdges
                      args={[stretcherWidth, stretcherHeight, stretcherThickness]}
                      position={[0, stretcherY, stretcherZ]}
                      material={baseFurniture.material}
                      renderMode={renderMode || useSpace3DView().renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      panelName="전대(분절후방)"
                      panelGrainDirections={panelGrainDirections}
                      furnitureId={placedFurnitureId}
                      textureUrl={baseFurniture.textureUrl}
                    />
                  );
                })()}
                {/* (하)상판 — 목찬넬 수직부재 뒷면 ~ 백패널 앞면 까지 */}
                {(() => {
                  const stretcherThickness = baseFurniture.basicThickness;
                  const stretcherZ = vertZ - baseFurniture.basicThickness / 2 - stretcherThickness / 2;
                  const stretcherBackZ = stretcherZ - stretcherThickness / 2; // 전대 뒷면
                  // 백패널 앞면 Z (대략): -depth/2 + 백패널두께 + depthOffset(가구재두께-1mm) → 보수적으로 -depth/2 + basicThickness
                  const backPanelFrontZ = -baseFurniture.depth / 2 + baseFurniture.basicThickness;
                  const topPanelDepth = stretcherBackZ - backPanelFrontZ;
                  const topPanelCenterZ = (stretcherBackZ + backPanelFrontZ) / 2;
                  if (topPanelDepth <= 0) return null;
                  // Y: 측판 (하)상단과 윗면 정렬 — 측판 (하)상단 = -H/2 + 860, 상판 중심 = 그-basicThickness/2
                  const lowerSectionTopY = cabinetBottomY + mmToUnits(notchFromBottomMm + notchHeightMm);
                  const topPanelY = lowerSectionTopY - baseFurniture.basicThickness / 2;
                  return (
                    <BoxWithEdges
                      args={[baseFurniture.innerWidth, baseFurniture.basicThickness, topPanelDepth]}
                      position={[0, topPanelY, topPanelCenterZ]}
                      material={baseFurniture.material}
                      renderMode={renderMode || useSpace3DView().renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      panelName="(하)상판"
                      panelGrainDirections={panelGrainDirections}
                      furnitureId={placedFurnitureId}
                      textureUrl={baseFurniture.textureUrl}
                    />
                  );
                })()}
              </>
            );
          })()}
        </BaseFurnitureShell>
      )}

      {/* 폴백 케이스 조절발 (현관장 H/I, 바지걸이장 등) */}
      {showFurniture && (() => {
        // 인출장/팬트리장/냉장고장: 1단(하부) sectionDepth가 줄어들면 조절발도 앞으로/뒤로 통째로 이동
        const isNSectionFoot = !!(moduleData?.id?.includes('pull-out-cabinet') ||
          moduleData?.id?.includes('pantry-cabinet') ||
          (moduleData?.id?.includes('fridge-cabinet') && !moduleData?.id?.includes('built-in-fridge')));
        const lowerSectionDepthMm = isNSectionFoot ? placedSectionDepths?.[0] : undefined;
        const lowerDir = isNSectionFoot ? (placedSectionDepthDirections?.[0] ?? 'front') : 'front';
        // 짧아진 섹션 길이로 발 간격 그리고, 의류장과 동일 컨벤션으로 그룹 통째 ±depthDiff/2 이동
        const footDepth = (lowerSectionDepthMm && lowerSectionDepthMm > 0)
          ? baseFurniture.mmToThreeUnits(lowerSectionDepthMm)
          : baseFurniture.depth;
        const depthDiffFoot = baseFurniture.depth - footDepth;
        const sectionZOffsetFoot = depthDiffFoot === 0
          ? 0
          : (lowerDir === 'back' ? depthDiffFoot / 2 : -depthDiffFoot / 2);
        return (
          <group position={[0, 0, sectionZOffsetFoot]}>
            <AdjustableFootsRenderer
              width={baseFurniture.width}
              depth={footDepth}
              yOffset={-baseFurniture.height / 2}
              placedFurnitureId={placedFurnitureId}
              renderMode={renderMode}
              isHighlighted={false}
              isFloating={spaceInfo?.baseConfig?.placementType === 'float'}
              baseHeight={spaceInfo?.baseConfig?.height || 65}
              baseDepth={spaceInfo?.baseConfig?.depth || 0}
              viewMode={viewMode}
            />
          </group>
        );
      })()}

      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {(() => {


        // 2D 모드에서 showFurniture가 false여도 도어는 렌더링
        if (hasDoor && spaceInfo) {
          // 도어분절 가구(shelf-split / pantry-cabinet-split): 도어를 상/하 두 장으로 분할
          // - 하부섹션 몸통 상단 = 800mm
          // - 하부도어 상단 = 800 - 40 = 760mm (하부섹션 상단에서 40mm 아래)
          // - 상부도어 하단 = 800 - 20 = 780mm (하부섹션 상단에서 20mm 아래)
          // - 도어 사이 갭 = 780 - 760 = 20mm
          const isDoorSplitModule = moduleData?.id?.includes('shelf-split') || moduleData?.id?.includes('pantry-cabinet-split');
          if (isDoorSplitModule) {
            // 실제 가구 H 사용 (internalHeight = 토글 흡수 포함 실측 H)
            const cabinetH = internalHeight ?? moduleData.dimensions.height;
            // 모듈별 사양:
            //  - 도어분절 현관장(shelf-split): 하부섹션 860, 도어 분절 갭 20mm
            //  - 도어분절 팬트리장(pantry-cabinet-split): 하부섹션 1825, 도어 분절 갭 3mm
            const isPantrySplit = moduleData?.id?.includes('pantry-cabinet-split');
            const defaultLowerSectionTopMm = isPantrySplit ? 1825 : 860;
            // customSections가 있으면 첫 섹션의 height를 동적으로 사용 (사용자 섹션 H 변경 반영)
            const customLowerSecH = (customSections && customSections.length > 0)
              ? customSections[0].height
              : undefined;
            const lowerSectionTopMm = (typeof customLowerSecH === 'number' && customLowerSecH > 0)
              ? customLowerSecH
              : defaultLowerSectionTopMm;
            const doorSplitGapMm = isPantrySplit ? 3 : 20;
            // 도어 사이 갭이 하부섹션 외곽 상단을 중심으로 균등 배치
            // 현관장(갭20): 하부도어 상단 = 860-10 = 850? 아닌데 기존 사양 보존 → 갭의 ?
            // 명시 사양 (사용자):
            //   - shelf-split: 하부도어 상단 = 860-40, 상부도어 하단 = 860-20
            //   - pantry-cabinet-split: 갭 3mm → 분절 경계(1825) 중심으로 갭 균등
            const lowerDoorTopMm = isPantrySplit
              ? lowerSectionTopMm - doorSplitGapMm / 2 // 1823.5
              : lowerSectionTopMm - 40; // 820 (현관장 기존 사양 유지)
            const upperDoorBottomMm = isPantrySplit
              ? lowerSectionTopMm + doorSplitGapMm / 2 // 1826.5
              : lowerSectionTopMm - 20; // 840 (현관장 기존 사양 유지)
            const lowerGapBottom = doorBottomGap ?? 0; // 가구 바닥에서 아래로 확장
            const upperGapTop = doorTopGap ?? 0; // 가구 천판에서 위로 확장
            // 하부도어 H = 820 - (-하단갭) = 820 + 하단갭
            const lowerDoorH = lowerDoorTopMm + lowerGapBottom;
            // 하부도어 중심(바닥기준) = (820 + (-하단갭)) / 2 = (820 - 하단갭) / 2
            const lowerDoorCenterFromBottom = (lowerDoorTopMm - lowerGapBottom) / 2;
            const lowerDoorY = lowerDoorCenterFromBottom - cabinetH / 2;
            // 상부도어 H = (가구H + 상단갭) - 840
            const upperDoorH = (cabinetH + upperGapTop) - upperDoorBottomMm;
            // 상부도어 중심(바닥기준) = (840 + 가구H + 상단갭) / 2
            const upperDoorCenterFromBottom = (upperDoorBottomMm + cabinetH + upperGapTop) / 2;
            const upperDoorY = upperDoorCenterFromBottom - cabinetH / 2;
            return (
              <>
                {/* 하부 도어 — 너비 치수 숨김 (분절 가구는 단일 너비 치수만 표시) */}
                <DoorModule
                  key="shelf-split-lower-door"
                  hingeMode={isPantrySplit ? 'lower4' : 'auto'}
                  hideWidthDimension={true}
                  moduleWidth={doorWidth || moduleData.dimensions.width}
                  moduleDepth={baseFurniture.actualDepthMm}
                  hingePosition={hingePosition}
                  spaceInfo={spaceInfo}
                  color={baseFurniture.doorColor}
                  doorXOffset={doorXOffset}
                  originalSlotWidth={originalSlotWidth}
                  slotCenterX={slotCenterX}
                  slotWidths={slotWidths}
                  slotIndex={slotIndex}
                  moduleData={moduleData}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  textureUrl={baseFurniture.textureUrl}
                  panelGrainDirections={baseFurniture.panelGrainDirections}
                  furnitureId={placedFurnitureId}
                  floatHeight={spaceInfo?.baseConfig?.floatHeight}
                  doorTopGap={doorTopGap}
                  doorBottomGap={doorBottomGap}
                  zone={zone}
                  internalHeight={internalHeight}
                  isFreePlacement={isFreePlacement}
                  topFrameThickness={topFrameThickness}
                  hasBase={hasBase}
                  individualFloatHeight={individualFloatHeight}
                  parentGroupY={parentGroupY}
                  forcedDoorHeightMm={lowerDoorH}
                  forcedDoorYMm={lowerDoorY}
                />
                {/* 상부 도어 — 너비 치수 숨김 (하부 도어가 이미 표시) + 경첩 2개 (도어분절 팬트리장 사양) */}
                <DoorModule
                  key="shelf-split-upper-door"
                  hingeMode={isPantrySplit ? 'upper2' : 'auto'}
                  moduleWidth={doorWidth || moduleData.dimensions.width}
                  moduleDepth={baseFurniture.actualDepthMm}
                  hingePosition={hingePosition}
                  spaceInfo={spaceInfo}
                  color={baseFurniture.doorColor}
                  doorXOffset={doorXOffset}
                  originalSlotWidth={originalSlotWidth}
                  slotCenterX={slotCenterX}
                  slotWidths={slotWidths}
                  slotIndex={slotIndex}
                  moduleData={moduleData}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  textureUrl={baseFurniture.textureUrl}
                  panelGrainDirections={baseFurniture.panelGrainDirections}
                  furnitureId={placedFurnitureId}
                  floatHeight={spaceInfo?.baseConfig?.floatHeight}
                  doorTopGap={doorTopGap}
                  doorBottomGap={doorBottomGap}
                  zone={zone}
                  internalHeight={internalHeight}
                  isFreePlacement={isFreePlacement}
                  topFrameThickness={topFrameThickness}
                  hasBase={hasBase}
                  individualFloatHeight={individualFloatHeight}
                  parentGroupY={parentGroupY}
                  forcedDoorHeightMm={upperDoorH}
                  forcedDoorYMm={upperDoorY}
                  hideWidthDimension={true}
                />
              </>
            );
          }
          return (
            <DoorModule
              moduleWidth={doorWidth || moduleData.dimensions.width} // 무시됨
              moduleDepth={baseFurniture.actualDepthMm}
              hingePosition={hingePosition}
              spaceInfo={spaceInfo}
              color={baseFurniture.doorColor}
              doorXOffset={doorXOffset} // FurnitureItem에서 전달받은 오프셋 사용
              originalSlotWidth={originalSlotWidth}
              slotCenterX={slotCenterX}
              slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
              slotIndex={slotIndex} // 슬롯 인덱스 전달
              moduleData={moduleData} // 실제 듀얼캐비넷 분할 정보
              isDragging={isDragging}
              isEditMode={isEditMode}
              textureUrl={baseFurniture.textureUrl} // 텍스처 URL 전달
              panelGrainDirections={baseFurniture.panelGrainDirections} // 결방향 정보 전달
              furnitureId={placedFurnitureId} // 가구 ID 전달
              floatHeight={spaceInfo?.baseConfig?.floatHeight} // 띄움 높이 전달
              doorTopGap={doorTopGap} // 천장에서 도어 상단까지의 갭
              doorBottomGap={doorBottomGap} // 바닥에서 도어 하단까지의 갭
              zone={zone} // 단내림 영역 정보 전달
              internalHeight={internalHeight} // 자유배치 시 실제 가구 높이 전달
              isFreePlacement={isFreePlacement} // 자유배치 모드 전달
              topFrameThickness={topFrameThickness} // 개별 가구 상단몰딩 두께
              hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
            parentGroupY={parentGroupY}
            />
          );
        }
        return null;
      })()}
      
      {/* 간접조명은 UpperCabinetIndirectLight 컴포넌트에서 통합 관리 */}
    </>
  );
};

export default BoxModule; 
