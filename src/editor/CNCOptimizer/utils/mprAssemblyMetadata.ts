import type { PanelBoringData, Boring } from '@/domain/boring/types';
import { getModuleById } from '@/data/modules';
import type { PlacedModule } from '@/editor/shared/furniture/types';
import type { PlacedPanel } from '../types';

type Vec3 = [number, number, number];

interface MprFileEntry {
  filename: string;
}

interface BuildMprAssemblyMetadataParams {
  projectName: string;
  panels: PlacedPanel[];
  mprPanels: PanelBoringData[];
  files: MprFileEntry[];
  placedModules: PlacedModule[];
  spaceInfo: any;
}

interface ModuleGeometry {
  id: string;
  moduleName: string;
  width: number;
  depth: number;
  height: number;
  leftX: number;
  frontY: number;
  bottomZ: number;
  rotationDeg: number;
}

const BACK_PANEL_GROOVE_REAR_OFFSET_MM = 17;
const BACK_PANEL_GROOVE_WIDTH_MM = 3;
const BACK_PANEL_GROOVE_CUT_DEPTH_MM = 7.5;
const CONTOUR_CUT_DEPTH_MM = -2;

function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}

function toMm(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return roundMm((value || 0) * 100);
}

function vec(scale: number, axis: Vec3): Vec3 {
  return [axis[0] * scale, axis[1] * scale, axis[2] * scale].map(value => Object.is(value, -0) ? 0 : value) as Vec3;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function roleFromPanel(panel: PanelBoringData, source?: PlacedPanel): string {
  const name = panel.panelName || source?.name || '';
  if (name.includes('걸레받이')) return 'toe_kick';
  if (name.includes('몰딩')) return 'molding';
  if (name.includes('레일')) return 'rail';
  if (name.includes('찬넬')) return 'rail';
  if (panel.panelType === 'side-left') return 'left_side';
  if (panel.panelType === 'side-right') return 'right_side';
  if (panel.panelType === 'top') return 'top';
  if (panel.panelType === 'bottom') return 'bottom';
  if (panel.panelType === 'shelf') return 'shelf';
  if (panel.panelType === 'back-panel') return 'back_panel';
  if (panel.panelType === 'door' || name.includes('도어') || name.includes('Door')) return 'door';
  if (panel.panelType === 'drawer-front') return 'door';
  if (panel.panelType === 'drawer-side-left') return 'left_side';
  if (panel.panelType === 'drawer-side-right') return 'right_side';
  return 'common';
}

function moduleNameFromId(moduleId = '', panelName = ''): string {
  if (panelName.includes('(상)') || moduleId.startsWith('upper-') || moduleId.includes('-upper-')) return 'upper';
  if (panelName.includes('(하)') || moduleId.startsWith('lower-') || moduleId.includes('-lower-')) return 'lower';
  if (moduleId.startsWith('full-') || moduleId.includes('tall') || moduleId.includes('wardrobe')) return 'full';
  return 'common';
}

function getModuleDimensions(module: PlacedModule, spaceInfo: any): { width: number; depth: number; height: number } {
  const explicitWidth = module.freeWidth || module.customWidth || module.adjustedWidth || module.moduleWidth;
  const explicitDepth = module.freeDepth || module.customDepth;
  const explicitHeight = module.freeHeight || module.customHeight;
  if (explicitWidth && explicitDepth && explicitHeight) {
    return {
      width: roundMm(explicitWidth),
      depth: roundMm(explicitDepth),
      height: roundMm(explicitHeight),
    };
  }

  const moduleData = getModuleById(
    module.moduleId,
    {
      width: spaceInfo?.width || 0,
      height: spaceInfo?.height || 0,
      depth: spaceInfo?.depth || 0,
    },
    spaceInfo
  );

  return {
    width: roundMm(
      explicitWidth
      || moduleData?.dimensions?.width
      || 0
    ),
    depth: roundMm(explicitDepth || moduleData?.dimensions?.depth || 0),
    height: roundMm(explicitHeight || moduleData?.dimensions?.height || 0),
  };
}

function buildModuleGeometries(placedModules: PlacedModule[], spaceInfo: any): Map<string, ModuleGeometry> {
  const raw = placedModules.map((module) => {
    const dimensions = getModuleDimensions(module, spaceInfo);
    const centerX = toMm(module.position?.x);
    const centerY = toMm(module.position?.y);
    const centerZ = toMm(module.position?.z);
    return {
      module,
      dimensions,
      leftSceneX: centerX - dimensions.width / 2,
      bottomSceneZ: centerY - dimensions.height / 2,
      frontSceneY: centerZ + dimensions.depth / 2,
    };
  });

  const minLeft = raw.length ? Math.min(...raw.map(item => item.leftSceneX)) : 0;
  const minBottom = raw.length ? Math.min(...raw.map(item => item.bottomSceneZ)) : 0;
  const maxFront = raw.length ? Math.max(...raw.map(item => item.frontSceneY)) : 0;

  return new Map(raw.map(({ module, dimensions, leftSceneX, bottomSceneZ, frontSceneY }) => [
    module.id,
    {
      id: module.id,
      moduleName: moduleNameFromId(module.moduleId),
      width: dimensions.width,
      depth: dimensions.depth,
      height: dimensions.height,
      leftX: roundMm(leftSceneX - minLeft),
      frontY: roundMm(maxFront - frontSceneY),
      bottomZ: roundMm(bottomSceneZ - minBottom),
      rotationDeg: module.rotation || 0,
    },
  ]));
}

function getPanelAxes(role: string): { xAxis: Vec3; yAxis: Vec3; zAxis: Vec3 } {
  switch (role) {
    case 'left_side':
      return { xAxis: [0, 1, 0], yAxis: [0, 0, 1], zAxis: [1, 0, 0] };
    case 'right_side':
      return { xAxis: [0, 1, 0], yAxis: [0, 0, 1], zAxis: [-1, 0, 0] };
    case 'back_panel':
      return { xAxis: [1, 0, 0], yAxis: [0, 0, 1], zAxis: [0, -1, 0] };
    case 'door':
      return { xAxis: [1, 0, 0], yAxis: [0, 0, 1], zAxis: [0, 1, 0] };
    default:
      return { xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1] };
  }
}

