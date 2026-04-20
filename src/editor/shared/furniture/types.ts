import { ModuleData } from '@/data/modules';
import type { SectionConfig } from '@/data/modules/shelving';

// 커스터마이징 가구 내부 요소 타입
export type CustomElement =
  | { type: 'shelf'; heights: number[]; hasRod?: boolean; shelfMethod?: 'fixed' | 'dowel'; shelfFrontInset?: number }  // 선반 (각 선반의 바닥에서의 높이 mm, hasRod: 옷봉 추가, shelfMethod: 고정/다보, shelfFrontInset: 다보 앞 들여쓰기 mm)
  | { type: 'drawer'; heights: number[]; coverInset?: number; drawerAlign?: 'top' | 'bottom'; gapHeight?: number; maidaInsetTop?: number; maidaInsetBottom?: number; maidaInsetLeft?: number; maidaInsetRight?: number }  // 서랍 (각 서랍 높이 mm, coverInset: 덮개선반 앞 들여쓰기 mm 기본 60, drawerAlign: 위/아래 배치 기본 bottom, gapHeight: 서랍 간 갭 mm 기본 23.6, maidaInset*: 마이다 인셋 mm 기본 0)
  | { type: 'rod'; height: number; withShelf?: boolean; shelfGap?: number }  // 옷봉 (withShelf: 고정선반+옷봉, shelfGap: 상판~선반 간격 mm)
  | { type: 'pants'; height: number }         // 바지걸이 (설치 높이 mm, 하부섹션 전용)
  | { type: 'open' };                         // 비어있음

// 영역별 상하 서브분할 설정
export interface AreaSubSplit {
  enabled: boolean;
  lowerHeight: number;  // mm (하부 높이, 상부 = 영역높이 - 하부높이)
  upperElements?: CustomElement[];
  lowerElements?: CustomElement[];
}

// 좌우 섹션분할 (독립 박스) 설정
export interface SectionHorizontalSplit {
  position: number; // mm (내경 기준, 좌측 박스 내경 너비)
  secondPosition?: number; // mm (3분할 시, 중앙 박스 내경 너비)
  leftElements?: CustomElement[];  // undefined = 삭제됨 (빈 프레임)
  centerElements?: CustomElement[]; // 3분할 시 중앙 영역 (undefined = 삭제됨)
  rightElements?: CustomElement[]; // undefined = 삭제됨 (빈 프레임)
  // 서브 박스별 개별 깊이 (mm, undefined = 섹션 깊이 사용)
  leftDepth?: number;
  leftDepthDirection?: 'front' | 'back';
  centerDepth?: number;
  centerDepthDirection?: 'front' | 'back';
  rightDepth?: number;
  rightDepthDirection?: 'front' | 'back';
}

// 커스터마이징 가구 섹션 설정
export interface CustomSection {
  id: string;
  height: number; // mm (섹션 높이)
  enabled?: boolean; // 섹션 활성화 여부 (기본: true, false면 박스 프레임 없이 빈 공간)
  // 칸막이 (세로 칸막이 - 내부 얇은 칸막이, leaf 섹션에서만 사용)
  hasPartition?: boolean;
  partitionPosition?: number; // mm (왼쪽에서 칸막이까지 거리)
  partitionFrontInset?: number; // mm (칸막이 앞 오프셋, 기본 0)
  // 내부 요소 (칸막이 없으면 전체, 있으면 좌/우 각각)
  leftElements?: CustomElement[];
  rightElements?: CustomElement[];
  elements?: CustomElement[]; // 칸막이 없을 때 전체 영역
  // 영역별 상하 서브분할 (각 영역이 독립적으로 상하 분할 가능)
  areaSubSplits?: {
    [key: string]: AreaSubSplit; // 'full', 'left', 'right'
  };
  // 좌우 섹션분할 (독립 박스 - 칸막이와 다름)
  horizontalSplit?: SectionHorizontalSplit;
  // 섹션 개별 너비/정렬 (undefined = 전체 가구 너비 사용)
  width?: number;  // mm (섹션 개별 너비, 최소 100, 최대 furnitureWidth)
  align?: 'left' | 'center' | 'right';  // 정렬 (기본: 'center')
  // 마감 패널 (기본: true = 렌더링)
  showTopPanel?: boolean;    // 상판 마감 (기본: true)
  showBottomPanel?: boolean; // 하판 마감 (기본: true)
  topPanelDepthOffset?: number;     // 상판 Z 오프셋 (mm), 기본값 0 (양수=앞, 음수=뒤)
  bottomPanelDepthOffset?: number;  // 하판 Z 오프셋 (mm), 기본값 0 (양수=앞, 음수=뒤)
  bottomPanelRaise?: number; // 바닥판 올림 mm (>0이면 조절발 제거, 측판이 아래로 연장)
  showBackPanel?: boolean;   // 뒷벽 마감 (기본: true)
  // 영역별 마감 (칸막이/좌우분할 시 좌/우 독립 설정, undefined면 섹션 기본값 사용)
  areaFinish?: {
    [key: string]: { // 'left', 'right', 'center'
      showBackPanel?: boolean;
      bottomPanelRaise?: number;
    };
  };
}

