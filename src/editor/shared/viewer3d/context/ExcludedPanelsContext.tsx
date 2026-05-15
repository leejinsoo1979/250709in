import { create } from 'zustand';

/**
 * 옵티마이저에서 체크 해제된 패널의 복합키(furnitureId::panelName)를 저장하는 Zustand store.
 * React Context는 R3F <Canvas>의 별도 reconciler에서 접근 불가하므로 Zustand 사용.
 * NOTE: R3F 내부 컴포넌트(BoxWithEdges)는 useFrame에서 getState()로 직접 읽음 —
 * Zustand hook 구독은 DOM/R3F 간 reconciler 차이로 리렌더를 트리거하지 못함.
 */
interface ExcludedPanelsState {
  excludedKeys: Set<string>;
  excludedKeysByOwner: Map<string, Set<string>>;
  setExcludedKeys: (keys: Set<string>, ownerId?: string) => void;
  clearExcludedKeys: (ownerId?: string) => void;
}

const DEFAULT_OWNER_ID = 'default';

function mergeOwnerKeys(keysByOwner: Map<string, Set<string>>): Set<string> {
  const merged = new Set<string>();
  keysByOwner.forEach((keys) => {
    keys.forEach(key => merged.add(key));
  });
  return merged;
}

export const useExcludedPanelsStore = create<ExcludedPanelsState>((set) => ({
  excludedKeys: new Set<string>(),
  excludedKeysByOwner: new Map<string, Set<string>>(),
  setExcludedKeys: (keys, ownerId = DEFAULT_OWNER_ID) => set((state) => {
    const nextByOwner = new Map(state.excludedKeysByOwner);
    nextByOwner.set(ownerId, new Set(keys));
    return {
      excludedKeysByOwner: nextByOwner,
      excludedKeys: mergeOwnerKeys(nextByOwner),
    };
  }),
  clearExcludedKeys: (ownerId = DEFAULT_OWNER_ID) => set((state) => {
    const nextByOwner = new Map(state.excludedKeysByOwner);
    nextByOwner.delete(ownerId);
    return {
      excludedKeysByOwner: nextByOwner,
      excludedKeys: mergeOwnerKeys(nextByOwner),
    };
  }),
}));

/** BoxWithEdges에서 사용: 현재 제외된 패널 키 Set 반환 */
export function useExcludedPanels(): Set<string> {
  return useExcludedPanelsStore((s) => s.excludedKeys);
}

/**
 * CNC cutlist와 3D 렌더러 사이에서 이름이 다르게 쓰이는 패널명을 보정한다.
 * 예: "바닥" ↔ "바닥판", "터치서랍1 바닥판" ↔ "터치1단서랍 바닥판".
 */
