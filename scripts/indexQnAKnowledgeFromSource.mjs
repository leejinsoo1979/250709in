import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const serviceAccount = JSON.parse(
  readFileSync(join(root, 'serviceAccountKey.json'), 'utf-8')
);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

const sourceFiles = [
  {
    id: 'source-app-routes',
    path: 'src/App.tsx',
    title: '앱 전체 라우트와 화면 진입 흐름',
    category: 'UI흐름',
    tags: ['라우트', '대시보드', '관리자', 'Q&A', '뉴스', '에디터', '옵티마이저', '권한'],
    priority: 5,
  },
  {
    id: 'source-admin-layout',
    path: 'src/pages/admin/AdminLayout.tsx',
    title: '관리자 사이드바와 관리자 기능 흐름',
    category: '관리자UX',
    tags: ['관리자', '사이드바', '챗봇', '파트너사', '발주', '설정', '권한'],
    priority: 4,
  },
  {
    id: 'source-qna-page',
    path: 'src/pages/QnAPage.tsx',
    title: 'Q&A 게시판 목록/상세/작성/답변 흐름',
    category: 'Q&A',
    tags: ['Q&A', 'AI답변', '직접입력', '댓글', '알림', '질문등록', '답변완료'],
    priority: 5,
  },
  {
    id: 'source-qna-service',
    path: 'src/firebase/qna.ts',
    title: 'Q&A Firestore 서비스와 알림 호출 흐름',
    category: 'Q&A',
    tags: ['Q&A', 'Firestore', '텔레그램', '알림', 'AI답변', '답변등록'],
    priority: 5,
  },
  {
    id: 'source-qna-comments',
    path: 'src/firebase/qnaComments.ts',
    title: 'Q&A 댓글/스레드 저장 흐름',
    category: 'Q&A',
    tags: ['Q&A', '댓글', '스레드', 'comments', '관리자'],
    priority: 3,
  },
  {
    id: 'source-dashboard-header',
    path: 'src/components/dashboard/DashboardHeader.tsx',
    title: '대시보드 상단 네비게이션과 Q&A 대기 표시',
    category: '대시보드',
    tags: ['대시보드', '헤더', 'Q&A', '대기건수', '뉴스', '프로필'],
    priority: 4,
  },
  {
    id: 'source-simple-dashboard',
    path: 'src/pages/SimpleDashboard.tsx',
    title: '대시보드 프로젝트/디자인 목록과 정렬 흐름',
    category: '대시보드',
    tags: ['대시보드', '디자인', '정렬', '수정일', '생성일', '이름순', '삭제팝업'],
    priority: 4,
  },
  {
    id: 'source-news-page',
    path: 'src/pages/NewsPage.tsx',
    title: '뉴스/공지 게시판 UI 흐름',
    category: '대시보드',
    tags: ['뉴스', '공지', '테마', '게시판', '이미지'],
    priority: 3,
  },
  {
    id: 'source-cnc-export-bar',
    path: 'src/editor/CNCOptimizer/components/ExportBar.tsx',
    title: 'CNC 옵티마이저 Export 권한과 출력 흐름',
    category: 'CNC',
    tags: ['CNC', 'Export', '제조사', '파트너', '권한', '다운로드'],
    priority: 5,
  },
  {
    id: 'source-cnc-optimizer-pro',
    path: 'src/editor/CNCOptimizer/CNCOptimizerPro.tsx',
    title: 'CNC 옵티마이저 화면과 라이트 테마 흐름',
    category: 'CNC',
    tags: ['CNC', '옵티마이저', '라이트테마', '패널목록'],
    priority: 4,
  },
  {
    id: 'source-configurator-index',
    path: 'src/editor/Configurator/index.tsx',
    title: '컨피규레이터 메인 화면과 상태 흐름',
    category: '에디터',
    tags: ['컨피규레이터', '에디터', '가구배치', '뷰어', '우측바'],
    priority: 5,
  },
  {
    id: 'source-right-panel',
    path: 'src/editor/Configurator/components/RightPanel.tsx',
    title: '에디터 우측바 설정 패널 흐름',
    category: '에디터',
    tags: ['우측바', '가구설정', '도어설정', '상단몰딩', '걸레받이', '슬롯'],
    priority: 5,
  },
  {
    id: 'source-viewer-controls',
    path: 'src/editor/Configurator/components/ViewerControls.tsx',
    title: '뷰어 컨트롤과 모드 토글 흐름',
    category: '뷰어',
    tags: ['뷰어', '2D', '3D', '탑뷰', '도어열림', '토글', '가이드모드'],
    priority: 4,
  },
  {
    id: 'source-slot-placement-indicators',
    path: 'src/editor/shared/viewer3d/components/elements/SlotPlacementIndicators.tsx',
    title: '슬롯 배치 인디케이터와 커스텀 슬롯 가이드 흐름',
    category: '슬롯',
    tags: ['슬롯', '인디케이터', '투명슬롯가이드매쉬', '오토슬롯', '커스텀슬롯', '깊이설정'],
    priority: 5,
  },
  {
    id: 'source-three-canvas',
    path: 'src/editor/shared/viewer3d/components/base/ThreeCanvas.tsx',
    title: '3D/2D 카메라 초기화와 탑뷰 흐름',
    category: '뷰어',
    tags: ['카메라', '탑뷰', '스페이스', '줌', '회전', '깊이설정'],
    priority: 5,
  },
  {
    id: 'source-space-2d-konva',
    path: 'src/editor/shared/viewer2d/Space2DKonvaView.tsx',
    title: '2D 정면/측면 도면 표시 흐름',
    category: '도면표시',
    tags: ['2D', '정면뷰', '측면뷰', '도어치수', '치수가이드', '슬롯번호'],
    priority: 5,
  },
  {
    id: 'source-cad-dimensions',
    path: 'src/editor/shared/viewer3d/components/elements/CADDimensions2D.tsx',
    title: 'CAD 치수 가이드 표시 흐름',
    category: '도면표시',
    tags: ['CAD', '치수가이드', '도어치수', '걸레받이', '상단몰딩', '연장선'],
    priority: 5,
  },
  {
    id: 'source-place-furniture-at-slot',
    path: 'src/editor/shared/furniture/hooks/usePlaceFurnitureAtSlot.ts',
    title: '슬롯에 가구 배치하는 계산 흐름',
    category: '배치계산',
    tags: ['가구배치', '슬롯', '하부장', '상부장', '깊이', '갭', '높이'],
    priority: 5,
  },
  {
    id: 'source-door-geometry',
    path: 'src/editor/shared/utils/doorGeometryCalculator.ts',
    title: '도어 위치와 도어 치수 계산 흐름',
    category: '치수계산',
    tags: ['도어', '도어치수', '도어갭', '상부도어', '하부도어', '현관장'],
    priority: 5,
  },
  {
    id: 'source-base-strip-utils',
    path: 'src/editor/shared/utils/baseStripUtils.ts',
    title: '걸레받이 표시와 높이 계산 유틸 흐름',
    category: '치수계산',
    tags: ['걸레받이', '갭', '띄움높이', '하부장', '패널목록'],
    priority: 5,
  },
  {
    id: 'source-frame-merge-utils',
    path: 'src/editor/shared/utils/frameMergeUtils.ts',
    title: '상판/프레임/마감 패널 병합 계산 흐름',
    category: '패널계산',
    tags: ['패널', '상판', '프레임', '병합', '패널목록'],
    priority: 3,
  },
  {
    id: 'source-panel-details',
    path: 'src/editor/shared/utils/calculatePanelDetails.ts',
    title: '패널목록 산출 계산 흐름',
    category: '패널목록',
    tags: ['패널목록', 'CNC', '걸레받이', '상단몰딩', '도어', '치수'],
    priority: 5,
  },
  {
    id: 'doc-code-map',
    path: 'CODE_MAP.md',
    title: '프로그램 코드맵 요약',
    category: '문서',
    tags: ['코드맵', '구조', '프로그램흐름'],
    priority: 3,
  },
  {
    id: 'doc-complete-code-map',
    path: 'COMPLETE_CODE_MAP.md',
    title: '프로그램 전체 코드 구조 문서',
    category: '문서',
    tags: ['코드구조', '전체흐름', '모듈'],
    priority: 3,
  },
  {
    id: 'doc-terms',
    path: '용어문서.md',
    title: '프로그램 용어 문서',
    category: '문서',
    tags: ['용어', '가구', '슬롯', '치수'],
    priority: 4,
  },
];

