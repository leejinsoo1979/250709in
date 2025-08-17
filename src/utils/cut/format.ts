import type { CutStep as OldCutStep, Unit } from '@/types/cutlist';
import type { CutStep, Size } from '@/types/cut';

// Helper function for formatting Size
const s = (z?: Size | null) => z ? `${Math.round(z.w)}×${Math.round(z.l)}` : '-';

// New format functions for the updated CutStep type
export const fmtCut = (c: CutStep) => `${c.axis}=${Math.round(c.pos)}`; // 'x=460' | 'y=1000'

export const fmtResult = (c: CutStep) => `${s(c.made)} \\ ${c.surplus ? `surplus ${s(c.surplus)}` : '-'}`;

export const fmtPanel = (z: Size) => s(z);

/**
 * 재단 단계의 라벨을 포맷팅 (기존 함수)
 */
export function formatCutLabel(c: OldCutStep, unit: Unit = 'mm'): string {
  const icon = c.axis === 'x' ? '↕' : '↔';
  const pos = Math.round(c.pos);
  const a = Math.round(c.spanStart);
  const b = Math.round(c.spanEnd);
  const L = Math.max(0, b - a);
  
  return `${icon} ${c.axis}=${pos} · ${a}–${b} · L=${L}${unit}`;
}

/**
 * 워크피스 크기를 포맷팅
 */
export function formatSize(width: number, length: number): string {
  return `${Math.round(width)}×${Math.round(length)}`;
}

/**
 * 재단 정보를 한글로 포맷팅
 */
export function formatCutInfo(c: OldCutStep): string {
  const direction = c.axis === 'x' ? '세로' : '가로';
  const pos = Math.round(c.pos);
  const length = Math.round(c.spanEnd - c.spanStart);
  
  return `${direction} ${pos}mm (길이: ${length}mm)`;
}