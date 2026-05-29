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

const id = 'HY7NnMbMTWIbdAnH26NU';
const answer = `안녕하세요! A.I Q&A 관리자입니다.

브라우저 화면 인쇄가 아니라, 앱 안에서 도면을 PDF / DXF 파일로 내 컴퓨터에 저장하실 수 있습니다.

▶ 도면 PDF·DXF 저장 방법
1. 디자인 화면 오른쪽 위 보라색 「컨버팅」 버튼을 클릭합니다.
2. 「내보내기」 메뉴를 선택합니다.
3. 파일 형식을 선택합니다.
   · PDF : 도면을 깔끔한 문서로 저장 (출력·전달용으로 추천)
   · DXF : 캐드(CAD) 프로그램에서 열 수 있는 도면 파일
4. 내보낼 도면(정면도·측면도 등)을 체크한 뒤 「다운로드」를 누르면, 내 컴퓨터에 파일로 저장됩니다.

저장된 PDF는 그대로 인쇄하거나 이메일·메신저로 전송하시면 됩니다.

※ 컨버팅(내보내기) 기능은 기업회원에게 제공됩니다. 버튼이 눌리지 않거나 안내창이 뜨면 기업회원 전환이 필요하니 편하게 다시 문의해 주세요. 감사합니다!`;

await db.collection('qna').doc(id).update({
  answer,
  answerImages: [],
  status: 'answered',
  answeredBy: 'system-admin',
  answeredByName: 'A.I Q&A 관리자',
  answeredAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

console.log(`✅ 답변 등록 완료: ${id}`);
process.exit(0);