function normalizeContent(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function chunkText(text, maxChars = 9000) {
  const normalized = normalizeContent(text);
  if (normalized.length <= maxChars) return [normalized];

  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);
    const boundary = normalized.lastIndexOf('\n\n', end);
    if (boundary > start + 2000) end = boundary;
    chunks.push(normalized.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

let count = 0;

for (const source of sourceFiles) {
  const fullPath = join(root, source.path);
  if (!existsSync(fullPath)) {
    console.warn(`건너뜀: ${source.path}`);
    continue;
  }

  const raw = readFileSync(fullPath, 'utf-8');
  const chunks = chunkText(raw);
  for (let i = 0; i < chunks.length; i += 1) {
    const chunkId = chunks.length === 1 ? source.id : `${source.id}-${String(i + 1).padStart(2, '0')}`;
    await db.collection('qnaKnowledgeBase').doc(chunkId).set({
      title: chunks.length === 1 ? source.title : `${source.title} (${i + 1}/${chunks.length})`,
      category: source.category,
      summary: `${source.path}에서 추출한 실제 프로그램 소스/문서 근거입니다. UI/UX 흐름과 코드 동작 확인용으로 사용합니다.`,
      content: chunks[i],
      rules: '이 문서는 실제 소스/문서 근거다. 답변 시 이 내용을 그대로 복붙하지 말고, 관련 흐름을 확인하는 근거로만 사용한다. 코드에 없는 동작은 단정하지 않는다.',
      answerGuidance: '사용자 질문과 직접 관련 있는 부분만 근거로 삼아 답변한다. 근거가 부족하면 자동 답변완료하지 않는다.',
      examples: '',
      tags: source.tags,
      priority: source.priority,
      isActive: true,
      sourcePath: source.path,
      sourceType: source.path.startsWith('src/') ? 'source' : 'document',
      chunkIndex: i + 1,
      chunkCount: chunks.length,
      createdBy: 'source-indexer',
      indexedAt: now,
      updatedAt: now,
    }, { merge: true });
    count += 1;
    console.log(`✅ ${chunkId}: ${source.path}`);
  }
}

console.log(`완료: 소스/문서 기반 qnaKnowledgeBase ${count}개 문서 업서트`);
process.exit(0);
