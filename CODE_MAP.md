# React Furniture Editor - Comprehensive Code Map

## 📋 Project Overview

**Name**: Furniture Editor  
**Type**: React-based 3D furniture design and visualization application  
**Purpose**: Custom furniture layout design tool with real-time 3D visualization

### Tech Stack
- **Frontend Framework**: React 18 with TypeScript
- **3D Graphics**: Three.js + React Three Fiber (@react-three/fiber, @react-three/drei)
- **State Management**: Zustand v5
- **Routing**: React Router DOM v7
- **Styling**: CSS Modules
- **Build Tool**: Vite
- **Testing**: Vitest + Testing Library
- **Backend**: Firebase (Auth, Firestore, Storage)
- **Export**: DXF generation (@tarikjabiri/dxf)

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Application Layer                     │
├─────────────────────────────────────────────────────────┤
│  Router  │  Auth  │  Theme  │  Error Boundary           │
├─────────────────────────────────────────────────────────┤
│                    Main Components                        │
│  Step0  │  Configurator  │  Dashboard  │  FileTree      │
├─────────────────────────────────────────────────────────┤
│                  State Management (Zustand)               │
│  Project │ SpaceConfig │ Furniture │ Derived │ UI       │
├─────────────────────────────────────────────────────────┤
│                   3D Visualization Layer                  │
│  Space3DView │ ThreeCanvas │ Materials │ Geometry       │
├─────────────────────────────────────────────────────────┤
│                    Business Logic Layer                   │
│  Indexing │ Positioning │ Validation │ Export           │
├─────────────────────────────────────────────────────────┤
│                      Data Layer                          │
│  Firebase │ Module Definitions │ Types                   │
└─────────────────────────────────────────────────────────┘
```

## 📁 Directory Structure

```
src/
├── App.tsx                    # Main app component with routing
├── main.tsx                   # Application entry point
├── index.css                  # Global styles
├── vite-env.d.ts             # Vite type definitions
│
├── auth/                      # Authentication
│   └── AuthProvider.tsx       # Firebase auth context
│
├── components/                # Shared UI components
│   ├── auth/                  # Authentication components
│   │   └── LoginForm.tsx
│   ├── common/                # Common UI components
│   │   ├── Button/
│   │   ├── Card/
│   │   ├── ErrorBoundary.tsx
│   │   ├── Icons.tsx
│   │   ├── Input/
│   │   ├── LoadingSpinner/
│   │   ├── Logo.tsx
│   │   ├── Modal/
│   │   ├── Select/
│   │   ├── Tabs/
│   │   └── TopBar.tsx
│   ├── dashboard/             # Dashboard components
│   │   ├── DesignGrid.tsx
│   │   ├── ProjectTree.tsx
│   │   └── Sidebar.tsx
│   └── FileTree/              # File browser component
│       └── FileTree.tsx
│
├── contexts/                  # React contexts
│   └── ThemeContext.tsx       # Theme management
│
├── data/                      # Data definitions
│   ├── modules.ts             # Legacy module data
│   └── modules/               # Module generation
│       ├── index.ts           # Module factory
│       └── shelving.ts        # Shelving furniture definitions
│
├── editor/                    # Main editor components
│   ├── Step0/                 # Initial project setup
│   │   └── index.tsx
│   ├── Configurator/          # Main design interface
│   │   ├── index.tsx          # Main configurator (1800+ lines)
│   │   ├── style.module.css
│   │   └── components/        # Configurator UI components
│   │       ├── Header.tsx     # Top navigation
│   │       ├── HelpModal.tsx
│   │       ├── ModuleGalleryNew.tsx
│   │       ├── RightPanel.tsx # Right configuration panel
│   │       ├── Sidebar.tsx    # Left navigation sidebar
│   │       ├── ViewerControls.tsx # 3D viewer controls
│   │       └── controls/
│   │           └── ExportPanel.tsx
│   │
│   └── shared/                # Shared editor functionality
│       ├── components/        # Shared components
│       │   ├── FurnitureViewer.tsx
│       │   └── index.ts
│       ├── controls/          # Control components
│       │   ├── index.ts       # Control exports
│       │   ├── basic/         # Basic info controls
│       │   ├── customization/ # Customization controls
│       │   │   ├── BaseControls.tsx
│       │   │   ├── SurroundControls.tsx
│       │   │   └── components/
│       │   ├── furniture/     # Furniture controls
│       │   │   ├── ModuleGallery.tsx
│       │   │   ├── ModuleLibrary.tsx
│       │   │   ├── ModulePropertiesPanel.tsx
│       │   │   ├── PlacedFurnitureList.tsx
│       │   │   └── PlacedModulePropertiesPanel.tsx
│       │   ├── space/         # Space controls
│       │   │   ├── DepthControl.tsx
│       │   │   ├── FloorFinishControls.tsx
│       │   │   ├── HeightControl.tsx
│       │   │   ├── InstallTypeControls.tsx
│       │   │   └── WidthControl.tsx
│       │   ├── structure/     # Structure controls
│       │   │   ├── ColumnControl.tsx
│       │   │   ├── ColumnEditModal.tsx
│       │   │   ├── WallControl.tsx
│       │   │   └── index.ts
│       │   └── styling/       # Styling controls
│       │       └── MaterialPanel.tsx
│       │
│       ├── furniture/         # Furniture management
│       │   ├── hooks/         # Furniture hooks
│       │   │   ├── useDropPositioning.ts
│       │   │   ├── useFurnitureDragHandlers.ts
│       │   │   ├── useFurnitureSpaceAdapter.ts
│       │   │   └── useSlotOccupancy.ts
│       │   ├── providers/     # HOC providers
│       │   │   └── withFurnitureSpaceAdapter.tsx
│       │   └── types.ts
│       │
│       ├── hooks/             # Shared hooks
│       │   ├── useDXFExport.ts
│       │   └── useDebounce.ts
│       │
│       ├── utils/             # Utility functions
│       │   ├── __tests__/     # Unit tests
│       │   ├── columnSlotProcessor.ts
│       │   ├── dxfGenerator.ts # DXF export
│       │   ├── indexing.ts    # Legacy indexing (re-exports)
│       │   ├── indexing/      # Modular indexing system
│       │   │   ├── ColumnIndexer.ts        # Column calculations
│       │   │   ├── FurniturePositioner.ts  # Furniture positioning
│       │   │   ├── FurnitureSpaceAdapter.ts # Space adaptation
│       │   │   ├── SpaceCalculator.ts      # Space calculations
│       │   │   └── index.ts                # Re-exports
│       │   ├── materialConstants.ts
│       │   ├── materialRefresh.ts
│       │   ├── slotAvailability.ts
│       │   └── thumbnailCapture.ts
│       │
│       └── viewer3d/          # 3D visualization system
│           ├── Space3DView.tsx # Main 3D viewer component
│           ├── types.ts
│           ├── context/       # 3D viewer context
│           │   ├── Space3DViewContext.tsx
│           │   ├── Space3DViewContextTypes.ts
│           │   └── useSpace3DView.ts
│           ├── components/
│           │   ├── base/      # Base 3D components
│           │   │   ├── ThreeCanvas.tsx
│           │   │   ├── components/
│           │   │   │   └── SceneCleanup.tsx
│           │   │   ├── hooks/ # Canvas hooks
│           │   │   │   ├── useCameraManager.ts
│           │   │   │   ├── useCanvasEventHandlers.ts
│           │   │   │   ├── useCustomZoom.ts
│           │   │   │   ├── useOrbitControlsConfig.ts
│           │   │   │   └── useWebGLManagement.ts
│           │   │   └── utils/
│           │   │       ├── constants.ts
│           │   │       └── threeUtils.ts
│           │   ├── elements/  # 3D scene elements
│           │   │   ├── Room.tsx
│           │   │   ├── CADGrid.tsx
│           │   │   ├── CleanCAD2D.tsx
│           │   │   ├── ColumnGuides.tsx
│           │   │   ├── SlotDropZones.tsx
│           │   │   ├── furniture/ # Furniture 3D components
│           │   │   │   ├── FurnitureItem.tsx
│           │   │   │   ├── PlacedFurnitureContainer.tsx
│           │   │   │   └── hooks/
│           │   │   │       ├── useFurnitureCollision.ts
│           │   │   │       ├── useFurnitureDrag.ts
│           │   │   │       ├── useFurnitureKeyboard.ts
│           │   │   │       └── useFurnitureSelection.ts
│           │   │   └── space/  # Space 3D components
│           │   │       ├── ColumnAsset.tsx
│           │   │       ├── ColumnGhostPreview.tsx
│           │   │       ├── WallAsset.tsx
│           │   │       └── ...
│           │   ├── modules/   # 3D furniture modules
│           │   │   ├── BoxModule.tsx
│           │   │   ├── DoorModule.tsx
│           │   │   ├── DrawerRenderer.tsx
│           │   │   ├── ShelfRenderer.tsx
│           │   │   ├── components/
│           │   │   ├── hooks/
│           │   │   └── types/ # Furniture type renderers
│           │   │       ├── DualType1.tsx
│           │   │       ├── SingleType1.tsx
│           │   │       └── ...
│           │   └── ui/        # 3D UI overlays
│           │       ├── KeyboardShortcuts.tsx
│           │       └── ViewDirectionSelector.tsx
│           ├── hooks/         # 3D viewer hooks
│           │   └── useColumnDualSplitter.ts
│           └── utils/         # 3D utilities
│               ├── geometry.ts
│               ├── gridConfig.ts
│               ├── materials/  # Material system
│               │   ├── MaterialFactory.ts
│               │   ├── TextureGenerator.ts
│               │   └── index.ts
│               └── slotRaycast.ts
│
├── firebase/                  # Firebase integration
│   ├── auth.ts               # Authentication
│   ├── config.ts             # Firebase config
│   ├── projects.ts           # Project CRUD
│   ├── teams.ts              # Team management
│   └── types.ts              # Firebase types
│
├── pages/                    # Page components
│   ├── SimpleDashboard.tsx   # Main dashboard
│   ├── TestDashboard.tsx
│   └── AuthTestPage.tsx
│
├── store/                    # Zustand state management
│   ├── index.ts              # Store exports
│   ├── __tests__/            # Store tests
│   ├── core/                 # Core stores
│   │   ├── projectStore.ts   # Project info
│   │   ├── spaceConfigStore.ts # Space configuration
│   │   └── furnitureStore.ts # Furniture management
│   ├── derivedSpaceStore.ts  # Computed space values
│   └── uiStore.ts            # UI state
│
├── styles/                   # Global styles
│   ├── global.css
│   ├── reset.css
│   ├── theme.css
│   └── variables.css
│
├── test/                     # Test configuration
│   └── setup.ts
│
└── types/                    # Type definitions
    └── space.ts              # Space types
