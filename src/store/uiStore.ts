import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 2D 뷰 방향 타입 정의
export type View2DDirection = 'front' | 'left' | 'right' | 'top' | 'all';
export type PlacementWall = 'front' | 'left' | 'right';

// 에디터 탭 타입 정의
export interface EditorTab {
  id: string; // `${projectId}_${designFileId}` 형태의 고유 키
  projectId: string;
  projectName: string;
  designFileId: string;
  designFileName: string;
  addedAt: number; // timestamp
}

// 프레임 강조 타입 정의 (중간 서라운드 'middle-0', 'middle-1' 등 동적 키 지원)
export type HighlightedFrame = string | null;

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

export interface PanelSimulationLayout {
  worldX: number;
  worldY: number;
  worldZ: number;
  rotationZ: number;
  scale: number;
  widthWorld: number;
  heightWorld: number;
  order: number;
  sheetIndex: number;
}

export interface PanelSimulationSheetLayout {
  centerX: number;
  centerY: number;
  centerZ: number;
  sheetWidthWorld: number;
  sheetHeightWorld: number;
  sheetGapWorld: number;
  sheetCount: number;
  sheets?: Array<{
    centerX: number;
    widthWorld: number;
    heightWorld: number;
    label?: string;
    material?: string;
    thickness?: number;
    widthMm?: number;
    heightMm?: number;
  }>;
  panels?: Array<{
    key: string;
    label: string;
    material?: string;
    worldX: number;
    worldY: number;
    worldZ: number;
    widthWorld: number;
    heightWorld: number;
    thicknessWorld: number;
    rotationZ: number;
    sheetIndex: number;
    order: number;
  }>;
}

export interface PanelSimulationStockSummary {
  label?: string;
  material: string;
  thickness?: number;
  width: number;
  height: number;
  count: number;
}

export interface PanelSimulationMaterialSummary {
  material: string;
  count: number;
}

export interface PanelSimulationSummary {
  revision: number;
  sheetCount: number;
  panelCount: number;
  stockSpecs: PanelSimulationStockSummary[];
  materialCounts: PanelSimulationMaterialSummary[];
}

export type PanelSimulationPlaybackRate = 0.25 | 0.5 | 1 | 1.5 | 2;
export type PanelSimulationAnimationStyle = 'cinematic' | 'precision' | 'dynamic';

const getPanelSimulationNow = () => (
  typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000
);

const createPanelSimulationFallbackSheet = (): PanelSimulationSheetLayout => ({
  centerX: 0,
  centerY: 15,
  centerZ: 0,
  sheetWidthWorld: 7.32,
  sheetHeightWorld: 14.64,
  sheetGapWorld: 1.2,
  sheetCount: 1,
  sheets: [{ centerX: 0, widthWorld: 7.32, heightWorld: 14.64 }],
});

// UI 상태 타입
interface UIState {
  // 뷰어 모드 상태
  viewMode: '2D' | '3D';
  
  // 2D 뷰 방향 상태
  view2DDirection: View2DDirection;

  // 아일랜드 모드에서 현재 활성 면 (드롭/선택 시 어느 면에 태깅할지)
  activeIslandSide: 'front' | 'back';

  // 3D ViewCube 기준 현재 배치 슬롯을 보여줄 벽
  activePlacementWall: PlacementWall;
  
  // 문 열림/닫힘 상태 (전역 오버라이드: true=전체열기, false=전체닫기, null=개별상태)
  doorsOpen: boolean | null;

  // 도어 설치 의도 (토글 상태): 새 가구 배치 시 도어 유무 기본값
  doorInstallIntent: boolean;
  setDoorInstallIntent: (v: boolean) => void;

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

  // 기즈모(좌측 상단 ViewCube) 표시 상태
  showGizmo: boolean;

  // 프레임 표시 상태 (상부/걸래받이)
  showFrame: boolean;

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
    type: 'furniture' | 'furnitureEdit' | 'customizableEdit' | 'column' | 'columnEdit' | 'wall' | 'wallEdit' | 'panelB' | 'panelBEdit' | 'surroundEdit' | null;
    id: string | null;
    sectionIndex?: number; // 커스터마이징 가구 톱니 아이콘에서 특정 섹션만 편집
    areaSide?: 'left' | 'center' | 'right'; // 칸막이 좌/우/중앙 영역 중 특정 영역만 편집
    subPart?: 'upper' | 'lower'; // 상하 서브분할 영역 중 특정 영역만 편집
    screenX?: number; // 팝업 위치 힌트 (화면 X 좌표)
    screenY?: number; // 팝업 위치 힌트 (화면 Y 좌표)
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
  // Shift+클릭 다중 선택 (단일 선택 시 1개, 다중 시 여러 개)
  selectedFurnitureIds: string[];

