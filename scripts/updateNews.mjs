/**
 * 기존 news 4건을 사용자 공지 톤으로 재작성합니다.
 * 실행: node scripts/updateNews.mjs
 */
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'serviceAccountKey.json'), 'utf-8')
);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// matchTitles: 기존 제목 후보군 중 하나라도 일치하면 해당 문서로 매칭
const updates = [
  {
    matchTitles: [
      '공지/업데이트 게시판 오픈',
      '새로운 소식을 전하는 News 게시판이 열렸습니다',
    ],
    title: "'공지 및 업데이트' 게시판이 새로 오픈되었습니다",
    body: `'공지 및 업데이트' 게시판이 새로 오픈되었습니다.

- 대시보드 상단 네비의 News 메뉴에서 접근
- 공지 / 업데이트 카테고리로 글을 분류
- 제목·본문·카테고리로 새 글 작성/수정/삭제 가능
- 비관리자 계정에는 메뉴가 노출되지 않음

앞으로 주요 공지와 업데이트 내역이 이곳에서 공유됩니다.`,
  },
  {
    matchTitles: [
      '태블릿·모바일 전용 에디터 재구성',
      '태블릿과 모바일 환경의 에디터가 더 편리해졌습니다',
      '태블릿·모바일에서도 편하게 설계하실 수 있습니다',
    ],
    title: '태블릿·모바일 에디터가 새롭게 개편되었습니다',
    body: `태블릿과 모바일 환경에 맞춘 전용 에디터가 새롭게 개편되었습니다.

- 태블릿 UI 우측 패널을 시안대로 전면 재구성
- 뷰어를 가리던 하단 플로팅 버튼 정리
- 아이패드 / 태블릿 / 휴대폰 각 화면 크기에 맞는 레이아웃 분리
- 작은 화면에서도 편하게 설계할 수 있도록 조작 영역 재배치

외부나 이동 중에도 tttcraft를 더욱 편하게 사용하실 수 있습니다.`,
  },
  {
    matchTitles: [
      '갤러리 기능 추가 + 대시보드 헤더 정비',
      '다른 사용자의 디자인을 감상할 수 있는 갤러리가 추가되었습니다',
      '다른 사용자의 디자인을 감상하실 수 있는 갤러리가 열렸습니다',
    ],
    title: '갤러리 페이지가 새로 열렸습니다',
    body: `다른 사용자의 디자인을 함께 감상할 수 있는 갤러리 페이지가 새로 열렸습니다.

- 대시보드 상단 네비의 Gallery 메뉴에서 접근
- 게시물 목록·상세 보기 지원 (읽기 전용)
- 대시보드 헤더 메뉴를 텍스트 기반으로 재정리 (로고 좌측 / 메뉴 우측)
- 프로필 팝업에서 닉네임을 직접 수정할 수 있는 기능 추가

다양한 디자인 사례를 둘러보시고 작업에 참고하세요.`,
  },
  {
    matchTitles: [
      '상판내림·미드웨이·PDF 내보내기 개선',
      '설계 정밀도와 도면 출력 품질을 개선했습니다',
      '설계 정확도와 도면 품질을 더욱 높였습니다',
    ],
    title: '설계 정확도와 도면 품질이 개선되었습니다',
    body: `에디터 정확도와 도면 출력 품질이 전반적으로 개선되었습니다.

[상판내림]
- 상판내림 10mm 옵션의 전대·측판 정렬 보정
- 실제 구조와 도면상 표시가 더 정확하게 일치

[미드웨이 (상·하부장 사이)]
- 화면에서 직접 클릭하여 수치 편집 가능
- 다크 모드 입력창 색상 개선
- 상부장 높이 계산에 하부 마감판(18mm) 포함

[PDF 내보내기]
- 기본 선택값을 '전체 뷰'로 복원
- 정면뷰 치수 누락 수정
- 도어 도면에 높이 치수 추가
- 한 장 레이아웃이 기본 출력 파일에 통합

더 정확한 도면을 더 편하게 만드실 수 있도록 계속 개선해 나가겠습니다.`,
  },
];

async function run() {
  const snap = await db.collection('news').get();
  const docs = snap.docs;
  console.log(`현재 ${docs.length}개 문서 발견`);

  let updated = 0;
  for (const u of updates) {
    const target = docs.find(d => u.matchTitles.includes(d.data().title));
    if (!target) {
      console.warn(`⚠️  매칭 실패: ${u.matchTitles[0]}`);
      continue;
    }
    await target.ref.update({
      title: u.title,
      body: u.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ ${target.id} → ${u.title}`);
    updated++;
  }
  console.log(`\n총 ${updated}건 업데이트 완료`);
  process.exit(0);
}

run().catch(err => {
  console.error('실패:', err);
  process.exit(1);
});
