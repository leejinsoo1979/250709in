import type { ModuleData } from '@/data/modules';

/**
 * 상부 안전선반 제거 대상 모듈 판정
 * - 코트장(single-2drawer-hanging / dual-2drawer-hanging)
 * - 붙박이장 B(single-2hanging / dual-2hanging)
 * - 붙박이장 D(single-4drawer-hanging / dual-4drawer-hanging)
 */
export const isUpperSafetyShelfModule = (moduleId?: string | null): boolean => {
  if (!moduleId) return false;
  return (
    moduleId.includes('2drawer-hanging') ||
    moduleId.includes('2hanging') ||
    moduleId.includes('4drawer-hanging')
  );
};

/**
 * 안전선반이 있는 상부 hanging 섹션의 shelfPositions에서
 * "안전선반 위치(값>0인 큰 값)"만 제거하여 섹션 배열 반환.
 * - 치수 표시용 `shelfPositions: [0]`은 보존
 * - 코트장(하부 drawer + 상부 hanging)은 index 1 섹션이 상부
 * - 붙박이장B(하부 hanging + 상부 hanging)은 index 1 섹션이 상부
 */
export const applyRemoveUpperSafetyShelf = <T extends { type: string; shelfPositions?: number[]; count?: number }>(
  sections: T[] | undefined,
): T[] | undefined => {
  if (!sections || sections.length === 0) return sections;
  // 마지막 hanging 섹션이 상부 섹션
  let upperIndex = -1;
  for (let i = sections.length - 1; i >= 0; i--) {
    if (sections[i].type === 'hanging') { upperIndex = i; break; }
  }
  if (upperIndex < 0) return sections;

  return sections.map((s, idx) => {
    if (idx !== upperIndex) return s;
    const positions = s.shelfPositions ?? [];
    // 0 (치수 표시용)은 유지, 그 외(안전선반 실제 위치)는 제거
    const filtered = positions.filter(p => p <= 0);
    const next: any = { ...s, shelfPositions: filtered };
    // count도 같이 조정: 안전선반 1개만 있던 경우 count 제거
    if (s.count === 1 && positions.some(p => p > 0) && filtered.length === 0) {
      delete next.count;
    }
    return next as T;
  });
};

/**
 * moduleData를 복제하여 상부 안전선반을 제거한 새 ModuleData 반환.
 * removeUpperSafetyShelf=false면 원본 그대로 반환.
 */
export const withUpperSafetyShelfRemoved = (
  moduleData: ModuleData,
  removeUpperSafetyShelf?: boolean,
): ModuleData => {
  if (!removeUpperSafetyShelf) return moduleData;
  if (!isUpperSafetyShelfModule(moduleData.id)) return moduleData;
  const sections = moduleData.modelConfig?.sections;
  if (!sections) return moduleData;
  const nextSections = applyRemoveUpperSafetyShelf(sections);
  return {
    ...moduleData,
    modelConfig: {
      ...moduleData.modelConfig,
      sections: nextSections,
    },
  } as ModuleData;
};
