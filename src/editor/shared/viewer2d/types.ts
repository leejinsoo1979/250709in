import { PlacedModule } from '@/store/core/furnitureStore';
import { Column, Wall, PanelB } from '@/store/core/spaceConfigStore';

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

export interface Space2DKonvaViewProps {
  width?: number;
  height?: number;
  viewMode?: '2D' | '3D';
  showGrid?: boolean;
  showDimensions?: boolean;
  showFurniture?: boolean;
}

export interface FurnitureItem2DProps {
  item: PlacedModule;
  scale: number;
  isSelected: boolean;
  isDragging: boolean;
  onSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, x: number, z: number) => void;
  onRotate: (id: string, rotation: number) => void;
  onDelete?: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  mmToPixels: (mm: number) => number;
}

export interface Grid2DProps {
  width: number;
  height: number;
  gridSize: number;
  scale: number;
  showLabels?: boolean;
  labelInterval?: number;
  color?: string;
  opacity?: number;
}

export interface ViewerToolbar2DProps {
  showGrid: boolean;
  showDimensions: boolean;
  showFurniture: boolean;
  showColumns: boolean;
  showWalls: boolean;
  tool: 'select' | 'pan' | 'measure';
  scale: number;
  onToggleGrid: () => void;
  onToggleDimensions: () => void;
  onToggleFurniture: () => void;
  onToggleColumns: () => void;
  onToggleWalls: () => void;
  onToolChange: (tool: 'select' | 'pan' | 'measure') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onExport?: () => void;
  onImport?: () => void;
}

export interface DragState {
  isDragging: boolean;
  draggedItemId: string | null;
  startPosition: { x: number; y: number } | null;
  currentPosition: { x: number; y: number } | null;
}

export interface SelectionState {
  selectedItems: string[];
  selectionBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface MeasurementPoint {
  x: number;
  y: number;
}

export interface MeasurementState {
  isActive: boolean;
  startPoint: MeasurementPoint | null;
  endPoint: MeasurementPoint | null;
  distance: number | null;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  targetId: string | null;
  targetType: 'furniture' | 'column' | 'wall' | null;
}

export interface SnapGuide {
  type: 'vertical' | 'horizontal';
  position: number;
  active: boolean;
}

export interface SnappingState {
  enabled: boolean;
  threshold: number;
  guides: SnapGuide[];
}