import React, { useMemo } from 'react';
import { Group, Line, Text } from 'react-konva';

interface Grid2DProps {
  width: number;  // Space width in pixels
  height: number; // Space height in pixels
  gridSize: number; // Grid size in pixels
  scale: number;
  showLabels?: boolean;
  labelInterval?: number; // Show labels every N grid lines
  color?: string;
  opacity?: number;
}

const Grid2D: React.FC<Grid2DProps> = ({
  width,
  height,
  gridSize,
  scale,
  showLabels = false,
  labelInterval = 5,
  color = '#e0e0e0',
  opacity = 0.5,
}) => {
  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines: JSX.Element[] = [];
    const labels: JSX.Element[] = [];
    
    // Calculate extended boundaries for infinite feel
    const extendFactor = 2;
    const extendedWidth = width * extendFactor;
    const extendedHeight = height * extendFactor;
    const offsetX = -width * (extendFactor - 1) / 2;
    const offsetY = -height * (extendFactor - 1) / 2;
    
    // Major and minor grid lines
    const majorGridSize = gridSize * 5;
    const strokeWidth = 1 / scale;
    const majorStrokeWidth = 2 / scale;
    
    // Vertical lines
    for (let x = offsetX; x <= extendedWidth + offsetX; x += gridSize) {
      const isMajor = Math.abs(x % majorGridSize) < 0.01;
      const lineOpacity = isMajor ? opacity : opacity * 0.5;
      
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, offsetY, x, extendedHeight + offsetY]}
          stroke={color}
          strokeWidth={isMajor ? majorStrokeWidth : strokeWidth}
          opacity={lineOpacity}
        />
      );
      
      // Add labels for major lines
      if (showLabels && isMajor && x >= 0 && x <= width) {
        const mmValue = Math.round(x / 0.1); // Convert to mm
        labels.push(
          <Text
            key={`label-x-${x}`}
            x={x}
            y={-20 / scale}
            text={`${mmValue}`}
            fontSize={10 / scale}
            fill="#666"
            align="center"
          />
        );
      }
    }
    
    // Horizontal lines
    for (let y = offsetY; y <= extendedHeight + offsetY; y += gridSize) {
      const isMajor = Math.abs(y % majorGridSize) < 0.01;
      const lineOpacity = isMajor ? opacity : opacity * 0.5;
      
      lines.push(
        <Line
          key={`h-${y}`}
          points={[offsetX, y, extendedWidth + offsetX, y]}
          stroke={color}
          strokeWidth={isMajor ? majorStrokeWidth : strokeWidth}
          opacity={lineOpacity}
        />
      );
      
      // Add labels for major lines
      if (showLabels && isMajor && y >= 0 && y <= height) {
        const mmValue = Math.round(y / 0.1); // Convert to mm
        labels.push(
          <Text
            key={`label-y-${y}`}
            x={-30 / scale}
            y={y}
            text={`${mmValue}`}
            fontSize={10 / scale}
            fill="#666"
            align="center"
            verticalAlign="middle"
          />
        );
      }
    }
    
    // Add origin marker
    if (showLabels) {
      lines.push(
        <Line
          key="origin-x"
          points={[-10 / scale, 0, 10 / scale, 0]}
          stroke="#ff0000"
          strokeWidth={2 / scale}
          opacity={0.7}
        />,
        <Line
          key="origin-y"
          points={[0, -10 / scale, 0, 10 / scale]}
          stroke="#00ff00"
          strokeWidth={2 / scale}
          opacity={0.7}
        />
      );
    }
    
    return { lines, labels };
  }, [width, height, gridSize, scale, showLabels, color, opacity]);

  return (
    <Group>
      <Group opacity={0.5}>
        {gridLines.lines}
      </Group>
      {showLabels && (
        <Group>
          {gridLines.labels}
        </Group>
      )}
    </Group>
  );
};

export default Grid2D;