// 커스터마이징 가구 내부 구조 설정
export interface CustomFurnitureConfig {
  sections: CustomSection[];
  panelThickness?: number; // mm (기본값: 18)
  // 상/하 분할
  splitDirection?: 'topBottom';
  splitPosition?: number; // mm (아래에서 거리)
  sectionGap?: number; // mm (상부/하부 섹션 사이 빈 공간, 기본값: 0)
}

// 기둥 관련 슬롯 메타데이터
export interface ColumnSlotMetadata {
  hasColumn: boolean;
  columnId?: string;
  columnPosition?: 'edge' | 'middle';
  availableWidth?: number;
  adjustedWidth?: number; // 기둥 침범 시 조정된 너비
  needsMullion?: boolean;
  mullionSide?: 'left' | 'right';
  wasConvertedFromDual?: boolean; // 듀얼→싱글 변환 여부
  originalDualSlots?: number[]; // 원래 점유 슬롯 (듀얼 변환 시)
  actualSlots?: number[]; // 실제 점유 슬롯
  doorWidth?: number; // 기둥 커버용 도어 너비 (mm)
  spaceType?: 'left' | 'right' | 'front' | 'full'; // 기둥 슬롯 내 배치 위치 (left: 왼쪽, right: 오른쪽, front: 기둥 앞)
  moduleOrder?: number; // 이 슬롯에서 몇 번째 모듈인지
  intrusionDirection?: 'from-left' | 'from-right' | 'center'; // 기둥 침범 방향
  furniturePosition?: 'left-aligned' | 'right-aligned' | 'center'; // 가구 배치 위치
}

// 배치된 모듈 타입
export interface PlacedModule {
  id: string;
  moduleId: string;
  /** 아일랜드 모드에서 가구가 속한 면 (front=앞면, back=반대편). 일반 모드에서는 undefined. */
  islandSide?: 'front' | 'back';
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
  doorTopGap?: number; // 가구 상단에서 위로의 갭 (mm, 기본값: 10)
  doorBottomGap?: number; // 가구 하단에서 아래로의 갭 (mm, 기본값: 65)
  
  // 사용자 정의 속성들
  customDepth?: number; // 사용자가 선택한 깊이 (mm)
  customHeight?: number; // 사용자가 선택한 높이 (mm)
  customWidth?: number; // 사용자가 선택한 너비 (mm) - 기둥 C 분할 시 사용
  adjustedWidth?: number; // 기둥 침범으로 조정된 폭 (mm)
  adjustedPosition?: { x: number; y: number; z: number }; // 기둥 침범으로 조정된 위치
  hingePosition?: 'left' | 'right'; // 힌지 위치 (기본값: 'right')
  hingeType?: 'A' | 'B'; // 경첩 타입 (A: 45mm, B: 48mm, 기본값: 'A')
  isSplit?: boolean; // 기둥 C 분할 배치 여부
  
  // 자유배치 모드 속성
  isFreePlacement?: boolean; // 자유배치 모드로 배치된 가구 여부
  freeWidth?: number;        // 자유배치 모드에서 사용자 지정 너비 (mm)
  freeHeight?: number;       // 자유배치 모드에서 사용자 지정 높이 (mm)
  freeDepth?: number;        // 자유배치 모드에서 사용자 지정 깊이 (mm)
  hasBase?: boolean;         // 자유배치 걸래받이 표시 여부 (기본: full/lower=true, upper=false)
  individualFloatHeight?: number; // 하부프레임 OFF 시 개별 띄움 높이 (mm, 기본 0)
  hasTopFrame?: boolean;     // 자유배치 상부프레임 표시 여부 (기본: full/upper=true, lower=false)
  topFrameThickness?: number; // 자유배치 상부프레임 두께 (mm, undefined = 공간 설정값 사용)
  hasBottomFrame?: boolean;  // 자유배치 하부프레임 표시 여부 (기본: full/lower=true, upper=false)
  topFrameOffset?: number;   // 자유배치 상부프레임 Z축 옵셋 (mm, 양수=앞, 음수=뒤)
  topFrameGap?: number;      // 상부프레임 천장 갭 (mm) — 천장 쪽에서 갭만큼 프레임 높이가 줄고 떠 있음
  baseFrameOffset?: number;  // 자유배치 하부프레임 Z축 옵셋 (mm, 양수=앞, 음수=뒤)
  baseFrameGap?: number;     // 하부프레임 바닥 갭 (mm) — 바닥 쪽에서 갭만큼 프레임 높이가 줄고 떠 있음
  baseFrameHeight?: number;  // 가구별 하부프레임(받침대) 높이 (mm, undefined = 공간 설정값 사용)
  removeUpperSafetyShelf?: boolean; // 상부 섹션 안전선반 제거 (코트장/붙박이장B/D) — 옷봉이 상판 하단에 직접 부착
  cabinetBodyHeight?: number; // 하부장 몸통 높이 (mm, undefined = 기본값 785, 범위 760~800)
  freeLeftGap?: number;      // 자유배치 노서라운드 좌측 이격거리 (mm)
  freeRightGap?: number;     // 자유배치 노서라운드 우측 이격거리 (mm)
  freeLeftGapLocked?: boolean;  // 좌측 이격 잠금 (너비 변경 시 유지)
  freeRightGapLocked?: boolean; // 우측 이격 잠금 (너비 변경 시 유지)

