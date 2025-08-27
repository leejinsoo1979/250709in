# TaskSpec for BUILDER-UI Implementation
## Furniture Editor UI Components & Implementation Guide

---

## 1. Component Implementation Checklist

### 1.1 Layout Components
```typescript
// Priority: HIGH - Week 1
interface LayoutComponents {
  AppShell: {
    status: 'pending',
    priority: 'critical',
    dependencies: [],
    specs: {
      structure: 'Header + Sidebar + Main + RightPanel',
      responsive: true,
      breakpoints: [768, 1024, 1440]
    }
  },
  
  Header: {
    status: 'pending',
    priority: 'critical',
    dependencies: ['AuthProvider', 'ProjectStore'],
    props: {
      logo: ReactNode,
      projectName: string,
      saveStatus: SaveStatus,
      userMenu: UserMenuProps,
      actions: HeaderAction[]
    }
  },
  
  Sidebar: {
    status: 'pending',
    priority: 'critical',
    dependencies: ['TabSystem'],
    props: {
      tabs: SidebarTab[],
      activeTab: string,
      collapsed: boolean,
      onTabChange: (tab: string) => void
    }
  },
  
  ViewportContainer: {
    status: 'pending',
    priority: 'critical',
    dependencies: ['ThreeCanvas', 'Konva2D'],
    props: {
      mode: '2D' | '3D',
      onModeChange: (mode: ViewMode) => void
    }
  }
}
```

### 1.2 3D Viewer Components
```typescript
// Priority: HIGH - Week 1
interface ViewerComponents {
  ThreeCanvas: {
    status: 'partial',  // Already exists
    priority: 'critical',
    location: 'src/editor/shared/viewer3d/components/base/ThreeCanvas.tsx',
    required_updates: [
      'Add touch gesture support',
      'Improve mobile performance',
      'Add view mode transitions'
    ]
  },
  
  Space3D: {
    status: 'exists',
    priority: 'high',
    location: 'src/editor/shared/viewer3d/Space3DView.tsx',
    required_updates: [
      'Add drop zone indicators',
      'Improve selection feedback',
      'Add measurement overlays'
    ]
  },
  
  FurnitureModule3D: {
    status: 'exists',
    priority: 'high',
    location: 'src/editor/shared/viewer3d/components/modules/',
    required_updates: [
      'Add drag preview',
      'Collision detection visualization',
      'Rotation handles'
    ]
  }
}
```

### 1.3 2D Viewer Components (NEW)
```typescript
// Priority: MEDIUM - Week 2
interface Viewer2DComponents {
  KonvaCanvas: {
    status: 'pending',
    priority: 'high',
    dependencies: ['konva', 'react-konva'],
    specs: {
      layers: ['grid', 'space', 'furniture', 'annotations', 'interactions'],
      performance: 'Use layer caching',
      interactions: 'Native Konva events'
    }
  },
  
  FloorPlanRenderer: {
    status: 'pending',
    priority: 'high',
    props: {
      space: SpaceConfig,
      furniture: PlacedModule[],
      scale: number,
      showDimensions: boolean,
      showGrid: boolean
    }
  },
  
  DimensionLines: {
    status: 'pending',
    priority: 'medium',
    props: {
      start: Point,
      end: Point,
      label: string,
      style: DimensionStyle
    }
  }
}
```

### 1.4 Control Components
```typescript
// Priority: HIGH - Week 1-2
interface ControlComponents {
  ModuleGallery: {
    status: 'exists',
    priority: 'critical',
    location: 'src/editor/shared/controls/furniture/ModuleGallery.tsx',
    required_updates: [
      'Add search/filter',
      'Improve drag initialization',
      'Add module preview on hover'
    ]
  },
  
  DimensionInputs: {
    status: 'exists',
    priority: 'high',
    location: 'src/editor/shared/controls/space/',
    required_updates: [
      'Add unit conversion',
      'Improve validation feedback',
      'Add increment/decrement buttons'
    ]
  },
  
  MaterialSelector: {
    status: 'exists',
    priority: 'medium',
    location: 'src/editor/shared/controls/styling/MaterialPanel.tsx',
    required_updates: [
      'Add material preview',
      'Improve color picker',
      'Add recent colors'
    ]
  },
  
  PropertyPanel: {
    status: 'partial',
    priority: 'high',
    location: 'src/editor/shared/controls/furniture/',
    required_updates: [
      'Unify property editors',
      'Add batch editing',
      'Improve responsive layout'
    ]
  }
}
```

