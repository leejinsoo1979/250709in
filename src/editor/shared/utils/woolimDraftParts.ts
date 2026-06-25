export type WoolimDraftPart = {
  role: string;
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  color: string;
};

export type WoolimMokchanelSideNotch = {
  y: number;
  z: number;
  fromBottom: number;
};

const asRecord = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {}
);

const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const text = (value: unknown, fallback = ''): string => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const clamp = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), max)
);

export const resolveWoolimBandSizes = (item: Record<string, any>) => {
  let bottomBand = num(item.bottom_band ?? item.band_size, 0);
  let backBand = num(item.back_band ?? item.band_size, 0);
  const kind = text(item.band_kind, 'both');
  if (kind !== 'both' && kind !== 'bottom') bottomBand = 0;
  if (kind !== 'both' && kind !== 'back') backBand = 0;
  return { bottomBand, backBand };
};

export const woolimMokInset = (options: Record<string, any>, sideHeightMm: number, side: 'top' | 'bot') => {
  const mokchanel = asRecord(options.mokchanel);
  const items = Array.isArray(mokchanel.items) ? mokchanel.items.map(asRecord) : [];
  let maxInset = 0;
  items.forEach(item => {
    const ref = text(item.z_ref, 'top');
    const position = num(item.position, 0);
    const sizeY = num(item.size_y, 0);
    const sizeX = num(item.size_x, 0);
    const zEdge = side === 'top'
      ? (ref === 'top' ? sideHeightMm - position : position + sizeY)
      : (ref === 'top' ? sideHeightMm - position - sizeY : position);
    const reaches = side === 'top' ? zEdge >= sideHeightMm - 0.01 : zEdge <= 0.01;
    if (reaches && sizeX > maxInset) maxInset = sizeX;
  });
  return maxInset;
};

export const collectWoolimMokchanelSideNotches = (
  params: unknown,
  dimensions: { depth: number; height: number; boardThick: number }
): WoolimMokchanelSideNotch[] => {
  const p = asRecord(params);
  const options = asRecord(p.options);
  if (!Object.keys(options).length) return [];

  const height = Math.max(0, num(dimensions.height, 0));
  const depth = Math.max(0, num(dimensions.depth, 0));
  const bt = Math.max(0, num(dimensions.boardThick, 0));
  if (height <= 0 || depth <= 0) return [];

  const topValue = text(asRecord(options.top).value, 'solid');
  const bottomValue = text(asRecord(options.bottom).value, 'solid');
  const sideZStart = bottomValue === 'demband' ? bt : 0;
  const sideZEnd = topValue === 'demband' ? height - bt : height;
  const sideHeight = Math.max(0, sideZEnd - sideZStart);
  if (sideHeight <= 0) return [];

  const mokchanel = asRecord(options.mokchanel);
  const items = Array.isArray(mokchanel.items) ? mokchanel.items.map(asRecord) : [];
  return items
    .map(item => {
      const ref = text(item.z_ref, 'top');
      const position = num(item.position, 0);
      const notchH = clamp(num(item.size_y, 0), 0, sideHeight);
      const notchDepth = clamp(num(item.size_x, 40), 0, depth);
      if (notchH <= 0 || notchDepth <= 0) return null;

      const localFromBottom = ref === 'top'
        ? sideHeight - position - notchH
        : position;
      const fromBottom = clamp(sideZStart + localFromBottom, 0, Math.max(0, height - notchH));

      return {
        y: Math.round(notchH * 10) / 10,
        z: Math.round(notchDepth * 10) / 10,
        fromBottom: Math.round(fromBottom * 10) / 10
      };
    })
    .filter((notch): notch is WoolimMokchanelSideNotch => !!notch);
};