  // 엔드패널(EP) 설정
  hasLeftEndPanel?: boolean;     // 좌측 EP 표시 여부
  hasRightEndPanel?: boolean;    // 우측 EP 표시 여부
  endPanelThickness?: number;    // EP 두께 (mm, 기본값: 18)
  endPanelDepth?: number;        // EP 깊이 (mm, 기본값: 가구 깊이)
  endPanelDepthDirection?: 'front' | 'back'; // EP 깊이 확장 방향 (front: 앞으로, back: 뒤로, 기본: 'front')
  endPanelOffset?: number;       // EP 옵셋 (mm, 기본값: 0) — 하위호환용
  leftEndPanelOffset?: number;   // 좌측 EP 앞 옵셋 (mm, +늘림 -줄임)
  rightEndPanelOffset?: number;  // 우측 EP 앞 옵셋 (mm, +늘림 -줄임)
  leftEndPanelBackOffset?: number;  // 좌측 EP 뒤 옵셋 (mm, +늘림 -줄임)
  rightEndPanelBackOffset?: number; // 우측 EP 뒤 옵셋 (mm, +늘림 -줄임)
  leftEndPanelOffsetDir?: 'front' | 'back';  // (deprecated) 좌측 EP 옵셋 방향
  rightEndPanelOffsetDir?: 'front' | 'back'; // (deprecated) 우측 EP 옵셋 방향
  endPanelHeightMode?: 'floor' | 'furniture'; // EP 높이 모드 (floor: 바닥~천장, furniture: 가구 높이에 맞춤, 기본: 'floor')
  endPanelTopOffset?: number;    // EP 천장 옵셋 (mm, 기본값: 0) — floor 모드에서만 적용
  endPanelBottomOffset?: number; // EP 바닥 옵셋 (mm, 기본값: 0) — floor 모드에서만 적용

  // 슬롯 모드 사용자 지정 너비
  slotCustomWidth?: number; // 슬롯모드에서 사용자 지정 가구 너비 (mm)

  // 공간 변경 시 가구 보존을 위한 추가 속성들
  slotIndex?: number; // 가구가 위치한 슬롯 번호 (0부터 시작)
  isDualSlot?: boolean; // 듀얼 가구 여부 (2개 슬롯을 차지하는지)
  isValidInCurrentSpace?: boolean; // 현재 공간 설정에서 유효한지 여부
  zone?: 'normal' | 'dropped'; // 가구가 배치된 영역 (일반/단내림)
  
  // 기둥 포함 슬롯 관련 정보
  columnSlotInfo?: ColumnSlotMetadata; // 기둥이 포함된 슬롯 정보
  
  // Column C 듀얼 배치 관련
  subSlotPosition?: 'left' | 'right'; // Column C에서 서브슬롯 위치

  // 커스터마이징 가구 속성
  isCustomizable?: boolean;  // 커스터마이징 가구 여부
  customConfig?: CustomFurnitureConfig;  // 커스터마이징 설정 데이터
  customSections?: SectionConfig[];  // 표준 모듈 섹션 오버라이드 (선반장 등)

  // 기둥 C 배치 모드
  columnPlacementMode?: 'beside' | 'front'; // 'beside': 기둥 측면 배치 (기본), 'front': 기둥 앞에 배치 (기둥을 가림)

  // 섹션별 깊이 설정 (2섹션 가구용)
  lowerSectionDepth?: number; // 하부 섹션 깊이 (mm)
  upperSectionDepth?: number; // 상부 섹션 깊이 (mm)
  lowerSectionDepthDirection?: 'front' | 'back'; // 하부 섹션 깊이 줄이는 방향 (front: 앞에서, back: 뒤에서, 기본: front)
  upperSectionDepthDirection?: 'front' | 'back'; // 상부 섹션 깊이 줄이는 방향 (front: 앞에서, back: 뒤에서, 기본: front)

