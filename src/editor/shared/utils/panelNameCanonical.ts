/**
 * Optimizer panel names and 3D BoxWithEdges panelName values must stay in sync.
 * Keep all cross-system panel naming rules here so layout matching does not
 * depend on separate, drifting conversion tables.
 */
export function toViewerPanelName(panelName: string): string {
  if (panelName === '키큰장찬넬 전면프레임') return 'Insert전면프레임-마감판';
  if (panelName === '키큰장찬넬 좌EP') return 'Insert좌EP-마감판';
  if (panelName === '키큰장찬넬 우EP') return 'Insert우EP-마감판';
  if (panelName === '바닥') return '바닥판';
  if (panelName.includes('후면 보강대')) return panelName.replace('후면 보강대', '보강대').trim();

  const lowerStretcherMatch = panelName.match(/^가로전대\((\d+)\)$/);
  if (lowerStretcherMatch) return `가로전대(하${lowerStretcherMatch[1]})`;

  const dowelShelfMatch = panelName.match(/^다보선반(?:\s*|\()(\d+)\)?$/);
  if (dowelShelfMatch) return `선반 ${dowelShelfMatch[1]}`;

  const compactShelfMatch = panelName.match(/^(\([^)]+\))?선반(\d+)$/);
  if (compactShelfMatch) return `${compactShelfMatch[1] ?? ''}선반 ${compactShelfMatch[2]}`;

  const touchLegraMaidaMatch = panelName.match(/^터치서랍(\d+)\(마이다\)$/);
  if (touchLegraMaidaMatch) return `터치${touchLegraMaidaMatch[1]}단서랍(마이다)`;

  const touchLegraPanelMatch = panelName.match(/^터치서랍(\d+)\s+(바닥판|뒷판)$/);
  if (touchLegraPanelMatch) return `터치${touchLegraPanelMatch[1]}단서랍 ${touchLegraPanelMatch[2]}`;

  const woodChannelMatch = panelName.match(/^(목찬넬프레임수평|목찬넬프레임수직)(?:\(\d+\))?$/);
  if (woodChannelMatch) return woodChannelMatch[1];

  if (panelName === '전대') return '전대(분절후방)';
  if (
    panelName.includes('상단몰딩') ||
    panelName.includes('상단 몰딩') ||
    panelName.includes('상부프레임') ||
    panelName.includes('상부프래임') ||
    panelName.includes('상부 프레임')
  ) return 'top-frame';
  if (panelName.includes('걸래받이') || panelName.includes('걸레받이')) return 'base-frame';
  if (panelName === '하부마감판') return '하부 EP';

  if (panelName.includes('좌측 서라운드 측면판')) return 'left-surround-lshape-side';
  if (panelName.includes('좌측 서라운드 전면판')) return 'left-surround-lshape-front';
  if (panelName.includes('우측 서라운드 측면판')) return 'right-surround-lshape-side';
  if (panelName.includes('우측 서라운드 전면판')) return 'right-surround-lshape-front';
  if (panelName.includes('좌측 서라운드 프레임') || panelName === '좌측 서라운드') return 'left-surround-ep';
  if (panelName.includes('우측 서라운드 프레임') || panelName === '우측 서라운드') return 'right-surround-ep';
  if (panelName.includes('상부 서라운드 프레임')) return 'top-frame';

  if (panelName.includes('커튼박스 전면판')) return 'slot-cb-front-panel';
  if (panelName.includes('커튼박스 측면판')) return 'slot-cb-border-panel';

  return panelName;
}

export function normalizeCanonicalPanelName(name?: string): string {
  if (!name) return '';
  return toViewerPanelName(name)
    .replace(/\s+/g, '')
    .replace(/걸래받이/g, '걸레받이')
    .replace(/바닥$/g, '바닥판')
    .replace(/후면보강대/g, '보강대')
    .replace(/후면 보강대/g, '보강대')
    .replace(/다보선반/g, '선반');
}

export function getCanonicalPanelNameCandidates(panelName?: string): Set<string> {
  const candidates = new Set<string>();
  if (!panelName) return candidates;
  const normalized = normalizeCanonicalPanelName(panelName);
  const add = (value: string) => {
    if (value) candidates.add(value);
  };

  add(normalized);
  add(normalized.replace(/판$/g, ''));
  add(normalized.replace(/^\((상|하)\)/g, ''));
  add(normalized.replace(/^\d+단/g, ''));
  add(normalized.replace(/(\d+)단서랍/g, '서랍$1'));
  add(normalized.replace(/서랍(\d+)바닥판/g, '서랍$1바닥'));
  add(normalized.replace(/서랍(\d+)바닥/g, '서랍$1바닥판'));
  add(normalized.replace(/좌측$/g, '좌측판'));
  add(normalized.replace(/우측$/g, '우측판'));
  add(normalized.replace(/좌측판$/g, '좌측'));
  add(normalized.replace(/우측판$/g, '우측'));
  add(normalized.replace(/보강대/g, '후면보강대'));
  add(normalized.replace(/후면보강대/g, '보강대'));
  add(normalized.replace(/목찬넬프레임수평$/g, '목찬넬프레임수평(1)'));
  add(normalized.replace(/목찬넬프레임수직$/g, '목찬넬프레임수직(1)'));
  if (normalized === '하부EP') add('하부마감판');
  if (normalized === '하부마감판') add('하부EP');

  return candidates;
}

export function getCanonicalPanelNameMatchScore(sourceName?: string, layoutName?: string): number {
  const sourceCandidates = getCanonicalPanelNameCandidates(sourceName);
  const layoutCandidates = getCanonicalPanelNameCandidates(layoutName);
  for (const source of sourceCandidates) {
    if (layoutCandidates.has(source)) return 0;
  }
  for (const source of sourceCandidates) {
    for (const layout of layoutCandidates) {
      if (!source || !layout) continue;
      if (source.includes(layout) || layout.includes(source)) return 0.35;
      const sourceCore = source.replace(/[0-9#()]/g, '');
      const layoutCore = layout.replace(/[0-9#()]/g, '');
      if (sourceCore && layoutCore && (sourceCore.includes(layoutCore) || layoutCore.includes(sourceCore))) {
        return 0.65;
      }
    }
  }
  return 2;
}
