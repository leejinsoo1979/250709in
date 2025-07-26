import { ModuleData } from '@/data/modules/shelving';
import { SpaceInfo } from '@/store/core/spaceConfigStore';

// 공통 훅
export { useBaseFurniture } from '../hooks/useBaseFurniture';

// 공통 컴포넌트들
export { default as BaseFurnitureShell } from '../components/BaseFurnitureShell';
export { default as SectionsRenderer } from '../components/SectionsRenderer';

// 공통 인터페이스 (재사용을 위해)
export interface FurnitureTypeProps {
  moduleData: ModuleData;
  color?: string;
  internalHeight?: number;
  hasDoor?: boolean;
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
} 