  // 가구 옵션 프리셋 (카테고리별 1개, 세션 메모리)
  //   - 가구 편집 팝업에서 "옵션 저장" 클릭 시 현재 가구 속성을 카테고리(full/upper/lower)별로 저장
  //   - 다른 같은 카테고리 가구 팝업에서 "속성 주입" 시 사용자가 선택한 그룹의 속성만 덮어씀
  //   - 새 저장 시 같은 카테고리의 기존 프리셋은 덮어쓰기됨
  furniturePresets: Partial<Record<'full' | 'upper' | 'lower', { savedAt: number; props: Record<string, any> }>>;
  // 도어 상/하단갭 표시 기준 ('body' = 몸통 기준 / 'cf' = 천장·바닥 기준)
  //   우측바 토글 상태. 3D 도어 옆 치수 라벨도 이 값을 반영해 실시간 전환됨.
  doorGapDisplayMode: 'body' | 'cf';
  setDoorGapDisplayMode: (mode: 'body' | 'cf') => void;
  setFurniturePreset: (category: 'full' | 'upper' | 'lower', props: Record<string, any>) => void;
  clearFurniturePreset: (category: 'full' | 'upper' | 'lower') => void;

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

  // 태양(조명) 각도 설정 (0~360도, 수평 회전)
  sunAngle: number;

  // 윤곽선(엣지) 설정
  edgeOutlineEnabled: boolean;

  // 3D 투명 모드 (SketchUp K 단축키)
  isTransparentMode: boolean;

  // 보링 시각화 상태
  showBorings: boolean;

  // 측정 모드 상태
  isMeasureMode: boolean;
  measurePoints: [MeasurePoint, MeasurePoint | null] | null; // [시작점, 끝점 또는 null]
  measureLines: MeasureLine[]; // 저장된 측정 라인들

  // 3D 라이브 치수 측정 모드
  isLiveDimensionMode: boolean;
  liveDimensionSelectedKey: string | null;
  toggleLiveDimensionMode: () => void;
  setLiveDimensionMode: (enabled: boolean) => void;
  setLiveDimensionSelectedKey: (key: string | null) => void;

  // 3D 줄자 모드
  isTapeMeasureMode: boolean;
  toggleTapeMeasureMode: () => void;
  setTapeMeasureMode: (enabled: boolean) => void;

  // 3D 패널 시뮬레이션 모드
  panelSimulationPhase: 'assembled' | 'layout';
  panelSimulationRevision: number;
  panelSimulationLayouts: Record<string, PanelSimulationLayout>;
  panelSimulationSheet: PanelSimulationSheetLayout | null;
  panelSimulationSummary: PanelSimulationSummary | null;
  panelSimulationPlaybackRate: PanelSimulationPlaybackRate;
  panelSimulationAnimationStyle: PanelSimulationAnimationStyle;
  panelSimulationIsPlaying: boolean;
  panelSimulationStartedAt: number;
  panelSimulationOffsetSeconds: number;
  panelSimulationDurationSeconds: number;
  panelSimulationViewBackup: {
    showFurnitureEditHandles: boolean;
    showDimensions: boolean;
    showDimensionsText: boolean;
    showGuides: boolean;
    showAxis: boolean;
  } | null;
  togglePanelSimulation: () => void;
  setPanelSimulationPhase: (phase: 'assembled' | 'layout') => void;
  setPanelSimulationLayouts: (
    layouts: Record<string, PanelSimulationLayout>,
    sheet: PanelSimulationSheetLayout | null
  ) => void;
  setPanelSimulationSummary: (summary: PanelSimulationSummary | null) => void;
  setPanelSimulationPlaybackRate: (rate: PanelSimulationPlaybackRate) => void;
  setPanelSimulationAnimationStyle: (style: PanelSimulationAnimationStyle) => void;
  setPanelSimulationPlaying: (playing: boolean) => void;
  setPanelSimulationElapsedSeconds: (seconds: number) => void;
  setPanelSimulationDurationSeconds: (seconds: number) => void;
  closePanelSimulation: () => void;
  completePanelSimulationAssembly: (revision: number) => void;

  // 지우개 모드 상태
  isEraserMode: boolean;
  hoveredMeasureLineId: string | null; // 호버 중인 측정선 ID

  // 속장 재질 선택 모드 (MaterialPanel에서 속장 탭 활성 시 true → 서랍 인출 차단)
  isInteriorMaterialMode: boolean;
  setIsInteriorMaterialMode: (mode: boolean) => void;

  // 레이아웃 빌더(커스텀 가구 설계모드) 열림 상태
  isLayoutBuilderOpen: boolean;
  layoutBuilderRevision: number; // setLayoutBuilderOpen(true) 호출 시마다 증가 → useEffect 재트리거용
  setLayoutBuilderOpen: (open: boolean) => void;

  // 설계모드 저장 후 종료 요청 (종료 버튼 → CustomizablePropertiesPanel이 감지)
  designExitSaveRequest: boolean;
  setDesignExitSaveRequest: (req: boolean) => void;

  // 대시보드 레이아웃 타입
  dashboardLayout: 'saas' | 'windows';
  setDashboardLayout: (layout: 'saas' | 'windows') => void;

  // 에디터 탭 상태
  openTabs: EditorTab[];
  activeTabId: string | null;

