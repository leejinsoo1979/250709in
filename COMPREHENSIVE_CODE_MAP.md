# Comprehensive Code Map - Furniture Editor Application

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Core Architecture](#core-architecture)
5. [State Management](#state-management)
6. [3D Rendering Pipeline](#3d-rendering-pipeline)
7. [Business Logic Organization](#business-logic-organization)
8. [Firebase Integration](#firebase-integration)
9. [Module and Component Dependencies](#module-and-component-dependencies)
10. [Key Features and Workflows](#key-features-and-workflows)

## Project Overview

The Furniture Editor is a React-based 3D furniture design and visualization application that allows users to:
- Design custom furniture layouts in 3D space
- Configure space dimensions and materials
- Place and arrange furniture modules
- Export designs as DXF files
- Save and manage projects through Firebase

### Application Flow
```
Dashboard → Step1 (Project Info) → Configurator (3D Editor) → Export/Save
```

## Technology Stack

### Core Technologies
- **React 19.1.0** - UI framework
- **TypeScript 5.8.3** - Type safety
- **Vite 6.3.5** - Build tool and dev server
- **Three.js 0.176.0** - 3D graphics engine
- **React Three Fiber 9.1.2** - React renderer for Three.js
- **Zustand 5.0.5** - State management
- **Firebase 11.9.1** - Backend services (Auth, Firestore, Storage)

### Supporting Libraries
- **@react-three/drei** - Three.js helpers
- **@tarikjabiri/dxf** - DXF file generation
- **react-router-dom** - Routing
- **lucide-react** - Icons
- **framer-motion** - Animations
- **react-colorful** - Color picker

## Project Structure

```
src/
├── App.tsx                    # Main app component with routing
├── main.tsx                   # Entry point
├── auth/                      # Authentication
│   └── AuthProvider.tsx       # Firebase auth context
├── components/                # Shared UI components
│   ├── common/               # Common reusable components
│   ├── dashboard/            # Dashboard specific components
│   ├── collaboration/        # Collaboration features
│   └── debug/                # Debug utilities
├── contexts/                  # React contexts
│   └── ThemeContext.tsx      # Theme management
├── data/                      # Data definitions
│   └── modules/              # Furniture module definitions
├── editor/                    # Main editor functionality
│   ├── Step1/                # Project setup wizard
│   ├── Configurator/         # Main 3D editor interface
│   └── shared/               # Shared editor components
├── firebase/                  # Firebase integration
│   ├── auth.ts               # Authentication
│   ├── config.ts             # Firebase configuration
│   ├── projects.ts           # Project CRUD operations
│   └── types.ts              # Firebase type definitions
├── hooks/                     # Custom React hooks
├── pages/                     # Page components
├── services/                  # Business services
├── store/                     # Zustand stores
├── styles/                    # Global styles
├── types/                     # TypeScript type definitions
└── utils/                     # Utility functions
```

## Core Architecture

### 1. Component Architecture

```
App.tsx (Router + Auth + Theme)
├── Dashboard (Project Management)
├── Step1 (Project Setup)
│   ├── Step1BasicInfo
│   ├── Step2SpaceConfig
│   └── Step3Confirmation
└── Configurator (3D Editor)
    ├── Header (Save/Load/Export)
    ├── Sidebar (Tools/Controls)
    ├── Space3DView (3D Viewer)
    └── RightPanel (Properties)
```

### 2. Data Flow Architecture

```
User Input → UI Components → Zustand Stores → 3D Viewer/Firebase
                                ↓
                          Derived Stores
                                ↓
                          Computed Values
```

### 3. 3D Rendering Architecture

```
Space3DView (Provider)
├── ThreeCanvas (WebGL Context)
│   ├── Camera Management
│   ├── Lighting
│   └── Controls
├── Room (Space Boundaries)
├── Furniture Components
├── Grid/Guides
└── Interaction Handlers
```

## State Management

### Store Structure

#### Core Stores
1. **projectStore** (`/store/core/projectStore.ts`)
   - Basic project information (title, location)
   - Project dirty state tracking
   ```typescript
   interface ProjectState {
     basicInfo: { title: string; location: string; }
     isDirty: boolean
     setBasicInfo: (info) => void
     resetAll: () => void
   }
   ```

2. **spaceConfigStore** (`/store/core/spaceConfigStore.ts`)
   - Space dimensions (width, height, depth)
   - Installation type and wall configuration
   - Material settings
   - Columns and walls structure
   ```typescript
   interface SpaceInfo {
     width: number
     height: number
     depth: number
     installType: InstallType
     materialConfig: MaterialConfig
     columns: Column[]
     walls: Wall[]
   }
   ```

3. **furnitureStore** (`/store/core/furnitureStore.ts`)
   - Placed furniture modules
   - Selection states
   - Drag and drop state
   - Edit mode management
   ```typescript
   interface FurnitureDataState {
     placedModules: PlacedModule[]
     selectedPlacedModuleId: string | null
     currentDragData: CurrentDragData | null
     addModule: (module) => void
     removeModule: (id) => void
   }
   ```

4. **uiStore** (`/store/uiStore.ts`)
   - View mode (2D/3D)
   - Camera settings
   - UI element visibility
   - Selection states
   ```typescript
   interface UIState {
     viewMode: '2D' | '3D'
     view2DDirection: ViewDirection
     showDimensions: boolean
     doorsOpen: boolean
   }
   ```

#### Derived Store
- **derivedSpaceStore** (`/store/derivedSpaceStore.ts`)
  - Computed values from space configuration
  - Internal dimensions
  - Column calculations
  - Available space metrics

### State Flow Example
```
User changes space width → spaceConfigStore.setSpaceInfo()
                         → derivedSpaceStore recalculates
                         → Space3DView re-renders
                         → Furniture positions update
```

## 3D Rendering Pipeline

### Component Hierarchy
```
Space3DView.tsx
├── Space3DViewProvider (Context)
├── ThreeCanvas.tsx
│   ├── Camera setup (Orthographic/Perspective)
│   ├── Lighting (Ambient + Directional)
│   ├── OrbitControls
│   └── Scene management
├── Room.tsx (Space boundaries)
├── CADGrid.tsx (2D/3D grid system)
├── PlacedFurnitureContainer.tsx
│   └── Individual furniture modules
├── ColumnAsset.tsx (Structural columns)
└── WallAsset.tsx (Walls)
```

### Material System
```
MaterialFactory.ts
├── createMaterial() - Creates Three.js materials
├── Material caching system
├── Texture management
└── Color/texture application
```

### Camera Management
- **2D Mode**: Orthographic camera, fixed front view
- **3D Mode**: Perspective camera with orbit controls
- Automatic distance calculation based on space size
- Smooth transitions between modes

## Business Logic Organization

### Indexing System (`/editor/shared/utils/indexing/`)
Split into 4 specialized classes for separation of concerns:

1. **SpaceCalculator.ts**
   - Space dimension calculations
   - Internal width/height computation
   - Column count validation
   - Unit conversions (mm to Three.js units)

2. **ColumnIndexer.ts**
   - Column/slot indexing calculations
   - Slot position mapping
   - Column distribution algorithms
   ```typescript
   interface SpaceIndexingResult {
     columnCount: number
     columnWidth: number
     columnPositions: number[]
     totalWidth: number
   }
   ```

3. **FurniturePositioner.ts**
   - Furniture placement validation
   - Position adjustment algorithms
   - Collision detection
   - Space constraint checking

4. **FurnitureSpaceAdapter.ts**
   - Adapts furniture to space changes
   - Filters invalid furniture
   - Repositions furniture after space updates

### Furniture Management Hooks (`/editor/shared/furniture/hooks/`)
- **useFurnitureDragHandlers**: Drag and drop logic
- **useFurnitureSpaceAdapter**: Space change adaptation
- **useDropPositioning**: Drop position calculation
- **useSlotOccupancy**: Slot availability tracking

### Export System
- **dxfGenerator.ts**: Technical drawing export
- **thumbnailCapture.ts**: Project thumbnail generation

## Firebase Integration

### Structure
```
firebase/
├── config.ts         # Firebase initialization
├── auth.ts          # Authentication services
├── projects.ts      # Project CRUD operations
├── storage.ts       # File storage
├── teams.ts         # Team collaboration
├── sharing.ts       # Project sharing
└── types.ts         # TypeScript definitions
```

### Key Operations

1. **Authentication Flow**
   ```
   LoginForm → auth.signInWithEmailAndPassword()
             → AuthProvider updates context
             → App redirects to dashboard
   ```

2. **Project Management**
   ```typescript
   // Create project
   createProject(data) → Firestore document → Return ID

   // Load project
   getProject(id) → Fetch from Firestore → Load into stores

   // Save project
   updateProject(id, data) → Update Firestore → Update thumbnail
   ```

3. **Data Structure**
   ```typescript
   FirebaseProject {
     id: string
     userId: string
     title: string
     spaceConfig: SpaceInfo
     furniture: { placedModules: PlacedModule[] }
     createdAt: Timestamp
     updatedAt: Timestamp
   }
   ```

## Module and Component Dependencies

### Critical Dependencies

1. **Space3DView Dependencies**
   ```
   Space3DView
   ├── Depends on: All stores (space, furniture, UI)
   ├── Uses: Three.js components
   ├── Provides: 3D visualization
   └── Context: Space3DViewProvider
   ```

2. **Configurator Dependencies**
   ```
   Configurator
   ├── Firebase (save/load)
   ├── All stores
   ├── Space3DView
   ├── Control panels
   └── Export services
   ```

3. **Store Dependencies**
   ```
   derivedSpaceStore → spaceConfigStore
   furnitureStore → spaceConfigStore (for validation)
   All components → Multiple stores
   ```

### Import Graph (Key Paths)
```
main.tsx
└── App.tsx
    ├── AuthProvider
    ├── ThemeProvider
    └── Router
        ├── Dashboard
        ├── Step1
        └── Configurator
            ├── Space3DView
            ├── Controls
            └── Firebase services
```

## Key Features and Workflows

### 1. Project Creation Workflow
```
Dashboard → "New Project" → Step1
├── Basic Info (title, location)
├── Space Config (dimensions)
└── Confirmation → Navigate to Configurator
```

### 2. Furniture Placement Workflow
```
Module Gallery → Select Module → Drag to 3D View
├── Calculate drop position
├── Validate placement
├── Add to furnitureStore
└── Update 3D scene
```

### 3. Space Modification Workflow
```
Change Space Dimension → spaceConfigStore update
├── derivedSpaceStore recalculates
├── FurnitureSpaceAdapter validates furniture
├── Remove invalid furniture
└── Reposition valid furniture
```

### 4. Save/Load Workflow
```
Save: Gather store data → Firebase update → Generate thumbnail
Load: Fetch from Firebase → Populate stores → Render 3D scene
```

### 5. Export Workflow
```
Export Panel → Select format (DXF)
├── Generate technical drawing
├── Include dimensions
└── Download file
```

## Performance Optimizations

1. **Material Caching**: Reuse Three.js materials
2. **WebGL Memory Management**: Cleanup on route changes
3. **Derived Store Pattern**: Avoid redundant calculations
4. **Chunk Splitting**: Optimized bundle sizes
5. **Lazy Loading**: Components loaded on demand

## Development Guidelines

### Adding New Features
1. **New Furniture Type**
   - Add to `/data/modules/`
   - Create 3D component in `/viewer3d/components/modules/`
   - Update module index

2. **New Control**
   - Create in `/editor/shared/controls/`
   - Add to appropriate category
   - Export from index

3. **New Store**
   - Create in `/store/core/`
   - Define TypeScript interface
   - Export from `/store/index.ts`

### Code Organization Principles
- **Separation of Concerns**: Business logic separate from UI
- **Single Responsibility**: Each class/component has one job
- **Composition over Inheritance**: Use hooks and HOCs
- **Type Safety**: Full TypeScript coverage
- **Testability**: Pure functions where possible

## Testing Strategy
- Unit tests for business logic
- Store tests for state management
- Component tests for UI behavior
- Integration tests for workflows
- Vitest as test runner

## Deployment Configuration
- **Build**: Vite production build
- **Hosting**: Static file hosting (Netlify/Vercel)
- **Environment**: Firebase config via env vars
- **Routes**: SPA with client-side routing