export interface Column {
  id: string;
  position: [number, number, number]; // Three.js units (meters)
  width: number; // mm
  height: number; // mm
  depth: number; // mm
  color: string;
  material: 'concrete' | 'steel' | 'wood';
  hasBackPanelFinish?: boolean; // 뒷면 패널 마감 여부
  hasFrontPanelFinish?: boolean; // 전면 패널 마감 여부
}

export interface Wall {
  id: string;
  position: [number, number, number]; // Three.js units (meters)
  width: number; // mm
  height: number; // mm
  depth: number; // mm
  color: string;
  material: 'concrete' | 'steel' | 'wood';
}

export interface PanelB {
  id: string;
  position: [number, number, number]; // Three.js units (meters)
  width: number; // mm
  height: number; // mm (18mm 고정)
  depth: number; // mm
  color: string;
  material: 'wood' | 'metal' | 'mdf';
  orientation: 'horizontal'; // 가로 프레임만
}

export interface StructureConfig {
  columns: Column[];
  walls: Wall[];
  panelBs?: PanelB[]; // 패널B 배열 추가
}