---

## 2. State Management Updates

### 2.1 UI Store Enhancements
```typescript
// File: src/store/uiStore.ts
interface UIStoreEnhancements {
  // Existing state
  viewMode: '2D' | '3D';
  selectedModuleId: string | null;
  
  // New additions needed
  dragState: {
    isDragging: boolean;
    draggedModule: Module | null;
    dragPosition: { x: number, y: number };
    validDrop: boolean;
  };
  
  panelStates: {
    leftPanel: { visible: boolean; tab: string; width: number };
    rightPanel: { visible: boolean; tab: string; width: number };
    bottomPanel: { visible: boolean; height: number };
  };
  
  interactionMode: 'select' | 'place' | 'edit' | 'measure';
  
  viewSettings: {
    showGrid: boolean;
    showDimensions: boolean;
    showLabels: boolean;
    snapToGrid: boolean;
    gridSize: number;
  };
  
  // New actions needed
  actions: {
    setDragState: (state: DragState) => void;
    togglePanel: (panel: PanelType) => void;
    setInteractionMode: (mode: InteractionMode) => void;
    updateViewSettings: (settings: Partial<ViewSettings>) => void;
  };
}
```

### 2.2 Furniture Store Enhancements
```typescript
// File: src/store/core/furnitureStore.ts
interface FurnitureStoreEnhancements {
  // Existing functionality
  furniture: PlacedModule[];
  
  // New additions needed
  selection: {
    selected: string[];
    lastSelected: string | null;
    selectionBox: BoundingBox | null;
  };
  
  clipboard: {
    copied: PlacedModule[];
    cutItems: string[];
  };
  
  history: {
    past: FurnitureState[];
    future: FurnitureState[];
    maxHistory: 50;
  };
  
  // New actions needed
  actions: {
    selectMultiple: (ids: string[]) => void;
    copySelection: () => void;
    paste: (position?: Point) => void;
    undo: () => void;
    redo: () => void;
    groupSelection: () => void;
    ungroupSelection: () => void;
  };
}
```

---

## 3. Event System Implementation

### 3.1 Global Event Bus
```typescript
// File: src/utils/eventBus.ts
class EventBus {
  private events: Map<string, Set<EventHandler>>;
  
  constructor() {
    this.events = new Map();
  }
  
  on(event: string, handler: EventHandler): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(handler);
    
    // Return unsubscribe function
    return () => this.off(event, handler);
  }
  
  off(event: string, handler: EventHandler): void {
    this.events.get(event)?.delete(handler);
  }
  
  emit(event: string, data?: any): void {
    this.events.get(event)?.forEach(handler => handler(data));
  }
}

// Event types
interface AppEvents {
  'module:select': { id: string };
  'module:place': { module: Module; position: Point };
  'module:delete': { ids: string[] };
  'space:resize': { dimensions: Dimensions };
  'view:change': { mode: '2D' | '3D' };
  'save:trigger': { auto: boolean };
  'export:start': { format: ExportFormat };
}
```

### 3.2 Drag and Drop System
```typescript
// File: src/utils/dragDropManager.ts
interface DragDropManager {
  // Initialization
  init(container: HTMLElement): void;
  
  // Drag source registration
  registerDraggable(
    element: HTMLElement,
    data: DragData,
    options?: DragOptions
  ): () => void;
  
  // Drop target registration  
  registerDropzone(
    element: HTMLElement,
    validator: DropValidator,
    handler: DropHandler
  ): () => void;
  
  // Visual feedback
  showDropIndicator(position: Point): void;
  hideDropIndicator(): void;
  updateDragPreview(element: HTMLElement): void;
  
  // State
  isDragging(): boolean;
  getDragData(): DragData | null;
}

// Implementation hooks
function useDraggable(ref: RefObject<HTMLElement>, data: DragData) {
  useEffect(() => {
    if (!ref.current) return;
    
    const cleanup = dragDropManager.registerDraggable(
      ref.current,
      data,
      { preview: true, effectAllowed: 'copy' }
    );
    
    return cleanup;
  }, [ref, data]);
}

function useDropzone(
  ref: RefObject<HTMLElement>,
  onDrop: DropHandler,
  canDrop?: DropValidator
) {
  useEffect(() => {
    if (!ref.current) return;
    
    const cleanup = dragDropManager.registerDropzone(
      ref.current,
      canDrop || (() => true),
      onDrop
    );
    
    return cleanup;
  }, [ref, onDrop, canDrop]);
}
```

