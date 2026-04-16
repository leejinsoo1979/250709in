import React, { useMemo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useSpring, animated } from '@react-spring/three';
import { useFrame, useThree } from '@react-three/fiber';
import { ModuleData } from '@/data/modules/shelving';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import DoorModule from '../DoorModule';
import BoxWithEdges from '../components/BoxWithEdges';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { ExternalDrawerRenderer } from '../ExternalDrawerRenderer';
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings, applyDefaultImageTextureSettings } from '@/editor/shared/utils/materialConstants';
import LegraSideRail from '../components/LegraSideRail';
import { useFurnitureStore } from '@/store/core/furnitureStore';

/**
 * 터치 레그라박스 서랍 + 마이다 (인출 애니메이션 포함)
 * - 도어올림 터치 / 상판내림 터치 전용
 * - 도어 오픈 시 서랍 본체 + 마이다 + 레그라 측판이 함께 Z축으로 슬라이드
 */
interface TouchDrawerAnimatedProps {
  moduleId: string;
  moduleHeightMm: number;
  adjustedHeight: number;
  adjustedWidth?: number;
  basicThickness: number;
  furnitureDepth: number;
  furnitureMaterial: THREE.Material;
  doorMaterial: THREE.Material;
  backPanelThicknessProp?: number;
  renderMode: 'solid' | 'wireframe';
  cabinetYPosition: number;
  placedFurnitureId?: string;
  showFurniture: boolean;
  hasDoor: boolean;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
}