  // 하부 섹션 칸막이 좌/우 독립 깊이 (칸막이가 있을 때만 사용)
  lowerLeftSectionDepth?: number;  // 하부 좌측 영역 깊이 (mm)
  lowerRightSectionDepth?: number; // 하부 우측 영역 깊이 (mm)

  // 하부장 상부패널 오프셋 (2섹션 가구용)
  lowerSectionTopOffset?: number; // 하부 섹션 상판 Z축 오프셋 (mm) - 0: 상부섹션 바닥판과 같은 위치, 양수: 앞쪽으로 줄어듦

  // 백패널 두께 설정 (기본값: 9mm)
  backPanelThickness?: number; // 백패널 두께 (mm) - 3, 5, 9 중 선택

  // 텍스처 결 방향 설정 (패널별 개별 제어)
  panelGrainDirections?: {
    [panelName: string]: 'horizontal' | 'vertical'; // 패널 이름별 결 방향
  };

  // 도어 셋팅 (자유배치 모드)
  doorSettingMode?: 'auto' | 'manual'; // 자동/수동 모드 (기본값: 'auto')
  doorOverlayLeft?: number;   // 도어 좌측 확장 (mm, 기본값: 0)
  doorOverlayRight?: number;  // 도어 우측 확장 (mm, 기본값: 0)
  doorOverlayTop?: number;    // 도어 상단 확장 (mm, 기본값: 0)
  doorOverlayBottom?: number; // 도어 하단 확장 (mm, 기본값: 0)

  // 상판 따내기 (상부장 코너 노치)
  topPanelNotchSize?: '680x140' | '340x140';  // 상판 따내기 크기
  topPanelNotchSide?: 'left' | 'right';       // 따내기 위치 (기본: right)

  // 인조대리석 상판설치 (하부장 전용)
  stoneTopThickness?: 0 | 10 | 20 | 30;       // 인조대리석 두께 (0=없음, 기본: 0)
  stoneTopFrontOffset?: number;                 // 앞 오프셋 (mm, 기본: 0)
  stoneTopBackOffset?: number;                  // 뒤 오프셋 (mm, 기본: 0)
  stoneTopLeftOffset?: number;                  // 좌 오프셋 (mm, 기본: 0)
  stoneTopRightOffset?: number;                 // 우 오프셋 (mm, 기본: 0)
  stoneTopBackLip?: number;                      // 뒷턱 높이 (mm, 0=없음, 기본: 0)
  stoneTopBackLipThickness?: number;             // 뒷턱 두께 (mm, 미설정 시 stoneTopThickness 사용)
  stoneTopBackLipDepthOffset?: number;            // 뒷턱 전체 뒤→앞 옵셋 (mm, 기본: 0)
  stoneTopBackLipTopOffset?: number;             // 뒷턱 상판(덮개) 앞 옵셋 (mm, 돌출 길이, 기본: 20)
  stoneTopBackLipTopBackOffset?: number;         // 뒷턱 상판(덮개) 뒤 옵셋 (mm, 돌출 길이, 기본: 0)
  stoneTopBackLipFullFill?: boolean;             // 다채움 활성화 여부 (true 시, 옵셋된 뒷턱 덮개 뒤쪽으로만 상판을 천장까지 올림)
  stoneTopBackLipFillHeight?: number;            // 다채움 시 뒷벽을 채워야 할 전체 절대 높이 목표값 (mm)
  stoneTopBackLipLeftOffset?: number;            // (deprecated) 뒷턱 좌측 오프셋
  stoneTopBackLipRightOffset?: number;           // (deprecated) 뒷턱 우측 오프셋

  // 서라운드 패널 속성
  isSurroundPanel?: boolean;              // 서라운드 패널 여부
  surroundPanelType?: 'left' | 'right' | 'top';  // 패널 방향
  surroundPanelWidth?: number;            // 패널 폭 (mm, 사용자 지정)
  surroundOffsetLeft?: number;            // 좌측 옵셋 (mm)
  surroundOffsetRight?: number;           // 우측 옵셋 (mm)
  surroundOffsetTop?: number;             // 상단 옵셋 (mm)
  surroundOffsetBottom?: number;          // 하단 옵셋 (mm)
  surroundOffsetDepth?: number;           // 깊이 옵셋 (mm)

  // 린트 오류 해결을 위한 추가 누락 속성들
  isLocked?: boolean;                     // 잠금 상태
  doorSplit?: 'none' | 'vertical' | 'horizontal'; // 도어 분할 방식
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
  isFreePlacement?: boolean;
  freeDimensions?: {
    width: number;
    height: number;
    depth: number;
  };
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
