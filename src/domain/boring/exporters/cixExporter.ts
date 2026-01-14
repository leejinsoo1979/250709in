/**
 * CIX 내보내기 (Biesse bSolid)
 * XML 기반 CNC 프로그램 형식
 */

import type {
  PanelBoringData,
  Boring,
  CIXExportSettings,
  BoringExportResult,
  BoringType,
  BoringFace,
} from '../types';
import { DEFAULT_CIX_EXPORT_SETTINGS } from '../constants';

// ============================================
// CIX 좌표계 변환
// ============================================

/**
 * 내부 면(face)을 CIX Side 코드로 변환
 * Side="0": 상면 (Top)
 * Side="1": 하면 (Bottom)
 * Side="2": 전면 (Front)
 * Side="3": 후면 (Back)
 * Side="4": 좌측 (Left)
 * Side="5": 우측 (Right)
 */
function faceToCIXSide(face: BoringFace): number {
  switch (face) {
    case 'top':
      return 0;
    case 'bottom':
      return 1;
    case 'front':
      return 2;
    case 'back':
      return 3;
    case 'left':
      return 4;
    case 'right':
      return 5;
    default:
      return 0;
  }
}

/**
 * 보링 면이 수직 보링인지 확인
 */
function isVerticalBoring(face: BoringFace): boolean {
  return face === 'top' || face === 'bottom';
}

/**
 * 보링 타입에 따른 공구 번호 반환
 */
function getToolNumber(type: BoringType, toolMapping: CIXExportSettings['toolMapping']): number {
  switch (type) {
    case 'hinge-cup':
      return toolMapping.hingeCup;
    case 'hinge-screw':
      return toolMapping.hingeScrew;
    case 'cam-housing':
      return toolMapping.camHousing;
    case 'cam-bolt':
      return toolMapping.camBolt;
    case 'shelf-pin':
      return toolMapping.shelfPin;
    case 'drawer-rail':
    case 'drawer-rail-slot':
      return toolMapping.drawerRail;
    case 'adjustable-foot':
      return toolMapping.adjustableFoot;
    default:
      return 4;  // 기본값
  }
}

// ============================================
// XML 헬퍼 함수
// ============================================

/**
 * XML 특수 문자 이스케이프
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * XML 속성 생성
 */
function createXMLAttribute(name: string, value: string | number): string {
  return `${name}="${typeof value === 'string' ? escapeXML(value) : value}"`;
}

// ============================================
// CIX 생성
// ============================================

/**
 * CIX 파일 헤더 생성
 */
