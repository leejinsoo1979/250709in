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

  if (withoutFurnitureLabel === '키큰장찬넬 전면프레임') aliases.add('Insert전면프레임-마감판');
  if (withoutFurnitureLabel === '키큰장찬넬 좌EP') aliases.add('Insert좌EP-마감판');
  if (withoutFurnitureLabel === '키큰장찬넬 우EP') aliases.add('Insert우EP-마감판');
  if (withoutFurnitureLabel === 'Insert전면프레임-마감판') aliases.add('키큰장찬넬 전면프레임');
  if (withoutFurnitureLabel === 'Insert좌EP-마감판') aliases.add('키큰장찬넬 좌EP');
  if (withoutFurnitureLabel === 'Insert우EP-마감판') aliases.add('키큰장찬넬 우EP');
  if (withoutFurnitureLabel === 'Insert상단프레임') {
    aliases.add('상단몰딩');
    aliases.add('top-frame');
  }
  if (withoutFurnitureLabel === 'Insert걸레받이') {
    aliases.add('걸래받이');
    aliases.add('걸레받이');
    aliases.add('받침대');
    aliases.add('base-frame');
  }

  // 패널 목록 팝업의 한국어 명칭 ↔ 3D mesh name 매핑
  // mesh는 분절될 수 있어 'top-frame-0'..'top-frame-N' 등으로 나오므로 가능성 있는 인덱스도 추가
  if (
    withoutFurnitureLabel === '상단몰딩' ||
    withoutFurnitureLabel.includes('상단몰딩') ||
    withoutFurnitureLabel.includes('상단 몰딩') ||
    withoutFurnitureLabel.includes('상부프래임')
  ) {
    aliases.add('top-frame');
    aliases.add('Insert상단프레임');
    for (let i = 0; i < 20; i += 1) aliases.add(`top-frame-${i}`);
  }
  // 걸래받이/걸레받이/받침대 모두 동일 mesh 가리킴 (CLAUDE.md에선 '걸래받이' 사용)
  if (withoutFurnitureLabel === '걸래받이' || withoutFurnitureLabel === '걸레받이' || withoutFurnitureLabel === '받침대') {
    aliases.add('base-frame');
    aliases.add('걸래받이');
    aliases.add('걸레받이');
    aliases.add('받침대');
    aliases.add('Insert걸레받이');
    for (let i = 0; i < 20; i += 1) aliases.add(`base-frame-${i}`);
  }
  // 역방향: 3D mesh name이 들어와도 한국어 패널명 매칭
  if (withoutFurnitureLabel === 'top-frame') aliases.add('상단몰딩');
  if (withoutFurnitureLabel === 'base-frame') {
    aliases.add('걸래받이');
    aliases.add('걸레받이');
    aliases.add('받침대');
  }

  if (withoutFurnitureLabel === '바닥') aliases.add('바닥판');
  if (withoutFurnitureLabel === '바닥판') aliases.add('바닥');
  if (withoutFurnitureLabel.endsWith(' 바닥')) aliases.add(withoutFurnitureLabel.replace(/ 바닥$/, ' 바닥판'));
  if (withoutFurnitureLabel.endsWith(' 바닥판')) aliases.add(withoutFurnitureLabel.replace(/ 바닥판$/, ' 바닥'));

  // 구버전/수동 패널 목록에는 상하 분리 측판이 통짜 좌측판/우측판으로 남아 있을 수 있다.
  // 3D 현관장 H 등은 (상)/(하) 측판 mesh로 렌더링되므로 양방향 alias를 제공한다.
  if (withoutFurnitureLabel === '좌측판') {
    aliases.add('(하)좌측');
    aliases.add('(상)좌측');
    for (let i = 1; i <= 20; i += 1) aliases.add(`좌측판${i}`);
  }
  if (withoutFurnitureLabel === '우측판') {
    aliases.add('(하)우측');
    aliases.add('(상)우측');
    for (let i = 1; i <= 20; i += 1) aliases.add(`우측판${i}`);
  }
  if (withoutFurnitureLabel === '(하)좌측') {
    aliases.add('좌측판');
    aliases.add('좌측판1');
  }
  if (withoutFurnitureLabel === '(상)좌측') {
    aliases.add('좌측판');
    for (let i = 2; i <= 20; i += 1) aliases.add(`좌측판${i}`);
  }
  if (withoutFurnitureLabel === '(하)우측') {
    aliases.add('우측판');
    aliases.add('우측판1');
  }
  if (withoutFurnitureLabel === '(상)우측') {
    aliases.add('우측판');
    for (let i = 2; i <= 20; i += 1) aliases.add(`우측판${i}`);
  }
  const kitchenSideMatch = withoutFurnitureLabel.match(/^(좌측판|우측판)(\d+)$/);
  if (kitchenSideMatch) {
    const sideBase = kitchenSideMatch[1];
    const sectionIndex = Number(kitchenSideMatch[2]);
    aliases.add(sideBase);
    aliases.add(`${sectionIndex === 1 ? '(하)' : '(상)'}${sideBase === '좌측판' ? '좌측' : '우측'}`);
  }

  if (withoutFurnitureLabel.includes('후면 보강대')) {
    aliases.add(withoutFurnitureLabel.replace('후면 보강대', '보강대').trim());
  }

  if (withoutFurnitureLabel === '(하)백패널') {
    aliases.add('(1단)백패널');
    aliases.add('좌(하)백패널');
  }
  if (withoutFurnitureLabel === '(상)백패널') {
    aliases.add('좌(상)백패널');
    for (let i = 2; i <= 20; i += 1) aliases.add(`(${i}단)백패널`);
  }
  if (withoutFurnitureLabel === '좌(하)백패널') aliases.add('(하)백패널');
  if (withoutFurnitureLabel === '좌(상)백패널') aliases.add('(상)백패널');
  const nSectionBackPanelMatch = withoutFurnitureLabel.match(/^\((\d+)단\)백패널$/);
  if (nSectionBackPanelMatch) {
    aliases.add(Number(nSectionBackPanelMatch[1]) === 1 ? '(하)백패널' : '(상)백패널');
  }

  if (withoutFurnitureLabel === '우후면 보강대 1' || withoutFurnitureLabel === '우후면 보강대 2') {
    aliases.add('우보강대');
  }
  if (withoutFurnitureLabel === '우보강대') {
    aliases.add('우후면 보강대 1');
    aliases.add('우후면 보강대 2');
  }

  const sectionReinforcementMatch = withoutFurnitureLabel.match(/^(\((?:하|상)\))(?:후면\s*)?보강대(?:\s*(\d+))?$/);
  if (sectionReinforcementMatch) {
    const prefix = sectionReinforcementMatch[1];
    const index = sectionReinforcementMatch[2];
    aliases.add(`${prefix}후면 보강대`);
    aliases.add(`${prefix}보강대`);
    if (index) {
      aliases.add(`${prefix}후면 보강대 ${index}`);
      aliases.add(`${prefix}보강대 ${index}`);
    } else {
      aliases.add(`${prefix}후면 보강대 1`);
      aliases.add(`${prefix}후면 보강대 2`);
      aliases.add(`${prefix}보강대 1`);
      aliases.add(`${prefix}보강대 2`);
    }
    if (prefix === '(하)') {
      aliases.add('(1단)보강대');
      if (index) {
        aliases.add(`(1단)보강대 ${index}`);
      } else {
        aliases.add('(1단)보강대 1');
        aliases.add('(1단)보강대 2');
      }
    } else {
      for (let i = 2; i <= 20; i += 1) {
        aliases.add(`(${i}단)보강대`);
        if (index) {
          aliases.add(`(${i}단)보강대 ${index}`);
        } else {
          aliases.add(`(${i}단)보강대 1`);
          aliases.add(`(${i}단)보강대 2`);
        }
      }
    }
  }
  const nSectionReinforcementMatch = withoutFurnitureLabel.match(/^\((\d+)단\)보강대(?:\s*(\d+))?$/);
  if (nSectionReinforcementMatch) {
    const prefix = Number(nSectionReinforcementMatch[1]) === 1 ? '(하)' : '(상)';
    const index = nSectionReinforcementMatch[2];
    aliases.add(`${prefix}보강대`);
    aliases.add(`${prefix}후면 보강대`);
    if (index) {
      aliases.add(`${prefix}보강대 ${index}`);
      aliases.add(`${prefix}후면 보강대 ${index}`);
    } else {
      aliases.add(`${prefix}보강대 1`);
      aliases.add(`${prefix}보강대 2`);
      aliases.add(`${prefix}후면 보강대 1`);
      aliases.add(`${prefix}후면 보강대 2`);
    }
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

  const woodChannelMatch = withoutFurnitureLabel.match(/^(목찬넬프레임수평|목찬넬프레임수직)(?:\((\d+)\))?$/);
  if (woodChannelMatch) {
    const baseName = woodChannelMatch[1];
    aliases.add(baseName);
    if (woodChannelMatch[2]) {
      aliases.add(`${baseName}(${woodChannelMatch[2]})`);
    } else {
      for (let i = 1; i <= 20; i += 1) aliases.add(`${baseName}(${i})`);
    }
  }

  if (withoutFurnitureLabel === '전대' || withoutFurnitureLabel.startsWith('가로전대')) {
    aliases.add('전대(분절후방)');
  }
  if (withoutFurnitureLabel === '전대(분절후방)') {
    aliases.add('전대');
    aliases.add('가로전대(1)');
    aliases.add('가로전대(하1)');
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
  const panelAliases = getExcludedPanelAliases(panelName);
  if (panelAliases.some((alias) => (
    excludedKeys.has(alias) || (furnitureId ? excludedKeys.has(`${furnitureId}::${alias}`) : false)
  ))) {
    return true;
  }

  // store 동기화 전에 raw key가 들어오는 경로도 방어한다.
  for (const key of excludedKeys) {
    const separatorIndex = key.indexOf('::');
    const keyFurnitureId = separatorIndex >= 0 ? key.slice(0, separatorIndex) : null;
    const keyPanelName = separatorIndex >= 0 ? key.slice(separatorIndex + 2) : key;
    if (keyFurnitureId && furnitureId && keyFurnitureId !== furnitureId) continue;
    const keyAliases = getExcludedPanelAliases(keyPanelName);
    if (panelAliases.some(alias => keyAliases.includes(alias))) return true;
  }

  return false;
}
