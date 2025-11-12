/**
 * Firebase Admin SDK를 사용하여 users 컬렉션의 createdAt을
 * Firebase Auth의 실제 가입일로 업데이트하는 스크립트
 *
 * 실행 방법:
 * 1. Firebase Console > Project Settings > Service accounts
 * 2. "Generate new private key" 클릭하여 JSON 파일 다운로드
 * 3. 다운로드한 파일을 프로젝트 루트에 service-account-key.json으로 저장
 * 4. npm run fix:user-dates 실행
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Service account key 파일 경로
const serviceAccountPath = path.join(__dirname, '..', 'service-account-key.json');

// Service account key 파일 존재 확인
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ service-account-key.json 파일을 찾을 수 없습니다.');
  console.error('📋 다음 단계를 따라주세요:');
  console.error('1. Firebase Console > Project Settings > Service accounts');
  console.error('2. "Generate new private key" 클릭');
  console.error('3. 다운로드한 JSON 파일을 프로젝트 루트에 service-account-key.json으로 저장');
  process.exit(1);
}

// Firebase Admin 초기화
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function fixUserCreationDates() {
  console.log('🔧 사용자 가입일 수정 시작...\n');

  try {
    // Firestore users 컬렉션의 모든 사용자 조회
    const usersSnapshot = await db.collection('users').get();
    console.log(`📊 Firestore users 컬렉션 사용자 수: ${usersSnapshot.size}개\n`);

    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      try {
        // createdAt이 이미 있는지 확인
        if (userData.createdAt && userData.createdAt.toDate) {
          const existingDate = userData.createdAt.toDate();
          console.log(`⏭️  ${userData.email || userId}: 이미 createdAt 있음 (${existingDate.toLocaleString('ko-KR')}) - 건너뜀`);
          skippedCount++;
          continue;
        }

        // Firebase Auth에서 사용자 정보 가져오기
        const authUser = await auth.getUser(userId);

        // Firebase Auth의 실제 가입일
        const authCreationTime = new Date(authUser.metadata.creationTime);

        // Firestore Timestamp로 변환
        const createdAtTimestamp = admin.firestore.Timestamp.fromDate(authCreationTime);

        // users 컬렉션 업데이트
        await db.collection('users').doc(userId).update({
          createdAt: createdAtTimestamp
        });

        console.log(`✅ ${userData.email || userId}: createdAt 수정 완료 (${authCreationTime.toLocaleString('ko-KR')})`);
        fixedCount++;

      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          console.warn(`⚠️  ${userId}: Firebase Auth에 사용자 없음 - 건너뜀`);
          skippedCount++;
        } else {
          console.error(`❌ ${userId}: 수정 실패 -`, error.message);
          errorCount++;
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 사용자 가입일 수정 완료!');
    console.log('='.repeat(60));
    console.log(`✅ 수정 완료: ${fixedCount}개`);
    console.log(`⏭️  건너뜀: ${skippedCount}개`);
    console.log(`❌ 실패: ${errorCount}개`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ 스크립트 실행 중 오류 발생:', error);
    throw error;
  }
}

// 스크립트 실행
fixUserCreationDates()
  .then(() => {
    console.log('\n✅ 스크립트 실행 완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 스크립트 실행 실패:', error);
    process.exit(1);
  });
