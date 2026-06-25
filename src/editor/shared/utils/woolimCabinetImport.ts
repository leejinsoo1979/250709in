import type { ModuleData } from '@/data/modules';

type RecordValue = Record<string, unknown>;

const asRecord = (value: unknown): RecordValue | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null
);

const asArray = (value: unknown): unknown[] => (
  Array.isArray(value) ? value : []
);

const asString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value.trim() : undefined
);

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const roundMm = (value: number) => Math.round(value * 10) / 10;

const slugify = (value: string) => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
);

const categoryFromCatalog = (
  catalogId: string | undefined,
  dimensions: { width: number; height: number; depth: number }
): ModuleData['category'] => {
  if (catalogId?.includes('upper')) return 'upper';
  if (catalogId?.includes('lower')) return 'lower';
  if (dimensions.depth <= 350) return 'upper';
  if (dimensions.height <= 1000) return 'lower';
  return 'full';
};

const galleryCategoryFor = (category: ModuleData['category']) => {
  if (category === 'upper') return 'upper';
  if (category === 'lower') return 'kitchen-basic';
  return 'kitchen-tall';
};

const getDimensions = (cabinet: RecordValue) => {
  const params = asRecord(cabinet.params);
  const paramDims = asRecord(params?.dimensions);
  const size = asArray(cabinet.size_mm);

  const width = asNumber(size[0]) ?? asNumber(paramDims?.width);
  const depth = asNumber(size[1]) ?? asNumber(paramDims?.depth);
  const height = asNumber(size[2]) ?? asNumber(paramDims?.height);

  if (!width || !depth || !height) {
    throw new Error('woolim_cabinet_set: size_mm 또는 params.dimensions의 width/depth/height가 필요합니다.');
  }

  return {
    width: roundMm(width),
    height: roundMm(height),
    depth: roundMm(depth)
  };
};

const getBoardThickness = (cabinet: RecordValue) => {
  const params = asRecord(cabinet.params);
  const dims = asRecord(params?.dimensions);
  return asNumber(dims?.board_thick) ?? 18;
};

const getOption = (cabinet: RecordValue, key: string) => {
  const params = asRecord(cabinet.params);
  const options = asRecord(params?.options);
  return asRecord(options?.[key]);
};

const convertMokchanelToSideNotches = (
  cabinet: RecordValue,
  height: number,
  depth: number
) => {
  const mokchanel = getOption(cabinet, 'mokchanel');
  const items = asArray(mokchanel?.items);

  return items
    .map(item => {
      const row = asRecord(item);
      if (!row) return null;

      const notchDepth = asNumber(row.size_x) ?? 40;
      const notchHeight = asNumber(row.size_y) ?? asNumber(row.bottom_band) ?? 65;
      const position = asNumber(row.position) ?? 0;
      const zRef = asString(row.z_ref) || 'bottom';

      let fromBottom: number;
      if (zRef === 'top') {
        // Woolim catalog: position is measured to the near edge of the notch.
        // For a top reference that near edge is the notch top, so fromBottom is
        // cabinet height - position - notch height.
        fromBottom = height - position - notchHeight;
      } else {
        fromBottom = position;
      }

      return {
        y: roundMm(Math.min(Math.max(notchHeight, 0), height)),
        z: roundMm(Math.min(Math.max(notchDepth, 0), depth)),
        fromBottom: roundMm(Math.min(Math.max(fromBottom, 0), Math.max(0, height - notchHeight)))
      };
    })
    .filter((notch): notch is { y: number; z: number; fromBottom: number } => (
      !!notch && notch.y > 0 && notch.z > 0
    ));
};

const getDrawerOperation = (cabinet: RecordValue) => (
  asArray(cabinet.operations)
    .map(asRecord)
    .find(operation => operation?.type === 'drawers_evenly')
);

const convertExternalDrawers = (cabinet: RecordValue) => {
  const operation = getDrawerOperation(cabinet);
  if (!operation) return undefined;

  const count = Math.max(1, Math.round(asNumber(operation.count) ?? 1));
  const slots = asArray(operation.slots)
    .map(asRecord)
    .filter((slot): slot is RecordValue => !!slot);
  const maidaHeights = slots
    .map(slot => asNumber(slot.slot_h))
    .filter((value): value is number => Number.isFinite(value) && value > 0)
    .map(roundMm);
  const explicitSlots = slots
    .map(slot => {
      const slotBot = asNumber(slot.slot_bot);
      const slotTop = asNumber(slot.slot_top);
      const slotH = asNumber(slot.slot_h) ?? (
        slotBot !== undefined && slotTop !== undefined ? slotTop - slotBot : undefined
      );
      if (slotBot === undefined || slotH === undefined || slotH <= 0) return null;
      return {
        slot_bot: roundMm(slotBot),
        slot_top: roundMm(slotTop ?? slotBot + slotH),
        slot_h: roundMm(slotH),
        ...(asNumber(slot.slot_y) !== undefined ? { slot_y: roundMm(asNumber(slot.slot_y)!) } : {}),
        ...(asNumber(slot.box_d) !== undefined ? { box_d: roundMm(asNumber(slot.box_d)!) } : {}),
        ...(asString(slot.variant_code) ? { variant_code: asString(slot.variant_code)! } : {})
      };
    })
    .filter((slot): slot is {
      slot_bot: number;
      slot_top: number;
      slot_h: number;
      slot_y?: number;
      box_d?: number;
      variant_code?: string;
    } => !!slot);
  const faceGap = asNumber(operation.face_gap);

  return {
    count: explicitSlots.length || count,
    drawerType: 'external' as const,
    ...(explicitSlots.length > 0 ? { slots: explicitSlots } : {}),
    ...(maidaHeights.length === (explicitSlots.length || count) ? { maidaHeights } : {}),
    ...(faceGap !== undefined ? { maidaGapMm: faceGap } : {}),
    topGap: -20,
    bottomGap: 5
  };
};

