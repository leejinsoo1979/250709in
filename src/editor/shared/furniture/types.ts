import { ModuleData } from '@/data/modules';

// 배치된 모듈 타입
export interface PlacedModule {
  id: string;
  moduleId: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: number;
  hasDoor?: boolean; // 실제 도어 설치 여부 (기본값: false - 도어 없음)
  
  // 사용자 정의 속성들
  customDepth?: number; // 사용자가 선택한 깊이 (mm)
  hingePosition?: 'left' | 'right'; // 힌지 위치 (기본값: 'right')
  
  // 공간 변경 시 가구 보존을 위한 추가 속성들
  slotIndex?: number; // 가구가 위치한 슬롯 번호 (0부터 시작)
  isDualSlot?: boolean; // 듀얼 가구 여부 (2개 슬롯을 차지하는지)
  isValidInCurrentSpace?: boolean; // 현재 공간 설정에서 유효한지 여부
}

// 네이티브 드래그앤드롭용 현재 드래그 데이터 타입
export interface CurrentDragData {
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

// 드래그 미리보기 데이터 타입
export interface DragPreviewData {
  moduleData: ModuleData;
  targetColumn: number;
  isBlocked: boolean;
}

// 드롭 영역 타입
export interface DropZone {
  id: string;
  type: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  bounds: {
    width: number;
    height: number;
    depth: number;
  };
}

// 드래그 상태 타입
export interface DragState {
  isDragging: boolean;
  dragItem: CurrentDragData | null;
}

// 컬럼 드롭 타겟 타입
export interface ColumnDropTarget {
  columnIndex: number;
  position: {
    x: number;
    y: number;
    z: number;
  };
} 