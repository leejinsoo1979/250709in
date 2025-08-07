import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Line, Text } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace, calculateFrameThickness, END_PANEL_THICKNESS } from '../../utils/geometry';
import ColumnDropTarget from './ColumnDropTarget';

interface ColumnGuidesProps {
  viewMode?: '2D' | '3D';
}

/**
 * 컬럼 인덱스 가이드 라인 컴포넌트
 * step0 이후로는 모든 step에서 configurator로 통일 처리
 */
const ColumnGuides: React.FC<ColumnGuidesProps> = ({ viewMode: viewModeProp }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { viewMode: contextViewMode, showDimensions, view2DDirection, activeDroppedCeilingTab, setActiveDroppedCeilingTab, view2DTheme } = useUIStore();
  
  // prop으로 받은 viewMode를 우선 사용, 없으면 context의 viewMode 사용
  const viewMode = viewModeProp || contextViewMode;
  const { theme } = useViewerTheme();
  
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
    const info = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    
    // 전체 내경 정보와 비교
    const fullIndexing = calculateSpaceIndexing(spaceInfo);
    
    console.log('🔍 ColumnGuides - 슬롯 정보 비교:', {
      전체인덱싱: {
        내경시작X: fullIndexing.internalStartX,
        내경너비: fullIndexing.internalWidth,
        슬롯너비: fullIndexing.columnWidth
      },
      영역별정보: {
        메인: {
          시작X: info.normal.startX,
          너비: info.normal.width,
          끝X: info.normal.startX + info.normal.width,
          슬롯너비: info.normal.columnWidth,
          slotWidths: info.normal.slotWidths,
          '🎯 Three.js 단위': {
            시작X_three: info.normal.startX * 0.01,
            끝X_three: (info.normal.startX + info.normal.width) * 0.01,
            중심X_three: (info.normal.startX + info.normal.width/2) * 0.01
          }
        },
        단내림: info.dropped ? {
          시작X: info.dropped.startX,
          너비: info.dropped.width,
          끝X: info.dropped.startX + info.dropped.width,
          슬롯너비: info.dropped.columnWidth,
          slotWidths: info.dropped.slotWidths
        } : null
      },
      갭체크: info.dropped ? {
        '메인끝-단내림시작': (info.dropped.startX - (info.normal.startX + info.normal.width))
      } : null,
      'spaceInfo.surroundType': spaceInfo.surroundType,
      'spaceInfo.installType': spaceInfo.installType
    });
    
    return info;
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
  const panelDepthMm = spaceInfo.depth || 1500;
  const furnitureDepthMm = 600; // 가구 깊이 고정값
  
  // Room.tsx와 동일한 계산 사용
  const zOffset = -mmToThreeUnits(panelDepthMm) / 2;
  const furnitureZOffset = zOffset + (mmToThreeUnits(panelDepthMm) - mmToThreeUnits(furnitureDepthMm)) / 2;
  const frameEndZ = furnitureZOffset + mmToThreeUnits(furnitureDepthMm) / 2;
  
  // 내부 공간 깊이의 절반 (Room.tsx와 동일)
  const backZ = -mmToThreeUnits(internalSpace.depth / 2);
  // 바닥 슬롯 메쉬와 동일한 앞쪽 좌표 - 앞쪽에서 18mm 줄임
  const frontZ = frameEndZ - mmToThreeUnits(18);
  
  // 프레임 두께 계산
  const frameThickness = calculateFrameThickness(spaceInfo);
  
  // 슬롯 가이드 렌더링 헬퍼 함수
  const renderSlotGuides = (
    startX: number,
    width: number,
    columnCount: number,
    columnWidth: number,
    ceilingY: number,
    zoneType: string,
    slotWidths?: number[]
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
      'spaceInfo.customColumnCount': spaceInfo.customColumnCount,
      'hasDroppedCeiling': hasDroppedCeiling,
      'spaceInfo.surroundType': spaceInfo.surroundType,
      'spaceInfo.installType': spaceInfo.installType,
      'spaceInfo.wallConfig': spaceInfo.wallConfig,
      'slotWidths': slotWidths
    });
    
    const guides = [];
    
    // 활성 탭에 따른 강조 여부 결정
    // activeZone이 전달되지 않으면 모든 영역이 활성화됨
    const isActiveZone = true; // 모든 영역을 활성화 상태로 표시
    
    // 영역별 색상 및 선 굵기 설정 - 모든 영역 동일하게
    const zoneColor = viewMode === '2D' && view2DTheme === 'dark' 
      ? '#FFFFFF' // 2D 다크모드에서는 항상 흰색
      : guideColor; // 모든 영역 동일한 색상
    const zoneLineWidth = lineWidth * 2; // 모든 영역 동일한 굵기
    const zoneOpacity = 1; // 모든 영역 완전 불투명
    
    // 각 슬롯 경계 계산
    const boundaries = [];
    let currentX = startX;
    boundaries.push(mmToThreeUnits(currentX));
    
    // slotWidths가 있으면 사용, 없으면 균등 분할
    // ColumnIndexer에서 이미 엔드패널을 고려한 값을 제공하므로 여기서는 추가 조정 불필요
    if (slotWidths && slotWidths.length === columnCount) {
      console.log('📏 slotWidths 사용하여 경계 계산:', {
        startX,
        slotWidths,
        totalWidth: slotWidths.reduce((a, b) => a + b, 0)
      });
      for (let i = 0; i < columnCount; i++) {
        currentX += slotWidths[i];
        boundaries.push(mmToThreeUnits(currentX));
      }
    } else {
      // 기존 로직 유지 (호환성)
      console.log('📏 균등 분할로 경계 계산:', {
        startX,
        width,
        columnCount,
        columnWidth
      });
      for (let i = 1; i <= columnCount; i++) {
        if (i === columnCount) {
          boundaries.push(mmToThreeUnits(startX + width));
        } else {
          boundaries.push(mmToThreeUnits(startX + (i * columnWidth)));
        }
      }
    }
    
    console.log('📏 최종 경계:', {
      firstBoundary: boundaries[0],
      lastBoundary: boundaries[boundaries.length - 1],
      totalBoundaries: boundaries.length,
      expectedEndX: mmToThreeUnits(startX + width),
      actualEndX: boundaries[boundaries.length - 1],
      '엔드패널 체크': {
        surroundType: spaceInfo.surroundType,
        installType: spaceInfo.installType,
        wallConfig: spaceInfo.wallConfig,
        '우측 엔드패널 있음': spaceInfo.surroundType === 'no-surround' && 
          (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && 
          !spaceInfo.wallConfig?.right
      }
    });
    
    // 슬롯 중심 위치 계산
    const positions = [];
    for (let i = 0; i < columnCount; i++) {
      const slotStart = boundaries[i];
      const slotEnd = boundaries[i + 1];
      const slotCenter = (slotStart + slotEnd) / 2;
      positions.push(slotCenter);
    }
    
    // 경계 확인 로그
    console.log(`📏 ${zoneType} 영역 경계:`, {
      startX_mm: startX,
      endX_mm: startX + width,
      width_mm: width,
      boundaries_three: [boundaries[0], boundaries[boundaries.length - 1]],
      expectedEndX_three: mmToThreeUnits(startX + width),
      actualEndX_three: boundaries[boundaries.length - 1],
      '반올림오차_mm': width - (columnWidth * columnCount),
      '마지막슬롯너비_mm': (columnCount > 0) ? (startX + width) - (startX + (columnCount - 1) * columnWidth) : 0
    });
    
    // 내경 공간의 실제 경계 계산
    const internalStartX = mmToThreeUnits(internalSpace.startX);
    const internalEndX = mmToThreeUnits(internalSpace.startX + internalSpace.width);
    
    // 바닥과 천장 수평 가이드
    if (boundaries.length >= 2) {
      // 영역별 경계 설정 - 정확한 영역 시작과 끝 사용
      const zoneStartX = mmToThreeUnits(startX);
      const zoneEndX = mmToThreeUnits(startX + width);
      
      console.log(`📐 ${zoneType} 수평 가이드 범위:`, {
        시작X_mm: startX,
        끝X_mm: startX + width,
        시작X_three: zoneStartX,
        끝X_three: zoneEndX,
        내경시작_three: internalStartX,
        내경끝_three: internalEndX,
        프레임정보: spaceInfo.frameSize
      });
      
      // 2D 정면 뷰에서도 단내림이 있는 경우 각 영역의 실제 경계 사용
      // 단내림이 없는 경우에만 내경 범위로 클리핑
      const startBoundaryX = (viewMode === '2D' && view2DDirection === 'front' && !hasDroppedCeiling)
        ? Math.max(zoneStartX, internalStartX) 
        : zoneStartX;
      const endBoundaryX = (viewMode === '2D' && view2DDirection === 'front' && !hasDroppedCeiling)
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
    if (showDimensions) {
      positions.forEach((xPos, index) => {
        // 실제 슬롯 너비 계산
        const actualWidth = slotWidths && slotWidths[index] ? slotWidths[index] : columnWidth;
        
        // 탑뷰와 다른 뷰에 따라 텍스트 위치와 회전 조정
        let textPosition: [number, number, number];
        let textRotation: [number, number, number];
        
        if (viewMode === '2D' && view2DDirection === 'top') {
          // 탑뷰: Y축은 바닥 약간 위로, Z축은 슬롯의 정중앙으로
          const slotCenterZ = (frontZ + backZ) / 2; // 슬롯의 전후 중앙
          textPosition = [xPos, floorY + 0.1, slotCenterZ];
          textRotation = [-Math.PI / 2, 0, 0]; // 텍스트를 수평으로 눕힘
        } else {
          // 프론트뷰 및 3D뷰: 기존 위치 유지
          const textY = floorY + mmToThreeUnits(internalSpace.height / 2); // 슬롯 중앙 높이
          const textZ = backZ + 0.5; // 뒷면에서 살짝 앞으로
          textPosition = [xPos, textY, textZ];
          textRotation = [0, 0, 0];
        }
        
        guides.push(
          <Text
            key={`${zoneType}-slot-size-${index}`}
            position={textPosition}
            fontSize={0.5}
            color={zoneColor}
            anchorX="center"
            anchorY="middle"
            rotation={textRotation}
          >
            {Math.round(actualWidth)}mm
          </Text>
        );
      });
    }
    
    // 2D 정면뷰에서도 텍스트 표시하지 않음
    if (false) {
      positions.forEach((xPos, index) => {
        const textY = floorY + mmToThreeUnits(internalSpace.height / 2); // 슬롯 중앙 높이
        
        // 2D 다크모드일 때 텍스트 색상 처리
        const textColor = view2DTheme === 'dark' ? '#FFFFFF' : zoneColor;
        
        // 실제 슬롯 너비 계산
        let actualWidth: number;
        
        // 노서라운드 모드에서 엔드판넬 옆 슬롯인지 확인
        if (spaceInfo.surroundType === 'no-surround') {
          // slotWidths가 있으면 사용 (이미 조정된 값)
          if (slotWidths && slotWidths[index] !== undefined) {
            actualWidth = slotWidths[index];
            console.log(`🎯 슬롯 ${index} 너비 (slotWidths 사용):`, actualWidth);
          } else {
            // slotWidths가 없으면 직접 계산
            if (spaceInfo.installType === 'freestanding') {
              // 양쪽 벽 없음: 첫 번째와 마지막 슬롯 조정
              if (index === 0 || index === columnCount - 1) {
                actualWidth = columnWidth - END_PANEL_THICKNESS; // 엔드판넬 두께 빼기
              } else {
                actualWidth = columnWidth;
              }
            } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
              // 한쪽 벽: 벽이 없는 쪽만 조정
              if (index === 0 && !spaceInfo.wallConfig?.left) {
                actualWidth = columnWidth - 18;
              } else if (index === columnCount - 1 && !spaceInfo.wallConfig?.right) {
                actualWidth = columnWidth - 18;
              } else {
                actualWidth = columnWidth;
              }
            } else {
              // 빌트인: 조정 없음
              actualWidth = columnWidth;
            }
          }
        } else {
          // 다른 모드에서는 기존 로직 사용
          actualWidth = slotWidths && slotWidths[index] ? slotWidths[index] : columnWidth;
        }
        
        guides.push(
          <Text
            key={`${zoneType}-slot-size-2d-${index}`}
            position={[xPos, textY, backZ]}
            fontSize={0.5}
            color={textColor}
            anchorX="center"
            anchorY="middle"
          >
            {Math.round(actualWidth)}mm
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
    
    // 모든 영역 동일한 투명도
    const opacity = 0.2;
    
    if (meshType === 'back') {
      // 뒷면 메쉬 - 가이드 점선과 정확히 일치
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
      // 상부 메쉬 (2D 탑뷰에서는 바닥 메쉬로 표시)
      const depth = frontZ - backZ;
      const centerZ = (frontZ + backZ) / 2;
      
      // 2D 탑뷰에서는 바닥에 표시
      if (viewMode === '2D' && view2DDirection === 'top') {
        return (
          <mesh
            key={`${zoneType}-floor-mesh`}
            position={[centerX, floorY, centerZ]}
            rotation={[-Math.PI / 2, 0, 0]}
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
      
      // 3D 모드에서는 천장에 표시
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
            'main',
            zoneSlotInfo.normal.slotWidths
          )}
          
          {/* 단내림 영역 가이드도 항상 표시 */}
          {renderSlotGuides(
            zoneSlotInfo.dropped.startX,
            zoneSlotInfo.dropped.width,
            zoneSlotInfo.dropped.columnCount,
            zoneSlotInfo.dropped.columnWidth,
            droppedCeilingY,
            'dropped',
            zoneSlotInfo.dropped.slotWidths
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
                true, // 모든 영역 활성화
                'back',
                'main'
              )}
              {/* 메인 영역 상부 메쉬 - 3D와 탑뷰에서 표시 */}
              {(viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'top')) && renderTransparentMeshes(
                zoneSlotInfo.normal.startX,
                zoneSlotInfo.normal.width,
                floorY,
                ceilingY,
                true, // 모든 영역 활성화
                'top',
                'main'
              )}
              {/* 단내림 영역 뒷면 메쉬 */}
              {renderTransparentMeshes(
                zoneSlotInfo.dropped.startX,
                zoneSlotInfo.dropped.width,
                floorY,
                droppedCeilingY,
                true, // 모든 영역 활성화
                'back',
                'dropped'
              )}
              {/* 단내림 영역 상부 메쉬 - 3D와 탑뷰에서 표시 */}
              {(viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'top')) && renderTransparentMeshes(
                zoneSlotInfo.dropped.startX,
                zoneSlotInfo.dropped.width,
                floorY,
                droppedCeilingY,
                true, // 모든 영역 활성화
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
            'full',
            zoneSlotInfo.normal.slotWidths
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
            // 실제 슬롯 너비를 사용한 위치 계산
            let slotCenterX: number;
            if (zoneSlotInfo.normal.slotWidths) {
              let currentX = zoneSlotInfo.normal.startX;
              for (let j = 0; j < i; j++) {
                currentX += zoneSlotInfo.normal.slotWidths[j];
              }
              const slotStart = currentX;
              const slotEnd = slotStart + zoneSlotInfo.normal.slotWidths[i];
              slotCenterX = (slotStart + slotEnd) / 2;
            } else {
              slotCenterX = zoneSlotInfo.normal.startX + (i * zoneSlotInfo.normal.columnWidth) + (zoneSlotInfo.normal.columnWidth / 2);
            }
            
            const actualWidth = zoneSlotInfo.normal.slotWidths?.[i] || zoneSlotInfo.normal.columnWidth;
            
            return (
              <ColumnDropTarget
                key={`main-column-${i}`}
                columnIndex={i}
                columnWidth={actualWidth}
                position={{ x: mmToThreeUnits(slotCenterX), y: furnitureStartY, z: 0 }}
                internalSpace={internalSpace}
              />
            );
          })}
          
          {/* 단내림구간 탭 선택 시 단내림 영역 드롭 타겟 */}
          {activeDroppedCeilingTab === 'dropped' && Array.from({ length: zoneSlotInfo.dropped.columnCount }, (_, i) => {
            // 실제 슬롯 너비를 사용한 위치 계산
            let slotCenterX: number;
            if (zoneSlotInfo.dropped.slotWidths) {
              let currentX = zoneSlotInfo.dropped.startX;
              for (let j = 0; j < i; j++) {
                currentX += zoneSlotInfo.dropped.slotWidths[j];
              }
              const slotStart = currentX;
              const slotEnd = slotStart + zoneSlotInfo.dropped.slotWidths[i];
              slotCenterX = (slotStart + slotEnd) / 2;
            } else {
              slotCenterX = zoneSlotInfo.dropped.startX + (i * zoneSlotInfo.dropped.columnWidth) + (zoneSlotInfo.dropped.columnWidth / 2);
            }
            
            const actualWidth = zoneSlotInfo.dropped.slotWidths?.[i] || zoneSlotInfo.dropped.columnWidth;
            
            return (
              <ColumnDropTarget
                key={`dropped-column-${i}`}
                columnIndex={i}
                columnWidth={actualWidth}
                position={{ x: mmToThreeUnits(slotCenterX), y: furnitureStartY, z: 0 }}
                internalSpace={internalSpace}
                customHeight={droppedInternalHeight} // 단내림 내부 높이 전달
              />
            );
          })}
        </>
      ) : (
        /* 단내림이 없는 경우 전체 영역 드롭 타겟 */
        Array.from({ length: zoneSlotInfo.normal.columnCount }, (_, i) => {
          // 실제 슬롯 너비를 사용한 위치 계산
          let slotCenterX: number;
          if (zoneSlotInfo.normal.slotWidths) {
            let currentX = zoneSlotInfo.normal.startX;
            for (let j = 0; j < i; j++) {
              currentX += zoneSlotInfo.normal.slotWidths[j];
            }
            const slotStart = currentX;
            const slotEnd = slotStart + zoneSlotInfo.normal.slotWidths[i];
            slotCenterX = (slotStart + slotEnd) / 2;
          } else {
            slotCenterX = zoneSlotInfo.normal.startX + (i * zoneSlotInfo.normal.columnWidth) + (zoneSlotInfo.normal.columnWidth / 2);
          }
          
          const actualWidth = zoneSlotInfo.normal.slotWidths?.[i] || zoneSlotInfo.normal.columnWidth;
          
          return (
            <ColumnDropTarget
              key={`column-${i}`}
              columnIndex={i}
              columnWidth={actualWidth}
              position={{ x: mmToThreeUnits(slotCenterX), y: furnitureStartY, z: 0 }}
              internalSpace={internalSpace}
            />
          );
        })
      )}
    </group>
  );
};

export default ColumnGuides;