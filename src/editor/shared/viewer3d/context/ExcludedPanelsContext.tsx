import { create } from 'zustand';

/**
 * 옵티마이저에서 체크 해제된 패널의 복합키(furnitureId::panelName)를 저장하는 Zustand store.
 * React Context는 R3F <Canvas>의 별도 reconciler에서 접근 불가하므로 Zustand 사용.
 * NOTE: R3F 내부 컴포넌트(BoxWithEdges)는 useFrame에서 getState()로 직접 읽음 —
 * Zustand hook 구독은 DOM/R3F 간 reconciler 차이로 리렌더를 트리거하지 못함.
 */
interface ExcludedPanelsState {
  excludedKeys: Set<string>;
  setExcludedKeys: (keys: Set<string>) => void;
}

export const useExcludedPanelsStore = create<ExcludedPanelsState>((set) => ({
  excludedKeys: new Set<string>(),
  setExcludedKeys: (keys) => set({ excludedKeys: keys }),
}));

/** BoxWithEdges에서 사용: 현재 제외된 패널 키 Set 반환 */
export function useExcludedPanels(): Set<string> {
  return useExcludedPanelsStore((s) => s.excludedKeys);
}
