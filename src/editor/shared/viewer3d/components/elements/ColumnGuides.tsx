import React from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useTheme } from '@/contexts/ThemeContext';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../utils/geometry';
import ColumnDropTarget from './ColumnDropTarget';

/**
 * 컬럼 인덱스 가이드 라인 컴포넌트
 * step0 이후로는 모든 step에서 configurator로 통일 처리
 */
const ColumnGuides: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { viewMode, showDimensions, view2DDirection } = useUIStore();
  const { theme } = useTheme();
  
  // 인덱싱 계산
  const indexing = calculateSpaceIndexing(spaceInfo);
  const { columnCount, threeUnitBoundaries } = indexing;
  
  // 1개 컬럼인 경우 가이드 표시 불필요
  if (columnCount <= 1) return null;
  
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
  
  // 내경의 앞뒤 좌표 (Three.js 단위)
  const frontZ = mmToThreeUnits(internalSpace.depth / 2);
  const backZ = -frontZ;
  
  return (
    <group>
      {/* 바닥 수평 가이드 라인 (전체 폭) */}
      <Line
        points={[
          new THREE.Vector3(threeUnitBoundaries[0], floorY, backZ),
          new THREE.Vector3(threeUnitBoundaries[threeUnitBoundaries.length - 1], floorY, backZ)
        ]}
        color={guideColor}
        lineWidth={lineWidth}
        dashed
        dashSize={0.2}
        gapSize={0.1}
      />
      
      {/* 천장 수평 가이드 라인 (전체 폭) */}
      <Line
        points={[
          new THREE.Vector3(threeUnitBoundaries[0], ceilingY, backZ),
          new THREE.Vector3(threeUnitBoundaries[threeUnitBoundaries.length - 1], ceilingY, backZ)
        ]}
        color={guideColor}
        lineWidth={lineWidth}
        dashed
        dashSize={0.2}
        gapSize={0.1}
      />
      
      {/* 각 컬럼 경계에 수직 가이드 라인 */}
      {threeUnitBoundaries.map((xPos: number, index: number) => {
        
        // 2D 상부뷰에서는 수직선 대신 수평선으로 표시
        if (viewMode === '2D' && view2DDirection === 'top') {
          // 3D와 동일한 700mm 길이
          return (
            <Line
              key={`horizontal-guide-top-${index}`}
              points={[
                new THREE.Vector3(xPos, floorY + mmToThreeUnits(internalSpace.height/2), backZ),
                new THREE.Vector3(xPos, floorY + mmToThreeUnits(internalSpace.height/2), backZ + mmToThreeUnits(700))
              ]}
              color={guideColor}
              lineWidth={lineWidth}
              dashed
              dashSize={0.2}
              gapSize={0.1}
            />
          );
        }
        
        // 3D 및 2D 정면뷰
        return (
          <React.Fragment key={`vertical-guide-group-${index}`}>
            {/* 기존 세로 가이드 */}
            <Line
              key={`vertical-guide-${index}`}
              points={[
                new THREE.Vector3(xPos, floorY, backZ),
                new THREE.Vector3(xPos, ceilingY, backZ)
              ]}
              color={guideColor}
              lineWidth={lineWidth}
              dashed
              dashSize={0.2}
              gapSize={0.1}
            />
            {/* 바닥에서 z축 방향 점선 - 3D에서만 표시 */}
            {viewMode === '3D' && (
              <Line
                key={`z-guide-floor-${index}`}
                points={[
                  new THREE.Vector3(xPos, floorY, backZ),
                  new THREE.Vector3(xPos, floorY, backZ + mmToThreeUnits(700))
                ]}
                color={guideColor}
                lineWidth={lineWidth}
                dashed
                dashSize={0.2}
                gapSize={0.1}
              />
            )}
            {/* 천장에서 z축 방향 점선 - 3D에서만 표시 */}
            {viewMode === '3D' && (
              <Line
                key={`z-guide-ceiling-${index}`}
                points={[
                  new THREE.Vector3(xPos, ceilingY, backZ),
                  new THREE.Vector3(xPos, ceilingY, backZ + mmToThreeUnits(700))
                ]}
                color={guideColor}
                lineWidth={lineWidth}
                dashed
                dashSize={0.2}
                gapSize={0.1}
              />
            )}
          </React.Fragment>
        );
      })}
      
      {/* 컬럼 인덱스 드롭 타겟 - step0 이후로는 모든 step에서 표시 */}
      {indexing.threeUnitPositions.map((x, i) => (
        <ColumnDropTarget
          key={`column-${i}`}
          columnIndex={i}
          columnWidth={indexing.columnWidth}
          position={{ x, y: furnitureStartY, z: 0 }}
          internalSpace={internalSpace}
        />
      ))}
    </group>
  );
};

export default ColumnGuides; 