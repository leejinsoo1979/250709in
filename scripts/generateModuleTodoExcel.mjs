#!/usr/bin/env node
/**
 * 모듈별 기능 구현 TODO 리스트 엑셀 생성 스크립트
 */
import XLSX from 'xlsx';

// ============================================================
// 모듈 정의
// ============================================================
const modules = [
  // ── FULL (싱글) ──
  { id: 'single-2drawer-hanging', name: '코트장 (2서랍+행잉)', category: 'full', type: 'single' },
  { id: 'single-2hanging', name: '붙박이장 B (2단행잉)', category: 'full', type: 'single' },
  { id: 'single-4drawer-hanging', name: '붙박이장 D (4서랍+행잉)', category: 'full', type: 'single' },
  { id: 'single-shelf', name: '싱글 선반장', category: 'full', type: 'single' },
  { id: 'single-2drawer-shelf', name: '2단서랍 선반', category: 'full', type: 'single' },
  { id: 'single-4drawer-shelf', name: '4단서랍 선반', category: 'full', type: 'single' },
  { id: 'single-entryway-h', name: '현관장 H', category: 'full', type: 'single' },

  // ── FULL (듀얼) ──
  { id: 'dual-2drawer-hanging', name: '쌍둥이 코트장', category: 'full', type: 'dual' },
  { id: 'dual-2hanging', name: '쌍둥이 붙박이장 B', category: 'full', type: 'dual' },
  { id: 'dual-4drawer-hanging', name: '쌍둥이 붙박이장 D', category: 'full', type: 'dual' },
  { id: 'dual-shelf', name: '쌍둥이 선반장', category: 'full', type: 'dual' },
  { id: 'dual-2drawer-shelf', name: '쌍둥이 2단서랍 선반', category: 'full', type: 'dual' },
  { id: 'dual-4drawer-shelf', name: '쌍둥이 4단서랍 선반', category: 'full', type: 'dual' },
  { id: 'dual-entryway-h', name: '쌍둥이 현관장 H', category: 'full', type: 'dual' },
  { id: 'dual-2drawer-styler', name: '쌍둥이 스타일러', category: 'full', type: 'dual' },
  { id: 'dual-4drawer-pantshanger', name: '쌍둥이 바지걸이장', category: 'full', type: 'dual' },

  // ── 상부장 (싱글) ──
  { id: 'upper-cabinet-shelf', name: '상부장 3단형', category: 'upper', type: 'single' },
  { id: 'upper-cabinet-2tier', name: '상부장 2단형', category: 'upper', type: 'single' },
  { id: 'upper-cabinet-open', name: '상부장 기본', category: 'upper', type: 'single' },

  // ── 상부장 (듀얼) ──
  { id: 'dual-upper-cabinet-shelf', name: '듀얼 상부장 3단형', category: 'upper', type: 'dual' },
  { id: 'dual-upper-cabinet-2tier', name: '듀얼 상부장 2단형', category: 'upper', type: 'dual' },
  { id: 'dual-upper-cabinet-open', name: '듀얼 상부장 기본', category: 'upper', type: 'dual' },

  // ── 하부장 기본 ──
  { id: 'lower-half-cabinet', name: '기본하부장 반통', category: 'lower', type: 'single' },
  { id: 'dual-lower-half-cabinet', name: '기본하부장 한통', category: 'lower', type: 'dual' },

  // ── 싱크장 ──
  { id: 'lower-sink-cabinet', name: '싱크장 반통', category: 'lower', type: 'single' },
  { id: 'dual-lower-sink-cabinet', name: '싱크장 한통', category: 'lower', type: 'dual' },

  // ── 인덕션장 ──
  { id: 'lower-induction-cabinet', name: '인덕션장 반통', category: 'lower', type: 'single' },
  { id: 'dual-lower-induction-cabinet', name: '인덕션장 한통', category: 'lower', type: 'dual' },

  // ── 하부 서랍장 ──
  { id: 'lower-drawer-3tier', name: '3단서랍', category: 'lower', type: 'single' },
  { id: 'lower-drawer-2tier', name: '2단서랍', category: 'lower', type: 'single' },
  { id: 'dual-lower-drawer-3tier', name: '듀얼 3단서랍', category: 'lower', type: 'dual' },
  { id: 'dual-lower-drawer-2tier', name: '듀얼 2단서랍', category: 'lower', type: 'dual' },

  // ── 도어올림 ──
  { id: 'lower-door-lift-half', name: '도어올림 반통', category: 'lower', type: 'single' },
  { id: 'lower-door-lift-2tier', name: '도어올림 2단', category: 'lower', type: 'single' },
  { id: 'lower-door-lift-3tier', name: '도어올림 3단', category: 'lower', type: 'single' },
  { id: 'dual-lower-door-lift-half', name: '듀얼 도어올림 반통', category: 'lower', type: 'dual' },
  { id: 'dual-lower-door-lift-2tier', name: '듀얼 도어올림 2단', category: 'lower', type: 'dual' },
  { id: 'dual-lower-door-lift-3tier', name: '듀얼 도어올림 3단', category: 'lower', type: 'dual' },

  // ── 도어올림 터치 ──
  { id: 'lower-door-lift-touch-2tier-a', name: '도어올림 터치 2단A', category: 'lower', type: 'single' },
  { id: 'lower-door-lift-touch-2tier-b', name: '도어올림 터치 2단B', category: 'lower', type: 'single' },
  { id: 'lower-door-lift-touch-3tier', name: '도어올림 터치 3단', category: 'lower', type: 'single' },
  { id: 'dual-lower-door-lift-touch-2tier-a', name: '듀얼 도어올림 터치 2단A', category: 'lower', type: 'dual' },
  { id: 'dual-lower-door-lift-touch-2tier-b', name: '듀얼 도어올림 터치 2단B', category: 'lower', type: 'dual' },
  { id: 'dual-lower-door-lift-touch-3tier', name: '듀얼 도어올림 터치 3단', category: 'lower', type: 'dual' },

  // ── 상판내림 ──
  { id: 'lower-top-down-half', name: '상판내림 반통', category: 'lower', type: 'single' },
  { id: 'lower-top-down-2tier', name: '상판내림 2단', category: 'lower', type: 'single' },
  { id: 'lower-top-down-3tier', name: '상판내림 3단', category: 'lower', type: 'single' },
  { id: 'dual-lower-top-down-half', name: '듀얼 상판내림 반통', category: 'lower', type: 'dual' },
  { id: 'dual-lower-top-down-2tier', name: '듀얼 상판내림 2단', category: 'lower', type: 'dual' },
  { id: 'dual-lower-top-down-3tier', name: '듀얼 상판내림 3단', category: 'lower', type: 'dual' },

  // ── 상판내림 터치 ──
  { id: 'lower-top-down-touch-2tier', name: '상판내림 터치 2단', category: 'lower', type: 'single' },
  { id: 'lower-top-down-touch-3tier', name: '상판내림 터치 3단', category: 'lower', type: 'single' },
  { id: 'dual-lower-top-down-touch-2tier', name: '듀얼 상판내림 터치 2단', category: 'lower', type: 'dual' },
  { id: 'dual-lower-top-down-touch-3tier', name: '듀얼 상판내림 터치 3단', category: 'lower', type: 'dual' },

  // ── 커스텀 가구 ──
  { id: 'customizable-full', name: 'My캐비넷 (한통)', category: 'full', type: 'custom' },
  { id: 'customizable-upper', name: 'My캐비넷 상부장', category: 'upper', type: 'custom' },
  { id: 'customizable-lower', name: 'My캐비넷 하부장', category: 'lower', type: 'custom' },
];