export const collectWoolimDraftBoxParts = (
  params: unknown,
  dimensions: { width: number; depth: number; height: number; boardThick: number }
): WoolimDraftPart[] => {
  const p = asRecord(params);
  const options = asRecord(p.options);
  if (!Object.keys(options).length) return [];

  const { width, depth, height } = dimensions;
  const bt = dimensions.boardThick;
  const parts: WoolimDraftPart[] = [];

  const push = (role: string, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: string) => {
    if (x2 <= x1 || y2 <= y1 || z2 <= z1) return;
    parts.push({ role, x1, y1, z1, x2, y2, z2, color });
  };

  const back = asRecord(options.back);
  const backFields = asRecord(back.fields);
  const top = asRecord(options.top);
  const topFields = asRecord(top.fields);
  const bottom = asRecord(options.bottom);
  const bottomFields = asRecord(bottom.fields);
  const installBand = asRecord(options.install_band);
  const installFields = asRecord(installBand.fields);

  const topValue = text(top.value, 'solid');
  const bottomValue = text(bottom.value, 'solid');
  const backValue = text(back.value, 'groove');
  const topDemband = topValue === 'demband';
  const bottomDemband = bottomValue === 'demband';
  const sideZStart = bottomDemband ? bt : 0;
  const sideZEnd = topDemband ? height - bt : height;
  const sideHeight = sideZEnd - sideZStart;
  const backThick = num(backFields.thick, 3);
  const grooveStart = num(backFields.groove_start, 17);
  const grooveDepth = num(backFields.groove_depth, 7);
  const yMaxPanel = backValue === 'groove' ? Math.max(0, depth - grooveStart - backThick) : depth;
  const topInset = woolimMokInset(options, sideHeight, 'top');
  const bottomInset = woolimMokInset(options, sideHeight, 'bot');

  if (topValue === 'solid' || topValue === 'demband') {
    push('TOP', topDemband ? 0 : bt, topInset, height - bt, topDemband ? width : width - bt, yMaxPanel, height, '#cfcfd2');
  } else if (topValue === 'band') {
    const frontWidth = num(topFields.front_width, 60);
    const backWidth = num(topFields.back_width, 60);
    push('BAND_TOP_F', bt, topInset, height - bt, width - bt, Math.min(yMaxPanel, topInset + frontWidth), height, '#cfcfd2');
    push('BAND_TOP_B', bt, Math.max(topInset, yMaxPanel - backWidth), height - bt, width - bt, yMaxPanel, height, '#cfcfd2');
  }

  if (bottomValue === 'solid' || bottomValue === 'demband') {
    push('BOTTOM', bottomDemband ? 0 : bt, bottomInset, 0, bottomDemband ? width : width - bt, yMaxPanel, bt, '#cfcfd2');
  } else if (bottomValue === 'band') {
    const frontWidth = num(bottomFields.front_width, 60);
    const backWidth = num(bottomFields.back_width, 60);
    push('BAND_BOT_F', bt, bottomInset, 0, width - bt, Math.min(yMaxPanel, bottomInset + frontWidth), bt, '#cfcfd2');
    push('BAND_BOT_B', bt, Math.max(bottomInset, yMaxPanel - backWidth), 0, width - bt, yMaxPanel, bt, '#cfcfd2');
  }

  if (backValue === 'groove') {
    const clearanceV = num(backFields.clearance_v, 1);
    const backWidth = width - 2 * bt + 2 * grooveDepth;
    const backHeight = Math.max(0, sideHeight - clearanceV);
    push('BACK', bt - grooveDepth, depth - grooveStart - backThick, sideZStart + clearanceV / 2, bt - grooveDepth + backWidth, depth - grooveStart, sideZStart + clearanceV / 2 + backHeight, '#a8b8c6');
  } else {
    const clearanceV = num(backFields.clearance_v ?? backFields.clearance, 0);
    const clearanceH = num(backFields.clearance_h ?? backFields.clearance, 0);
    push('BACK', clearanceH / 2, depth, clearanceV / 2, width - clearanceH / 2, depth + backThick, height - clearanceV / 2, '#a8b8c6');
  }

  if (installBand.enabled === true && backValue === 'groove') {
    const cleatW = num(installFields.width, 60);
    const cleatT = num(installFields.thick, bt);
    const zTop = topDemband ? height - bt : height;
    push('CLEAT_BACK', bt, depth - cleatT, zTop - cleatW, width - bt, depth, zTop, '#9bc49b');
  }

  const mokchanel = asRecord(options.mokchanel);
  const mokItems = Array.isArray(mokchanel.items) ? mokchanel.items.map(asRecord) : [];
  mokItems.forEach((item, index) => {
    const ref = text(item.z_ref, 'top');
    const position = num(item.position, 0);
    const sizeY = num(item.size_y, 0);
    const sizeX = num(item.size_x, 40);
    const zBotLocal = ref === 'top' ? sideHeight - position - sizeY : position;
    const zBot = sideZStart + zBotLocal;
    const { bottomBand, backBand } = resolveWoolimBandSizes(item);
    if (bottomBand > 0) push(`MOK_BOTTOM_${index + 1}`, bt, 0, zBot - bt, width - bt, bottomBand, zBot, '#e3b478');
    if (backBand > 0) push(`MOK_BACK_${index + 1}`, bt, sizeX, zBot, width - bt, sizeX + bt, zBot + backBand, '#b698d4');
  });

  return parts;
};

export const woolimPartToPanel = (part: WoolimDraftPart) => ({
  name: `WOOLIM ${part.role}`,
  width: Math.round((part.x2 - part.x1) * 10) / 10,
  ...(part.role === 'BACK' || part.role === 'CLEAT_BACK' || part.role.startsWith('MOK_BACK')
    ? {
        height: Math.round((part.z2 - part.z1) * 10) / 10,
        thickness: Math.round((part.y2 - part.y1) * 10) / 10,
      }
    : {
        depth: Math.round((part.y2 - part.y1) * 10) / 10,
        thickness: Math.round((part.z2 - part.z1) * 10) / 10,
      }),
});