```

## 🔄 State Management Flow

### Zustand Stores Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Core Stores                           │
├─────────────────────────────────────────────────────────┤
│ projectStore      │ Basic project information           │
│ - title           │ - Project metadata                  │
│ - location        │ - Dirty state tracking              │
├───────────────────┼─────────────────────────────────────┤
│ spaceConfigStore  │ Space configuration                 │
│ - dimensions      │ - Install type & materials          │
│ - columns/walls   │ - Frame & gap settings              │
├───────────────────┼─────────────────────────────────────┤
│ furnitureStore    │ Furniture management                │
│ - placedModules   │ - Selection & drag state            │
│ - UI modes        │ - Edit mode tracking                │
└───────────────────┴─────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│                  Derived Store                           │
├─────────────────────────────────────────────────────────┤
│ derivedSpaceStore │ Computed values from space config   │
│ - internalWidth   │ - Column positions & boundaries    │
│ - columnCount     │ - Cached calculations               │
└───────────────────┴─────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│                    UI Store                              │
├─────────────────────────────────────────────────────────┤
│ uiStore           │ UI preferences & state              │
│ - viewMode        │ - Selected items                    │
│ - camera settings │ - Popup/modal state                 │
└───────────────────┴─────────────────────────────────────┘
```

## 🎨 3D Rendering System

