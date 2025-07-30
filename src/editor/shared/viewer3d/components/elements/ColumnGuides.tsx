import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Line, Text } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useTheme } from '@/contexts/ThemeContext';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../utils/geometry';
import ColumnDropTarget from './ColumnDropTarget';

/**
 * 컬럼 인덱스 가이드 라인 컴포넌트
 * step0 이후로는 모든 step에서 configurator로 통일 처리
 */
const ColumnGuides: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { viewMode, showDimensions, view2DDirection, activeDroppedCeilingTab, setActiveDroppedCeilingTab, view2DTheme } = useUIStore();
  const { theme } = useTheme();
  
  // UIStore의 activeDroppedCeilingTab을 직접 사용하고, 필요시 업데이트만 수행
  useEffect(() => {
    // 디버깅 로그
    console.log('🔍 현재 activeDroppedCeilingTab:', activeDroppedCeilingTab);
  }, [activeDroppedCeilingTab]);
  
  // 단내림 정보 먼저 계산
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;
  
  // 내경 공간 계산 (바닥, 천장 높이 등)
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // 전체 공간의 인덱싱 계산 (단내림 포함)
  const indexing = calculateSpaceIndexing(spaceInfo);
  const { columnCount, threeUnitBoundaries } = indexing;
  
  
  // 단내림 영역의 전체 높이 (외경)
  const droppedTotalHeight = hasDroppedCeiling && spaceInfo.droppedCeiling 
    ? spaceInfo.height - spaceInfo.droppedCeiling.dropHeight 
    : spaceInfo.height;
    
  // 단내림 영역의 내부 높이 계산 (바닥마감, 받침대, 상부프레임 제외)
  const calculateDroppedInternalHeight = () => {
    if (!hasDroppedCeiling) return internalSpace.height;
    
    // 바닥 마감 높이
    const floorFinishHeight = spaceInfo.hasFloorFinish && spaceInfo.floorFinish 
      ? spaceInfo.floorFinish.height 
      : 0;
    
    // 받침대(하단 프레임) 높이
    const baseFrameHeight = spaceInfo.baseConfig?.height || 0;
    
    // 상단 프레임 높이
    const topFrameHeight = spaceInfo.frameSize?.top || 0;
    
    // 단내림 영역의 내부 높이 = 단내림 전체 높이 - 바닥마감 - 받침대 높이 - 상부프레임 높이
    return droppedTotalHeight - floorFinishHeight - baseFrameHeight - topFrameHeight;
  };
  
  const droppedInternalHeight = calculateDroppedInternalHeight();
  const droppedWidth = hasDroppedCeiling && spaceInfo.droppedCeiling 
    ? spaceInfo.droppedCeiling.width 
    : 0;
  const isLeftDropped = spaceInfo.droppedCeiling?.position === 'left';
  
  // 상부프레임 높이 (중복 선언 제거 - calculateDroppedInternalHeight에서 이미 계산됨)
  const topFrameHeight = spaceInfo.frameSize?.top || 0;
  
  // 디버깅 로그 추가
  console.log('🏗️ 단내림 정보:', {
    hasDroppedCeiling,
    droppedTotalHeight,
    droppedInternalHeight,
    'internalSpace.height': internalSpace.height,
    'internalSpace.startY': internalSpace.startY,
    'spaceInfo.height': spaceInfo.height,
    'spaceInfo.droppedCeiling?.dropHeight': spaceInfo.droppedCeiling?.dropHeight,
    topFrameHeight,
    '계산된 droppedInternalHeight': droppedInternalHeight,
    '예상 천장 위치 (droppedTotalHeight - topFrameHeight)': droppedTotalHeight - topFrameHeight,
    droppedWidth,
    isLeftDropped
  });
  
  // 영역별 슬롯 정보 계산
  const zoneSlotInfo = React.useMemo(() => {
    return ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
  }, [spaceInfo, spaceInfo.customColumnCount, spaceInfo.mainDoorCount, spaceInfo.droppedCeilingDoorCount]);
  
  // 디버깅 로그 추가
  React.useEffect(() => {
    console.log('🎯 ColumnGuides - 슬롯 정보 업데이트:', {
      customColumnCount: spaceInfo.customColumnCount,
      mainDoorCount: spaceInfo.mainDoorCount,
      droppedCeilingDoorCount: spaceInfo.droppedCeilingDoorCount,
      hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled,
      zoneSlotInfo: {
        normal: zoneSlotInfo.normal ? {
          columnCount: zoneSlotInfo.normal.columnCount,
          columnWidth: zoneSlotInfo.normal.columnWidth,
          width: zoneSlotInfo.normal.width
        } : null,
        dropped: zoneSlotInfo.dropped ? {
          columnCount: zoneSlotInfo.dropped.columnCount,
          columnWidth: zoneSlotInfo.dropped.columnWidth,
          width: zoneSlotInfo.dropped.width
        } : null
      }
    });
  }, [spaceInfo.customColumnCount, spaceInfo.mainDoorCount, spaceInfo.droppedCeilingDoorCount, spaceInfo.droppedCeiling, zoneSlotInfo]);
  
  // 1개 컬럼인 경우 가이드 표시 불필요 (단내림 활성화 시에는 표시)
  if (columnCount <= 1 && !hasDroppedCeiling) return null;
  
  // 2D 뷰에서는 모든 방향에서 표시 (4분할창 지원)
  // if (viewMode === '2D' && view2DDirection !== 'front' && view2DDirection !== 'top') {
  //   return null;
  // }
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 띄워서 배치인지 확인
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  
  // 내경 공간의 시작 높이 계산 (바닥 마감재 + 하단 프레임 높이)
  const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const baseFrameHeightMm = spaceInfo.baseConfig?.height || 0;
  const furnitureStartY = (floorFinishHeightMm + baseFrameHeightMm) * 0.01; // mm → Three.js 단위 변환
  
  // CSS 변수에서 실제 테마 색상 가져오기
  const getThemeColorFromCSS = (variableName: string, fallback: string) => {
    if (typeof window !== 'undefined') {
      const computedColor = getComputedStyle(document.documentElement)
        .getPropertyValue(variableName).trim();
      return computedColor || fallback;
    }
    return fallback;
  };

  // 테마 기반 가이드 라인 색상 - 2D/3D 모두 동일한 색상 사용
  const primaryColor = getThemeColorFromCSS('--theme-primary', '#10b981');
  const guideColor = primaryColor; // 2D 모드에서도 투명도 없이
  const lineWidth = viewMode === '2D' ? 0.5 : 1; // 2D 모드: 더 얇은 선
  const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;
  
  // 바닥과 천장 높이 (Three.js 단위) - 띄움 높이 적용
  const floorY = mmToThreeUnits(internalSpace.startY) + floatHeight;
  const ceilingY = mmToThreeUnits(internalSpace.startY) + mmToThreeUnits(internalSpace.height);
  
  // 단내림 천장 높이: 바닥(0)에서 단내림 전체 높이 - 상부프레임 높이
  // 이것이 상부프레임의 하단 위치입니다
  const droppedCeilingY = hasDroppedCeiling 
    ? mmToThreeUnits(droppedTotalHeight - topFrameHeight) 
    : ceilingY;
  
  // 디버깅: 높이 계산 확인
  console.log('📏 높이 계산:', {
    '전체 높이 (mm)': spaceInfo.height,
    '단차 (mm)': spaceInfo.droppedCeiling?.dropHeight,
    '단내림 전체 높이 (mm)': droppedTotalHeight,
    '상부프레임 (mm)': topFrameHeight,
    '단내림 천장 위치 (mm)': droppedTotalHeight - topFrameHeight,
    'Three.js 단위': {
      floorY,
      ceilingY,
      droppedCeilingY,
      furnitureStartY
    }
  });
  
  // 단내림 경계 X 좌표 계산
  let droppedBoundaryX = null;
  if (hasDroppedCeiling) {
    if (isLeftDropped) {
      droppedBoundaryX = threeUnitBoundaries[0] + mmToThreeUnits(droppedWidth);
    } else {
      droppedBoundaryX = threeUnitBoundaries[threeUnitBoundaries.length - 1] - mmToThreeUnits(droppedWidth);
    }
  }
  
  // Room.tsx와 동일한 계산 사용하여 바닥 슬롯 메쉬와 일치시킴
  const backZ = -mmToThreeUnits(internalSpace.depth / 2); // 내경의 뒤쪽 좌표
  
  // 가구 깊이 및 위치 계산 (Room.tsx와 동일)
  const panelDepthMm = spaceInfo.depth || 1500;
  const furnitureDepthMm = 600; // 가구 깊이 고정값
  const zOffset = -mmToThreeUnits(panelDepthMm) / 2;
  const furnitureZOffset = zOffset + (mmToThreeUnits(panelDepthMm) - mmToThreeUnits(furnitureDepthMm)) / 2;
  const frameEndZ = furnitureZOffset + mmToThreeUnits(furnitureDepthMm) / 2;
  
  // 바닥 슬롯 메쉬와 동일한 앞쪽 좌표
  const frontZ = frameEndZ;
  
  // 슬롯 가이드 렌더링 헬퍼 함수
  const renderSlotGuides = (
    startX: number,
    width: number,
    columnCount: number,
    columnWidth: number,
    ceilingY: number,
    zoneType: string
  ) => {
    console.log('📐 renderSlotGuides 호출됨:', {
      zoneType,
      startX,
      width,
      endX: startX + width,
      columnCount,
      columnWidth,
      ceilingY,
      floorY,
      backZ,
      frontZ,
      'spaceInfo.mainDoorCount': spaceInfo.mainDoorCount,
      'spaceInfo.customColumnCount': spaceInfo.customColumnCount
    });
    
    const guides = [];
    
    // 활성 탭에 따른 강조 여부 결정
    const isActiveZone = (zoneType === 'main' && activeDroppedCeilingTab === 'main') ||
                        (zoneType === 'dropped' && activeDroppedCeilingTab === 'dropped') ||
                        (!hasDroppedCeiling); // 단내림이 없으면 항상 활성
    
    // 영역별 색상 및 선 굵기 설정
    const zoneColor = isActiveZone ? guideColor : (viewMode === '2D' && view2DTheme === 'dark' ? '#666666' : '#999999'); // 다크모드에서 밝은 회색
    const zoneLineWidth = isActiveZone ? lineWidth * 2 : lineWidth; // 활성 영역만 굵게
    const zoneOpacity = isActiveZone ? 1 : 0.6; // 비활성 영역은 60% 투명도
    
    // 각 슬롯 경계 계산
    const boundaries = [];
    for (let i = 0; i <= columnCount; i++) {
      boundaries.push(mmToThreeUnits(startX + (i * columnWidth)));
    }
    
    // 슬롯 중심 위치 계산
    const positions = [];
    for (let i = 0; i < columnCount; i++) {
      positions.push(mmToThreeUnits(startX + (i * columnWidth) + (columnWidth / 2)));
    }
    
    // 경계 확인 로그
    console.log(`📏 ${zoneType} 영역 경계:`, {
      startX_mm: startX,
      endX_mm: startX + width,
      width_mm: width,
      boundaries_three: [boundaries[0], boundaries[boundaries.length - 1]],
      expectedEndX_three: mmToThreeUnits(startX + width),
      actualEndX_three: boundaries[boundaries.length - 1]
    });
    
    // 내경 공간의 실제 경계 계산
    const internalStartX = mmToThreeUnits(internalSpace.startX);
    const internalEndX = mmToThreeUnits(internalSpace.startX + internalSpace.width);
    
    // 바닥과 천장 수평 가이드
    if (boundaries.length >= 2) {
      // 영역별 경계 설정 - 정확한 영역 시작과 끝 사용
      const zoneStartX = mmToThreeUnits(startX);
      const zoneEndX = mmToThreeUnits(startX + width);
      
      // 2D 정면 뷰에서는 내경 범위 내에서만 표시
      const startBoundaryX = viewMode === '2D' && view2DDirection === 'front' 
        ? Math.max(zoneStartX, internalStartX) 
        : zoneStartX;
      const endBoundaryX = viewMode === '2D' && view2DDirection === 'front' 
        ? Math.min(zoneEndX, internalEndX) 
        : zoneEndX;
      
      // 바닥 가이드
      guides.push(
        <Line
          key={`${zoneType}-floor-horizontal`}
          points={[
            new THREE.Vector3(startBoundaryX, floorY, backZ),
            new THREE.Vector3(endBoundaryX, floorY, backZ)
          ]}
          color={zoneColor}
          lineWidth={zoneLineWidth}
          dashed
          dashSize={0.2}
          gapSize={0.1}
          opacity={zoneOpacity}
          transparent
        />
      );
      
      // 천장 가이드
      guides.push(
        <Line
          key={`${zoneType}-ceiling-horizontal`}
          points={[
            new THREE.Vector3(startBoundaryX, ceilingY, backZ),
            new THREE.Vector3(endBoundaryX, ceilingY, backZ)
          ]}
          color={zoneColor}
          lineWidth={zoneLineWidth}
          dashed
          dashSize={0.2}
          gapSize={0.1}
          opacity={zoneOpacity}
          transparent
        />
      );
    }
    
    // 각 슬롯 경계의 수직 가이드
    boundaries.forEach((xPos, index) => {
      // 모든 경계선을 표시 (스킵 조건 제거)
      
      // 2D 상부뷰에서는 수평선으로 표시
      if (viewMode === '2D' && view2DDirection === 'top') {
        guides.push(
          <Line
            key={`${zoneType}-horizontal-guide-top-${index}`}
            points={[
              new THREE.Vector3(xPos, floorY + mmToThreeUnits(internalSpace.height/2), backZ),
              new THREE.Vector3(xPos, floorY + mmToThreeUnits(internalSpace.height/2), frontZ)
            ]}
            color={zoneColor}
            lineWidth={zoneLineWidth}
            dashed
            dashSize={0.2}
            gapSize={0.1}
            opacity={zoneOpacity}
            transparent
          />
        );
      } else {
        // 3D 및 2D 정면뷰
        // 수직 가이드
        guides.push(
          <Line
            key={`${zoneType}-vertical-guide-${index}`}
            points={[
              new THREE.Vector3(xPos, floorY, backZ),
              new THREE.Vector3(xPos, ceilingY, backZ)
            ]}
            color={zoneColor}
            lineWidth={zoneLineWidth}
            dashed
            dashSize={0.2}
            gapSize={0.1}
            opacity={zoneOpacity}
            transparent
          />
        );
        
        // 3D에서만 Z축 가이드 표시
        if (viewMode === '3D') {
          // 바닥 Z축 가이드
          guides.push(
            <Line
              key={`${zoneType}-z-guide-floor-${index}`}
              points={[
                new THREE.Vector3(xPos, floorY, backZ),
                new THREE.Vector3(xPos, floorY, frontZ)
              ]}
              color={zoneColor}
              lineWidth={zoneLineWidth}
              dashed
              dashSize={0.2}
              gapSize={0.1}
              opacity={zoneOpacity}
              transparent
            />
          );
          
          // 천장 Z축 가이드
          guides.push(
            <Line
              key={`${zoneType}-z-guide-ceiling-${index}`}
              points={[
                new THREE.Vector3(xPos, ceilingY, backZ),
                new THREE.Vector3(xPos, ceilingY, frontZ)
              ]}
              color={zoneColor}
              lineWidth={zoneLineWidth}
              dashed
              dashSize={0.2}
              gapSize={0.1}
              opacity={zoneOpacity}
              transparent
            />
          );
        }
      }
    });
    
    // 각 슬롯 중앙에 내경 사이즈 텍스트 표시
    if (showDimensions && viewMode === '3D') {
      positions.forEach((xPos, index) => {
        const textY = floorY + mmToThreeUnits(internalSpace.height / 2); // 슬롯 중앙 높이
        const textZ = backZ + 0.5; // 뒷면에서 살짝 앞으로
        
        guides.push(
          <Text
            key={`${zoneType}-slot-size-${index}`}
            position={[xPos, textY, textZ]}
            fontSize={0.5}
            color={zoneColor}
            anchorX="center"
            anchorY="middle"
            rotation={[0, 0, 0]}
          >
            {Math.round(columnWidth)}mm
          </Text>
        );
      });
    }
    
    // 2D 정면뷰에서도 텍스트 표시
    if (showDimensions && viewMode === '2D' && view2DDirection === 'front') {
      positions.forEach((xPos, index) => {
        const textY = floorY + mmToThreeUnits(internalSpace.height / 2); // 슬롯 중앙 높이
        
        guides.push(
          <Text
            key={`${zoneType}-slot-size-2d-${index}`}
            position={[xPos, textY, backZ]}
            fontSize={0.5}
            color={zoneColor}
            anchorX="center"
            anchorY="middle"
          >
            {Math.round(columnWidth)}mm
          </Text>
        );
      });
    }
    
    console.log(`📐 ${zoneType} 영역 가이드 개수:`, guides.length);
    return guides;
  };

  console.log('🏗️ ColumnGuides 렌더링:', {
    hasDroppedCeiling,
    activeDroppedCeilingTab,
    'zoneSlotInfo.dropped': zoneSlotInfo.dropped,
    'zoneSlotInfo.normal': zoneSlotInfo.normal,
    showDimensions,
    viewMode,
    'spaceInfo.mainDoorCount': spaceInfo.mainDoorCount,
    'spaceInfo.customColumnCount': spaceInfo.customColumnCount,
    'columnCount': columnCount
  });

  // 투명 메쉬 렌더링 함수
  const renderTransparentMeshes = (
    startX: number,
    width: number,
    floorY: number,
    ceilingY: number,
    isActive: boolean,
    meshType: 'back' | 'top',
    zoneType: string
  ) => {
    const centerX = mmToThreeUnits(startX + width / 2);
    const meshWidth = mmToThreeUnits(width);
    
    // 활성 상태에 따른 투명도
    const opacity = isActive ? 0.2 : 0.05;
    
    if (meshType === 'back') {
      // 뒷면 메쉬
      const height = ceilingY - floorY;
      const centerY = floorY + height / 2;
      
      return (
        <mesh
          key={`${zoneType}-back-mesh`}
          position={[centerX, centerY, backZ]}
          rotation={[0, 0, 0]}
        >
          <planeGeometry args={[meshWidth, height]} />
          <meshBasicMaterial 
            color={primaryColor} 
            transparent 
            opacity={opacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      );
    } else {
      // 상부 메쉬
      const depth = frontZ - backZ;
      const centerZ = (frontZ + backZ) / 2;
      
      return (
        <mesh
          key={`${zoneType}-top-mesh`}
          position={[centerX, ceilingY, centerZ]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[meshWidth, depth]} />
          <meshBasicMaterial 
            color={primaryColor} 
            transparent 
            opacity={opacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      );
    }
  };

  return (
    <group>
      {/* 단내림 여부에 따른 가이드 렌더링 */}
      {hasDroppedCeiling && zoneSlotInfo.dropped ? (
        <>
          {/* 메인 영역 가이드는 항상 표시 */}
          {renderSlotGuides(
            zoneSlotInfo.normal.startX,
            zoneSlotInfo.normal.width,
            zoneSlotInfo.normal.columnCount,
            zoneSlotInfo.normal.columnWidth,
            ceilingY,
            'main'
          )}
          
          {/* 단내림 영역 가이드도 항상 표시 */}
          {renderSlotGuides(
            zoneSlotInfo.dropped.startX,
            zoneSlotInfo.dropped.width,
            zoneSlotInfo.dropped.columnCount,
            zoneSlotInfo.dropped.columnWidth,
            droppedCeilingY,
            'dropped'
          )}
          
          {/* 투명 메쉬들 - 3D 모드와 2D 뷰에서 표시 (탑뷰에서는 제외) */}
          {(viewMode === '3D' || (viewMode === '2D' && view2DDirection !== 'top')) && (
            <>
              {/* 메인 영역 뒷면 메쉬 */}
              {renderTransparentMeshes(
                zoneSlotInfo.normal.startX,
                zoneSlotInfo.normal.width,
                floorY,
                ceilingY,
                activeDroppedCeilingTab === 'main',
                'back',
                'main'
              )}
              {/* 메인 영역 상부 메쉬 - 3D와 탑뷰에서 표시 */}
              {(viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'top')) && renderTransparentMeshes(
                zoneSlotInfo.normal.startX,
                zoneSlotInfo.normal.width,
                floorY,
                ceilingY,
                activeDroppedCeilingTab === 'main',
                'top',
                'main'
              )}
              {/* 단내림 영역 뒷면 메쉬 */}
              {renderTransparentMeshes(
                zoneSlotInfo.dropped.startX,
                zoneSlotInfo.dropped.width,
                floorY,
                droppedCeilingY,
                activeDroppedCeilingTab === 'dropped',
                'back',
                'dropped'
              )}
              {/* 단내림 영역 상부 메쉬 - 3D와 탑뷰에서 표시 */}
              {(viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'top')) && renderTransparentMeshes(
                zoneSlotInfo.dropped.startX,
                zoneSlotInfo.dropped.width,
                floorY,
                droppedCeilingY,
                activeDroppedCeilingTab === 'dropped',
                'top',
                'dropped'
              )}
            </>
          )}
        </>
      ) : (
        /* 단내림이 없는 경우 전체 영역 가이드 */
        <>
          {renderSlotGuides(
            zoneSlotInfo.normal.startX,
            zoneSlotInfo.normal.width,
            zoneSlotInfo.normal.columnCount,
            zoneSlotInfo.normal.columnWidth,
            ceilingY,
            'full'
          )}
          
          {/* 투명 메쉬들 - 3D 모드와 2D 뷰에서 표시 (탑뷰에서는 제외) */}
          {(viewMode === '3D' || (viewMode === '2D' && view2DDirection !== 'top')) && (
            <>
              {/* 뒷면 메쉬 */}
              {renderTransparentMeshes(
                zoneSlotInfo.normal.startX,
                zoneSlotInfo.normal.width,
                floorY,
                ceilingY,
                true,
                'back',
                'full'
              )}
              {/* 상부 메쉬 - 3D와 탑뷰에서 표시 */}
              {(viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'top')) && renderTransparentMeshes(
                zoneSlotInfo.normal.startX,
                zoneSlotInfo.normal.width,
                floorY,
                ceilingY,
                true,
                'top',
                'full'
              )}
            </>
          )}
        </>
      )}
      
      {/* 컬럼 인덱스 드롭 타겟 - 영역별로 렌더링 */}
      {hasDroppedCeiling && zoneSlotInfo.dropped ? (
        <>
          {/* 메인구간 탭 선택 시 메인 영역 드롭 타겟 */}
          {activeDroppedCeilingTab === 'main' && Array.from({ length: zoneSlotInfo.normal.columnCount }, (_, i) => {
            const x = mmToThreeUnits(
              zoneSlotInfo.normal.startX + (i * zoneSlotInfo.normal.columnWidth) + (zoneSlotInfo.normal.columnWidth / 2)
            );
            return (
              <ColumnDropTarget
                key={`main-column-${i}`}
                columnIndex={i}
                columnWidth={zoneSlotInfo.normal.columnWidth}
                position={{ x, y: furnitureStartY, z: 0 }}
                internalSpace={internalSpace}
              />
            );
          })}
          
          {/* 단내림구간 탭 선택 시 단내림 영역 드롭 타겟 */}
          {activeDroppedCeilingTab === 'dropped' && Array.from({ length: zoneSlotInfo.dropped.columnCount }, (_, i) => {
            const x = mmToThreeUnits(
              zoneSlotInfo.dropped.startX + (i * zoneSlotInfo.dropped.columnWidth) + (zoneSlotInfo.dropped.columnWidth / 2)
            );
            return (
              <ColumnDropTarget
                key={`dropped-column-${i}`}
                columnIndex={i}
                columnWidth={zoneSlotInfo.dropped.columnWidth}
                position={{ x, y: furnitureStartY, z: 0 }}
                internalSpace={internalSpace}
                customHeight={droppedInternalHeight} // 단내림 내부 높이 전달
              />
            );
          })}
        </>
      ) : (
        /* 단내림이 없는 경우 전체 영역 드롭 타겟 */
        Array.from({ length: zoneSlotInfo.normal.columnCount }, (_, i) => {
          const x = mmToThreeUnits(
            zoneSlotInfo.normal.startX + (i * zoneSlotInfo.normal.columnWidth) + (zoneSlotInfo.normal.columnWidth / 2)
          );
          return (
            <ColumnDropTarget
              key={`column-${i}`}
              columnIndex={i}
              columnWidth={zoneSlotInfo.normal.columnWidth}
              position={{ x, y: furnitureStartY, z: 0 }}
              internalSpace={internalSpace}
            />
          );
        })
      )}
    </group>
  );
};

export default ColumnGuides;