const TouchDrawerAnimated: React.FC<TouchDrawerAnimatedProps> = ({
  moduleId,
  moduleHeightMm,
  adjustedHeight,
  adjustedWidth,
  basicThickness,
  furnitureDepth,
  furnitureMaterial,
  doorMaterial,
  renderMode,
  cabinetYPosition,
  placedFurnitureId,
  showFurniture,
  hasDoor,
  panelGrainDirections,
}) => {
  const { doorsOpen, isIndividualDoorOpen, isInteriorMaterialMode } = useUIStore();
  const { gl } = useThree();

  // 도어 오픈 상태 (ExternalDrawerRenderer와 동일 로직)
  const isDoorOpen = (doorsOpen !== null && !isInteriorMaterialMode)
    ? doorsOpen
    : placedFurnitureId ? isIndividualDoorOpen(placedFurnitureId, 0) : false;

  // 애니메이션 중 렌더링 갱신
  const [isAnimating, setIsAnimating] = useState(false);
  useEffect(() => {
    if (isDoorOpen !== undefined) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [isDoorOpen]);
  useFrame(() => {
    if (isAnimating && gl && 'invalidate' in gl) {
      (gl as any).invalidate();
    }
  });

  const mmToThreeUnits = (mm: number) => mm * 0.01;
  const DRAWER_OPEN_DISTANCE = mmToThreeUnits(300);

  const spring = useSpring({
    z: isDoorOpen ? DRAWER_OPEN_DISTANCE : 0,
    config: { tension: 90, friction: 16, clamp: true },
  });

  const cabinetHeight = adjustedHeight;
  const cabinetBottomY = -cabinetHeight / 2;
  const basicThicknessMm = basicThickness / 0.01;
  const widthMm = adjustedWidth || 0;

  // === 서랍 본체 기하 ===
  const drawerThicknessMm = 15;
  const bottomSideGapMm = 17;
  const backSideGapMm = 18.5;
  const drawerBottomWidthMm = widthMm - basicThicknessMm * 2 - bottomSideGapMm * 2;
  const drawerBackWidthMm = widthMm - basicThicknessMm * 2 - backSideGapMm * 2;
  const drawerDepthMm = 490;
  const drawerBottomWidth = mmToThreeUnits(drawerBottomWidthMm);
  const drawerBackWidth = mmToThreeUnits(drawerBackWidthMm);
  const drawerDepth = mmToThreeUnits(drawerDepthMm);
  const drawerThickness = mmToThreeUnits(drawerThicknessMm);
  const drawerFrontZ = furnitureDepth / 2;
  const drawerZ = drawerFrontZ - drawerDepth / 2;
  const drawerBackZ = drawerFrontZ - drawerDepth + drawerThickness / 2;
  const rebateWidth = mmToThreeUnits(38);
  const rebateHeight = mmToThreeUnits(7.5);

  // 모듈 판별
  const isTouch2A = moduleId.includes('lower-door-lift-touch-2tier-a');
  const isTouch2B = moduleId.includes('lower-door-lift-touch-2tier-b');
  const isTouch3 = moduleId.includes('lower-door-lift-touch-3tier');
  const isTDTouch2 = moduleId.includes('lower-top-down-touch-2tier');
  const isTDTouch3 = moduleId.includes('lower-top-down-touch-3tier');

  // 서랍 스펙
  const drawerSpecs: [number, number][] = isTouch2A ? [[228, 28], [228, 406]]
    : isTouch2B ? [[228, 28], [164, 406]]
    : isTouch3 ? [[228, 28], [117, 357], [117, 587]]
    : isTDTouch2 ? [[228, 28], [228, 356]]
    : isTDTouch3 ? [[164, 28], [117, 280], [117, 493]]
    : [[228, 28], [228, 406]];

  const bottomPanelTopY = cabinetBottomY + mmToThreeUnits(basicThicknessMm);
  const drawers = drawerSpecs.map(([dh, offsetFromBottomPanel], idx) => ({
    height: dh,
    backH: dh - drawerThicknessMm,
    bottomY: bottomPanelTopY + mmToThreeUnits(offsetFromBottomPanel),
    tier: idx + 1
  }));

  // === 마이다 기하 ===
  const moduleWidthMm = adjustedWidth || 0;
  const maidaWidthMm = moduleWidthMm - 3;
  const maidaWidth = mmToThreeUnits(maidaWidthMm);
  const maidaThickness = basicThickness;
  const moduleDepthMm = furnitureDepth / 0.01;
  const maidaZ = mmToThreeUnits((moduleDepthMm + 28) / 2);

  // 마이다 비례: 2B는 2A와 동일하게 [228, 228] 사용 (서랍 본체 높이만 다름)
  const drawerHeights = isTouch2A ? [228, 228]
    : isTouch2B ? [228, 228]
    : isTouch3 ? [228, 117, 117]
    : isTDTouch2 ? [228, 228]
    : isTDTouch3 ? [164, 117, 117]
    : [228, 228];

  const topExtMm = 30;
  const bottomExtMm = 5;
  const totalFrontMm = moduleHeightMm + topExtMm + bottomExtMm;
  const gapMm = 3;
  const drawerCount = drawerHeights.length;
  const totalGaps = (drawerCount - 1) * gapMm;
  const totalMaidaMm = totalFrontMm - totalGaps;
  const totalDrawerH = drawerHeights.reduce((a, b) => a + b, 0);
  // 도어올림 터치 2단(2A/2B): 하→상 [408, 409]
  // 도어올림 터치 3단: 하→상 [360, 227, 227]
  // 상판내림 터치 2단: 하→상 [353, 354]
  // 상판내림 터치 3단: 하→상 [284, 210, 210]
  const isDoorLift2Fixed = drawerCount === 2 && (isTouch2A || isTouch2B);
  const isDoorLift3Fixed = drawerCount === 3 && isTouch3;
  const isTopDown2Fixed = drawerCount === 2 && isTDTouch2;
  const isTopDown3Fixed = drawerCount === 3 && isTDTouch3;
  const maidaHeightsMm = isDoorLift2Fixed
    ? [408, 409]
    : isDoorLift3Fixed
      ? [360, 227, 227]
      : isTopDown2Fixed
        ? [353, 354]
        : isTopDown3Fixed
          ? [284, 210, 210]
          : drawerHeights.map(h => (h / totalDrawerH) * totalMaidaMm);

  let currentBottomMm = -bottomExtMm;
  const maidas = maidaHeightsMm.map((h, idx) => {
    const centerY = cabinetBottomY + mmToThreeUnits(currentBottomMm + h / 2);
    currentBottomMm += h + gapMm;
    return { height: h, centerY, tier: idx + 1 };
  });

  return (
    <animated.group position-z={spring.z}>
      <group position={[0, cabinetYPosition, 0]}>
        {/* 서랍 본체 + 레그라 레일 (showFurniture true일 때만) */}
        {showFurniture && drawers.map((d, i) => (
          <React.Fragment key={`touch-drawer-${i}`}>
            {/* 바닥판 (반턱) */}
            <BoxWithEdges
              args={[drawerBottomWidth, drawerThickness, drawerDepth]}
              position={[0, d.bottomY + drawerThickness / 2, drawerZ]}
              material={furnitureMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName={`터치${d.tier}단서랍 바닥판`}
              furnitureId={placedFurnitureId}
              bottomRebate={{ width: rebateWidth, height: rebateHeight }}
            />
            {/* 뒷판 */}
            <BoxWithEdges
              args={[drawerBackWidth, mmToThreeUnits(d.backH), drawerThickness]}
              position={[0, d.bottomY + drawerThickness + mmToThreeUnits(d.backH) / 2, drawerBackZ]}
              material={furnitureMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName={`터치${d.tier}단서랍 뒷판`}
              furnitureId={placedFurnitureId}
            />
            {/* 레그라 측판 (GLB 모델) */}
            <LegraSideRail
              drawerTier={d.tier}
              drawerBottomY={d.bottomY}
              drawerBottomThickness={drawerThickness}
              backPanelHeight={mmToThreeUnits(d.backH)}
              drawerFrontZ={drawerFrontZ}
              sidePanelInnerX={mmToThreeUnits(widthMm / 2 - basicThicknessMm)}
              drawerHeightMm={d.height}
              renderMode={renderMode}
            />
          </React.Fragment>
        ))}

        {/* 마이다 (hasDoor true일 때만) */}
        {hasDoor && maidas.map((m, i) => (
          <BoxWithEdges
            key={`touch-maida-${i}`}
            args={[maidaWidth, mmToThreeUnits(m.height), maidaThickness]}
            position={[0, m.centerY, maidaZ]}
            material={doorMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName={`터치${m.tier}단서랍(마이다)`}
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />
        ))}
      </group>
    </animated.group>
  );
};

/**
 * 하부장 컴포넌트
 * - 하부장 선반형, 오픈형, 혼합형을 모두 처리
 * - 공통 렌더링 로직 사용
 * - 상부장과 동일한 구조이지만 하부장 높이(1000mm)로 렌더링
 */
const LowerCabinet: React.FC<FurnitureTypeProps> = ({
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
  slotIndex,
  slotCenterX,
  adjustedWidth,
  slotWidths, // 듀얼 가구의 개별 슬롯 너비들
  showFurniture = true,
  lowerSectionTopOffset,
  placedFurnitureId,
  panelGrainDirections,
  backPanelThickness,
  renderMode: renderModeProp,
  zone, // 단내림 영역 정보
  hasBase,
  individualFloatHeight,
  parentGroupY,
  doorTopGap,
  doorBottomGap
}) => {
  console.log('🏠 [LowerCabinet] Props 확인:', {
    moduleId: moduleData.id,
    lowerSectionTopOffset,
    placementType: spaceInfo?.baseConfig?.placementType,
    floatHeight: spaceInfo?.baseConfig?.floatHeight,
    hideTopPanel: !moduleData.id.includes('lower-door-lift-') && !moduleData.id.includes('lower-top-down-'),
    hasSideNotches: (moduleData.id.includes('lower-door-lift-2tier') || moduleData.id.includes('lower-door-lift-3tier') || moduleData.id.includes('lower-drawer-') || moduleData.id.includes('lower-top-down-')) && !moduleData.id.includes('lower-door-lift-touch-'),
  });
  const { renderMode: contextRenderMode, viewMode } = useSpace3DView();
  const renderMode = renderModeProp || contextRenderMode;
  
  // 공통 가구 로직 사용
  const { indirectLightEnabled, indirectLightIntensity, view2DDirection } = useUIStore();
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth,
    backPanelThicknessMm: backPanelThickness
  });

  // 띄워서 배치 여부 확인 (간접조명용)
  const placementType = spaceInfo?.baseConfig?.placementType;
  const isFloating = placementType === 'float';
  const floatHeight = isFloating ? (spaceInfo?.baseConfig?.floatHeight || 0) : 0;
  
  // 2D 모드 체크 - 2D 모드면 간접조명 안 보이게
  const is2DMode = viewMode === '2D' || viewMode !== '3D';
  const showIndirectLight = false;
  
  // 띄움 배치 시에도 캐비넷 높이는 변경하지 않음
  const adjustedHeight = baseFurniture.height;
  
  // 띄움 배치 시 Y 위치는 FurnitureItem에서 처리하므로 여기서는 0
  const cabinetYPosition = 0;
  
  // 간접조명 Y 위치 계산 (가구 바닥 바로 아래)
  const furnitureBottomY = cabinetYPosition - adjustedHeight/2;
  const lightY = furnitureBottomY - 0.5; // 가구 바닥에서 50cm 아래

  // 인조대리석 상판 데이터
  const placedModules = useFurnitureStore(state => state.placedModules);
  const stoneTopData = useMemo(() => {
    if (!placedFurnitureId) return null;
    const pm = placedModules.find(m => m.id === placedFurnitureId);
    if (!pm || !pm.stoneTopThickness || pm.stoneTopThickness <= 0) return null;
    const t = pm.stoneTopThickness;
    const frontOff = (pm.stoneTopFrontOffset || 0) * 0.01; // mm→Three.js
    const backOff = (pm.stoneTopBackOffset || 0) * 0.01;
    const leftOff = (pm.stoneTopLeftOffset || 0) * 0.01;
    const rightOff = (pm.stoneTopRightOffset || 0) * 0.01;
    const furW = adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width;
    const furD = baseFurniture.depth;
    return {
      thickness: t * 0.01,
      width: furW + leftOff + rightOff,
      depth: furD + frontOff + backOff,
      xOffset: (rightOff - leftOff) / 2,
      zOffset: (frontOff - backOff) / 2,
    };
  }, [placedFurnitureId, placedModules, adjustedWidth, baseFurniture.width, baseFurniture.depth]);

  const stoneTopMaterial = useMemo(() => {
    if (!stoneTopData) return null;
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e8e0d4'), // 인조대리석 색상
      metalness: 0.1,
      roughness: 0.3,
    });
  }, [stoneTopData]);

  // 상판내림 반통/한통 L프레임용 도어 재질 (텍스처 로드 포함)
  const doorTextureUrl = spaceInfo?.materialConfig?.doorTexture;
  const doorColorVal = baseFurniture.doorColor || '#E0E0E0';
  const doorMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const lFrameDoorMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(doorColorVal),
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
    });
    doorMaterialRef.current = mat;
    return mat;
  }, []);

  useEffect(() => {
    if (doorMaterialRef.current) {
      if (!doorMaterialRef.current.map) {
        doorMaterialRef.current.color.set(doorColorVal);
      }
      doorMaterialRef.current.needsUpdate = true;
    }
  }, [doorColorVal]);

  useEffect(() => {
    const mat = doorMaterialRef.current;
    if (!mat) return;
    if (doorTextureUrl) {
      if (isOakTexture(doorTextureUrl)) {
        applyOakTextureSettings(mat);
      } else if (isCabinetTexture1(doorTextureUrl)) {
        applyCabinetTexture1Settings(mat);
      }
      const loader = new THREE.TextureLoader();
      loader.load(doorTextureUrl, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        mat.map = texture;
        if (isOakTexture(doorTextureUrl)) {
          applyOakTextureSettings(mat);
        } else if (isCabinetTexture1(doorTextureUrl)) {
          applyCabinetTexture1Settings(mat);
        } else {
          applyDefaultImageTextureSettings(mat);
        }
        mat.needsUpdate = true;
        requestAnimationFrame(() => { mat.needsUpdate = true; });
      });
    } else {
      if (mat.map) {
        mat.map.dispose();
        mat.map = null;
      }
      mat.color.set(doorColorVal);
      mat.toneMapped = true;
      mat.roughness = 0.6;
      mat.needsUpdate = true;
    }
  }, [doorTextureUrl, doorColorVal]);

  return (
    <>
      {/* 간접조명 렌더링 (띄워서 배치 시) */}
      {showIndirectLight && (
        <IndirectLight
          width={adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width} // 조정된 너비 우선 사용 (mm를 Three.js 단위로 변환)
          depth={baseFurniture.depth}
          intensity={indirectLightIntensity || 0.8}
          position={[0, lightY, 0]}
        />
      )}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <>
          <group position={[0, cabinetYPosition, 0]}>
            <BaseFurnitureShell
              {...baseFurniture}
              height={adjustedHeight}
              isDragging={isDragging}
              isEditMode={isEditMode}
              hasBackPanel={hasBackPanel}
              spaceInfo={spaceInfo}
              moduleData={moduleData}
              lowerSectionTopOffsetMm={lowerSectionTopOffset}
              renderMode={renderMode}
              isFloating={isFloating}
              hideVentilationCap={true}
              hideTopPanel={!moduleData.id.includes('lower-door-lift-') && !moduleData.id.includes('lower-top-down-')}
              topPanelFrontReduction={moduleData.id.includes('lower-top-down-') ? 18.5 : 0}
              topStretcher={moduleData.id.includes('lower-top-down-') ? { heightMm: 55, depthMm: 40 } : undefined}
              {...(moduleData.id.includes('lower-door-lift-touch-') ? {
                // 도어올림 터치: 따내기 없음
              } : moduleData.id.includes('lower-top-down-touch-') ? {
                // 상판내림 터치: 상판내림 반통과 동일한 상단 따내기
                sideNotches: [{ y: 65, z: 40, fromBottom: 665 }]
              } : moduleData.id.includes('lower-drawer-3tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 295 }, { y: 65, z: 40, fromBottom: 510 }]
              } : moduleData.id.includes('lower-drawer-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: (moduleData.dimensions.height - 125) / 2 }]
              } : moduleData.id.includes('lower-door-lift-3tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 315 }, { y: 65, z: 40, fromBottom: 545 }]
              } : moduleData.id.includes('lower-door-lift-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 355 }]
              } : moduleData.id.includes('lower-top-down-3tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 225 }, { y: 65, z: 40, fromBottom: 445 }, { y: 65, z: 40, fromBottom: 665 }]
              } : moduleData.id.includes('lower-top-down-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 300 }, { y: 65, z: 40, fromBottom: 665 }]
              } : (moduleData.id.includes('lower-top-down-half') || moduleData.id.includes('dual-lower-top-down-half')) ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 665 }]
              } : {})}>
            {/* 내부 구조는 항상 렌더링 (서랍/선반) */}
            <>
                {/* 듀얼 가구인 경우 좌우 섹션 별도 렌더링 */}
                {baseFurniture.modelConfig.leftSections && baseFurniture.modelConfig.rightSections ? (
                  <>
                    {/* 왼쪽 섹션 - 왼쪽 구획의 중앙에서 왼쪽으로 basicThickness/2만큼 이동 */}
                    <group position={[-(baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2)/2 - baseFurniture.basicThickness/2, 0, 0]}>
                      <SectionsRenderer
                        modelConfig={{ sections: baseFurniture.modelConfig.leftSections }}
                        height={adjustedHeight}
                        innerWidth={baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2}
                        depth={baseFurniture.depth}
                        adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                        basicThickness={baseFurniture.basicThickness}
                        shelfZOffset={baseFurniture.shelfZOffset}
                        material={baseFurniture.material}
                        calculateSectionHeight={baseFurniture.calculateSectionHeight}
                        mmToThreeUnits={baseFurniture.mmToThreeUnits}
                        renderMode={renderMode}
                        furnitureId={moduleData.id}
                        lowerSectionTopOffsetMm={lowerSectionTopOffset}
                        isFloatingPlacement={isFloating}
                      />
                    </group>
                    
                    {/* 중앙 분리대 - BoxWithEdges 사용 */}
                    <BoxWithEdges
                      args={[baseFurniture.basicThickness, adjustedHeight - baseFurniture.basicThickness * 2, baseFurniture.adjustedDepthForShelves]}
                      position={[0, 0, baseFurniture.shelfZOffset]}
                      material={baseFurniture.material}
                      renderMode={renderMode}
                      furnitureId={placedFurnitureId}
                    />
                    
                    {/* 오른쪽 섹션 - 오른쪽 구획의 중앙에서 오른쪽으로 basicThickness/2만큼 이동 */}
                    <group position={[(baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2)/2 + baseFurniture.basicThickness/2, 0, 0]}>
                      <SectionsRenderer
                        modelConfig={{ sections: baseFurniture.modelConfig.rightSections }}
                        height={adjustedHeight}
                        innerWidth={baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2}
                        depth={baseFurniture.depth}
                        adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                        basicThickness={baseFurniture.basicThickness}
                        shelfZOffset={baseFurniture.shelfZOffset}
                        material={baseFurniture.material}
                        calculateSectionHeight={baseFurniture.calculateSectionHeight}
                        mmToThreeUnits={baseFurniture.mmToThreeUnits}
                        renderMode={renderMode}
                        furnitureId={moduleData.id}
                        lowerSectionTopOffsetMm={lowerSectionTopOffset}
                        isFloatingPlacement={isFloating}
                      />
                    </group>
                  </>
                ) : (
                  /* 싱글 가구인 경우 기존 방식 */
                  <SectionsRenderer
                    modelConfig={baseFurniture.modelConfig}
                    height={adjustedHeight}
                    innerWidth={baseFurniture.innerWidth}
                    depth={baseFurniture.depth}
                    adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                    basicThickness={baseFurniture.basicThickness}
                    shelfZOffset={baseFurniture.shelfZOffset}
                    material={baseFurniture.material}
                    furnitureId={moduleData.id}
                    calculateSectionHeight={baseFurniture.calculateSectionHeight}
                    mmToThreeUnits={baseFurniture.mmToThreeUnits}
                    renderMode={renderMode}
                    lowerSectionTopOffsetMm={lowerSectionTopOffset}
                    isFloatingPlacement={isFloating}
                  />
                )}
              </>

          {/* 다보 선반 렌더링 (하부장 반통·한통, 도어올림/상판내림 반통·한통) — 탑뷰에서는 숨김 */}
          {(() => {
            if (viewMode === '2D' && view2DDirection === 'top') return null;
            const moduleId = moduleData.id;
            const isLowerHalf = moduleId.includes('lower-half-cabinet') || moduleId.includes('dual-lower-half-cabinet');
            const isDoorLiftHalf = moduleId.includes('lower-door-lift-half') || moduleId.includes('dual-lower-door-lift-half');
            const isTopDownHalf = moduleId.includes('lower-top-down-half') || moduleId.includes('dual-lower-top-down-half');
            if (!isLowerHalf && !isDoorLiftHalf && !isTopDownHalf) return null;

            const mmToUnits = (mm: number) => mm * 0.01;
            const basicThicknessMm = baseFurniture.basicThickness / 0.01;
            const cabinetHeightMm = adjustedHeight / 0.01;
            const depthMm = baseFurniture.depth / 0.01;
            const backPanelMm = (backPanelThickness || 9);

            let referenceHeightMm: number;
            const hasTopPanel = isDoorLiftHalf || isTopDownHalf;

            if (isTopDownHalf) {
              referenceHeightMm = 665;
            } else if (hasTopPanel) {
              referenceHeightMm = cabinetHeightMm - basicThicknessMm * 2;
            } else {
              referenceHeightMm = cabinetHeightMm - basicThicknessMm;
            }

            const shelfInterval = referenceHeightMm / 3;
            const shelfPositions = [shelfInterval, shelfInterval * 2];

            const shelfThicknessMm = 18;
            const shelfFrontInsetMm = 30; // 앞에서 30mm 들여보냄
            const backReductionMm = backPanelMm + basicThicknessMm - 1; // 26mm (바닥판과 동일)
            const shelfDepthMm = depthMm - backReductionMm - shelfFrontInsetMm;
            const shelfWidth = baseFurniture.innerWidth;
            const shelfDepth = mmToUnits(shelfDepthMm);
            const shelfThickness = mmToUnits(shelfThicknessMm);

            const shelfZ = (mmToUnits(backReductionMm) - mmToUnits(shelfFrontInsetMm)) / 2; // 뒤에서 26mm 줄이고 앞에서 30mm 들여보냄

            const cabinetBottomY = -adjustedHeight / 2;
            const bottomPanelTopY = cabinetBottomY + baseFurniture.basicThickness;

            return shelfPositions.map((posFromBottom, idx) => (
              <BoxWithEdges
                key={`dowel-shelf-${idx}`}
                args={[shelfWidth, shelfThickness, shelfDepth]}
                position={[0, bottomPanelTopY + mmToUnits(posFromBottom), shelfZ]}
                material={baseFurniture.material}
                renderMode={renderMode}
                isHighlighted={false}
                panelName={`다보선반(${idx + 1})`}
                furnitureId={placedFurnitureId}
              />
            ));
          })()}

          </BaseFurnitureShell>

          {/* 하부장 상판 마감재 제거 - 하부모듈에는 상판 없음 */}
          </group>
        </>
      )}
      
      {/* 외부서랍 렌더링 (하부 서랍장 전용) */}
      {showFurniture && !moduleData.id.includes('lower-door-lift-touch-') && !moduleData.id.includes('lower-top-down-touch-') && (moduleData.id.includes('lower-drawer-') || moduleData.id.includes('lower-door-lift-2tier') || moduleData.id.includes('lower-door-lift-3tier') || moduleData.id.includes('lower-top-down-2tier') || moduleData.id.includes('lower-top-down-3tier')) && (() => {
        const is3Tier = moduleData.id.includes('lower-drawer-3tier');
        const isDoorLift3Tier = moduleData.id.includes('lower-door-lift-3tier');
        const isDoorLift2Tier = moduleData.id.includes('lower-door-lift-2tier');
        const isTopDown3Tier = moduleData.id.includes('lower-top-down-3tier');
        const isTopDown2Tier = moduleData.id.includes('lower-top-down-2tier');
        // 기존 서랍장: 상단 따내기 60mm 있음. 2단 fromBottom=330(균등), 3단 fromBottom=295+510
        // 도어올림 3단: fromBottom=315, 545 (1단=315, 따내기65, 2단=165, 따내기65, 3단=175)
        // 도어올림 2단: fromBottom=355
        // 상판내림 3단: fromBottom=225, 445, 665 (1단=225, 따내기65, 2단=155, 따내기65, 3단=155, 따내기65, 상단55)
        // 상판내림 2단: fromBottom=300, 665 (1단=300, 따내기65, 2단=300, 따내기65, 상단55)
        const drawer2TierFromBottom = (moduleData.dimensions.height - 125) / 2;
        const notchFromBottoms = is3Tier ? [295, 510] : isDoorLift3Tier ? [315, 545] : isDoorLift2Tier ? [355] : isTopDown3Tier ? [225, 445, 665] : isTopDown2Tier ? [300, 665] : [drawer2TierFromBottom];
        const notchHeights = is3Tier ? [65, 65] : isDoorLift3Tier ? [65, 65] : isDoorLift2Tier ? [65] : isTopDown3Tier ? [65, 65, 65] : isTopDown2Tier ? [65, 65] : [65];
        const drawerCount = (is3Tier || isDoorLift3Tier || isTopDown3Tier) ? 3 : 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            <ExternalDrawerRenderer
              drawerCount={drawerCount}
              moduleWidth={adjustedWidth || moduleData.dimensions.width}
              innerWidth={baseFurniture.innerWidth}
              height={adjustedHeight}
              depth={baseFurniture.depth}
              basicThickness={baseFurniture.basicThickness}
              moduleDepthMm={baseFurniture.actualDepthMm}
              material={baseFurniture.material}
              renderMode={renderMode}
              isHighlighted={false}
              textureUrl={spaceInfo?.materialConfig?.texture}
              doorTextureUrl={spaceInfo?.materialConfig?.doorTexture}
              doorColor={baseFurniture.doorColor}
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
              showMaida={hasDoor}
              notchFromBottoms={notchFromBottoms}
              notchHeights={notchHeights}
              isEditMode={isEditMode}
              hideTopNotch={isDoorLift2Tier || isDoorLift3Tier || isTopDown2Tier || isTopDown3Tier}
              maidaHeightsMm={isDoorLift2Tier ? [400, 400] : isDoorLift3Tier ? [360, 210, 210] : undefined}
              sideHeightOverrides={isTopDown2Tier ? { all: 240 } : isTopDown3Tier ? { first: 180, rest: 130 } : undefined}
              doorTopGap={doorTopGap}
              doorBottomGap={doorBottomGap}
              defaultDoorTopGap={isTopDown2Tier || isTopDown3Tier ? -80 : isDoorLift2Tier || isDoorLift3Tier ? 30 : -20}
              defaultDoorBottomGap={5}
            />
          </group>
        );
      })()}

      {/* 상판내림 반통/한통: L자 프레임만 렌더링 (서랍 없음, 도어는 별도) — 하부프레임 OFF 시 숨김 */}
      {showFurniture && hasBase !== false && (moduleData.id.includes('lower-top-down-half') || moduleData.id.includes('dual-lower-top-down-half') || moduleData.id.includes('lower-top-down-touch-') || moduleData.id.includes('dual-lower-top-down-touch-')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const notch = { fromBottom: 665, height: 65 };
        const basicThicknessMm = baseFurniture.basicThickness / 0.01;
        const frameWidth = mmToThreeUnits(adjustedWidth || moduleData.dimensions.width);
        const verticalHMm = notch.height - basicThicknessMm;
        const cabinetBottomY = -adjustedHeight / 2;
        const horzY = cabinetBottomY + mmToThreeUnits(notch.fromBottom) + baseFurniture.basicThickness / 2;
        const horzZ = baseFurniture.depth / 2 - mmToThreeUnits(40) / 2;
        const vertY = cabinetBottomY + mmToThreeUnits(notch.fromBottom) + baseFurniture.basicThickness + mmToThreeUnits(verticalHMm) / 2;
        const vertZ = baseFurniture.depth / 2 - mmToThreeUnits(40) + baseFurniture.basicThickness / 2;

        return (
          <group position={[0, 0, 0]}>
            <BoxWithEdges
              args={[frameWidth, baseFurniture.basicThickness, mmToThreeUnits(40)]}
              position={[0, horzY, horzZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수평(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
            <BoxWithEdges
              args={[frameWidth, mmToThreeUnits(verticalHMm), baseFurniture.basicThickness]}
              position={[0, vertY, vertZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수직(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 기본하부장/싱크장/인덕션장 반통/한통: 상단 따내기 L자 프레임 렌더링 — 하부프레임 OFF 시 숨김 */}
      {showFurniture && hasBase !== false && (moduleData.id.includes('lower-half-cabinet') || moduleData.id.includes('dual-lower-half-cabinet') || moduleData.id.includes('lower-sink-cabinet') || moduleData.id.includes('dual-lower-sink-cabinet') || moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const cabinetHeight = adjustedHeight;
        const notchHeightMm = 60;
        const notchFromBottomMm = (moduleData.dimensions.height || 785) - notchHeightMm;
        const basicThicknessMm = baseFurniture.basicThickness / 0.01;
        const frameWidth = mmToThreeUnits(adjustedWidth || moduleData.dimensions.width);
        const verticalHMm = notchHeightMm - basicThicknessMm;
        const cabinetBottomY = -cabinetHeight / 2;
        const horzY = cabinetBottomY + mmToThreeUnits(notchFromBottomMm) + baseFurniture.basicThickness / 2;
        const horzZ = baseFurniture.depth / 2 - mmToThreeUnits(40) / 2;
        const vertY = cabinetBottomY + mmToThreeUnits(notchFromBottomMm) + baseFurniture.basicThickness + mmToThreeUnits(verticalHMm) / 2;
        const vertZ = baseFurniture.depth / 2 - mmToThreeUnits(40) + baseFurniture.basicThickness / 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            <BoxWithEdges
              args={[frameWidth, baseFurniture.basicThickness, mmToThreeUnits(40)]}
              position={[0, horzY, horzZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수평(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
            <BoxWithEdges
              args={[frameWidth, mmToThreeUnits(verticalHMm), baseFurniture.basicThickness]}
              position={[0, vertY, vertZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수직(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 싱크장/인덕션장 전대 렌더링 — 상단 따내기 아래 높이 150mm — 하부프레임 OFF 시 숨김 */}
      {showFurniture && hasBase !== false && (moduleData.id.includes('lower-sink-cabinet') || moduleData.id.includes('dual-lower-sink-cabinet') || moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const cabinetHeight = adjustedHeight;
        const cabinetBottomY = -cabinetHeight / 2;
        const apronHeightMm = 150;
        const notchHeightMm = 60;
        const notchFromBottomMm = (moduleData.dimensions.height || 785) - notchHeightMm;
        // 전대 상단 = 따내기 시작점(notchFromBottomMm), 전대 하단 = notchFromBottomMm - apronHeightMm
        const apronCenterY = cabinetBottomY + mmToThreeUnits(notchFromBottomMm - apronHeightMm / 2);
        const apronWidth = baseFurniture.innerWidth; // 내경 (전체폭 - 측판두께×2)
        const apronHeight = mmToThreeUnits(apronHeightMm);
        const apronThickness = baseFurniture.basicThickness; // 18mm
        // 전대는 캐비넷 앞면에 위치
        const apronZ = baseFurniture.depth / 2 - apronThickness / 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            <BoxWithEdges
              args={[apronWidth, apronHeight, apronThickness]}
              position={[0, apronCenterY, apronZ]}
              material={baseFurniture.material}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="전대"
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 인덕션장 블럼 레그라박스 서랍 렌더링 (바닥판 + 뒷판만, 측판 없음) */}
      {showFurniture && (moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const cabinetHeight = adjustedHeight;
        const cabinetBottomY = -cabinetHeight / 2;
        const basicThicknessMm = baseFurniture.basicThickness / 0.01; // 18mm
        const depthMm = baseFurniture.depth / 0.01;
        const backPanelMm = backPanelThickness || 9;
        const drawerThicknessMm = 15; // 서랍재 두께
        const bottomSideGapMm = 17; // 바닥판: 양쪽 17mm 갭
        const backSideGapMm = 18.5; // 뒷판: 양쪽 18.5mm 갭
        const widthMm = adjustedWidth || moduleData.dimensions.width;
        const drawerBottomWidthMm = widthMm - basicThicknessMm * 2 - bottomSideGapMm * 2;
        const drawerBackWidthMm = widthMm - basicThicknessMm * 2 - backSideGapMm * 2;
        const drawerDepthMm = 490; // 레그라박스 서랍 바닥판 깊이 고정
        // 1단 서랍: 총 높이 228mm, 바닥판(18) + 갭(28) = 46mm에서 시작
        const bottomGapMm = 28;
        const drawer1BottomY = cabinetBottomY + mmToThreeUnits(basicThicknessMm + bottomGapMm);
        const drawer1TotalH = 228;
        const drawer1BackH = drawer1TotalH - drawerThicknessMm; // 뒷판 높이 = 228 - 15 = 213mm

        // 2단 서랍: 바닥판 위 기준 338mm에서 시작
        // cabinetBottomY는 바닥판 하단 기준이므로 +바닥판 두께 필요
        const drawer2FromBottomPanelTopMm = 338; // 바닥판 위에서 338mm
        const drawer2BottomY = cabinetBottomY + mmToThreeUnits(drawer2FromBottomPanelTopMm + basicThicknessMm);
        const drawer2TotalH = 164;
        const drawer2BackH = drawer2TotalH - drawerThicknessMm; // 뒷판 높이 = 164 - 15 = 149mm

        const drawerBottomWidth = mmToThreeUnits(drawerBottomWidthMm);
        const drawerBackWidth = mmToThreeUnits(drawerBackWidthMm);
        const drawerDepth = mmToThreeUnits(drawerDepthMm);
        const drawerThickness = mmToThreeUnits(drawerThicknessMm);
        // 서랍 바닥판 Z: 캐비넷 앞면에서 시작하여 뒤로 490mm
        const drawerFrontZ = baseFurniture.depth / 2;
        const drawerZ = drawerFrontZ - drawerDepth / 2;
        // 서랍 뒷판 Z: 바닥판 뒤쪽 끝에 위치
        const drawerBackZ = drawerFrontZ - drawerDepth + drawerThickness / 2;

        // 반턱 따내기: 양쪽 하단 안쪽 38mm, 위로 7.5mm (단일 메시)
        const rebateWidth = mmToThreeUnits(38);
        const rebateHeight = mmToThreeUnits(7.5);

        return (
          <group position={[0, cabinetYPosition, 0]}>
            {/* 1단 서랍 바닥판 (반턱 단일 메시) */}
            <BoxWithEdges
              args={[drawerBottomWidth, drawerThickness, drawerDepth]}
              position={[0, drawer1BottomY + drawerThickness / 2, drawerZ]}
              material={baseFurniture.material}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="인덕션 1단서랍 바닥판"
              furnitureId={placedFurnitureId}
              bottomRebate={{ width: rebateWidth, height: rebateHeight }}
            />
            {/* 1단 서랍 뒷판 */}
            <BoxWithEdges
              args={[drawerBackWidth, mmToThreeUnits(drawer1BackH), drawerThickness]}
              position={[0, drawer1BottomY + drawerThickness + mmToThreeUnits(drawer1BackH) / 2, drawerBackZ]}
              material={baseFurniture.material}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="인덕션 1단서랍 뒷판"
              furnitureId={placedFurnitureId}
            />
            {/* 2단 서랍 바닥판 (반턱 단일 메시) */}
            <BoxWithEdges
              args={[drawerBottomWidth, drawerThickness, drawerDepth]}
              position={[0, drawer2BottomY + drawerThickness / 2, drawerZ]}
              material={baseFurniture.material}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="인덕션 2단서랍 바닥판"
              furnitureId={placedFurnitureId}
              bottomRebate={{ width: rebateWidth, height: rebateHeight }}
            />
            {/* 2단 서랍 뒷판 */}
            <BoxWithEdges
              args={[drawerBackWidth, mmToThreeUnits(drawer2BackH), drawerThickness]}
              position={[0, drawer2BottomY + drawerThickness + mmToThreeUnits(drawer2BackH) / 2, drawerBackZ]}
              material={baseFurniture.material}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="인덕션 2단서랍 뒷판"
              furnitureId={placedFurnitureId}
            />
            {/* 1단 서랍 레그라 측판 (GLB 모델) */}
            <LegraSideRail
              drawerTier={1}
              drawerBottomY={drawer1BottomY}
              drawerBottomThickness={drawerThickness}
              backPanelHeight={mmToThreeUnits(drawer1BackH)}
              drawerFrontZ={drawerFrontZ}
              sidePanelInnerX={mmToThreeUnits(widthMm / 2 - basicThicknessMm)}
              renderMode={renderMode}
            />
            {/* 2단 서랍 레그라 측판 (GLB 모델) */}
            <LegraSideRail
              drawerTier={2}
              drawerBottomY={drawer2BottomY}
              drawerBottomThickness={drawerThickness}
              backPanelHeight={mmToThreeUnits(drawer2BackH)}
              drawerFrontZ={drawerFrontZ}
              sidePanelInnerX={mmToThreeUnits(widthMm / 2 - basicThicknessMm)}
              renderMode={renderMode}
            />
          </group>
        );
      })()}

      {/* 인덕션장 마이다 렌더링 (도어 대신 마이다 2개) */}
      {hasDoor && (moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const cabinetHeight = adjustedHeight;
        const cabinetBottomY = -cabinetHeight / 2;
        const moduleWidthMm = adjustedWidth || moduleData.dimensions.width;
        const maidaWidthMm = moduleWidthMm - 3; // 좌우 1.5mm씩 갭
        const maidaWidth = mmToThreeUnits(maidaWidthMm);
        const maidaThickness = baseFurniture.basicThickness; // 마이다 두께 = 도어 두께 (18mm)
        const moduleDepthMm = baseFurniture.depth / 0.01;
        const maidaZ = mmToThreeUnits((moduleDepthMm + 28) / 2); // ExternalDrawerRenderer와 동일 위치

        // doorTopGap/doorBottomGap 반영 (ExternalDrawerRenderer와 동일 방식)
        const defaultDTG = -20;
        const defaultDBG = 5;
        const gapTopExt = (doorTopGap ?? defaultDTG) - defaultDTG;   // 2단(최상단) 마이다 상단 확장
        const gapBottomExt = (doorBottomGap ?? defaultDBG) - defaultDBG; // 1단(최하단) 마이다 하단 확장

        // 1단 마이다: 기본 340mm, 바닥 -5mm (doorBottomGap으로 하단 위치/높이 조정)
        const maida1HeightMm = 340 + gapBottomExt;
        const maida1BottomMm = -5 - gapBottomExt;
        const maida1CenterY = cabinetBottomY + mmToThreeUnits(maida1BottomMm) + mmToThreeUnits(maida1HeightMm) / 2;

        // 2단 마이다: 기본 427mm (doorTopGap으로 상단 높이 조정)
        const maida2HeightMm = 427 + gapTopExt;
        const gapMm = 3;
        const maida2BottomMm = -5 + 340 + gapMm; // 바닥 위치는 1단 기본 상단 기준
        const maida2CenterY = cabinetBottomY + mmToThreeUnits(maida2BottomMm) + mmToThreeUnits(maida2HeightMm) / 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            {/* 1단 서랍 마이다 */}
            <BoxWithEdges
              args={[maidaWidth, mmToThreeUnits(maida1HeightMm), maidaThickness]}
              position={[0, maida1CenterY, maidaZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="인덕션 1단서랍(마이다)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
            {/* 2단 서랍 마이다 */}
            <BoxWithEdges
              args={[maidaWidth, mmToThreeUnits(maida2HeightMm), maidaThickness]}
              position={[0, maida2CenterY, maidaZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="인덕션 2단서랍(마이다)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 터치 레그라박스 서랍 + 마이다 (도어올림 터치 + 상판내림 터치) — 인출 애니메이션 포함 */}
      {(moduleData.id.includes('lower-door-lift-touch-') || moduleData.id.includes('lower-top-down-touch-')) && (showFurniture || hasDoor) && (
        <TouchDrawerAnimated
          moduleId={moduleData.id}
          moduleHeightMm={moduleData.dimensions.height || 785}
          adjustedHeight={adjustedHeight}
          adjustedWidth={adjustedWidth || moduleData.dimensions.width}
          basicThickness={baseFurniture.basicThickness}
          furnitureDepth={baseFurniture.depth}
          furnitureMaterial={baseFurniture.material}
          doorMaterial={lFrameDoorMaterial}
          backPanelThicknessProp={backPanelThickness}
          renderMode={renderMode}
          cabinetYPosition={cabinetYPosition}
          placedFurnitureId={placedFurnitureId}
          showFurniture={showFurniture}
          hasDoor={hasDoor}
          panelGrainDirections={panelGrainDirections}
        />
      )}

      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {/* 단, 서랍장(lower-drawer-*)은 도어가 아닌 서랍이 달리므로 도어 렌더링 차단 */}
      {hasDoor && spaceInfo && !moduleData.id.includes('lower-drawer-') && !moduleData.id.includes('lower-door-lift-2tier') && !moduleData.id.includes('lower-door-lift-3tier') && !moduleData.id.includes('lower-door-lift-touch-') && !moduleData.id.includes('lower-top-down-2tier') && !moduleData.id.includes('lower-top-down-3tier') && !moduleData.id.includes('lower-top-down-touch-') && !moduleData.id.includes('lower-induction-cabinet') && !moduleData.id.includes('dual-lower-induction-cabinet') && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX}
          moduleData={moduleData}
          isDragging={isDragging}
          isEditMode={isEditMode}
          slotWidths={slotWidths}
          slotIndex={slotIndex}
          floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? floatHeight : 0}
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
          zone={zone}
          hasBase={hasBase}
          individualFloatHeight={individualFloatHeight}
          parentGroupY={parentGroupY}
          doorTopGap={doorTopGap}
          doorBottomGap={doorBottomGap}
        />
      )}

      {/* 인조대리석 상판 */}
      {showFurniture && stoneTopData && stoneTopMaterial && (
        <mesh
          position={[
            stoneTopData.xOffset,
            cabinetYPosition + adjustedHeight / 2 + stoneTopData.thickness / 2,
            stoneTopData.zOffset
          ]}
          material={stoneTopMaterial}
        >
          <boxGeometry args={[stoneTopData.width, stoneTopData.thickness, stoneTopData.depth]} />
        </mesh>
      )}

      {/* 조절발통 (네 모서리) - 키큰장과 동일하게 처리 */}
      {showFurniture && !(lowerSectionTopOffset && lowerSectionTopOffset > 0) && (
        <AdjustableFootsRenderer
          width={adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width}
          depth={baseFurniture.depth}
          yOffset={-adjustedHeight / 2}
          placedFurnitureId={placedFurnitureId}
          renderMode={renderMode}
          isHighlighted={false}
          isFloating={isFloating}
          baseHeight={spaceInfo?.baseConfig?.height || 65}
          baseDepth={spaceInfo?.baseConfig?.depth || 0}
          frontZInset={65}
          viewMode={viewMode}
          view2DDirection={useUIStore.getState().view2DDirection}
        />
      )}
    </>
  );
};

export default LowerCabinet;