function getPanelDirections(role: string): { frontDirection: Vec3; innerFaceDirection: Vec3 | null } {
  switch (role) {
    case 'left_side':
      return { frontDirection: [0, -1, 0], innerFaceDirection: [1, 0, 0] };
    case 'right_side':
      return { frontDirection: [0, -1, 0], innerFaceDirection: [-1, 0, 0] };
    case 'top':
      return { frontDirection: [0, -1, 0], innerFaceDirection: [0, 0, -1] };
    case 'bottom':
    case 'shelf':
      return { frontDirection: [0, -1, 0], innerFaceDirection: [0, 0, 1] };
    case 'back_panel':
      return { frontDirection: [0, -1, 0], innerFaceDirection: [0, -1, 0] };
    case 'door':
      return { frontDirection: [0, -1, 0], innerFaceDirection: [0, 1, 0] };
    default:
      return { frontDirection: [0, -1, 0], innerFaceDirection: null };
  }
}

function resolvePanelPosition(panel: PanelBoringData, role: string, moduleGeometry?: ModuleGeometry): Vec3 {
  const t = panel.thickness;
  const module = moduleGeometry || {
    width: panel.width,
    depth: panel.height,
    height: panel.height,
    leftX: 0,
    frontY: 0,
    bottomZ: 0,
  };

  switch (role) {
    case 'left_side':
      return [module.leftX, module.frontY, module.bottomZ];
    case 'right_side':
      return [roundMm(module.leftX + module.width - t), module.frontY, module.bottomZ];
    case 'top':
      return [module.leftX, module.frontY, roundMm(module.bottomZ + module.height - t)];
    case 'bottom':
      return [module.leftX, module.frontY, module.bottomZ];
    case 'shelf':
      return [roundMm(module.leftX + t), module.frontY, roundMm(module.bottomZ + module.height / 2 - t / 2)];
    case 'back_panel':
      return [roundMm(module.leftX + t), roundMm(module.frontY + module.depth - t), roundMm(module.bottomZ + t)];
    case 'door':
      return [module.leftX, roundMm(module.frontY - t), module.bottomZ];
    case 'toe_kick':
      return [module.leftX, module.frontY, module.bottomZ];
    case 'molding':
      return [module.leftX, module.frontY, roundMm(module.bottomZ + module.height - t)];
    default:
      return [module.leftX, module.frontY, module.bottomZ];
  }
}

function resolveEdgeBanding(role: string): Record<string, { applied: boolean; thickness: number }> {
  const edgeThickness = 1;
  const visibleFront = ['top', 'bottom', 'shelf', 'left_side', 'right_side', 'door'].includes(role);
  return {
    front: { applied: visibleFront, thickness: visibleFront ? edgeThickness : 0 },
    back: { applied: false, thickness: 0 },
    left: { applied: role === 'door', thickness: role === 'door' ? edgeThickness : 0 },
    right: { applied: role === 'door', thickness: role === 'door' ? edgeThickness : 0 },
  };
}

