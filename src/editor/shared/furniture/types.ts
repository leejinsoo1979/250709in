import { ModuleData } from '@/data/modules';

// 기둥 관련 슬롯 메타데이터
export interface ColumnSlotMetadata {
  hasColumn: boolean;
  columnId?: string;
  columnPosition?: 'edge' | 'middle';
  availableWidth?: number;
  needsMullion?: boolean;
  mullionSide?: 'left' | 'right';
  wasConvertedFromDual?: boolean; // 듀얼→싱글 변환 여부
  originalDualSlots?: number[]; // 원래 점유 슬롯 (듀얼 변환 시)
  actualSlots?: number[]; // 실제 점유 슬롯
  doorWidth?: number; // 기둥 커버용 도어 너비 (mm)
  spaceType?: 'full' | 'front'; // Column C의 공간 타입
  moduleOrder?: number; // 이 슬롯에서 몇 번째 모듈인지
}

// 배치된 모듈 타입
export interface PlacedModule {
  id: string;
  moduleId: string;
  baseModuleType?: string; // 너비를 제외한 기본 모듈 타입 (예: 'single-2drawer-hanging', 'upper-cabinet-shelf')
  moduleWidth?: number; // 실제 모듈 너비 (mm)
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: number;
  hasDoor?: boolean; // 실제 도어 설치 여부 (기본값: false - 도어 없음)
  hasBackPanel?: boolean; // 가구 내부 백패널 유무 (기본값: true)
  hasGapBackPanel?: boolean; // 상하부장 사이 갭 백패널 유무 (기본값: false)
  doorSplit?: boolean; // 도어 분할 여부 (기본값: false - 병합, true - 분할)
  doorTopGap?: number; // 가구 상단에서 위로의 갭 (mm, 기본값: 10) - 병합 모드 또는 상부 섹션
  doorBottomGap?: number; // 가구 하단에서 아래로의 갭 (mm, 기본값: 65) - 병합 모드 또는 하부 섹션
  upperDoorTopGap?: number; // 상부 섹션 도어 상단 갭 (분할 모드용, 기본값: 5)
  upperDoorBottomGap?: number; // 상부 섹션 도어 하단 갭 (분할 모드용, 기본값: 0)
  lowerDoorTopGap?: number; // 하부 섹션 도어 상단 갭 (분할 모드용, 기본값: 0)
  lowerDoorBottomGap?: number; // 하부 섹션 도어 하단 갭 (분할 모드용, 기본값: 45)
  
  // 사용자 정의 속성들
  customDepth?: number; // 사용자가 선택한 깊이 (mm)
  customHeight?: number; // 사용자가 선택한 높이 (mm)
  customWidth?: number; // 사용자가 선택한 너비 (mm) - 기둥 C 분할 시 사용
  adjustedWidth?: number; // 기둥 침범으로 조정된 폭 (mm)
  adjustedPosition?: { x: number; y: number; z: number }; // 기둥 침범으로 조정된 위치
  hingePosition?: 'left' | 'right'; // 힌지 위치 (기본값: 'right')
  isSplit?: boolean; // 기둥 C 분할 배치 여부
  
  // 공간 변경 시 가구 보존을 위한 추가 속성들
  slotIndex?: number; // 가구가 위치한 슬롯 번호 (0부터 시작)
  isDualSlot?: boolean; // 듀얼 가구 여부 (2개 슬롯을 차지하는지)
  isValidInCurrentSpace?: boolean; // 현재 공간 설정에서 유효한지 여부
  zone?: 'normal' | 'dropped'; // 가구가 배치된 영역 (일반/단내림)
  
  // 기둥 포함 슬롯 관련 정보
  columnSlotInfo?: ColumnSlotMetadata; // 기둥이 포함된 슬롯 정보
  
  // Column C 듀얼 배치 관련
  subSlotPosition?: 'left' | 'right'; // Column C에서 서브슬롯 위치

  // 섹션별 깊이 설정 (2섹션 가구용)
  lowerSectionDepth?: number; // 하부 섹션 깊이 (mm)
  upperSectionDepth?: number; // 상부 섹션 깊이 (mm)

  // 하부장 상부패널 오프셋 (2섹션 가구용)
  lowerSectionTopOffset?: number; // 하부 섹션 상판 Z축 오프셋 (mm) - 0: 상부섹션 바닥판과 같은 위치, 양수: 앞쪽으로 줄어듦

  // 텍스처 결 방향 설정 (패널별 개별 제어)
  panelGrainDirections?: {
    [panelName: string]: 'horizontal' | 'vertical'; // 패널 이름별 결 방향
  };
}

// 네이티브 드래그앤드롭용 현재 드래그 데이터 타입
export interface CurrentDragData {
  type?: string;
  moduleData?: {
    id: string;
    name: string;
    dimensions: { width: number; height: number; depth: number };
    type: string;
    color?: string;
    hasDoor?: boolean;
  };
  // 커스텀 가구용 필드
  moduleId?: string;
  isDualSlot?: boolean;
  zone?: 'normal' | 'dropped';
  indexing?: any;
  isCustomFurniture?: boolean;
  customFurnitureData?: {
    id: string;
    name: string;
    category: 'full' | 'upper' | 'lower';
    originalDimensions: {
      width: number;
      height: number;
      depth: number;
    };
    panels?: any[];
    scaleMode?: 'uniform' | 'non-uniform' | 'fixed';
    thumbnail?: string;
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
