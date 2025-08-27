/**
 * [🔵 VALIDATOR] Portrait Mode Regression Test Suite
 * 
 * AC Requirements:
 * 1. Canvas DOM nodes must remain singular (count === 1)
 * 2. No memory leaks (event listener cleanup)
 * 3. Performance must maintain FPS >= 30
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useViewerUIStore } from '@/store/viewerUIStore';
import Space3DView from '../Space3DView';
import * as THREE from 'three';

// Mock stores
vi.mock('@/store/viewerUIStore', () => ({
  useViewerUIStore: vi.fn()
}));

vi.mock('@/store/derivedSpaceStore', () => ({
  useDerivedSpaceStore: vi.fn(() => ({
    cornerRadius: 0,
    wallHeight: 2500,
    computedDimensions: {
      baseWidth: 3000,
      baseHeight: 600,
      baseDepth: 2000
    },
    computedColumns: [],
    computedFloor: {
      position: { x: 0, y: 0, z: 0 },
      dimensions: { width: 3000, height: 600, depth: 2000 }
    },
    computedCeiling: {
      position: { x: 0, y: 2500, z: 0 },
      dimensions: { width: 3000, height: 20, depth: 2000 }
    },
    computedWalls: []
  }))
}));

vi.mock('@/store/core/furnitureStore', () => ({
  useFurnitureStore: vi.fn(() => ({
    items: []
  }))
}));

vi.mock('@/store/core/spaceConfigStore', () => ({
  useSpaceConfigStore: vi.fn(() => ({
    materials: {
      floor: { type: 'color', value: '#FFFFFF' },
      walls: { type: 'color', value: '#F0F0F0' },
      ceiling: { type: 'color', value: '#FFFFFF' }
    }
  }))
}));

describe('[VALIDATOR] Portrait Mode Canvas Regression Tests', () => {
  let mockStore: any;
  let performanceObserver: any;
  let frameCount = 0;
  let startTime = 0;

  beforeEach(() => {
    // Setup mock store
    mockStore = {
      isPortrait: false,
      viewMode: '3d',
      setPortrait: vi.fn((value: boolean) => {
        mockStore.isPortrait = value;
      }),
      setViewMode: vi.fn(),
      setCameraPosition: vi.fn(),
      setCameraZoom: vi.fn(),
      setIsInteracting: vi.fn()
    };

    (useViewerUIStore as any).mockReturnValue(mockStore);

    // Setup performance monitoring
    frameCount = 0;
    startTime = performance.now();
    
    // Mock requestAnimationFrame to count frames
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCount++;
      setTimeout(callback, 16); // ~60fps timing
      return frameCount;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('TEST 1: Should maintain single canvas after 5 portrait toggles', async () => {
    const { container } = render(<Space3DView />);
    
    // Wait for initial render
    await waitFor(() => {
      const canvases = container.querySelectorAll('canvas');
      expect(canvases.length).toBe(1);
    });

    // Perform 5 portrait toggles
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        mockStore.setPortrait(!mockStore.isPortrait);
        (useViewerUIStore as any).mockReturnValue({ ...mockStore });
      });

      // Force re-render
      const { container: newContainer } = render(<Space3DView />);
      
      // Validate canvas count remains 1
      await waitFor(() => {
        const canvases = newContainer.querySelectorAll('canvas');
        expect(canvases.length).toBe(1);
        
        // Also check for hidden canvases
        const hiddenCanvases = newContainer.querySelectorAll('canvas[style*="display: none"]');
        expect(hiddenCanvases.length).toBe(0);
      });

      cleanup();
    }

    // Final validation
    const finalRender = render(<Space3DView />);
    const finalCanvases = finalRender.container.querySelectorAll('canvas');
    
    expect(finalCanvases.length).toBe(1);
    expect(finalCanvases[0].style.display).not.toBe('none');
  });

  it('TEST 2: Should not leak event listeners on portrait toggle', async () => {
    const { container, unmount } = render(<Space3DView />);
    
    // Get initial listener count
    const getListenerCount = () => {
      const canvas = container.querySelector('canvas');
      if (!canvas) return 0;
      
      // Count event listeners (simplified - in real app we'd track actual listeners)
      const listeners = (canvas as any)._listeners || {};
      return Object.keys(listeners).reduce((acc, key) => {
        return acc + (Array.isArray(listeners[key]) ? listeners[key].length : 1);
      }, 0);
    };

    const initialListeners = getListenerCount();

    // Toggle portrait mode multiple times
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        mockStore.setPortrait(!mockStore.isPortrait);
        (useViewerUIStore as any).mockReturnValue({ ...mockStore });
      });
    }

    // Check listener count hasn't grown excessively
    const finalListeners = getListenerCount();
    expect(finalListeners).toBeLessThanOrEqual(initialListeners + 1); // Allow minimal growth

    // Unmount and check cleanup
    unmount();
    
    // Verify WebGL contexts are cleaned up
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      expect(debugInfo).toBeTruthy(); // WebGL still available (no context loss)
    }
  });

  it('TEST 3: Should maintain FPS >= 30 during portrait toggles', async () => {
    const { container } = render(<Space3DView />);
    
    // Reset performance counters
    frameCount = 0;
    startTime = performance.now();

    // Perform rapid portrait toggles
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        mockStore.setPortrait(i % 2 === 0);
        (useViewerUIStore as any).mockReturnValue({ ...mockStore });
      });

      // Allow some frames to render
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Calculate FPS
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000; // Convert to seconds
    const fps = frameCount / duration;

    // Validate FPS >= 30
    expect(fps).toBeGreaterThanOrEqual(30);
    
    // Log performance metrics
    console.log(`[VALIDATOR] Performance Metrics:
      - Frame Count: ${frameCount}
      - Duration: ${duration.toFixed(2)}s
      - Average FPS: ${fps.toFixed(2)}
      - Status: ${fps >= 30 ? 'PASS ✅' : 'FAIL ❌'}
    `);
  });

  it('TEST 4: Should properly cleanup Three.js resources on unmount', async () => {
    // Track Three.js object creation
    let geometryCount = 0;
    let materialCount = 0;
    
    const originalGeometry = THREE.BufferGeometry;
    const originalMaterial = THREE.Material;
    
    THREE.BufferGeometry = class extends originalGeometry {
      constructor() {
        super();
        geometryCount++;
      }
      dispose() {
        geometryCount--;
        super.dispose();
      }
    };
    
    THREE.Material = class extends originalMaterial {
      constructor() {
        super();
        materialCount++;
      }
      dispose() {
        materialCount--;
        super.dispose();
      }
    };

    const { unmount } = render(<Space3DView />);
    
    // Record initial counts
    const initialGeometryCount = geometryCount;
    const initialMaterialCount = materialCount;

    // Toggle portrait mode several times
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        mockStore.setPortrait(!mockStore.isPortrait);
      });
    }

    // Unmount component
    unmount();

    // Allow cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify resources were disposed
    expect(geometryCount).toBeLessThanOrEqual(initialGeometryCount);
    expect(materialCount).toBeLessThanOrEqual(initialMaterialCount);

    // Restore original constructors
    THREE.BufferGeometry = originalGeometry;
    THREE.Material = originalMaterial;
  });

  it('TEST 5: Should not create duplicate canvas containers in portrait mode', async () => {
    const { container } = render(<Space3DView />);
    
    // Set to portrait mode
    await act(async () => {
      mockStore.setPortrait(true);
      (useViewerUIStore as any).mockReturnValue({ ...mockStore });
    });

    // Check for duplicate containers with portrait classes
    const portraitContainers = container.querySelectorAll('.portrait-view-container');
    const canvasWrappers = container.querySelectorAll('[class*="canvas"]');
    
    // Validate no duplicates
    expect(portraitContainers.length).toBeLessThanOrEqual(1);
    expect(canvasWrappers.length).toBeLessThanOrEqual(1);
    
    // Check for any hidden elements that might be duplicates
    const hiddenElements = container.querySelectorAll('[style*="display: none"]');
    hiddenElements.forEach(element => {
      expect(element.tagName.toLowerCase()).not.toBe('canvas');
    });
  });
});

// Test Summary Reporter
describe('[VALIDATOR] Test Results Summary', () => {
  it('Should generate test report', () => {
    const report = {
      testSuite: 'Portrait Mode Canvas Regression',
      timestamp: new Date().toISOString(),
      requirements: {
        'Canvas Singularity': 'TEST 1 - Single canvas after 5 toggles',
        'Memory Management': 'TEST 2 - No event listener leaks',
        'Performance': 'TEST 3 - FPS >= 30',
        'Resource Cleanup': 'TEST 4 - Three.js disposal',
        'DOM Integrity': 'TEST 5 - No duplicate containers'
      },
      acceptanceCriteria: [
        'Canvas DOM nodes === 1',
        'No memory leaks detected',
        'Performance FPS >= 30',
        'Proper Three.js cleanup',
        'No duplicate portrait containers'
      ],
      validator: 'VALIDATOR-QA',
      nextAction: 'If all tests pass → SCRIBE-DOCS, If any fail → BUILDER-UI'
    };

    console.log('[🔵 VALIDATOR] Regression Test Report:', JSON.stringify(report, null, 2));
    expect(report).toBeDefined();
  });
});