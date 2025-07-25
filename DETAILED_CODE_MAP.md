# Comprehensive Code Map for 250709in Project

## Project Overview
This is a React-based 3D furniture configuration application built with TypeScript, Three.js, and Firebase. The application allows users to design custom furniture layouts in 3D space with real-time visualization and collaborative features.

## Technology Stack
- **Frontend**: React 18, TypeScript, Vite
- **3D Rendering**: Three.js, React Three Fiber, React Three Drei
- **State Management**: Zustand
- **Backend**: Firebase (Auth, Firestore, Storage, Realtime Database)
- **Styling**: CSS Modules
- **Testing**: Vitest, Happy-DOM

## Directory Structure and Responsibilities

### Root Level Configuration
```
/
├── src/                    # Main source directory
├── public/                 # Static assets (images, materials, fonts)
├── docs/                   # Documentation files
├── firebase.json          # Firebase configuration
├── firestore.rules        # Firestore security rules
├── storage.rules          # Firebase storage rules
├── vite.config.ts         # Vite build configuration
├── tsconfig.json          # TypeScript configuration
├── package.json           # Project dependencies
└── netlify.toml           # Netlify deployment config
```

### Source Code Organization (`/src`)

#### 1. **Entry Points**
- `main.tsx` - Application entry point, renders React app
- `App.tsx` - Main router component with WebGL memory management
  - Handles route changes and WebGL context cleanup
  - Wraps app with ErrorBoundary, ThemeProvider, and AuthProvider

#### 2. **Core Application Flow**
```
/dashboard → SimpleDashboard.tsx (Project listing)
    ↓
/step1 → Step1/index.tsx (Project setup wizard)
    ↓
/configurator → Configurator/index.tsx (Main 3D editor)
```

#### 3. **State Management (`/store`)**
Organized with Zustand stores following single responsibility principle:

##### Core Stores (`/store/core/`)
- `projectStore.ts` - Basic project information (title, location, metadata)
- `spaceConfigStore.ts` - Space dimensions, columns, walls, materials
- `furnitureStore.ts` - Placed furniture, selections, drag states
- `projectDataStore.ts` - Project persistence and Firebase integration

##### Derived Stores
- `derivedSpaceStore.ts` - Computed values from space configuration

##### UI Stores
- `uiStore.ts` - View modes, UI preferences, camera settings

#### 4. **3D Visualization System (`/editor/shared/viewer3d`)**

##### Core Components:
- `Space3DView.tsx` - Main 3D viewer wrapper
- `components/base/ThreeCanvas.tsx` - Three.js canvas setup with camera management
- `context/Space3DViewContext.tsx` - Context provider for 3D view state

##### Scene Elements (`components/elements/`):
- `Room.tsx` - Room boundaries and walls
- `CADGrid.tsx`, `CleanCAD2D.tsx` - Grid systems for 2D/3D views
- `furniture/PlacedFurnitureContainer.tsx` - Manages all placed furniture
- `space/ColumnAsset.tsx`, `WallAsset.tsx` - Structural elements

##### Furniture Modules (`components/modules/`):
- `types/` - Different furniture types (SingleType1-4, DualType1-6)
- `components/BaseFurnitureShell.tsx` - Base furniture component
- `DoorModule.tsx`, `DrawerRenderer.tsx`, `ShelfRenderer.tsx` - Furniture parts

##### Material System (`utils/materials/`):
- `MaterialFactory.ts` - Centralized material creation with caching
- `TextureGenerator.ts` - Dynamic texture generation

#### 5. **Control Systems (`/editor/shared/controls`)**
Centralized control components to avoid duplication:

##### Space Controls (`/space`)
- `WidthControl.tsx`, `HeightControl.tsx`, `DepthControl.tsx`
- `InstallTypeControls.tsx`, `FloorFinishControls.tsx`

##### Structure Controls (`/structure`)
- `ColumnControl.tsx`, `ColumnEditModal.tsx`
- `WallControl.tsx`, `WallThumbnail.tsx`

##### Furniture Controls (`/furniture`)
- `ModuleGallery.tsx` - Furniture library display
- `PlacedFurnitureList.tsx` - List of placed items
- `ModulePropertiesPanel.tsx` - Furniture properties editor

##### Styling Controls (`/styling`)
- `MaterialPanel.tsx` - Material selection and customization

#### 6. **Business Logic (`/editor/shared/utils`)**

##### Indexing System (`/indexing/`) - Split into specialized classes:
- `SpaceCalculator.ts` - Space dimensions and unit conversions
- `ColumnIndexer.ts` - Column/slot positioning and indexing
- `FurniturePositioner.ts` - Furniture placement validation
- `FurnitureSpaceAdapter.ts` - Space change adaptations

##### Other Utilities:
- `dxfGenerator.ts` - DXF export for technical drawings
- `thumbnailCapture.ts` - Project thumbnail generation
- `materialConstants.ts` - Material definitions

#### 7. **Firebase Integration (`/firebase`)**
- `config.ts` - Firebase initialization
- `auth.ts` - Authentication services
- `projects.ts` - Project CRUD operations
- `storage.ts` - File storage management
- `realtime.ts` - Real-time collaboration
- `teams.ts`, `sharing.ts` - Collaboration features
- `userProfiles.ts`, `bookmarks.ts` - User features