export const isWoolimCabinetSetPayload = (payload: unknown): boolean => {
  const root = asRecord(payload);
  return root?.format === 'woolim_cabinet_set' && Array.isArray(root.cabinets);
};

export const convertWoolimCabinetSetToModule = (payload: unknown): ModuleData & { thumbnail?: string } => {
  const root = asRecord(payload);
  if (!root || root.format !== 'woolim_cabinet_set') {
    throw new Error('woolim_cabinet_set 포맷이 아닙니다.');
  }

  const cabinet = asRecord(asArray(root.cabinets)[0]);
  if (!cabinet) {
    throw new Error('woolim_cabinet_set: cabinets[0]이 필요합니다.');
  }

  const dimensions = getDimensions(cabinet);
  const catalogId = asString(cabinet.catalog_id) || asString(asRecord(cabinet.params)?.catalog_id);
  const category = categoryFromCatalog(catalogId, dimensions);
  const cabinetNo = asString(cabinet.cabinet_no) || asString(asRecord(cabinet.params)?.cabinet_no) || 'cabinet';
  const drawingNo = asString(cabinet.drawing_no) || asString(asRecord(cabinet.params)?.drawing_no);
  const definitionName = asString(cabinet.definition_name);
  const baseSlug = slugify(['woolim', cabinetNo, drawingNo].filter(Boolean).join('-'))
    || slugify(definitionName || 'woolim-cabinet');
  const idPrefix = category === 'upper'
    ? 'upper-cabinet-admin'
    : category === 'lower'
      ? 'lower-cabinet-admin'
      : 'single-admin';

  const top = getOption(cabinet, 'top');
  const topFields = asRecord(top?.fields);
  const topValue = asString(top?.value);
  const hasSolidTop = topValue === 'solid';
  const installBand = getOption(cabinet, 'install_band');
  const externalDrawers = category === 'lower' ? convertExternalDrawers(cabinet) : undefined;
  const sideNotches = convertMokchanelToSideNotches(cabinet, dimensions.height, dimensions.depth);
  const topPanelFrontOffsetMm = asNumber(topFields?.front_inset);

  return {
    id: `${idPrefix}-${baseSlug}-${dimensions.width}`,
    name: definitionName || [cabinetNo, drawingNo].filter(Boolean).join(' ') || 'Woolim Cabinet',
    category,
    galleryCategory: galleryCategoryFor(category),
    dimensions,
    woolimDraft: {
      formatVersion: asNumber(root.format_version),
      pluginVersion: asString(root.plugin_version),
      catalogId,
      catalogVersion: asNumber(cabinet.catalog_version),
      cabinetNo,
      drawingNo,
      definitionName,
      params: asRecord(cabinet.params) || undefined,
      operations: asArray(cabinet.operations)
    },
    color: '#FFFFFF',
    hasDoor: !!externalDrawers,
    isDynamic: true,
    widthOptions: [dimensions.width],
    type: 'box',
    defaultDepth: dimensions.depth,
    description: [
      asString(root.model) ? `SketchUp model: ${asString(root.model)}` : '',
      catalogId ? `Catalog: ${catalogId}` : ''
    ].filter(Boolean).join(' / ') || undefined,
    modelConfig: {
      basicThickness: getBoardThickness(cabinet),
      hasOpenFront: !externalDrawers,
      hasShelf: false,
      shelfCount: 0,
      sections: [{ type: 'open', heightType: 'percentage', height: 100 }],
      ...(category === 'lower' ? { hideTopPanel: !hasSolidTop } : {}),
      ...(category === 'lower' && !hasSolidTop && installBand?.enabled === true ? { topChannelNotch: true } : {}),
      ...(sideNotches.length > 0 ? { sideNotches } : {}),
      ...(topPanelFrontOffsetMm && topPanelFrontOffsetMm > 0 ? { topPanelFrontOffsetMm } : {}),
      ...(externalDrawers ? { externalDrawers } : {})
    }
  };
};
