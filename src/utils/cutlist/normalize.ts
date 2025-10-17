/**
 * Panel normalization utilities for CutList Optimizer
 */

export type Unit = 'mm' | 'cm' | 'in';
export type Grain = 'H' | 'V' | 'NONE' | undefined;

export interface RawPanel {
  id: string;
  label?: string;
  name?: string;
  width: number;
  height?: number;
  length?: number;
  depth?: number;
  thickness?: number;
  quantity?: number;
  material?: string;
  color?: string;
  grain?: Grain;
  canRotate?: boolean;
}

export interface NormalizedPanel {
  id: string;
  label: string;
  width: number;
  length: number;
  thickness: number;
  quantity: number;
  material: string;
  grain: 'H' | 'V' | 'NONE';
  canRotate: boolean;
}

/**
 * Convert units to millimeters
 */
export function convertToMm(value: number, fromUnit: Unit): number {
  switch (fromUnit) {
    case 'mm':
      return value;
    case 'cm':
      return value * 10;
    case 'in':
      return value * 25.4;
    default:
      return value;
  }
}

/**
 * Convert millimeters to target unit
 */
export function convertFromMm(value: number, toUnit: Unit): number {
  switch (toUnit) {
    case 'mm':
      return value;
    case 'cm':
      return value / 10;
    case 'in':
      return value / 25.4;
    default:
      return value;
  }
}

/**
 * Normalize panel dimensions - ensure width <= length
 * Returns swapped flag to adjust grain direction if needed
 */
export function normalizeDimensions(width: number, length: number): { width: number; length: number; swapped: boolean } {
  // CutList Optimizer convention: Length is always the longer dimension
  if (width > length) {
    return { width: length, length: width, swapped: true };
  }
  return { width, length, swapped: false };
}

/**
 * Normalize grain direction
 * If dimensions were swapped, grain direction should also swap (H <-> V)
 */
export function normalizeGrain(grain?: Grain, canRotate?: boolean, dimensionsSwapped?: boolean): 'H' | 'V' | 'NONE' {
  let normalizedGrain: 'H' | 'V' | 'NONE';

  if (canRotate === false && !grain) {
    // If rotation is not allowed and no grain specified, default to horizontal
    normalizedGrain = 'H';
  } else {
    normalizedGrain = grain || 'NONE';
  }

  // If dimensions were swapped, swap grain direction too
  if (dimensionsSwapped && normalizedGrain !== 'NONE') {
    return normalizedGrain === 'H' ? 'V' : 'H';
  }

  return normalizedGrain;
}

/**
 * Sanitize label for CSV export
 */
export function sanitizeLabel(label?: string): string {
  if (!label) return '';
  // Remove special characters that might break CSV
  return label
    .replace(/[",\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a single panel
 */
export function normalizePanel(panel: RawPanel, targetUnit: Unit = 'mm'): NormalizedPanel {
  // Get dimensions
  const rawWidth = panel.width || 0;
  const rawLength = panel.length || panel.height || panel.depth || 0;

  // Normalize dimensions (ensure width <= length)
  const { width, length, swapped } = normalizeDimensions(rawWidth, rawLength);

  // Convert units if needed (assuming input is in mm)
  const convertedWidth = convertFromMm(width, targetUnit);
  const convertedLength = convertFromMm(length, targetUnit);
  const convertedThickness = convertFromMm(panel.thickness || 18, targetUnit);

  return {
    id: panel.id,
    label: sanitizeLabel(panel.label || panel.name || `Panel_${panel.id}`),
    width: Math.round(convertedWidth * 10) / 10, // Round to 1 decimal
    length: Math.round(convertedLength * 10) / 10,
    thickness: Math.round(convertedThickness * 10) / 10,
    quantity: panel.quantity || 1,
    material: panel.material || 'PB',
    grain: normalizeGrain(panel.grain, panel.canRotate, swapped),
    canRotate: panel.canRotate !== false
  };
}

/**
 * Normalize a list of panels
 */
export function normalizePanels(panels: RawPanel[], targetUnit: Unit = 'mm'): NormalizedPanel[] {
  return panels.map(panel => normalizePanel(panel, targetUnit));
}

/**
 * Group panels by material
 */
export function groupPanelsByMaterial(panels: NormalizedPanel[]): Map<string, NormalizedPanel[]> {
  const groups = new Map<string, NormalizedPanel[]>();
  
  panels.forEach(panel => {
    const key = `${panel.material}_${panel.thickness}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(panel);
  });
  
  return groups;
}

/**
 * Calculate total area for panels
 */
export function calculateTotalArea(panels: NormalizedPanel[]): number {
  return panels.reduce((total, panel) => {
    const area = (panel.width * panel.length * panel.quantity) / 1000000; // Convert to m²
    return total + area;
  }, 0);
}

/**
 * Calculate total panel count
 */
export function calculateTotalCount(panels: NormalizedPanel[]): number {
  return panels.reduce((total, panel) => total + panel.quantity, 0);
}