---

## 4. Component Implementation Templates

### 4.1 Base Component Template
```typescript
// Template for new UI components
import React, { memo, useCallback, useMemo } from 'react';
import { useUIStore } from '@/store/uiStore';
import styles from './ComponentName.module.css';

interface ComponentNameProps {
  // Props definition
}

export const ComponentName = memo<ComponentNameProps>(({
  // Destructured props
}) => {
  // Store connections
  const { state, actions } = useUIStore();
  
  // Memoized values
  const computedValue = useMemo(() => {
    // Expensive computations
  }, [/* dependencies */]);
  
  // Event handlers
  const handleEvent = useCallback((e: Event) => {
    // Handle event
  }, [/* dependencies */]);
  
  // Render
  return (
    <div className={styles.container}>
      {/* Component content */}
    </div>
  );
});

ComponentName.displayName = 'ComponentName';
```

### 4.2 Control Component Template
```typescript
// Template for control components
import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import { useTheme } from '@/contexts/ThemeContext';

interface ControlProps {
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  label?: string;
  error?: string;
}

export const Control: React.FC<ControlProps> = ({
  value,
  onChange,
  disabled = false,
  label,
  error
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [localValue, setLocalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  
  // Sync with external value
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  // Validation
  const isValid = useMemo(() => {
    // Validation logic
    return true;
  }, [localValue]);
  
  // Handle change with debouncing
  const debouncedChange = useDebouncedCallback(
    (newValue: any) => {
      if (isValid) {
        onChange(newValue);
      }
    },
    300
  );
  
  return (
    <div className={`control ${error ? 'error' : ''}`}>
      {label && <label>{t(label)}</label>}
      <input
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          debouncedChange(e.target.value);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? 'error-message' : undefined}
      />
      {error && (
        <span id="error-message" className="error-message">
          {t(error)}
        </span>
      )}
    </div>
  );
};
```

---

## 5. Mobile Optimization Requirements

### 5.1 Touch Event Handlers
```typescript
// File: src/utils/touchHandlers.ts
interface TouchHandlers {
  useTouchGestures(element: RefObject<HTMLElement>) {
    const [gesture, setGesture] = useState<Gesture | null>(null);
    
    useEffect(() => {
      const el = element.current;
      if (!el) return;
      
      let touches: Touch[] = [];
      let startTime: number;
      
      const handleTouchStart = (e: TouchEvent) => {
        touches = Array.from(e.touches);
        startTime = Date.now();
      };
      
      const handleTouchMove = (e: TouchEvent) => {
        if (touches.length === 2 && e.touches.length === 2) {
          // Pinch gesture detection
          const distance = getDistance(e.touches);
          const startDistance = getDistance(touches);
          const scale = distance / startDistance;
          
          setGesture({
            type: 'pinch',
            scale,
            center: getCenter(e.touches)
          });
        }
      };
      
      const handleTouchEnd = (e: TouchEvent) => {
        const duration = Date.now() - startTime;
        
        if (duration < 200 && touches.length === 1) {
          setGesture({ type: 'tap', position: touches[0] });
        } else if (duration > 500 && touches.length === 1) {
          setGesture({ type: 'longPress', position: touches[0] });
        }
      };
      
      el.addEventListener('touchstart', handleTouchStart);
      el.addEventListener('touchmove', handleTouchMove);
      el.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        el.removeEventListener('touchstart', handleTouchStart);
        el.removeEventListener('touchmove', handleTouchMove);
        el.removeEventListener('touchend', handleTouchEnd);
      };
    }, [element]);
    
    return gesture;
  }
}
```

