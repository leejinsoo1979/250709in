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
    title: '기본 조작 기능이 개선되었습니다',
    body: `사용 중 불편하셨던 기본 조작 관련 이슈를 정리했습니다.

- 상부 프레임 옵셋 입력 필드 비활성화 조건 정상화
- 상하부 프레임 전체 체크 버튼 기능 개선
- 상하부 프레임 병합 시 불필요한 메시지 팝업 제거
- 오픈 / 클로즈 토글의 좌표 기준 정렬 보정
- 가구를 클릭할 때 도어가 의도치 않게 열리던 문제 해결
- 도어 토글 상태에 맞게 도어가 설치·배치되도록 동작 수정

조작감이 보다 매끄럽게 개선되었습니다.`,
  },
  {
    category: 'update',
    title: '가구 구조 및 기본값 설정이 개선되었습니다',
    body: `가구 구성과 관련된 다양한 기능이 추가·개선되었습니다.

- 선반 간격 표시 기능 추가
- 선반 + 옷봉 조합 지원
- 하부장 기본 깊이 600mm로 통일
- 하부장 뒷부분 고정 옵션 지원
- 하부장 카테고리 구성 개선
- 하부 프레임 하단 갭 기본 5mm (조정 가능)
- 미드웨이(상·하부장 사이 영역) 설정 기능 추가
- 멍장(더미 가구) 추가

실무 설계에서 자주 요청되던 부분을 중심으로 정리했습니다.`,
  },
  {
    category: 'update',
    title: '키큰장 관련 기능이 강화되었습니다',
    body: `주방 / 의류장 / 신발장 키큰장 사용성을 강화했습니다.

- 주방 / 의류장 / 신발장 기본 깊이 380mm 적용
- 주방 키큰장 구성: 기본장 / 도어올림 / 상판내림 카테고리 지원
- 상부장 도어 균등 배치 로직 개선

키큰장 설계 시 현장 치수에 더 부합하도록 조정되었습니다.`,
  },
  {
    category: 'update',
    title: '기둥·단내림·커튼박스 관련 오류가 수정되었습니다',
    body: `특수 케이스에서 발생하던 배치 오류를 수정했습니다.

[선반장]
- 선반 갯수를 늘릴 때 측판이 함께 올라가도록 보정

[기둥]
- 기둥이 있는 슬롯에도 가구가 배치되도록 개선
- 기둥 고스트(미리보기) 표시
- 기둥을 이동 시 장애물로 올바르게 처리

[단내림 / 커튼박스]
- 단내림 구간에서 듀얼 가구 배치 오류 수정
- 커튼박스 구간은 전체 공간 계산에서 제외되도록 정정
- 커튼박스에 3mm 이격 반영

특수 구조가 있는 현장에서도 안정적으로 설계하실 수 있습니다.`,
  },
];

async function run() {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  const ids = [];
  for (const p of posts) {
    const ref = db.collection('news').doc();
    batch.set(ref, {
      ...p,
      authorId: AUTHOR_ID,
      authorName: AUTHOR_NAME,
      createdAt: now,
      updatedAt: now,
    });
    ids.push({ id: ref.id, title: p.title });
  }
  await batch.commit();
  console.log(`✅ ${ids.length}개 공지 등록 완료`);
  ids.forEach(x => console.log(` - ${x.id}: ${x.title}`));
  process.exit(0);
}

run().catch(err => {
  console.error('실패:', err);
  process.exit(1);
});