  // 에디터 탭 액션
  addTab: (tab: Omit<EditorTab, 'id' | 'addedAt'>) => void;
  removeTab: (tabId: string) => string | null; // 다음 활성 탭 ID 반환
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<Pick<EditorTab, 'designFileName' | 'designFileId' | 'projectName'>>) => void;

  // 액션들
  setViewMode: (mode: '2D' | '3D') => void;
  setActiveDroppedCeilingTab: (tab: 'main' | 'dropped') => void;
  setView2DDirection: (direction: View2DDirection) => void;
  setActiveIslandSide: (side: 'front' | 'back') => void;
  setActivePlacementWall: (wall: PlacementWall) => void;
  toggleDoors: () => void;
  setDoorsOpen: (open: boolean | null) => void;
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
  setShowGizmo: (show: boolean) => void;
  setShowFrame: (show: boolean) => void;
  setShowAll: (show: boolean) => void;
  setShowFurniture: (show: boolean) => void;
  setRenderMode: (mode: 'solid' | 'wireframe') => void;
  setView2DTheme: (theme: 'dark' | 'light') => void;
  toggleTransparentMode: () => void;
  setTransparentMode: (enabled: boolean) => void;
  // 도어 갭 하이라이트 (상단갭/하단갭 입력 포커스 시 뷰어에 빨강 반투명 표시)
  highlightedDoorGap: { moduleIds: string[]; side: 'top' | 'bottom' } | null;
  setHighlightedDoorGap: (h: { moduleIds: string[]; side: 'top' | 'bottom' } | null) => void;

  // 경첩 위치 변경 모드: 선택된 가구의 경첩 치수 가이드만 표시
  hingePositionEditModeModuleId: string | null;
  setHingePositionEditModeModuleId: (moduleId: string | null) => void;
  
  // 팝업 관리 액션들
  openFurniturePopup: (moduleId: string) => void;
  openFurnitureEditPopup: (moduleId: string) => void;
  openCustomizableEditPopup: (moduleId: string, sectionIndex?: number, areaSide?: 'left' | 'center' | 'right', subPart?: 'upper' | 'lower', screenX?: number, screenY?: number) => void;
  openColumnPopup: (columnId: string) => void;
  openColumnEditModal: (columnId: string) => void;
  openWallPopup: (wallId: string) => void;
  openWallEditModal: (wallId: string) => void;
  openPanelBPopup: (panelBId: string) => void;
  openPanelBEditModal: (panelBId: string) => void;
  openSurroundEditPopup: (surroundId: string) => void;
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
  setSunAngle: (angle: number) => void;
  setEdgeOutlineEnabled: (enabled: boolean) => void;
  setShowBorings: (show: boolean) => void;
  toggleBorings: () => void;
  setSelectedFurnitureId: (id: string | null) => void;
  setSelectedFurnitureIds: (ids: string[]) => void;
  toggleSelectedFurnitureId: (id: string) => void; // Shift+클릭 토글
  clearSelectedFurnitureIds: () => void;

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

  // 균등배치 모드
  equalDistribution: boolean;
  setEqualDistribution: (enabled: boolean) => void;
  toggleEqualDistribution: () => void;
  // 상부장 전용 균등배치 (자유배치에서 상하부 분리 균등)
  equalDistributionUpper: boolean;
  setEqualDistributionUpper: (enabled: boolean) => void;
  toggleEqualDistributionUpper: () => void;
  // 하부장 전용 균등배치
  equalDistributionLower: boolean;
  setEqualDistributionLower: (enabled: boolean) => void;
  toggleEqualDistributionLower: () => void;

  // 슬롯배치 모드: 슬롯 너비 직접 입력 모드 (자유 토글 활성 시 true)
  slotWidthEditMode: boolean;
  setSlotWidthEditMode: (enabled: boolean) => void;
  // 자유 모드 진입 직전의 컬럼 수 (균등 복귀 시 사용)
  slotEditOriginalColumnCount: number | null;
  setSlotEditOriginalColumnCount: (n: number | null) => void;

  resetUI: () => void;
}

