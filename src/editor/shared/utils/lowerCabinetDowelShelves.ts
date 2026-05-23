import type { SectionConfig } from '@/data/modules/shelving';
import type { ShelfBoringPositionDetail } from '@/domain/boring/utils/calculateShelfBoringPositions';

export const isDirectLowerDowelShelfModule = (moduleId = '') => (
  moduleId.includes('lower-half-cabinet') ||
  moduleId.includes('dual-lower-half-cabinet') ||
  moduleId.includes('lower-door-lift-half') ||
  moduleId.includes('dual-lower-door-lift-half') ||
  moduleId.includes('lower-top-down-half') ||
  moduleId.includes('dual-lower-top-down-half')
) && !moduleId.includes('right-corner') && !moduleId.includes('left-corner');

export const hasDirectLowerTopPanel = (moduleId = '') => (
  moduleId.includes('lower-door-lift-half') ||
  moduleId.includes('dual-lower-door-lift-half') ||
  moduleId.includes('lower-top-down-half') ||
  moduleId.includes('dual-lower-top-down-half')
);

export const getDirectLowerDowelShelfPositionsMm = ({
  moduleId = '',
  cabinetHeightMm,
  basicThicknessMm,
  sections,
}: {
  moduleId?: string;
  cabinetHeightMm: number;
  basicThicknessMm: number;
  sections?: SectionConfig[];
}) => {
  if (!isDirectLowerDowelShelfModule(moduleId)) return [];

  const shelfSection = sections?.find(section => section?.type === 'shelf');
  const count = typeof shelfSection?.count === 'number' ? shelfSection.count : 2;
  if (count <= 0) return [];

  if (
    Array.isArray(shelfSection?.shelfPositions) &&
    shelfSection.shelfPositions.length === count
  ) {
    return shelfSection.shelfPositions.filter(position => position > 0);
  }

  let referenceHeightMm: number;
  if (moduleId.includes('lower-top-down-half') || moduleId.includes('dual-lower-top-down-half')) {
    referenceHeightMm = cabinetHeightMm - 120;
  } else if (hasDirectLowerTopPanel(moduleId)) {
    referenceHeightMm = cabinetHeightMm - basicThicknessMm * 2;
  } else {
    referenceHeightMm = cabinetHeightMm - basicThicknessMm;
  }

  const gap = referenceHeightMm / (count + 1);
  return Array.from({ length: count }, (_, index) => gap * (index + 1));
};

export const getDirectLowerDowelShelfBoringDetails = ({
  moduleId = '',
  cabinetHeightMm,
  basicThicknessMm,
  sections,
  shelfThicknessMm = 18,
}: {
  moduleId?: string;
  cabinetHeightMm: number;
  basicThicknessMm: number;
  sections?: SectionConfig[];
  shelfThicknessMm?: number;
}): ShelfBoringPositionDetail[] => (
  getDirectLowerDowelShelfPositionsMm({
    moduleId,
    cabinetHeightMm,
    basicThicknessMm,
    sections,
  }).map((positionMm, index) => ({
    y: Math.round((basicThicknessMm + positionMm - shelfThicknessMm / 2) * 1000) / 1000,
    type: 'movable-shelf',
    role: 'movable-shelf',
    roleIndex: index,
  }))
);
