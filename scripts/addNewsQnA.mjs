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

const post = {
  category: 'notice',
  title: 'Q&A 게시판이 새로 오픈되었습니다',
  body: `Q&A 게시판이 새로 오픈되었습니다.

- 대시보드 상단 네비의 Q&A 메뉴에서 접근
- 로그인 사용자 누구나 질문 작성 가능
- 작성하신 질문은 본인과 관리자만 열람 가능 (비공개 1:1 문의 형태)
- 관리자가 답변을 등록하면 '답변 완료' 상태로 자동 전환
- 답변 대기 / 답변 완료 탭에서 진행 상태 확인 가능

사용 중 궁금하신 점이나 개선 요청은 Q&A 게시판을 통해 편하게 남겨주세요.`,
  authorId: 'system-admin',
  authorName: '관리자',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
};

const ref = await db.collection('news').add(post);
console.log(`✅ ${ref.id}: ${post.title}`);
process.exit(0);
