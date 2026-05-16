/**
 * 잘못 등록한 공지(zokJjzqPPZuKcc50EQ9U)를 삭제하고 정확한 내용으로 새로 등록합니다.
 * 실행: node scripts/replaceLatestNews.mjs
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

const OLD_ID = 'zokJjzqPPZuKcc50EQ9U';

const newPost = {
  category: 'update',
  title: '3D 패널 스캔 / 줄자 기능이 추가되었습니다',
  body: `3D 뷰어에 패널 단위로 즉시 치수를 확인할 수 있는 두 가지 기능이 추가되었습니다.

패널 스캔
- 가구 패널 위에 마우스를 올리면 해당 패널의 가로(W) × 높이(H) × 깊이(D) 치수가 실시간으로 화면에 표시됩니다.
- 도면 검수 전에 각 패널의 크기를 빠르게 확인할 수 있습니다.
- 우측 상단의 스캔 아이콘을 눌러 활성화하세요.

줄자
- 가구 패널의 모서리(엣지)에 마우스를 가져가면 해당 모서리 한 변의 실제 길이(mm)가 표시됩니다.
- 마이다, 측판, 도어 등 특정 부재의 한 변 치수를 콕 집어 확인할 때 유용합니다.
- 우측 상단의 줄자 아이콘을 눌러 활성화하세요.

두 기능 모두 3D 모드에서만 동작하며, 우측 상단 도움말 아이콘 아래에 동일한 디자인의 동그라미 아이콘으로 배치되어 있습니다. 도구를 끄려면 같은 아이콘을 다시 누르세요.`,
};

async function run() {
  await db.collection('news').doc(OLD_ID).delete();
  console.log(`🗑️  기존 글 삭제: ${OLD_ID}`);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const ref = await db.collection('news').add({
    ...newPost,
    authorId: 'system-admin',
    authorName: '관리자',
    createdAt: now,
    updatedAt: now,
  });
  console.log(`✅ 새 글 등록 완료: ${ref.id} — ${newPost.title}`);
  process.exit(0);
}

run().catch(err => {
  console.error('실패:', err);
  process.exit(1);
});
