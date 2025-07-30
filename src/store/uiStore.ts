import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 2D 뷰 방향 타입 정의
export type View2DDirection = 'front' | 'left' | 'right' | 'top' | 'all';

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
  
  // 치수 텍스트 표시 상태 (치수 체크박스용)
  showDimensionsText: boolean;

  // 그리드(가이드) 표시 상태
  showGuides: boolean;
  
  // 축 표시 상태
  showAxis: boolean;
  
  // 활성 팝업 상태 (가구, 가구 편집, 기둥, 기둥 편집, 가벽, 가벽 편집, 패널B, 패널B 편집 모달 중 하나만 활성화)
  activePopup: {
    type: 'furniture' | 'furnitureEdit' | 'column' | 'columnEdit' | 'wall' | 'wallEdit' | 'panelB' | 'panelBEdit' | null;
    id: string | null;
  };
  
  // 강조된 프레임
  highlightedFrame: HighlightedFrame;
  
  // 기둥 생성 모드
  isColumnCreationMode: boolean;
  
  // 선택된 기둥 ID (선택 상태만, 팝업과는 별개)
  selectedColumnId: string | null;
  
  // 가벽 생성 모드
  isWallCreationMode: boolean;
  
  // 선택된 가벽 ID (선택 상태만, 팝업과는 별개)
  selectedWallId: string | null;
  
  // 패널B 생성 모드
  isPanelBCreationMode: boolean;
  
  // 선택된 패널B ID (선택 상태만, 팝업과는 별개)
  selectedPanelBId: string | null;
  
  // 2D 뷰 전용 테마 (다크/라이트)
  view2DTheme: 'dark' | 'light';
  
  // 가구 드래그 상태
  isFurnitureDragging: boolean;
  
  // 활성 단내림 탭 상태
  activeDroppedCeilingTab: 'main' | 'dropped';
  
  // 강조된 가구 칸 (가구ID-칸인덱스 형식)
  highlightedCompartment: string | null;
  
  // 액션들
  setViewMode: (mode: '2D' | '3D') => void;
  setActiveDroppedCeilingTab: (tab: 'main' | 'dropped') => void;
  setView2DDirection: (direction: View2DDirection) => void;
  toggleDoors: () => void;
  toggleDimensions: () => void;
  toggleGuides: () => void;
  toggleAxis: () => void;
  toggleView2DTheme: () => void;
  
  // 팝업 관리 액션들
  openFurniturePopup: (moduleId: string) => void;
  openFurnitureEditPopup: (moduleId: string) => void;
  openColumnPopup: (columnId: string) => void;
  openColumnEditModal: (columnId: string) => void;
  openWallPopup: (wallId: string) => void;
  openWallEditModal: (wallId: string) => void;
  openPanelBPopup: (panelBId: string) => void;
  openPanelBEditModal: (panelBId: string) => void;
  closeAllPopups: () => void;
  
  setHighlightedFrame: (frame: HighlightedFrame) => void;
  setColumnCreationMode: (isEnabled: boolean) => void;
  setSelectedColumnId: (columnId: string | null) => void;
  setWallCreationMode: (isEnabled: boolean) => void;
  setSelectedWallId: (wallId: string | null) => void;
  setPanelBCreationMode: (isEnabled: boolean) => void;
  setSelectedPanelBId: (panelBId: string | null) => void;
  setFurnitureDragging: (isDragging: boolean) => void;
  setHighlightedCompartment: (compartmentId: string | null) => void;
  resetUI: () => void;
}