### Component Hierarchy

```
Space3DView
├── Space3DViewProvider (Context)
├── ThreeCanvas
│   ├── Canvas (React Three Fiber)
│   ├── Cameras (Perspective/Orthographic)
│   ├── OrbitControls
│   ├── Lighting
│   └── SceneCleanup
├── Room (Space boundaries)
├── Grid Systems
│   ├── CADGrid (3D mode)
│   └── CleanCAD2D (2D mode)
├── Structure Elements
│   ├── ColumnAsset
│   ├── WallAsset
│   └── ColumnGuides
├── Furniture Elements
│   ├── PlacedFurnitureContainer
│   └── FurnitureItem
│       └── Module Renderers
│           ├── BoxModule
│           ├── DoorModule
│           ├── DrawerRenderer
│           └── ShelfRenderer
└── UI Overlays
    ├── SlotDropZones
    └── ViewDirectionSelector
```

### Material System

```
MaterialFactory (Singleton)
├── Cache Management
├── Material Creation
│   ├── Cabinet Materials
│   ├── Door Materials
│   ├── Frame Materials
│   └── Special Materials
└── Texture Loading
    └── TextureGenerator
```

## 🧮 Business Logic Modules

### Indexing System (Modular Architecture)

```
indexing/
├── SpaceCalculator
│   ├── mmToThreeUnits()
│   ├── calculateInternalWidth()
│   ├── getColumnCountLimits()
│   └── validateColumnCount()
├── ColumnIndexer
│   ├── calculateSpaceIndexing()
│   ├── findClosestColumnIndex()
│   └── findSlotIndexFromPosition()
├── FurniturePositioner
│   ├── validateFurniturePosition()
│   └── adjustFurniturePosition()
└── FurnitureSpaceAdapter
    └── filterAndAdjustFurniture()
```

### Key Business Rules

1. **Space Calculations**
   - Internal width = Total width - frame/gap adjustments
   - Column width constraints: 400mm - 600mm
   - Automatic column count based on space

