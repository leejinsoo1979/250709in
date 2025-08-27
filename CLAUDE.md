# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React-based furniture editor application that allows users to design and visualize custom furniture layouts in 3D space. The application is built with React 18, TypeScript, Three.js, and uses Firebase for backend services.

## Development Commands

### Essential Commands
```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production (runs TypeScript check first)
npm run preview          # Preview production build

# Testing
npm run test             # Run tests with Vitest
npm run test:ui          # Run tests with UI
npm run test:coverage    # Run tests with coverage report

# Quality Assurance
npm run lint             # Run ESLint
```

### Test Commands
```bash
# Run specific test file
npm run test -- src/store/__tests__/derivedSpaceStore.test.ts

# Run tests in watch mode
npm run test -- --watch

# Run tests with specific pattern
npm run test -- --run furniture

# Run tests for specific directory
npm run test -- src/editor/shared/utils/__tests__/
```

## Architecture Overview

### Core Application Flow
1. **Step0** (`/step0`) - Basic project information input
2. **Configurator** (`/configurator`) - Main furniture design interface with 3D viewer
3. **Firebase Integration** - Project persistence and authentication

### Main Components Structure

#### Entry Points
- `src/App.tsx` - Main application with routing and WebGL memory management
- `src/main.tsx` - Application entry point
- `src/editor/Step0/index.tsx` - Initial project setup
- `src/editor/Configurator/index.tsx` - Main design interface

#### State Management (Zustand)
- `src/store/core/projectStore.ts` - Project basic information
- `src/store/core/spaceConfigStore.ts` - Space configuration (dimensions, materials, etc.)
- `src/store/core/furnitureStore.ts` - Placed furniture management
- `src/store/derivedSpaceStore.ts` - Computed values from space configuration
- `src/store/uiStore.ts` - UI state (view mode, selections, etc.)

#### 3D Visualization System
- `src/editor/shared/viewer3d/Space3DView.tsx` - Main 3D viewer component
- `src/editor/shared/viewer3d/components/base/ThreeCanvas.tsx` - Three.js canvas setup
- `src/editor/shared/viewer3d/components/elements/` - 3D scene elements
- `src/editor/shared/viewer3d/components/modules/` - Furniture 3D rendering
- `src/editor/shared/viewer3d/utils/materials/` - Material and texture system

#### Control Systems
- `src/editor/shared/controls/` - Centralized control components
- `src/editor/shared/controls/space/` - Space dimension controls
- `src/editor/shared/controls/furniture/` - Furniture library and placement
- `src/editor/shared/controls/styling/` - Material and color controls

#### Data Layer
- `src/data/modules/` - Furniture module definitions
- `src/firebase/` - Firebase integration (auth, projects, config)

## Key Development Patterns

### State Management
- Uses Zustand for global state management
- Stores are separated by domain (project, space, furniture, UI)
- Derived store pattern for computed values (see `derivedSpaceStore.ts`)
- LocalStorage persistence for UI preferences

### 3D Rendering
- Three.js with React Three Fiber integration
- Modular 3D component system with separated concerns
- Material factory pattern with caching to avoid redundant object creation
- Camera management for 2D/3D view modes with automatic positioning

### Component Architecture
- Centralized control components to avoid duplication (`src/editor/shared/controls/`)
- Provider pattern for complex state (furniture management uses 4 separated providers)
- Hook-based business logic extraction (`src/editor/shared/furniture/hooks/`)
- CSS Modules for styling
- HOC pattern for cross-cutting concerns (`withFurnitureSpaceAdapter`)

### Business Logic Separation
- Indexing system split into 4 specialized classes (SpaceCalculator, ColumnIndexer, FurniturePositioner, FurnitureSpaceAdapter)
- Each class handles a single responsibility to avoid God Objects
- Re-exported through `src/editor/shared/utils/indexing/index.ts` for backward compatibility

## Important Files to Understand

### Core Business Logic
- `src/editor/shared/utils/indexing/` - Space calculation and furniture positioning (4 specialized classes)
- `src/editor/shared/furniture/hooks/` - Furniture interaction logic (drag/drop, space adaptation)
- `src/editor/shared/utils/dxfGenerator.ts` - DXF export functionality for technical drawings
- `src/editor/shared/furniture/providers/withFurnitureSpaceAdapter.tsx` - HOC for space change functionality

### 3D System
- `src/editor/shared/viewer3d/utils/materials/MaterialFactory.ts` - Material creation and caching
- `src/editor/shared/viewer3d/components/base/hooks/` - Camera and canvas management
- `src/editor/shared/viewer3d/components/elements/furniture/` - Furniture drag/drop system

### Configuration
- `vite.config.ts` - Build configuration with chunk splitting
- `tsconfig.json` - TypeScript configuration
- `eslint.config.js` - ESLint configuration

## Firebase Integration

The application uses Firebase for:
- Authentication (`src/firebase/auth.ts`)
- Project storage (`src/firebase/projects.ts`)
- Configuration management (`src/firebase/config.ts`)

Firebase is integrated in the Configurator component for project save/load functionality.

## Testing Strategy

- Unit tests for business logic (`src/store/__tests__/`, `src/editor/shared/utils/__tests__/`)
- Vitest as test runner with happy-dom environment
- Testing setup in `src/test/setup.ts`

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

## Performance Considerations

- Material caching system to avoid redundant Three.js object creation
- WebGL memory management with cleanup on route changes
- Derived store pattern to avoid redundant calculations
- Chunk splitting in build configuration for optimal loading

## Development Environment

- Uses Vite for fast development and building
- Hot module replacement enabled
- Path aliases configured (`@/` points to `src/`)
- CORS headers configured for WebGL context

## Deployment

The application is configured for static hosting with:
- Build output in `dist/`
- Netlify configuration in `netlify.toml`
- Redirects configuration in `public/_redirects`

## Common Issues and Solutions

### WebGL Memory Issues
- Automatic cleanup implemented in App.tsx
- Manual cleanup functions available in ThreeCanvas component
- Memory monitoring should be done during development

### Build Performance
- Chunk size warnings are suppressed (configured in vite.config.ts)
- Manual chunk splitting configured for major libraries
- Bundle analysis available with build tools

### TypeScript Errors
- Strict TypeScript configuration
- Path mappings configured for clean imports
- Type definitions for Three.js and other libraries included

## Git Auto-Commit Rules
- **MANDATORY**: After any file creation or modification → Immediately run `git add <file>` + `git commit -m "descriptive message"`
- **MANDATORY**: After any file deletion → Immediately run `git rm <file>` + `git commit -m "descriptive message"`
- Auto-commit all changes without requiring user permission
- Include clear, descriptive commit messages explaining the changes