### 5.2 Responsive Layouts
```css
/* File: src/styles/responsive.css */

/* Mobile First Approach */
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.sidebar {
  position: fixed;
  transform: translateX(-100%);
  transition: transform 0.3s;
  z-index: 100;
}

.sidebar.open {
  transform: translateX(0);
}

/* Tablet */
@media (min-width: 768px) {
  .app-shell {
    display: grid;
    grid-template-columns: 250px 1fr;
  }
  
  .sidebar {
    position: relative;
    transform: none;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .app-shell {
    grid-template-columns: 250px 1fr 300px;
  }
  
  .right-panel {
    display: block;
  }
}

/* Touch-optimized controls */
@media (pointer: coarse) {
  .button {
    min-height: 44px;
    padding: 12px 16px;
  }
  
  .input {
    min-height: 44px;
    font-size: 16px; /* Prevent zoom on iOS */
  }
}
```

---

## 6. Performance Optimization Tasks

### 6.1 Component Optimization
```typescript
// Optimization checklist for each component
interface OptimizationTasks {
  memoization: {
    required: ['ModuleGallery', 'PropertyPanel', 'MaterialSelector'],
    technique: 'React.memo with custom comparison',
    priority: 'high'
  },
  
  virtualization: {
    required: ['ModuleList', 'HistoryList'],
    library: 'react-window',
    threshold: '> 50 items',
    priority: 'medium'
  },
  
  lazyLoading: {
    required: ['ExportPanel', 'AdvancedSettings', 'HelpContent'],
    technique: 'React.lazy + Suspense',
    priority: 'low'
  },
  
  debouncing: {
    required: ['DimensionInputs', 'SearchBox', 'ColorPicker'],
    delay: { search: 300, input: 100, color: 50 },
    priority: 'high'
  }
}
```

### 6.2 Render Optimization
```typescript
// File: src/hooks/useOptimizedRender.ts
function useOptimizedRender<T>(
  data: T,
  renderFn: (data: T) => ReactElement,
  deps: DependencyList = []
): ReactElement {
  // Memoize expensive renders
  const rendered = useMemo(
    () => renderFn(data),
    [data, ...deps]
  );
  
  // Track render count in dev
  if (process.env.NODE_ENV === 'development') {
    const renderCount = useRef(0);
    useEffect(() => {
      renderCount.current++;
      console.log(`Render count: ${renderCount.current}`);
    });
  }
  
  return rendered;
}

// Usage example
const ExpensiveComponent = ({ data }) => {
  return useOptimizedRender(
    data,
    (d) => (
      <div>
        {/* Complex rendering logic */}
      </div>
    ),
    [/* additional deps */]
  );
};
```

---

## 7. Testing Requirements

### 7.1 Component Tests
```typescript
// File: src/components/__tests__/Component.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComponentName } from '../ComponentName';

describe('ComponentName', () => {
  // Rendering tests
  it('renders with required props', () => {
    render(<ComponentName {...requiredProps} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
  
  // Interaction tests
  it('handles click events', async () => {
    const handleClick = jest.fn();
    render(<ComponentName onClick={handleClick} />);
    
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
  
  // State tests
  it('updates state correctly', async () => {
    render(<ComponentName />);
    const input = screen.getByRole('textbox');
    
    await userEvent.type(input, 'test');
    expect(input).toHaveValue('test');
  });
  
  // Accessibility tests
  it('is keyboard navigable', async () => {
    render(<ComponentName />);
    const button = screen.getByRole('button');
    
    button.focus();
    expect(button).toHaveFocus();
    
    fireEvent.keyDown(button, { key: 'Enter' });
    // Assert action was triggered
  });
});
```

### 7.2 Integration Tests
```typescript
// File: src/integration/__tests__/workflow.test.tsx
describe('Furniture Placement Workflow', () => {
  it('completes full placement flow', async () => {
    // Setup
    const { container } = render(<App />);
    
    // 1. Select module from gallery
    const module = screen.getByTestId('module-cabinet-base');
    await userEvent.click(module);
    
    // 2. Drag to viewer
    const viewer = screen.getByTestId('viewer-3d');
    await userEvent.drag(module, viewer);
    
    // 3. Verify placement
    await waitFor(() => {
      expect(screen.getByTestId('placed-module')).toBeInTheDocument();
    });
    
    // 4. Edit properties
    const placedModule = screen.getByTestId('placed-module');
    await userEvent.click(placedModule);
    
    const widthInput = screen.getByLabelText('Width');
    await userEvent.clear(widthInput);
    await userEvent.type(widthInput, '1200');
    
    // 5. Verify updates
    expect(placedModule).toHaveStyle({ width: '1200px' });
  });
});
```

