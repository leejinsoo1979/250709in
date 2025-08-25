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
export const signInWithGoogle = async (): Promise<{ user: User | null; error: string | null; pending?: boolean }> => {
  console.log('🔐 [Auth] Google Sign-In initiated');
  console.log('🔐 [Auth] Current URL:', window.location.href);
  console.log('🔐 [Auth] Auth Domain configured:', auth.app.options.authDomain);
  
  try {
    // 먼저 팝업 시도
    console.log('🔐 [Auth] Attempting popup sign-in...');
    const result = await signInWithPopup(auth, googleProvider);
    
    console.log('✅ [Auth] Popup sign-in successful');
    console.log('✅ [Auth] User:', result.user.email);
    
    // 팀 자동 생성 (최초 로그인 시)
    if (FLAGS.teamScope) {
      await ensurePersonalTeam(result.user);
    }
    
    return { user: result.user, error: null };
  } catch (popupError: any) {
    console.warn('⚠️ [Auth] Popup failed:', popupError?.code, popupError?.message);
    
    // 팝업이 차단되거나 실패한 경우 리다이렉트 시도
    if (popupError?.code === 'auth/popup-blocked' || 
        popupError?.code === 'auth/unauthorized-domain' ||
        popupError?.code === 'auth/operation-not-allowed' ||
        !popupError?.code) {
      
      console.log('🔄 [Auth] Falling back to redirect sign-in...');
      
      try {
        // 리다이렉트 방식으로 재시도
        const { signInWithRedirect } = await import('firebase/auth');
        await signInWithRedirect(auth, googleProvider);
        
        // 리다이렉트는 즉시 리턴하지 않으므로 pending 상태 반환
        return { user: null, error: null, pending: true };
      } catch (redirectError: any) {
        console.error('🔴 [Auth] Redirect also failed:', redirectError);
        
        // 최종 에러 처리
        const errorMessage = getAuthErrorMessage(redirectError?.code || popupError?.code);
        return { user: null, error: errorMessage };
      }
    }
    
    // 기타 에러는 바로 처리
    const errorMessage = getAuthErrorMessage(popupError?.code);
    return { user: null, error: errorMessage };
  }
};

// 에러 메시지 헬퍼 함수
function getAuthErrorMessage(errorCode: string | undefined): string {
  console.log('🔴 [Auth] Error code:', errorCode);
  
  switch (errorCode) {
    case 'auth/popup-closed-by-user':
      return '로그인이 취소되었습니다.';
    case 'auth/popup-blocked':
      return '팝업이 차단되었습니다. 리다이렉트 방식으로 재시도하세요.';
    case 'auth/cancelled-popup-request':
      return '로그인 요청이 취소되었습니다.';
    case 'auth/account-exists-with-different-credential':
      return '이미 다른 방법으로 가입된 이메일입니다.';
    case 'auth/unauthorized-domain':
      return '이 도메인은 Firebase에서 승인되지 않았습니다. Firebase Console에서 도메인을 추가해주세요.';
    case 'auth/operation-not-allowed':
      return 'Google 로그인이 활성화되지 않았습니다.';
    case 'auth/invalid-api-key':
      return 'Firebase API 키가 올바르지 않습니다.';
    case 'auth/invalid-auth-domain':
      return 'Auth Domain이 올바르지 않습니다.';
    default:
      return `구글 로그인 중 오류가 발생했습니다. (${errorCode || 'unknown'})`;
  }
}

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