// ============================================================
// 카테고리 한글 매핑
// ============================================================
const categoryKr = {
  full: '한통장 (Full)',
  upper: '상부장 (Upper)',
  lower: '하부장 (Lower)',
};

const typeKr = {
  single: '싱글',
  dual: '듀얼',
  custom: '커스텀',
};

// ============================================================
// 기능 항목 정의
// ============================================================
const features = [
  // 옵티마이저
  { col: 'CNC 패널목록', group: '옵티마이저' },
  { col: 'CNC 재단방향(L/W)', group: '옵티마이저' },
  { col: 'CNC Grain 매핑', group: '옵티마이저' },
  { col: '보링 데이터', group: '옵티마이저' },
  { col: 'DXF 내보내기', group: '옵티마이저' },

  // 치수
  { col: '너비 동적계산', group: '치수' },
  { col: '높이 동적계산', group: '치수' },
  { col: '깊이 조절', group: '치수' },
  { col: '패널두께 반영', group: '치수' },
  { col: '슬롯 리사이즈', group: '치수' },

  // 옵션
  { col: '도어 On/Off', group: '옵션' },
  { col: '선반 추가/제거', group: '옵션' },
  { col: '서랍 구성', group: '옵션' },
  { col: '옷봉/바지걸이', group: '옵션' },
  { col: '하부 섹션 깊이', group: '옵션' },
  { col: '상부 섹션 깊이', group: '옵션' },

  // 3D 렌더링
  { col: '3D 모델 렌더링', group: '3D' },
  { col: '2D 뷰 표시', group: '3D' },
  { col: '드래그앤드롭', group: '3D' },

  // 배치
  { col: '슬롯 배치', group: '배치' },
  { col: '단내림 구간 배치', group: '배치' },
  { col: '슬롯 이동', group: '배치' },
];