function generateCIXHeader(version: string = '4.0'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Programme Version="${version}">
`;
}

/**
 * CIX 파일 푸터 생성
 */
function generateCIXFooter(): string {
  return `</Programme>
`;
}

/**
 * CIX 패널 정보 생성
 */
function generateCIXPanelInfo(panel: PanelBoringData): string {
  return `  <Panel>
    <Name>${escapeXML(panel.panelName)}</Name>
    <Length>${panel.width.toFixed(2)}</Length>
    <Width>${panel.height.toFixed(2)}</Width>
    <Thickness>${panel.thickness.toFixed(2)}</Thickness>
    <Material>${escapeXML(panel.material)}</Material>
  </Panel>
  <Operations>
`;
}

/**
 * CIX 패널 정보 종료
 */
function generateCIXPanelEnd(): string {
  return `  </Operations>
`;
}

/**
 * 수직 보링 명령 생성 (Boring)
 */
function generateVerticalBoring(
  boring: Boring,
  toolNumber: number,
  machineParams: CIXExportSettings['machineParams'],
  includeComments: boolean
): string {
  const side = faceToCIXSide(boring.face);

  let xml = '';

  if (includeComments && boring.note) {
    xml += `    <!-- ${escapeXML(boring.note)} -->\n`;
  }

  xml += `    <Boring
      ${createXMLAttribute('Id', boring.id)}
      ${createXMLAttribute('Side', side)}
      ${createXMLAttribute('X', boring.x.toFixed(2))}
      ${createXMLAttribute('Y', boring.y.toFixed(2))}
      ${createXMLAttribute('Z', '0')}
      ${createXMLAttribute('Diameter', boring.diameter.toFixed(1))}
      ${createXMLAttribute('Depth', boring.depth.toFixed(1))}
      ${createXMLAttribute('Tool', toolNumber)}
      ${createXMLAttribute('SpindleSpeed', machineParams.spindleSpeed)}
      ${createXMLAttribute('FeedRate', machineParams.feedRate)}
    />
`;

  return xml;
}

/**
 * 수평 보링 명령 생성 (BoringSide)
 */
function generateHorizontalBoring(
  boring: Boring,
  toolNumber: number,
  panelThickness: number,
  machineParams: CIXExportSettings['machineParams'],
  includeComments: boolean
): string {
  const side = faceToCIXSide(boring.face);

  // Z 위치: 패널 두께 방향 중심
  const z = panelThickness / 2;

  let xml = '';

  if (includeComments && boring.note) {
    xml += `    <!-- ${escapeXML(boring.note)} -->\n`;
  }

  xml += `    <BoringSide
      ${createXMLAttribute('Id', boring.id)}
      ${createXMLAttribute('Side', side)}
      ${createXMLAttribute('X', boring.x.toFixed(2))}
      ${createXMLAttribute('Y', boring.y.toFixed(2))}
      ${createXMLAttribute('Z', z.toFixed(2))}
      ${createXMLAttribute('Diameter', boring.diameter.toFixed(1))}
      ${createXMLAttribute('Depth', boring.depth.toFixed(1))}
      ${createXMLAttribute('Tool', toolNumber)}
      ${createXMLAttribute('SpindleSpeed', machineParams.spindleSpeed)}
      ${createXMLAttribute('FeedRate', machineParams.feedRate)}
    />
`;

  return xml;
}

/**
 * 슬롯 가공 명령 생성 (Slot)
 */
function generateSlotBoring(
  boring: Boring,
  toolNumber: number,
  panelThickness: number,
  machineParams: CIXExportSettings['machineParams'],
  includeComments: boolean
): string {
  if (!boring.slotWidth || !boring.slotHeight) return '';

  const side = faceToCIXSide(boring.face);

  // 슬롯 시작점과 끝점 계산
  const halfWidth = (boring.slotWidth - boring.diameter) / 2;
  const xStart = boring.x - halfWidth;
  const xEnd = boring.x + halfWidth;
  const z = panelThickness / 2;

  let xml = '';

  if (includeComments && boring.note) {
    xml += `    <!-- ${escapeXML(boring.note)} -->\n`;
  }

  xml += `    <Slot
      ${createXMLAttribute('Id', boring.id)}
      ${createXMLAttribute('Side', side)}
      ${createXMLAttribute('XStart', xStart.toFixed(2))}
      ${createXMLAttribute('YStart', boring.y.toFixed(2))}
      ${createXMLAttribute('XEnd', xEnd.toFixed(2))}
      ${createXMLAttribute('YEnd', boring.y.toFixed(2))}
      ${createXMLAttribute('Z', z.toFixed(2))}
      ${createXMLAttribute('Diameter', boring.diameter.toFixed(1))}
      ${createXMLAttribute('Depth', boring.depth.toFixed(1))}
      ${createXMLAttribute('Tool', toolNumber)}
      ${createXMLAttribute('SpindleSpeed', machineParams.spindleSpeed)}
      ${createXMLAttribute('FeedRate', machineParams.feedRate)}
    />
`;

  return xml;
}

/**
 * 보링을 CIX 명령으로 변환
 */
function boringToCIX(
  boring: Boring,
  settings: CIXExportSettings,
  panelThickness: number
): string {
  const toolNumber = getToolNumber(boring.type, settings.toolMapping);

  // 장공인 경우
  if (boring.type === 'drawer-rail-slot') {
    return generateSlotBoring(
      boring,
      toolNumber,
      panelThickness,
      settings.machineParams,
      settings.includeComments
    );
  }

  // 수직 보링 (상면/하면)
  if (isVerticalBoring(boring.face)) {
    return generateVerticalBoring(
      boring,
      toolNumber,
      settings.machineParams,
      settings.includeComments
    );
  }

  // 수평 보링 (측면)
  return generateHorizontalBoring(
    boring,
    toolNumber,
    panelThickness,
    settings.machineParams,
    settings.includeComments
  );
}

// ============================================
// 메인 내보내기 함수
// ============================================

/**
 * 단일 패널 CIX 생성
 */
export function generateSinglePanelCIX(
  panel: PanelBoringData,
  settings: CIXExportSettings = DEFAULT_CIX_EXPORT_SETTINGS
): string {
  let cix = '';

  // 헤더
  cix += generateCIXHeader(settings.version);

  // 패널 정보
  cix += generateCIXPanelInfo(panel);

  // 보링들
  panel.borings.forEach((boring) => {
    cix += boringToCIX(boring, settings, panel.thickness);
  });

  // 패널 종료
  cix += generateCIXPanelEnd();

  // 파일 종료
  cix += generateCIXFooter();

  return cix;
}

/**
 * CIX 내보내기 실행
 */
export function exportToCIX(
  panels: PanelBoringData[],
  settings?: Partial<CIXExportSettings>
): BoringExportResult {
  const finalSettings = { ...DEFAULT_CIX_EXPORT_SETTINGS, ...settings };

  try {
    const files: Array<{ filename: string; content: string; size: number }> = [];

    // CIX는 항상 패널별 개별 파일
    panels.forEach((panel) => {
      const content = generateSinglePanelCIX(panel, finalSettings);
      files.push({
        filename: `${panel.panelId}.cix`,
        content,
        size: new Blob([content]).size,
      });
    });

    // 보링 타입별 개수 집계
    const boringsByType: Record<BoringType, number> = {} as Record<BoringType, number>;
    let totalBorings = 0;

    panels.forEach((panel) => {
      panel.borings.forEach((boring) => {
        boringsByType[boring.type] = (boringsByType[boring.type] || 0) + 1;
        totalBorings++;
      });
    });

    return {
      success: true,
      format: 'cix',
      files,
      summary: {
        totalPanels: panels.length,
        totalBorings,
        boringsByType,
      },
    };
  } catch (error) {
    return {
      success: false,
      format: 'cix',
      files: [],
      summary: {
        totalPanels: 0,
        totalBorings: 0,
        boringsByType: {} as Record<BoringType, number>,
      },
      error: error instanceof Error ? error.message : 'CIX 내보내기 실패',
    };
  }
}

// ============================================
// 다운로드 헬퍼
// ============================================

/**
 * CIX 파일 다운로드
 */
export function downloadCIX(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default {
  generateSinglePanelCIX,
  exportToCIX,
  downloadCIX,
};