export function getExcludedPanelAliases(panelName: string): string[] {
  const aliases = new Set<string>();
  const trimmed = panelName.trim();
  if (!trimmed) return [];

  aliases.add(trimmed);

  const withoutFurnitureLabel = trimmed.replace(/^\[\d+\]\s*/, '');
  aliases.add(withoutFurnitureLabel);

  const frameMatch = withoutFurnitureLabel.match(/^(top-frame|base-frame)-\d+$/);
  if (frameMatch) aliases.add(frameMatch[1]);

  if (withoutFurnitureLabel === '바닥') aliases.add('바닥판');
  if (withoutFurnitureLabel === '바닥판') aliases.add('바닥');
  if (withoutFurnitureLabel.endsWith(' 바닥')) aliases.add(withoutFurnitureLabel.replace(/ 바닥$/, ' 바닥판'));
  if (withoutFurnitureLabel.endsWith(' 바닥판')) aliases.add(withoutFurnitureLabel.replace(/ 바닥판$/, ' 바닥'));

  if (withoutFurnitureLabel.includes('후면 보강대')) {
    aliases.add(withoutFurnitureLabel.replace('후면 보강대', '보강대').trim());
  }

  const lowerStretcherMatch = withoutFurnitureLabel.match(/^가로전대\(하(\d+)\)$/);
  if (lowerStretcherMatch) {
    aliases.add(`가로전대(${lowerStretcherMatch[1]})`);
    aliases.add('전대');
    aliases.add('가로전대(상)');
    aliases.add('가로전대(외경)');
  }

  const rawStretcherMatch = withoutFurnitureLabel.match(/^가로전대\((\d+)\)$/);
  if (rawStretcherMatch) {
    aliases.add(`가로전대(하${rawStretcherMatch[1]})`);
    aliases.add('전대');
    aliases.add('가로전대(상)');
    aliases.add('가로전대(외경)');
  }

  if (withoutFurnitureLabel === '전대') {
    aliases.add('가로전대');
    aliases.add('가로전대(하1)');
    aliases.add('가로전대(1)');
    aliases.add('가로전대(상)');
    aliases.add('가로전대(외경)');
  }

  if (withoutFurnitureLabel === '가로전대(상)' || withoutFurnitureLabel === '가로전대(외경)') {
    aliases.add('전대');
  }

  const shelfMatch = withoutFurnitureLabel.match(/^(\([^)]+\))?선반\s*(\d+)$/);
  if (shelfMatch) {
    const prefix = shelfMatch[1] ?? '';
    const shelfIndex = shelfMatch[2];
    aliases.add(`${prefix}선반 ${shelfIndex}`);
    aliases.add(`${prefix}선반${shelfIndex}`);
    aliases.add(`선반 ${shelfIndex}`);
    aliases.add(`선반${shelfIndex}`);
    aliases.add(`(하)선반 ${shelfIndex}`);
    aliases.add(`(상)선반 ${shelfIndex}`);
  }

  const dowelShelfMatch = withoutFurnitureLabel.match(/^다보선반(?:\s*|\()(\d+)\)?$/);
  if (dowelShelfMatch) {
    aliases.add(`선반 ${dowelShelfMatch[1]}`);
  }

  const touchLegraCncMatch = withoutFurnitureLabel.match(/^터치서랍(\d+)(?:\((마이다)\)|\s+(바닥판|뒷판))$/);
  if (touchLegraCncMatch) {
    const index = touchLegraCncMatch[1];
    const part = touchLegraCncMatch[2] ? '(마이다)' : ` ${touchLegraCncMatch[3]}`;
    aliases.add(`터치${index}단서랍${part}`);
  }

  const touchLegraMeshMatch = withoutFurnitureLabel.match(/^터치(\d+)단서랍(?:\((마이다)\)|\s+(바닥판|뒷판))$/);
  if (touchLegraMeshMatch) {
    const index = touchLegraMeshMatch[1];
    const part = touchLegraMeshMatch[2] ? '(마이다)' : ` ${touchLegraMeshMatch[3]}`;
    aliases.add(`터치서랍${index}${part}`);
  }

  const glassDrawerMatch = withoutFurnitureLabel.match(/^유리장 서랍(\d+)\s+(좌측판|우측판|앞판|뒷판|바닥판|바닥|마이다)$/);
  if (glassDrawerMatch) {
    const index = glassDrawerMatch[1];
    const part = glassDrawerMatch[2];
    aliases.add(`유리장 서랍${index} ${part}`);
    aliases.add(`유리장 서랍${index}(${part})`);
    if (part === '바닥') aliases.add(`유리장 서랍${index} 바닥판`);
    if (part === '바닥판') aliases.add(`유리장 서랍${index} 바닥`);
  }

  if (withoutFurnitureLabel === '서랍 좌측판' || withoutFurnitureLabel === '서랍 우측판' || withoutFurnitureLabel === '서랍 바닥판') {
    aliases.add(withoutFurnitureLabel.replace('서랍 ', '유리장 서랍 '));
  }

  return Array.from(aliases);
}

export function isPanelKeyExcluded(
  excludedKeys: Set<string>,
  furnitureId: string | null | undefined,
  panelName: string | null | undefined,
): boolean {
  if (excludedKeys.size === 0 || !panelName) return false;
  return getExcludedPanelAliases(panelName).some((alias) => (
    excludedKeys.has(alias) || (furnitureId ? excludedKeys.has(`${furnitureId}::${alias}`) : false)
  ));
}
