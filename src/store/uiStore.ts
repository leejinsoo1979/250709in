import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 2D 뷰 방향 타입 정의
export type View2DDirection = 'front' | 'left' | 'right' | 'top';

// 프레임 강조 타입 정의
export type HighlightedFrame = 'left' | 'right' | 'top' | 'base' | null;

// UI 상태 타입
interface UIState {
  // 뷰어 모드 상태
  viewMode: '2D' | '3D';
  
  // 2D 뷰 방향 상태
  view2DDirection: View2DDirection;
  
  // 문 열림/닫힘 상태
  doorsOpen: boolean;
  
  // 치수 표시 상태
  showDimensions: boolean;
  
  // 활성 팝업 상태 (가구, 가구 편집, 기둥, 기둥 편집 모달 중 하나만 활성화)
  activePopup: {
    type: 'furniture' | 'furnitureEdit' | 'column' | 'columnEdit' | null;
    id: string | null;
  };
  
  // 강조된 프레임
  highlightedFrame: HighlightedFrame;
  
  // 기둥 생성 모드
  isColumnCreationMode: boolean;
  
  // 선택된 기둥 ID (선택 상태만, 팝업과는 별개)
  selectedColumnId: string | null;
  
  // 액션들
  setViewMode: (mode: '2D' | '3D') => void;
  setView2DDirection: (direction: View2DDirection) => void;
  toggleDoors: () => void;
  toggleDimensions: () => void;
  
  // 팝업 관리 액션들
  openFurniturePopup: (moduleId: string) => void;
  openFurnitureEditPopup: (moduleId: string) => void;
  openColumnPopup: (columnId: string) => void;
  openColumnEditModal: (columnId: string) => void;
  closeAllPopups: () => void;
  
  setHighlightedFrame: (frame: HighlightedFrame) => void;
  setColumnCreationMode: (isEnabled: boolean) => void;
  setSelectedColumnId: (columnId: string | null) => void;
  resetUI: () => void;
}

// 초기 상태
const initialUIState = {
  viewMode: '2D' as const,  // 기본값은 2D
  view2DDirection: 'front' as const,  // 기본값은 정면 뷰
  doorsOpen: true,  // 기본값: 문 열림 상태
  showDimensions: true,  // 기본값: 치수 표시
  activePopup: {
    type: null as 'furniture' | 'furnitureEdit' | 'column' | 'columnEdit' | null,
    id: null
  },
  highlightedFrame: null as HighlightedFrame,  // 기본값: 강조 없음
  isColumnCreationMode: false,  // 기본값: 기둥 생성 모드 비활성화
  selectedColumnId: null,  // 기본값: 기둥 선택 없음
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      ...initialUIState,
      
      setViewMode: (mode) =>
        set({ viewMode: mode }),
      
      setView2DDirection: (direction) =>
        set({ view2DDirection: direction }),
      
      toggleDoors: () =>
        set((state) => ({ doorsOpen: !state.doorsOpen })),
      
      toggleDimensions: () =>
        set((state) => ({ showDimensions: !state.showDimensions })),
      
      // 가구 팝업 열기 (다른 모든 팝업 닫기)
      openFurniturePopup: (moduleId) =>
        set({ 
          activePopup: { type: 'furniture', id: moduleId }
        }),
      
      // 가구 편집 팝업 열기 (다른 모든 팝업 닫기)
      openFurnitureEditPopup: (moduleId) =>
        set({ 
          activePopup: { type: 'furnitureEdit', id: moduleId }
        }),
      
      // 기둥 팝업 열기 (다른 모든 팝업 닫기)
      openColumnPopup: (columnId) =>
        set({ 
          activePopup: { type: 'column', id: columnId }
        }),
      
      // 기둥 편집 모달 열기 (다른 모든 팝업 닫기)
      openColumnEditModal: (columnId) =>
        set({ 
          activePopup: { type: 'columnEdit', id: columnId },
          selectedColumnId: columnId
        }),
      
      // 모든 팝업 닫기
      closeAllPopups: () =>
        set({ 
          activePopup: { type: null, id: null }
        }),
      
      setHighlightedFrame: (frame) =>
        set({ highlightedFrame: frame }),
      
      setColumnCreationMode: (isEnabled) =>
        set({ isColumnCreationMode: isEnabled }),
      
      setSelectedColumnId: (columnId) =>
        set({ selectedColumnId: columnId }),
      
      resetUI: () =>
        set(initialUIState),
    }),
    {
      name: 'ui-store', // localStorage 키
      partialize: (state) => ({
        viewMode: state.viewMode,
        view2DDirection: state.view2DDirection,  // localStorage에 저장
        showDimensions: state.showDimensions,  // localStorage에 저장
        // doorsOpen과 activePopup은 세션별로 초기화
      }),
    }
  )
); 