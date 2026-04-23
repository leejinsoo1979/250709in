/**
 * 추가 공지 글을 등록합니다.
 * 실행: node scripts/addNews.mjs
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

const AUTHOR_ID = 'system-admin';
const AUTHOR_NAME = '관리자';

const posts = [
  {
    category: 'update',
    title: '우측 패널 사용성이 개선되었습니다',
    body: `우측 패널의 표시 방식과 구성이 더 깔끔하게 정리되었습니다.

- 단내림 / 커튼박스 토글을 활성화하면 하위 옵션이 자동 노출
- 프레임 설정 행의 토글과 글자가 겹치던 문제 해결
- 서라운드 섹션이 슬롯배치 모드에서는 숨김 처리되어 혼동 방지
- 중앙 툴바 배치 재정리로 조작 영역 명확화

더 직관적인 화면 구성으로 tttcraft를 편하게 사용하실 수 있습니다.`,
  },
  {
    category: 'update',
    title: '상판내림 기능의 정밀도가 대폭 향상되었습니다',
    body: `현장 제작과 직결되는 상판내림(10mm / 30mm) 기능을 전면 재정비했습니다.

- 측판 계단형 따내기 구조를 단일 메쉬로 재구현하여 렌더링 정확도 향상
- 상판 깊이를 측판 상단 앞면과 자동 연동 (10mm / 20mm / 30mm 각각 보정)
- 전대 배치 및 Z 위치 정합성 개선 (외경 전대 추가·연동)
- 측판 상단 전대 따내기 깊이 통일 및 엣지 프로파일 꺾임 보정
- 계단형 notch 사이의 중복 앞면 엣지 제거로 깔끔한 도면 출력

CNC 도면에도 동일하게 반영되어 실제 제작 시 오차를 줄일 수 있습니다.`,
  },
  {
    category: 'update',
    title: '하부프레임 OFF 기능이 더 정확하게 동작합니다',
    body: `하부프레임 표시 여부에 따라 가구 치수가 자동으로 재계산되도록 개선했습니다.

- 하부프레임 OFF 시 가구 높이 자동 확장 (띄움 높이 반영)
- 상부/하부 프레임 ON·OFF 토글 시 상단갭 및 가구 높이 자동 보정
- 좌·우측 치수에 가구별 상부프레임 두께가 정확히 반영
- 상단갭 입력값이 그대로 반영되도록 처리 (중복 합산 제거)
- 전체 체크박스 해제 시 개별 행이 ON 상태로 즉시 복구

프레임 옵션을 바꾸실 때 의도한 결과가 바로 화면에 표시됩니다.`,
  },
  {
    category: 'update',
    title: '기둥 충돌 방지 옵션과 더미 가구가 추가되었습니다',
    body: `실무에서 자주 요청되던 기능을 반영했습니다.

- 기둥 충돌 방지 옵션 추가 — 기둥이 있는 슬롯에 가구를 배치할 때 자동 회피
- 더미 가구(멍장) 3종 추가 — 레이아웃 구성 시 공간 확보용으로 활용
- 상부프레임 옵셋 입력은 상황에 맞게 비활성화 처리
- 로그인 없이 접근 가능한 /demo 라우트 추가 (저장은 차단)

데모 환경에서도 부담 없이 tttcraft의 주요 기능을 체험하실 수 있습니다.`,
  },
  {
    category: 'update',
    title: '실시간 반영 속도와 편집 정확도가 향상되었습니다',
    body: `에디터의 반응 속도와 편집 안정성이 전반적으로 개선되었습니다.

- 상판 두께·상판내림 관련 설정 변경 시 팝업이 열린 상태에서도 3D 즉시 반영
- 선반 제거 토글이 고스트 프리뷰에도 실시간 반영
- 하부장 상판·뒷턱·다채움 옵션 일괄 적용 지원
- 에디터 진입 시 프리로드로 초기 로딩 개선
- 측면도에서 의류장(2섹션 가구) 상·하부 분할이 올바르게 표시

작업 도중 설정을 바꾸셔도 기다림 없이 결과를 확인하실 수 있습니다.`,
  },
];

async function run() {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  const ids = [];
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
  }
  await batch.commit();
  console.log(`✅ ${ids.length}개 추가 게시글 등록 완료`);
  ids.forEach(x => console.log(` - ${x.id}: ${x.title}`));
  process.exit(0);
}

run().catch(err => {
  console.error('실패:', err);
  process.exit(1);
});
