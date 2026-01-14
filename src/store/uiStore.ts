import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 2D 뷰 방향 타입 정의
export type View2DDirection = 'front' | 'left' | 'right' | 'top' | 'all';

// 프레임 강조 타입 정의
export type HighlightedFrame = 'left' | 'right' | 'top' | 'base' | null;

// 측정 포인트 타입
export type MeasurePoint = [number, number, number];

// 측정 라인 타입
export interface MeasureLine {
  id: string;
  start: MeasurePoint;
  end: MeasurePoint;
  distance: number; // mm 단위
  offset?: MeasurePoint; // 가이드선 오프셋 (3D 좌표)
  viewDirection?: View2DDirection; // 측정한 시점 (해당 시점에서만 표시)
}

// UI 상태 타입
interface UIState {
  // 뷰어 모드 상태
  viewMode: '2D' | '3D';
  
  // 2D 뷰 방향 상태
  view2DDirection: View2DDirection;
  
  // 문 열림/닫힘 상태 (전역 - 모든 도어)
  doorsOpen: boolean;

  // 개별 도어 열림 상태 (furnitureId-sectionIndex 키로 관리)
  individualDoorsOpen: Record<string, boolean>;
  
  // 치수 표시 상태
  showDimensions: boolean;
  
  // 치수 텍스트 표시 상태 (치수 체크박스용)
  showDimensionsText: boolean;
  
  // 가구 표시 상태
  showFurniture: boolean;

  // 가구 편집 아이콘 표시 상태
  showFurnitureEditHandles: boolean;

  // 그리드(가이드) 표시 상태
  showGuides: boolean;
  
  // 축 표시 상태
  showAxis: boolean;
  
  // 가이드 표시 상태 (showAll 체크박스용)
  showAll: boolean;

  // 치수 보기를 껐다가 다시 켤 때를 위한 옵션 백업
  dimensionOptionsBackup: {
    showAll: boolean;
    showGuides: boolean;
    showAxis: boolean;
    showDimensionsText: boolean;
  } | null;
  
  // 렌더링 모드 (solid 또는 wireframe)
  renderMode: 'solid' | 'wireframe';
  
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

  // 측면뷰용 선택된 슬롯 인덱스 (null이면 전체 표시)
  selectedSlotIndex: number | null;
  setSelectedSlotIndex: (index: number | null) => void;

  // 2D 뷰 전용 테마 (다크/라이트)
  view2DTheme: 'dark' | 'light';
  
  // 가구 드래그 상태
  isFurnitureDragging: boolean;
  
  // 기둥 드래그 상태
  isDraggingColumn: boolean;
  
  // 슬롯 드래그 상태
  isSlotDragging: boolean;
  
  // 활성 단내림 탭 상태
  activeDroppedCeilingTab: 'main' | 'dropped';
  
  // 강조된 가구 칸 (가구ID-칸인덱스 형식)
  highlightedCompartment: string | null;
  selectedFurnitureId: string | null;

  // 강조된 섹션 (가구ID-섹션인덱스 형식: "furnitureId-0" 또는 "furnitureId-1")
  highlightedSection: string | null;

  // 강조된 패널 (가구ID-패널이름 형식: "furnitureId-패널명")
  highlightedPanel: string | null;

  // 클릭 배치 상태 (Click & Place)
  selectedModuleForPlacement: string | null;
  hoveredSlotForPlacement: number | null;

  // 패널 목록 탭 활성 상태 (가구 팝업의 패널 목록이 열려 있는지 여부)
  isPanelListTabActive: boolean;
  
  // 간접조명 설정
  indirectLightEnabled: boolean;
  indirectLightIntensity: number;
  indirectLightColor: string;
  
  // 카메라 설정
  cameraMode: 'perspective' | 'orthographic';
  cameraFov: number;
  cameraZoom: number;
  
  // 그림자 설정
  shadowEnabled: boolean;

  // 보링 시각화 상태
  showBorings: boolean;

  // 측정 모드 상태
  isMeasureMode: boolean;
  measurePoints: [MeasurePoint, MeasurePoint | null] | null; // [시작점, 끝점 또는 null]
  measureLines: MeasureLine[]; // 저장된 측정 라인들

