import React, { useState } from 'react';
import { Line } from '@react-three/drei';
import DimensionText from './DimensionText';

interface MaidaHeightDimensionSegment {
  bottomY: number;
  topY: number;
  valueMm: number;
  key: string;
}

interface MaidaHeightDimensionProps {
  segments: MaidaHeightDimensionSegment[];
  maidaWidth: number;
  moduleDepthMm: number;
  maidaZ: number;
  viewMode: '3D' | '2D';
  view2DDirection: 'front' | 'left' | 'right' | 'top' | 'back';
  dimensionColor: string;
  mmToThreeUnits: (mm: number) => number;
  side?: 'left' | 'right';
}

const MaidaHeightDimension: React.FC<MaidaHeightDimensionProps> = ({
  segments,
  maidaWidth,
  moduleDepthMm,
  maidaZ,
  viewMode,
  view2DDirection,
  dimensionColor,
  mmToThreeUnits,
  side = 'right',
}) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (!(viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'front'))) {
    return null;
  }

  const visibleSegments = segments.filter(segment => segment.valueMm > 0 && segment.topY > segment.bottomY);
  if (visibleSegments.length === 0) return null;

  const direction = side === 'left' ? -1 : 1;
  const tickSize = 0.008;
  const zPos = viewMode === '3D' ? mmToThreeUnits(moduleDepthMm / 2 + 14 + 1) : maidaZ + mmToThreeUnits(10);
  const edgeX = direction * maidaWidth / 2;
  const lineX = edgeX + direction * mmToThreeUnits(160);
  const textX = lineX + direction * mmToThreeUnits(60);
  const hoverColor = '#0b3d91';

  return (
    <>
      {visibleSegments.map(segment => {
        const segmentColor = hoveredKey === segment.key ? hoverColor : dimensionColor;
        return (
        <React.Fragment key={segment.key}>
          <Line
            name="maida-height-dimension"
            points={[[lineX, segment.bottomY, zPos], [lineX, segment.topY, zPos]]}
            color={segmentColor}
            lineWidth={1}
          />
          <Line
            name="maida-height-dimension"
            points={[[lineX - tickSize, segment.bottomY, zPos], [lineX + tickSize, segment.bottomY, zPos]]}
            color={segmentColor}
            lineWidth={1}
          />
          <Line
            name="maida-height-dimension"
            points={[[lineX - tickSize, segment.topY, zPos], [lineX + tickSize, segment.topY, zPos]]}
            color={segmentColor}
            lineWidth={1}
          />
          <Line
            name="maida-height-extension"
            points={[[edgeX, segment.bottomY, zPos], [lineX, segment.bottomY, zPos]]}
            color={segmentColor}
            lineWidth={1}
          />
          <Line
            name="maida-height-extension"
            points={[[edgeX, segment.topY, zPos], [lineX, segment.topY, zPos]]}
            color={segmentColor}
            lineWidth={1}
          />
          <DimensionText
            name="maida-height-dimension-text"
            value={segment.valueMm}
            position={[textX, (segment.bottomY + segment.topY) / 2, zPos]}
            color={segmentColor}
            hoverColor={hoverColor}
            onHoverChange={hovered => setHoveredKey(hovered ? segment.key : null)}
            anchorX="center"
            anchorY="middle"
            forceShow={true}
          />
        </React.Fragment>
      );
      })}
    </>
  );
};

export type { MaidaHeightDimensionSegment };
export default MaidaHeightDimension;
