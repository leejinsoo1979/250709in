interface MachiningPanel {
  name?: string;
  width: number;
  height: number;
  rotated?: boolean;
}

export interface MachiningPoint {
  x: number;
  y: number;
}

export interface DoorMachiningPoints {
  cupPoints: MachiningPoint[];
  screwPoints: MachiningPoint[];
}

export const roundOptimizerCoord = (value: number): number => Math.round(value * 10) / 10;

export const isDrawerSidePanelName = (name?: string): boolean => {
  const panelName = name || '';
  return panelName.includes('서랍') &&
    (panelName.includes('좌측판') ||
      panelName.includes('우측판') ||
      panelName.includes('좌측') ||
      panelName.includes('우측') ||
      panelName.includes('측판'));
};

export const isFurnitureSidePanelName = (name?: string): boolean => {
  const panelName = name || '';
  if (!panelName) return false;
  if (panelName.includes('서랍') || panelName.includes('도어') || panelName.includes('Door')) return false;
  if (panelName.includes('서라운드') || panelName.includes('커튼박스')) return false;
  return panelName.includes('좌측판') ||
    panelName.includes('우측판') ||
    panelName.includes('좌측') ||
    panelName.includes('우측') ||
    panelName.includes('측판');
};

export const isFurnitureRightSidePanel = (panel: MachiningPanel): boolean => {
  const name = panel.name || '';
  return !name.includes('서랍') && (name.includes('우측판') || name.includes('우측'));
};

export const isFurnitureLeftSidePanel = (panel: MachiningPanel): boolean => {
  const name = panel.name || '';
  return !name.includes('서랍') && (name.includes('좌측판') || name.includes('좌측'));
};

export const resolveFurnitureSideDepthPosition = (panel: MachiningPanel, depthPosMm: number): number => {
  return isFurnitureRightSidePanel(panel)
    ? panel.width - depthPosMm
    : depthPosMm;
};

export function resolveOptimizerBoringPoint(
  panel: MachiningPanel,
  args: {
    boringPosMm: number;
    depthPosMm: number;
    isDrawerSidePanel: boolean;
    isDrawerFrontPanel: boolean;
  }
): MachiningPoint {
  const { boringPosMm, depthPosMm, isDrawerSidePanel, isDrawerFrontPanel } = args;

  if (isDrawerSidePanel || isDrawerFrontPanel) {
    if (panel.rotated) {
      return {
        x: roundOptimizerCoord(depthPosMm),
        y: roundOptimizerCoord(boringPosMm),
      };
    }

    return {
      x: roundOptimizerCoord(boringPosMm),
      y: roundOptimizerCoord(depthPosMm),
    };
  }

  if (isFurnitureSidePanelName(panel.name)) {
    const flippedBoringY = panel.height - boringPosMm;
    const resolvedDepthPosMm = resolveFurnitureSideDepthPosition(panel, depthPosMm);

    if (panel.rotated) {
      const scaleX = panel.height / panel.width;
      const scaleY = panel.width / panel.height;
      return {
        x: roundOptimizerCoord(resolvedDepthPosMm * scaleX),
        y: roundOptimizerCoord(flippedBoringY * scaleY),
      };
    }

    return {
      x: roundOptimizerCoord(resolvedDepthPosMm),
      y: roundOptimizerCoord(flippedBoringY),
    };
  }

  return {
    x: roundOptimizerCoord(depthPosMm),
    y: roundOptimizerCoord(boringPosMm),
  };
}

export function resolveOptimizerBracketPoint(
  panel: MachiningPanel,
  xPosMm: number,
  yPosMm: number
): MachiningPoint {
  const flippedY = panel.height - yPosMm;

  if (panel.rotated) {
    const scaleX = panel.height / panel.width;
    const scaleY = panel.width / panel.height;
    return {
      x: roundOptimizerCoord(xPosMm * scaleX),
      y: roundOptimizerCoord(flippedY * scaleY),
    };
  }

  return {
    x: roundOptimizerCoord(xPosMm),
    y: roundOptimizerCoord(flippedY),
  };
}

export function resolveOptimizerDoorBoringPoints(
  panel: MachiningPanel & {
    boringPositions?: number[];
    boringDepthPositions?: number[];
    screwPositions?: number[];
    screwDepthPositions?: number[];
    screwHoleSpacing?: number;
    isLeftHinge?: boolean;
  }
): DoorMachiningPoints {
  const originalWidth = panel.width;
  const originalHeight = panel.height;
  const placedWidth = panel.rotated ? originalHeight : originalWidth;
  const placedHeight = panel.rotated ? originalWidth : originalHeight;
  const screwRowDistance = 9.5;
  const screwYOffset = (panel.screwHoleSpacing || 45) / 2;

  const cupYPositions = panel.boringPositions?.length
    ? panel.boringPositions
    : (() => {
      const screwPositions = [...(panel.screwPositions || [])].sort((a, b) => a - b);
      const centers: number[] = [];

      for (let i = 0; i + 1 < screwPositions.length; i += 2) {
        centers.push(roundOptimizerCoord((screwPositions[i] + screwPositions[i + 1]) / 2));
      }

      return Array.from(new Set(centers));
    })();

  const cupXPositions = panel.boringDepthPositions?.length
    ? panel.boringDepthPositions
    : (() => {
      const screwX = panel.screwDepthPositions?.[0];

      if (typeof screwX === 'number') {
        const restoredCupX = screwX < originalWidth / 2
          ? screwX - screwRowDistance
          : screwX + screwRowDistance;
        const fallbackCupX = screwX < originalWidth / 2
          ? screwX + screwRowDistance
          : screwX - screwRowDistance;
        const cupX = restoredCupX >= 0 && restoredCupX <= originalWidth
          ? restoredCupX
          : fallbackCupX;

        return [roundOptimizerCoord(Math.max(0, Math.min(originalWidth, cupX)))];
      }

      return [panel.isLeftHinge ? originalWidth - 22.5 : 22.5];
    })();

  let screwYPositions = panel.screwPositions || [];
  let screwXPositions = panel.screwDepthPositions || [];

  if (screwYPositions.length === 0 && cupYPositions.length > 0) {
    screwYPositions = cupYPositions.flatMap(cupY => [cupY - screwYOffset, cupY + screwYOffset]);
  }

  if (screwXPositions.length === 0 && cupXPositions.length > 0) {
    const cupX = cupXPositions[0];
    const isLeftHinge = cupX < originalWidth / 2;
    screwXPositions = [isLeftHinge ? cupX + screwRowDistance : cupX - screwRowDistance];
  }

  const toPoint = (posMmX: number, posMmY: number): MachiningPoint => {
    const yFromSheetTopMm = originalHeight - posMmY;

    if (panel.rotated) {
      const scaleX = placedWidth / originalWidth;
      const scaleY = placedHeight / originalHeight;
      return {
        x: roundOptimizerCoord(posMmX * scaleX),
        y: roundOptimizerCoord(yFromSheetTopMm * scaleY),
      };
    }

    return {
      x: roundOptimizerCoord(posMmX),
      y: roundOptimizerCoord(yFromSheetTopMm),
    };
  };

  return {
    cupPoints: cupXPositions.flatMap(cupX => cupYPositions.map(cupY => toPoint(cupX, cupY))),
    screwPoints: screwXPositions.flatMap(screwX => screwYPositions.map(screwY => toPoint(screwX, screwY))),
  };
}
