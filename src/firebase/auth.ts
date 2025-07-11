import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from './config';

// 구글 인증 제공자 생성
const googleProvider = new GoogleAuthProvider();

// 구글 로그인 설정
googleProvider.setCustomParameters({
  prompt: 'select_account' // 항상 계정 선택 화면 표시
});

// 이메일/비밀번호로 로그인
export const signInWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error) {
    const firebaseError = error as FirebaseError;
    return { user: null, error: firebaseError.message };
  }
};

// 구글로 로그인
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    
    // 개발 모드에서 로그 출력
    if (import.meta.env.DEV) {
      console.log('🔐 구글 로그인 성공:', result.user.email);
      console.log('🔐 사용자 정보:', {
        name: result.user.displayName,
        email: result.user.email,
        photo: result.user.photoURL
      });
    }
    
    return { user: result.user, error: null };
  } catch (error) {
    const firebaseError = error as FirebaseError;
    
    // 구글 로그인 특정 에러 처리
    let errorMessage = firebaseError.message;
    
    switch (firebaseError.code) {
      case 'auth/popup-closed-by-user':
        errorMessage = '로그인이 취소되었습니다.';
        break;
      case 'auth/popup-blocked':
        errorMessage = '팝업이 차단되었습니다. 팝업을 허용해주세요.';
        break;
      case 'auth/cancelled-popup-request':
        errorMessage = '로그인 요청이 취소되었습니다.';
        break;
      case 'auth/account-exists-with-different-credential':
        errorMessage = '이미 다른 방법으로 가입된 이메일입니다.';
        break;
      default:
        errorMessage = '구글 로그인 중 오류가 발생했습니다.';
    }
    
    return { user: null, error: errorMessage };
  }
};

// 이메일/비밀번호로 회원가입
export const signUpWithEmail = async (email: string, password: string, displayName?: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // 사용자 이름 설정
    if (displayName && userCredential.user) {
      await updateProfile(userCredential.user, { displayName });
    }
    
    return { user: userCredential.user, error: null };
  } catch (error) {
    const firebaseError = error as FirebaseError;
    return { user: null, error: firebaseError.message };
  }
};

// 로그아웃
export const signOutUser = async () => {
  try {
    await signOut(auth);
    return { error: null };
  } catch (error) {
    const firebaseError = error as FirebaseError;
    return { error: firebaseError.message };
  }
};

// 인증 상태 변화 감지
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// 현재 사용자 가져오기 (동기적)
export const getCurrentUser = () => {
  return auth.currentUser;
};

// 현재 사용자 가져오기 (비동기적 - 인증 상태 확인 대기)
export const getCurrentUserAsync = (): Promise<User | null> => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}; 