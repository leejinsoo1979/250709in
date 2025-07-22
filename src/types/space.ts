export interface Column {
  id: string;
  position: [number, number, number]; // Three.js units (meters)
  width: number; // mm
  height: number; // mm
  depth: number; // mm
  color: string;
  material: 'concrete' | 'steel' | 'wood';
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

export interface StructureConfig {
  columns: Column[];
  walls: Wall[];
}