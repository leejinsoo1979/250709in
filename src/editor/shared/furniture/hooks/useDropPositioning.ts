import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
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
    
    // Three.js 좌표로 변환 (중앙이 0인 좌표계)
    const worldX = normalizedX * (spaceInfo.width / 2) * 0.01; // mm to Three.js units
    
    // 가구 데이터를 가져와서 폭 확인
    const moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
    if (!moduleData) {
      console.error('Module data not found:', currentDragData.moduleData.id);
      return null;
    }
    
    // 단내림이 활성화된 경우 영역별 처리
    if (spaceInfo.droppedCeiling?.enabled && indexing.zones) {
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      
      // 노서라운드의 경우 좌표 보정
      let coordinateOffset = 0;
      if (spaceInfo.surroundType === 'no-surround') {
        // 노서라운드에서는 중앙 정렬 대신 실제 위치 사용
        const totalWidth = spaceInfo.width;
        coordinateOffset = totalWidth / 2; // 중앙 기준을 왼쪽 끝으로 이동
      }
      
      // mm 단위로 변환하여 영역 확인
      const worldXMm = (worldX * 100) + coordinateOffset; // Three.js to mm with offset
      
      // 어느 영역에 속하는지 확인
      let zone: 'normal' | 'dropped';
      let zoneStartX: number;
      let zoneColumnCount: number;
      let zoneColumnWidth: number;
      
      // 노서라운드 보정된 좌표로 영역 판단
      const adjustedWorldXMm = spaceInfo.surroundType === 'no-surround' 
        ? worldXMm + (spaceInfo.width / 2) // 노서라운드는 중앙 기준으로 변환
        : worldXMm;
      
      if (zoneInfo.dropped && 
          adjustedWorldXMm >= zoneInfo.dropped.startX && 
          adjustedWorldXMm <= zoneInfo.dropped.startX + zoneInfo.dropped.width) {
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
      const relativeX = adjustedWorldXMm - zoneStartX;
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
        // 노서라운드의 경우 좌표 보정 제거 (이미 mm 단위에서 계산됨)
        targetPositionX = dualCenterMm * 0.01; // mm to Three.js
        targetColumn = dualPositionIndex;
        console.log(`🎯 [${zone}] Dual furniture position:`, {
          dualPositionIndex,
          targetPositionX,
          dualCenterMm,
          zoneStartX,
          adjustedWorldXMm,
          surroundType: spaceInfo.surroundType
        });
      } else {
        // 싱글가구: 단일 컬럼 중심에 배치
        const columnCenterMm = zoneStartX + (clampedColumnIndex * zoneColumnWidth) + (zoneColumnWidth / 2);
        // 노서라운드의 경우 좌표 보정 제거 (이미 mm 단위에서 계산됨)
        targetPositionX = columnCenterMm * 0.01; // mm to Three.js
        targetColumn = clampedColumnIndex;
        console.log(`🎯 [${zone}] Single furniture position:`, {
          clampedColumnIndex,
          targetPositionX,
          columnCenterMm,
          zoneStartX,
          adjustedWorldXMm,
          surroundType: spaceInfo.surroundType
        });
      }
      
      return {
        x: targetPositionX,
        column: targetColumn,
        isDualFurniture
      };
    }
    
    // 단내림이 없는 경우 기존 로직
    const columnCount = indexing.columnCount;
    const columnIndex = Math.floor((normalizedX + 1) * columnCount / 2);
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
      console.log('🎯 Dual furniture position (슬롯 경계):', dualPositionIndex, targetPositionX);
    } else {
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
          console.log('✅ Found available dual slot at:', i);
          return { column: i, x };
        }
      }
      
      // 오른쪽에서 찾지 못하면 왼쪽으로 검색
      for (let i = targetColumn - 1; i >= 0; i--) {
        if (!checkSlotOccupancy(i, true)) {
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
        if (!checkSlotOccupancy(i, false)) {
          console.log('✅ Found available single slot at:', i);
          return { column: i, x: indexing.threeUnitPositions[i] };
        }
      }
      
      // 오른쪽에서 찾지 못하면 왼쪽으로 검색
      for (let i = targetColumn - 1; i >= 0; i--) {
        if (!checkSlotOccupancy(i, false)) {
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