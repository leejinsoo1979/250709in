/**
 * 슈퍼 관리자 계정 초기 설정 스크립트
 * - 플랜을 Pro로 변경
 * - 이메일 인증 상태 업데이트
 * - createdAt을 실제 Firebase Auth 가입일로 설정
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

const SUPER_ADMIN_EMAIL = 'sbbc212@gmail.com';

async function setupSuperAdmin() {
  console.log('👑 슈퍼 관리자 계정 설정 시작...\n');

  try {
    // Firebase Auth에서 사용자 찾기
    let authUser;
    try {
      authUser = await auth.getUserByEmail(SUPER_ADMIN_EMAIL);
      console.log(`✅ Firebase Auth에서 사용자 찾음: ${authUser.uid}`);
    } catch (error) {
      console.error(`❌ Firebase Auth에서 ${SUPER_ADMIN_EMAIL}을 찾을 수 없습니다.`);
      console.error('먼저 이 이메일로 회원가입을 해주세요.');
      process.exit(1);
    }

    // 이메일 인증 상태 확인
    console.log(`📧 이메일 인증 상태: ${authUser.emailVerified ? '✅ 인증됨' : '❌ 미인증'}`);

    // 이메일 미인증 시 인증 처리
    if (!authUser.emailVerified) {
      await auth.updateUser(authUser.uid, {
        emailVerified: true
      });
      console.log('✅ 이메일 인증 상태를 "인증됨"으로 변경');
    }

    // Firebase Auth 가입일
    const authCreationTime = new Date(authUser.metadata.creationTime);
    console.log(`📅 실제 가입일: ${authCreationTime.toLocaleString('ko-KR')}`);

    // Firestore users 컬렉션 업데이트
    const userRef = db.collection('users').doc(authUser.uid);
    const userDoc = await userRef.get();

    const userData = {
      email: SUPER_ADMIN_EMAIL,
      displayName: authUser.displayName || '개발자',
      photoURL: authUser.photoURL || '',
      plan: 'pro', // Pro 플랜으로 설정
      emailVerified: true,
      createdAt: admin.firestore.Timestamp.fromDate(authCreationTime),
      lastLoginAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    if (userDoc.exists()) {
      await userRef.update(userData);
      console.log('✅ users 컬렉션 업데이트 완료');
    } else {
      await userRef.set(userData);
      console.log('✅ users 컬렉션 생성 완료');
    }

    // admins 컬렉션 확인 및 추가
    const adminRef = db.collection('admins').doc(authUser.uid);
    const adminDoc = await adminRef.get();

    if (!adminDoc.exists()) {
      await adminRef.set({
        email: SUPER_ADMIN_EMAIL,
        role: 'super_admin',
        createdAt: admin.firestore.Timestamp.now()
      });
      console.log('✅ admins 컬렉션에 추가 완료');
    } else {
      console.log('ℹ️  이미 admins 컬렉션에 존재함');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 슈퍼 관리자 계정 설정 완료!');
    console.log('='.repeat(60));
    console.log(`이메일: ${SUPER_ADMIN_EMAIL}`);
    console.log(`UID: ${authUser.uid}`);
    console.log(`플랜: Pro`);
    console.log(`이메일 인증: ✅ 인증됨`);
    console.log(`실제 가입일: ${authCreationTime.toLocaleString('ko-KR')}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ 스크립트 실행 중 오류 발생:', error);
    throw error;
  }
}

// 스크립트 실행
setupSuperAdmin()
  .then(() => {
    console.log('\n✅ 스크립트 실행 완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 스크립트 실행 실패:', error);
    process.exit(1);
  });
