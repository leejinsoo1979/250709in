import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Group, Line, Text, Circle } from 'react-konva';
import Konva from 'konva';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
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

  // Convert mm to canvas pixels
  const mmToPixels = useCallback((mm: number): number => {
    return mm * 0.1; // 1mm = 0.1px at scale 1
  }, []);

  // Update stage size when container resizes
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setStageSize({
          width: rect.width,
          height: rect.height,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Center the space in view on mount
  useEffect(() => {
    if (spaceConfig.width && spaceConfig.depth) {
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

  // Render grid
  const renderGrid = () => {
    if (!showGrid) return null;

    const gridLines: JSX.Element[] = [];
    const gridSizePx = mmToPixels(GRID_SIZE);
    
    // Calculate visible area
    const startX = -viewport.x / viewport.scale;
    const startY = -viewport.y / viewport.scale;
    const endX = (stageSize.width - viewport.x) / viewport.scale;
    const endY = (stageSize.height - viewport.y) / viewport.scale;
    
    // Vertical lines
    for (let x = Math.floor(startX / gridSizePx) * gridSizePx; x < endX; x += gridSizePx) {
      gridLines.push(
        <Line
          key={`v-${x}`}
          points={[x, startY, x, endY]}
          stroke="#e0e0e0"
          strokeWidth={1 / viewport.scale}
        />
      );
    }
    
    // Horizontal lines
    for (let y = Math.floor(startY / gridSizePx) * gridSizePx; y < endY; y += gridSizePx) {
      gridLines.push(
        <Line
          key={`h-${y}`}
          points={[startX, y, endX, y]}
          stroke="#e0e0e0"
          strokeWidth={1 / viewport.scale}
        />
      );
    }
    
    return <Group>{gridLines}</Group>;
  };

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
        {spaceConfig.columns.map((column) => {
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
        {spaceConfig.walls.map((wall) => {
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
    if (!showFurniture) return null;
    
    return (
      <Group>
        {furniture.placedModules.map((item) => {
          const xPx = mmToPixels(item.position.x);
          const zPx = mmToPixels(item.position.z);
          const widthPx = mmToPixels(item.dimensions.width);
          const depthPx = mmToPixels(item.dimensions.depth);
          
          return (
            <Group
              key={item.id}
              x={xPx}
              y={zPx}
              draggable
              onDragStart={() => {
                setIsDragging(true);
                setDraggedFurnitureId(item.id);
              }}
              onDragEnd={(e) => {
                setIsDragging(false);
                setDraggedFurnitureId(null);
                
                // Update furniture position
                const node = e.target;
                const newX = node.x() / 0.1; // Convert back to mm
                const newZ = node.y() / 0.1;
                
                furniture.updateModule(item.id, {
                  position: { x: newX, y: item.position.y, z: newZ }
                });
              }}
            >
              <Rect
                width={widthPx}
                height={depthPx}
                fill={item.id === draggedFurnitureId ? '#4CAF50' : '#2196F3'}
                stroke="#1976D2"
                strokeWidth={2 / viewport.scale}
                cornerRadius={4 / viewport.scale}
                opacity={0.8}
              />
              <Text
                text={item.name || 'Furniture'}
                fontSize={12 / viewport.scale}
                fill="white"
                width={widthPx}
                height={depthPx}
                align="center"
                verticalAlign="middle"
              />
            </Group>
          );
        })}
      </Group>
    );
  };

  // Render dimensions
  const renderDimensions = () => {
    if (!showDimensions) return null;
    
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

  return (
    <div ref={containerRef} className={styles.container}>
      <Stage
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
          {renderGrid()}
          {renderSpace()}
          {renderDimensions()}
          {renderFurniture()}
        </Layer>
      </Stage>
      
      {/* Zoom controls */}
      <div className={styles.controls}>
        <button
          className={styles.zoomButton}
          onClick={() => setViewport(prev => ({ 
            ...prev, 
            scale: Math.min(MAX_SCALE, prev.scale * SCALE_FACTOR) 
          }))}
        >
          +
        </button>
        <span className={styles.zoomLevel}>{Math.round(viewport.scale * 100)}%</span>
        <button
          className={styles.zoomButton}
          onClick={() => setViewport(prev => ({ 
            ...prev, 
            scale: Math.max(MIN_SCALE, prev.scale / SCALE_FACTOR) 
          }))}
        >
          -
        </button>
        <button
          className={styles.resetButton}
          onClick={() => {
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
          }}
        >
          Reset View
        </button>
      </div>
    </div>
  );
};

export default Space2DKonvaView;