// 초기 상태
const initialUIState = {
  viewMode: '3D' as const,  // 기본값은 3D
  view2DDirection: 'front' as const,  // 기본값은 정면 뷰
  doorsOpen: true,  // 기본값: 문 열림 상태
  showDimensions: true,  // 기본값: 치수 표시
  showDimensionsText: true,  // 기본값: 치수 텍스트 표시
  showGuides: true, // 기본값: 그리드(가이드) 표시
  showAxis: true, // 기본값: 축 표시
  activePopup: {
    type: null as 'furniture' | 'furnitureEdit' | 'column' | 'columnEdit' | 'wall' | 'wallEdit' | 'panelB' | 'panelBEdit' | null,
    id: null
  },
  highlightedFrame: null as HighlightedFrame,  // 기본값: 강조 없음
  isColumnCreationMode: false,  // 기본값: 기둥 생성 모드 비활성화
  selectedColumnId: null,  // 기본값: 기둥 선택 없음
  isWallCreationMode: false,  // 기본값: 가벽 생성 모드 비활성화
  selectedWallId: null,  // 기본값: 가벽 선택 없음
  isPanelBCreationMode: false,  // 기본값: 패널B 생성 모드 비활성화
  selectedPanelBId: null,  // 기본값: 패널B 선택 없음
  isFurnitureDragging: false,  // 기본값: 가구 드래그 비활성화
  activeDroppedCeilingTab: 'main' as const,  // 기본값: 메인구간 탭
  highlightedCompartment: null,  // 기본값: 강조된 칸 없음
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      ...initialUIState,
      view2DTheme: 'light' as const,  // 기본값: 라이트 모드
      
      setViewMode: (mode) =>
        set({ viewMode: mode }),
        
      setActiveDroppedCeilingTab: (tab) =>
        set({ activeDroppedCeilingTab: tab }),
      
      setView2DDirection: (direction) =>
        set({ view2DDirection: direction }),
      
      toggleDoors: () =>
        set((state) => ({ doorsOpen: !state.doorsOpen })),
      
      toggleDimensions: () =>
        set((state) => {
          console.log('🎯 toggleDimensions - 이전 상태:', state.showDimensions, '새 상태:', !state.showDimensions);
          return { showDimensions: !state.showDimensions };
        }),
      toggleDimensionsText: () =>
        set((state) => ({ showDimensionsText: !state.showDimensionsText })),
      toggleGuides: () =>
        set((state) => ({ showGuides: !state.showGuides })),
      
      toggleAxis: () =>
        set((state) => ({ showAxis: !state.showAxis })),
      
      toggleView2DTheme: () =>
        set((state) => ({ view2DTheme: state.view2DTheme === 'dark' ? 'light' : 'dark' })),
      
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
      
      // 가벽 팝업 열기 (다른 모든 팝업 닫기)
      openWallPopup: (wallId) =>
        set({ 
          activePopup: { type: 'wall', id: wallId }
        }),
      
      // 가벽 편집 모달 열기 (다른 모든 팝업 닫기)
      openWallEditModal: (wallId) =>
        set({ 
          activePopup: { type: 'wallEdit', id: wallId },
          selectedWallId: wallId
        }),
      
      // 패널B 팝업 열기 (다른 모든 팝업 닫기)
      openPanelBPopup: (panelBId) =>
        set({ 
          activePopup: { type: 'panelB', id: panelBId }
        }),
      
      // 패널B 편집 모달 열기 (다른 모든 팝업 닫기)
      openPanelBEditModal: (panelBId) =>
        set({ 
          activePopup: { type: 'panelBEdit', id: panelBId },
          selectedPanelBId: panelBId
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
      
      setWallCreationMode: (isEnabled) =>
        set({ isWallCreationMode: isEnabled }),
      
      setSelectedWallId: (wallId) =>
        set({ selectedWallId: wallId }),
      
      setPanelBCreationMode: (isEnabled) =>
        set({ isPanelBCreationMode: isEnabled }),
      
      setSelectedPanelBId: (panelBId) =>
        set({ selectedPanelBId: panelBId }),
      
      setFurnitureDragging: (isDragging) =>
        set({ isFurnitureDragging: isDragging }),
      
      setHighlightedCompartment: (compartmentId) =>
        set({ highlightedCompartment: compartmentId }),
      
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