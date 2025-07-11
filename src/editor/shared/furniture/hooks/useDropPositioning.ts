import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById } from '@/data/modules';

interface DropPosition {
  x: number;
  column: number;
  isDualFurniture: boolean;
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
    const normalizedX = (mouseX / rect.width) * 2 - 1;
    
    // 컬럼 인덱스 계산
    const columnCount = indexing.columnCount;
    const columnIndex = Math.floor((normalizedX + 1) * columnCount / 2);
    const clampedColumnIndex = Math.max(0, Math.min(columnIndex, columnCount - 1));
    
    // 가구 데이터를 가져와서 폭 확인
    const moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
    if (!moduleData) {
      console.error('Module data not found:', currentDragData.moduleData.id);
      return null;
    }
    
    // 컬럼 너비와 비교하여 듀얼가구인지 판단
    const columnWidth = indexing.columnWidth;
    const isDualFurniture = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50; // 50mm 허용 오차
    
    let targetPositionX: number;
    let targetColumn: number;
    
    if (isDualFurniture) {
      // 듀얼가구: 두 컬럼의 경계 중심에 배치 (슬롯 간 경계점)
      // 가능한 듀얼 위치 인덱스 계산 (0부터 columnCount-2까지)
      const dualPositionIndex = Math.max(0, Math.min(clampedColumnIndex, columnCount - 2));
      if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[dualPositionIndex] !== undefined) {
        targetPositionX = indexing.threeUnitDualPositions[dualPositionIndex];
      } else {
        // fallback: 수동으로 계산
        targetPositionX = indexing.threeUnitPositions[dualPositionIndex] + 
          (indexing.threeUnitPositions[dualPositionIndex + 1] - indexing.threeUnitPositions[dualPositionIndex]) / 2;
      }
      targetColumn = dualPositionIndex;
      console.log('🎯 Dual furniture position (슬롯 경계):', dualPositionIndex, targetPositionX);
    } else {
      // 싱글가구: 단일 컬럼 중심에 배치
      targetPositionX = indexing.threeUnitPositions[clampedColumnIndex];
      targetColumn = clampedColumnIndex;
      console.log('🎯 Single furniture position:', clampedColumnIndex, targetPositionX);
    }
    
    return {
      x: targetPositionX,
      column: targetColumn,
      isDualFurniture
    };
  };

  const findAvailableSlot = (
    targetColumn: number,
    isDualFurniture: boolean,
    indexing: ReturnType<typeof calculateSpaceIndexing>,
    checkSlotOccupancy: (column: number, isDual: boolean, indexing: ReturnType<typeof calculateSpaceIndexing>, modules: PlacedModule[]) => boolean,
    placedModules: PlacedModule[]
  ): { column: number; x: number } | null => {
    const columnCount = indexing.columnCount;
    
    if (isDualFurniture) {
      // 듀얼 가구: 사용 가능한 듀얼 슬롯 찾기
      const maxDualIndex = columnCount - 2;
      
      // 현재 위치부터 오른쪽으로 검색
      for (let i = targetColumn; i <= maxDualIndex; i++) {
        if (!checkSlotOccupancy(i, true, indexing, placedModules)) {
          const x = indexing.threeUnitDualPositions?.[i] ?? 
            indexing.threeUnitPositions[i] + 
            (indexing.threeUnitPositions[i + 1] - indexing.threeUnitPositions[i]) / 2;
          console.log('✅ Found available dual slot at:', i);
          return { column: i, x };
        }
      }
      
      // 오른쪽에서 찾지 못하면 왼쪽으로 검색
      for (let i = targetColumn - 1; i >= 0; i--) {
        if (!checkSlotOccupancy(i, true, indexing, placedModules)) {
          const x = indexing.threeUnitDualPositions?.[i] ?? 
            indexing.threeUnitPositions[i] + 
            (indexing.threeUnitPositions[i + 1] - indexing.threeUnitPositions[i]) / 2;
          console.log('✅ Found available dual slot at:', i);
          return { column: i, x };
        }
      }
    } else {
      // 싱글 가구: 사용 가능한 싱글 슬롯 찾기
      const maxSingleIndex = columnCount - 1;
      
      // 현재 위치부터 오른쪽으로 검색
      for (let i = targetColumn; i <= maxSingleIndex; i++) {
        if (!checkSlotOccupancy(i, false, indexing, placedModules)) {
          console.log('✅ Found available single slot at:', i);
          return { column: i, x: indexing.threeUnitPositions[i] };
        }
      }
      
      // 오른쪽에서 찾지 못하면 왼쪽으로 검색
      for (let i = targetColumn - 1; i >= 0; i--) {
        if (!checkSlotOccupancy(i, false, indexing, placedModules)) {
          console.log('✅ Found available single slot at:', i);
          return { column: i, x: indexing.threeUnitPositions[i] };
        }
      }
    }
    
    console.log('❌ No available slots found');
    return null;
  };

  return { calculateDropPosition, findAvailableSlot };
}; 