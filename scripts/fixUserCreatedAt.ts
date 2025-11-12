import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config();

// Firebase Admin 초기화
const serviceAccount: ServiceAccount = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

initializeApp({
  credential: cert(serviceAccount),
});

const auth = getAuth();
const db = getFirestore();

async function fixUserCreatedAt() {
  try {
    console.log('🔄 사용자 가입일 수정 시작...');

    // 모든 사용자 가져오기
    const listUsersResult = await auth.listUsers();

    for (const userRecord of listUsersResult.users) {
      const uid = userRecord.uid;
      const authCreationTime = userRecord.metadata.creationTime;

      console.log(`\n👤 처리 중: ${userRecord.email}`);
      console.log(`  - UID: ${uid}`);
      console.log(`  - Firebase Auth 가입일: ${authCreationTime}`);

      // Firestore users 문서 확인
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        const firestoreCreatedAt = userData?.createdAt;

        console.log(`  - Firestore 가입일: ${firestoreCreatedAt?.toDate?.() || firestoreCreatedAt}`);

        // Firebase Auth의 실제 가입일로 업데이트
        const authTimestamp = Timestamp.fromDate(new Date(authCreationTime));

        await userRef.update({
          createdAt: authTimestamp,
        });

        console.log(`  ✅ 가입일 수정 완료: ${authCreationTime}`);
      } else {
        console.log(`  ⚠️  Firestore 문서 없음 - 건너뜀`);
      }
    }

    console.log('\n✅ 모든 사용자 가입일 수정 완료!');
    process.exit(0);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

fixUserCreatedAt();
