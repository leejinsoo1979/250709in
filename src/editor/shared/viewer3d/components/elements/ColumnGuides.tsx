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
  const { viewMode, showDimensions, view2DDirection, activeDroppedCeilingTab, setActiveDroppedCeilingTab } = useUIStore();
  const { theme } = useTheme();
  
  // 현재 활성 탭 확인 (DOM에서 직접 감지)
  const [activeRightPanelTab, setActiveRightPanelTab] = useState<'slotA' | 'stepDown'>('slotA');
  
  // DOM에서 탭 상태를 감지 (더 정확한 방법)
  useEffect(() => {
    const checkActiveTab = () => {
      // 더 구체적인 선택자 사용
      const tabElements = document.querySelectorAll('button[class*="rightPanelTab"]');
      let foundActiveTab: 'slotA' | 'stepDown' = 'slotA';
      
      console.log('🔍 검색된 탭 개수:', tabElements.length);
      
      tabElements.forEach((tab, index) => {
        const isActive = tab.classList.contains('active');
        const tabText = tab.textContent?.trim();
        console.log(`🔍 탭 ${index}:`, { text: tabText, isActive, classes: tab.className });
        
        if (isActive) {
          if (tabText === '메인구간' || tabText === '슬롯A') {
            foundActiveTab = 'slotA';
          } else if (tabText === '단내림 구간') {
            foundActiveTab = 'stepDown';
          }
        }
      });
      
      setActiveRightPanelTab(foundActiveTab);
      console.log('🔍 최종 활성 탭:', foundActiveTab);
    };
    
    // 초기 체크 (약간 지연시켜 DOM이 완전히 로드된 후 실행)
    setTimeout(checkActiveTab, 100);
    
    // 탭 클릭 이벤트 감지 (더 포괄적인 감지)
    const observer = new MutationObserver(() => {
      setTimeout(checkActiveTab, 50); // 약간의 지연으로 DOM 업데이트 완료 후 체크
    });
    
    // 더 넓은 범위에서 감지
    const tabContainer = document.querySelector('[class*="rightPanelTabs"]') || 
                        document.querySelector('[class*="rightPanelHeader"]') ||
                        document.querySelector('[class*="rightPanel"]');
    
    if (tabContainer) {
      observer.observe(tabContainer, { 
        childList: true, 
        subtree: true, 
        attributes: true, 
        attributeFilter: ['class'] 
      });
    }
    
    // 클릭 이벤트도 감지
    const handleClick = () => {
      setTimeout(checkActiveTab, 100);
    };
    
    document.addEventListener('click', handleClick);
    
    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleClick);
    };
  }, []);
  
  // 인덱싱 계산
  const indexing = calculateSpaceIndexing(spaceInfo);
  const { columnCount, threeUnitBoundaries } = indexing;
  
  // 단내림 정보
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;
  const droppedHeight = hasDroppedCeiling && spaceInfo.droppedCeiling 
    ? spaceInfo.height - spaceInfo.droppedCeiling.dropHeight 
    : spaceInfo.height;
  const droppedWidth = hasDroppedCeiling && spaceInfo.droppedCeiling 
    ? spaceInfo.droppedCeiling.width 
    : 0;
  const isLeftDropped = spaceInfo.droppedCeiling?.position === 'left';
  
  // 영역별 슬롯 정보 계산 - mainDoorCount도 고려
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
  
  // 2D 뷰에서는 정면 뷰와 상부 뷰에서만 표시
  if (viewMode === '2D' && view2DDirection !== 'front' && view2DDirection !== 'top') {
    return null;
  }
  
  // 내경 공간 계산 (바닥, 천장 높이 등)
  const internalSpace = calculateInternalSpace(spaceInfo);
  
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
  const droppedCeilingY = hasDroppedCeiling ? floorY + mmToThreeUnits(droppedHeight) : ceilingY;
  
  // 단내림 경계 X 좌표 계산
  let droppedBoundaryX = null;
  if (hasDroppedCeiling) {
    if (isLeftDropped) {
      droppedBoundaryX = threeUnitBoundaries[0] + mmToThreeUnits(droppedWidth);
    } else {
      droppedBoundaryX = threeUnitBoundaries[threeUnitBoundaries.length - 1] - mmToThreeUnits(droppedWidth);
    }
  }
  
  // 내경의 앞뒤 좌표 (Three.js 단위)
  const frontZ = mmToThreeUnits(internalSpace.depth / 2);
  const backZ = -frontZ;
  
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
      columnCount,
      columnWidth,
      ceilingY,
      floorY,
      backZ,
      frontZ
    });
    
    const guides = [];
    
    // 활성 탭에 따른 강조 여부 결정
    const isActiveZone = (zoneType === 'main' && activeDroppedCeilingTab === 'main') ||
                        (zoneType === 'dropped' && activeDroppedCeilingTab === 'dropped') ||
                        (!hasDroppedCeiling); // 단내림이 없으면 항상 활성
    
    // 영역별 색상 및 선 굵기 설정
    const zoneColor = isActiveZone ? guideColor : '#888888'; // 비활성 영역은 회색
    const zoneLineWidth = isActiveZone ? lineWidth * 1.5 : lineWidth * 0.5; // 활성 영역은 굵게
    
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
    
    // 바닥과 천장 수평 가이드
    if (boundaries.length >= 2) {
      // 바닥 가이드
      guides.push(
        <Line
          key={`${zoneType}-floor-horizontal`}
          points={[
            new THREE.Vector3(boundaries[0], floorY, backZ),
            new THREE.Vector3(boundaries[boundaries.length - 1], floorY, backZ)
          ]}
          color={zoneColor}
          lineWidth={zoneLineWidth}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      );
      
      // 천장 가이드
      guides.push(
        <Line
          key={`${zoneType}-ceiling-horizontal`}
          points={[
            new THREE.Vector3(boundaries[0], ceilingY, backZ),
            new THREE.Vector3(boundaries[boundaries.length - 1], ceilingY, backZ)
          ]}
          color={zoneColor}
          lineWidth={zoneLineWidth}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      );
    }
    
    // 각 슬롯 경계의 수직 가이드
    boundaries.forEach((xPos, index) => {
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
            lineWidth={lineWidth}
            dashed
            dashSize={0.2}
            gapSize={0.1}
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
            lineWidth={lineWidth}
            dashed
            dashSize={0.2}
            gapSize={0.1}
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
              lineWidth={lineWidth}
              dashed
              dashSize={0.2}
              gapSize={0.1}
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
              lineWidth={lineWidth}
              dashed
              dashSize={0.2}
              gapSize={0.1}
            />
          );
        }
      }
    });
    
    console.log(`📐 ${zoneType} 영역 가이드 개수:`, guides.length);
    return guides;
  };

  console.log('🏗️ ColumnGuides 렌더링:', {
    hasDroppedCeiling,
    activeDroppedCeilingTab,
    'zoneSlotInfo.dropped': zoneSlotInfo.dropped,
    'zoneSlotInfo.normal': zoneSlotInfo.normal,
    showDimensions,
    viewMode
  });

  return (
    <group>
      {hasDroppedCeiling && zoneSlotInfo.dropped ? (
        <>
          {/* 메인구간 탭 선택 시 메인 영역만 표시 */}
          {activeDroppedCeilingTab === 'main' && renderSlotGuides(
            zoneSlotInfo.normal.startX,
            zoneSlotInfo.normal.width,
            zoneSlotInfo.normal.columnCount,
            zoneSlotInfo.normal.columnWidth,
            ceilingY,
            'main'
          )}
          
          {/* 단내림구간 탭 선택 시 단내림 영역만 표시 */}
          {activeDroppedCeilingTab === 'dropped' && (() => {
            console.log('🔍 단내림 가이드 렌더링 시도:', {
              activeDroppedCeilingTab,
              'zoneSlotInfo.dropped': zoneSlotInfo.dropped,
              droppedCeilingY,
              droppedHeight,
              'condition': activeDroppedCeilingTab === 'dropped'
            });
            return renderSlotGuides(
              zoneSlotInfo.dropped.startX,
              zoneSlotInfo.dropped.width,
              zoneSlotInfo.dropped.columnCount,
              zoneSlotInfo.dropped.columnWidth,
              droppedCeilingY,
              'dropped'
            );
          })()}
        </>
      ) : (
        /* 단내림이 없는 경우 전체 영역 슬롯 가이드 */
        <>
          {renderSlotGuides(
            zoneSlotInfo.normal.startX,
            zoneSlotInfo.normal.width,
            zoneSlotInfo.normal.columnCount,
            zoneSlotInfo.normal.columnWidth,
            ceilingY,
            'full'
          )}
        </>
      )}
      
      {/* 컬럼 인덱스 드롭 타겟 - 영역별로 렌더링 */}
      {hasDroppedCeiling && zoneSlotInfo.dropped ? (
        <>
          {/* 메인구간 탭 선택 시 메인 영역 드롭 타겟만 표시 */}
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
          
          {/* 단내림구간 탭 선택 시 단내림 영역 드롭 타겟만 표시 */}
          {activeDroppedCeilingTab === 'dropped' && (() => {
            console.log('🎯 단내림 영역 ColumnDropTarget 생성 시도:', {
              activeDroppedCeilingTab,
              'zoneSlotInfo.dropped.columnCount': zoneSlotInfo.dropped.columnCount,
              furnitureStartY
            });
            
            return Array.from({ length: zoneSlotInfo.dropped.columnCount }, (_, i) => {
              const x = mmToThreeUnits(
                zoneSlotInfo.dropped.startX + (i * zoneSlotInfo.dropped.columnWidth) + (zoneSlotInfo.dropped.columnWidth / 2)
              );
              console.log(`🎯 단내림 ColumnDropTarget ${i}:`, { x, y: furnitureStartY });
              
              return (
                <ColumnDropTarget
                key={`dropped-column-${i}`}
                columnIndex={i}
                columnWidth={zoneSlotInfo.dropped.columnWidth}
                position={{ x, y: furnitureStartY, z: 0 }}
                internalSpace={internalSpace}
              />
              );
            });
          })()}
        </>
      ) : (
        /* 단내림이 없는 경우 기존 방식 */
        indexing.threeUnitPositions.map((x, i) => (
          <ColumnDropTarget
            key={`column-${i}`}
            columnIndex={i}
            columnWidth={indexing.columnWidth}
            position={{ x, y: furnitureStartY, z: 0 }}
            internalSpace={internalSpace}
          />
        ))
      )}
    </group>
  );
};

export default ColumnGuides;