  // 지우개 모드 상태
  isEraserMode: boolean;
  hoveredMeasureLineId: string | null; // 호버 중인 측정선 ID

  // 액션들
  setViewMode: (mode: '2D' | '3D') => void;
  setActiveDroppedCeilingTab: (tab: 'main' | 'dropped') => void;
  setView2DDirection: (direction: View2DDirection) => void;
  toggleDoors: () => void;
  toggleIndividualDoor: (furnitureId: string, sectionIndex: number) => void;
  isIndividualDoorOpen: (furnitureId: string, sectionIndex: number) => boolean;
  toggleDimensions: () => void;
  toggleDimensionsText: () => void;
  toggleGuides: () => void;
  toggleAxis: () => void;
  toggleIndirectLight: () => void;

  // 가구 편집 아이콘 토글
  toggleFurnitureEditHandles: () => void;
  setShowFurnitureEditHandles: (show: boolean) => void;
  toggleView2DTheme: () => void;
  toggleAll: () => void;
  
  // setter 함수들 추가
  setShowDimensions: (show: boolean) => void;
  setShowDimensionsText: (show: boolean) => void;
  setShowGuides: (show: boolean) => void;
  setShowAxis: (show: boolean) => void;
  setShowAll: (show: boolean) => void;
  setShowFurniture: (show: boolean) => void;
  setRenderMode: (mode: 'solid' | 'wireframe') => void;
  setView2DTheme: (theme: 'dark' | 'light') => void;
  
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
  setIsDraggingColumn: (isDragging: boolean) => void;
  setIsSlotDragging: (isDragging: boolean) => void;
  setHighlightedCompartment: (compartmentId: string | null) => void;
  setHighlightedSection: (sectionId: string | null) => void;
  setHighlightedPanel: (panelId: string | null) => void;
  setSelectedModuleForPlacement: (moduleId: string | null) => void;
  setHoveredSlotForPlacement: (slotIndex: number | null) => void;

  setPanelListTabActive: (active: boolean) => void;
  setIndirectLightEnabled: (enabled: boolean) => void;
  setIndirectLightIntensity: (intensity: number) => void;
  setIndirectLightColor: (color: string) => void;
  setCameraMode: (mode: 'perspective' | 'orthographic') => void;
  setCameraFov: (fov: number) => void;
  setCameraZoom: (zoom: number) => void;
  setShadowEnabled: (enabled: boolean) => void;
  setShowBorings: (show: boolean) => void;
  toggleBorings: () => void;
  setSelectedFurnitureId: (id: string | null) => void;

  // 측정 모드 액션들
  toggleMeasureMode: () => void;
  setMeasureMode: (enabled: boolean) => void;
  setMeasureStartPoint: (point: MeasurePoint) => void;
  setMeasureEndPoint: (point: MeasurePoint) => void;
  addMeasureLine: (line: MeasureLine) => void;
  removeMeasureLine: (id: string) => void;
  clearMeasurePoints: () => void;
  clearAllMeasureLines: () => void;

  // 지우개 모드 액션들
  toggleEraserMode: () => void;
  setEraserMode: (enabled: boolean) => void;
  setHoveredMeasureLineId: (id: string | null) => void;

  resetUI: () => void;
}

