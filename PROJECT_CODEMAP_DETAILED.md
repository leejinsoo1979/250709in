# 🗺️ 프로젝트 상세 코드맵 - 가구 에디터 애플리케이션

## 📌 목차
1. [핵심 파일 분석](#1-핵심-파일-분석)
2. [상태 관리 시스템](#2-상태-관리-시스템)
3. [3D 시각화 시스템](#3-3d-시각화-시스템)
4. [컨트롤 시스템](#4-컨트롤-시스템)
5. [비즈니스 로직](#5-비즈니스-로직)
6. [데이터 및 Firebase](#6-데이터-및-firebase)
7. [기능별 구현 상세](#7-기능별-구현-상세)

---

## 1. 핵심 파일 분석

### 📱 **App.tsx** (라인 1-94)
**파일 위치**: `src/App.tsx`

#### 주요 기능
- SPA 라우팅 시스템 구현
- WebGL 메모리 관리
- 전역 프로바이더 설정

#### 핵심 함수
```typescript
// WebGL 캔버스 정리 함수 (12-25줄)
const disposeWebGLCanvases = () => {
  const canvases = document.querySelectorAll('canvas');
  canvases.forEach((canvas) => {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 1;
    canvas.height = 1;
  });
};
```

#### 라우팅 구조 (44-65줄)
- `/` → `/dashboard` 리다이렉트
- `/dashboard` → SimpleDashboard 컴포넌트
- `/auth` → 로그인 폼
- `/step0` → 프로젝트 초기 설정
- `/configurator` → 메인 에디터

### 🚀 **main.tsx** (라인 1-10)
**파일 위치**: `src/main.tsx`
- React 18 createRoot API 사용
- 전역 CSS 로드 (`global.css`, `theme.css`)

### 📝 **Step0/index.tsx** (라인 1-214)
**파일 위치**: `src/editor/Step0/index.tsx`

#### 상태 관리
```typescript
const [loading, setLoading] = useState(false);
const [saving, setSaving] = useState(false);
const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
```

#### 핵심 기능
- **프로젝트 로드** (55-83줄): Firebase에서 데이터 가져오기
- **프로젝트 생성/저장** (125-179줄): 유효성 검사 및 저장
- **URL 파라미터 처리** (85-114줄): projectId 기반 자동 로드

### 🎨 **Configurator/index.tsx** (라인 1-1244)
**파일 위치**: `src/editor/Configurator/index.tsx`

#### 복잡한 상태 구조
```typescript
// 프로젝트 상태
const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
const [currentDesignFileId, setCurrentDesignFileId] = useState<string | null>(null);
const [currentDesignFileName, setCurrentDesignFileName] = useState<string>('');

// UI 상태
const [activeSidebarTab, setActiveSidebarTab] = useState('module');
const [activeRightPanelTab, setActiveRightPanelTab] = useState('placement');
const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
```

#### 핵심 비즈니스 로직

**도어 개수 계산** (156-185줄)
```typescript
const calculateDoorRange = (width: number) => {
  const minSlotWidth = 400;
  const maxSlotWidth = 600;
  const frameMargin = 100;
  const effectiveWidth = width - frameMargin;
  
  return {
    min: Math.ceil(effectiveWidth / maxSlotWidth),
    max: Math.floor(effectiveWidth / minSlotWidth),
    ideal: Math.round(effectiveWidth / 600)
  };
};
```

**프로젝트 저장** (301-430줄)
- 썸네일 생성
- Firebase/로컬 저장 분기
- BroadcastChannel 통신

**키보드 단축키** (79-134줄)
- Ctrl/Cmd + E: 기둥 편집
- 화살표: 기둥 이동 (5mm/50mm)

---

## 2. 상태 관리 시스템

### 🏪 **projectStore.ts**
**파일 위치**: `src/store/core/projectStore.ts`

```typescript
interface ProjectStore {
  basicInfo: {
    title: string;
    location: string;
  };
  isDirty: boolean;
  
  // 액션
  setBasicInfo: (info: Partial<BasicInfo>) => void;
  resetBasicInfo: () => void;
  resetAll: () => void;
  markAsSaved: () => void;
}
```

### 🏗️ **spaceConfigStore.ts**
**파일 위치**: `src/store/core/spaceConfigStore.ts`

#### 복잡한 공간 설정 구조
```typescript
interface SpaceInfo {
  // 기본 치수
  width: number;      // 1200-8000mm
  height: number;     // 1500-3500mm
  depth: number;      // 130-780mm
  
  // 설치 타입
  installType: 'built-in' | 'freestanding';
  
  // 벽 설정
  wallConfig: {
    left: boolean;
    right: boolean;
  };
  
  // 프레임 설정
  frameSize?: {
    left: number;   // 40-100mm
    right: number;  // 40-100mm
    top: number;    // 10-200mm
  };
  
  // 재질 설정
  materialConfig?: {
    interiorColor: string;
    doorColor: string;
    interiorTexture?: string;
    doorTexture?: string;
  };
  
  // 구조물
  columns?: Column[];
  walls?: Wall[];
}
```

### 🪑 **furnitureStore.ts**
**파일 위치**: `src/store/core/furnitureStore.ts`

#### 통합된 가구 관리
```typescript
interface FurnitureStore {
  // 데이터
  placedModules: PlacedModule[];
  
  // 선택
  selectedLibraryModuleId: string | null;
  selectedPlacedModuleId: string | null;
  
  // UI
  isFurniturePlacementMode: boolean;
  editMode: boolean;
  editingModuleId: string | null;
  
  // 드래그
  currentDragData: CurrentDragData | null;
}
```

### 📊 **derivedSpaceStore.ts**
**파일 위치**: `src/store/derivedSpaceStore.ts`

#### 계산된 값들
```typescript
interface DerivedSpaceStore {
  internalWidth: number;         // 프레임 제외 내부 폭
  columnCount: number;           // 컬럼 개수
  columnWidth: number;           // 각 컬럼 폭
  columnPositions: number[];     // 컬럼 시작 위치
  dualColumnPositions: number[]; // 듀얼 가구 위치
}
```

### 🎮 **uiStore.ts**
**파일 위치**: `src/store/uiStore.ts`

#### UI 상태 관리
```typescript
// localStorage 지속성
persist: {
  name: 'ui-storage',
  partialize: (state) => ({
    viewMode: state.viewMode,
    view2DDirection: state.view2DDirection,
    showDimensions: state.showDimensions,
  })
}
```

---

## 3. 3D 시각화 시스템

### 🎯 **Space3DView.tsx**
**파일 위치**: `src/editor/shared/viewer3d/Space3DView.tsx`

#### 카메라 위치 계산
```typescript
const cameraPosition = useMemo(() => {
  const distance = calculateOptimalDistance(width, height, depth, placedModules.length);
  
  if (viewMode === '2D') {
    switch (view2DDirection) {
      case 'front': return [0, height/200, distance];
      case 'left': return [-distance, height/200, 0];
      case 'right': return [distance, height/200, 0];
      case 'top': return [0, distance, 0];
    }
  }
  
  return [distance * 0.8, distance * 0.6, distance * 0.8];
}, [spaceInfo, viewMode, view2DDirection]);
```

#### 조명 시스템
- 메인 조명: DirectionalLight (강도 2.5)
- 필 라이트: 양측 DirectionalLight (강도 0.6)
- 환경광: AmbientLight (2D: 0.8, 3D: 0.5)

### 🖼️ **ThreeCanvas.tsx**
**파일 위치**: `src/editor/shared/viewer3d/components/base/ThreeCanvas.tsx`

#### WebGL 설정
```typescript
gl={{
  powerPreference: 'high-performance',
  antialias: true,
  preserveDrawingBuffer: true,  // 썸네일 캡처용
  logarithmicDepthBuffer: true,  // 정밀한 깊이 버퍼
}}
```

### 🏠 **Room.tsx**
**파일 위치**: `src/editor/shared/viewer3d/components/elements/Room.tsx`

#### 프레임 시스템 렌더링
```typescript
// 좌측 프레임 (295-355줄)
const renderLeftFrame = () => {
  if (wallConfig?.left) {
    return <WallFrame position={position} size={size} />;
  } else {
    return <EndPanelFrame position={position} size={size} />;
  }
};

// 상단 프레임 - ㄱ자 형태 (416-480줄)
const renderTopFrame = () => {
  return (
    <>
      <MainTopFrame />
      <SubTopFrame />
    </>
  );
};
```

### 🚪 **DoorModule.tsx**
**파일 위치**: `src/editor/shared/viewer3d/components/modules/DoorModule.tsx`

#### 도어 애니메이션
```typescript
const { rotation } = useSpring({
  rotation: doorsOpen ? Math.PI / 2 * 0.88 : 0,  // 80도 회전
  config: { tension: 170, friction: 26 }
});
```

### 🎨 **MaterialFactory.ts**
**파일 위치**: `src/editor/shared/viewer3d/utils/materials/MaterialFactory.ts`

#### 캐싱 시스템
```typescript
private static materialCache = new Map<string, THREE.Material>();

private static getCachedMaterial(key: string, factory: () => THREE.Material) {
  if (!this.materialCache.has(key)) {
    this.materialCache.set(key, factory());
  }
  return this.materialCache.get(key)!;
}
```

---

## 4. 컨트롤 시스템

### 📏 **공간 크기 컨트롤**
**파일 위치**: `src/editor/shared/controls/space/`

#### WidthControl.tsx
```typescript
const handleBlur = () => {
  const numValue = parseInt(localValue) || spaceInfo.width;
  const clampedValue = Math.max(1200, Math.min(8000, numValue));
  setSpaceInfo({ width: clampedValue });
  setLocalValue(clampedValue.toString());
};
```

#### HeightControl.tsx
- 범위: 1500-3500mm
- 실시간 검증
- 화살표 키 지원

### 🛋️ **가구 라이브러리**
**파일 위치**: `src/editor/shared/controls/furniture/ModuleLibrary.tsx`

#### 드래그 앤 드롭
```typescript
const handleDragStart = (e: React.DragEvent, module: ModuleData) => {
  const dragData = {
    moduleData: module,
    dragStartPosition: { x: e.clientX, y: e.clientY }
  };
  e.dataTransfer.setData('module', JSON.stringify(dragData));
};
```

#### 가구 필터링
```typescript
// 듀얼 가구 표시 조건
const isDualAvailable = internalWidth >= 1200;

// 슬롯 크기 체크
const isSlotTooSmall = columnWidth < 550 && module.id.includes('styler');
```

### 🎨 **재질 패널**
**파일 위치**: `src/editor/shared/controls/styling/MaterialPanel.tsx`

#### 색상 휠 시스템
```typescript
// 휠 클릭 처리 (299-350줄)
const handleWheelClick = (e: React.MouseEvent) => {
  const angle = calculateAngle(e.clientX, e.clientY);
  const distance = calculateDistance(e.clientX, e.clientY);
  
  if (distance > innerRadius && distance < outerRadius) {
    // 색상 선택
    const hue = angle;
    updateColor(hue, currentSaturation, currentLightness);
  }
};
```

---

## 5. 비즈니스 로직

### 🧮 **SpaceCalculator.ts**
**파일 위치**: `src/editor/shared/utils/indexing/SpaceCalculator.ts`

#### 주요 계산 함수
```typescript
// 내부 폭 계산
static calculateInternalWidth(spaceInfo: SpaceInfo): number {
  const { width, surroundType, frameSize, gapConfig } = spaceInfo;
  
  if (surroundType === 'surround') {
    return width - (frameSize.left + frameSize.right);
  } else {
    return width - (gapConfig.left + gapConfig.right);
  }
}

// 컬럼 수 제한
static getColumnCountLimits(internalWidth: number) {
  const minColumns = Math.ceil(internalWidth / 600);
  const maxColumns = Math.floor(internalWidth / 300.01);
  return { min: minColumns, max: maxColumns };
}
```

### 📍 **ColumnIndexer.ts**
**파일 위치**: `src/editor/shared/utils/indexing/ColumnIndexer.ts`

#### 인덱싱 알고리즘
```typescript
static calculateSpaceIndexing(params: IndexingParams) {
  const { internalWidth, columnCount, columnWidth } = params;
  
  // 컬럼 위치 계산
  const totalUsedWidth = columnCount * columnWidth;
  const remainingSpace = internalWidth - totalUsedWidth;
  const sideMargin = remainingSpace / 2;
  
  const columnPositions = [];
  for (let i = 0; i < columnCount; i++) {
    columnPositions.push(-internalWidth/2 + sideMargin + i * columnWidth);
  }
  
  // 듀얼 위치 계산
  const dualPositions = [];
  for (let i = 0; i < columnCount - 1; i++) {
    dualPositions.push((columnPositions[i] + columnPositions[i+1]) / 2);
  }
  
  return { columnPositions, dualPositions };
}
```

### 🪑 **FurniturePositioner.ts**
**파일 위치**: `src/editor/shared/utils/indexing/FurniturePositioner.ts`

#### 배치 검증
```typescript
static validateFurniturePosition(
  slotIndex: number,
  isDual: boolean,
  columnCount: number
): boolean {
  if (isDual) {
    return slotIndex >= 0 && slotIndex < columnCount - 1;
  }
  return slotIndex >= 0 && slotIndex < columnCount;
}
```

### 🔄 **FurnitureSpaceAdapter.ts**
**파일 위치**: `src/editor/shared/utils/indexing/FurnitureSpaceAdapter.ts`

#### 공간 변경 적응
```typescript
static filterAndAdjustFurniture(params: AdapterParams) {
  const validModules = [];
  
  for (const module of existingModules) {
    // 슬롯 인덱스 재계산
    const slotIndex = ColumnIndexer.findSlotIndexFromPosition(...);
    
    // 동적 ID 업데이트
    if (module.isDynamic) {
      const newId = this.updateDynamicModuleId(module.id, newColumnWidth);
      module.moduleData.id = newId;
    }
    
    // 위치 재계산
    const newPosition = FurniturePositioner.adjustFurniturePosition(...);
    
    validModules.push({ ...module, position: newPosition });
  }
  
  return validModules;
}
```

### 📐 **DXF 생성기**
**파일 위치**: `src/editor/shared/utils/dxfGenerator.ts`

#### 도면 생성
```typescript
export const generateDXF = (params: DXFParams): string => {
  const dxf = new DXF();
  
  // 정면도
  drawFrontElevation(dxf, params);
  
  // 평면도
  drawPlanView(dxf, params);
  
  // 측면도
  drawSideSection(dxf, params);
  
  return dxf.stringify();
};
```

---

## 6. 데이터 및 Firebase

### 📦 **가구 모듈 정의**
**파일 위치**: `src/data/modules/`

#### 모듈 구조
```typescript
interface ModuleData {
  id: string;
  name: string;
  category: 'full';
  dimensions: { width: number; height: number; depth: number; };
  hasDoor?: boolean;
  isDynamic?: boolean;
  defaultDepth?: number;
  modelConfig?: {
    sections?: SectionConfig[];
    leftSections?: SectionConfig[];
    rightSections?: SectionConfig[];
  };
}
```

#### 섹션 타입
```typescript
interface SectionConfig {
  type: 'shelf' | 'hanging' | 'drawer' | 'open';
  height: number;
  heightType?: 'percentage' | 'absolute';
  count?: number;
  drawerHeights?: number[];
  shelfPositions?: number[];
}
```

### 🔥 **Firebase 통합**
**파일 위치**: `src/firebase/`

#### 인증 (auth.ts)
```typescript
// 구글 로그인
export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return { user: result.user, error: null };
  } catch (error) {
    // 에러 처리
  }
};
```

#### 프로젝트 관리 (projects.ts)
```typescript
// 디자인파일 생성 (51-89줄)
export const createDesignFile = async (data: CreateDesignFileData) => {
  const user = await getCurrentUserAsync();
  if (!user) return { id: null, error: '로그인이 필요합니다.' };
  
  const designFileData = {
    name: data.name,
    projectId: data.projectId,
    spaceConfig: data.spaceConfig,
    furniture: data.furniture,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  const docRef = await addDoc(collection(db, 'designFiles'), designFileData);
  await updateProjectStats(data.projectId);
  
  return { id: docRef.id, error: null };
};
```

---

## 7. 기능별 구현 상세

### 🎯 **가구 드래그 앤 드롭**

#### 드래그 시작
**파일**: `ModuleLibrary.tsx` (라인 189-210)
```typescript
const handleDragStart = (e: React.DragEvent, module: ModuleData) => {
  setCurrentDragData({
    moduleData: module,
    dragStartPosition: { x: e.clientX, y: e.clientY },
    isDual: module.id.includes('dual')
  });
  
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('module', JSON.stringify(dragData));
};
```

#### 드롭 처리
**파일**: `useFurnitureDragHandlers.ts` (라인 45-120)
```typescript
const handleDrop = (e: React.DragEvent) => {
  const dropPosition = calculateDropPosition(e);
  const targetSlot = findTargetSlot(dropPosition);
  
  if (isSlotAvailable(targetSlot)) {
    const newModule = {
      id: generateUniqueId(),
      moduleData: draggedModule,
      position: targetSlot.position,
      slotIndex: targetSlot.index
    };
    
    addModule(newModule);
  }
};
```

### 🏗️ **기둥 처리 시스템**

#### 기둥 침범 감지
**파일**: `columnSlotProcessor.ts` (라인 234-312)
```typescript
const analyzeColumnEncroachment = (column: Column, slot: SlotInfo) => {
  const encroachmentType = determineEncroachmentType(column, slot);
  
  switch (encroachmentType) {
    case 'from-left':
      return calculateLeftEncroachment(column, slot);
    case 'from-right':
      return calculateRightEncroachment(column, slot);
    case 'center':
      return calculateCenterEncroachment(column, slot);
  }
};
```

#### 캐비넷 크기 조정
**파일**: `columnSlotProcessor.ts` (라인 456-523)
```typescript
const adjustCabinetForColumn = (cabinet: CabinetInfo, column: Column) => {
  const isDeepColumn = column.depth >= 400;
  
  if (isDeepColumn) {
    // 폭만 조정
    return adjustCabinetWidth(cabinet, column);
  } else {
    // 깊이 조정
    return adjustCabinetDepth(cabinet, column);
  }
};
```

### 🎨 **테마 시스템**

#### CSS 변수 적용
**파일**: `Room.tsx` (라인 636-648)
```typescript
color={(() => {
  if (typeof window !== 'undefined') {
    const computedStyle = getComputedStyle(document.documentElement);
    const primaryColor = computedStyle.getPropertyValue('--theme-primary').trim();
    if (primaryColor) {
      return primaryColor;
    }
  }
  return '#10b981'; // 기본값
})()}
```

### 💾 **자동 저장 시스템**

#### 저장 로직
**파일**: `Configurator/index.tsx` (라인 301-430)
```typescript
const saveProject = useCallback(async (showMessage = true) => {
  setSaveStatus('saving');
  
  try {
    // 썸네일 생성
    const thumbnail = await captureProjectThumbnail();
    
    // Firebase 저장
    if (isFirebaseConfigured() && user) {
      const { error } = await updateProject(
        currentProjectId,
        {
          title: basicInfo.title,
          projectData: basicInfo,
          spaceConfig: removeUndefinedValues(spaceInfo),
          furniture: { placedModules: removeUndefinedValues(placedModules) }
        },
        thumbnail
      );
      
      if (!error) {
        setSaveStatus('success');
        markAllAsSaved();
      }
    } else {
      // 로컬 저장
      saveToLocalStorage();
    }
  } catch (error) {
    setSaveStatus('error');
  }
}, [currentProjectId, basicInfo, spaceInfo, placedModules]);
```

### 📊 **DXF 내보내기**

#### 도면 생성 프로세스
**파일**: `dxfGenerator.ts` (라인 45-234)
```typescript
// 정면도 그리기
const drawFrontElevation = (dxf: DXF, params: DXFParams) => {
  const { width, height, modules } = params;
  
  // 외곽선
  dxf.addRectangle(0, 0, width, height);
  
  // 가구 그리기
  modules.forEach(module => {
    drawModuleFront(dxf, module);
    drawInternalStructure(dxf, module);
  });
  
  // 치수선
  addDimensionLines(dxf, width, height);
};
```

### 🔄 **실시간 협업**

#### 공유 시스템
**파일**: `sharing.ts` (라인 67-125)
```typescript
export const createShareLink = async (projectId: string) => {
  const accessToken = generateSecureToken();
  
  const shareData = {
    projectId,
    token: accessToken,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30일
  };
  
  const docRef = await addDoc(collection(db, 'shareLinks'), shareData);
  
  return {
    link: `${window.location.origin}/shared/${docRef.id}?token=${accessToken}`,
    error: null
  };
};
```

### 🎮 **키보드 단축키**

#### 단축키 처리
**파일**: `Configurator/index.tsx` (라인 79-134)
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl/Cmd + E: 기둥 편집
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      if (selectedColumnId) {
        openColumnEditModal(selectedColumnId);
      }
    }
    
    // 기둥 이동 (편집 모달 열림 상태)
    if (activePopup?.type === 'columnEdit') {
      const moveAmount = e.shiftKey ? 50 : 5;
      
      switch (e.key) {
        case 'ArrowLeft':
          moveColumn('left', moveAmount);
          break;
        case 'ArrowRight':
          moveColumn('right', moveAmount);
          break;
      }
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [selectedColumnId, activePopup]);
```

### 📱 **반응형 UI**

#### 뷰포트 기반 레이아웃
**파일**: `Configurator.module.css`
```css
/* 모바일 대응 */
@media (max-width: 768px) {
  .sidebar {
    width: 100%;
    position: fixed;
    bottom: 0;
    height: 60vh;
  }
  
  .viewer {
    height: 40vh;
  }
}

/* 태블릿 대응 */
@media (min-width: 769px) and (max-width: 1024px) {
  .sidebar {
    width: 280px;
  }
}
```

### 🔍 **검색 및 필터링**

#### 가구 검색
**파일**: `ModuleLibrary.tsx` (라인 234-267)
```typescript
const filterModules = (modules: ModuleData[], searchTerm: string) => {
  if (!searchTerm) return modules;
  
  const term = searchTerm.toLowerCase();
  return modules.filter(module => 
    module.name.toLowerCase().includes(term) ||
    module.description?.toLowerCase().includes(term) ||
    module.category.toLowerCase().includes(term)
  );
};
```

### 🎯 **성능 최적화**

#### 메모이제이션
**파일**: `Space3DView.tsx`
```typescript
const memoizedRoom = useMemo(() => (
  <Room
    spaceInfo={spaceInfo}
    placedModules={placedModules}
    derivedSpaceData={derivedSpaceData}
  />
), [spaceInfo, placedModules, derivedSpaceData]);
```

#### 가상화
**파일**: `PlacedFurnitureList.tsx`
```typescript
// 큰 목록의 경우 react-window 사용 고려
const VirtualizedList = ({ items, height }) => {
  return (
    <FixedSizeList
      height={height}
      itemCount={items.length}
      itemSize={80}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <FurnitureItem item={items[index]} />
        </div>
      )}
    </FixedSizeList>
  );
};
```

---

이 상세 코드맵은 가구 에디터 애플리케이션의 모든 주요 기능과 구현 세부사항을 포함하고 있습니다. 각 기능이 어떤 파일에서 구현되어 있는지, 어떤 로직을 사용하는지 명확하게 파악할 수 있도록 구성했습니다.