import { ModuleData } from '@/data/modules/shelving';
import { SpaceInfo } from '@/store/core/spaceConfigStore';

// 공통 훅
export { useBaseFurniture } from '../hooks/useBaseFurniture';

// 공통 컴포넌트들
export { default as BaseFurnitureShell } from '../components/BaseFurnitureShell';
export { default as SectionsRenderer } from '../components/SectionsRenderer';
export { default as BoxWithEdges } from '../components/BoxWithEdges';

// 공통 인터페이스 (재사용을 위해)
export interface FurnitureTypeProps {
  moduleData: ModuleData;
  color?: string;
  internalHeight?: number;
  hasDoor?: boolean;
  hasBackPanel?: boolean; // 백패널 유무 추가
  customDepth?: number;
  hingePosition?: 'left' | 'right';
  spaceInfo?: SpaceInfo;
  isDragging?: boolean;
  isEditMode?: boolean; // 편집 모드 여부
  doorWidth?: number; // 도어 너비 (사용하지 않음 - 도어는 항상 원래 슬롯 크기)
  doorXOffset?: number; // 도어 위치 보정값 (사용하지 않음)
  originalSlotWidth?: number; // 원래 슬롯 너비 (mm)
  slotCenterX?: number; // 원래 슬롯 중심 X 좌표 (Three.js 단위)
  adjustedWidth?: number; // 기둥/엔드판넬에 의해 조정된 폭 (mm)
  slotWidths?: number[]; // 듀얼 가구의 개별 슬롯 너비들 (mm)
  slotIndex?: number; // 슬롯 인덱스 (노서라운드 모드에서 엔드패널 확장 판단용)
  slotInfo?: any; // 슬롯 정보 (기둥 침범 여부 포함)
  viewMode?: '2D' | '3D';
  renderMode?: 'solid' | 'wireframe';
  showFurniture?: boolean; // 가구 본체 표시 여부 (2D 모드에서 도어만 표시할 때 사용)
  isHighlighted?: boolean; // 가구 강조 여부
  furnitureId?: string; // 가구 ID (인접 확인용)
  adjacentCabinets?: { hasAdjacentUpperLower: boolean; adjacentSide: 'left' | 'right' | null }; // 인접 상하부장 정보
  placedFurnitureId?: string; // 배치된 가구의 고유 ID (치수 편집용)
  customSections?: SectionConfig[]; // 사용자 정의 섹션 설정
  visibleSectionIndex?: number | null; // 듀얼 가구 섹션 필터링 (0: 좌측, 1: 우측, null: 전체)
  doorTopGap?: number; // 가구 상단에서 위로의 갭 (mm, 기본값: 5)
  doorBottomGap?: number; // 가구 하단에서 아래로의 갭 (mm, 기본값: 45)
  lowerSectionDepth?: number; // 하부 섹션 깊이 (mm)
  upperSectionDepth?: number; // 상부 섹션 깊이 (mm)
  doorSplit?: boolean; // 도어 분할 여부 (기본값: false - 병합)
  upperDoorTopGap?: number; // 상부 섹션 도어 상단 갭 (분할 모드, 기본값: 5)
  upperDoorBottomGap?: number; // 상부 섹션 도어 하단 갭 (분할 모드, 기본값: 0)
  lowerDoorTopGap?: number; // 하부 섹션 도어 상단 갭 (분할 모드, 기본값: 0)
  lowerDoorBottomGap?: number; // 하부 섹션 도어 하단 갭 (분할 모드, 기본값: 45)
  // 이벤트 핸들러 추가
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
  onDoubleClick?: (e: any) => void;
} 