import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Group, Line, Text, Circle } from 'react-konva';
import Konva from 'konva';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import FurnitureItem2D from './components/FurnitureItem2D';
import Grid2D from './components/Grid2D';
import ViewerToolbar2D from './components/ViewerToolbar2D';
import styles from './Space2DKonvaView.module.css';

// Types
interface Space2DKonvaViewProps {
  width?: number;
  height?: number;
  viewMode?: '2D' | '3D';
  showGrid?: boolean;
  showDimensions?: boolean;
  showFurniture?: boolean;
}

interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

// Constants
const GRID_SIZE = 100; // 100mm grid
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const SCALE_FACTOR = 1.1;
const RESIZE_DEBOUNCE_DELAY = 100; // ms
const STAGE_CONTAINER_ID = 'konva-stage-container-2d'; // Unique ID for stage container

/**
 * Space2DKonvaView Component
 * 2D canvas viewer using Konva.js for furniture placement and editing
 */
const Space2DKonvaView: React.FC<Space2DKonvaViewProps> = ({
  width = 800,
  height = 600,
  viewMode = '2D',
  showGrid = true,
  showDimensions = true,
  showFurniture = true,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout>();
  const isInitializedRef = useRef(false);
  const mountedRef = useRef(false);

  // Store states
  const spaceConfig = useSpaceConfigStore();
  const furniture = useFurnitureStore();
  const uiStore = useUIStore();

  // Local state for viewport
  const [viewport, setViewport] = useState<ViewportState>({
    x: 0,
    y: 0,
    scale: 1,
  });

  const [stageSize, setStageSize] = useState({ width, height });
  const [isDragging, setIsDragging] = useState(false);
  const [draggedFurnitureId, setDraggedFurnitureId] = useState<string | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'pan' | 'measure'>('select');
  const [showColumns, setShowColumns] = useState(true);
  const [showWalls, setShowWalls] = useState(true);
  const [localShowGrid, setLocalShowGrid] = useState(showGrid);
  const [localShowDimensions, setLocalShowDimensions] = useState(showDimensions);
  const [localShowFurniture, setLocalShowFurniture] = useState(showFurniture);

  // Convert mm to canvas pixels
  const mmToPixels = useCallback((mm: number): number => {
    return mm * 0.1; // 1mm = 0.1px at scale 1
  }, []);

  // Debounced resize handler
  const debouncedUpdateSize = useCallback(() => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    
    resizeTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      // Only update if size actually changed
      setStageSize((prevSize) => {
        if (prevSize.width !== rect.width || prevSize.height !== rect.height) {
          console.log('[Space2DKonvaView] Size updated:', { width: rect.width, height: rect.height });
          return {
            width: rect.width,
            height: rect.height,
          };
        }
        return prevSize;
      });
    }, RESIZE_DEBOUNCE_DELAY);
  }, []);

  // Update stage size when container resizes with debounce and duplicate prevention
  useEffect(() => {
    mountedRef.current = true;
    
    // Initial size calculation
    if (containerRef.current && !isInitializedRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setStageSize({
        width: rect.width,
        height: rect.height,
      });
      isInitializedRef.current = true;
      console.log('[Space2DKonvaView] Initial mount, size set:', { width: rect.width, height: rect.height });
    }

    // Event handlers with duplicate prevention
    const handleResize = () => {
      if (!mountedRef.current) return;
      debouncedUpdateSize();
    };
    
    const handleOrientationChange = () => {
      if (!mountedRef.current) return;
      // Wait for orientation change to complete
      setTimeout(() => {
        if (mountedRef.current) {
          debouncedUpdateSize();
        }
      }, 300);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    
    return () => {
      mountedRef.current = false;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      
      // Clear any pending timeouts
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      // Cleanup Konva stage properly
      if (stageRef.current) {
        console.log('[Space2DKonvaView] Cleaning up Konva stage');
        stageRef.current.destroy();
      }
    };
  }, [debouncedUpdateSize]);

  // Center the space in view on mount and size changes
  useEffect(() => {
    if (!mountedRef.current) return;
    
    if (spaceConfig.width && spaceConfig.depth && stageSize.width > 0 && stageSize.height > 0) {
      const spaceWidthPx = mmToPixels(spaceConfig.width);
      const spaceDepthPx = mmToPixels(spaceConfig.depth);
      
      // Calculate scale to fit space in view
      const scaleX = stageSize.width * 0.8 / spaceWidthPx;
      const scaleY = stageSize.height * 0.8 / spaceDepthPx;
      const scale = Math.min(scaleX, scaleY, 1);
      
      // Center the space
      const x = (stageSize.width - spaceWidthPx * scale) / 2;
      const y = (stageSize.height - spaceDepthPx * scale) / 2;
      
      setViewport({ x, y, scale });
    }
  }, [spaceConfig.width, spaceConfig.depth, stageSize, mmToPixels]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = viewport.scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - viewport.x) / oldScale,
      y: (pointer.y - viewport.y) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, oldScale * (direction > 0 ? SCALE_FACTOR : 1 / SCALE_FACTOR))
    );

    setViewport({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }, [viewport]);

  // Handle stage drag (pan)
  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = e.target as Konva.Stage;
    setViewport(prev => ({
      ...prev,
      x: stage.x(),
      y: stage.y(),
    }));
  }, []);

  // Handle furniture selection
  const handleFurnitureSelect = useCallback((id: string) => {
    setSelectedFurnitureId(id);
  }, []);

  // Handle furniture drag
  const handleFurnitureDragStart = useCallback((id: string) => {
    setIsDragging(true);
    setDraggedFurnitureId(id);
  }, []);

  const handleFurnitureDragEnd = useCallback((id: string, x: number, z: number) => {
    setIsDragging(false);
    setDraggedFurnitureId(null);
    furniture.updateModule(id, {
      position: { x, y: furniture.placedModules.find(m => m.id === id)?.position.y || 0, z }
    });
  }, [furniture]);

  const handleFurnitureRotate = useCallback((id: string, rotation: number) => {
    furniture.updateModule(id, { rotation });
  }, [furniture]);

  const handleFurnitureDelete = useCallback((id: string) => {
    furniture.removeModule(id);
    if (selectedFurnitureId === id) {
      setSelectedFurnitureId(null);
    }
  }, [furniture, selectedFurnitureId]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setViewport(prev => ({ 
      ...prev, 
      scale: Math.min(MAX_SCALE, prev.scale * SCALE_FACTOR) 
    }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setViewport(prev => ({ 
      ...prev, 
      scale: Math.max(MIN_SCALE, prev.scale / SCALE_FACTOR) 
    }));
  }, []);

  const handleZoomReset = useCallback(() => {
    if (spaceConfig.width && spaceConfig.depth) {
      const spaceWidthPx = mmToPixels(spaceConfig.width);
      const spaceDepthPx = mmToPixels(spaceConfig.depth);
      const scaleX = stageSize.width * 0.8 / spaceWidthPx;
      const scaleY = stageSize.height * 0.8 / spaceDepthPx;
      const scale = Math.min(scaleX, scaleY, 1);
      const x = (stageSize.width - spaceWidthPx * scale) / 2;
      const y = (stageSize.height - spaceDepthPx * scale) / 2;
      setViewport({ x, y, scale });
    }
  }, [spaceConfig.width, spaceConfig.depth, stageSize, mmToPixels]);

  // Render space boundaries
  const renderSpace = () => {
    const widthPx = mmToPixels(spaceConfig.width);
    const depthPx = mmToPixels(spaceConfig.depth);
    
    return (
      <Group>
        {/* Floor */}
        <Rect
          x={0}
          y={0}
          width={widthPx}
          height={depthPx}
          fill="#f5f5f5"
          stroke="#333"
          strokeWidth={2 / viewport.scale}
        />
        
        {/* Columns */}
        {showColumns && spaceConfig.columns.map((column) => {
          const xPx = mmToPixels(column.position.x);
          const zPx = mmToPixels(column.position.z);
          const sizePx = mmToPixels(column.size);
          
          return (
            <Rect
              key={column.id}
              x={xPx - sizePx / 2}
              y={zPx - sizePx / 2}
              width={sizePx}
              height={sizePx}
              fill="#666"
              stroke="#333"
              strokeWidth={1 / viewport.scale}
            />
          );
        })}
        
        {/* Walls */}
        {showWalls && spaceConfig.walls.map((wall) => {
          const xPx = mmToPixels(wall.position.x);
          const zPx = mmToPixels(wall.position.z);
          const widthPx = mmToPixels(wall.dimensions.width);
          const depthPx = mmToPixels(wall.dimensions.depth);
          
          return (
            <Rect
              key={wall.id}
              x={xPx}
              y={zPx}
              width={widthPx}
              height={depthPx}
              fill="#999"
              stroke="#333"
              strokeWidth={1 / viewport.scale}
              opacity={0.7}
            />
          );
        })}
      </Group>
    );
  };

  // Render furniture items
  const renderFurniture = () => {
    if (!localShowFurniture) return null;
    
    return (
      <Group>
        {furniture.placedModules.map((item) => (
          <FurnitureItem2D
            key={item.id}
            item={item}
            scale={viewport.scale}
            isSelected={selectedFurnitureId === item.id}
            isDragging={draggedFurnitureId === item.id}
            onSelect={handleFurnitureSelect}
            onDragStart={handleFurnitureDragStart}
            onDragEnd={handleFurnitureDragEnd}
            onRotate={handleFurnitureRotate}
            onDelete={handleFurnitureDelete}
            onDoubleClick={(id) => {
              // Open edit modal
              uiStore.setActivePopup({ type: 'furnitureEdit', id });
            }}
            mmToPixels={mmToPixels}
          />
        ))}
      </Group>
    );
  };

  // Render dimensions
  const renderDimensions = () => {
    if (!localShowDimensions) return null;
    
    const widthPx = mmToPixels(spaceConfig.width);
    const depthPx = mmToPixels(spaceConfig.depth);
    const fontSize = 14 / viewport.scale;
    const offset = 30 / viewport.scale;
    
    return (
      <Group>
        {/* Width dimension */}
        <Line
          points={[0, -offset, widthPx, -offset]}
          stroke="#666"
          strokeWidth={1 / viewport.scale}
        />
        <Line
          points={[0, -offset - 5 / viewport.scale, 0, -offset + 5 / viewport.scale]}
          stroke="#666"
          strokeWidth={1 / viewport.scale}
        />
        <Line
          points={[widthPx, -offset - 5 / viewport.scale, widthPx, -offset + 5 / viewport.scale]}
          stroke="#666"
          strokeWidth={1 / viewport.scale}
        />
        <Text
          x={widthPx / 2}
          y={-offset - fontSize}
          text={`${spaceConfig.width}mm`}
          fontSize={fontSize}
          fill="#666"
          align="center"
        />
        
        {/* Depth dimension */}
        <Line
          points={[-offset, 0, -offset, depthPx]}
          stroke="#666"
          strokeWidth={1 / viewport.scale}
        />
        <Line
          points={[-offset - 5 / viewport.scale, 0, -offset + 5 / viewport.scale, 0]}
          stroke="#666"
          strokeWidth={1 / viewport.scale}
        />
        <Line
          points={[-offset - 5 / viewport.scale, depthPx, -offset + 5 / viewport.scale, depthPx]}
          stroke="#666"
          strokeWidth={1 / viewport.scale}
        />
        <Text
          x={-offset - fontSize * 3}
          y={depthPx / 2}
          text={`${spaceConfig.depth}mm`}
          fontSize={fontSize}
          fill="#666"
          rotation={-90}
          align="center"
        />
      </Group>
    );
  };

  // Generate unique key for Stage to prevent duplicates
  const stageKey = useMemo(() => {
    return `konva-stage-${Date.now()}`;
  }, []);

  return (
    <div ref={containerRef} className={styles.container} id={STAGE_CONTAINER_ID}>
      {/* Toolbar */}
      <ViewerToolbar2D
        showGrid={localShowGrid}
        showDimensions={localShowDimensions}
        showFurniture={localShowFurniture}
        showColumns={showColumns}
        showWalls={showWalls}
        tool={tool}
        scale={viewport.scale}
        onToggleGrid={() => setLocalShowGrid(!localShowGrid)}
        onToggleDimensions={() => setLocalShowDimensions(!localShowDimensions)}
        onToggleFurniture={() => setLocalShowFurniture(!localShowFurniture)}
        onToggleColumns={() => setShowColumns(!showColumns)}
        onToggleWalls={() => setShowWalls(!showWalls)}
        onToolChange={setTool}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
      />
      
      <Stage
        key={stageKey}
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onWheel={handleWheel}
        draggable={!isDragging}
        onDragEnd={handleDragEnd}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
      >
        <Layer ref={layerRef}>
          {/* Grid layer */}
          {localShowGrid && (
            <Grid2D
              width={mmToPixels(spaceConfig.width)}
              height={mmToPixels(spaceConfig.depth)}
              gridSize={mmToPixels(GRID_SIZE)}
              scale={viewport.scale}
              showLabels={viewport.scale > 0.5}
              color="#e0e0e0"
              opacity={0.5}
            />
          )}
          
          {/* Space and structure */}
          {renderSpace()}
          
          {/* Dimensions */}
          {renderDimensions()}
          
          {/* Furniture */}
          {renderFurniture()}
        </Layer>
      </Stage>
      
    </div>
  );
};

export default Space2DKonvaView;