function bmVectorInAssembly(bm: string | undefined, axes: { xAxis: Vec3; yAxis: Vec3; zAxis: Vec3 }): Vec3 | null {
  switch (bm) {
    case 'XP':
      return axes.xAxis;
    case 'XM':
      return vec(-1, axes.xAxis);
    case 'YP':
      return axes.yAxis;
    case 'YM':
      return vec(-1, axes.yAxis);
    case 'ZP':
      return axes.zAxis;
    case 'ZM':
      return vec(-1, axes.zAxis);
    default:
      return null;
  }
}

function bmMeaning(bm: string | undefined): string | null {
  if (!bm) return null;
  const meanings: Record<string, string> = {
    XP: 'drill progresses in positive MPR local X direction',
    XM: 'drill progresses in negative MPR local X direction',
    YP: 'drill progresses in positive MPR local Y direction',
    YM: 'drill progresses in negative MPR local Y direction',
    ZP: 'drill progresses in positive MPR local Z direction',
    ZM: 'drill progresses in negative MPR local Z direction',
    LS: 'vertical single drilling mode',
    LSL: 'vertical through drilling mode',
  };
  return meanings[bm] || 'machine-specific boring mode';
}

function buildBoringOperations(panel: PanelBoringData, axes: { xAxis: Vec3; yAxis: Vec3; zAxis: Vec3 }) {
  return panel.borings.map((boring: Boring) => {
    const isVerticalFace = boring.face === 'top' || boring.face === 'bottom';
    const through = boring.note === 'fixed-panel-through'
      || (isVerticalFace && boring.depth >= panel.thickness);
    const bm = boring.note === 'fixed-panel-side-bore'
      ? (boring.face === 'right' ? 'XM' : 'XP')
      : through
        ? 'LSL'
        : 'LS';

    return {
      id: boring.id,
      operationType: 'boring',
      face: boring.face,
      mpr: {
        XA: roundMm(boring.x),
        YA: roundMm(boring.y),
        ZA: boring.note === 'fixed-panel-side-bore' ? roundMm(panel.thickness / 2) : 'T',
        TI: roundMm(boring.depth),
        DU: roundMm(boring.diameter),
        BM: bm,
        WI: boring.angle ?? null,
      },
      through,
      depth: through ? panel.thickness : boring.depth,
      bmMeaning: bmMeaning(bm),
      drillDirectionVector: bmVectorInAssembly(bm, axes),
    };
  });
}

function buildPocketOperations(panel: PanelBoringData, role: string) {
  const operations: any[] = [];
  const isFurnitureSide = role === 'left_side' || role === 'right_side';
  const name = panel.panelName || '';
  const hasBackPanelGroove = isFurnitureSide
    && !name.includes('서랍')
    && !name.includes('도어')
    && (name.includes('좌측') || name.includes('우측') || name.includes('측판'))
    && panel.width > BACK_PANEL_GROOVE_REAR_OFFSET_MM + BACK_PANEL_GROOVE_WIDTH_MM;

  if (hasBackPanelGroove) {
    const isRightSide = panel.panelType === 'side-right' || name.includes('우측');
    const x = isRightSide
      ? BACK_PANEL_GROOVE_REAR_OFFSET_MM
      : panel.width - BACK_PANEL_GROOVE_REAR_OFFSET_MM - BACK_PANEL_GROOVE_WIDTH_MM;
    const centerX = x + BACK_PANEL_GROOVE_WIDTH_MM / 2;
    operations.push({
      id: 'back-panel-groove',
      operationType: 'groove',
      mprCommand: 'Nuten',
      mpr: {
        XA: roundMm(centerX),
        YA: -1,
        XE: roundMm(centerX),
        YE: roundMm(panel.height + 1),
        NB: BACK_PANEL_GROOVE_WIDTH_MM,
        TI: BACK_PANEL_GROOVE_CUT_DEPTH_MM,
      },
      through: false,
      depth: BACK_PANEL_GROOVE_CUT_DEPTH_MM,
    });
  }

  (panel.sideNotches || []).forEach((notch, index) => {
    const isRightSide = panel.panelType === 'side-right' || name.includes('우측');
    const width = Math.max(0, Math.min(notch.z, panel.width));
    const height = Math.max(0, Math.min(notch.y, panel.height));
    const startX = isRightSide ? Math.max(0, panel.width - width) : 0;
    const startY = Math.max(0, Math.min(notch.fromBottom, panel.height - height));
    const blockNumber = hasBackPanelGroove ? index + 3 : index + 2;
    operations.push({
      id: `side-notch-${index + 1}`,
      operationType: 'through_cut',
      mprCommand: 'Konturfraesen',
      mpr: {
        EA: `${blockNumber}:0`,
        EE: `${blockNumber}:${Math.abs(startY + height - panel.height) < 0.001 || startY <= 0.001 ? 2 : 3}`,
        ZA: CONTOUR_CUT_DEPTH_MM,
        startX,
        startY,
        width,
        height,
      },
      through: true,
      depth: panel.thickness,
    });
  });

  (panel.groovePositions || []).forEach((groove, index) => {
    const height = Math.max(0, Math.min(groove.height, panel.height - groove.y));
    const depth = Math.max(0, Math.min(groove.depth, panel.thickness));
    operations.push({
      id: `drawer-bottom-groove-${index + 1}`,
      operationType: 'groove',
      mprCommand: 'Ktasche',
      mpr: { XA: 0, YA: groove.y, ZA: 'T', LA: panel.width, BR: height, TI: depth },
      through: false,
      depth,
    });
  });

  return operations;
}

