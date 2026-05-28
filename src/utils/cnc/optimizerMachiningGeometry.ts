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
