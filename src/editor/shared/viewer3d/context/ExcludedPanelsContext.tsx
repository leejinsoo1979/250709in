import { create } from 'zustand';

/**
 * 옵티마이저에서 체크 해제된 패널의 복합키(furnitureId::panelName)를 저장하는 Zustand store.
 * React Context는 R3F <Canvas>의 별도 reconciler에서 접근 불가하므로 Zustand 사용.
 */
interface ExcludedPanelsState {
  excludedKeys: Set<string>;
  setExcludedKeys: (keys: Set<string>) => void;
}

export const useExcludedPanelsStore = create<ExcludedPanelsState>((set) => ({
  excludedKeys: new Set<string>(),
  setExcludedKeys: (keys) => {
    console.log('[ExcludedPanelsStore] setExcludedKeys:', [...keys]);
    set({ excludedKeys: keys });
  },
}));

/** BoxWithEdges에서 사용: 현재 제외된 패널 키 Set 반환 */
export function useExcludedPanels(): Set<string> {
  return useExcludedPanelsStore((s) => s.excludedKeys);
}