// ============================================================
// 워크북 생성
// ============================================================
const wb = XLSX.utils.book_new();

// ── Sheet 1: 전체 모듈 TODO 리스트 ──
const headerRow1 = ['No', '모듈 ID', '모듈 이름', '카테고리', '타입'];
const headerRow2 = ['', '', '', '', ''];

// 그룹 헤더
const groupSpans = [];
let colIdx = 5;
let currentGroup = '';
for (const f of features) {
  if (f.group !== currentGroup) {
    currentGroup = f.group;
    groupSpans.push({ group: currentGroup, start: colIdx });
  }
  headerRow1.push(f.col);
  headerRow2.push('');
  colIdx++;
}
headerRow1.push('진행률', '비고');

const rows = [headerRow1];

modules.forEach((mod, idx) => {
  const row = [
    idx + 1,
    mod.id,
    mod.name,
    categoryKr[mod.category] || mod.category,
    typeKr[mod.type] || mod.type,
  ];

  // 각 기능 항목: 빈칸 (TODO)
  for (const f of features) {
    row.push(''); // 빈칸 = 미구현, 사용자가 ✅/❌/N/A 입력
  }

  row.push(''); // 진행률
  row.push(''); // 비고

  rows.push(row);
});

const ws = XLSX.utils.aoa_to_sheet(rows);

// ── 열 너비 설정 ──
ws['!cols'] = [
  { wch: 4 },   // No
  { wch: 38 },  // 모듈 ID
  { wch: 24 },  // 모듈 이름
  { wch: 16 },  // 카테고리
  { wch: 8 },   // 타입
  ...features.map(() => ({ wch: 16 })),
  { wch: 8 },   // 진행률
  { wch: 20 },  // 비고
];

// ── 셀 스타일 (헤더 볼드 + 배경색) ──
// xlsx community edition은 스타일 제한적이므로 merge로 그룹 표시
// 머지 설정: 그룹별 상단 행
const merges = [];

// "No" ~ "타입" 머지 (세로)
// 기능 그룹 머지는 별도 그룹 행이 필요하므로 대신 컬럼명에 그룹 접두어 추가
// → 심플하게 컬럼명을 "그룹 | 항목" 형태로 변경
for (let i = 0; i < features.length; i++) {
  const cellRef = XLSX.utils.encode_cell({ r: 0, c: 5 + i });
  if (ws[cellRef]) {
    ws[cellRef].v = `${features[i].group} | ${features[i].col}`;
  }
}

// 진행률 컬럼 인덱스
const progressCol = 5 + features.length;
const progressColLetter = XLSX.utils.encode_col(progressCol);

// 진행률 수식 추가 (COUNTIF 기반)
for (let r = 1; r <= modules.length; r++) {
  const firstFeatureCol = XLSX.utils.encode_col(5);
  const lastFeatureCol = XLSX.utils.encode_col(5 + features.length - 1);
  const rangeStr = `${firstFeatureCol}${r + 1}:${lastFeatureCol}${r + 1}`;
  const cellRef = XLSX.utils.encode_cell({ r, c: progressCol });
  ws[cellRef] = {
    t: 'n',
    f: `ROUND(COUNTIF(${rangeStr},"✅")/COUNTA(${rangeStr})*100,0)`,
  };
}

ws['!merges'] = merges;

XLSX.utils.book_append_sheet(wb, ws, '모듈별 TODO');

// ── Sheet 2: 카테고리별 요약 ──
const summaryRows = [
  ['카테고리', '총 모듈 수', '싱글', '듀얼', '커스텀'],
];

const categories = ['full', 'upper', 'lower'];
for (const cat of categories) {
  const catModules = modules.filter(m => m.category === cat);
  summaryRows.push([
    categoryKr[cat],
    catModules.length,
    catModules.filter(m => m.type === 'single').length,
    catModules.filter(m => m.type === 'dual').length,
    catModules.filter(m => m.type === 'custom').length,
  ]);
}
summaryRows.push([
  '합계',
  modules.length,
  modules.filter(m => m.type === 'single').length,
  modules.filter(m => m.type === 'dual').length,
  modules.filter(m => m.type === 'custom').length,
]);

const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
ws2['!cols'] = [
  { wch: 20 },
  { wch: 12 },
  { wch: 8 },
  { wch: 8 },
  { wch: 8 },
];

XLSX.utils.book_append_sheet(wb, ws2, '카테고리 요약');

