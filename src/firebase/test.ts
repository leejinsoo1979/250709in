// Firebase 연결 테스트용 임시 파일
import { db } from './config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Firebase 연결 테스트
 */
export const testFirebaseConnection = async () => {
  try {
    console.log('🔥 Firebase 연결 테스트 시작...');
    
    // 존재하지 않는 문서를 읽어보기 (연결 테스트용)
    const testDoc = doc(db, 'test', 'connection');
    const docSnap = await getDoc(testDoc);
    
    console.log('✅ Firebase 연결 성공!');
    console.log('📄 테스트 문서 존재 여부:', docSnap.exists());
    
    return { success: true, exists: docSnap.exists() };
  } catch (error) {
    console.error('❌ Firebase 연결 실패:', error);
    return { success: false, error };
  }
};

/**
 * Firestore 보안 규칙 테스트
 */
export const testFirestoreRules = async () => {
  try {
    console.log('🔐 Firestore 보안 규칙 테스트 시작...');
    
    // 공개 읽기 테스트
    const publicDoc = doc(db, 'public', 'test');
    await getDoc(publicDoc);
    
    console.log('✅ 공개 읽기 성공!');
    return { success: true };
  } catch (error) {
    console.error('❌ 보안 규칙 테스트 실패:', error);
    return { success: false, error };
  }
};

/**
 * 인증된 사용자 쓰기 테스트
 */
export const testAuthenticatedWrite = async () => {
  try {
    console.log('✍️ 인증된 사용자 쓰기 테스트 시작...');
    
    // 테스트 데이터 작성
    const testDoc = doc(db, 'test', 'auth-write-test');
    await setDoc(testDoc, {
      message: '인증된 사용자 테스트',
      timestamp: new Date(),
      testId: Math.random().toString(36)
    });
    
    // 작성한 데이터 읽기
    const docSnap = await getDoc(testDoc);
    
    console.log('✅ 인증된 사용자 쓰기 성공!');
    console.log('📄 작성된 데이터:', docSnap.data());
    
    return { success: true, data: docSnap.data() };
  } catch (error) {
    console.error('❌ 인증된 사용자 쓰기 실패:', error);
    return { success: false, error };
  }
};

// 개발 모드에서만 실행
if (import.meta.env.DEV) {
  testFirebaseConnection();
} 