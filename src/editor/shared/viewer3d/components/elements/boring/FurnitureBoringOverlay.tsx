/**
 * 가구 보링 오버레이 컴포넌트
 * 배치된 모든 가구의 보링 위치를 3D 뷰어에 표시
 */

import React, { useMemo } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { useFurnitureBoring } from '@/domain/boring';
import type { PanelBoringData, PanelType, BoringFace } from '@/domain/boring/types';
import BoringVisualization from './BoringVisualization';

// ============================================
// 타입
// ============================================

interface FurnitureBoringOverlayProps {
  viewMode: '2D' | '3D';
  opacity?: number;
  showLabels?: boolean;
  /** 특정 가구만 표시 (null이면 전체) */
  furnitureId?: string | null;
  /** 특정 패널 타입만 표시 */
  panelTypes?: PanelType[];
}

// ============================================
// 상수
// ============================================

const mmToThreeUnits = (mm: number) => mm * 0.01;

// ============================================
// 헬퍼 함수
// ============================================

/**
 * 패널 타입에서 보링 면으로 변환
 */
function getPanelBoringFace(panelType: PanelType): BoringFace {
  switch (panelType) {
    case 'side-left':
      return 'right';  // 좌측판의 내면은 right
    case 'side-right':
      return 'left';   // 우측판의 내면은 left
    case 'top':
      return 'bottom'; // 상판의 아래면
    case 'bottom':
      return 'top';    // 하판의 윗면
    case 'door':
      return 'back';   // 도어의 뒷면
    case 'shelf':
      return 'bottom'; // 선반의 아래면
    default:
      return 'front';
  }
}

/**
 * 패널 위치 계산 (가구 위치 기준)
 */
function calculatePanelPosition(
  panelType: PanelType,
  panelData: PanelBoringData,
  furniturePosition: { x: number; y: number; z: number },
  furnitureSize: { width: number; height: number; depth: number },
  thickness: number
): { x: number; y: number; z: number } {
  const fPos = furniturePosition;
  const fWidth = mmToThreeUnits(furnitureSize.width);
  const fHeight = mmToThreeUnits(furnitureSize.height);
  const fDepth = mmToThreeUnits(furnitureSize.depth);
  const t = mmToThreeUnits(thickness);

  switch (panelType) {
    case 'side-left':
      return {
        x: fPos.x - fWidth / 2 + t / 2,
        y: fPos.y + fHeight / 2,
        z: fPos.z,
      };

    case 'side-right':
      return {
        x: fPos.x + fWidth / 2 - t / 2,
        y: fPos.y + fHeight / 2,
        z: fPos.z,
      };

    case 'top':
      return {
        x: fPos.x,
        y: fPos.y + fHeight - t / 2,
        z: fPos.z,
      };

    case 'bottom':
      return {
        x: fPos.x,
        y: fPos.y + t / 2,
        z: fPos.z,
      };

    case 'door':
      // 도어는 가구 전면에 위치
      return {
        x: fPos.x,
        y: fPos.y + fHeight / 2,
        z: fPos.z + fDepth / 2,
      };

    case 'shelf':
      // 선반 위치는 패널 데이터의 높이 정보 필요 (간략화)
      return {
        x: fPos.x,
        y: fPos.y + fHeight / 2,
        z: fPos.z,
      };

    default:
      return fPos;
  }
}

// ============================================
// 메인 컴포넌트
// ============================================

const FurnitureBoringOverlay: React.FC<FurnitureBoringOverlayProps> = ({
  viewMode,
  opacity = 0.7,
  showLabels = false,
  furnitureId = null,
  panelTypes,
}) => {
  // 보링 데이터 가져오기
  const { panels } = useFurnitureBoring({
    furnitureIds: furnitureId ? [furnitureId] : undefined,
  });

  const placedModules = useFurnitureStore((state) => state.placedModules);
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);

  // 가구별 보링 시각화 데이터 생성
  const boringVisualizations = useMemo(() => {
    if (panels.length === 0) return [];

    const internalSpace = calculateInternalSpace(spaceInfo);
    const visualizations: JSX.Element[] = [];

    // 패널별로 처리
    panels.forEach((panel, panelIndex) => {
      // 패널 타입 필터링
      if (panelTypes && !panelTypes.includes(panel.panelType)) {
        return;
      }

      // 해당 가구 찾기
      const furniture = placedModules.find((m) => m.id === panel.furnitureId);
      if (!furniture) return;

      // 가구 데이터 가져오기
      const moduleData = getModuleById(furniture.moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;

      // 가구 크기 계산
      const furnitureWidth = furniture.adjustedWidth || furniture.customWidth || moduleData.dimensions.width;
      const furnitureHeight = furniture.customHeight || moduleData.dimensions.height;
      const furnitureDepth = furniture.customDepth || moduleData.dimensions.depth;

      // 가구 위치 (Three.js 단위)
      const furniturePosition = {
        x: furniture.position.x,
        y: furniture.position.y,
        z: furniture.position.z,
      };

      // 패널 위치 계산
      const panelPosition = calculatePanelPosition(
        panel.panelType,
        panel,
        furniturePosition,
        { width: furnitureWidth, height: furnitureHeight, depth: furnitureDepth },
        panel.thickness
      );

      // 보링 시각화 추가
      if (panel.borings.length > 0) {
        visualizations.push(
          <BoringVisualization
            key={`${panel.panelId}-${panelIndex}`}
            borings={panel.borings}
            panelPosition={panelPosition}
            panelSize={{
              width: panel.width,
              height: panel.height,
              thickness: panel.thickness,
            }}
            panelFace={getPanelBoringFace(panel.panelType)}
            viewMode={viewMode}
            opacity={opacity}
            showLabels={showLabels}
          />
        );
      }
    });

    return visualizations;
  }, [panels, placedModules, spaceInfo, viewMode, opacity, showLabels, panelTypes]);

  if (boringVisualizations.length === 0) {
    return null;
  }

  return <group name="boring-overlay">{boringVisualizations}</group>;
};

export default FurnitureBoringOverlay;
