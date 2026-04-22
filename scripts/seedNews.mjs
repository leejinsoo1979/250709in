/**
 * News 컬렉션에 초기 업데이트 공지 글을 등록합니다.
 * 실행: node scripts/seedNews.mjs
 */
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'serviceAccountKey.json'), 'utf-8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const AUTHOR_ID = 'system-admin';
const AUTHOR_NAME = '관리자';

const posts = [
  {
    category: 'update',
    title: '공지/업데이트 게시판 오픈',
    body: `관리자 전용 '공지 및 업데이트' 게시판을 새로 오픈했습니다.

- 대시보드 상단 네비의 News 메뉴에서 접근
- 공지 / 업데이트 카테고리로 글을 분류
- 제목·본문·카테고리로 새 글 작성/수정/삭제 가능
- 비관리자 계정에는 메뉴가 노출되지 않음

앞으로 주요 공지와 업데이트 내역을 이곳에서 공유하겠습니다.`,
  },
  {
    category: 'update',
    title: '태블릿·모바일 전용 에디터 재구성',
    body: `iPad / 태블릿 / 모바일 환경에 맞춘 에디터 레이아웃을 재작성했습니다.

- 태블릿 UI에서 이모지 아이콘 제거, 우측 패널을 시안대로 전면 교체
- 하단 플로팅 버튼 4개 정리 — 뷰 간섭 최소화
- 모바일/태블릿 전용 라우트(/ipad, /mobile) 구조 정비

모바일 사용자 경험이 전반적으로 개선됩니다.`,
  },
  {
    category: 'update',
    title: '갤러리 기능 추가 + 대시보드 헤더 정비',
    body: `디자인 공유/감상을 위한 갤러리 기능이 추가되었습니다.

- 게시 / 목록 / 상세 페이지 제공 (읽기 전용)
- 대시보드 헤더 네비게이션 재구성
  · 로고는 좌측, 메뉴(Home / Gallery / News)는 우측으로 이동
  · 아이콘 제거, 텍스트 버튼으로 통일
- 프로필 팝업에 닉네임 수정 기능 추가`,
  },
  {
    category: 'update',
    title: '상판내림·미드웨이·PDF 내보내기 개선',
    body: `에디터 렌더링/도면 출력 관련 다수 이슈를 수정했습니다.

[상판내림]
- 상판내림 10mm 옵션에서 기존 상단 전대 제거 및 외경 전대로 교체
- 측판/전대 Z 위치 정합성 개선

[미드웨이 (상·하부장 갭)]
- 미드웨이 클릭 편집 기능 추가 — 상부장 하단을 직접 조정
- 다크모드 입력창 색상 대응
- 상부장 높이·미드웨이에 하부 마감판(18mm) 포함

[PDF 내보내기]
- 기본 선택이 '전체 뷰'로 복원
- 정면뷰 DXF/PDF 치수 누락 수정
- 도어 도면 PDF에 도어 높이 치수 추가
- 한 장 레이아웃 PDF 통합 (단일 파일 출력)`,
  },
];

async function run() {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  const ids = [];
  // 최신이 위로 올라오도록 역순으로 저장 (먼저 저장된 게 더 오래된 것으로 처리)
  for (const post of posts) {
    const ref = db.collection('news').doc();
    batch.set(ref, {
      ...post,
      authorId: AUTHOR_ID,
      authorName: AUTHOR_NAME,
      createdAt: now,
      updatedAt: now,
    });
    ids.push({ id: ref.id, title: post.title });
    // 약간의 시간차를 주기 위해 각 문서 저장 사이에 작은 대기 — batch에서는 무의미하므로 그냥 순서대로 push
  }
  await batch.commit();
  console.log(`✅ ${ids.length}개 게시글 등록 완료`);
  ids.forEach(x => console.log(` - ${x.id}: ${x.title}`));
  process.exit(0);
}

run().catch(err => {
  console.error('실패:', err);
  process.exit(1);
});
