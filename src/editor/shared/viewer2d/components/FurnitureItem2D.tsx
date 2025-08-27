import React, { useState, useRef, useEffect } from 'react';
import { Group, Rect, Text, Image, Circle, Line } from 'react-konva';
import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { PlacedModule } from '@/store/core/furnitureStore';
import { getModuleById } from '@/data/modules';

interface FurnitureItem2DProps {
  item: PlacedModule;
  scale: number;
  isSelected: boolean;
  isDragging: boolean;
  onSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, x: number, z: number) => void;
  onRotate: (id: string, rotation: number) => void;
  onDelete?: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  mmToPixels: (mm: number) => number;
}

const FurnitureItem2D: React.FC<FurnitureItem2DProps> = ({
  item,
  scale,
  isSelected,
  isDragging,
  onSelect,
  onDragStart,
  onDragEnd,
  onRotate,
  onDelete,
  onDoubleClick,
  mmToPixels,
}) => {
  const groupRef = useRef<Konva.Group>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [rotation, setRotation] = useState(item.rotation || 0);

  // Get module data
  const moduleData = getModuleById(item.moduleId);
  
  // Convert dimensions to pixels
  const xPx = mmToPixels(item.position.x);
  const zPx = mmToPixels(item.position.z);
  const widthPx = mmToPixels(item.dimensions.width);
  const depthPx = mmToPixels(item.dimensions.depth);

  // Handle rotation with transform
  const handleTransformEnd = (e: KonvaEventObject<Event>) => {
    const node = e.target as Konva.Group;
    const newRotation = node.rotation();
    setRotation(newRotation);
    onRotate(item.id, newRotation);
  };

  // Get fill color based on module type
  const getFillColor = () => {
    if (isDragging) return '#4CAF50';
    if (isSelected) return '#1976D2';
    if (isHovered) return '#42A5F5';
    
    // Color by module type
    const moduleType = moduleData?.type;
    switch (moduleType) {
      case 'cabinet':
        return '#2196F3';
      case 'drawer':
        return '#FF9800';
      case 'shelf':
        return '#9C27B0';
      case 'door':
        return '#00BCD4';
      default:
        return '#607D8B';
    }
  };

  // Handle double click for edit
  const handleDoubleClick = () => {
    if (onDoubleClick) {
      onDoubleClick(item.id);
    }
  };

  // Render module specific icons or details
  const renderModuleDetails = () => {
    const details: JSX.Element[] = [];
    
    // Add door handles for cabinets
    if (moduleData?.type === 'cabinet' && item.hasDoors) {
      const handleSize = 4 / scale;
      const handleOffset = 10 / scale;
      
      details.push(
        <Circle
          key="handle-left"
          x={handleOffset}
          y={depthPx / 2}
          radius={handleSize}
          fill="#666"
          stroke="#333"
          strokeWidth={1 / scale}
        />
      );
      
      if (item.dimensions.width > 600) { // Double door
        details.push(
          <Circle
            key="handle-right"
            x={widthPx - handleOffset}
            y={depthPx / 2}
            radius={handleSize}
            fill="#666"
            stroke="#333"
            strokeWidth={1 / scale}
          />
        );
      }
    }
    
    // Add drawer lines
    if (moduleData?.type === 'drawer') {
      const drawerCount = Math.floor(item.dimensions.height / 200); // Assume 200mm per drawer
      for (let i = 1; i < drawerCount; i++) {
        const y = (depthPx / drawerCount) * i;
        details.push(
          <Line
            key={`drawer-line-${i}`}
            points={[5 / scale, y, widthPx - 5 / scale, y]}
            stroke="#999"
            strokeWidth={1 / scale}
          />
        );
      }
    }
    
    return <>{details}</>;
  };

  // Render selection handles
  const renderSelectionHandles = () => {
    if (!isSelected) return null;
    
    const handleSize = 6 / scale;
    const strokeWidth = 2 / scale;
    
    return (
      <>
        {/* Selection border */}
        <Rect
          x={-strokeWidth}
          y={-strokeWidth}
          width={widthPx + strokeWidth * 2}
          height={depthPx + strokeWidth * 2}
          stroke="#1976D2"
          strokeWidth={strokeWidth}
          fill="transparent"
          dash={[5 / scale, 5 / scale]}
        />
        
        {/* Rotation handle */}
        <Circle
          x={widthPx / 2}
          y={-20 / scale}
          radius={handleSize}
          fill="#1976D2"
          stroke="white"
          strokeWidth={strokeWidth}
          draggable
          onDragMove={(e) => {
            const node = e.target;
            const group = groupRef.current;
            if (!group) return;
            
            const centerX = group.x() + widthPx / 2;
            const centerY = group.y() + depthPx / 2;
            const angle = Math.atan2(
              node.y() + group.y() - centerY,
              node.x() + group.x() - centerX
            ) * 180 / Math.PI + 90;
            
            group.rotation(angle);
          }}
          onDragEnd={handleTransformEnd}
        />
        
        {/* Resize handles at corners */}
        {[
          { x: 0, y: 0 },
          { x: widthPx, y: 0 },
          { x: widthPx, y: depthPx },
          { x: 0, y: depthPx },
        ].map((pos, index) => (
          <Rect
            key={`handle-${index}`}
            x={pos.x - handleSize / 2}
            y={pos.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="white"
            stroke="#1976D2"
            strokeWidth={strokeWidth}
          />
        ))}
      </>
    );
  };

  return (
    <Group
      ref={groupRef}
      x={xPx}
      y={zPx}
      rotation={rotation}
      draggable
      onDragStart={() => onDragStart(item.id)}
      onDragEnd={(e) => {
        const node = e.target;
        const newX = node.x() / 0.1; // Convert back to mm
        const newZ = node.y() / 0.1;
        onDragEnd(item.id, newX, newZ);
      }}
      onClick={() => onSelect(item.id)}
      onDblClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTransformEnd={handleTransformEnd}
    >
      {/* Shadow */}
      <Rect
        x={2 / scale}
        y={2 / scale}
        width={widthPx}
        height={depthPx}
        fill="black"
        opacity={0.2}
        cornerRadius={4 / scale}
      />
      
      {/* Main furniture body */}
      <Rect
        width={widthPx}
        height={depthPx}
        fill={getFillColor()}
        stroke={isSelected ? '#0D47A1' : '#1565C0'}
        strokeWidth={(isSelected ? 2 : 1) / scale}
        cornerRadius={4 / scale}
        opacity={isDragging ? 0.7 : 0.9}
      />
      
      {/* Module specific details */}
      {renderModuleDetails()}
      
      {/* Label */}
      <Text
        text={item.name || moduleData?.name || 'Furniture'}
        fontSize={Math.max(10, 12 / scale)}
        fill="white"
        width={widthPx}
        height={depthPx}
        align="center"
        verticalAlign="middle"
        fontStyle="bold"
        shadowColor="black"
        shadowBlur={2 / scale}
        shadowOpacity={0.5}
      />
      
      {/* Dimensions label (shown when selected) */}
      {isSelected && (
        <Text
          y={depthPx + 5 / scale}
          text={`${Math.round(item.dimensions.width)} x ${Math.round(item.dimensions.depth)}mm`}
          fontSize={10 / scale}
          fill="#666"
          width={widthPx}
          align="center"
        />
      )}
      
      {/* Selection handles and controls */}
      {renderSelectionHandles()}
    </Group>
  );
};

export default FurnitureItem2D;