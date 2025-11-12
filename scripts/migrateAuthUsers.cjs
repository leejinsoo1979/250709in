/**
 * Firebase Authentication의 모든 사용자를 Firestore users 컬렉션으로 마이그레이션
 *
 * 실행 방법:
 * node scripts/migrateAuthUsers.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Firebase Admin 초기화
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();

async function migrateUsers() {
  console.log('🚀 사용자 마이그레이션 시작...');

  let totalUsers = 0;
  let migratedUsers = 0;
  let skippedUsers = 0;
  let errorUsers = 0;

  try {
    // 모든 사용자 가져오기 (페이지네이션)
    let nextPageToken;

    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);

      for (const userRecord of listUsersResult.users) {
        totalUsers++;

        try {
          const userRef = db.collection('users').doc(userRecord.uid);
          const userDoc = await userRef.get();

          const userData = {
            email: userRecord.email || '',
            displayName: userRecord.displayName || '',
            photoURL: userRecord.photoURL || '',
            createdAt: userRecord.metadata.creationTime
              ? admin.firestore.Timestamp.fromDate(new Date(userRecord.metadata.creationTime))
              : admin.firestore.FieldValue.serverTimestamp(),
            lastLoginAt: userRecord.metadata.lastSignInTime
              ? admin.firestore.Timestamp.fromDate(new Date(userRecord.metadata.lastSignInTime))
              : admin.firestore.FieldValue.serverTimestamp()
          };

          if (!userDoc.exists) {
            // 새로 생성
            await userRef.set(userData);
            migratedUsers++;
            console.log(`✅ [${totalUsers}] 신규 저장: ${userRecord.email} (${userRecord.uid})`);
          } else {
            // 기존 문서 업데이트
            await userRef.update({
              email: userData.email,
              displayName: userData.displayName,
              photoURL: userData.photoURL,
              lastLoginAt: userData.lastLoginAt
            });
            skippedUsers++;
            console.log(`🔄 [${totalUsers}] 업데이트: ${userRecord.email} (${userRecord.uid})`);
          }
        } catch (error) {
          errorUsers++;
          console.error(`❌ [${totalUsers}] 오류 (${userRecord.email}):`, error.message);
        }
      }

      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    console.log('\n📊 마이그레이션 완료!');
    console.log(`전체 사용자: ${totalUsers}`);
    console.log(`신규 저장: ${migratedUsers}`);
    console.log(`기존 업데이트: ${skippedUsers}`);
    console.log(`오류: ${errorUsers}`);

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    process.exit(1);
  }

  process.exit(0);
}

// 실행
migrateUsers();
