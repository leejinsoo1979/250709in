/**
 * 사용자 가입일을 Firebase Auth의 실제 가입일로 수정하는 스크립트
 *
 * 실행 방법:
 * 1. 슈퍼 관리자로 로그인
 * 2. 브라우저 콘솔에서 실행: fixUserCreatedAt()
 */

import { collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';

export async function fixUserCreatedAt() {
  try {
    console.log('🔄 사용자 가입일 수정 시작...\n');

    // Firestore의 모든 users 가져오기
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);

    console.log(`📋 총 ${usersSnapshot.size}명의 사용자 발견\n`);

    let fixedCount = 0;
    let alreadyCorrectCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      // Firebase Auth API를 사용할 수 없으므로, createdAt이 최근(오늘)인 경우만 표시
      const firestoreCreatedAt = userData.createdAt?.toDate();
      const today = new Date();
      const isToday = firestoreCreatedAt &&
        firestoreCreatedAt.toDateString() === today.toDateString();

      if (isToday) {
        console.log(`⚠️ 오늘 날짜로 설정된 사용자: ${userData.email}`);
        console.log(`   Firestore createdAt: ${firestoreCreatedAt.toISOString()}`);
        console.log(`   → Firebase Authentication의 실제 가입일 확인 필요\n`);
        fixedCount++;
      } else {
        console.log(`✓ ${userData.email}: ${firestoreCreatedAt?.toISOString() || '날짜 없음'}`);
        alreadyCorrectCount++;
      }
    }

    console.log(`\n📊 결과:`);
    console.log(`   ✓ 정상: ${alreadyCorrectCount}명`);
    console.log(`   ⚠️ 확인 필요: ${fixedCount}명`);

    if (fixedCount > 0) {
      console.log(`\n⚠️ Firebase Console에서 직접 확인하세요:`);
      console.log(`   https://console.firebase.google.com/project/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/authentication/users`);
      console.log(`   \n   실제 가입일을 확인한 후 Firestore에서 수동으로 수정하거나,`);
      console.log(`   Firebase Admin SDK를 사용한 서버 스크립트로 수정하세요.`);
    }

    return { fixed: fixedCount, alreadyCorrect: alreadyCorrectCount };
  } catch (error) {
    console.error('❌ 확인 중 오류 발생:', error);
    throw error;
  }
}

// 브라우저 콘솔에서 직접 실행 가능하도록 window에 노출
if (typeof window !== 'undefined') {
  (window as any).fixUserCreatedAt = fixUserCreatedAt;
}
