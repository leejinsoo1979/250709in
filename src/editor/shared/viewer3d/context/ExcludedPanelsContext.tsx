import { createContext, useContext } from 'react';

/**
 * 옵티마이저에서 체크 해제된 패널 이름을 BoxWithEdges에 전달하기 위한 Context.
 * PanelHighlight3DViewer → (Room → ... → BoxWithEdges) 전달 시
 * 중간 컴포넌트를 모두 수정하지 않고 Context로 직접 전달.
 */
const ExcludedPanelsContext = createContext<Set<string> | undefined>(undefined);

export const ExcludedPanelsProvider = ExcludedPanelsContext.Provider;

export function useExcludedPanels(): Set<string> | undefined {
  return useContext(ExcludedPanelsContext);
}
