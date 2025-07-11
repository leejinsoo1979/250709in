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
} 