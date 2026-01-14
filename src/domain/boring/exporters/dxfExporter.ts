/**
 * DXF 내보내기
 * AutoCAD 호환 DXF 파일 생성
 */

import type {
  PanelBoringData,
  Boring,
  DXFExportSettings,
  BoringExportResult,
  BoringType,
} from '../types';
import { DEFAULT_DXF_EXPORT_SETTINGS, DXF_LAYERS, BORING_TYPE_TO_LAYER } from '../constants';

// ============================================
// DXF 상수
// ============================================

const DXF_VERSION = {
  AC1015: 'AC1015',  // AutoCAD 2000
  AC1018: 'AC1018',  // AutoCAD 2004
  AC1021: 'AC1021',  // AutoCAD 2007
};

// ============================================
// DXF 생성 헬퍼
// ============================================

/**
 * DXF 파일 헤더 생성
 */
function generateDXFHeader(version: string = 'AC1015'): string {
  return `0
SECTION
2
HEADER
9
$ACADVER
1
${version}
9
$INSUNITS
70
4
0
ENDSEC
`;
}

/**
 * DXF 레이어 테이블 생성
 */
function generateDXFTables(layerColors: Record<string, number>): string {
  let layerDefs = '';

  Object.entries(layerColors).forEach(([layerName, color]) => {
    layerDefs += `0
LAYER
2
${layerName}
70
0
62
${color}
6
CONTINUOUS
`;
  });

  return `0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
${Object.keys(layerColors).length}
${layerDefs}0
ENDTAB
0
ENDSEC
`;
}

/**
 * 원형 보링을 DXF CIRCLE로 변환
 */
function generateDXFCircle(
  x: number,
  y: number,
  radius: number,
  layer: string
): string {
  return `0
CIRCLE
8
${layer}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
0.0
40
${radius.toFixed(4)}
`;
}

/**
 * 장공을 DXF LWPOLYLINE으로 변환 (둥근 끝 슬롯)
 */
function generateDXFSlot(
  x: number,
  y: number,
  width: number,   // 슬롯 전체 가로 (중심 간 거리 + 직경)
  height: number,  // 슬롯 높이 (= 직경)
  layer: string
): string {
  const radius = height / 2;
  const halfWidth = width / 2;

  // 둥근 끝 슬롯: 좌우 반원 + 상하 직선
  // 시작점: 왼쪽 반원 상단
  const x1 = x - halfWidth + radius;  // 왼쪽 반원 중심
  const x2 = x + halfWidth - radius;  // 오른쪽 반원 중심
  const yTop = y + radius;
  const yBottom = y - radius;

  // bulge 값: 반원의 경우 1.0 (90도 호) 또는 tan(θ/4)
  // 완전한 반원(180도)의 bulge = 1.0
  const bulge = 1.0;

  return `0
LWPOLYLINE
8
${layer}
90
4
70
1
10
${x1.toFixed(4)}
20
${yTop.toFixed(4)}
42
0.0
10
${x2.toFixed(4)}
20
${yTop.toFixed(4)}
42
${bulge.toFixed(4)}
10
${x2.toFixed(4)}
20
${yBottom.toFixed(4)}
42
0.0
10
${x1.toFixed(4)}
20
${yBottom.toFixed(4)}
42
${bulge.toFixed(4)}
`;
}

/**
 * 대체 방식: 장공을 2개의 원 + 텍스트로 표현
 */
function generateDXFSlotAlternative(
  x: number,
  y: number,
  width: number,
  height: number,
  layer: string
): string {
  const radius = height / 2;
  const halfWidth = width / 2 - radius;

  // 왼쪽 원
  let dxf = generateDXFCircle(x - halfWidth, y, radius, layer);

  // 오른쪽 원
  dxf += generateDXFCircle(x + halfWidth, y, radius, layer);

  // 슬롯 표시 텍스트
  dxf += `0
TEXT
8
${DXF_LAYERS.LABELS}
10
${x.toFixed(4)}
20
${(y + radius + 2).toFixed(4)}
30
0.0
40
2.0
1
SLOT ${width}x${height}
`;

  return dxf;
}

/**
 * 패널 외곽선 생성
 */
function generateDXFOutline(
  width: number,
  height: number,
  layer: string = DXF_LAYERS.OUTLINE
): string {
  return `0
LWPOLYLINE
8
${layer}
90
4
70
1
10
0.0
20
0.0
10
${width.toFixed(4)}
20
0.0
10
${width.toFixed(4)}
20
${height.toFixed(4)}
10
0.0
20
${height.toFixed(4)}
`;
}

/**
 * 치수 텍스트 생성
 */
function generateDXFDimension(
  x: number,
  y: number,
  text: string,
  layer: string = DXF_LAYERS.DIMENSIONS
): string {
  return `0
TEXT
8
${layer}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
0.0
40
3.0
1
${text}
`;
}

// ============================================
// 보링 타입별 레이어 매핑
// ============================================

function getLayerForBoring(boringType: BoringType): string {
  return BORING_TYPE_TO_LAYER[boringType] || DXF_LAYERS.LABELS;
}

// ============================================
// 패널 DXF 생성
// ============================================

/**
 * 단일 패널의 DXF 엔티티 생성
 */
