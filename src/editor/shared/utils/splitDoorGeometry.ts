import type { SectionConfig } from '@/data/modules';

export interface SplitDoorGeometryInput {
  moduleId: string;
  cabinetHeightMm: number;
  sections?: SectionConfig[];
  lowerDoorTopGap?: number;
  upperDoorBottomGap?: number;
  lowerDoorBottomGap?: number;
  upperDoorTopGap?: number;
  doorTopGap?: number;
  surroundType?: string;
  hasTopFrame?: boolean;
}

export interface SplitDoorGeometry {
  isPantrySplit: boolean;
  lowerSectionTopMm: number;
  upperSectionTopMm: number;
  lowerDoorTopMm: number;
  lowerDoorBottomMm: number;
  upperDoorBottomMm: number;
  upperDoorTopMm: number;
  lowerDoorHeightMm: number;
  upperDoorHeightMm: number;
  lowerDoorCenterFromBottomMm: number;
  upperDoorCenterFromBottomMm: number;
  splitGapMm: number;
}

export const resolveSplitDoorGeometry = ({
  moduleId,
  cabinetHeightMm,
  sections,
  lowerDoorTopGap,
  upperDoorBottomGap,
  lowerDoorBottomGap,
  upperDoorTopGap,
  doorTopGap,
  surroundType,
  hasTopFrame,
}: SplitDoorGeometryInput): SplitDoorGeometry => {
  const isPantrySplit = moduleId.includes('pantry-cabinet-split');
  const defaultLowerSectionTopMm = isPantrySplit ? 1825 : 860;
  const lowerSectionTopMm = Array.isArray(sections) && Number(sections[0]?.height) > 0
    ? Number(sections[0].height)
    : defaultLowerSectionTopMm;
  const upperSectionHeightMm = Array.isArray(sections) && Number(sections[1]?.height) > 0
    ? Number(sections[1].height)
    : undefined;
  const upperSectionTopMm = upperSectionHeightMm !== undefined
    ? Math.min(cabinetHeightMm, lowerSectionTopMm + upperSectionHeightMm)
    : cabinetHeightMm;

  const defaultLowerDoorTopGapMm = isPantrySplit ? -2 : -40;
  const defaultUpperDoorBottomGapMm = isPantrySplit ? -1 : 20;
  const effectiveLowerDoorTopGapMm = typeof lowerDoorTopGap === 'number'
    ? (lowerDoorTopGap === (isPantrySplit ? 2 : 40) ? defaultLowerDoorTopGapMm : lowerDoorTopGap)
    : defaultLowerDoorTopGapMm;
  const effectiveUpperDoorBottomGapMm = typeof upperDoorBottomGap === 'number'
    ? (
      (!isPantrySplit && upperDoorBottomGap === -20)
        ? defaultUpperDoorBottomGapMm
        : (isPantrySplit && upperDoorBottomGap === 1 ? defaultUpperDoorBottomGapMm : upperDoorBottomGap)
    )
    : defaultUpperDoorBottomGapMm;
  const effectiveLowerDoorBottomGapMm = lowerDoorBottomGap ?? 0;
  const shelfSplitDefaultUpperDoorTopGapMm = !isPantrySplit
    ? (surroundType === 'surround' && hasTopFrame !== false ? -3 : 5)
    : 0;
  const effectiveUpperDoorTopGapMm = typeof upperDoorTopGap === 'number'
    ? upperDoorTopGap
    : !isPantrySplit && (doorTopGap === undefined || doorTopGap === 0 || doorTopGap === 5 || doorTopGap === -3)
      ? shelfSplitDefaultUpperDoorTopGapMm
      : (doorTopGap ?? 0);

  const lowerDoorTopMm = lowerSectionTopMm + effectiveLowerDoorTopGapMm;
  const upperDoorBottomMm = lowerSectionTopMm - effectiveUpperDoorBottomGapMm;
  const lowerDoorBottomMm = -effectiveLowerDoorBottomGapMm;
  const upperDoorTopMm = upperSectionTopMm + effectiveUpperDoorTopGapMm;
  const lowerDoorHeightMm = lowerDoorTopMm - lowerDoorBottomMm;
  const upperDoorHeightMm = upperDoorTopMm - upperDoorBottomMm;

  return {
    isPantrySplit,
    lowerSectionTopMm,
    upperSectionTopMm,
    lowerDoorTopMm,
    lowerDoorBottomMm,
    upperDoorBottomMm,
    upperDoorTopMm,
    lowerDoorHeightMm,
    upperDoorHeightMm,
    lowerDoorCenterFromBottomMm: (lowerDoorTopMm + lowerDoorBottomMm) / 2,
    upperDoorCenterFromBottomMm: (upperDoorBottomMm + upperDoorTopMm) / 2,
    splitGapMm: Math.max(0, upperDoorBottomMm - lowerDoorTopMm),
  };
};
