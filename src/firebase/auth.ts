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
import { FLAGS } from '@/flags';

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
    
    // 팀 자동 생성 (최초 로그인 시)
    if (FLAGS.teamScope) {
      await ensurePersonalTeam(userCredential.user);
    }
    
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
    
    // 팀 자동 생성 (최초 로그인 시)
    if (FLAGS.teamScope) {
      await ensurePersonalTeam(result.user);
    }
    
    return { user: result.user, error: null };
  } catch (error) {
    const firebaseError = error as FirebaseError;
    
    // 콘솔에 자세한 에러 정보 출력
    console.error('🔴 구글 로그인 에러 상세:', {
      code: firebaseError.code,
      message: firebaseError.message,
      fullError: error
    });
    
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
      case 'auth/unauthorized-domain':
        errorMessage = '이 도메인은 Firebase에서 승인되지 않았습니다.';
        break;
      case 'auth/operation-not-allowed':
        errorMessage = 'Google 로그인이 활성화되지 않았습니다.';
        break;
      default:
        errorMessage = `구글 로그인 중 오류가 발생했습니다. (${firebaseError.code})`;
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
    
    // 팀 자동 생성 (신규 가입 시)
    if (FLAGS.teamScope) {
      await ensurePersonalTeam(userCredential.user);
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

// 개인 팀 자동 생성 헬퍼 함수
async function ensurePersonalTeam(user: User) {
  try {
    const { doc, getDoc, setDoc, serverTimestamp, Timestamp } = await import('firebase/firestore');
    const { db } = await import('./config');
    
    const teamId = `personal_${user.uid}`;
    const teamRef = doc(db, 'teams', teamId);
    
    // 이미 팀이 있는지 확인
    const teamDoc = await getDoc(teamRef);
    if (teamDoc.exists()) {
      return;
    }
    
    // 개인 팀 생성
    const team = {
      name: `${(user.email || 'User').split('@')[0]}'s Workspace`,
      description: 'Personal workspace',
      ownerId: user.uid,
      members: [{
        userId: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        role: 'owner',
        joinedAt: Timestamp.now(),
        status: 'active'
      }],
      settings: {
        isPublic: false,
        allowInvitations: true,
        defaultRole: 'viewer',
        maxMembers: 50
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    await setDoc(teamRef, team);
    
    // localStorage에 email 저장 (나중에 팀 생성 시 사용)
    if (user.email) {
      localStorage.setItem('userEmail', user.email);
    }
    
    console.log('✅ Personal team created:', teamId);
  } catch (error) {
    console.error('Failed to create personal team:', error);
  }
} 