export function buildMprAssemblyMetadata({
  projectName,
  panels,
  mprPanels,
  files,
  placedModules,
  spaceInfo,
}: BuildMprAssemblyMetadataParams) {
  const moduleGeometries = buildModuleGeometries(placedModules, spaceInfo);

  return {
    schemaVersion: 1,
    projectName,
    units: 'mm',
    coordinateSystem: {
      origin: 'overall furniture left-bottom-front corner',
      axes: {
        X: 'left-to-right width',
        Y: 'front-to-back depth',
        Z: 'bottom-to-top height',
      },
    },
    bmDirectionMeaning: {
      XP: '+MPR local X',
      XM: '-MPR local X',
      YP: '+MPR local Y',
      YM: '-MPR local Y',
      ZP: '+MPR local Z',
      ZM: '-MPR local Z',
    },
    modules: placedModules.map((module) => {
      const geometry = moduleGeometries.get(module.id);
      return {
        id: module.id,
        moduleId: module.moduleId,
        moduleName: geometry?.moduleName || moduleNameFromId(module.moduleId),
        position: geometry ? { x: geometry.leftX, y: geometry.frontY, z: geometry.bottomZ } : null,
        dimensions: geometry ? { width: geometry.width, depth: geometry.depth, height: geometry.height } : null,
        rotation: { z: geometry?.rotationDeg || module.rotation || 0 },
      };
    }),
    panels: mprPanels.map((panel, index) => {
      const source = panels[index];
      const moduleId = panel.furnitureId || source?.furnitureId || source?.sourceFurnitureIds?.[0] || '';
      const moduleGeometry = moduleGeometries.get(moduleId);
      const role = roleFromPanel(panel, source);
      const axes = getPanelAxes(role);
      const directions = getPanelDirections(role);
      const position = resolvePanelPosition(panel, role, moduleGeometry);
      const moduleName = moduleGeometry?.moduleName || moduleNameFromId(placedModules.find(module => module.id === moduleId)?.moduleId, panel.panelName);

      return {
        mprFileName: files[index]?.filename || `${panel.panelName}.mpr`,
        panelId: panel.panelId,
        panelName: panel.panelName,
        panelRole: role,
        moduleId,
        moduleName,
        position: { x: position[0], y: position[1], z: position[2] },
        rotation: {
          degrees: { x: 0, y: 0, z: moduleGeometry?.rotationDeg || 0 },
          localToAssemblyMatrix: [
            [axes.xAxis[0], axes.yAxis[0], axes.zAxis[0]],
            [axes.xAxis[1], axes.yAxis[1], axes.zAxis[1]],
            [axes.xAxis[2], axes.yAxis[2], axes.zAxis[2]],
          ],
        },
        localAxes: {
          mprX: axes.xAxis,
          mprY: axes.yAxis,
          mprZ: axes.zAxis,
        },
        frontDirection: directions.frontDirection,
        innerFaceDirection: directions.innerFaceDirection,
        mirror: role === 'right_side' || panel.isMirrored === true,
        origin: {
          description: 'MPR local origin attached to panel local X0/Y0/Z0 in assembly coordinates',
          position: { x: position[0], y: position[1], z: position[2] },
        },
        edgeBanding: resolveEdgeBanding(role),
        material: panel.material,
        thickness: panel.thickness,
        width: panel.width,
        height: panel.height,
        operations: [
          ...buildBoringOperations(panel, axes),
          ...buildPocketOperations(panel, role),
        ],
      };
    }),
  };
}