// 초기 상태
const initialUIState = {
  viewMode: '3D' as const,  // 기본값은 3D
  view2DDirection: 'front' as const,  // 기본값은 정면 뷰
  doorsOpen: false,  // 기본값: 문 닫힘 상태 (미리보기에서는 독립적으로 관리)
  individualDoorsOpen: {} as Record<string, boolean>,  // 개별 도어 열림 상태
  showDimensions: true,  // 기본값: 치수 표시
  showDimensionsText: true,  // 기본값: 치수 텍스트 표시
  showGuides: true, // 기본값: 그리드(가이드) 표시
  showAxis: true, // 기본값: 축 표시
  showAll: true, // 기본값: 모든 가이드 표시
  dimensionOptionsBackup: null,
  showFurniture: true, // 기본값: 가구 표시
  showFurnitureEditHandles: true, // 기본값: 가구 편집 아이콘 표시
  renderMode: 'solid' as const, // 기본값: 솔리드 렌더링
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
  selectedSlotIndex: null,  // 기본값: 전체 슬롯 표시
  isFurnitureDragging: false,  // 기본값: 가구 드래그 비활성화
  isDraggingColumn: false,  // 기본값: 기둥 드래그 비활성화
  isSlotDragging: false,  // 기본값: 슬롯 드래그 비활성화
  activeDroppedCeilingTab: 'main' as const,  // 기본값: 메인구간 탭
  highlightedCompartment: null,  // 기본값: 강조된 칸 없음
  selectedFurnitureId: null,
  highlightedSection: null,  // 기본값: 강조된 섹션 없음
  highlightedPanel: null,  // 기본값: 강조된 패널 없음
  selectedModuleForPlacement: null,  // 기본값: 선택된 모듈 없음
  hoveredSlotForPlacement: null,  // 기본값: 호버된 슬롯 없음
  isPanelListTabActive: false, // 기본값: 패널 목록 탭 비활성화
  indirectLightEnabled: false,  // 기본값: 간접조명 비활성화 (띄워서 배치 포함)
  indirectLightIntensity: 0.8,  // 기본값: 강도 0.8
  indirectLightColor: '#ffffff',  // 기본값: 흰색
  cameraMode: 'perspective' as const,  // 기본값: 원근 투영
  cameraFov: 50,  // 기본값: FOV 50도
  cameraZoom: 1,  // 기본값: 줌 배율 1
  shadowEnabled: true,  // 기본값: 그림자 활성화
  showBorings: false,  // 기본값: 보링 시각화 비활성화
  isMeasureMode: false,  // 기본값: 측정 모드 비활성화
  measurePoints: null,  // 기본값: 측정 포인트 없음
  measureLines: [],  // 기본값: 저장된 측정 라인 없음
  isEraserMode: false,  // 기본값: 지우개 모드 비활성화
  hoveredMeasureLineId: null,  // 기본값: 호버 중인 측정선 없음
};

