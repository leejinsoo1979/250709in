import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById } from '@/data/modules';

interface DropPosition {
  x: number;
  column: number;
  isDualFurniture: boolean;
  zone?: 'normal' | 'dropped'; // 단내림 구역 정보
}

interface CurrentDragData {
  type: string;
  moduleData: {
    id: string;
    name: string;
    dimensions: { width: number; height: number; depth: number };
    type: string;
    color?: string;
    hasDoor?: boolean;
  };
}

interface PlacedModule {
  id: string;
  moduleId: string;
  position: { x: number; y: number; z: number };
  rotation: number;
}

export const useDropPositioning = (spaceInfo: SpaceInfo) => {
  const calculateDropPosition = (
    e: React.DragEvent | DragEvent,
    currentDragData: CurrentDragData
  ): DropPosition | null => {
    // 컬럼 인덱싱 계산
    const indexing = calculateSpaceIndexing(spaceInfo);
    const internalSpace = calculateInternalSpace(spaceInfo);
    
    // 마우스 위치를 캔버스 좌표로 변환
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const normalizedX = Math.max(-1, Math.min(1, (mouseX / rect.width) * 2 - 1));

    // 컬럼 경계 기반 좌표계 계산 (gap/프레임 반영)
    const columnBoundaries = indexing.columnBoundaries;
    const leftBoundaryMm = columnBoundaries?.[0] ?? -(spaceInfo.width / 2);
    const rightBoundaryMm = columnBoundaries?.[columnBoundaries.length - 1] ?? (spaceInfo.width / 2);
    const usableWidthMm = Math.max(1, rightBoundaryMm - leftBoundaryMm || spaceInfo.width);

    const worldXMm = leftBoundaryMm + ((normalizedX + 1) / 2) * usableWidthMm;
    const worldX = worldXMm * 0.01; // mm to Three.js units
    
    // 가구 데이터를 가져와서 폭 확인
    const moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
    if (!moduleData) {
      console.error('Module data not found:', currentDragData.moduleData.id);
      return null;
    }
    
    // 단내림이 활성화된 경우 영역별 처리
    if (spaceInfo.droppedCeiling?.enabled && indexing.zones) {
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      
      // 어느 영역에 속하는지 확인
      let zone: 'normal' | 'dropped';
      let zoneStartX: number;
      let zoneColumnCount: number;
      let zoneColumnWidth: number;
      
      if (zoneInfo.dropped && 
          worldXMm >= zoneInfo.dropped.startX && 
          worldXMm <= zoneInfo.dropped.startX + zoneInfo.dropped.width) {
        // 단내림 영역
        zone = 'dropped';
        zoneStartX = zoneInfo.dropped.startX;
        zoneColumnCount = zoneInfo.dropped.columnCount;
        zoneColumnWidth = zoneInfo.dropped.columnWidth;
      } else {
        // 메인 영역
        zone = 'normal';
        zoneStartX = zoneInfo.normal.startX;
        zoneColumnCount = zoneInfo.normal.columnCount;
        zoneColumnWidth = zoneInfo.normal.columnWidth;
      }
      
      // 영역 내에서의 상대 위치 계산
      const relativeX = worldXMm - zoneStartX;
      const columnIndex = Math.floor(relativeX / zoneColumnWidth);
      const clampedColumnIndex = Math.max(0, Math.min(columnIndex, zoneColumnCount - 1));
      
      // 듀얼 가구 여부 판단
      const isDualFurniture = Math.abs(moduleData.dimensions.width - (zoneColumnWidth * 2)) < 50;
      
      let targetPositionX: number;
      let targetColumn: number;
      
      if (isDualFurniture && zoneColumnCount > 1) {
        // 듀얼가구: 두 컬럼의 경계 중심에 배치
        const dualPositionIndex = Math.max(0, Math.min(clampedColumnIndex, zoneColumnCount - 2));
        const leftColumnCenterMm = zoneStartX + (dualPositionIndex * zoneColumnWidth) + (zoneColumnWidth / 2);
        const rightColumnCenterMm = zoneStartX + ((dualPositionIndex + 1) * zoneColumnWidth) + (zoneColumnWidth / 2);
        const dualCenterMm = (leftColumnCenterMm + rightColumnCenterMm) / 2;
        targetPositionX = dualCenterMm * 0.01; // mm to Three.js
        targetColumn = dualPositionIndex;
        // debug removed for perf
      } else {
        // 싱글가구: 단일 컬럼 중심에 배치
        const columnCenterMm = zoneStartX + (clampedColumnIndex * zoneColumnWidth) + (zoneColumnWidth / 2);
        targetPositionX = columnCenterMm * 0.01; // mm to Three.js
        targetColumn = clampedColumnIndex;
        // debug removed for perf
      }
      
      return {
        x: targetPositionX,
        column: targetColumn,
        isDualFurniture,
        zone
      };
    }
    
    // 단내림이 없는 경우 기존 로직
    const columnCount = indexing.columnCount;
    const columnIndex = ColumnIndexer.findClosestColumnIndex({ x: worldX }, indexing);
    const clampedColumnIndex = Math.max(0, Math.min(columnIndex, columnCount - 1));
    
    const columnWidth = indexing.columnWidth;
    const isDualFurniture = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;
    
    let targetPositionX: number;
    let targetColumn: number;
    
    if (isDualFurniture) {
      const dualPositionIndex = Math.max(0, Math.min(clampedColumnIndex, columnCount - 2));
      if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[dualPositionIndex] !== undefined) {
        targetPositionX = indexing.threeUnitDualPositions[dualPositionIndex];
      } else {
        targetPositionX = indexing.threeUnitPositions[dualPositionIndex] + 
          (indexing.threeUnitPositions[dualPositionIndex + 1] - indexing.threeUnitPositions[dualPositionIndex]) / 2;
      }
      targetColumn = dualPositionIndex;
      // debug removed for perf
    } else {
      targetPositionX = indexing.threeUnitPositions[clampedColumnIndex];
      targetColumn = clampedColumnIndex;
      // debug removed for perf
    }
    
    return {
      x: targetPositionX,
      column: targetColumn,
      isDualFurniture,
      zone: 'normal' // 단내림이 없는 경우 기본값
    };
  };

  const findAvailableSlot = (
    targetColumn: number,
    isDualFurniture: boolean,
    indexing: ReturnType<typeof calculateSpaceIndexing>,
    checkSlotOccupancy: (column: number, isDual: boolean) => boolean,
    placedModules: PlacedModule[]
  ): { column: number; x: number } | null => {
    const columnCount = indexing.columnCount;
    
    if (isDualFurniture) {
      // 듀얼 가구: 사용 가능한 듀얼 슬롯 찾기
      const maxDualIndex = columnCount - 2;
      
      // 현재 위치부터 오른쪽으로 검색
      for (let i = targetColumn; i <= maxDualIndex; i++) {
        if (!checkSlotOccupancy(i, true)) {
          const x = indexing.threeUnitDualPositions?.[i] ?? 
            indexing.threeUnitPositions[i] + 
            (indexing.threeUnitPositions[i + 1] - indexing.threeUnitPositions[i]) / 2;
          // debug removed for perf
          return { column: i, x };
        }
      }
      
      // 오른쪽에서 찾지 못하면 왼쪽으로 검색
      for (let i = targetColumn - 1; i >= 0; i--) {
        if (!checkSlotOccupancy(i, true)) {
          const x = indexing.threeUnitDualPositions?.[i] ?? 
            indexing.threeUnitPositions[i] + 
            (indexing.threeUnitPositions[i + 1] - indexing.threeUnitPositions[i]) / 2;
          // debug removed for perf
          return { column: i, x };
        }
      }
    } else {
      // 싱글 가구: 사용 가능한 싱글 슬롯 찾기
      const maxSingleIndex = columnCount - 1;
      
      // 현재 위치부터 오른쪽으로 검색
      for (let i = targetColumn; i <= maxSingleIndex; i++) {
        if (!checkSlotOccupancy(i, false)) {
          // debug removed for perf
          return { column: i, x: indexing.threeUnitPositions[i] };
        }
      }
      
      // 오른쪽에서 찾지 못하면 왼쪽으로 검색
      for (let i = targetColumn - 1; i >= 0; i--) {
        if (!checkSlotOccupancy(i, false)) {
          // debug removed for perf
          return { column: i, x: indexing.threeUnitPositions[i] };
        }
      }
    }
    
    // debug removed for perf
    return null;
  };

  return { calculateDropPosition, findAvailableSlot };
}; 