---

## 8. Deployment Checklist

### 8.1 Pre-Deployment Tasks
```yaml
code_quality:
  - [ ] All TypeScript errors resolved
  - [ ] ESLint warnings addressed
  - [ ] No console.log statements
  - [ ] Dead code removed
  
testing:
  - [ ] Unit test coverage > 80%
  - [ ] Integration tests passing
  - [ ] E2E critical paths tested
  - [ ] Cross-browser testing complete
  
performance:
  - [ ] Lighthouse score > 90
  - [ ] Bundle size < 500KB initial
  - [ ] Code splitting implemented
  - [ ] Images optimized
  
accessibility:
  - [ ] WCAG 2.1 AA compliant
  - [ ] Keyboard navigation tested
  - [ ] Screen reader tested
  - [ ] Color contrast verified
  
security:
  - [ ] Dependencies updated
  - [ ] Security audit passed
  - [ ] CSP headers configured
  - [ ] Input validation complete
```

### 8.2 Component Readiness Matrix
| Component | Dev | Test | Review | Deployed |
|-----------|-----|------|---------|----------|
| AppShell | 🔄 | ⏳ | ⏳ | ❌ |
| Header | 🔄 | ⏳ | ⏳ | ❌ |
| Sidebar | ✅ | 🔄 | ⏳ | ❌ |
| 3D Viewer | ✅ | ✅ | 🔄 | ❌ |
| 2D Viewer | 🔄 | ⏳ | ⏳ | ❌ |
| Module Gallery | ✅ | 🔄 | ⏳ | ❌ |
| Property Panel | 🔄 | ⏳ | ⏳ | ❌ |
| Material Selector | ✅ | 🔄 | ⏳ | ❌ |
| Export Panel | ✅ | ✅ | ✅ | ✅ |

Legend: ✅ Complete | 🔄 In Progress | ⏳ Pending | ❌ Not Started

---

## 9. Timeline & Milestones

### Week 1: Foundation (Priority: CRITICAL)
- [ ] Complete layout components (AppShell, Header, Sidebar)
- [ ] Implement basic drag and drop
- [ ] Set up event bus system
- [ ] Create base component templates

### Week 2: Core Features (Priority: HIGH)
- [ ] Complete 2D viewer with Konva
- [ ] Implement property panels
- [ ] Add keyboard navigation
- [ ] Create touch event handlers

### Week 3: Enhancement (Priority: MEDIUM)
- [ ] Add animations and transitions
- [ ] Implement undo/redo system
- [ ] Complete material selector
- [ ] Add search and filtering

### Week 4: Polish (Priority: LOW)
- [ ] Performance optimizations
- [ ] Accessibility improvements
- [ ] Mobile responsive adjustments
- [ ] Final testing and bug fixes

---

## 10. Handoff Notes for BUILDER-UI

### Critical Implementation Order
1. **Event System First**: Implement the event bus before any components
2. **State Management**: Enhance stores before building UI components
3. **Layout Structure**: Build AppShell before internal components
4. **Viewer Integration**: Ensure 3D/2D viewers work before controls
5. **Testing Framework**: Set up tests alongside component development

### Known Challenges
- **3D Performance on Mobile**: May need to reduce quality settings
- **Touch Gestures**: Complex gestures may conflict with browser defaults
- **State Synchronization**: Multiple stores need careful coordination
- **Bundle Size**: Monitor and implement code splitting early

### Resources & References
- Existing components: `/src/editor/shared/`
- Design tokens: `/src/styles/variables.css`
- Type definitions: `/src/types/`
- Test utilities: `/src/test/`
- Firebase integration: `/src/firebase/`

### Contact Points
- Architecture questions: Review with ARCHITECT
- UX clarifications: Consult SPEC-UX
- Performance issues: Engage PERFORMANCE specialist
- Testing strategy: Coordinate with QA/VALIDATOR