// 초기 상태
const initialUIState = {
  viewMode: '3D' as const,  // 기본값은 3D
  view2DDirection: 'front' as const,  // 기본값은 정면 뷰
  activeIslandSide: 'front' as const,  // 아일랜드 모드 기본 활성 면
  activePlacementWall: 'front' as const,
  doorsOpen: null,  // 기본값: null (개별 도어 상태 사용)
  doorInstallIntent: false,  // 기본값: 도어 없음 배치
  individualDoorsOpen: {} as Record<string, boolean>,  // 개별 도어 열림 상태
  showDimensions: true,  // 기본값: 치수 표시
  showDimensionsText: true,  // 기본값: 치수 텍스트 표시
  showGuides: false, // 기본값: 그리드(가이드) 숨김
  showAxis: true, // 기본값: 축 표시
  showGizmo: true, // 기본값: 좌측 상단 ViewCube 기즈모 표시
  highlightedDoorGap: null,  // 도어 갭 하이라이트
  hingePositionEditModeModuleId: null,  // 기본값: 경첩 위치 변경 모드 비활성
  showFrame: true, // 기본값: 프레임 표시
  showAll: true, // 기본값: 모든 가이드 표시
  dimensionOptionsBackup: null,
  showFurniture: true, // 기본값: 가구 표시
  showFurnitureEditHandles: true, // 기본값: 가구 편집 아이콘 표시
  renderMode: 'solid' as const, // 기본값: 솔리드 렌더링
  activePopup: {
    type: null as 'furniture' | 'furnitureEdit' | 'customizableEdit' | 'column' | 'columnEdit' | 'wall' | 'wallEdit' | 'panelB' | 'panelBEdit' | 'surroundEdit' | null,
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
  selectedFurnitureIds: [],
  furniturePresets: {},
  doorGapDisplayMode: 'body' as const,
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
  shadowEnabled: false,  // 기본값: 그림자 비활성화
  sunAngle: 45,  // 기본값: 태양 각도 45도 (우측 앞쪽)
  edgeOutlineEnabled: true,  // 기본값: 윤곽선 활성화
  isTransparentMode: false,  // 기본값: 3D 투명 모드 비활성화
  showBorings: false,  // 기본값: 보링 시각화 비활성화
  isMeasureMode: false,  // 기본값: 측정 모드 비활성화
  measurePoints: null,  // 기본값: 측정 포인트 없음
  measureLines: [],  // 기본값: 저장된 측정 라인 없음
  isLiveDimensionMode: false,  // 기본값: 3D 라이브 치수 측정 비활성
  liveDimensionSelectedKey: null,
  isTapeMeasureMode: false,  // 기본값: 3D 줄자 모드 비활성
  panelSimulationPhase: 'assembled' as const,  // 기본값: 가구 조립 상태
  panelSimulationRevision: 0,
  panelSimulationLayouts: {},
  panelSimulationSheet: null,
  panelSimulationSummary: null,
  panelSimulationPlaybackRate: 1,
  panelSimulationAnimationStyle: 'cinematic' as const,
  panelSimulationIsPlaying: false,
  panelSimulationStartedAt: 0,
  panelSimulationOffsetSeconds: 0,
  panelSimulationDurationSeconds: 1,
  panelSimulationViewBackup: null,
  isEraserMode: false,  // 기본값: 지우개 모드 비활성화
  hoveredMeasureLineId: null,  // 기본값: 호버 중인 측정선 없음
  equalDistribution: false,  // 기본값: 균등배치 비활성화
  equalDistributionUpper: false,  // 상부장 전용 균등
  equalDistributionLower: false,  // 하부장 전용 균등
  slotWidthEditMode: false,  // 슬롯배치 모드의 자유(슬롯 너비 직접 입력) 토글
  slotEditOriginalColumnCount: null,  // 자유 모드 진입 전 컬럼 수 (복귀용)
  isInteriorMaterialMode: false,  // 기본값: 속장 재질 모드 비활성
  isLayoutBuilderOpen: false,  // 기본값: 레이아웃 빌더 닫힘
  layoutBuilderRevision: 0,
  designExitSaveRequest: false,  // 기본값: 저장 후 종료 요청 없음
  dashboardLayout: 'windows' as const,  // 기본값: 윈도우 스타일
  openTabs: [] as EditorTab[],
  activeTabId: null as string | null,
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

// localStorage 마이그레이션
// 1) shadowEnabled 캐시 제거 (구버전 잔재)
// 2) showDimensions/showDimensionsText 도 제거 — 이제 영속화 안 함, 디자인 열 때마다 ON
try {
  const raw = localStorage.getItem('ui-store');
  if (raw) {
    const parsed = JSON.parse(raw);
    let mutated = false;
    if (parsed?.state) {
      ['shadowEnabled', 'showDimensions', 'showDimensionsText'].forEach((k) => {
        if (k in parsed.state) {
          delete parsed.state[k];
          mutated = true;
        }
      });
    }
    if (mutated) {
      localStorage.setItem('ui-store', JSON.stringify(parsed));
    }
  }
} catch (_) { /* ignore */ }

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => {
      // 스토어 생성 시 앱 테마 읽기
      const appTheme = getAppTheme();
// console.log('🔄 UIStore 초기화 - 앱 테마:', appTheme);
      
      return {
        ...initialUIState,
        view2DTheme: 'dark' as const,  // 2D 모드 기본 다크
      
      setViewMode: (mode) =>
        set((state) => ({
          viewMode: mode,
          // 2D 모드로 전환 시 가구 체크박스 기본 ON, 축 기본 OFF, 다크모드 강제
          showFurniture: mode === '2D' ? true : state.showFurniture,
          showAxis: mode === '2D' ? false : state.showAxis,
          view2DTheme: mode === '2D' ? 'dark' as const : state.view2DTheme,
          // 3D 모드 진입 시 표시 항목 항상 ON
          ...(mode === '3D' ? {
            showDimensions: true,
            showDimensionsText: true,
            showFurnitureEditHandles: true,
            dimensionOptionsBackup: null,
          } : {
            isLiveDimensionMode: false,
            isTapeMeasureMode: false,
            panelSimulationPhase: 'assembled',
            panelSimulationRevision: 0,
            panelSimulationLayouts: {},
            panelSimulationSheet: null,
            panelSimulationSummary: null,
            panelSimulationIsPlaying: false,
            panelSimulationStartedAt: getPanelSimulationNow(),
            panelSimulationOffsetSeconds: 0,
            panelSimulationDurationSeconds: 1,
            panelSimulationViewBackup: null,
            liveDimensionSelectedKey: null,
          })
        })),
        
      setActiveDroppedCeilingTab: (tab) => {
        set({ activeDroppedCeilingTab: tab });
      },
      
      setView2DDirection: (direction) =>
        set({ view2DDirection: direction }),
      setActiveIslandSide: (side) =>
        set({ activeIslandSide: side }),
      setActivePlacementWall: (wall) =>
        set({ activePlacementWall: wall }),
      
      toggleDoors: () =>
        set((state) => ({ doorsOpen: state.doorsOpen === true ? null : true })),

      setDoorsOpen: (open: boolean | null) => {
        set({ doorsOpen: open });
      },
      setDoorInstallIntent: (v: boolean) => {
        set({ doorInstallIntent: v });
        if (typeof window !== 'undefined') {
          (window as any).__doorInstallIntent = v;
        }
      },

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
// console.log('🎯 toggleDimensions - 이전 상태:', state.showDimensions, '새 상태:', nextValue);

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
            showGuides: backup ? backup.showGuides : false, // 기본값: 그리드 꺼짐
            showAxis: backup ? backup.showAxis : true,
            showDimensionsText: backup ? backup.showDimensionsText : true,
            dimensionOptionsBackup: null
          };
        }),
      toggleDimensionsText: () =>
        set((state) => {
          return { showDimensionsText: !state.showDimensionsText };
        }),
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
        set((state) => {
          // 3D 모드에서는 항상 켜진 상태 유지
          if (state.viewMode === '3D') return {};
          return { showFurnitureEditHandles: !state.showFurnitureEditHandles };
        }),
      
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
            showGuides: backup ? backup.showGuides : false, // 기본값: 그리드 꺼짐
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

      setShowGizmo: (show) =>
        set({ showGizmo: show }),

      setHighlightedDoorGap: (h) => set({ highlightedDoorGap: h }),

      setHingePositionEditModeModuleId: (moduleId) =>
        set({ hingePositionEditModeModuleId: moduleId }),

      setShowFrame: (show) =>
        set({ showFrame: show }),

      setShowAll: (show) =>
        set({ showAll: show }),
      
      setShowFurniture: (show) => {
// console.log('💾 UIStore.setShowFurniture called - new value:', show);
        set({ showFurniture: show });
      },

      setShowFurnitureEditHandles: (show) =>
        set({ showFurnitureEditHandles: show }),
      
      setRenderMode: (mode) =>
        set((state) => ({
          renderMode: state.isTapeMeasureMode || state.isLiveDimensionMode ? 'solid' : mode,
        })),
      
      setView2DTheme: (theme) =>
        set({ view2DTheme: theme }),

      toggleTransparentMode: () =>
        set((state) => ({ isTransparentMode: !state.isTransparentMode })),

      setTransparentMode: (enabled) =>
        set({ isTransparentMode: enabled }),

      // 가구 팝업 열기 (다른 모든 팝업 닫기)
      openFurniturePopup: (moduleId) =>
        set({ 
          activePopup: { type: 'furniture', id: moduleId }
        }),
      
      // 가구 편집 팝업 열기 (다른 모든 팝업 닫기)
      openFurnitureEditPopup: (moduleId) => {
// console.log('🔹 openFurnitureEditPopup 호출:', {
//           moduleId,
//           현재상태: get().highlightedCompartment
//         });
        set({ 
          activePopup: { type: 'furnitureEdit', id: moduleId },
          highlightedCompartment: moduleId,
          selectedFurnitureId: moduleId // 가구 편집 시 해당 가구도 강조
        });
      },
      
      // 커스터마이징 가구 편집 팝업 열기
      openCustomizableEditPopup: (moduleId, sectionIndex?, areaSide?, subPart?, screenX?, screenY?) => {
        set({
          activePopup: { type: 'customizableEdit', id: moduleId, sectionIndex, areaSide, subPart, screenX, screenY },
          selectedFurnitureId: moduleId,
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
      
      // 서라운드 편집 팝업 열기 (다른 모든 팝업 닫기)
      openSurroundEditPopup: (surroundId) =>
        set({
          activePopup: { type: 'surroundEdit', id: surroundId },
        }),

      // 모든 팝업 닫기 (selectedFurnitureId는 유지 — 우측바 도어 셋팅 등에서 참조)
      closeAllPopups: () =>
        set({
          activePopup: { type: null, id: null },
          highlightedCompartment: null,
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

      setSunAngle: (angle) =>
        set({ sunAngle: angle }),

      setEdgeOutlineEnabled: (_enabled) =>
        set({ edgeOutlineEnabled: true }), // 항상 켜짐 강제

      setShowBorings: (show) =>
        set({ showBorings: show }),

      toggleBorings: () =>
        set((state) => ({ showBorings: !state.showBorings })),

      setSelectedFurnitureId: (id) =>
        set({ selectedFurnitureId: id, selectedFurnitureIds: id ? [id] : [] }),

      setSelectedFurnitureIds: (ids) =>
        set({ selectedFurnitureIds: ids, selectedFurnitureId: ids[ids.length - 1] ?? null }),

      toggleSelectedFurnitureId: (id) => {
        const state = get();
        const baseSelectedId = state.selectedFurnitureId;
        const cur = state.selectedFurnitureIds || [];
        const base = [...cur];
        if (baseSelectedId && !base.includes(baseSelectedId)) {
          base.push(baseSelectedId);
        }
        const exists = base.includes(id);
        const next = exists ? base.filter(x => x !== id) : [...base, id];
        set({ selectedFurnitureIds: next, selectedFurnitureId: next[next.length - 1] ?? null });
      },

      clearSelectedFurnitureIds: () =>
        set({ selectedFurnitureIds: [], selectedFurnitureId: null }),

      setFurniturePreset: (category, props) => set((state) => ({
        furniturePresets: {
          ...state.furniturePresets,
          [category]: { savedAt: Date.now(), props },
        },
      })),
      clearFurniturePreset: (category) => set((state) => {
        const next = { ...state.furniturePresets };
        delete next[category];
        return { furniturePresets: next };
      }),

      setDoorGapDisplayMode: (mode) => set({ doorGapDisplayMode: mode }),

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

      toggleLiveDimensionMode: () =>
        set((state) => {
          const enabled = !state.isLiveDimensionMode;
          return {
            isLiveDimensionMode: enabled,
            isTapeMeasureMode: false,
            isMeasureMode: false,
            isEraserMode: false,
            measurePoints: null,
            hoveredMeasureLineId: null,
            liveDimensionSelectedKey: null,
            ...(enabled ? {
              showFurniture: true,
              renderMode: 'solid' as const,
            } : {}),
          };
        }),

      setLiveDimensionMode: (enabled) =>
        set({
          isLiveDimensionMode: enabled,
          isTapeMeasureMode: false,
          isMeasureMode: false,
          isEraserMode: false,
          measurePoints: null,
          hoveredMeasureLineId: null,
          liveDimensionSelectedKey: null,
          ...(enabled ? {
            showFurniture: true,
            renderMode: 'solid' as const,
          } : {}),
        }),

      toggleTapeMeasureMode: () =>
        set((state) => {
          const enabled = !state.isTapeMeasureMode;
          return {
            isTapeMeasureMode: enabled,
            isLiveDimensionMode: false,
            isMeasureMode: false,
            isEraserMode: false,
            measurePoints: null,
            hoveredMeasureLineId: null,
            liveDimensionSelectedKey: null,
            ...(enabled ? {
              showFurniture: true,
              renderMode: 'solid' as const,
            } : {}),
          };
        }),

      setTapeMeasureMode: (enabled) =>
        set({
          isTapeMeasureMode: enabled,
          isLiveDimensionMode: false,
          isMeasureMode: false,
          isEraserMode: false,
          measurePoints: null,
          hoveredMeasureLineId: null,
          liveDimensionSelectedKey: null,
          ...(enabled ? {
            showFurniture: true,
            renderMode: 'solid' as const,
          } : {}),
        }),

      togglePanelSimulation: () =>
        set((state) => {
          const nextPhase = state.panelSimulationPhase === 'layout' ? 'assembled' : 'layout';
          const backup = state.panelSimulationViewBackup;
          const nextRevision = state.panelSimulationRevision + 1;

          if (nextPhase === 'assembled' && backup) {
            window.setTimeout(() => {
              const latest = get();
              if (latest.panelSimulationPhase !== 'assembled' || latest.panelSimulationRevision !== nextRevision) {
                return;
              }
              get().completePanelSimulationAssembly(nextRevision);
            }, 90000);
          }

          return {
            panelSimulationPhase: nextPhase,
            panelSimulationRevision: nextRevision,
            panelSimulationSummary: null,
            panelSimulationIsPlaying: true,
            panelSimulationStartedAt: getPanelSimulationNow(),
            panelSimulationOffsetSeconds: 0,
            panelSimulationDurationSeconds: 1,
            ...(nextPhase === 'layout' ? {
              panelSimulationSheet: createPanelSimulationFallbackSheet(),
              panelSimulationViewBackup: {
                showFurnitureEditHandles: state.showFurnitureEditHandles,
                showDimensions: state.showDimensions,
                showDimensionsText: state.showDimensionsText,
                showGuides: state.showGuides,
                showAxis: state.showAxis,
              },
              showFurnitureEditHandles: false,
              showDimensions: false,
              showDimensionsText: false,
              showGuides: false,
              showAxis: false,
            } : {
              panelSimulationViewBackup: backup,
              showFurnitureEditHandles: false,
              showDimensions: false,
              showDimensionsText: false,
              showGuides: false,
              showAxis: false,
            }),
            isLiveDimensionMode: false,
            isTapeMeasureMode: false,
            isMeasureMode: false,
            isEraserMode: false,
            liveDimensionSelectedKey: null,
            measurePoints: null,
            hoveredMeasureLineId: null,
            viewMode: '3D',
            showFurniture: true,
          };
        }),

      setPanelSimulationPhase: (phase) =>
        set((state) => ({
          panelSimulationPhase: phase,
          panelSimulationRevision: state.panelSimulationRevision + 1,
          panelSimulationIsPlaying: true,
          panelSimulationStartedAt: getPanelSimulationNow(),
          panelSimulationOffsetSeconds: 0,
          panelSimulationDurationSeconds: 1,
          ...(phase === 'assembled' ? {
            panelSimulationLayouts: {},
            panelSimulationSheet: null,
            panelSimulationViewBackup: null,
          } : {}),
          panelSimulationSummary: null,
        })),

      setPanelSimulationLayouts: (layouts, sheet) =>
        set({
          panelSimulationLayouts: layouts,
          panelSimulationSheet: sheet,
          panelSimulationSummary: null,
        }),

      setPanelSimulationSummary: (summary) =>
        set({
          panelSimulationSummary: summary,
        }),

      setPanelSimulationPlaybackRate: (rate) =>
        set((state) => {
          const now = getPanelSimulationNow();
          const elapsed = state.panelSimulationOffsetSeconds + (
            state.panelSimulationIsPlaying
              ? Math.max(0, now - state.panelSimulationStartedAt) * state.panelSimulationPlaybackRate
              : 0
          );
          return {
            panelSimulationPlaybackRate: rate,
            panelSimulationOffsetSeconds: elapsed,
            panelSimulationStartedAt: now,
          };
        }),

      setPanelSimulationAnimationStyle: (style) =>
        set({ panelSimulationAnimationStyle: style }),

      setPanelSimulationPlaying: (playing) =>
        set((state) => {
          const now = getPanelSimulationNow();
          const elapsed = state.panelSimulationOffsetSeconds + (
            state.panelSimulationIsPlaying
              ? Math.max(0, now - state.panelSimulationStartedAt) * state.panelSimulationPlaybackRate
              : 0
          );
          return {
            panelSimulationIsPlaying: playing,
            panelSimulationOffsetSeconds: elapsed,
            panelSimulationStartedAt: now,
          };
        }),

      setPanelSimulationElapsedSeconds: (seconds) =>
        set((state) => ({
          panelSimulationOffsetSeconds: Math.max(0, Math.min(seconds, Math.max(1, state.panelSimulationDurationSeconds))),
          panelSimulationStartedAt: getPanelSimulationNow(),
        })),

      setPanelSimulationDurationSeconds: (seconds) =>
        set({
          panelSimulationDurationSeconds: Math.max(1, seconds),
        }),

      closePanelSimulation: () =>
        set((state) => {
          const backup = state.panelSimulationViewBackup;
          return {
            panelSimulationPhase: 'assembled',
            panelSimulationRevision: 0,
            panelSimulationLayouts: {},
            panelSimulationSheet: null,
            panelSimulationSummary: null,
            panelSimulationIsPlaying: false,
            panelSimulationStartedAt: getPanelSimulationNow(),
            panelSimulationOffsetSeconds: 0,
            panelSimulationDurationSeconds: 1,
            panelSimulationViewBackup: null,
            showFurnitureEditHandles: backup?.showFurnitureEditHandles ?? state.showFurnitureEditHandles,
            showDimensions: backup?.showDimensions ?? state.showDimensions,
            showDimensionsText: backup?.showDimensionsText ?? state.showDimensionsText,
            showGuides: backup?.showGuides ?? state.showGuides,
            showAxis: backup?.showAxis ?? state.showAxis,
          };
        }),

      completePanelSimulationAssembly: (revision) =>
        set((state) => {
          if (state.panelSimulationPhase !== 'assembled' || state.panelSimulationRevision !== revision || !state.panelSimulationViewBackup) {
            return {};
          }
          const backup = state.panelSimulationViewBackup;
          return {
            panelSimulationViewBackup: null,
            panelSimulationLayouts: {},
            panelSimulationSheet: null,
            panelSimulationSummary: null,
            panelSimulationIsPlaying: false,
            panelSimulationStartedAt: getPanelSimulationNow(),
            panelSimulationOffsetSeconds: Math.max(1, state.panelSimulationDurationSeconds),
            showFurnitureEditHandles: backup.showFurnitureEditHandles,
            showDimensions: true,
            showDimensionsText: true,
            showGuides: true,
            showAxis: backup.showAxis,
          };
        }),

      setLiveDimensionSelectedKey: (key) =>
        set({ liveDimensionSelectedKey: key }),

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

      // 균등배치 모드 액션들
      setEqualDistribution: (enabled) =>
        set({ equalDistribution: enabled }),

      toggleEqualDistribution: () =>
        set((state) => ({ equalDistribution: !state.equalDistribution })),

      setEqualDistributionUpper: (enabled: boolean) =>
        set({ equalDistributionUpper: enabled }),

      toggleEqualDistributionUpper: () =>
        set((state) => ({ equalDistributionUpper: !state.equalDistributionUpper })),

      setEqualDistributionLower: (enabled: boolean) =>
        set({ equalDistributionLower: enabled }),

      toggleEqualDistributionLower: () =>
        set((state) => ({ equalDistributionLower: !state.equalDistributionLower })),

      setSlotWidthEditMode: (enabled: boolean) =>
        set({ slotWidthEditMode: enabled }),

      setSlotEditOriginalColumnCount: (n: number | null) =>
        set({ slotEditOriginalColumnCount: n }),

      setIsInteriorMaterialMode: (mode) =>
        set({ isInteriorMaterialMode: mode }),

      setLayoutBuilderOpen: (open) =>
        set((state) => ({
          isLayoutBuilderOpen: open,
          // true 설정 시 revision 증가 → 이미 true인 상태에서 다시 true 호출해도 useEffect 재트리거
          layoutBuilderRevision: open ? state.layoutBuilderRevision + 1 : state.layoutBuilderRevision,
        })),

      setDesignExitSaveRequest: (req) =>
        set({ designExitSaveRequest: req }),

      setDashboardLayout: (layout) =>
        set({ dashboardLayout: layout }),

      // 에디터 탭 액션들
      addTab: (tab) => {
        const id = `${tab.projectId}_${tab.designFileId}`;
        set((state) => {
          // 중복 체크: id 기반 (projectId + designFileId 조합)
          const existingById = state.openTabs.find(t => t.id === id);
          if (existingById) {
            // 기존 탭의 이름이 다르면 업데이트
            if (existingById.designFileName !== tab.designFileName || existingById.projectName !== tab.projectName) {
              return {
                openTabs: state.openTabs.map(t => t.id === id ? { ...t, designFileName: tab.designFileName, projectName: tab.projectName } : t),
                activeTabId: id,
              };
            }
            return { activeTabId: id };
          }
          // 중복 체크: designFileId 기반 (같은 파일이 다른 projectId로 열릴 때 방지)
          if (tab.designFileId) {
            const existingByDesignFile = state.openTabs.find(t => t.designFileId === tab.designFileId);
            if (existingByDesignFile) {
              // 기존 탭 활성화 (이름 업데이트 포함)
              return {
                openTabs: state.openTabs.map(t => t.designFileId === tab.designFileId
                  ? { ...t, designFileName: tab.designFileName, projectName: tab.projectName }
                  : t),
                activeTabId: existingByDesignFile.id,
              };
            }
          }
          // 새 탭은 맨 앞(왼쪽)에 추가하고 활성화
          return {
            openTabs: [{ ...tab, id, addedAt: Date.now() }, ...state.openTabs],
            activeTabId: id,
          };
        });
      },

      removeTab: (tabId) => {
        const state = get();
        const idx = state.openTabs.findIndex(t => t.id === tabId);
        if (idx === -1) return null;

        const newTabs = state.openTabs.filter(t => t.id !== tabId);
        let nextActiveId: string | null = null;

        if (state.activeTabId === tabId && newTabs.length > 0) {
          // 인접 탭 선택: 우선 오른쪽, 없으면 왼쪽
          const nextIdx = Math.min(idx, newTabs.length - 1);
          nextActiveId = newTabs[nextIdx].id;
        } else if (newTabs.length > 0) {
          nextActiveId = state.activeTabId;
        }

        set({ openTabs: newTabs, activeTabId: nextActiveId });
        return nextActiveId;
      },

      setActiveTab: (tabId) =>
        set({ activeTabId: tabId }),

      updateTab: (tabId, updates) =>
        set((state) => ({
          openTabs: state.openTabs.map(t =>
            t.id === tabId ? { ...t, ...updates } : t
          ),
        })),

      resetUI: () =>
        set(initialUIState),
      };
    },
    {
      name: 'ui-store', // localStorage 키
      partialize: (state) => ({
        viewMode: state.viewMode,
        view2DDirection: state.view2DDirection,
        sunAngle: state.sunAngle,
        edgeOutlineEnabled: state.edgeOutlineEnabled,
        dashboardLayout: state.dashboardLayout,
        // openTabs/activeTabId 영속화 (사용자별 격리는 AuthProvider 의 사용자 변경 감지에서 초기화)
        openTabs: state.openTabs,
        activeTabId: state.activeTabId,
        // 뷰 토글: showDimensions/showDimensionsText 는 영속화 안 함 — 디자인 새로 열 때마다 ON
        showAll: state.showAll,
        // showGuides는 기본값(false) 유지를 위해 영속화하지 않음
        showAxis: state.showAxis,
        showFrame: state.showFrame,
        showFurniture: state.showFurniture,
        showFurnitureEditHandles: state.showFurnitureEditHandles,
      }),
    }
  )
); 