2. **Furniture Positioning**
   - Slot-based placement system
   - Collision detection
   - Automatic space adaptation

3. **Export System**
   - DXF generation for technical drawings
   - Thumbnail capture for previews

## 🔌 Data Flow Patterns

### Project Load/Save Flow

```
User Action → Firebase/Local Storage
    ↓
Load Project Data
    ↓
Update Stores (project, space, furniture)
    ↓
Trigger Derived Calculations
    ↓
Re-render 3D Scene
```

### Furniture Placement Flow

```
Drag Start (ModuleGallery)
    ↓
Update furnitureStore.currentDragData
    ↓
Show Ghost Preview (3D Scene)
    ↓
Drop on Slot
    ↓
Validate Position
    ↓
Update furnitureStore.placedModules
    ↓
Re-render Scene
```

## 🧪 Testing Structure

```
__tests__/
├── Store Tests
│   ├── derivedSpaceStore.test.ts
│   └── uiStore.test.ts
├── Utils Tests
│   └── derivedCalculations.test.ts
└── Component Tests
    └── furnitureStore.test.tsx
```

### Test Setup
- **Runner**: Vitest
- **Environment**: happy-dom
- **Utilities**: Testing Library

## 🚀 Key Features

1. **Real-time 3D Visualization**
   - 2D/3D view modes
   - Multiple camera angles
   - WebGL optimization

2. **Modular Furniture System**
   - Dynamic module generation
   - Drag-and-drop placement
   - Automatic sizing

3. **Space Configuration**
   - Flexible dimensions
   - Column/wall placement
   - Material customization

4. **Export Capabilities**
   - DXF technical drawings
   - Project thumbnails
   - Firebase persistence

5. **Responsive Design**
   - Collapsible panels
   - Keyboard shortcuts
   - Touch support

## 🔧 Development Patterns

### Component Patterns
- **CSS Modules** for styling isolation
- **HOC Pattern** for cross-cutting concerns
- **Provider Pattern** for complex state
- **Hook Extraction** for business logic

### Performance Optimizations
- **Material Caching** to avoid redundant Three.js objects
- **Derived Store** for expensive calculations
- **WebGL Cleanup** on route changes
- **Chunk Splitting** in build configuration

### Code Organization
- **Separation of Concerns** (UI, Logic, Data)
- **Modular Architecture** (avoid God Objects)
- **Clean Imports** with path aliases (@/)
- **Centralized Exports** for easy consumption

## 📝 Configuration Files

- `vite.config.ts` - Build configuration with optimizations
- `tsconfig.json` - TypeScript configuration
- `eslint.config.js` - Code quality rules
- `netlify.toml` - Deployment configuration
- `.env` - Environment variables (Firebase config)

## 🌐 Deployment

- **Static Hosting** ready (Netlify/Vercel)
- **Build Output**: `dist/`
- **Environment Variables** for Firebase
- **SPA Routing** configured with redirects

---

## 1. **installType 값 불일치**
- 내부적으로는 `'builtin'`, `'semistanding'`, `'freestanding'` 등 영문 값을 사용해야 하는데,
- 버튼에서 한글(예: `'양쪽벽'`)을 값으로 넘기면,  
  서버/스토어/로직에서 인식하지 못해 에러가 발생할 수 있습니다.

**즉, 버튼에 표시되는 텍스트(한글)와 실제 값(영문)이 혼동되면 오류가 납니다.**

---

## 2. **필수 값 누락**
- 디자인 이름, 공간 정보 등 필수 입력값이 비어 있으면 생성이 안 됩니다.

---

## 3. **API/스토어 에러**
- 네트워크, 파이어베이스 등 외부 저장소 문제일 수도 있습니다.

---

## 빠른 조치 방법

1. **콘솔에 뜨는 에러 메시지**를 복사해서 알려주시면  
   → 바로 원인과 해결책을 안내해드릴 수 있습니다.

2. **최근에 Step2SpaceConfig.tsx에서 버튼 클릭 시 handleUpdate에 넘기는 값**이  
   `'builtin'`, `'semistanding'`, `'freestanding'` 등 영문으로 되어 있는지  
   한 번만 확인해 주세요.  
   (한글로 넘기면 안 됩니다! 표시는 한글, 값은 영문이어야 합니다.)

---

### 예시 (정상 코드)
```tsx
<code_block_to_apply_changes_from>
```
**이렇게 "값은 영문, 표시만 한글"이면 정상입니다.**

---

**에러 메시지나, 어떤 상황에서 멈추는지 한 줄만 알려주시면  
정확하게 어디를 고쳐야 할지 바로 안내드릴 수 있습니다!**  
(콘솔 에러 메시지 복사해서 붙여주시면 가장 빠릅니다.)