// 앱 테마 가져오기 (ThemeContext와 동일한 방식)
const getAppTheme = (): 'dark' | 'light' => {
  try {
    const savedTheme = localStorage.getItem('app-theme-config');
    if (savedTheme) {
      const themeConfig = JSON.parse(savedTheme);
      return themeConfig.mode || 'light';
    }
  } catch (error) {
    console.warn('테마 설정 로드 실패:', error);
  }
  return 'light';
};

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => {
      // 스토어 생성 시 앱 테마 읽기
      const appTheme = getAppTheme();
      console.log('🔄 UIStore 초기화 - 앱 테마:', appTheme);
      
      return {
        ...initialUIState,
        view2DTheme: appTheme,  // 앱 테마와 동일하게 초기화
      
      setViewMode: (mode) =>
        set((state) => ({
          viewMode: mode,
          // 2D 모드로 전환 시 가구 체크박스 기본 ON
          showFurniture: mode === '2D' ? true : state.showFurniture
        })),
        
      setActiveDroppedCeilingTab: (tab) => {
        console.log('🔧 UIStore - setActiveDroppedCeilingTab 호출:', {
          oldTab: useUIStore.getState().activeDroppedCeilingTab,
          newTab: tab
        });
        set({ activeDroppedCeilingTab: tab });
      },
      
      setView2DDirection: (direction) =>
        set({ view2DDirection: direction }),
      
      toggleDoors: () =>
        set((state) => ({ doorsOpen: !state.doorsOpen })),

      toggleIndividualDoor: (furnitureId: string, sectionIndex: number) => {
        const key = `${furnitureId}-${sectionIndex}`;
        set((state) => ({
          individualDoorsOpen: {
            ...state.individualDoorsOpen,
            [key]: !state.individualDoorsOpen[key]
          }
        }));
      },

      isIndividualDoorOpen: (furnitureId: string, sectionIndex: number) => {
        const key = `${furnitureId}-${sectionIndex}`;
        return get().individualDoorsOpen[key] || false;
      },

      toggleDimensions: () =>
        set((state) => {
          const nextValue = !state.showDimensions;
          console.log('🎯 toggleDimensions - 이전 상태:', state.showDimensions, '새 상태:', nextValue);

          if (!nextValue) {
            return {
              showDimensions: false,
              dimensionOptionsBackup: {
                showAll: state.showAll,
                showGuides: state.showGuides,
                showAxis: state.showAxis,
                showDimensionsText: state.showDimensionsText
              },
              showAll: false,
              showGuides: false,
              showAxis: false,
              showDimensionsText: false
            };
          }

          const backup = state.dimensionOptionsBackup;
          return {
            showDimensions: true,
            showAll: backup ? backup.showAll : true,
            showGuides: backup ? backup.showGuides : true,
            showAxis: backup ? backup.showAxis : true,
            showDimensionsText: backup ? backup.showDimensionsText : true,
            dimensionOptionsBackup: null
          };
        }),
      toggleDimensionsText: () =>
        set((state) => ({ showDimensionsText: !state.showDimensionsText })),
      toggleGuides: () =>
        set((state) => ({ showGuides: !state.showGuides })),
      
      toggleAxis: () =>
        set((state) => ({ showAxis: !state.showAxis })),
      
      toggleIndirectLight: () =>
        set((state) => ({ indirectLightEnabled: !state.indirectLightEnabled })),
      
      toggleView2DTheme: () =>
        set((state) => ({ view2DTheme: state.view2DTheme === 'dark' ? 'light' : 'dark' })),
      
      toggleAll: () =>
        set((state) => ({ showAll: !state.showAll })),

      toggleFurnitureEditHandles: () =>
        set((state) => ({ showFurnitureEditHandles: !state.showFurnitureEditHandles })),
      
      // setter 함수들 구현
      setShowDimensions: (show) =>
        set((state) => {
          if (!show) {
            return {
              showDimensions: false,
              dimensionOptionsBackup: {
                showAll: state.showAll,
                showGuides: state.showGuides,
                showAxis: state.showAxis,
                showDimensionsText: state.showDimensionsText
              },
              showAll: false,
              showGuides: false,
              showAxis: false,
              showDimensionsText: false
            };
          }

          const backup = state.dimensionOptionsBackup;
          return {
            showDimensions: true,
            showAll: backup ? backup.showAll : true,
            showGuides: backup ? backup.showGuides : true,
            showAxis: backup ? backup.showAxis : true,
            showDimensionsText: backup ? backup.showDimensionsText : true,
            dimensionOptionsBackup: null
          };
        }),
      
      setShowDimensionsText: (show) =>
        set({ showDimensionsText: show }),
      
      setShowGuides: (show) =>
        set({ showGuides: show }),
      
      setShowAxis: (show) =>
        set({ showAxis: show }),
      
      setShowAll: (show) =>
        set({ showAll: show }),
      
      setShowFurniture: (show) => {
        console.log('💾 UIStore.setShowFurniture called - new value:', show);
        set({ showFurniture: show });
      },

      setShowFurnitureEditHandles: (show) =>
        set({ showFurnitureEditHandles: show }),
      
      setRenderMode: (mode) =>
        set({ renderMode: mode }),
      
      setView2DTheme: (theme) =>
        set({ view2DTheme: theme }),
      
      // 가구 팝업 열기 (다른 모든 팝업 닫기)
      openFurniturePopup: (moduleId) =>
        set({ 
          activePopup: { type: 'furniture', id: moduleId }
        }),
      
      // 가구 편집 팝업 열기 (다른 모든 팝업 닫기)
      openFurnitureEditPopup: (moduleId) => {
        console.log('🔹 openFurnitureEditPopup 호출:', {
          moduleId,
          현재상태: get().highlightedCompartment
        });
        set({ 
          activePopup: { type: 'furnitureEdit', id: moduleId },
          highlightedCompartment: moduleId,
          selectedFurnitureId: moduleId // 가구 편집 시 해당 가구도 강조
        });
      },
      
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
          activePopup: { type: null, id: null },
          highlightedCompartment: null,
          selectedFurnitureId: null // 팝업 닫을 때 강조도 제거
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
      
      setIsDraggingColumn: (isDragging) =>
        set({ isDraggingColumn: isDragging }),
      
      setIsSlotDragging: (isDragging) =>
        set({ isSlotDragging: isDragging }),
      
      setHighlightedCompartment: (compartmentId) =>
        set({ highlightedCompartment: compartmentId }),

      setHighlightedSection: (sectionId) =>
        set({ highlightedSection: sectionId }),

      setHighlightedPanel: (panelId) =>
        set({ highlightedPanel: panelId }),

      setSelectedModuleForPlacement: (moduleId) =>
        set({ selectedModuleForPlacement: moduleId }),
      
      setHoveredSlotForPlacement: (slotIndex) =>
        set({ hoveredSlotForPlacement: slotIndex }),

      setPanelListTabActive: (active) =>
        set({ isPanelListTabActive: active }),
      
      setIndirectLightEnabled: (enabled) =>
        set({ indirectLightEnabled: enabled }),
      
      setIndirectLightIntensity: (intensity) =>
        set({ indirectLightIntensity: intensity }),
      
      setIndirectLightColor: (color) =>
        set({ indirectLightColor: color }),
      
      setCameraMode: (mode) =>
        set({ cameraMode: mode }),
      
      setCameraFov: (fov) =>
        set({ cameraFov: fov }),
      
      setCameraZoom: (zoom) =>
        set({ cameraZoom: zoom }),
      
      setShadowEnabled: (enabled) =>
        set({ shadowEnabled: enabled }),

      setShowBorings: (show) =>
        set({ showBorings: show }),

      toggleBorings: () =>
        set((state) => ({ showBorings: !state.showBorings })),

      setSelectedFurnitureId: (id) =>
        set({ selectedFurnitureId: id }),

      setSelectedSlotIndex: (index) =>
        set({ selectedSlotIndex: index }),

      // 측정 모드 액션들 구현
      toggleMeasureMode: () =>
        set((state) => ({
          isMeasureMode: !state.isMeasureMode,
          // 측정 모드 비활성화 시 측정 포인트 초기화
          measurePoints: !state.isMeasureMode ? state.measurePoints : null
        })),

      setMeasureMode: (enabled) =>
        set({
          isMeasureMode: enabled,
          // 비활성화 시 측정 포인트 초기화
          measurePoints: enabled ? null : null
        }),

      setMeasureStartPoint: (point) =>
        set({ measurePoints: [point, null] }),

      setMeasureEndPoint: (point) =>
        set((state) => {
          if (!state.measurePoints) return state;
          return { measurePoints: [state.measurePoints[0], point] };
        }),

      addMeasureLine: (line) =>
        set((state) => ({
          measureLines: [...state.measureLines, line],
          // 라인 추가 후 측정 포인트 초기화
          measurePoints: null
        })),

      removeMeasureLine: (id) =>
        set((state) => ({
          measureLines: state.measureLines.filter(line => line.id !== id)
        })),

      clearMeasurePoints: () =>
        set({ measurePoints: null }),

      clearAllMeasureLines: () =>
        set({ measureLines: [] }),

      // 지우개 모드 액션들 구현
      toggleEraserMode: () =>
        set((state) => ({
          isEraserMode: !state.isEraserMode,
          // 지우개 모드 활성화 시 측정 모드 비활성화
          isMeasureMode: !state.isEraserMode ? false : state.isMeasureMode,
          // 지우개 모드 비활성화 시 호버 초기화
          hoveredMeasureLineId: !state.isEraserMode ? state.hoveredMeasureLineId : null
        })),

      setEraserMode: (enabled) =>
        set((state) => ({
          isEraserMode: enabled,
          // 지우개 모드 활성화 시에만 측정 모드를 강제로 비활성화
          isMeasureMode: enabled ? false : state.isMeasureMode,
          // 지우개 모드가 켜질 때는 측정 포인트도 함께 초기화
          measurePoints: enabled ? null : state.measurePoints,
          // 지우개 모드 전환 시 호버는 항상 초기화
          hoveredMeasureLineId: null
        })),

      setHoveredMeasureLineId: (id) =>
        set({ hoveredMeasureLineId: id }),

      resetUI: () =>
        set(initialUIState),
      };
    },
    {
      name: 'ui-store', // localStorage 키
      partialize: (state) => ({
        viewMode: state.viewMode,
        view2DDirection: state.view2DDirection,  // localStorage에 저장
        showDimensions: state.showDimensions,  // localStorage에 저장
        // view2DTheme은 앱 테마와 동기화되므로 저장하지 않음
        // doorsOpen과 activePopup은 세션별로 초기화
      }),
    }
  )
); 