function generatePanelDXFEntities(
  panel: PanelBoringData,
  settings: DXFExportSettings,
  offsetX: number = 0,
  offsetY: number = 0
): string {
  let entities = '';

  // 1. 외곽선
  entities += `0
LWPOLYLINE
8
${DXF_LAYERS.OUTLINE}
90
4
70
1
10
${offsetX.toFixed(4)}
20
${offsetY.toFixed(4)}
10
${(offsetX + panel.width).toFixed(4)}
20
${offsetY.toFixed(4)}
10
${(offsetX + panel.width).toFixed(4)}
20
${(offsetY + panel.height).toFixed(4)}
10
${offsetX.toFixed(4)}
20
${(offsetY + panel.height).toFixed(4)}
`;

  // 2. 보링들
  panel.borings.forEach((boring) => {
    const layer = getLayerForBoring(boring.type);
    const x = offsetX + boring.x;
    const y = offsetY + boring.y;

    if (boring.type === 'drawer-rail-slot' && boring.slotWidth && boring.slotHeight) {
      // 장공
      if (settings.usePolylineForSlots) {
        entities += generateDXFSlot(x, y, boring.slotWidth, boring.slotHeight, layer);
      } else {
        entities += generateDXFSlotAlternative(x, y, boring.slotWidth, boring.slotHeight, layer);
      }
    } else {
      // 원형 보링
      entities += generateDXFCircle(x, y, boring.diameter / 2, layer);
    }
  });

  // 3. 치수 (옵션)
  if (settings.includeDimensions) {
    // 패널 크기 치수
    entities += generateDXFDimension(
      offsetX + panel.width / 2,
      offsetY - 5,
      `${panel.width}`,
      DXF_LAYERS.DIMENSIONS
    );
    entities += generateDXFDimension(
      offsetX - 5,
      offsetY + panel.height / 2,
      `${panel.height}`,
      DXF_LAYERS.DIMENSIONS
    );

    // 패널 이름
    entities += generateDXFDimension(
      offsetX + panel.width / 2,
      offsetY + panel.height + 5,
      panel.panelName,
      DXF_LAYERS.LABELS
    );
  }

  return entities;
}

// ============================================
// 메인 내보내기 함수
// ============================================

/**
 * 단일 패널 DXF 생성
 */
export function generateSinglePanelDXF(
  panel: PanelBoringData,
  settings: DXFExportSettings = DEFAULT_DXF_EXPORT_SETTINGS
): string {
  let dxf = '';

  // 헤더
  dxf += generateDXFHeader(settings.version);

  // 테이블 (레이어)
  dxf += generateDXFTables(settings.layerColors);

  // 엔티티 섹션
  dxf += `0
SECTION
2
ENTITIES
`;

  // 패널 엔티티
  dxf += generatePanelDXFEntities(panel, settings);

  // 엔티티 섹션 종료
  dxf += `0
ENDSEC
`;

  // 파일 종료
  dxf += `0
EOF
`;

  return dxf;
}

/**
 * 여러 패널 DXF 생성 (하나의 파일에 배치)
 */
export function generateMultiplePanelDXF(
  panels: PanelBoringData[],
  settings: DXFExportSettings = DEFAULT_DXF_EXPORT_SETTINGS
): string {
  let dxf = '';

  // 헤더
  dxf += generateDXFHeader(settings.version);

  // 테이블 (레이어)
  dxf += generateDXFTables(settings.layerColors);

  // 엔티티 섹션
  dxf += `0
SECTION
2
ENTITIES
`;

  // 패널들을 가로로 배치 (간격 50mm)
  let offsetX = 0;
  const gap = 50;

  panels.forEach((panel) => {
    dxf += generatePanelDXFEntities(panel, settings, offsetX, 0);
    offsetX += panel.width + gap;
  });

  // 엔티티 섹션 종료
  dxf += `0
ENDSEC
`;

  // 파일 종료
  dxf += `0
EOF
`;

  return dxf;
}

/**
 * DXF 내보내기 실행
 */
export function exportToDXF(
  panels: PanelBoringData[],
  settings?: Partial<DXFExportSettings>
): BoringExportResult {
  const finalSettings = { ...DEFAULT_DXF_EXPORT_SETTINGS, ...settings };

  try {
    const files: Array<{ filename: string; content: string; size: number }> = [];

    if (finalSettings.filePerPanel) {
      // 패널별 개별 파일
      panels.forEach((panel) => {
        const content = generateSinglePanelDXF(panel, finalSettings);
        files.push({
          filename: `${panel.panelId}.dxf`,
          content,
          size: new Blob([content]).size,
        });
      });
    } else {
      // 통합 파일
      const content = generateMultiplePanelDXF(panels, finalSettings);
      files.push({
        filename: 'all_panels.dxf',
        content,
        size: new Blob([content]).size,
      });
    }

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
      format: 'dxf',
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
      format: 'dxf',
      files: [],
      summary: {
        totalPanels: 0,
        totalBorings: 0,
        boringsByType: {} as Record<BoringType, number>,
      },
      error: error instanceof Error ? error.message : 'DXF 내보내기 실패',
    };
  }
}

// ============================================
// 다운로드 헬퍼
// ============================================

/**
 * DXF 파일 다운로드
 */
export function downloadDXF(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/dxf' });
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
  generateSinglePanelDXF,
  generateMultiplePanelDXF,
  exportToDXF,
  downloadDXF,
};