// ── Sheet 3: 기능 항목 설명 ──
const legendRows = [
  ['기호', '의미'],
  ['✅', '구현 완료'],
  ['🔧', '구현 중 (진행 중)'],
  ['❌', '미구현 (해야 함)'],
  ['N/A', '해당 없음 (해당 모듈에 불필요)'],
  ['', '미확인 (점검 필요)'],
  [],
  ['그룹', '기능 항목', '설명'],
];

for (const f of features) {
  legendRows.push([f.group, f.col, getFeatureDescription(f.col)]);
}

function getFeatureDescription(col) {
  const desc = {
    'CNC 패널목록': '가구를 구성하는 모든 패널(측판, 상하판, 선반, 서랍 등)의 재단 목록 생성',
    'CNC 재단방향(L/W)': 'Length/Width 올바른 매핑 (Length=재단방향=항상 긴쪽)',
    'CNC Grain 매핑': '유결/무결 방향 올바른 매핑 (H=가로결, NONE=무결)',
    '보링 데이터': '드릴 위치 데이터 (선반홀, 경첩, 서랍레일 등)',
    'DXF 내보내기': 'DXF 파일 형식으로 보링 데이터 내보내기',
    '너비 동적계산': '슬롯 너비에 따라 가구 너비 자동 계산',
    '높이 동적계산': '공간 높이/단내림에 따라 가구 높이 자동 계산',
    '깊이 조절': '사용자가 가구 깊이를 조절 가능',
    '패널두께 반영': '패널 두께(18mm/15.5mm 등) 변경 시 치수 정확히 반영',
    '슬롯 리사이즈': '배치 후 너비를 드래그로 변경, 나머지 슬롯 재분배',
    '도어 On/Off': '도어 달기/떼기 옵션',
    '선반 추가/제거': '내부 선반 개수 조절',
    '서랍 구성': '서랍 단수/높이 구성 변경',
    '옷봉/바지걸이': '옷봉 또는 바지걸이 추가/제거',
    '하부 섹션 깊이': '하부 섹션의 독립적 깊이 조절',
    '상부 섹션 깊이': '상부 섹션의 독립적 깊이 조절',
    '3D 모델 렌더링': 'Three.js 3D 뷰에서 올바르게 렌더링',
    '2D 뷰 표시': '2D 평면도에서 올바르게 표시',
    '드래그앤드롭': '가구 라이브러리에서 드래그앤드롭 배치',
    '슬롯 배치': '클릭/더블클릭으로 슬롯에 배치',
    '단내림 구간 배치': '단내림(dropped ceiling) 영역에 올바르게 배치',
    '슬롯 이동': '배치된 가구를 다른 슬롯으로 이동',
  };
  return desc[col] || '';
}

const ws3 = XLSX.utils.aoa_to_sheet(legendRows);
ws3['!cols'] = [
  { wch: 12 },
  { wch: 24 },
  { wch: 60 },
];

XLSX.utils.book_append_sheet(wb, ws3, '범례 및 설명');

// ── Sheet 4: 우선순위 매트릭스 ──
const priorityRows = [
  ['우선순위', '모듈 그룹', '이유', '추정 작업량'],
  ['P0 (최우선)', '한통장 싱글 (7종)', '가장 많이 사용되는 기본 모듈', '대'],
  ['P0 (최우선)', '한통장 듀얼 (9종)', '싱글과 구조 공유, 칸막이/좌우 분할 추가', '대'],
  ['P1', '하부장 기본/서랍 (8종)', '주방 모듈 핵심', '중'],
  ['P1', '하부장 싱크/인덕션 (4종)', '특수 개구부 처리 필요', '중'],
  ['P2', '하부장 도어올림 (12종)', '도어 메커니즘 특수 처리', '중'],
  ['P2', '하부장 상판내림 (10종)', '상판 메커니즘 특수 처리', '중'],
  ['P3', '상부장 (6종)', '비교적 단순한 구조', '소'],
  ['P3', 'My캐비넷 (3종)', '커스텀 로직 별도 처리', '중'],
];

const ws4 = XLSX.utils.aoa_to_sheet(priorityRows);
ws4['!cols'] = [
  { wch: 14 },
  { wch: 26 },
  { wch: 40 },
  { wch: 14 },
];

XLSX.utils.book_append_sheet(wb, ws4, '우선순위');

// ── 파일 출력 ──
const outputPath = './모듈별_기능구현_TODO.xlsx';
XLSX.writeFile(wb, outputPath);
console.log(`✅ 엑셀 파일 생성 완료: ${outputPath}`);
console.log(`   - 총 모듈 수: ${modules.length}개`);
console.log(`   - 기능 항목: ${features.length}개`);
console.log(`   - 시트 4개: 모듈별 TODO, 카테고리 요약, 범례 및 설명, 우선순위`);