#### 8. **UI Components (`/components`)**

##### Common Components (`/common`)
- `Button/`, `Input/`, `Select/`, `Modal/` - Base UI components
- `ProjectCard.tsx`, `ProjectDropdown.tsx` - Project UI elements
- `ThemeSelector.tsx` - Theme switching
- `ErrorBoundary.tsx` - Error handling

##### Feature Components:
- `auth/LoginForm.tsx` - Authentication UI
- `dashboard/` - Dashboard components
- `collaboration/` - Team collaboration features
- `debug/` - Development debug tools

#### 9. **Pages (`/pages`)**
- `SimpleDashboard.tsx` - Main project listing page
- `TestDashboard.tsx` - Testing interface
- `AuthTestPage.tsx` - Auth testing

#### 10. **Data Layer (`/data`)**
- `modules/` - Furniture module definitions
- `modules/shelving.ts` - Shelving furniture data
- `modules/index.ts` - Module registry

#### 11. **Services (`/services`)**
- `projectDataService.ts` - Project data operations
- `editorSaveService.ts` - Editor save functionality

#### 12. **Type Definitions (`/types`)**
- `project.ts` - Complete project type definitions
- `space.ts` - Space-related types

#### 13. **Hooks (`/hooks`)**
- `useThemeColors.ts` - Theme color management

## Key Design Patterns

### 1. **Provider Pattern**
- Multiple context providers for auth, theme, and 3D view
- HOC pattern with `withFurnitureSpaceAdapter`

### 2. **Separation of Concerns**
- Business logic separated into specialized classes
- UI components isolated from business logic
- Store actions handle state mutations

### 3. **Factory Pattern**
- MaterialFactory for efficient material creation
- Caching to prevent redundant Three.js objects

### 4. **Modular Architecture**
- Furniture modules are self-contained
- Controls are centralized and reusable
- Utils are organized by functionality

## Data Flow

### 1. **Project Creation Flow**
```
Dashboard → Step1 (Basic Info) → Configurator → Firebase Save
```

### 2. **3D Rendering Flow**
```
Store State → Space3DView → ThreeCanvas → Scene Elements → WebGL
```

### 3. **Furniture Placement Flow**
```
Module Gallery → Drag Handler → Position Validation → Store Update → 3D Re-render
```

## Key Files and Their Responsibilities

### Core Application Files
| File | Purpose |
|------|---------|
| `src/main.tsx` | React app entry point |
| `src/App.tsx` | Router and WebGL management |
| `src/pages/SimpleDashboard.tsx` | Project listing interface |
| `src/editor/Configurator/index.tsx` | Main 3D editor interface |

### State Management Files
| File | Purpose |
|------|---------|
| `src/store/core/projectStore.ts` | Project metadata |
| `src/store/core/spaceConfigStore.ts` | Space configuration |
| `src/store/core/furnitureStore.ts` | Furniture placement |
| `src/store/derivedSpaceStore.ts` | Computed space values |
| `src/store/uiStore.ts` | UI preferences |

### 3D Visualization Files
| File | Purpose |
|------|---------|
| `src/editor/shared/viewer3d/Space3DView.tsx` | 3D viewer wrapper |
| `src/editor/shared/viewer3d/components/base/ThreeCanvas.tsx` | Three.js setup |
| `src/editor/shared/viewer3d/utils/materials/MaterialFactory.ts` | Material management |

### Business Logic Files
| File | Purpose |
|------|---------|
| `src/editor/shared/utils/indexing/SpaceCalculator.ts` | Space calculations |
| `src/editor/shared/utils/indexing/FurniturePositioner.ts` | Placement validation |
| `src/editor/shared/utils/dxfGenerator.ts` | DXF export |

### Firebase Integration Files
| File | Purpose |
|------|---------|
| `src/firebase/config.ts` | Firebase setup |
| `src/firebase/auth.ts` | Authentication |
| `src/firebase/projects.ts` | Project CRUD |

## Memory Management
- WebGL context cleanup on route changes
- Material caching to prevent memory leaks
- Automatic canvas disposal in App.tsx

## Testing Infrastructure
- Unit tests for stores and utilities
- Vitest with happy-dom environment
- Test files co-located with source files

## Build and Deployment
- Vite for development and production builds
- Chunk splitting for optimal loading
- Static hosting ready (Netlify/Vercel)
- Firebase rules for security

## Development Commands
```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build

# Testing
npm run test             # Run tests
npm run test:ui          # Run tests with UI
npm run test:coverage    # Generate coverage report

# Code Quality
npm run lint             # Run ESLint
```

## Common Development Tasks

### Adding New Furniture Types
1. Define module data in `src/data/modules/`
2. Create 3D rendering component in `src/editor/shared/viewer3d/components/modules/`
3. Update `src/data/modules/index.ts` for integration

### Adding New Controls
1. Create control component in `src/editor/shared/controls/`
2. Add to appropriate category (space, furniture, styling)
3. Export from `src/editor/shared/controls/index.ts`
4. Integrate into Configurator tabs

### Modifying 3D Rendering
1. Update materials in `src/editor/shared/viewer3d/utils/materials/`
2. Modify scene elements in `src/editor/shared/viewer3d/components/elements/`
3. Test in both 2D and 3D view modes

This code map provides a comprehensive overview of the project structure, making it easier to navigate and understand the codebase architecture.