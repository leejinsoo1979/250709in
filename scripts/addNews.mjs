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
    title: '3D 패널 스캔 / 줄자 기능이 추가되었습니다',
    body: `3D 뷰어에 두 가지 신규 측정 기능이 추가되었습니다.

패널 스캔
- 3D 뷰에서 가구 패널을 클릭하면 해당 패널의 치수와 정보를 즉시 확인할 수 있습니다.
- 우측 상단의 스캔 아이콘을 눌러 활성화하세요.

줄자
- 3D 공간 내 임의의 두 지점을 클릭해 거리를 측정할 수 있습니다.
- 우측 상단의 줄자 아이콘을 눌러 활성화하세요.

두 기능 모두 3D 모드에서만 동작하며, 우측 상단 도움말 아이콘 아래에 동일한 디자인의 동그라미 아이콘으로 배치되어 있습니다.

도면 검수 전 빠른 사이즈 확인과 현장 치수 비교에 유용하게 활용하실 수 있습니다.`,
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
